import type { RenderAPI } from './pipeline-config.interface';

export type PipelineErrorCode =
  | 'DEVICE_LOST'
  | 'SHADER_ERROR'
  | 'GPU_ERROR'
  | 'CONTEXT_LOST'
  | 'INIT_FAILED'
  | 'RENDER_FAILED'
  | 'CAPTURE_FAILED';

export interface IPipelineError {
  code: PipelineErrorCode;
  message: string;
  recoverable: boolean;
  adapterInfo?: IAdapterInfo | null;
}

export interface IAdapterInfo {
  readonly vendor: string;
  readonly architecture: string;
  readonly device: string;
  readonly description: string;
  readonly api: RenderAPI;
}
