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
