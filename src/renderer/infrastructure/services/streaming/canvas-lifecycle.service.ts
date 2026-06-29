import { BaseService } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import { getDefaultNativeResolution } from '@prismgb/devices';
import type { TypedEventBusLike } from '@prismgb/events';
import type { Dimensions } from '@renderer/infrastructure/services/streaming/streaming-contracts.js';
import type {
  LoggerFactoryLike
} from '@prismgb/core';

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
  private readonly streamViewService: StreamViewServiceLike;
  private readonly canvasRenderLoopService: CanvasRenderLoopServiceLike;
  private readonly viewportService: ViewportServiceLike;
  private readonly gpuRendererService: GpuRendererServiceLike;
  protected readonly eventBus: TypedEventBusLike;

  private _nativeResolution: Dimensions | null;
  private _useGpuRenderer: boolean;

  constructor(dependencies: CanvasLifecycleDependencies) {
    super(
      dependencies,
      'StreamingCanvasLifecycleService'
    );

    this.streamViewService = dependencies.streamViewService;
    this.canvasRenderLoopService = dependencies.canvasRenderLoopService;
    this.viewportService = dependencies.viewportService;
    this.gpuRendererService = dependencies.gpuRendererService;
    this.eventBus = dependencies.eventBus;
    this._nativeResolution = null;
    this._useGpuRenderer = false;
  }

  initialize(nativeResolution?: Dimensions): void {
    this.setupCanvasSize(nativeResolution);
  }

  async handleCanvasExpired(): Promise<void> {
    await this.recreateCanvas();
    this.setupCanvasSize(this._nativeResolution, this._useGpuRenderer);
  }

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
    Array.from(oldCanvas.attributes || [])
      .filter((attribute) => attribute.name.startsWith('data-'))
      .forEach((attribute) => newCanvas.setAttribute(attribute.name, attribute.value));

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

  override dispose(): void | Promise<void> {
    this.cleanup();
    return super.dispose();
  }
}

export { StreamingCanvasLifecycleService };
