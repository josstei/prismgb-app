/**
 * Chromatic Configuration - Browser-safe
 *
 * Pure constants for the Chromatic device.
 * No Node.js dependencies - safe for renderer process.
 */

import { DeviceManifest } from '../../device.manifest.js';

// =============================================================================
// CHROMATIC DEVICE CONFIGURATION
// =============================================================================

const CHROMATIC_MANIFEST_ENTRY = DeviceManifest.devices.find((device) => device.id === 'chromatic-mod-retro');
if (!CHROMATIC_MANIFEST_ENTRY) {
  throw new Error('Device manifest must define chromatic-mod-retro');
}

const CHROMATIC_USB = Object.freeze({
  vendorId: CHROMATIC_MANIFEST_ENTRY.usb.vendorId,
  productId: CHROMATIC_MANIFEST_ENTRY.usb.productId,
  deviceClass: CHROMATIC_MANIFEST_ENTRY.usb.deviceClass,
  alternateDeviceClass: CHROMATIC_MANIFEST_ENTRY.usb.alternateDeviceClass
});

const CHROMATIC_NATIVE = Object.freeze({
  width: CHROMATIC_MANIFEST_ENTRY.display.nativeWidth,
  height: CHROMATIC_MANIFEST_ENTRY.display.nativeHeight,
  aspectRatio: CHROMATIC_MANIFEST_ENTRY.display.aspectRatio,
  aspectRatioLabel: CHROMATIC_MANIFEST_ENTRY.display.aspectRatioLabel,
  pixelPerfect: CHROMATIC_MANIFEST_ENTRY.display.pixelPerfect
});

const RESOLUTIONS = Object.freeze(
  CHROMATIC_MANIFEST_ENTRY.display.resolutions.map((resolution) =>
    Object.freeze({ ...resolution })
  )
);

const DEVICE_LABEL_PATTERNS = Object.freeze([...CHROMATIC_MANIFEST_ENTRY.labelPatterns]);

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
  width: Object.freeze({ ...CHROMATIC_MANIFEST_ENTRY.media.video.width }),
  height: Object.freeze({ ...CHROMATIC_MANIFEST_ENTRY.media.video.height }),
  frameRate: Object.freeze({ ...CHROMATIC_MANIFEST_ENTRY.media.video.frameRate })
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
  name: CHROMATIC_MANIFEST_ENTRY.name,
  id: CHROMATIC_MANIFEST_ENTRY.id,
  manufacturer: CHROMATIC_MANIFEST_ENTRY.manufacturer,
  version: CHROMATIC_MANIFEST_ENTRY.version,

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
  capabilities: Object.freeze([...CHROMATIC_MANIFEST_ENTRY.capabilities]),

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
  fallbackStrategy: CHROMATIC_MANIFEST_ENTRY.media.fallbackStrategy
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
