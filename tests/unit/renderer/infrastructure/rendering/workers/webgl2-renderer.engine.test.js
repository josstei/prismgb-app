import { describe, expect, it, vi } from 'vitest';
import { WebGL2Renderer } from '@renderer/infrastructure/rendering/workers/webgl2-renderer.engine.ts';
import { createWebGL2Context } from '../../../../../mocks/webgl-context.mock.js';

const config = {
  nativeWidth: 160,
  nativeHeight: 144,
  targetWidth: 640,
  targetHeight: 576,
  scaleFactor: 4,
  api: 'webgl2',
  presetId: 'true-color'
};

function createCanvas(getContext) {
  return {
    width: 640,
    height: 576,
    getContext
  };
}

function createShaderReadyContext() {
  const gl = createWebGL2Context();
  gl.ACTIVE_UNIFORMS = 0x8B86;
  gl.READ_FRAMEBUFFER = 0x8CA8;
  gl.DRAW_FRAMEBUFFER = 0x8CA9;
  gl.getProgramParameter.mockImplementation((program, pname) => {
    if (pname === gl.LINK_STATUS) {
      return true;
    }
    if (pname === gl.ACTIVE_UNIFORMS) {
      return 0;
    }
    return null;
  });
  return gl;
}

describe('WebGL2Renderer', () => {
  it('fails initialization when WebGL2 context creation fails', async () => {
    const renderer = new WebGL2Renderer();
    const canvas = createCanvas(vi.fn(() => null));

    await expect(renderer.initialize(canvas, config)).rejects.toThrow('WebGL2 context not available');
  });

  it('allows destroy before initialization and after prior destruction', async () => {
    const renderer = new WebGL2Renderer();
    const gl = createShaderReadyContext();
    const canvas = createCanvas(vi.fn(() => gl));

    expect(() => renderer.destroy()).not.toThrow();

    await renderer.initialize(canvas, config);
    expect(renderer.config).toBe(config);

    expect(() => renderer.destroy()).not.toThrow();
    expect(() => renderer.destroy()).not.toThrow();
    expect(gl.deleteTexture).toHaveBeenCalled();
    expect(gl.deleteFramebuffer).toHaveBeenCalled();
    expect(gl.deleteVertexArray).toHaveBeenCalled();
  });
});
