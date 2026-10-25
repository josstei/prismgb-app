import { BaseService, type LoggerFactoryLike } from '@platform/core';
import { EventChannels, type TypedEventBusLike } from '@platform/events';
import { DeviceCatalog } from '@platform/devices';
import type { Dimensions } from './streaming.contract';

type CanvasLifecycleDependencies = {
  streamViewService: {
    getCanvas(): HTMLCanvasElement | null;
    getCanvasContainer(): HTMLElement | null;
    getCanvasSection(): HTMLElement | null;
    setCanvas(canvas: HTMLCanvasElement): void;
  };
  viewportService: {
    forceResize(): void;
    calculateDimensions(canvas: HTMLCanvasElement, resolution: Dimensions): (Dimensions & { scale: number }) | null;
    isInitialized(): boolean;
    initialize(element: HTMLElement, onResize: () => void): void;
    resetDimensions(): void;
    cleanup(): void;
  };
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};

/** Owns DOM canvas replacement and sizing; rendering ownership stays with its caller. */
export class StreamingCanvasLifecycleService extends BaseService {
  private readonly deps: CanvasLifecycleDependencies;
  private resolution: Dimensions = DeviceCatalog.nativeResolution();
  private transferred = false;
  private onResize: ((dimensions: Dimensions) => void) | undefined;

  constructor(deps: CanvasLifecycleDependencies) {
    super({ loggerFactory: deps.loggerFactory, eventBus: deps.eventBus }, 'StreamingCanvasLifecycleService');
    this.deps = deps;
  }
  initialize(onResize?: (dimensions: Dimensions) => void): void {
    this.onResize = onResize;
    this.setupCanvasSize();
  }
  handleFullscreenChange(): void { this.deps.viewportService.forceResize(); }
  setupCanvasSize(resolution: Dimensions = this.resolution, transferred = false): void {
    this.resolution = resolution;
    this.transferred = transferred;
    const canvas = this.deps.streamViewService.getCanvas();
    const section = this.deps.streamViewService.getCanvasSection();
    if (!canvas || !section || !this.deps.streamViewService.getCanvasContainer()) return;
    canvas.style.setProperty('--stream-native-aspect-ratio', `${resolution.width} / ${resolution.height}`);
    const dimensions = this.deps.viewportService.calculateDimensions(canvas, resolution);
    if (!dimensions) return;
    if (!transferred) {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.round(dimensions.width * dpr);
      canvas.height = Math.round(dimensions.height * dpr);
    }
    canvas.style.width = `${dimensions.width}px`;
    canvas.style.height = `${dimensions.height}px`;
    this.onResize?.(dimensions);
    if (!this.deps.viewportService.isInitialized()) {
      this.deps.viewportService.initialize(section, () => this.setupCanvasSize(this.resolution, this.transferred));
    }
  }
  async recreateCanvas(): Promise<void> {
    const oldCanvas = this.deps.streamViewService.getCanvas();
    if (!oldCanvas?.parentElement) return;
    const newCanvas = document.createElement('canvas');
    newCanvas.id = oldCanvas.id;
    newCanvas.className = oldCanvas.className;
    for (const attribute of Array.from(oldCanvas.attributes)) {
      if (attribute.name.startsWith('data-')) newCanvas.setAttribute(attribute.name, attribute.value);
    }
    const style = window.getComputedStyle(oldCanvas);
    for (const property of ['position', 'top', 'left', 'transform'] as const) newCanvas.style[property] = style[property];
    oldCanvas.parentElement.replaceChild(newCanvas, oldCanvas);
    this.deps.streamViewService.setCanvas(newCanvas);
    this.transferred = false;
    this.deps.viewportService.resetDimensions();
    this.deps.eventBus.publish(EventChannels.RENDER.CANVAS_RECREATED, { oldCanvas, newCanvas });
  }
  cleanup(): void {
    this.onResize = undefined;
    this.deps.viewportService.cleanup();
  }
  override dispose(): void | Promise<void> { this.cleanup(); return super.dispose(); }
}
