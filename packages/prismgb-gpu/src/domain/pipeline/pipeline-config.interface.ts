import type { IPreset } from '../presets/preset.interface';
import type { IShaderLoader } from '../shaders/shader-loader.interface';
import type { ICaptureProvider } from './capture-provider.interface';
import type { IPipelineCallbacks } from './pipeline-callbacks.interface';

export type RenderAPI = 'webgpu' | 'webgl2' | 'canvas2d';

export interface IPipelineConfig {
  readonly nativeWidth: number;
  readonly nativeHeight: number;
  readonly targetWidth: number;
  readonly targetHeight: number;
}

export interface IPipelineOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly config: IPipelineConfig;
  readonly preset?: IPreset;
  readonly shaderLoader?: IShaderLoader;
  readonly captureProvider?: ICaptureProvider;
  readonly callbacks?: IPipelineCallbacks;
}
