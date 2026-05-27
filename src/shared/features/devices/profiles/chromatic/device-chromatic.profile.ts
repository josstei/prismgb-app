/**
 * ChromaticProfile - Mod Retro Chromatic Device Profile
 *
 * Device profile implementation for the Chromatic handheld.
 * Provides all device-specific configuration and behavior.
 *
 * This is designed to work with the main process DeviceProfile system
 * while being self-contained within the chromatic domain.
 */

import { DeviceProfile } from '@shared/features/devices/device-profile.base.js';
import {
  chromaticConfig,
  chromaticHelpers as chromaticConfigHelpers,
  mediaConfig
} from './device-chromatic.config.js';

type DeviceProfileLogger = ConstructorParameters<typeof DeviceProfile>[1];

export class DeviceChromaticProfile extends DeviceProfile {
  constructor(logger: DeviceProfileLogger = null) {
    const profileConfig = {
      id: chromaticConfig.id,
      name: chromaticConfig.name,
      manufacturer: chromaticConfig.manufacturer,
      version: chromaticConfig.version,
      usbIdentifiers: chromaticConfig.usb.identifiers,
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

    super(profileConfig, logger);
  }

  matchesLabel(label: string | null | undefined): boolean {
    return chromaticConfigHelpers.matchesLabel(label);
  }
}
