/**
 * Unified device detection helper
 * Works in both main and renderer processes.
 */

import { DeviceRegistry, type DeviceRegistryEntry, type DeviceRegistryUsb } from './device.registry.js';

interface DeviceDetectionInput {
  label?: string | null;
  vendorId?: number | null;
  productId?: number | null;
}

function matchesLabelPatterns(label: string | null | undefined, patterns: readonly string[] | undefined): boolean {
  if (!label || !patterns) return false;

  const normalizedLabel = label.toLowerCase();
  return patterns.some((pattern) => normalizedLabel.includes(pattern.toLowerCase()));
}

function matchesUSBConfig(device: DeviceDetectionInput | null | undefined, usbConfig: DeviceRegistryUsb | undefined): boolean {
  if (!device?.vendorId || !device?.productId || !usbConfig) return false;

  return device.vendorId === usbConfig.vendorId &&
         device.productId === usbConfig.productId;
}

function detectDeviceId(device: DeviceDetectionInput | null | undefined): string | null {
  if (!device) return null;

  for (const entry of DeviceRegistry.getAll()) {
    if (!entry.enabled) continue;

    if (device.label && matchesLabelPatterns(device.label, entry.labelPatterns)) {
      return entry.id;
    }

    if (matchesUSBConfig(device, entry.usb)) {
      return entry.id;
    }
  }

  return null;
}

export const DeviceDetectionHelper = {
  detectDeviceId,

  matchesByLabel(label: string | null | undefined): string | null {
    return detectDeviceId({ label });
  },

  matchesByUSB(usbDevice: DeviceDetectionInput | null | undefined): string | null {
    return detectDeviceId(usbDevice);
  }
};

export type { DeviceDetectionInput, DeviceRegistryEntry };
