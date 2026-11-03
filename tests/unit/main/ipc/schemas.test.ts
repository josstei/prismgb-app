import { describe, it, expect } from 'vitest';
import {
  transcodeStartSchema,
  transcodeCancelSchema,
} from '@main/ipc/schemas/transcode.schemas.js';
import { deviceInfoSchema, nullableDeviceInfoSchema, deviceStatusPayloadSchema } from '@platform/devices';
import { transcodeProgressSchema, transcodeCompletedSchema, transcodeCancelledSchema, updateInfoSchema, updateProgressSchema, updateErrorSchema } from '../../../../src/platform/ipc/push-payloads.schemas.js';
import { externalUrlSchema, enabledFlagSchema } from '@main/ipc/schemas/common.schemas.js';
import { loginItemGetResponseSchema } from '@main/ipc/schemas/login-item.schemas.js';
import {
  createChromaticDeviceInfoPayload,
  createChromaticDeviceStatusPayload
} from '../../../devices/media.testkit';

const accepts = (schema: { safeParse: (v: unknown) => { success: boolean } }, value: unknown) =>
  schema.safeParse(value).success;

const canonicalDeviceInfo = createChromaticDeviceInfoPayload();

describe('IPC input schemas (security)', () => {
  it('externalUrlSchema accepts http/https and rejects other protocols, empty, and over-length', () => {
    expect(accepts(externalUrlSchema, { url: 'https://example.com' })).toBe(true);
    expect(accepts(externalUrlSchema, { url: 'http://example.com/path' })).toBe(true);
    expect(accepts(externalUrlSchema, { url: 'ftp://example.com' })).toBe(false);
    expect(accepts(externalUrlSchema, { url: 'javascript:alert(1)' })).toBe(false);
    expect(accepts(externalUrlSchema, { url: '' })).toBe(false);
    expect(accepts(externalUrlSchema, { url: `https://example.com/${'a'.repeat(2048)}` })).toBe(false);
    expect(accepts(externalUrlSchema, { url: 42 })).toBe(false);
  });

  it('enabledFlagSchema accepts a boxed boolean flag (incl. false) and rejects bare or malformed values', () => {
    expect(accepts(enabledFlagSchema, { enabled: true })).toBe(true);
    expect(accepts(enabledFlagSchema, { enabled: false })).toBe(true);
    expect(accepts(enabledFlagSchema, true)).toBe(false);
    expect(accepts(enabledFlagSchema, false)).toBe(false);
    expect(accepts(enabledFlagSchema, {})).toBe(false);
    expect(accepts(enabledFlagSchema, { enabled: 'true' })).toBe(false);
    expect(accepts(enabledFlagSchema, { enabled: 1 })).toBe(false);
  });

  it('transcodeStartSchema requires an ArrayBuffer and a supported format', () => {
    expect(accepts(transcodeStartSchema, { inputBuffer: new ArrayBuffer(8), format: 'mp4' })).toBe(true);
    expect(accepts(transcodeStartSchema, { inputBuffer: new ArrayBuffer(8), format: 'WEBM' })).toBe(false);
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
  it('deviceInfoSchema accepts only the canonical strict device info shape', () => {
    expect(accepts(deviceInfoSchema, canonicalDeviceInfo)).toBe(true);
    expect(accepts(deviceInfoSchema, {})).toBe(false);
    expect(accepts(deviceInfoSchema, { vendorId: 'not-a-number' })).toBe(false);
    expect(accepts(deviceInfoSchema, { ...canonicalDeviceInfo, deviceName: 'legacy' })).toBe(false);
  });

  it('deviceStatusPayloadSchema requires a canonical payload-only status and rejects an envelope-shaped one', () => {
    const status = {
      state: 'connected',
      connected: true,
      device: canonicalDeviceInfo
    };

    expect(accepts(deviceStatusPayloadSchema, status)).toBe(true);
    expect(accepts(deviceStatusPayloadSchema, { ...status, success: true })).toBe(false);
    expect(accepts(deviceStatusPayloadSchema, { connected: null })).toBe(false);
  });

  it('E2E device helpers produce canonical payloads accepted by strict schemas', () => {
    const deviceInfo = createChromaticDeviceInfoPayload();
    const connectedStatus = createChromaticDeviceStatusPayload(true);
    const disconnectedStatus = createChromaticDeviceStatusPayload(false);

    expect(accepts(deviceInfoSchema, deviceInfo)).toBe(true);
    expect(accepts(deviceStatusPayloadSchema, connectedStatus)).toBe(true);
    expect(accepts(deviceStatusPayloadSchema, disconnectedStatus)).toBe(true);
  });

  it('nullableDeviceInfoSchema also accepts null and undefined', () => {
    expect(accepts(nullableDeviceInfoSchema, null)).toBe(true);
    expect(accepts(nullableDeviceInfoSchema, undefined)).toBe(true);
    expect(accepts(nullableDeviceInfoSchema, canonicalDeviceInfo)).toBe(true);
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
    expect(accepts(transcodeProgressSchema, { percent: 50 })).toBe(false);
  });

  it('transcode terminal events require a job ID while retaining nullable completion paths', () => {
    expect(accepts(transcodeCompletedSchema, { jobId: 'j', filePath: null })).toBe(true);
    expect(accepts(transcodeCompletedSchema, { filePath: '/tmp/out.mp4' })).toBe(false);
    expect(accepts(transcodeCompletedSchema, { filePath: 42 })).toBe(false);
    expect(accepts(transcodeCancelledSchema, { jobId: 'j' })).toBe(true);
    expect(accepts(transcodeCancelledSchema, {})).toBe(false);
  });
});

describe('IPC query output schemas (trade e graceful fallback)', () => {

  it('loginItemGetResponseSchema accepts the payload-only shape and rejects malformed or envelope-shaped values', () => {
    expect(accepts(loginItemGetResponseSchema, { enabled: true })).toBe(true);
    expect(accepts(loginItemGetResponseSchema, { enabled: false })).toBe(true);
    expect(accepts(loginItemGetResponseSchema, { success: true, enabled: true })).toBe(false);
    expect(accepts(loginItemGetResponseSchema, {})).toBe(false);
  });
});
