import type { Dimensions } from '@renderer/infrastructure/streaming/streaming-contracts.js';

export function normalizeNativeResolution(nativeResolution: Dimensions): Dimensions {
  if (
    !Number.isFinite(nativeResolution.width) ||
    !Number.isFinite(nativeResolution.height) ||
    nativeResolution.width <= 0 ||
    nativeResolution.height <= 0
  ) {
    throw new Error('Native resolution must be positive finite dimensions');
  }

  return {
    width: nativeResolution.width,
    height: nativeResolution.height
  };
}

export function createNativeBitmapOptions(nativeResolution: Dimensions): ImageBitmapOptions {
  return Object.freeze({
    resizeWidth: nativeResolution.width,
    resizeHeight: nativeResolution.height,
    resizeQuality: 'pixelated'
  } satisfies ImageBitmapOptions);
}

export function calculateNativeScaleFactor(nativeResolution: Dimensions, width: number, height: number): number {
  return Math.max(1, Math.floor(Math.min(
    width / nativeResolution.width,
    height / nativeResolution.height
  )));
}
