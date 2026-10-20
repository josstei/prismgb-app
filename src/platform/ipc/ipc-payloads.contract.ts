import type { UpdateStateValue } from '@platform/config';
import type {
  DeviceInfoPayload,
  DeviceStatusPayload
} from '@platform/devices';

export type { DeviceInfoPayload, DeviceStatusPayload };

export interface UpdateInfoPayload {
  version?: string;
  releaseDate?: string;
  releaseNotes?: unknown;
  reason?: string;
}

export interface UpdateProgressPayload {
  percent?: number;
  bytesPerSecond?: number;
  transferred?: number;
  total?: number;
}

export interface UpdateErrorPayload {
  message?: string;
  code?: string;
}

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

export type TranscodeFormat = 'webm' | 'mp4' | 'mov';

export interface TranscodeStartOptions {
  inputArgs?: string[];
  interrupted?: boolean;
}

export interface TranscodeProgressPayload {
  jobId?: string;
  percent: number;
  timeUs?: number;
  elapsedMs?: number;
}

export interface TranscodeCompletedPayload {
  jobId?: string;
  filePath?: string | null;
  outputPath?: string;
}

export interface TranscodeCancelledPayload {
  jobId?: string;
}

export interface TranscodeErrorPayload {
  jobId?: string;
  error?: string;
  message?: string;
}

export interface TranscodeJobPayload {
  id: string;
  state: string;
  progress: number;
  outputPath: string | null;
  error: string | null;
  startTime: number;
}

export interface TranscodeStartPayload {
  jobId?: string;
  filePath?: string;
}

export interface TranscodeStatusPayload {
  jobs: TranscodeJobPayload[];
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
