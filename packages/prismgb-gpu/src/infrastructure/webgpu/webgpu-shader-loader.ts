import pixelUpscale from './shaders/pixel-upscale.wgsl?raw';
import unsharpMask from './shaders/unsharp-mask.wgsl?raw';
import colorElevation from './shaders/color-elevation.wgsl?raw';
import crtLcd from './shaders/crt-lcd.wgsl?raw';

export interface WebGPUShaders {
  pixelUpscale: string;
  unsharpMask: string;
  colorElevation: string;
  crtLcd: string;
}

export function loadShaders(): WebGPUShaders {
  return {
    pixelUpscale,
    unsharpMask,
    colorElevation,
    crtLcd
  };
}
