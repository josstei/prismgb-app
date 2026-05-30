import { describe, expect, it } from 'vitest';
import {
  isPerformanceStatePayload,
  isRecordingDegradedPayload,
  isRecordingReadyPayload,
  isStreamStartedPayload,
  isStreamingCapabilities
} from '@renderer/infrastructure/services/streaming/streaming-contracts';

describe('streaming contracts', () => {
  it('guards stream start payloads from untyped event sources', () => {
    expect(isStreamStartedPayload({
      stream: {},
      device: {},
      settings: { video: {} },
      capabilities: { nativeResolution: { width: 160, height: 144 } }
    })).toBe(true);
    expect(isStreamStartedPayload({
      stream: {},
      device: {},
      settings: null,
      capabilities: {}
    })).toBe(true);

    expect(isStreamStartedPayload({ stream: {}, settings: {} })).toBe(false);
  });

  it('guards capability and performance state shapes', () => {
    expect(isStreamingCapabilities({ nativeResolution: { width: 160, height: 144 } })).toBe(true);
    expect(isStreamingCapabilities({ nativeResolution: { width: 160 } })).toBe(false);
    expect(isPerformanceStatePayload({ hidden: true })).toBe(true);
    expect(isPerformanceStatePayload(null)).toBe(false);
  });

  it('guards recording payloads', () => {
    expect(isRecordingReadyPayload({
      blob: new Blob(['data']),
      filename: 'capture.webm'
    })).toBe(true);
    expect(isRecordingReadyPayload({ blob: {}, filename: 'capture.webm' })).toBe(false);
    expect(isRecordingDegradedPayload({ reason: 'slow-capture' })).toBe(true);
  });
});
