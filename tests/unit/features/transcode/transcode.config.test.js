/**
 * Transcode Config Unit Tests
 * Tests the browser-safe transcode configuration constants
 */

import { describe, it, expect } from 'vitest';
import { TranscodeState, TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';

describe('TranscodeState', () => {
  it('should define IDLE state', () => {
    expect(TranscodeState.IDLE).toBe('idle');
  });

  it('should define TRANSCODING state', () => {
    expect(TranscodeState.TRANSCODING).toBe('transcoding');
  });

  it('should define COMPLETED state', () => {
    expect(TranscodeState.COMPLETED).toBe('completed');
  });

  it('should define CANCELLED state', () => {
    expect(TranscodeState.CANCELLED).toBe('cancelled');
  });

  it('should define ERROR state', () => {
    expect(TranscodeState.ERROR).toBe('error');
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(TranscodeState)).toBe(true);
  });
});

describe('TRANSCODE_CONFIG', () => {
  describe('formats', () => {
    it('should define webm format', () => {
      expect(TRANSCODE_CONFIG.formats.webm).toBeDefined();
      expect(TRANSCODE_CONFIG.formats.webm.extension).toBe('webm');
      expect(TRANSCODE_CONFIG.formats.webm.mimeType).toBe('video/webm');
      expect(TRANSCODE_CONFIG.formats.webm.label).toBe('WebM (VP9)');
      expect(TRANSCODE_CONFIG.formats.webm.ffmpegArgs).toContain('libvpx-vp9');
    });

    it('should define mp4 format', () => {
      expect(TRANSCODE_CONFIG.formats.mp4).toBeDefined();
      expect(TRANSCODE_CONFIG.formats.mp4.extension).toBe('mp4');
      expect(TRANSCODE_CONFIG.formats.mp4.mimeType).toBe('video/mp4');
      expect(TRANSCODE_CONFIG.formats.mp4.label).toBe('MP4 (H.264)');
      expect(TRANSCODE_CONFIG.formats.mp4.ffmpegArgs).toContain('libx264');
    });

    it('should define mov format', () => {
      expect(TRANSCODE_CONFIG.formats.mov).toBeDefined();
      expect(TRANSCODE_CONFIG.formats.mov.extension).toBe('mov');
      expect(TRANSCODE_CONFIG.formats.mov.mimeType).toBe('video/quicktime');
      expect(TRANSCODE_CONFIG.formats.mov.label).toBe('MOV (ProRes)');
      expect(TRANSCODE_CONFIG.formats.mov.ffmpegArgs).toContain('prores_ks');
    });

    it('should have frozen format objects', () => {
      expect(Object.isFrozen(TRANSCODE_CONFIG.formats)).toBe(true);
      expect(Object.isFrozen(TRANSCODE_CONFIG.formats.webm)).toBe(true);
      expect(Object.isFrozen(TRANSCODE_CONFIG.formats.mp4)).toBe(true);
      expect(Object.isFrozen(TRANSCODE_CONFIG.formats.mov)).toBe(true);
    });
  });

  describe('defaultFormat', () => {
    it('should default to mp4', () => {
      expect(TRANSCODE_CONFIG.defaultFormat).toBe('mp4');
    });
  });

  describe('tempPrefix', () => {
    it('should have a temp file prefix', () => {
      expect(TRANSCODE_CONFIG.tempPrefix).toBe('prismgb-transcode-');
    });
  });

  describe('progressIntervalMs', () => {
    it('should define progress update interval', () => {
      expect(TRANSCODE_CONFIG.progressIntervalMs).toBe(100);
    });
  });

  describe('probeDurationTimeoutMs', () => {
    it('should define probe timeout', () => {
      expect(TRANSCODE_CONFIG.probeDurationTimeoutMs).toBe(10000);
    });
  });

  it('should be frozen', () => {
    expect(Object.isFrozen(TRANSCODE_CONFIG)).toBe(true);
  });
});
