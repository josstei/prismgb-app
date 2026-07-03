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

export interface IpcActionResult {
  success: boolean;
  error?: string;
}

export type { DeviceInfoPayload, DeviceStatusPayload };

export type DeviceStatusResponse = IpcActionResult & DeviceStatusPayload;

export interface UpdateStatusPayload {
  state?: UpdateStateValue;
  updateInfo?: UpdateInfoPayload | null;
  downloadProgress?: UpdateProgressPayload | null;
  error?: string | UpdateErrorPayload | null;
}

export interface UpdateCheckResponse extends IpcActionResult {
  updateAvailable?: boolean;
  updateInfo?: UpdateInfoPayload;
  skipped?: boolean;
  reason?: string;
}

export type UpdateDownloadResponse = IpcActionResult;
export type UpdateInstallResponse = IpcActionResult;

export type UpdateGetStatusResponse = IpcActionResult & UpdateStatusPayload;

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

export interface TranscodeStartResponse extends IpcActionResult {
  jobId?: string;
  filePath?: string;
}

export type TranscodeCancelResponse = IpcActionResult;

export interface TranscodeStatusResponse extends IpcActionResult {
  jobs?: TranscodeJobPayload[];
}

export type WindowSetFullscreenResponse = IpcActionResult;
export interface WindowIsFullscreenResponse extends IpcActionResult {
  isFullscreen: boolean;
}
export type ShellOpenExternalResponse = IpcActionResult;

export type LoginItemSetResponse = IpcActionResult;

export interface ProcessMetricPayload {
  type: string;
  pid: number;
  memoryKB: number;
  memoryMB: string;
  peakMemoryKB: number;
  peakMemoryMB: string;
  cpuPercent: number;
}

export interface ProcessMetricsResponse extends IpcActionResult {
  timestamp: number;
  totalKB: number;
  totalMB: string;
  processCount: number;
  processes: ProcessMetricPayload[];
}
