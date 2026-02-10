export interface IPipelineStats {
  readonly fps: number;
  readonly frameTime: number;
  readonly framesRendered: number;
  readonly framesDropped: number;
  readonly gpuMemoryBytes?: number;
}
