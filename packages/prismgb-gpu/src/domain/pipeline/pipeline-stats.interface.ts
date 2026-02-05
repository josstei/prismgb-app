export interface IPipelineStats {
  fps: number;
  frameTime: number;
  gpuTime?: number;
  framesRendered: number;
  framesDropped: number;
}
