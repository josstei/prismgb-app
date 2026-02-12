import type {
  DeviceInfoPayload,
  DeviceStatusPayload,
  GpuPolicyPayload,
  ProcessMetricsResponse,
  ShellOpenExternalResponse,
  TranscodeCancelledPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeFormat,
  TranscodeProgressPayload,
  TranscodeStartOptions,
  TranscodeStartResponse,
  TranscodeStatusResponse,
  TranscodeCancelResponse,
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateErrorPayload,
  UpdateGetStatusResponse,
  UpdateInfoPayload,
  UpdateInstallResponse,
  UpdateProgressPayload,
  WindowIsFullscreenResponse,
  WindowSetFullscreenResponse
} from '@prismgb/ipc';

export {};

type Unsubscribe = () => void;

interface DeviceAPI {
  getDeviceStatus(): Promise<DeviceStatusPayload>;
  onDeviceConnected(callback: (device: DeviceInfoPayload) => void): Unsubscribe;
  onDeviceDisconnected(callback: (device: DeviceInfoPayload | null | undefined) => void): Unsubscribe;
  removeDeviceListeners(): void;
}

interface UpdateAPI {
  getStatus(): Promise<UpdateGetStatusResponse>;
  checkForUpdates(): Promise<UpdateCheckResponse>;
  downloadUpdate(): Promise<UpdateDownloadResponse>;
  installUpdate(): Promise<UpdateInstallResponse>;
  onAvailable(callback: (info: UpdateInfoPayload) => void): Unsubscribe;
  onNotAvailable(callback: (info: UpdateInfoPayload) => void): Unsubscribe;
  onProgress(callback: (progress: UpdateProgressPayload) => void): Unsubscribe;
  onDownloaded(callback: (info: UpdateInfoPayload) => void): Unsubscribe;
  onError(callback: (error: UpdateErrorPayload) => void): Unsubscribe;
  removeListeners(): void;
}

interface TranscodeAPI {
  start(
    inputBuffer: ArrayBuffer,
    format: TranscodeFormat,
    outputFilename?: string,
    options?: TranscodeStartOptions
  ): Promise<TranscodeStartResponse>;
  cancel(jobId: string): Promise<TranscodeCancelResponse>;
  getStatus(jobId?: string): Promise<TranscodeStatusResponse>;
  onProgress(callback: (progress: TranscodeProgressPayload) => void): Unsubscribe;
  onCompleted(callback: (result: TranscodeCompletedPayload) => void): Unsubscribe;
  onError(callback: (error: TranscodeErrorPayload) => void): Unsubscribe;
  onCancelled(callback: (payload: TranscodeCancelledPayload) => void): Unsubscribe;
  removeListeners(): void;
}

interface WindowAPI {
  onEnterFullscreen(callback: () => void): Unsubscribe;
  onLeaveFullscreen(callback: () => void): Unsubscribe;
  onResized(callback: () => void): Unsubscribe;
  setFullScreen(enabled: boolean): Promise<WindowSetFullscreenResponse>;
  isFullScreen(): Promise<WindowIsFullscreenResponse>;
  removeListeners(): void;
}

interface ShellAPI {
  openExternal(url: string): Promise<ShellOpenExternalResponse>;
}

interface MetricsAPI {
  getProcessMetrics(): Promise<ProcessMetricsResponse>;
}

interface GpuAPI {
  getPolicy(): Promise<GpuPolicyPayload>;
}

declare global {
  interface Window {
    deviceAPI?: DeviceAPI;
    updateAPI?: UpdateAPI;
    transcodeAPI?: TranscodeAPI;
    windowAPI?: WindowAPI;
    shellAPI?: ShellAPI;
    metricsAPI?: MetricsAPI;
    gpuAPI?: GpuAPI;
    __app?: () => unknown;
  }

  var deviceAPI: DeviceAPI | undefined;
  var updateAPI: UpdateAPI | undefined;
  var transcodeAPI: TranscodeAPI | undefined;
  var windowAPI: WindowAPI | undefined;
  var shellAPI: ShellAPI | undefined;
  var metricsAPI: MetricsAPI | undefined;
  var gpuAPI: GpuAPI | undefined;
}
