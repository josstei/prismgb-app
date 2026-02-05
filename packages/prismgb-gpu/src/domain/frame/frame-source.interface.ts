export type FrameSource = HTMLVideoElement | HTMLCanvasElement | ImageBitmap | OffscreenCanvas;

export interface IFrameProvider {
  getCurrentFrame(): FrameSource | null;
  onFrame(callback: (source: FrameSource) => void): () => void;
}
