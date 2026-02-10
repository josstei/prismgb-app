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
  vendor: string;
  architecture: string;
  device: string;
  description: string;
}
