export {};

type Unsubscribe = () => void;

interface DeviceAPI {
  getDeviceStatus(): Promise<unknown>;
  onDeviceConnected(callback: (device: unknown) => void): Unsubscribe;
  onDeviceDisconnected(callback: (device: unknown) => void): Unsubscribe;
  removeDeviceListeners(): void;
}

interface UpdateAPI {
  getStatus(): Promise<unknown>;
  checkForUpdates(): Promise<unknown>;
  downloadUpdate(): Promise<unknown>;
  installUpdate(): Promise<unknown>;
  onAvailable(callback: (info: unknown) => void): Unsubscribe;
  onNotAvailable(callback: (info: unknown) => void): Unsubscribe;
  onProgress(callback: (progress: unknown) => void): Unsubscribe;
  onDownloaded(callback: (info: unknown) => void): Unsubscribe;
  onError(callback: (error: unknown) => void): Unsubscribe;
  removeListeners(): void;
}

interface TranscodeAPI {
  start(
    inputBuffer: ArrayBuffer,
    format: string,
    outputFilename?: string,
    options?: { inputArgs?: string[]; interrupted?: boolean }
  ): Promise<unknown>;
  cancel(jobId: string): Promise<unknown>;
  getStatus(): Promise<unknown>;
  onProgress(callback: (progress: unknown) => void): Unsubscribe;
  onCompleted(callback: (result: unknown) => void): Unsubscribe;
  onError(callback: (error: unknown) => void): Unsubscribe;
  onCancelled(callback: (payload: unknown) => void): Unsubscribe;
  removeListeners(): void;
}

interface WindowAPI {
  onEnterFullscreen(callback: () => void): Unsubscribe;
  onLeaveFullscreen(callback: () => void): Unsubscribe;
  onResized(callback: () => void): Unsubscribe;
  setFullScreen(enabled: boolean): Promise<unknown>;
  isFullScreen(): Promise<boolean>;
  removeListeners(): void;
}

interface ShellAPI {
  openExternal(url: string): Promise<unknown>;
}

interface MetricsAPI {
  getProcessMetrics(): Promise<unknown>;
}

interface GpuAPI {
  getPolicy(): Promise<{ skipWebGPU: boolean; reason: string | null }>;
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
