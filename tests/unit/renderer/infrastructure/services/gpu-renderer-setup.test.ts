import { describe, it, expect } from 'vitest';
import { isWorkerRenderAPI, computeRendererConfig } from '../../../../../src/renderer/infrastructure/services/gpu/gpu-renderer-setup.js';

describe('gpu-renderer-setup utilities', () => {
  describe('isWorkerRenderAPI', () => {
    it('returns true for webgpu and webgl2', () => {
      expect(isWorkerRenderAPI('webgpu')).toBe(true);
      expect(isWorkerRenderAPI('webgl2')).toBe(true);
    });

    it('returns false for other APIs', () => {
      expect(isWorkerRenderAPI('canvas2d' as any)).toBe(false);
      expect(isWorkerRenderAPI('unknown' as any)).toBe(false);
    });
  });

  describe('computeRendererConfig', () => {
    it('correctly computes target dimensions and worker config', () => {
      const nativeResolution = { width: 160, height: 144 };
      const clientWidth = 320;
      const clientHeight = 288;
      const preferredAPI = 'webgpu';
      const savedPresetId = 'default';

      const result = computeRendererConfig(
        nativeResolution,
        clientWidth,
        clientHeight,
        preferredAPI,
        savedPresetId
      );

      expect(result.scaleFactor).toBe(2);
      expect(result.targetWidth).toBe(320);
      expect(result.targetHeight).toBe(288);
      expect(result.config).toEqual({
        nativeWidth: 160,
        nativeHeight: 144,
        targetWidth: 320,
        targetHeight: 288,
        scaleFactor: 2,
        api: 'webgpu',
        presetId: 'default'
      });
    });
  });
});
