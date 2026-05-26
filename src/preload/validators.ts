import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';
import { IpcContractManifest, type IpcManifest } from '@shared/ipc/ipc.manifest.js';

type PayloadValidator = (payload: unknown) => boolean;
interface PayloadValidatorMetadata {
  validatePayload: PayloadValidator;
  invalidPayloadLabel: string;
}
type PayloadValidatorMetadataByPayload = Record<string, PayloadValidatorMetadata>;

const SUPPORTED_TRANSCODE_FORMATS = new Set(Object.keys(TRANSCODE_CONFIG.formats));

function isValidCallback(callback: unknown): boolean {
  return typeof callback === 'function';
}

function isValidExternalUrl(url: unknown): boolean {
  if (typeof url !== 'string' || url.length === 0 || url.length > 2048) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return ['http:', 'https:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function hasObjectShape(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function hasOptionalFieldTypes(payload: Record<string, unknown>, fields: readonly string[], expectedType: 'number' | 'string'): boolean {
  return fields.every((field) => payload[field] === undefined || typeof payload[field] === expectedType);
}

function isValidDeviceInfo(info: unknown): boolean {
  if (!hasObjectShape(info)) return false;
  return hasOptionalFieldTypes(info, ['locationId', 'vendorId', 'productId', 'deviceAddress'], 'number')
    && hasOptionalFieldTypes(info, ['deviceName', 'manufacturer', 'serialNumber', 'configName'], 'string');
}

function isValidNullableDeviceInfo(info: unknown): boolean {
  return info === null || info === undefined || isValidDeviceInfo(info);
}

function isValidUpdateInfo(info: unknown): boolean {
  if (!hasObjectShape(info)) return false;
  if (info.version !== undefined && typeof info.version !== 'string') return false;
  return true;
}

function isValidProgress(progress: unknown): boolean {
  if (!hasObjectShape(progress)) return false;
  if (progress.percent !== undefined && typeof progress.percent !== 'number') return false;
  return true;
}

function isValidError(error: unknown): boolean {
  if (!hasObjectShape(error)) return false;
  return hasOptionalFieldTypes(error, ['message', 'code', 'jobId', 'error'], 'string');
}

function isValidTranscodeProgress(progress: unknown): boolean {
  if (!hasObjectShape(progress)) return false;
  if (typeof progress.percent !== 'number') return false;
  if (progress.jobId !== undefined && typeof progress.jobId !== 'string') return false;
  if (progress.timeUs !== undefined && typeof progress.timeUs !== 'number') return false;
  if (progress.elapsedMs !== undefined && typeof progress.elapsedMs !== 'number') return false;
  return true;
}

function isValidTranscodeResult(result: unknown): boolean {
  if (!hasObjectShape(result)) return false;
  if (!hasOptionalFieldTypes(result, ['jobId', 'outputPath'], 'string')) return false;
  if (result.filePath !== undefined && result.filePath !== null && typeof result.filePath !== 'string') return false;
  return true;
}

function isValidTranscodeCancelled(payload: unknown): boolean {
  return hasObjectShape(payload) && hasOptionalFieldTypes(payload, ['jobId'], 'string');
}

function isValidTranscodeParams(buffer: unknown, format: unknown): boolean {
  if (!(buffer instanceof ArrayBuffer)) return false;
  if (typeof format !== 'string' || format.length === 0) return false;
  if (!SUPPORTED_TRANSCODE_FORMATS.has(format.toLowerCase())) return false;
  return true;
}

function isValidFfmpegArgs(args: unknown): boolean {
  if (!Array.isArray(args)) return false;
  return args.every(arg => typeof arg === 'string' && arg.length > 0);
}

function isValidGpuPolicy(policy: unknown): boolean {
  if (!hasObjectShape(policy)) return false;
  if (typeof policy.skipWebGPU !== 'boolean') return false;
  if (policy.reason !== null && typeof policy.reason !== 'string') return false;
  return true;
}

// CODEBASE_PRELOAD_PAYLOAD_VALIDATORS:START
const payloadValidatorMetadataByPayload: PayloadValidatorMetadataByPayload = {
  DeviceInfoPayload: { validatePayload: isValidDeviceInfo, invalidPayloadLabel: 'device info' },
  'DeviceInfoPayload | null | undefined': { validatePayload: isValidNullableDeviceInfo, invalidPayloadLabel: 'device info' },
  UpdateInfoPayload: { validatePayload: isValidUpdateInfo, invalidPayloadLabel: 'update info' },
  UpdateProgressPayload: { validatePayload: isValidProgress, invalidPayloadLabel: 'progress' },
  UpdateErrorPayload: { validatePayload: isValidError, invalidPayloadLabel: 'error' },
  TranscodeProgressPayload: { validatePayload: isValidTranscodeProgress, invalidPayloadLabel: 'progress' },
  TranscodeCompletedPayload: { validatePayload: isValidTranscodeResult, invalidPayloadLabel: 'result' },
  TranscodeErrorPayload: { validatePayload: isValidError, invalidPayloadLabel: 'error' },
  TranscodeCancelledPayload: { validatePayload: isValidTranscodeCancelled, invalidPayloadLabel: 'data' }
};
// CODEBASE_PRELOAD_PAYLOAD_VALIDATORS:END

function createPayloadValidatorMetadata(apiName: string, manifest: IpcManifest = IpcContractManifest): PayloadValidatorMetadataByPayload {
  const namespace = manifest.namespaces.find((entry) => entry.apiName === apiName);
  if (!namespace) throw new Error(`IPC manifest namespace not found for preload validators "${apiName}"`);
  return Object.fromEntries((namespace.subscriptions || []).flatMap(({ payload }) => {
    if (!payload || payload === 'void') return [];
    const metadata = payloadValidatorMetadataByPayload[payload];
    if (!metadata) throw new Error(`Preload payload validator metadata missing for ${apiName}.${payload}`);
    return [[payload, metadata]];
  }));
}

export {
  createPayloadValidatorMetadata,
  isValidCallback,
  isValidExternalUrl,
  isValidUpdateInfo,
  isValidProgress,
  isValidError,
  isValidTranscodeProgress,
  isValidTranscodeResult,
  isValidTranscodeParams,
  isValidFfmpegArgs,
  isValidGpuPolicy
};
