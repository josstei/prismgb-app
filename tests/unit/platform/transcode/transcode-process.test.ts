import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { spawn } from 'node:child_process';
import { TranscodeProcess } from '../../../../src/platform/transcode/transcode-process.js';

vi.mock('node:child_process', () => ({ spawn: vi.fn() }));

describe('FFmpeg process ownership', () => {
  let child: EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-01'));
    child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn(() => true) });
    vi.mocked(spawn).mockReturnValue(child as unknown as ReturnType<typeof spawn>);
  });
  afterEach(() => { child.stdout.end(); child.stderr.end(); vi.useRealTimers(); });

  function process() {
    return new TranscodeProcess('/input.webm', '/output.mp4', ['-c:v', 'libx264'], 1_000_000,
      ['-fflags', '+genpts'], '/ffmpeg');
  }

  it('assembles progress records split across arbitrary stdout chunks', async () => {
    const progress = vi.fn();
    const job = process();
    const completion = job.start(progress);
    child.stdout.write('out_ti');
    child.stdout.write('me_us=125');
    expect(progress).not.toHaveBeenCalled();
    child.stdout.write('000\nprogress=continue\n');
    expect(progress).toHaveBeenCalledWith({ percent: 12.5, timeUs: 125000, elapsedMs: 0 });
    child.emit('close', 0, null);
    await expect(completion).resolves.toBe('completed');
    expect(progress).toHaveBeenLastCalledWith({ percent: 100, timeUs: 1_000_000 });
    expect(vi.mocked(spawn).mock.calls[0]?.[1]).toEqual([
      '-y', '-fflags', '+genpts', '-i', '/input.webm', '-progress', 'pipe:1', '-nostats', '-c:v', 'libx264', '/output.mp4'
    ]);
  });

  it('joins one exit outcome while cancellation escalates only until the child exits', async () => {
    const job = process();
    const completion = job.start(vi.fn());
    expect(job.cancel()).toBe(true);
    expect(job.cancel()).toBe(false);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    await vi.advanceTimersByTimeAsync(2000);
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
    child.emit('close', null, 'SIGKILL');
    await expect(completion).resolves.toBe('cancelled');
    expect(vi.getTimerCount()).toBe(0);
    await expect(job.start(vi.fn())).rejects.toThrow('Process already started');
  });

  it('reports a failed spawn once even if close follows, and preserves the original completion', async () => {
    const job = process();
    const completion = job.start(vi.fn());
    const failure = new Error('spawn unavailable');
    const rejected = expect(completion).rejects.toBe(failure);
    child.emit('error', failure);
    child.emit('close', -1, null);
    await rejected;
    expect(job.cancel()).toBe(false);
    await expect(job.start(vi.fn())).rejects.toThrow('Process already started');
  });
});
