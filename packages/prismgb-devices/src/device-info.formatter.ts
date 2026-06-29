type HexFormattedValue = `0x${string}`;

export type RawDeviceInfo = {
  vendorId?: number | null;
  productId?: number | null;
  vid?: string | null;
  pid?: string | null;
  deviceName?: string | null;
  configName?: string | null;
  name?: string | null;
  deviceClass?: number | null;
  class?: number | null;
};

export type FormattedDeviceInfo = {
  vid?: HexFormattedValue;
  pid?: HexFormattedValue;
  name: string;
  class: HexFormattedValue | null;
};

function parseHexIdentifier(hexIdentifier: string | null | undefined): number | null {
  if (!hexIdentifier) return null;
  const parsedValue = Number.parseInt(hexIdentifier, 16);
  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function resolvePositiveIdentifier(
  numericIdentifier: number | null | undefined,
  hexIdentifier: string | null | undefined
): number | null {
  return typeof numericIdentifier === 'number' && Number.isFinite(numericIdentifier) && numericIdentifier > 0
    ? numericIdentifier
    : parseHexIdentifier(hexIdentifier);
}

function formatHexIdentifier(identifier: number, minimumLength = 0): HexFormattedValue {
  return `0x${identifier.toString(16).padStart(minimumLength, '0')}`;
}

function resolvePositiveClassCode(
  primaryClassCode: number | null | undefined,
  secondaryClassCode: number | null | undefined
): number | null {
  return resolvePositiveIdentifier(primaryClassCode, null)
    ?? resolvePositiveIdentifier(secondaryClassCode, null);
}

export function formatDeviceInfo(device: RawDeviceInfo): FormattedDeviceInfo {
  const vendorId = resolvePositiveIdentifier(device.vendorId, device.vid);
  const productId = resolvePositiveIdentifier(device.productId, device.pid);
  const classCode = resolvePositiveClassCode(device.deviceClass, device.class);

  const identifiers = vendorId !== null && productId !== null
    ? {
      vid: formatHexIdentifier(vendorId, 4),
      pid: formatHexIdentifier(productId, 4)
    }
    : undefined;

  return {
    ...identifiers,
    name: device.deviceName || device.configName || device.name || 'Unknown',
    class: classCode !== null ? formatHexIdentifier(classCode) : null
  };
}
