import type {
  Dimensions,
  PerformanceStatePayload,
  RecordingDegradedPayload,
  RecordingErrorPayload,
  RecordingReadyPayload,
  StreamStartedPayload,
  StreamingCapabilities,
  SupportedDeviceAvailablePayload
} from '@platform/events';
import { isRecord } from '@platform/core';

export type {
  Dimensions,
  NativeResolution,
  PerformanceStatePayload,
  RecordingDegradedPayload,
  RecordingErrorPayload,
  RecordingReadyPayload,
  StreamHealthOkPayload,
  StreamHealthTimeoutPayload,
  StreamStartedPayload,
  StreamingCapabilities,
  SupportedDeviceAvailablePayload
} from '@platform/events';

export type GpuRendererServiceLike = {
  isActive(): boolean;
  isFallback(): boolean;
  isCanvasTransferred(): boolean;
  getTargetDimensions(): Dimensions;
  captureFrame(): Promise<ImageBitmap>;
};

export type GpuRecordingStartOptions = {
  stream: MediaStream;
  frameRate?: number;
};

export type RecordingScaleParams = {
  scale: number;
  drawWidth: number;
  drawHeight: number;
  offsetX: number;
  offsetY: number;
  needsClearing: boolean;
};

function hasNumber(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'number' && Number.isFinite(value[key]);
}

function hasString(value: Record<string, unknown>, key: string): boolean {
  return typeof value[key] === 'string';
}

function isBlobLike(value: unknown): value is Blob {
  return (
    typeof Blob !== 'undefined' &&
    value instanceof Blob
  ) || (
    isRecord(value) &&
    typeof value.size === 'number' &&
    typeof value.type === 'string'
  );
}

export function isDimensions(value: unknown): value is Dimensions {
  return isRecord(value) && hasNumber(value, 'width') && hasNumber(value, 'height');
}

export function isStreamingCapabilities(value: unknown): value is StreamingCapabilities {
  if (!isRecord(value)) {
    return false;
  }

  return value.nativeResolution === undefined || isDimensions(value.nativeResolution);
}

export function isPerformanceStatePayload(value: unknown): value is PerformanceStatePayload {
  return isRecord(value);
}

export function isStreamStartedPayload(value: unknown): value is StreamStartedPayload {
  return (
    isRecord(value) &&
    (value.settings === null || isRecord(value.settings)) &&
    isStreamingCapabilities(value.capabilities) &&
    isRecord(value.stream) &&
    isRecord(value.device)
  );
}

export function isSupportedDeviceAvailablePayload(
  value: unknown
): value is SupportedDeviceAvailablePayload {
  return isRecord(value) && isRecord(value.device);
}

export function isRecordingReadyPayload(value: unknown): value is RecordingReadyPayload {
  return isRecord(value) && isBlobLike(value.blob) && hasString(value, 'filename');
}

export function isRecordingErrorPayload(value: unknown): value is RecordingErrorPayload {
  return isRecord(value);
}

export function isRecordingDegradedPayload(value: unknown): value is RecordingDegradedPayload {
  return (
    isRecord(value) &&
    (
      hasString(value, 'reason') ||
      hasString(value, 'message') ||
      hasNumber(value, 'droppedFrames')
    )
  );
}
