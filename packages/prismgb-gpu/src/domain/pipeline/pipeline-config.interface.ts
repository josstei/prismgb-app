import type { IPreset } from '../presets/preset.interface';

export type RenderAPI = 'webgpu' | 'webgl2' | 'canvas2d';

export type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

export interface IPipelineConfig {
  canvas: RenderCanvas;
  nativeWidth: number;
  nativeHeight: number;
  preset?: IPreset;
  preferredAPI?: RenderAPI;
  useWorker?: boolean;
}
