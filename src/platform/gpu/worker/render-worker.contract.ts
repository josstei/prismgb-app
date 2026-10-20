export type RenderWorkerConfig = {
  nativeWidth: number;
  nativeHeight: number;
  targetWidth: number;
  targetHeight: number;
  presetId: string;
  brightness: number;
};

export type RenderWorkerRequest =
  | { type: 'init'; canvas: OffscreenCanvas; config: RenderWorkerConfig }
  | { type: 'frame'; bitmap: ImageBitmap }
  | { type: 'resize'; width: number; height: number }
  | { type: 'setPreset'; presetId: string }
  | { type: 'setBrightness'; brightness: number }
  | { type: 'capture' };

export type RenderWorkerResponse =
  | { type: 'ready' }
  | { type: 'frameRendered' }
  | { type: 'captured'; bitmap: ImageBitmap }
  | { type: 'error'; message: string };
