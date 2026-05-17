import { describe, expect, it, vi } from 'vitest';
import { StreamingAudioPipelineService } from '@renderer/infrastructure/services/streaming/audio-pipeline.service.ts';

function createService() {
  const unsubscribe = vi.fn();
  const logger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
  const service = new StreamingAudioPipelineService({
    eventBus: {
      subscribe: vi.fn(() => unsubscribe),
      publish: vi.fn()
    },
    loggerFactory: {
      create: vi.fn(() => logger)
    },
    settingsService: {
      getVolume: vi.fn(() => 70)
    }
  });

  return { service, logger, unsubscribe };
}

describe('StreamingAudioPipelineService', () => {
  it('skips startup when no stream is provided', async () => {
    const { service, logger } = createService();

    await expect(service.start(null)).resolves.toBe(false);
    expect(logger.warn).toHaveBeenCalledWith('Audio warm-up skipped - no stream provided');
  });

  it('unsubscribes volume listener during cleanup', () => {
    const { service, unsubscribe } = createService();

    service.cleanup();

    expect(unsubscribe).toHaveBeenCalled();
    expect(service._unsubscribeVolume).toBeNull();
  });

  it('clamps volume updates and applies gain when ready', () => {
    const { service } = createService();
    const setTargetAtTime = vi.fn();
    service._audioContext = { currentTime: 10 };
    service._gainNode = {
      gain: {
        value: 0.7,
        setTargetAtTime
      }
    };
    service._isReady = true;

    service._handleVolumeChanged(150);

    expect(service._volume).toBe(100);
    expect(service._targetGain).toBe(1);
    expect(setTargetAtTime).toHaveBeenCalledWith(1, 10, 0.02);
  });
});
