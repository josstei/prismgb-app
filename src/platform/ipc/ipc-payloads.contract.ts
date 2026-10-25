import type { UpdateStateValue } from '@platform/config';
import type {
  DeviceStatusPayload
} from '@platform/devices';
import type {
  UpdateInfoPayload,
  UpdateProgressPayload,
  UpdateErrorPayload
} from './push-payloads.schemas.js';

export type { DeviceStatusPayload };

export interface UpdateStatusPayload {
  state?: UpdateStateValue;
  updateInfo?: UpdateInfoPayload | null;
  downloadProgress?: UpdateProgressPayload | null;
  error?: string | UpdateErrorPayload | null;
}

export interface UpdateCheckPayload {
  updateAvailable?: boolean;
  updateInfo?: UpdateInfoPayload;
  skipped?: boolean;
  reason?: string;
}

export type { TranscodeFormat } from '@platform/transcode';

export interface TranscodeStartOptions {
  inputArgs?: string[];
}

export interface TranscodeStartPayload {
  jobId: string;
}

export interface ProcessMetricPayload {
  type: string;
  pid: number;
  memoryKB: number;
  memoryMB: string;
  peakMemoryKB: number;
  peakMemoryMB: string;
  cpuPercent: number;
}

export interface ProcessMetricsPayload {
  timestamp: number;
  totalKB: number;
  totalMB: string;
  processCount: number;
  processes: ProcessMetricPayload[];
}
