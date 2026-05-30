import { describe, expect, it } from 'vitest';
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  createWorkerResponse,
  isValidWorkerMessage,
  isValidWorkerResponse
} from '@renderer/infrastructure/rendering/workers/worker-protocol.config';

const validConfig = {
  nativeWidth: 160,
  nativeHeight: 144,
  targetWidth: 640,
  targetHeight: 576,
  scaleFactor: 4,
  api: 'webgl2',
  presetId: 'true-color'
};

describe('worker protocol', () => {
  it('creates typed worker messages with timestamps', () => {
    const message = createWorkerMessage(WorkerMessageType.INIT, { config: validConfig });

    expect(message).toMatchObject({
      type: WorkerMessageType.INIT,
      payload: { config: validConfig }
    });
    expect(typeof message.timestamp).toBe('number');
  });

  it('validates worker messages at the boundary', () => {
    expect(isValidWorkerMessage(createWorkerMessage(WorkerMessageType.INIT, {
      config: validConfig
    }))).toBe(true);
    expect(isValidWorkerMessage({
      type: WorkerMessageType.INIT,
      payload: { config: { ...validConfig, targetWidth: '640' } }
    })).toBe(false);
    expect(isValidWorkerMessage({ type: 'unknown', payload: {} })).toBe(false);
  });

  it('validates worker responses at the boundary', () => {
    expect(isValidWorkerResponse(createWorkerResponse(WorkerResponseType.READY, {
      api: 'webgl2'
    }))).toBe(true);
    expect(isValidWorkerResponse(createWorkerResponse(WorkerResponseType.ERROR, {
      message: 'failed',
      code: 'INIT_FAILED'
    }))).toBe(true);
    expect(isValidWorkerResponse({
      type: WorkerResponseType.ERROR,
      payload: { code: 'INIT_FAILED' }
    })).toBe(false);
  });
});
