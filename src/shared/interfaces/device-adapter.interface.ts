export class IDeviceAdapter {
  async initialize(_deviceInfo: unknown): Promise<void> {
    throw new Error('initialize() must be implemented');
  }

  async getStream(_options: Record<string, unknown> = {}): Promise<MediaStream> {
    throw new Error('getStream() must be implemented');
  }

  async releaseStream(_stream: MediaStream): Promise<void> {
    throw new Error('releaseStream() must be implemented');
  }

  getCapabilities(): Record<string, unknown> {
    throw new Error('getCapabilities() must be implemented');
  }

  getProfile(): unknown {
    throw new Error('getProfile() must be implemented');
  }

  async cleanup(): Promise<void> {
    throw new Error('cleanup() must be implemented');
  }
}
