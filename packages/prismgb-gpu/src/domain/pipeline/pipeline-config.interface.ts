import type { IPreset } from '../presets/preset.interface';

export type RenderAPI = 'webgpu' | 'webgl2' | 'canvas2d';

export interface IPipelineConfig {
  canvas: HTMLCanvasElement;
  nativeWidth: number;
  nativeHeight: number;
  preset?: IPreset;
  preferredAPI?: RenderAPI;
  useWorker?: boolean;
}
