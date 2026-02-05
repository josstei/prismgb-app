import { DeviceProfile } from '../device-profile.base';

/**
 * Chromatic USB identifiers.
 */
const CHROMATIC_USB = {
  VENDOR_ID: 0x374e,
  PRODUCT_ID: 0x0101
} as const;

/**
 * Chromatic display configuration.
 */
const CHROMATIC_DISPLAY = {
  nativeWidth: 160,
  nativeHeight: 144,
  frameRate: 60,
  aspectRatio: '10:9'
} as const;

/**
 * Device profile for Mod Retro Chromatic.
 */
export class ChromaticProfile extends DeviceProfile {
  constructor() {
    super({
      name: 'Mod Retro Chromatic',
      usbIdentifiers: [
        {
          vendorId: CHROMATIC_USB.VENDOR_ID,
          productId: CHROMATIC_USB.PRODUCT_ID
        }
      ],
      display: { ...CHROMATIC_DISPLAY },
      labelPatterns: [/chromatic/i, /mod\s*retro/i]
    });
  }
}

/**
 * Singleton instance of ChromaticProfile.
 */
export const chromaticProfile = new ChromaticProfile();
