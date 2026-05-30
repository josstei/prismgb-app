// @ts-nocheck
import { describe, expect, it, vi } from 'vitest';
import { StreamingAudioPipelineService } from '@renderer/infrastructure/services/audio-pipeline.service';
import { createEventBus, createLoggerFactory, createSettingsServiceMock } from '../../../../factories/index.js';

function createService() {
  const eventBus = createEventBus();
  const loggerFactory = createLoggerFactory();
  const settingsService = createSettingsServiceMock({
    values: {
      gameVolume: 70
    }
  });
  const service = new StreamingAudioPipelineService({
    eventBus,
    loggerFactory,
    settingsService
  });
  const logger = loggerFactory._getLogger('StreamingAudioPipelineService');
  const unsubscribe = eventBus.subscribe.mock.results[0].value;

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
