import type {
  Dimensions,
  StreamingCapabilities
} from '@platform/events';
import { isRecord } from '@platform/core';

export type {
  Dimensions,
  PerformanceStatePayload,
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

export function isDimensions(value: unknown): value is Dimensions {
  return isRecord(value) && hasNumber(value, 'width') && hasNumber(value, 'height');
}

export function isStreamingCapabilities(value: unknown): value is StreamingCapabilities {
  if (!isRecord(value)) {
    return false;
  }

  return value.nativeResolution === undefined || isDimensions(value.nativeResolution);
}
