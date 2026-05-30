import { describe, it, expect, vi } from 'vitest';
import { StreamTrackMonitor } from '@renderer/infrastructure/services/streaming/stream-track-monitor';

describe('StreamTrackMonitor', () => {
  const createMockLogger = () => ({
    debug: vi.fn(),
    warn: vi.fn()
  });

  const createMockMediaStream = (track: MediaStreamTrack) => {
    return {
      getVideoTracks: () => [track],
      getAudioTracks: () => []
    } as unknown as MediaStream;
  };

  it('attaches listener to video track and triggers callback when track ends', () => {
    const logger = createMockLogger();
    const monitor = new StreamTrackMonitor(logger);
    const mockTrack = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaStreamTrack;

    const mockStream = createMockMediaStream(mockTrack);
    const onEnded = vi.fn();

    monitor.start(mockStream, onEnded);

    expect(mockTrack.addEventListener).toHaveBeenCalledWith('ended', expect.any(Function));

    // Simulate track end
    const eventHandler = vi.mocked(mockTrack.addEventListener).mock.calls[0][1] as () => void;
    eventHandler();

    expect(onEnded).toHaveBeenCalled();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('Video track ended'));
  });

  it('detaches listener on stop', () => {
    const logger = createMockLogger();
    const monitor = new StreamTrackMonitor(logger);
    const mockTrack = {
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    } as unknown as MediaStreamTrack;

    const mockStream = createMockMediaStream(mockTrack);
    const onEnded = vi.fn();

    monitor.start(mockStream, onEnded);
    monitor.stop();

    expect(mockTrack.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
  });
});
