/**
 * Stream View Service
 *
 * Owns video element stream attachment and cleanup.
 * Keeps streaming orchestration free of DOM manipulation.
 */

import { BaseService } from '@shared/base/service.js';

class StreamViewService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['uiController', 'loggerFactory'], 'StreamViewService');
  }

  attachStream(stream) {
    const video = this.uiController.elements.streamVideo;
    if (!video) {
      this.logger.warn('Stream video element not found');
      return;
    }

    video.srcObject = stream;
    this.logger.info('Stream assigned to video element');
  }

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
}

export { StreamViewService };
