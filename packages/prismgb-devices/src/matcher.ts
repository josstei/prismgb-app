import { DeviceCatalog } from './catalog.js';
import type {
  DeviceDescriptor,
  DeviceMatch,
  DeviceMatchReason,
  ObservedMediaDevice,
  ObservedUsbDevice
} from './contracts.js';

type MatchableDevice = ObservedUsbDevice | ObservedMediaDevice;

function noMatch(reason: DeviceMatchReason = 'none'): DeviceMatch {
  return {
    matched: false,
    deviceId: null,
    descriptor: null,
    reason,
    confidence: 0
  };
}

function createMatch(descriptor: DeviceDescriptor, reason: Exclude<DeviceMatchReason, 'none'>, confidence: number): DeviceMatch {
  return {
    matched: true,
    deviceId: descriptor.id,
    descriptor,
    reason,
    confidence
  };
}

function hasUsbIdentifiers(input: MatchableDevice): input is ObservedUsbDevice {
  return 'vendorId' in input &&
    'productId' in input &&
    Number.isFinite(input.vendorId) &&
    Number.isFinite(input.productId);
}

function normalizeLabel(label: string | null | undefined): string {
  return label?.trim().toLowerCase() ?? '';
}

export function matchByUsb(input: ObservedUsbDevice | null | undefined): DeviceMatch {
  if (!input || !Number.isFinite(input.vendorId) || !Number.isFinite(input.productId)) {
    return noMatch('usb');
  }

  const descriptor = DeviceCatalog.enabled().find((candidate) =>
    candidate.usb.vendorId === input.vendorId &&
    candidate.usb.productId === input.productId
  );

  return descriptor ? createMatch(descriptor, 'usb', 1) : noMatch('usb');
}

export function matchByLabel(label: string | null | undefined): DeviceMatch {
  const normalizedLabel = normalizeLabel(label);
  if (!normalizedLabel) {
    return noMatch('label');
  }

  const descriptor = DeviceCatalog.enabled().find((candidate) =>
    candidate.labelPatterns.some((pattern) => normalizedLabel.includes(pattern.toLowerCase()))
  );

  return descriptor ? createMatch(descriptor, 'label', 0.75) : noMatch('label');
}

export function matchDevice(input: MatchableDevice | null | undefined): DeviceMatch {
  if (!input) {
    return noMatch();
  }

  if (hasUsbIdentifiers(input)) {
    return matchByUsb(input);
  }

  return matchByLabel(input.label);
}
