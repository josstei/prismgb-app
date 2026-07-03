import type { UpdateStateValue } from '@platform/config';
import type {
  DeviceInfoPayload,
  DeviceStatusPayload
} from '@platform/devices';
import type {
  UpdateInfoPayload,
  UpdateProgressPayload,
  UpdateErrorPayload,
  TranscodeProgressPayload,
  TranscodeCompletedPayload,
  TranscodeCancelledPayload,
  TranscodeErrorPayload
} from '@platform/events';

export type {
  UpdateInfoPayload,
  UpdateProgressPayload,
  UpdateErrorPayload,
  TranscodeProgressPayload,
  TranscodeCompletedPayload,
  TranscodeCancelledPayload,
  TranscodeErrorPayload
};

export type { DeviceInfoPayload, DeviceStatusPayload };

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
