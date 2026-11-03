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
