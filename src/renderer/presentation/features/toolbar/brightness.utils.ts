/**
 * Brightness Conversion Utilities
 *
 * Converts between slider values (0-100) and brightness multipliers (0.5-1.5).
 * Slider 0 = 0.5x brightness (darker)
 * Slider 50 = 1.0x brightness (normal)
 * Slider 100 = 1.5x brightness (brighter)
 */

export function sliderToBrightness(sliderValue: number): number {
  return (sliderValue / 100) + 0.5;
}

export function brightnessToSlider(brightness: number): number {
  return Math.round((brightness - 0.5) * 100);
}
