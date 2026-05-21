import vertexShader from './shaders/common.vert.glsl?raw';
import pixelUpscale from './shaders/pixel-upscale.frag.glsl?raw';
import unsharpMask from './shaders/unsharp-mask.frag.glsl?raw';
import colorElevation from './shaders/color-elevation.frag.glsl?raw';
import crtLcd from './shaders/crt-lcd.frag.glsl?raw';

export interface WebGL2Shaders {
  byFileName: Record<string, string>;
}

export function loadShaders(): WebGL2Shaders {
  return {
    byFileName: {
      'common.vert.glsl': vertexShader,
      'pixel-upscale.frag.glsl': pixelUpscale,
      'unsharp-mask.frag.glsl': unsharpMask,
      'color-elevation.frag.glsl': colorElevation,
      'crt-lcd.frag.glsl': crtLcd
    }
  };
}
