import { describe, expect, it } from 'vitest';
import { createWorkerMessage, createWorkerResponse, isValidWorkerMessage, isValidWorkerResponse } from '../../../../../src/platform/gpu/worker/protocol';

describe('worker protocol', () => {
  it('validates one canonical payload shape and rejects removed protocol fields', () => {
    expect(isValidWorkerMessage(createWorkerMessage('resize', { width: 640, height: 576 }))).toBe(true);
    expect(isValidWorkerMessage({ type: 'resize', payload: { width: '640', height: 576 } })).toBe(false);
    expect(isValidWorkerMessage({ type: 'release' })).toBe(false);
    expect(createWorkerMessage('capture', { requestId: 3 })).toEqual({ type: 'capture', payload: { requestId: 3 } });
  });
  it('requires a preset ID and correlated capture response', () => {
    expect(isValidWorkerMessage(createWorkerMessage('setPreset', { presetId: 'pixel' }))).toBe(true);
    expect(isValidWorkerMessage({ type: 'setPreset', payload: { preset: {} } })).toBe(false);
    expect(isValidWorkerResponse({ type: 'captureReady', payload: { bitmap: { close() {} } } })).toBe(false);
    expect(isValidWorkerResponse(createWorkerResponse('captureReady', { requestId: 2, bitmap: { close() {} } as ImageBitmap }))).toBe(true);
  });
});
