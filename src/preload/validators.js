import { TRANSCODE_CONFIG } from '@shared/features/transcode/transcode.config.js';

const SUPPORTED_TRANSCODE_FORMATS = new Set(Object.keys(TRANSCODE_CONFIG.formats));

function isValidCallback(callback) {
  return typeof callback === 'function';
}

function isValidExternalUrl(url) {
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

function isValidUpdateInfo(info) {
  if (!info || typeof info !== 'object') return false;
  if (info.version !== undefined && typeof info.version !== 'string') return false;
  return true;
}

function isValidProgress(progress) {
  if (!progress || typeof progress !== 'object') return false;
  if (progress.percent !== undefined && typeof progress.percent !== 'number') return false;
  return true;
}

function isValidError(error) {
  if (!error || typeof error !== 'object') return false;
  return true;
}

function isValidTranscodeProgress(progress) {
  if (!progress || typeof progress !== 'object') return false;
  if (progress.percent !== undefined && typeof progress.percent !== 'number') return false;
  if (progress.timeUs !== undefined && typeof progress.timeUs !== 'number') return false;
  if (progress.elapsedMs !== undefined && typeof progress.elapsedMs !== 'number') return false;
  return true;
}

function isValidTranscodeResult(result) {
  if (!result || typeof result !== 'object') return false;
  return true;
}

function isValidTranscodeParams(buffer, format) {
  if (!(buffer instanceof ArrayBuffer)) return false;
  if (typeof format !== 'string' || format.length === 0) return false;
  if (!SUPPORTED_TRANSCODE_FORMATS.has(format.toLowerCase())) return false;
  return true;
}

function isValidFfmpegArgs(args) {
  if (!Array.isArray(args)) return false;
  return args.every(arg => typeof arg === 'string' && arg.length > 0);
}

function isValidGpuPolicy(policy) {
  if (!policy || typeof policy !== 'object') return false;
  if (typeof policy.skipWebGPU !== 'boolean') return false;
  if (policy.reason !== null && typeof policy.reason !== 'string') return false;
  return true;
}

export {
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
