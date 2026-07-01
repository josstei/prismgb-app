import { describe, expect, it } from 'vitest';
import { selectRenderBackend } from '@/application/backend-selection';
import { createRenderCapabilitiesFixture } from '@prismgb/gpu/testkit';

describe('selectRenderBackend', () => {
  it('uses an available preferred accelerated backend', () => {
    expect(selectRenderBackend(createRenderCapabilitiesFixture({
      preferredBackend: 'webgpu',
      webgpu: true,
      webgl2: true
    }))).toBe('webgpu');

    expect(selectRenderBackend(createRenderCapabilitiesFixture({
      preferredBackend: 'webgl2',
      webgpu: true,
      webgl2: true
    }))).toBe('webgl2');
  });

  it('falls back through WebGPU, WebGL2, then Canvas2D by capability', () => {
    expect(selectRenderBackend(createRenderCapabilitiesFixture({
      preferredBackend: 'webgpu',
      webgpu: false,
      webgl2: true
    }))).toBe('webgl2');

    expect(selectRenderBackend(createRenderCapabilitiesFixture({
      preferredBackend: 'webgpu',
      webgpu: false,
      webgl2: false
    }))).toBe('canvas2d');
  });

  it('can reject Canvas2D fallback for accelerated-only callers', () => {
    expect(selectRenderBackend(createRenderCapabilitiesFixture({
      preferredBackend: 'webgpu',
      webgpu: false,
      webgl2: false
    }), {
      allowCanvas2D: false
    })).toBe('webgpu');
  });
});
