/**
 * Chromatic Configuration - Browser-safe
 *
 * Pure constants for the Chromatic device.
 * No Node.js dependencies - safe for renderer process.
 */

// =============================================================================
// CHROMATIC DEVICE CONFIGURATION
// =============================================================================

const CHROMATIC_USB = Object.freeze({
  vendorId: 0x374e,  // 14158 decimal
  productId: 0x0101,  // 257 decimal
  deviceClass: 0x0E,  // Video class
  alternateDeviceClass: 0xEF  // Miscellaneous class (alternate detection)
});

const CHROMATIC_NATIVE = Object.freeze({
  width: 160,
  height: 144,
  aspectRatio: 160 / 144,  // ~1.111 (10:9)
  aspectRatioLabel: '10:9',
  pixelPerfect: true
});

const RESOLUTIONS = Object.freeze([
  Object.freeze({ label: '160x144 (Chromatic Native)', width: 160, height: 144, scale: 1 }),
  Object.freeze({ label: '320x288 (2x)', width: 320, height: 288, scale: 2 }),
  Object.freeze({ label: '640x576 (4x)', width: 640, height: 576, scale: 4 }),
  Object.freeze({ label: '1280x1152 (8x)', width: 1280, height: 1152, scale: 8 }),
  Object.freeze({ label: '1280x720 (HD)', width: 1280, height: 720, scale: null })
]);

const DEVICE_LABEL_PATTERNS = Object.freeze([
  'chromatic',
  'modretro',
  'mod retro',
  '374e:0101'  // VID:PID pattern in device label
]);

// =============================================================================
// MEDIA CONFIGURATION
// =============================================================================

const AUDIO_FULL = Object.freeze({
  echoCancellation: { exact: false },
  noiseSuppression: { exact: false },
  autoGainControl: { exact: false },
  channelCount: { ideal: 2 },
  // Note: sampleRate omitted to let browser auto-detect device's native rate
  // Specifying a rate can cause pitch/speed issues if device outputs differently
  sampleSize: { ideal: 16 }
});

const AUDIO_SIMPLE = Object.freeze({
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false
});

const VIDEO_CONFIG = Object.freeze({
  // Relaxed to avoid OverconstrainedError on some hosts: prefer native but do not require exact
  width: { ideal: CHROMATIC_NATIVE.width },
  height: { ideal: CHROMATIC_NATIVE.height },
  frameRate: { ideal: 60 }
});

// =============================================================================
// RECORDING & CAPTURE CONFIGURATION
// =============================================================================

const RECORDING_CONFIG = Object.freeze({
  screenshot: Object.freeze({
    format: 'image/png',
    prefix: 'chromatic-screenshot-',
    quality: 1.0
  }),
  recording: Object.freeze({
    format: 'video/webm',
    prefix: 'chromatic-recording-',
    codecs: Object.freeze({
      preferred: 'video/webm;codecs=vp9',
      fallback: 'video/webm;codecs=vp8'
    }),
    audioBitsPerSecond: 128000,
    videoBitsPerSecond: 2500000
  })
});

// =============================================================================
// RENDERING CONFIGURATION
// =============================================================================

const RENDERING_CONFIG = Object.freeze({
  canvasScale: 4,
  imageSmoothing: false,
  interpolation: 'nearest-neighbor',
  backgroundColor: '#0f0f1e',
  contextOptions: Object.freeze({
    alpha: false,
    desynchronized: false,
    willReadFrequently: false
  }),
  recommendedScales: Object.freeze([1, 2, 4, 8])
});

// =============================================================================
// EXPORTED CONFIGURATION
// =============================================================================

export const chromaticConfig = Object.freeze({
  // Device identification
  name: 'Mod Retro Chromatic',
  id: 'chromatic-mod-retro',
  manufacturer: 'ModRetro',
  version: '1.0.0',

  // USB identifiers
  usb: CHROMATIC_USB,

  // Display specifications
  display: Object.freeze({
    nativeWidth: CHROMATIC_NATIVE.width,
    nativeHeight: CHROMATIC_NATIVE.height,
    aspectRatio: CHROMATIC_NATIVE.aspectRatio,
    aspectRatioLabel: CHROMATIC_NATIVE.aspectRatioLabel,
    pixelPerfect: CHROMATIC_NATIVE.pixelPerfect,
    resolutions: RESOLUTIONS
  }),

  // Device capabilities
  capabilities: Object.freeze([
    'video-capture',
    'audio-capture',
    'screenshot',
    'recording',
    'pixel-perfect',
    'low-latency',
    'discord-integration'
  ]),

  // Behavior settings
  behavior: Object.freeze({
    autoLaunchDelay: 500,
    requiresStrictMode: true,
    allowFallback: false,
    reconnectDelay: 1000
  }),

  // Metadata
  metadata: Object.freeze({
    description: 'Mod Retro Chromatic - Game Boy Color compatible handheld with 160x144 display',
    website: 'https://modretro.com',
    documentation: 'https://modretro.com/chromatic',
    supportContact: 'support@modretro.com',
    labelPatterns: DEVICE_LABEL_PATTERNS
  }),

  // Rendering configuration
  rendering: RENDERING_CONFIG,

  // Capture settings
  capture: RECORDING_CONFIG
});

// Media config
export const mediaConfig = Object.freeze({
  video: VIDEO_CONFIG,
  audioFull: AUDIO_FULL,
  audioSimple: AUDIO_SIMPLE,
  resolutions: RESOLUTIONS,
  fallbackStrategy: 'audio-simple'
});

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export const chromaticHelpers = Object.freeze({
  /**
   * Check if USB device matches Chromatic identifiers
   */
  matchesUSB(usbDevice) {
    if (!usbDevice || !usbDevice.vendorId || !usbDevice.productId) {
      return false;
    }
    return usbDevice.vendorId === chromaticConfig.usb.vendorId &&
           usbDevice.productId === chromaticConfig.usb.productId;
  },

  /**
   * Check if device label matches Chromatic patterns
   */
  matchesLabel(label) {
    if (!label) return false;
    const normalizedLabel = label.toLowerCase();
    return chromaticConfig.metadata.labelPatterns.some(pattern =>
      normalizedLabel.includes(pattern)
    );
  },

  /**
   * Get resolution by scale factor
   */
  getResolutionByScale(scale) {
    const { nativeWidth, nativeHeight } = chromaticConfig.display;
    return {
      width: nativeWidth * scale,
      height: nativeHeight * scale,
      scale
    };
  }
});

