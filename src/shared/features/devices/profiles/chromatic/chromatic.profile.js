/**
 * ChromaticProfile - Mod Retro Chromatic Device Profile
 *
 * Device profile implementation for the Chromatic handheld.
 * Provides all device-specific configuration and behavior.
 *
 * This is designed to work with the main process DeviceProfile system
 * while being self-contained within the chromatic domain.
 */

import { DeviceProfile } from '@shared/features/devices/device-profile.js';
import { chromaticConfig, chromaticHelpers as chromaticConfigHelpers, mediaConfig } from './chromatic.config.js';

export class ChromaticProfile extends DeviceProfile {
  constructor(logger = null) {
    // Build configuration for base DeviceProfile
    const profileConfig = {
      id: chromaticConfig.id,
      name: chromaticConfig.name,
      manufacturer: chromaticConfig.manufacturer,
      version: chromaticConfig.version,
      usbIdentifiers: [
        {
          vendorId: chromaticConfig.usb.vendorId,
          productId: chromaticConfig.usb.productId,
          deviceClass: chromaticConfig.usb.deviceClass
        },
        {
          vendorId: chromaticConfig.usb.vendorId,
          productId: chromaticConfig.usb.productId,
          deviceClass: chromaticConfig.usb.alternateDeviceClass
        }
      ],
      display: {
        nativeResolution: {
          width: chromaticConfig.display.nativeWidth,
          height: chromaticConfig.display.nativeHeight
        },
        supportedResolutions: mediaConfig.resolutions,
        aspectRatio: chromaticConfig.display.aspectRatio,
        pixelPerfect: chromaticConfig.display.pixelPerfect
      },
      media: {
        video: mediaConfig.video,
        audio: {
          full: mediaConfig.audioFull,
          simple: mediaConfig.audioSimple
        },
        fallbackStrategy: mediaConfig.fallbackStrategy
      },
      capabilities: chromaticConfig.capabilities,
      rendering: chromaticConfig.rendering,
      behavior: chromaticConfig.behavior,
      metadata: chromaticConfig.metadata
    };

    // Call parent constructor
    super(profileConfig, logger);
  }

  /**
   * Check if device label matches Chromatic patterns
   * @param {string} label - Device label
   * @returns {boolean} True if label matches Chromatic
   */
  matchesLabel(label) {
    return chromaticConfigHelpers.matchesLabel(label);
  }
}
