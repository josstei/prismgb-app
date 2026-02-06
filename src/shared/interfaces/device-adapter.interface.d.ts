export class IDeviceAdapter {
  initialize(_deviceInfo: unknown): Promise<void>;
  getStream(_options?: Record<string, unknown>): Promise<MediaStream>;
  releaseStream(_stream: MediaStream): Promise<void>;
  getCapabilities(): Record<string, unknown>;
  getProfile(): unknown;
  cleanup(): Promise<void>;
}
