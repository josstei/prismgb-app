import vertexShader from './shaders/common.vert.glsl?raw';
import pixelUpscale from './shaders/pixel-upscale.frag.glsl?raw';
import unsharpMask from './shaders/unsharp-mask.frag.glsl?raw';
import colorElevation from './shaders/color-elevation.frag.glsl?raw';
import crtLcd from './shaders/crt-lcd.frag.glsl?raw';

export interface WebGL2Shaders {
  vertex: string;
  pixelUpscale: string;
  unsharpMask: string;
  colorElevation: string;
  crtLcd: string;
}

export function loadShaders(): WebGL2Shaders {
  return {
    vertex: vertexShader,
    pixelUpscale,
    unsharpMask,
    colorElevation,
    crtLcd
  };
}
