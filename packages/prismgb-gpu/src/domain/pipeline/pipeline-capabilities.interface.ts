import type { RenderAPI } from './pipeline-config.interface';

export interface WebGPULimits {
  maxTextureDimension2D: number;
  maxBindGroups: number;
}

export interface WebGL2Info {
  renderer: string;
  vendor: string;
  maxTextureSize: number;
}

export interface IPipelineCapabilities {
  webgpu: boolean;
  webgl2: boolean;
  offscreenCanvas: boolean;
  transferControlToOffscreen: boolean;
  preferredAPI: RenderAPI;
  maxTextureSize: number;
  webgpuLimits?: WebGPULimits;
  webgl2Info?: WebGL2Info;
}
