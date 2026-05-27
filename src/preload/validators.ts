import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';
import { IpcContractManifest, type IpcManifest } from '@shared/ipc/ipc.manifest.js';

type PayloadValidator = (payload: unknown) => boolean;
interface PayloadValidatorMetadata {
  validatePayload: PayloadValidator;
  invalidPayloadLabel: string;
}
type PayloadValidatorMetadataByPayload = Record<string, PayloadValidatorMetadata>;
type PreloadSubscriptionPayloadValidatorMetadata = { name: string; invalidPayloadLabel: string };
type PreloadSubscriptionManifestEntry = { method?: string; factoryMethod?: string; payload?: string; preload?: { payloadValidator?: PreloadSubscriptionPayloadValidatorMetadata } };
type PreloadInvokeArgumentValidatorName = 'external-url' | 'boolean-argument' | 'transcode-start-params' | 'ffmpeg-input-args' | 'transcode-job-id';
type PreloadInvokeResponsePolicyName = 'catch-fallback' | 'gpu-policy';
type PreloadInvokeArgumentValidatorMetadata = { name: string; invalidMessage: string; fallback: unknown };
type PreloadInvokeResponsePolicyMetadata = { name: string; failureMessage?: string; invalidMessage?: string; fallback: unknown };
type PreloadInvokeMetadata = { argumentValidators?: readonly PreloadInvokeArgumentValidatorMetadata[]; responsePolicy?: PreloadInvokeResponsePolicyMetadata };
type PreloadInvokeManifestEntry = { preload?: PreloadInvokeMetadata };
type PreloadInvokeArgumentValidationFailure<TResult> = { invalidMessage: string; fallback: TResult };
type PreloadResponsePolicyFailure = { message: string; detail?: unknown };
type PreloadInvokeArgumentValidatorExpectationByMethod = Record<string, readonly PreloadInvokeArgumentValidatorName[]>;

const SUPPORTED_TRANSCODE_FORMATS = new Set(Object.keys(TRANSCODE_CONFIG.formats));

function isValidCallback(callback: unknown): boolean { return typeof callback === 'function'; }

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

function hasObjectShape(value: unknown): value is Record<string, unknown> { return Boolean(value && typeof value === 'object' && !Array.isArray(value)); }

function hasOptionalFieldTypes(payload: Record<string, unknown>, fields: readonly string[], expectedType: 'number' | 'string'): boolean { return fields.every((field) => payload[field] === undefined || typeof payload[field] === expectedType); }

function isValidDeviceInfo(info: unknown): boolean {
  if (!hasObjectShape(info)) return false;
  return hasOptionalFieldTypes(info, ['locationId', 'vendorId', 'productId', 'deviceAddress'], 'number')
    && hasOptionalFieldTypes(info, ['deviceName', 'manufacturer', 'serialNumber', 'configName'], 'string');
}

function isValidNullableDeviceInfo(info: unknown): boolean { return info === null || info === undefined || isValidDeviceInfo(info); }

function isValidUpdateInfo(info: unknown): boolean { return hasObjectShape(info) && (info.version === undefined || typeof info.version === 'string'); }

function isValidProgress(progress: unknown): boolean { return hasObjectShape(progress) && (progress.percent === undefined || typeof progress.percent === 'number'); }

function isValidError(error: unknown): boolean { return hasObjectShape(error) && hasOptionalFieldTypes(error, ['message', 'code', 'jobId', 'error'], 'string'); }

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

function isValidFfmpegArgs(args: unknown): boolean { return Array.isArray(args) && args.every(arg => typeof arg === 'string' && arg.length > 0); }

function isValidGpuPolicy(policy: unknown): boolean {
  if (!hasObjectShape(policy)) return false;
  if (typeof policy.skipWebGPU !== 'boolean') return false;
  if (policy.reason !== null && typeof policy.reason !== 'string') return false;
  return true;
}

function isValidIpcFailureResult(result: unknown): boolean { return hasObjectShape(result) && result.success === false && typeof result.error === 'string' && result.error.length > 0; }

const preloadInvokeArgumentValidators: Record<PreloadInvokeArgumentValidatorName, (...args: unknown[]) => boolean> = {
  'external-url': (url: unknown) => isValidExternalUrl(url),
  'boolean-argument': (enabled: unknown) => typeof enabled === 'boolean',
  'transcode-start-params': (buffer: unknown, format: unknown) => isValidTranscodeParams(buffer, format),
  'ffmpeg-input-args': (_buffer: unknown, _format: unknown, _outputFilename: unknown, options: unknown) => {
    const inputArgs = hasObjectShape(options) ? options.inputArgs : undefined;
    return inputArgs === undefined || isValidFfmpegArgs(inputArgs);
  },
  'transcode-job-id': (jobId: unknown) => typeof jobId === 'string' && jobId.length > 0
};
const preloadInvokeFallbackValidators: Record<PreloadInvokeArgumentValidatorName, (fallback: unknown) => boolean> = {
  'external-url': isValidIpcFailureResult,
  'boolean-argument': isValidIpcFailureResult,
  'transcode-start-params': isValidIpcFailureResult,
  'ffmpeg-input-args': isValidIpcFailureResult,
  'transcode-job-id': isValidIpcFailureResult
};
const preloadResponsePolicyFallbackValidators: Record<PreloadInvokeResponsePolicyName, (fallback: unknown) => boolean> = { 'catch-fallback': (fallback) => typeof fallback === 'boolean', 'gpu-policy': isValidGpuPolicy };

function isPreloadInvokeArgumentValidatorName(name: string): name is PreloadInvokeArgumentValidatorName {
  return Object.prototype.hasOwnProperty.call(preloadInvokeArgumentValidators, name);
}

function isPreloadInvokeResponsePolicyName(name: string): name is PreloadInvokeResponsePolicyName {
  return name === 'catch-fallback' || name === 'gpu-policy';
}

function assertNonEmptyString(value: unknown, label: string, apiName: string, methodName: string): asserts value is string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${label} missing for ${apiName}.${methodName}`);
}

function assertValidPreloadInvokeArgumentValidator(apiName: string, methodName: string, validator: unknown): asserts validator is PreloadInvokeArgumentValidatorMetadata {
  if (!hasObjectShape(validator)) throw new Error(`Preload invoke validator metadata invalid for ${apiName}.${methodName}`);
  assertNonEmptyString(validator.name, 'Preload invoke validator name', apiName, methodName);
  if (!isPreloadInvokeArgumentValidatorName(validator.name)) throw new Error(`Unknown preload invoke validator "${validator.name}" for ${apiName}.${methodName}`);
  assertNonEmptyString(validator.invalidMessage, `Preload invoke validator "${validator.name}" message`, apiName, methodName);
  if (!preloadInvokeFallbackValidators[validator.name](validator.fallback)) throw new Error(`Preload invoke validator "${validator.name}" fallback invalid for ${apiName}.${methodName}`);
}

function assertValidPreloadResponsePolicy(apiName: string, methodName: string, policy: unknown): asserts policy is PreloadInvokeResponsePolicyMetadata {
  if (!hasObjectShape(policy)) throw new Error(`Preload response policy metadata invalid for ${apiName}.${methodName}`);
  assertNonEmptyString(policy.name, 'Preload response policy name', apiName, methodName);
  if (!isPreloadInvokeResponsePolicyName(policy.name)) throw new Error(`Unknown preload response policy "${policy.name}" for ${apiName}.${methodName}`);
  if (policy.name === 'gpu-policy') { assertNonEmptyString(policy.failureMessage, 'Preload response policy failure message', apiName, methodName); assertNonEmptyString(policy.invalidMessage, 'Preload response policy invalid message', apiName, methodName); }
  if (!preloadResponsePolicyFallbackValidators[policy.name](policy.fallback)) throw new Error(`Preload response policy "${policy.name}" fallback invalid for ${apiName}.${methodName}`);
}

// CODEBASE_PRELOAD_INVOKE_ARGUMENT_VALIDATORS:START
const preloadInvokeArgumentValidatorNamesByMethod = {
  'shellAPI.openExternal': ['external-url'],
  'gpuAPI.getPolicy': [],
  'loginItemAPI.get': [],
  'loginItemAPI.set': ['boolean-argument'],
  'transcodeAPI.start': ['transcode-start-params', 'ffmpeg-input-args'],
  'transcodeAPI.cancel': ['transcode-job-id']
} as const satisfies PreloadInvokeArgumentValidatorExpectationByMethod;
// CODEBASE_PRELOAD_INVOKE_ARGUMENT_VALIDATORS:END

function getExpectedPreloadInvokeArgumentValidators(apiName: string, methodName: string): readonly PreloadInvokeArgumentValidatorName[] {
  const key = `${apiName}.${methodName}`;
  const expected = (preloadInvokeArgumentValidatorNamesByMethod as PreloadInvokeArgumentValidatorExpectationByMethod)[key];
  if (!expected) throw new Error(`Preload invoke validator expectation missing for ${key}`);
  return expected;
}

function requirePreloadInvokeMetadata(apiName: string, methodName: string, manifestEntry: PreloadInvokeManifestEntry): PreloadInvokeMetadata {
  const metadata = manifestEntry.preload;
  if (!hasObjectShape(metadata)) throw new Error(`Preload invoke metadata missing for ${apiName}.${methodName}`);
  if (metadata.argumentValidators !== undefined && !Array.isArray(metadata.argumentValidators)) throw new Error(`Preload invoke validators invalid for ${apiName}.${methodName}`);
  const argumentValidators = Array.isArray(metadata.argumentValidators) ? metadata.argumentValidators : [];
  for (const validator of argumentValidators) assertValidPreloadInvokeArgumentValidator(apiName, methodName, validator);
  const expectedArgumentValidators = getExpectedPreloadInvokeArgumentValidators(apiName, methodName);
  const actualNames = argumentValidators.map((validator) => validator.name), missing = expectedArgumentValidators.filter((name) => !actualNames.includes(name)), extra = actualNames.filter((name) => !expectedArgumentValidators.includes(name as PreloadInvokeArgumentValidatorName));
  if (missing.length || extra.length) throw new Error(`Preload invoke validators do not match ${apiName}.${methodName}: ${[missing.length ? `missing ${missing.join(', ')}` : '', extra.length ? `extra ${extra.join(', ')}` : ''].filter(Boolean).join('; ')}`);
  if (metadata.responsePolicy !== undefined) assertValidPreloadResponsePolicy(apiName, methodName, metadata.responsePolicy);
  return metadata as PreloadInvokeMetadata;
}

function validatePreloadInvokeArguments<TResult>(metadata: PreloadInvokeMetadata, args: readonly unknown[]): PreloadInvokeArgumentValidationFailure<TResult> | null {
  for (const validator of metadata.argumentValidators || []) if (isPreloadInvokeArgumentValidatorName(validator.name) && !preloadInvokeArgumentValidators[validator.name](...args)) return { invalidMessage: validator.invalidMessage, fallback: validator.fallback as TResult };
  return null;
}

function requirePreloadResponsePolicy<TResult>(metadata: PreloadInvokeMetadata): PreloadInvokeResponsePolicyMetadata & { fallback: TResult } {
  if (!metadata.responsePolicy) throw new Error('Preload response policy metadata missing');
  return metadata.responsePolicy as PreloadInvokeResponsePolicyMetadata & { fallback: TResult };
}

function getPreloadResponsePolicyFailure(policy: PreloadInvokeResponsePolicyMetadata, result: unknown): PreloadResponsePolicyFailure | null {
  if (policy.name !== 'gpu-policy') return null;
  if (!hasObjectShape(result) || result.success !== true) return { message: policy.failureMessage || 'Preload response policy failed', detail: hasObjectShape(result) ? result.error : undefined };
  if (!isValidGpuPolicy(result)) return { message: policy.invalidMessage || 'Invalid preload response received' };
  return null;
}

function mapPreloadResponsePolicyResult<TResult>(policy: PreloadInvokeResponsePolicyMetadata, result: unknown): TResult {
  if (policy.name !== 'gpu-policy') return result as TResult;
  const policyResult = result as { skipWebGPU: boolean; reason: string | null };
  return { skipWebGPU: policyResult.skipWebGPU, reason: policyResult.reason } as TResult;
}

// CODEBASE_PRELOAD_PAYLOAD_VALIDATORS:START
const preloadPayloadValidators = {
  'device-info': isValidDeviceInfo,
  'nullable-device-info': isValidNullableDeviceInfo,
  'update-info': isValidUpdateInfo,
  'update-progress': isValidProgress,
  'update-error': isValidError,
  'transcode-progress': isValidTranscodeProgress,
  'transcode-completed': isValidTranscodeResult,
  'transcode-error': isValidError,
  'transcode-cancelled': isValidTranscodeCancelled
} as const satisfies Record<string, PayloadValidator>;
type PreloadSubscriptionPayloadValidatorName = keyof typeof preloadPayloadValidators;
// CODEBASE_PRELOAD_PAYLOAD_VALIDATORS:END

function isPreloadSubscriptionPayloadValidatorName(name: string): name is PreloadSubscriptionPayloadValidatorName {
  return Object.prototype.hasOwnProperty.call(preloadPayloadValidators, name);
}

function getPreloadSubscriptionMethodName(subscription: PreloadSubscriptionManifestEntry): string {
  return typeof subscription.factoryMethod === 'string' && subscription.factoryMethod.trim() ? subscription.factoryMethod.trim() : typeof subscription.method === 'string' ? subscription.method.trim() : '';
}

function requirePreloadSubscriptionPayloadValidatorMetadata(apiName: string, methodName: string, subscription: PreloadSubscriptionManifestEntry): PayloadValidatorMetadata {
  const metadata = subscription.preload?.payloadValidator;
  if (!hasObjectShape(metadata)) throw new Error(`Preload payload validator metadata missing for ${apiName}.${methodName}`);
  assertNonEmptyString(metadata.name, 'Preload payload validator name', apiName, methodName);
  if (!isPreloadSubscriptionPayloadValidatorName(metadata.name)) throw new Error(`Unknown preload payload validator "${metadata.name}" for ${apiName}.${methodName}`);
  assertNonEmptyString(metadata.invalidPayloadLabel, `Preload payload validator "${metadata.name}" label`, apiName, methodName);
  return { validatePayload: preloadPayloadValidators[metadata.name], invalidPayloadLabel: metadata.invalidPayloadLabel };
}

function createPayloadValidatorMetadata(apiName: string, manifest: IpcManifest = IpcContractManifest): PayloadValidatorMetadataByPayload {
  const namespace = manifest.namespaces.find((entry) => entry.apiName === apiName);
  if (!namespace) throw new Error(`IPC manifest namespace not found for preload validators "${apiName}"`);
  const metadataByPayload: PayloadValidatorMetadataByPayload = {};
  for (const subscription of namespace.subscriptions || []) {
    const manifestEntry = subscription as PreloadSubscriptionManifestEntry;
    const payload = manifestEntry.payload;
    if (!payload || payload === 'void') continue;
    const methodName = getPreloadSubscriptionMethodName(manifestEntry);
    const metadata = requirePreloadSubscriptionPayloadValidatorMetadata(apiName, methodName, manifestEntry);
    const existingMetadata = metadataByPayload[payload];
    if (existingMetadata && (existingMetadata.validatePayload !== metadata.validatePayload || existingMetadata.invalidPayloadLabel !== metadata.invalidPayloadLabel)) throw new Error(`Preload payload validator metadata mismatch for ${apiName}.${payload}`);
    metadataByPayload[payload] = metadata;
  }
  return metadataByPayload;
}

export {
  createPayloadValidatorMetadata,
  isValidCallback,
  isValidUpdateInfo,
  isValidProgress,
  isValidError,
  isValidTranscodeProgress,
  isValidTranscodeResult,
  requirePreloadInvokeMetadata,
  validatePreloadInvokeArguments,
  requirePreloadResponsePolicy,
  getPreloadResponsePolicyFailure,
  mapPreloadResponsePolicyResult
};
export type { PreloadInvokeManifestEntry, PreloadInvokeMetadata };
