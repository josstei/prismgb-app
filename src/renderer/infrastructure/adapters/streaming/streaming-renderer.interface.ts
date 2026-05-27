export type StreamingRendererCleanupOptions = {
  emitCanvasExpired?: boolean;
};

export class IStreamingRenderer {

  async initialize(_canvasElement: HTMLCanvasElement, _nativeResolution: { width: number; height: number }): Promise<boolean> {
    throw new Error('initialize() must be implemented');
  }

  async renderFrame(_videoElement: HTMLVideoElement): Promise<void> {
    throw new Error('renderFrame() must be implemented');
  }

  resize(_width: number, _height: number): void {
    throw new Error('resize() must be implemented');
  }

  isActive(): boolean {
    throw new Error('isActive() must be implemented');
  }

  pause(_videoElement: HTMLVideoElement): void {
    throw new Error('pause() must be implemented');
  }

  resume(_videoElement: HTMLVideoElement): void {
    throw new Error('resume() must be implemented');
  }

  setHiddenStateFn(_isHiddenFn: () => boolean): void {
    // no-op
  }

  cleanup(_options?: StreamingRendererCleanupOptions): void | Promise<void> {
    throw new Error('cleanup() must be implemented');
  }

  handlePipelineStop(): void {
    // no-op
  }

  supportsPresets(): boolean {
    return false;
  }

  getPresetId(): string | null {
    return null;
  }

  setPreset(_presetId: string): void {
    // no-op
  }

  isCanvasTransferred(): boolean {
    return false;
  }

  releaseGpuResources(): void {
    // no-op
  }

  terminateAndReset(_emitCanvasExpired = true): void {
    // no-op
  }
}
