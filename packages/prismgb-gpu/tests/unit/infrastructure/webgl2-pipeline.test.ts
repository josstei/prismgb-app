import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WebGL2Pipeline } from '@/infrastructure/webgl2/webgl2-pipeline';
import { BUILT_IN_PRESETS, PresetRegistry } from '@/domain/presets';

PresetRegistry.registerMany(BUILT_IN_PRESETS);

function createWebGL2ContextMock() {
  const framebuffers = [{ id: 'framebuffer-0' }, { id: 'framebuffer-1' }];
  let framebufferIndex = 0;
  let textureIndex = 0;

  return {
    ACTIVE_UNIFORMS: 0x8B86,
    LINK_STATUS: 0x8B82,
    COMPILE_STATUS: 0x8B81,
    VERTEX_SHADER: 0x8B31,
    FRAGMENT_SHADER: 0x8B30,
    TEXTURE_2D: 0x0DE1,
    NEAREST: 0x2600,
    LINEAR: 0x2601,
    TEXTURE_MIN_FILTER: 0x2801,
    TEXTURE_MAG_FILTER: 0x2800,
    TEXTURE_WRAP_S: 0x2802,
    TEXTURE_WRAP_T: 0x2803,
    CLAMP_TO_EDGE: 0x812F,
    RGBA: 0x1908,
    UNSIGNED_BYTE: 0x1401,
    FRAMEBUFFER: 0x8D40,
    READ_FRAMEBUFFER: 0x8CA8,
    DRAW_FRAMEBUFFER: 0x8CA9,
    COLOR_ATTACHMENT0: 0x8CE0,
    COLOR_BUFFER_BIT: 0x4000,
    TRIANGLES: 0x0004,
    TEXTURE0: 0x84C0,
    createShader: vi.fn(() => ({})),
    shaderSource: vi.fn(),
    compileShader: vi.fn(),
    getShaderParameter: vi.fn(() => true),
    getShaderInfoLog: vi.fn(() => ''),
    deleteShader: vi.fn(),
    createProgram: vi.fn(() => ({})),
    attachShader: vi.fn(),
    linkProgram: vi.fn(),
    getProgramParameter: vi.fn((_program, parameter) => parameter === 0x8B86 ? 0 : true),
    getProgramInfoLog: vi.fn(() => ''),
    deleteProgram: vi.fn(),
    getActiveUniform: vi.fn(() => null),
    getUniformLocation: vi.fn(() => null),
    useProgram: vi.fn(),
    uniform1i: vi.fn(),
    uniform1f: vi.fn(),
    uniform2f: vi.fn(),
    createVertexArray: vi.fn(() => ({})),
    bindVertexArray: vi.fn(),
    deleteVertexArray: vi.fn(),
    createTexture: vi.fn(() => ({ id: `texture-${textureIndex++}` })),
    bindTexture: vi.fn(),
    texParameteri: vi.fn(),
    texImage2D: vi.fn(),
    texSubImage2D: vi.fn(),
    deleteTexture: vi.fn(),
    createFramebuffer: vi.fn(() => framebuffers[framebufferIndex++]),
    bindFramebuffer: vi.fn(),
    framebufferTexture2D: vi.fn(),
    deleteFramebuffer: vi.fn(),
    viewport: vi.fn(),
    activeTexture: vi.fn(),
    drawArrays: vi.fn(),
    blitFramebuffer: vi.fn(),
    clearColor: vi.fn(),
    clear: vi.fn(),
    getExtension: vi.fn(() => null),
    framebuffers
  };
}

describe('WebGL2Pipeline', () => {
  beforeEach(() => {
    vi.stubGlobal('performance', {
      now: vi.fn(() => 0)
    });
  });

  it('blits from the last manifest pass framebuffer when CRT output is disabled', async () => {
    const gl = createWebGL2ContextMock();
    const canvas = {
      width: 640,
      height: 576,
      getContext: vi.fn(() => gl)
    };
    const pipeline = new WebGL2Pipeline({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: PresetRegistry.get('vibrant')!
    });

    await pipeline.initialize();
    pipeline.renderFrame({} as TexImageSource);

    const readFramebufferBinds = gl.bindFramebuffer.mock.calls.filter(
      ([target]) => target === gl.READ_FRAMEBUFFER
    );

    expect(readFramebufferBinds[0]).toEqual([gl.READ_FRAMEBUFFER, gl.framebuffers[0]]);
    expect(gl.blitFramebuffer).toHaveBeenCalledTimes(1);
  });

  it('configures texture filtering per pass using manifest sampler policy', async () => {
    const gl = createWebGL2ContextMock();
    const canvas = {
      width: 640,
      height: 576,
      getContext: vi.fn(() => gl)
    };
    const pipeline = new WebGL2Pipeline({
      canvas: canvas as unknown as HTMLCanvasElement,
      nativeWidth: 160,
      nativeHeight: 144,
      preset: PresetRegistry.get('vibrant')!
    });

    await pipeline.initialize();
    pipeline.renderFrame({} as TexImageSource);

    const minFilters = gl.texParameteri.mock.calls
      .filter(([, pname]) => pname === gl.TEXTURE_MIN_FILTER)
      .map(([, , value]) => value);
    const magFilters = gl.texParameteri.mock.calls
      .filter(([, pname]) => pname === gl.TEXTURE_MAG_FILTER)
      .map(([, , value]) => value);

    expect(minFilters).toEqual([
      gl.NEAREST, // source texture creation
      gl.LINEAR, // intermediate framebuffer texture 0
      gl.LINEAR, // intermediate framebuffer texture 1
      gl.NEAREST, // pixel-upscale pass
      gl.LINEAR, // unsharp pass
      gl.LINEAR // color pass
    ]);

    expect(magFilters).toEqual([
      gl.NEAREST,
      gl.LINEAR,
      gl.LINEAR,
      gl.NEAREST,
      gl.LINEAR,
      gl.LINEAR
    ]);
  });
});
