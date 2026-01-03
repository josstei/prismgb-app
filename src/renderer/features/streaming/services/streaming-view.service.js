/**
 * Stream View Service
 *
 * Provides abstraction layer for stream-related DOM elements (video and canvas).
 * Keeps streaming orchestration free of direct DOM manipulation.
 */

import { BaseService } from '@shared/base/service.base.js';

class StreamingViewService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['uiController', 'loggerFactory'], 'StreamingViewService');
  }

  /**
   * Attaches a MediaStream to the video element.
   * @param {MediaStream} stream - The media stream to attach
   */
  attachStream(stream) {
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
  clearStream() {
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

  /**
   * Sets the muted state of the video element.
   * @param {boolean} muted - Whether the video should be muted
   */
  setMuted(muted) {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return;
    }

    video.muted = Boolean(muted);
  }

  /**
   * Gets the stream video element.
   * @returns {HTMLVideoElement|null} The video element or null if not found
   */
  getVideo() {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return null;
    }
    return video;
  }

  /**
   * Gets the stream canvas element.
   * @returns {HTMLCanvasElement|null} The canvas element or null if not found
   */
  getCanvas() {
    const canvas = this.uiController.elements.streamCanvas;
    if (!canvas) {
      this.logger.warn('Stream canvas element not found');
      return null;
    }
    return canvas;
  }

  /**
   * Gets the canvas container element (parent of canvas).
   * @returns {HTMLElement|null} The canvas container element or null if not found
   */
  getCanvasContainer() {
    const canvas = this.getCanvas();
    if (!canvas) return null;

    const container = canvas.parentElement;
    if (!container) {
      this.logger.warn('Canvas container element not found');
      return null;
    }
    return container;
  }

  /**
   * Gets the canvas section element (parent of canvas container, used for resize observer).
   * @returns {HTMLElement|null} The canvas section element or null if not found
   */
  getCanvasSection() {
    const container = this.getCanvasContainer();
    if (!container) return null;

    const section = container.parentElement;
    if (!section) {
      this.logger.warn('Canvas section element not found');
      return null;
    }
    return section;
  }

  /**
   * Updates the canvas element reference (used when canvas is recreated for WebGPU).
   * @param {HTMLCanvasElement} canvas - The new canvas element
   */
  setCanvas(canvas) {
    if (!canvas || !(canvas instanceof HTMLCanvasElement)) {
      this.logger.warn('Invalid canvas element provided to setCanvas');
      return;
    }
    this.uiController.setStreamCanvas(canvas);
    this.logger.info('Canvas element reference updated');
  }
}

export { StreamingViewService };
