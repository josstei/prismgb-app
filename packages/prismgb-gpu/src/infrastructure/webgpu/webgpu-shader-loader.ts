import pixelUpscale from './shaders/pixel-upscale.wgsl?raw';
import unsharpMask from './shaders/unsharp-mask.wgsl?raw';
import colorElevation from './shaders/color-elevation.wgsl?raw';
import crtLcd from './shaders/crt-lcd.wgsl?raw';

export interface WebGPUShaders {
  byFileName: Record<string, string>;
}

export function loadShaders(): WebGPUShaders {
  return {
    byFileName: {
      'pixel-upscale.wgsl': pixelUpscale,
      'unsharp-mask.wgsl': unsharpMask,
      'color-elevation.wgsl': colorElevation,
      'crt-lcd.wgsl': crtLcd
    }
  };
}
