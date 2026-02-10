import type { FrameSource } from '../frame/frame-source.interface';
import type { PipelineUniforms } from '../shaders/shader-uniforms.types';
import type { IPipelineStats } from './pipeline-stats.interface';
import type { IPipelineError } from './pipeline-error.interface';
import type { IPipelineOptions, RenderAPI } from './pipeline-config.interface';
import type { PipelineState } from './pipeline-state';
import type { IAdapterInfo } from './pipeline-error.interface';

export interface IPipeline {
  initialize(options: IPipelineOptions): Promise<void>;
  suspend(): void;
  resume(): Promise<void>;
  dispose(): void;

  renderFrame(source: FrameSource, uniforms: PipelineUniforms): void;
  resize(width: number, height: number): void;

  readonly state: PipelineState;
  readonly api: RenderAPI;
  readonly lastError: IPipelineError | null;

  getStats(): IPipelineStats;
  getAdapterInfo(): IAdapterInfo | null;
}
