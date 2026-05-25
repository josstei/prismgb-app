/**
 * Canvas Lifecycle Service
 *
 * Owns canvas creation and size management for rendering.
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import { getDefaultNativeResolution } from '@shared/features/devices/device-defaults.js';
import type { TypedEventBusLike } from '@shared/events/event-payloads.js';
import type { Dimensions } from '@renderer/infrastructure/streaming/streaming-contracts.js';
import type {
  LoggerFactoryLike,
  LoggerLike
} from '@shared/interfaces/infrastructure.types.js';

type StreamViewServiceLike = {
  getCanvas(): HTMLCanvasElement | null;
  getCanvasContainer(): HTMLElement | null;
  getCanvasSection(): HTMLElement | null;
  setCanvas(canvas: HTMLCanvasElement): void;
};

type CanvasRenderLoopServiceLike = {
  resize(canvas: HTMLCanvasElement, width: number, height: number): void;
  resetCanvasState(): Promise<void>;
};

type ViewportDimensions = Dimensions & {
  scale: number;
};

type ViewportServiceLike = {
  forceResize(): void;
  calculateDimensions(canvas: HTMLCanvasElement, nativeResolution: Dimensions): ViewportDimensions | null;
  isInitialized(): boolean;
  initialize(observeElement: HTMLElement, onResize: () => void): void;
  resetDimensions(): void;
  cleanup(): void;
};

type GpuRendererServiceLike = {
  isCanvasTransferred(): boolean;
  resize(width: number, height: number): void;
};

type CanvasLifecycleDependencies = {
  streamViewService: StreamViewServiceLike;
  canvasRenderLoopService: CanvasRenderLoopServiceLike;
  viewportService: ViewportServiceLike;
  gpuRendererService: GpuRendererServiceLike;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

class StreamingCanvasLifecycleService extends BaseService {
  declare protected readonly streamViewService: StreamViewServiceLike;
  declare protected readonly canvasRenderLoopService: CanvasRenderLoopServiceLike;
  declare protected readonly viewportService: ViewportServiceLike;
  declare protected readonly gpuRendererService: GpuRendererServiceLike;
  declare protected readonly eventBus: TypedEventBusLike;
  declare protected readonly logger: LoggerLike;

  _nativeResolution: Dimensions | null;
  _useGpuRenderer: boolean;

  constructor(dependencies: CanvasLifecycleDependencies) {
    super(
      dependencies,
      ['streamViewService', 'canvasRenderLoopService', 'viewportService', 'gpuRendererService', 'eventBus', 'loggerFactory'],
      'StreamingCanvasLifecycleService'
    );

    this._nativeResolution = null;
    this._useGpuRenderer = false;
  }

  initialize(nativeResolution?: Dimensions) {
    this.setupCanvasSize(nativeResolution);
  }

  async handleCanvasExpired() {
    await this.recreateCanvas();
    this.setupCanvasSize(this._nativeResolution, this._useGpuRenderer);
  }

  /**
   * Handle fullscreen state change - immediately resize canvas without debounce delay.
   * This prevents the visual glitch where canvas appears mispositioned during fullscreen transitions.
   */
  handleFullscreenChange(): void {
    this.viewportService.forceResize();
  }

  setupCanvasSize(nativeResolution: Dimensions | null = null, useGpu = false): void {
    const canvas = this.streamViewService.getCanvas();
    const container = this.streamViewService.getCanvasContainer();
    const section = this.streamViewService.getCanvasSection();
    if (!canvas || !container || !section) return;

    const resolution = nativeResolution || getDefaultNativeResolution();
    this._nativeResolution = resolution;
    this._useGpuRenderer = useGpu;
    const nativeAspectRatio = `${resolution.width} / ${resolution.height}`;
    if (typeof canvas.style?.setProperty === 'function') {
      canvas.style.setProperty('--stream-native-aspect-ratio', nativeAspectRatio);
    }

    const dimensions = this.viewportService.calculateDimensions(canvas, resolution);
    if (!dimensions) return;

    if (this.gpuRendererService.isCanvasTransferred()) {
      this.gpuRendererService.resize(dimensions.width, dimensions.height);
      canvas.style.width = dimensions.width + 'px';
      canvas.style.height = dimensions.height + 'px';
    } else {
      this.canvasRenderLoopService.resize(canvas, dimensions.width, dimensions.height);
    }

    if (!this.viewportService.isInitialized()) {
      this.viewportService.initialize(section, () =>
        this.setupCanvasSize(this._nativeResolution, this._useGpuRenderer)
      );
    }
  }

  async recreateCanvas(): Promise<void> {
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

    await this.canvasRenderLoopService.resetCanvasState();
    this.viewportService.resetDimensions();

    this.eventBus.publish(EventChannels.RENDER.CANVAS_RECREATED, { oldCanvas, newCanvas });

    this.logger.info('Canvas element recreated for next GPU session');
  }

  cleanup(): void {
    this.viewportService.cleanup();
  }
}

export { StreamingCanvasLifecycleService };
