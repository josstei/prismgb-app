/**
 * Transcode Config Unit Tests
 * Tests the browser-safe transcode configuration constants
 */

import { describe, it, expect } from 'vitest';
import { TranscodeState, TRANSCODE_CONFIG } from '@platform/transcode';

describe('TranscodeState', () => {
  it.each([
    ['IDLE', 'idle'],
    ['TRANSCODING', 'transcoding'],
    ['COMPLETED', 'completed'],
    ['CANCELLED', 'cancelled'],
    ['ERROR', 'error']
  ] as const)('should define %s state', (key, value) => {
    expect(TranscodeState[key]).toBe(value);
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(TranscodeState)).toBe(true);
  });
});

describe('TRANSCODE_CONFIG', () => {
  describe('formats', () => {
    it.each([
      ['webm', 'webm', 'video/webm', 'WebM (VP9)', 'libvpx-vp9'],
      ['mp4', 'mp4', 'video/mp4', 'MP4 (H.264)', 'libx264'],
      ['mov', 'mov', 'video/quicktime', 'MOV (ProRes)', 'prores_ks']
    ] as const)('should define %s format', (format, extension, mimeType, label, codec) => {
      const definition = TRANSCODE_CONFIG.formats[format];
      expect(definition).toBeDefined();
      expect(definition.extension).toBe(extension);
      expect(definition.mimeType).toBe(mimeType);
      expect(definition.label).toBe(label);
      expect(definition.ffmpegArgs).toContain(codec);
    });

    it('should have frozen format objects', () => {
      expect(Object.isFrozen(TRANSCODE_CONFIG.formats)).toBe(true);
      expect(Object.isFrozen(TRANSCODE_CONFIG.formats.webm)).toBe(true);
      expect(Object.isFrozen(TRANSCODE_CONFIG.formats.mp4)).toBe(true);
      expect(Object.isFrozen(TRANSCODE_CONFIG.formats.mov)).toBe(true);
    });
  });

  it.each([
    ['defaultFormat', 'mp4'],
    ['tempPrefix', 'prismgb-transcode-'],
    ['progressIntervalMs', 100],
    ['probeDurationTimeoutMs', 10000]
  ] as const)('should define %s as %s', (key, value) => {
    expect(TRANSCODE_CONFIG[key]).toBe(value);
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(TRANSCODE_CONFIG)).toBe(true);
  });
});
