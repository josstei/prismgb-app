import { describe, it, expect } from 'vitest';
import {
  externalUrlSchema,
  booleanArgumentSchema,
  transcodeStartSchema,
  transcodeCancelSchema,
  transcodeProgressSchema,
  transcodeCompletedSchema,
  transcodeCancelledSchema,
  deviceInfoSchema,
  nullableDeviceInfoSchema,
  updateInfoSchema,
  updateProgressSchema,
  updateErrorSchema,
  gpuPolicyResponseSchema,
  loginItemGetResponseSchema
} from '@main/ipc/schemas/index.js';

const accepts = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

describe('IPC input schemas (security)', () => {
  it('externalUrlSchema accepts http/https and rejects other protocols, empty, and over-length', () => {
    expect(accepts(externalUrlSchema, 'https://example.com')).toBe(true);
    expect(accepts(externalUrlSchema, 'http://example.com/path')).toBe(true);
    expect(accepts(externalUrlSchema, 'ftp://example.com')).toBe(false);
    expect(accepts(externalUrlSchema, 'javascript:alert(1)')).toBe(false);
    expect(accepts(externalUrlSchema, '')).toBe(false);
    expect(accepts(externalUrlSchema, `https://example.com/${'a'.repeat(2048)}`)).toBe(false);
    expect(accepts(externalUrlSchema, 42)).toBe(false);
  });

  it('booleanArgumentSchema accepts only booleans', () => {
    expect(accepts(booleanArgumentSchema, true)).toBe(true);
    expect(accepts(booleanArgumentSchema, false)).toBe(true);
    expect(accepts(booleanArgumentSchema, 'true')).toBe(false);
    expect(accepts(booleanArgumentSchema, 1)).toBe(false);
  });

  it('transcodeStartSchema requires an ArrayBuffer and a supported format', () => {
    expect(accepts(transcodeStartSchema, { inputBuffer: new ArrayBuffer(8), format: 'mp4' })).toBe(true);
    expect(accepts(transcodeStartSchema, { inputBuffer: new ArrayBuffer(8), format: 'WEBM' })).toBe(true);
    expect(accepts(transcodeStartSchema, { inputBuffer: new ArrayBuffer(8), format: 'avi' })).toBe(false);
    expect(accepts(transcodeStartSchema, { inputBuffer: 'not-a-buffer', format: 'mp4' })).toBe(false);
    expect(accepts(transcodeStartSchema, { inputBuffer: new ArrayBuffer(8), format: 'mp4', inputArgs: ['-vf', ''] })).toBe(false);
    expect(accepts(transcodeStartSchema, { inputBuffer: new ArrayBuffer(8), format: 'mp4', inputArgs: ['-vf', 'scale=1'] })).toBe(true);
  });

  it('transcodeCancelSchema requires a non-empty jobId', () => {
    expect(accepts(transcodeCancelSchema, { jobId: 'job-1' })).toBe(true);
    expect(accepts(transcodeCancelSchema, { jobId: '' })).toBe(false);
    expect(accepts(transcodeCancelSchema, {})).toBe(false);
  });
});

describe('IPC subscription payload schemas (defense-in-depth)', () => {
  it('deviceInfoSchema accepts the optional-typed shape and rejects wrong field types', () => {
    expect(accepts(deviceInfoSchema, {})).toBe(true);
    expect(accepts(deviceInfoSchema, { vendorId: 1234, deviceName: 'Chromatic' })).toBe(true);
    expect(accepts(deviceInfoSchema, { vendorId: 'not-a-number' })).toBe(false);
    expect(accepts(deviceInfoSchema, { deviceName: 42 })).toBe(false);
  });

  it('nullableDeviceInfoSchema also accepts null and undefined', () => {
    expect(accepts(nullableDeviceInfoSchema, null)).toBe(true);
    expect(accepts(nullableDeviceInfoSchema, undefined)).toBe(true);
    expect(accepts(nullableDeviceInfoSchema, { vendorId: 1 })).toBe(true);
    expect(accepts(nullableDeviceInfoSchema, { vendorId: 'x' })).toBe(false);
  });

  it('update payload schemas validate their optional fields', () => {
    expect(accepts(updateInfoSchema, { version: '1.2.3' })).toBe(true);
    expect(accepts(updateInfoSchema, { version: 5 })).toBe(false);
    expect(accepts(updateProgressSchema, { percent: 50 })).toBe(true);
    expect(accepts(updateProgressSchema, { percent: 'half' })).toBe(false);
    expect(accepts(updateErrorSchema, { message: 'boom', code: 'E1' })).toBe(true);
    expect(accepts(updateErrorSchema, { message: 42 })).toBe(false);
  });

  it('transcodeProgressSchema requires a numeric percent', () => {
    expect(accepts(transcodeProgressSchema, { percent: 12.5, jobId: 'j' })).toBe(true);
    expect(accepts(transcodeProgressSchema, { jobId: 'j' })).toBe(false);
    expect(accepts(transcodeProgressSchema, { percent: 'x' })).toBe(false);
  });

  it('transcodeCompletedSchema accepts nullable filePath; cancelled accepts optional jobId', () => {
    expect(accepts(transcodeCompletedSchema, { jobId: 'j', filePath: null })).toBe(true);
    expect(accepts(transcodeCompletedSchema, { filePath: '/tmp/out.mp4' })).toBe(true);
    expect(accepts(transcodeCompletedSchema, { filePath: 42 })).toBe(false);
    expect(accepts(transcodeCancelledSchema, { jobId: 'j' })).toBe(true);
    expect(accepts(transcodeCancelledSchema, {})).toBe(true);
  });
});

describe('IPC query output schemas (trade e graceful fallback)', () => {
  it('gpuPolicyResponseSchema accepts the success shape and rejects failure envelopes', () => {
    expect(accepts(gpuPolicyResponseSchema, { success: true, skipWebGPU: false, reason: null })).toBe(true);
    expect(accepts(gpuPolicyResponseSchema, { success: true, skipWebGPU: true, reason: 'blocklist' })).toBe(true);
    expect(accepts(gpuPolicyResponseSchema, { success: false, error: 'failed' })).toBe(false);
    expect(accepts(gpuPolicyResponseSchema, { success: true, skipWebGPU: 'no', reason: null })).toBe(false);
  });

  it('loginItemGetResponseSchema accepts the success shape and rejects failure envelopes', () => {
    expect(accepts(loginItemGetResponseSchema, { success: true, enabled: true })).toBe(true);
    expect(accepts(loginItemGetResponseSchema, { success: false, enabled: false, error: 'failed' })).toBe(false);
    expect(accepts(loginItemGetResponseSchema, { success: true })).toBe(false);
  });
});
