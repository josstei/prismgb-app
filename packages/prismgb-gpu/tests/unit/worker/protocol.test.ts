import { describe, expect, it } from 'vitest';
import {
  WorkerMessageType,
  WorkerResponseType,
  createWorkerMessage,
  createWorkerResponse,
  isValidWorkerMessage,
  isValidWorkerResponse
} from '@/worker/protocol';

const validConfig = {
  nativeWidth: 160,
  nativeHeight: 144,
  targetWidth: 640,
  targetHeight: 576,
  scaleFactor: 4,
  backend: 'webgl2',
  presetId: 'true-color'
} as const;

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
      backend: 'webgl2'
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
