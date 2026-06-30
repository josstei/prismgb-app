import type { UpdateStateValue } from '@prismgb/config';
import type {
  DeviceInfoPayload,
  DeviceStatusPayload
} from '@prismgb/devices';

export interface IpcActionResult {
  success: boolean;
  error?: string;
}

export type { DeviceInfoPayload, DeviceStatusPayload };

export type DeviceStatusResponse = IpcActionResult & DeviceStatusPayload;

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
