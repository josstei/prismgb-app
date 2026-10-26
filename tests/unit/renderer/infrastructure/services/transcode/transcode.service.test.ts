import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@renderer/infrastructure/ipc/trpc-client', async () => ({
  trpcClient: (await import('../../../../../support/mocks/trpc-client.mock')).createTrpcClientMock()
}));

import { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service';
import { EventChannels, PlatformEventBus } from '@platform/events';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { emitTrpcData, getTrpcUnsubscribe } from '../../../../../support/mocks/trpc-client.mock';
import { createLoggerFactory } from '../../../../../factories/logger.factory.js';
import { createDeferred } from '../../../../../support/deferred.testkit';

describe('renderer transcode ownership', () => {
  let service: TranscodeService;
  let bus: PlatformEventBus;
  let publish: ReturnType<typeof vi.spyOn>;
  const blob = () => new Blob(['recording'], { type: 'video/webm' });

  beforeEach(() => {
    bus = new PlatformEventBus();
    publish = vi.spyOn(bus, 'publish');
    service = new TranscodeService({ eventBus: bus, loggerFactory: createLoggerFactory() });
    vi.mocked(trpcClient.transcode.start.mutate).mockResolvedValue({ jobId: 'job-123' });
    vi.mocked(trpcClient.transcode.cancel.mutate).mockResolvedValue(undefined);
    service.initialize();
  });
  afterEach(async () => { await service.dispose(); });

  it('passes recording bytes, format, filename and interrupted input arguments unchanged', async () => {
    const inputArgs = ['-fflags', '+genpts', '-err_detect', 'ignore_err'];
    const result = await service.transcode(blob(), 'mov', 'recording-name', { inputArgs });
    expect(result).toEqual({ status: 'ok', value: { jobId: 'job-123' } });
    expect(trpcClient.transcode.start.mutate).toHaveBeenCalledWith({
      inputBuffer: new TextEncoder().encode('recording').buffer,
      format: 'mov', outputFilename: 'recording-name', inputArgs
    });
    expect(service.isTranscoding()).toBe(true);
    expect(publish).toHaveBeenCalledWith(EventChannels.TRANSCODE.STARTED, { jobId: 'job-123', format: 'mov' });
  });

  it('reserves the only job before reading the blob', async () => {
    const bytes = createDeferred<ArrayBuffer>();
    const input = blob();
    vi.spyOn(input, 'arrayBuffer').mockReturnValue(bytes.promise);
    const first = service.transcode(input, 'mp4');
    expect(service.isTranscoding()).toBe(true);
    await expect(service.transcode(blob(), 'mov')).resolves.toEqual({ status: 'error', error: 'Transcoding already in progress' });
    expect(trpcClient.transcode.start.mutate).not.toHaveBeenCalled();
    bytes.resolve(new ArrayBuffer(1));
    await first;
    expect(trpcClient.transcode.start.mutate).toHaveBeenCalledOnce();
  });

  it('keeps the reservation while main is preparing its job', async () => {
    const started = createDeferred<{ jobId: string }>();
    vi.mocked(trpcClient.transcode.start.mutate).mockReturnValue(started.promise);
    const first = service.transcode(blob(), 'mp4');
    await vi.waitFor(() => expect(trpcClient.transcode.start.mutate).toHaveBeenCalledOnce());
    await expect(service.transcode(blob(), 'mov')).resolves.toEqual({ status: 'error', error: 'Transcoding already in progress' });
    started.resolve({ jobId: 'job-123' });
    await first;
  });

  it('translates startup errors and releases the reservation for retry', async () => {
    vi.mocked(trpcClient.transcode.start.mutate).mockRejectedValueOnce(new Error('FFmpeg not found'));
    await expect(service.transcode(blob(), 'mp4')).resolves.toEqual({ status: 'error', error: 'FFmpeg not found' });
    expect(service.isTranscoding()).toBe(false);
    expect(publish).not.toHaveBeenCalled();
    await expect(service.transcode(blob(), 'mov')).resolves.toEqual({ status: 'ok', value: { jobId: 'job-123' } });
  });

  it('translates blob read errors without starting a main process', async () => {
    const input = blob();
    vi.spyOn(input, 'arrayBuffer').mockRejectedValue(new Error('Recording unavailable'));
    await expect(service.transcode(input, 'mp4')).resolves.toEqual({ status: 'error', error: 'Recording unavailable' });
    expect(service.isTranscoding()).toBe(false);
    expect(trpcClient.transcode.start.mutate).not.toHaveBeenCalled();
  });

  const terminalEvents = [
    { push: trpcClient.transcode.onCompleted, channel: EventChannels.TRANSCODE.COMPLETED, payload: { jobId: 'job-123', filePath: '/recording.mp4' } },
    { push: trpcClient.transcode.onError, channel: EventChannels.TRANSCODE.ERROR, payload: { jobId: 'job-123', error: 'Encoding failed' } },
    { push: trpcClient.transcode.onCancelled, channel: EventChannels.TRANSCODE.CANCELLED, payload: { jobId: 'job-123' } }
  ];

  it.each(terminalEvents)('orders an early $channel notification after STARTED without resurrecting busy state', async ({ push, channel, payload }) => {
    const started = createDeferred<{ jobId: string }>();
    vi.mocked(trpcClient.transcode.start.mutate).mockReturnValue(started.promise);
    const result = service.transcode(blob(), 'mp4');
    await vi.waitFor(() => expect(trpcClient.transcode.start.mutate).toHaveBeenCalledOnce());
    emitTrpcData(trpcClient.transcode.onProgress, { jobId: 'older-job', percent: 90 });
    emitTrpcData(trpcClient.transcode.onProgress, { jobId: 'job-123', percent: 50 });
    emitTrpcData(push, payload);
    expect(publish).not.toHaveBeenCalled();
    started.resolve({ jobId: 'job-123' });
    await result;
    expect(publish.mock.calls).toEqual([
      [EventChannels.TRANSCODE.STARTED, { jobId: 'job-123', format: 'mp4' }],
      [EventChannels.TRANSCODE.PROGRESS, { jobId: 'job-123', percent: 50 }],
      [channel, payload]
    ]);
    expect(service.isTranscoding()).toBe(false);
  });

  it.each(terminalEvents)('ignores stale $channel notifications while a newer job owns the UI', async ({ push, payload }) => {
    await service.transcode(blob(), 'mp4');
    publish.mockClear();
    emitTrpcData(push, { ...payload, jobId: 'older-job' });
    emitTrpcData(trpcClient.transcode.onProgress, { jobId: 'older-job', percent: 75 });
    expect(service.isTranscoding()).toBe(true);
    expect(publish).not.toHaveBeenCalled();
  });

  it('accepts canonical terminal notifications and allows a fresh conversion', async () => {
    await service.transcode(blob(), 'mp4');
    emitTrpcData(trpcClient.transcode.onCompleted, { jobId: 'job-123', filePath: '/recording.mp4' });
    expect(service.isTranscoding()).toBe(false);
    vi.mocked(trpcClient.transcode.start.mutate).mockResolvedValue({ jobId: 'next-job' });
    await service.transcode(blob(), 'mov');
    emitTrpcData(trpcClient.transcode.onCancelled, { jobId: 'job-123' });
    expect(service.isTranscoding()).toBe(true);
    await service.cancel();
    expect(trpcClient.transcode.cancel.mutate).toHaveBeenCalledWith({ jobId: 'next-job' });
  });

  it('ignores uncorrelated notifications instead of releasing an active job', async () => {
    await service.transcode(blob(), 'mp4');
    publish.mockClear();
    emitTrpcData(trpcClient.transcode.onCompleted, { filePath: '/recording.mp4' });
    emitTrpcData(trpcClient.transcode.onError, { error: 'Uncorrelated failure' });
    emitTrpcData(trpcClient.transcode.onCancelled, {});
    expect(service.isTranscoding()).toBe(true);
    expect(publish).not.toHaveBeenCalled();
  });

  it('cancels the accepted job and retains ownership until its terminal push', async () => {
    await service.transcode(blob(), 'mp4');
    vi.mocked(trpcClient.transcode.cancel.mutate).mockRejectedValueOnce(new Error('Cancel failed'));
    await expect(service.cancel()).resolves.toEqual({ status: 'error', error: 'Cancel failed' });
    expect(service.isTranscoding()).toBe(true);
    await expect(service.cancel()).resolves.toEqual({ status: 'ok', value: undefined });
    expect(trpcClient.transcode.cancel.mutate).toHaveBeenCalledWith({ jobId: 'job-123' });
    emitTrpcData(trpcClient.transcode.onCancelled, { jobId: 'job-123' });
    expect(service.isTranscoding()).toBe(false);
    await expect(service.cancel()).resolves.toEqual({ status: 'error', error: 'No transcoding in progress' });
  });

  it('does not start main after disposal while reading recording bytes', async () => {
    const bytes = createDeferred<ArrayBuffer>();
    const input = blob();
    vi.spyOn(input, 'arrayBuffer').mockReturnValue(bytes.promise);
    const pending = service.transcode(input, 'mp4');
    await service.dispose();
    bytes.resolve(new ArrayBuffer(1));
    await expect(pending).resolves.toEqual({ status: 'error', error: 'Transcode startup cancelled' });
    expect(trpcClient.transcode.start.mutate).not.toHaveBeenCalled();
    expect(service.isTranscoding()).toBe(false);
  });

  it('does not recreate renderer ownership when a main start reply arrives after disposal', async () => {
    const started = createDeferred<{ jobId: string }>();
    vi.mocked(trpcClient.transcode.start.mutate).mockReturnValue(started.promise);
    const pending = service.transcode(blob(), 'mp4');
    await vi.waitFor(() => expect(trpcClient.transcode.start.mutate).toHaveBeenCalledOnce());
    await service.dispose();
    started.resolve({ jobId: 'job-123' });
    await pending;
    expect(service.isTranscoding()).toBe(false);
    expect(publish).not.toHaveBeenCalled();
  });

  it('owns each transport subscription once and removes it on disposal', async () => {
    service.initialize();
    expect(trpcClient.transcode.onProgress.subscribe).toHaveBeenCalledOnce();
    const unsubscribe = getTrpcUnsubscribe(trpcClient.transcode.onProgress);
    await service.dispose();
    expect(unsubscribe).toHaveBeenCalledOnce();
    emitTrpcData(trpcClient.transcode.onCompleted, { jobId: 'job-123' });
    expect(publish).not.toHaveBeenCalled();
  });
});
