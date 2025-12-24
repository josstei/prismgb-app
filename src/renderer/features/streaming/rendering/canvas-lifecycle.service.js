/**
 * Canvas Lifecycle Service
 *
 * Owns canvas creation and size management for rendering.
 */

import { BaseService } from '@shared/base/service.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

class CanvasLifecycleService extends BaseService {
  constructor(dependencies) {
    super(
      dependencies,
      ['streamViewService', 'canvasRenderer', 'viewportManager', 'gpuRendererService', 'eventBus', 'loggerFactory'],
      'CanvasLifecycleService'
    );

    this._nativeResolution = null;
    this._useGpuRenderer = false;
  }

  initialize(nativeResolution) {
    this.setupCanvasSize(nativeResolution);
  }

  handleCanvasExpired() {
    this.recreateCanvas();
    this.setupCanvasSize(this._nativeResolution, this._useGpuRenderer);
  }

  /**
   * Handle fullscreen state change - immediately resize canvas without debounce delay.
   * This prevents the visual glitch where canvas appears mispositioned during fullscreen transitions.
   */
  handleFullscreenChange() {
    this.viewportManager.forceResize();
  }

  setupCanvasSize(nativeResolution = null, useGpu = false) {
    const canvas = this.streamViewService.getCanvas();
    const container = this.streamViewService.getCanvasContainer();
    const section = this.streamViewService.getCanvasSection();
    if (!canvas || !container || !section) return;

    const resolution = nativeResolution || { width: 160, height: 144 };
    this._nativeResolution = resolution;
    this._useGpuRenderer = useGpu;

    const dimensions = this.viewportManager.calculateDimensions(canvas, resolution);
    if (!dimensions) return;

    if (this.gpuRendererService.isCanvasTransferred()) {
      this.gpuRendererService.resize(dimensions.width, dimensions.height);
      canvas.style.width = dimensions.width + 'px';
      canvas.style.height = dimensions.height + 'px';
    } else {
      this.canvasRenderer.resize(canvas, dimensions.width, dimensions.height);
    }

    if (!this.viewportManager._resizeObserver) {
      this.viewportManager.initialize(section, () =>
        this.setupCanvasSize(this._nativeResolution, this._useGpuRenderer)
      );
    }
  }

  recreateCanvas() {
    const oldCanvas = this.streamViewService.getCanvas();
    if (!oldCanvas) return;

    const parent = oldCanvas.parentElement;
    if (!parent) return;

    const newCanvas = document.createElement('canvas');
    newCanvas.id = oldCanvas.id;
    newCanvas.className = oldCanvas.className;

    const computedStyle = window.getComputedStyle(oldCanvas);
    newCanvas.style.position = computedStyle.position;
    newCanvas.style.top = computedStyle.top;
    newCanvas.style.left = computedStyle.left;
    newCanvas.style.transform = computedStyle.transform;

    parent.replaceChild(newCanvas, oldCanvas);

    this.streamViewService.setCanvas(newCanvas);

    this.canvasRenderer.resetCanvasState();
    this.viewportManager.resetDimensions();

    this.eventBus.publish(EventChannels.RENDER.CANVAS_RECREATED, { oldCanvas, newCanvas });

    this.logger.info('Canvas element recreated for next GPU session');
  }

  cleanup() {
    this.viewportManager.cleanup();
  }
}

export { CanvasLifecycleService };
