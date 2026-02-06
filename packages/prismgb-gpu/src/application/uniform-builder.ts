import type { IPreset } from '../domain/presets';
import type { PipelineUniforms } from '../domain/shaders';

export interface UniformBuildContext {
  preset: IPreset;
  nativeWidth: number;
  nativeHeight: number;
  outputWidth: number;
  outputHeight: number;
  brightness: number;
}

export function calculateScaleFactor(
  nativeWidth: number,
  nativeHeight: number,
  outputWidth: number,
  outputHeight: number
): number {
  const scaleX = Math.floor(outputWidth / nativeWidth);
  const scaleY = Math.floor(outputHeight / nativeHeight);
  return Math.max(1, Math.min(scaleX, scaleY));
}

export function buildUniforms(context: UniformBuildContext): PipelineUniforms {
  const { preset, nativeWidth, nativeHeight, outputWidth, outputHeight, brightness } = context;

  const scaleFactor = calculateScaleFactor(nativeWidth, nativeHeight, outputWidth, outputHeight);
  const scaledWidth = nativeWidth * scaleFactor;
  const scaledHeight = nativeHeight * scaleFactor;

  return {
    upscale: {
      inputSize: [nativeWidth, nativeHeight],
      outputSize: [scaledWidth, scaledHeight],
      scaleFactor
    },
    unsharp: {
      texelSize: [1 / scaledWidth, 1 / scaledHeight],
      strength: preset.unsharp.enabled ? preset.unsharp.strength : 0,
      scaleFactor
    },
    color: {
      gamma: preset.color.enabled ? preset.color.gamma : 1.0,
      saturation: preset.color.enabled ? preset.color.saturation : 1.0,
      greenBias: preset.color.enabled ? preset.color.greenBias : 0,
      brightness: preset.color.enabled ? preset.color.brightness * brightness : brightness,
      contrast: preset.color.enabled ? preset.color.contrast : 1.0
    },
    crt: {
      resolution: [scaledWidth, scaledHeight],
      scaleFactor,
      scanlineStrength: preset.crt.enabled ? preset.crt.scanlineStrength : 0,
      pixelMaskStrength: preset.crt.enabled ? preset.crt.pixelMaskStrength : 0,
      bloomStrength: preset.crt.enabled ? preset.crt.bloomStrength : 0,
      curvature: preset.crt.enabled ? preset.crt.curvature : 0,
      vignetteStrength: preset.crt.enabled ? preset.crt.vignetteStrength : 0
    }
  };
}
