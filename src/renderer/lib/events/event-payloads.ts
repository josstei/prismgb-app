export type Dimensions = {
  width: number;
  height: number;
};

export type RenderBackend = 'webgpu' | 'canvas2d';

export type StreamingCapabilities = {
  nativeResolution?: Dimensions;
  frameRate?: number;
  preferredBackend?: RenderBackend;
  webgpu?: boolean;
  transferControlToOffscreen?: boolean;
  offscreenCanvas?: boolean;
  worker?: boolean;
  supportsGPU?: boolean;
};

export type StreamSettingsPayload = {
  video?: Record<string, unknown> | null;
  audio?: Record<string, unknown> | null;
  [key: string]: unknown;
};

export type StreamStartedPayload = {
  stream: MediaStream;
  device: MediaDeviceInfo;
  settings: StreamSettingsPayload | null;
  capabilities: StreamingCapabilities;
  strategy?: string;
};

export type StreamErrorPayload = {
  error?: unknown;
  operation?: string;
  deviceId?: string;
  message: string;
};

export type PerformanceStatePayload = {
  hidden?: boolean;
  idle?: boolean;
  performanceModeEnabled?: boolean;
  reducedMotion?: boolean;
  weakGpuDetected?: boolean;
  streaming?: boolean;
  [key: string]: unknown;
};

export type MemorySnapshotRequestPayload = {
  reason?: string;
  label?: string;
  delayMs?: number;
  [key: string]: unknown;
};

export type SupportedDeviceAvailablePayload = {
  device: MediaDeviceInfo;
  videoDevices?: MediaDeviceInfo[];
  [key: string]: unknown;
};

export type DeviceEnumerationFailedPayload = { reason?: string; error?: string };

export type RecordingReadyPayload = { blob: Blob; filename: string };

export type RecordingErrorPayload = {
  error?: unknown;
  message?: string;
  name?: string;
  filename?: string;
  [key: string]: unknown;
};

export type RecordingDegradedPayload = {
  reason?: string;
  message?: string;
  droppedFrames?: number;
};

export type UiStatusMessagePayload = {
  message: string;
  type?: 'info' | 'success' | 'warning' | 'error' | string;
};

export type UiOverlayMessagePayload = {
  deviceConnected?: boolean;
  message?: string;
};

export type UiOverlayVisiblePayload = { visible: boolean };

export type UiOverlayErrorPayload = { message: string };

export type UiStreamingModePayload = { enabled: boolean };

export type UiStreamInfoPayload = { settings?: Record<string, unknown> };

export type UiFullscreenStatePayload = { active: boolean };

export type TranscodeStartedPayload = { jobId: string; format: string };
