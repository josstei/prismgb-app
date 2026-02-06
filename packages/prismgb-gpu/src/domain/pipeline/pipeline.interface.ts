import type { IPreset } from '../presets/preset.interface';
import type { IPipelineStats } from './pipeline-stats.interface';

/**
 * Core pipeline interface for GPU rendering.
 * Implementations: WebGPUPipeline, WebGL2Pipeline, Canvas2DPipeline
 */
export interface IPipeline {
  readonly isInitialized: boolean;
  readonly isActive: boolean;

  initialize(): Promise<void>;
  renderFrame(source: TexImageSource): void;
  resize(width: number, height: number): void;

  setPreset(preset: IPreset): void;
  getPreset(): IPreset;

  setBrightness(value: number): void;

  captureFrame(): Promise<ImageBitmap>;

  pause(): void;
  resume(): void;

  getStats(): IPipelineStats;

  releaseResources(): void;
  dispose(): Promise<void>;
}
