/**
 * Stream View Service
 *
 * Provides abstraction layer for stream-related DOM elements (video and canvas).
 * Keeps streaming orchestration free of direct DOM manipulation.
 */

import { BaseService } from '@platform/core';
import type {
  LoggerFactoryLike
} from '@platform/core';

type UiControllerLike = {
  elements: {
    streamVideo: HTMLVideoElement | null;
    streamCanvas: HTMLCanvasElement | null;
  };
  setStreamCanvas(canvas: HTMLCanvasElement): void;
};

type StreamingViewDependencies = {
  uiController: UiControllerLike;
  loggerFactory: LoggerFactoryLike;
};

class StreamingViewService extends BaseService {
  private readonly uiController: UiControllerLike;

  constructor(dependencies: StreamingViewDependencies) {
    super(dependencies, 'StreamingViewService');
    this.uiController = dependencies.uiController;
  }

  attachMutedStream(stream: MediaStream): void {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return;
    }

    // Keep video element muted; audio is handled by Web Audio pipeline.
    video.muted = true;
    video.srcObject = stream;
    this.logger.info('Stream assigned to video element');
  }

  /**
   * Clears the video element's stream and resets it.
   */
  clearStream(): void {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return;
    }

    if (video.srcObject) {
      video.pause();
      video.srcObject = null;
      video.load();
      this.logger.info('Video element srcObject cleared and reset');
    }
  }

  setMuted(muted: boolean): void {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return;
    }

    video.muted = Boolean(muted);
  }

  getVideo(): HTMLVideoElement | null {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return null;
    }
    return video;
  }

  getCanvas(): HTMLCanvasElement | null {
    const canvas = this.uiController.elements.streamCanvas;
    if (!canvas) {
      this.logger.warn('Stream canvas element not found');
      return null;
    }
    return canvas;
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
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      this.logger.warn('Invalid canvas element provided to setCanvas');
      return;
    }
    this.uiController.setStreamCanvas(canvas);
    this.logger.info('Canvas element reference updated');
  }
}

export { StreamingViewService };
