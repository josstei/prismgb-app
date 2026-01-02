/**
 * Brightness Conversion Utilities
 *
 * Converts between slider values (0-100) and brightness multipliers (0.5-1.5).
 * Slider 0 = 0.5x brightness (darker)
 * Slider 50 = 1.0x brightness (normal)
 * Slider 100 = 1.5x brightness (brighter)
 */

/**
 * Convert slider value (0-100) to brightness multiplier (0.5-1.5)
 * @param {number} sliderValue - Slider value 0-100
 * @returns {number} Brightness multiplier 0.5-1.5
 */
export function sliderToBrightness(sliderValue) {
  return (sliderValue / 100) + 0.5;
}

/**
 * Convert brightness multiplier (0.5-1.5) to slider value (0-100)
 * @param {number} brightness - Brightness multiplier 0.5-1.5
 * @returns {number} Slider value 0-100
 */
export function brightnessToSlider(brightness) {
  return Math.round((brightness - 0.5) * 100);
}
