/**
 * Render Presets
 *
 * Predefined configurations for the HD rendering pipeline.
 * Each preset controls all 4 shader passes with optimized settings.
 *
 * Presets:
 * - TRUE_COLOR: Accurate GBC color reproduction
 * - VIBRANT: Enhanced colors for modern displays
 * - HI_DEF: Maximum clarity with edge enhancement
 * - VINTAGE: Classic CRT monitor simulation
 * - PIXEL: Visible LCD pixel structure
 * - PERFORMANCE: Minimal processing for weak GPUs
 */

/**
 * @typedef {Object} UpscalePassConfig
 * @property {boolean} enabled - Whether this pass is active
 */

/**
 * @typedef {Object} UnsharpPassConfig
 * @property {boolean} enabled - Whether this pass is active
 * @property {number} strength - Sharpening strength (0.0 - 1.5)
 */

/**
 * @typedef {Object} ColorPassConfig
 * @property {boolean} enabled - Whether this pass is active
 * @property {number} gamma - Gamma correction (0.8 - 1.2, lower = brighter)
 * @property {number} saturation - Saturation multiplier (0.5 - 1.5)
 * @property {number} greenBias - GBC green channel bias (0.0 - 0.1)
 * @property {number} brightness - Brightness multiplier (0.8 - 1.2)
 * @property {number} contrast - Contrast multiplier (0.8 - 1.3)
 */

/**
 * @typedef {Object} CRTPassConfig
 * @property {boolean} enabled - Whether this pass is active
 * @property {number} scanlineStrength - Horizontal scanline intensity (0.0 - 0.5)
 * @property {number} pixelMaskStrength - RGB subpixel mask intensity (0.0 - 0.4)
 * @property {number} bloomStrength - Glow around bright areas (0.0 - 0.3)
 * @property {number} curvature - Barrel distortion amount (0.0 - 0.1)
 * @property {number} vignetteStrength - Corner darkening (0.0 - 0.4)
 */

/**
 * @typedef {Object} RenderPreset
 * @property {string} id - Unique identifier
 * @property {string} name - Display name
 * @property {string} description - User-facing description
 * @property {UpscalePassConfig} upscale - Pass 1 config
 * @property {UnsharpPassConfig} unsharp - Pass 2 config
 * @property {ColorPassConfig} color - Pass 3 config
 * @property {CRTPassConfig} crt - Pass 4 config
 */

/**
 * Render presets configuration (internal)
 * @type {Object.<string, RenderPreset>}
 */
const RenderPresets = Object.freeze({
  /**
   * True Color - Accurate Game Boy Color reproduction
   * No artificial enhancements, just accurate color reproduction
   */
  TRUE_COLOR: Object.freeze({
    id: 'true-color',
    name: 'True Color',
    description: 'Accurate GBC colors',
    upscale: {
      enabled: true
    },
    unsharp: {
      enabled: false,
      strength: 0.0
    },
    color: {
      enabled: true,
      gamma: 0.92,
      saturation: 1.0,
      greenBias: 0.03,
      brightness: 1.0,
      contrast: 1.0
    },
    crt: {
      enabled: false,
      scanlineStrength: 0.0,
      pixelMaskStrength: 0.0,
      bloomStrength: 0.0,
      curvature: 0.0,
      vignetteStrength: 0.0
    }
  }),

  /**
   * Vibrant - Enhanced colors with boosted saturation
   * Ideal for modern displays, makes colors pop
   */
  VIBRANT: Object.freeze({
    id: 'vibrant',
    name: 'Vibrant',
    description: 'Boosted colors for modern displays',
    upscale: {
      enabled: true
    },
    unsharp: {
      enabled: true,
      strength: 0.3
    },
    color: {
      enabled: true,
      gamma: 0.88,
      saturation: 1.2,
      greenBias: 0.02,
      brightness: 1.05,
      contrast: 1.1
    },
    crt: {
      enabled: false,
      scanlineStrength: 0.0,
      pixelMaskStrength: 0.0,
      bloomStrength: 0.0,
      curvature: 0.0,
      vignetteStrength: 0.0
    }
  }),

  /**
   * Hi-Def - Maximum clarity with edge enhancement
   * For users who want the crispest possible image
   */
  HI_DEF: Object.freeze({
    id: 'hi-def',
    name: 'Hi-Def',
    description: 'Maximum clarity and sharpness',
    upscale: {
      enabled: true
    },
    unsharp: {
      enabled: true,
      strength: 0.8
    },
    color: {
      enabled: true,
      gamma: 0.90,
      saturation: 1.1,
      greenBias: 0.01,
      brightness: 1.0,
      contrast: 1.05
    },
    crt: {
      enabled: false,
      scanlineStrength: 0.0,
      pixelMaskStrength: 0.0,
      bloomStrength: 0.0,
      curvature: 0.0,
      vignetteStrength: 0.0
    }
  }),

  /**
   * Vintage - Classic CRT monitor simulation
   * Scanlines, slight bloom, and barrel distortion
   */
  VINTAGE: Object.freeze({
    id: 'vintage',
    name: 'Vintage',
    description: 'CRT scanlines and glow',
    upscale: {
      enabled: true
    },
    unsharp: {
      enabled: false,
      strength: 0.0
    },
    color: {
      enabled: true,
      gamma: 0.95,
      saturation: 1.15,
      greenBias: 0.02,
      brightness: 0.95,
      contrast: 1.1
    },
    crt: {
      enabled: true,
      scanlineStrength: 0.25,
      pixelMaskStrength: 0.0,
      bloomStrength: 0.1,
      curvature: 0.02,
      vignetteStrength: 0.15
    }
  }),

  /**
   * Pixel - Visible LCD pixel structure
   * Simulates the look of the original GBC LCD panel
   */
  PIXEL: Object.freeze({
    id: 'pixel',
    name: 'Pixel',
    description: 'Visible pixel grid overlay',
    upscale: {
      enabled: true
    },
    unsharp: {
      enabled: false,
      strength: 0.0
    },
    color: {
      enabled: true,
      gamma: 0.90,
      saturation: 1.0,
      greenBias: 0.04,
      brightness: 1.0,
      contrast: 1.0
    },
    crt: {
      enabled: true,
      scanlineStrength: 0.08,
      pixelMaskStrength: 0.2,
      bloomStrength: 0.04,
      curvature: 0.0,
      vignetteStrength: 0.0
    }
  }),

  /**
   * Performance - Minimal processing for weak GPUs
   * Only upscaling, all shader effects disabled for maximum GPU savings
   */
  PERFORMANCE: Object.freeze({
    id: 'performance',
    name: 'Performance',
    description: 'Minimal processing for weak GPUs',
    upscale: {
      enabled: true
    },
    unsharp: {
      enabled: false,
      strength: 0.0
    },
    color: {
      enabled: false,
      gamma: 1.0,
      saturation: 1.0,
      greenBias: 0.0,
      brightness: 1.0,
      contrast: 1.0
    },
    crt: {
      enabled: false,
      scanlineStrength: 0.0,
      pixelMaskStrength: 0.0,
      bloomStrength: 0.0,
      curvature: 0.0,
      vignetteStrength: 0.0
    }
  })
});

/**
 * Default preset ID
 */
export const DEFAULT_PRESET_ID = 'vibrant';

/**
 * Get preset by ID
 * @param {string} id - Preset ID
 * @returns {RenderPreset|null} Preset or null if not found
 */
export function getPresetById(id) {
  const normalizedId = id?.toUpperCase().replace(/-/g, '_');
  return RenderPresets[normalizedId] || null;
}

/**
 * Get presets as array for UI rendering
 * @returns {Array<{id: string, name: string, description: string}>}
 */
export function getPresetsForUI() {
  return Object.values(RenderPresets).map(preset => ({
    id: preset.id,
    name: preset.name,
    description: preset.description
  }));
}

/**
 * Build uniform values from a preset for shader consumption
 * @param {RenderPreset} preset - Preset to build uniforms from
 * @param {number} scaleFactor - Current integer scale factor
 * @param {number} outputWidth - Output canvas width
 * @param {number} outputHeight - Output canvas height
 * @returns {Object} Uniform values for all shader passes
 */
export function buildUniformsFromPreset(preset, scaleFactor, outputWidth, outputHeight) {
  return {
    // Pass 1: Pixel Upscale
    upscale: {
      sourceSize: [160, 144],
      targetSize: [outputWidth, outputHeight],
      scaleFactor
    },

    // Pass 2: Unsharp Mask
    unsharp: {
      enabled: preset.unsharp.enabled,
      strength: preset.unsharp.strength,
      texelSize: [1.0 / outputWidth, 1.0 / outputHeight],
      scaleFactor
    },

    // Pass 3: Color Elevation
    color: {
      enabled: preset.color.enabled,
      gamma: preset.color.gamma,
      saturation: preset.color.saturation,
      greenBias: preset.color.greenBias,
      brightness: preset.color.brightness,
      contrast: preset.color.contrast
    },

    // Pass 4: CRT/LCD
    crt: {
      enabled: preset.crt.enabled,
      resolution: [outputWidth, outputHeight],
      scanlineStrength: preset.crt.scanlineStrength,
      pixelMaskStrength: preset.crt.pixelMaskStrength,
      bloomStrength: preset.crt.bloomStrength,
      curvature: preset.crt.curvature,
      vignetteStrength: preset.crt.vignetteStrength,
      scaleFactor
    }
  };
}
