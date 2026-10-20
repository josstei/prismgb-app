import { injectable, inject } from 'inversify';
import { BaseService, type LoggerFactory } from '@platform/core';
import { TOKENS } from '@renderer/application/di/tokens';

// Presentation's DomBindings narrowed to the stream elements; infrastructure may not import presentation.
type StreamElementBindings = {
  streaming: {
    streamVideo: HTMLVideoElement | null;
    streamCanvas: HTMLCanvasElement | null;
  };
};

@injectable()
class StreamingViewService extends BaseService {
  private canvas: HTMLCanvasElement | null;

  constructor(
    @inject(TOKENS.domBindings) private readonly dom: StreamElementBindings,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'StreamingViewService');
    this.canvas = dom.streaming.streamCanvas;
  }

  attachMutedStream(stream: MediaStream): void {
    const video = this.requireVideo();
    if (!video) return;

    // Audio plays through the Web Audio pipeline, so the element itself stays muted.
    video.muted = true;
    video.srcObject = stream;
    this.logger.info('Stream assigned to video element');
  }

  clearStream(): void {
    const video = this.requireVideo();
    if (!video?.srcObject) return;

    video.pause();
    video.srcObject = null;
    video.load();
    this.logger.info('Video element srcObject cleared and reset');
  }

  setMuted(muted: boolean): void {
    const video = this.requireVideo();
    if (video) {
      video.muted = Boolean(muted);
    }
  }

  getVideo(): HTMLVideoElement | null {
    return this.requireVideo();
  }

  getCanvas(): HTMLCanvasElement | null {
    if (!this.canvas) {
      this.logger.warn('Stream canvas element not found');
      return null;
    }
    return this.canvas;
  }

  getCanvasContainer(): HTMLElement | null {
    const canvas = this.getCanvas();
    if (!canvas) return null;

    const container = canvas.parentElement;
    if (!container) {
      this.logger.warn('Canvas container element not found');
      return null;
    }
    return container;
  }

  getCanvasSection(): HTMLElement | null {
    const container = this.getCanvasContainer();
    if (!container) return null;

    const section = container.parentElement;
    if (!section) {
      this.logger.warn('Canvas section element not found');
      return null;
    }
    return section;
  }

  setCanvas(canvas: HTMLCanvasElement): void {
    if (!(canvas instanceof HTMLCanvasElement)) {
      this.logger.warn('Invalid canvas element provided to setCanvas');
      return;
    }
    this.canvas = canvas;
    this.dom.streaming.streamCanvas = canvas;
    this.logger.info('Canvas element reference updated');
  }

  private requireVideo(): HTMLVideoElement | null {
    const video = this.dom.streaming.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return null;
    }
    return video;
  }
}

export { StreamingViewService };
