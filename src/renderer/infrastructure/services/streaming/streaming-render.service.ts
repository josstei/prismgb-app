
import { BaseService } from '@platform/core';
import { EventChannels } from '@platform/events';
import { DeviceCatalog } from '@platform/devices';
import { getErrorMessage } from '@platform/core';
import type { TypedEventBusLike } from '@platform/events';
import type { LoggerFactoryLike } from '@platform/core';
import type {
  Dimensions,
  StreamingCapabilities
} from '@renderer/infrastructure/services/streaming/streaming.contract.js';
import { createGpuVideoRendererSession, detectBrowserGpuCapabilities } from '@platform/gpu/runtime';
import type { GpuVideoRendererSession } from '@platform/gpu/runtime';
import { PRESET_POLICY, type RenderCapabilities } from '@platform/gpu';
import type { SettingsAccess } from '@renderer/lib/settings.definitions';

type DimensionsCallback = (dimensions: Dimensions) => void;
type CanvasLifecycle = {
  initialize(onResize?: DimensionsCallback): void;
  handleFullscreenChange(): void;
  setupCanvasSize(nativeResolution?: Dimensions, transferred?: boolean): void;
  recreateCanvas(): Promise<void>;
  cleanup(): void;
};
type StreamHealth = {
  checkStreamHealth(video: HTMLVideoElement, onHealthy: (data: Record<string, unknown>) => void, onTimeout: (data: { reason: string; [key: string]: unknown }) => void, timeoutMs: number): void;
  cleanup(): void;
};
type StreamingRenderServiceDependencies = {
  appState: { isStreaming: boolean };
  streamViewService: { getVideo(): HTMLVideoElement | null; getCanvas(): HTMLCanvasElement | null };
  canvasLifecycleService: CanvasLifecycle;
  streamHealthService: StreamHealth;
  settingsService: Pick<SettingsAccess, 'getSetting'>;
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
};
const BRIGHTNESS_SUBSCRIPTION = Symbol('render-brightness');
type Backend = GpuVideoRendererSession['backend'];

/** Owns render sessions, transferred canvases and their serialized transitions. */
export class StreamingRenderService extends BaseService {
  private session: GpuVideoRendererSession | null = null;
  private capabilities: StreamingCapabilities | null = null;
  private gpuCapabilities: RenderCapabilities | null = null;
  private hidden = false;
  private performanceMode = false;
  private userPreset = PRESET_POLICY.rendererDefaultId as string;
  private brightness = 1;
  private canvasUsed = false;
  private transition = Promise.resolve();
  private transitionAbort: AbortController | null = null;
  private frameHandle: number | null = null;
  private frameVideo: HTMLVideoElement | null = null;
  private loopGeneration = 0;
  private readonly deps: StreamingRenderServiceDependencies;

  constructor(deps: StreamingRenderServiceDependencies) {
    super({ loggerFactory: deps.loggerFactory, eventBus: deps.eventBus }, 'StreamingRenderService');
    this.deps = deps;
  }
  initialize(): void {
    this.deps.canvasLifecycleService.initialize(({ width, height }) => this.session?.resize(width, height));
    this.brightness = this.deps.settingsService.getSetting('globalBrightness');
    this.userPreset = this.deps.settingsService.getSetting('renderPreset');
    this.disposables.replace(BRIGHTNESS_SUBSCRIPTION, this.deps.eventBus.subscribe(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, (brightness) => {
      if (!Number.isFinite(brightness)) return;
      this.brightness = brightness;
      this.session?.setBrightness(brightness);
    }));
  }
  handlePerformanceStateChanged(state: unknown): void {
    const hidden = (state as { hidden?: unknown } | null)?.hidden;
    if (typeof hidden !== 'boolean' || hidden === this.hidden) return;
    this.hidden = hidden;
    if (hidden) this.stopRenderLoop();
    else if (this.deps.appState.isStreaming && this.session) this.startRenderLoop();
  }
  handleRenderPresetChanged(presetId: string): void {
    this.userPreset = presetId;
    if (!this.performanceMode) this.session?.setPreset(presetId);
  }
  handleFullscreenChange(): void { this.deps.canvasLifecycleService.handleFullscreenChange(); }
  async handlePerformanceModeChanged(enabled: boolean): Promise<void> {
    if (enabled === this.performanceMode) return;
    this.performanceMode = enabled;
    if (this.capabilities && this.deps.appState.isStreaming) await this.replaceSession(false);
    else if (this.session) await this.stopPipeline();
  }
  async startPipeline(capabilities: StreamingCapabilities): Promise<void> {
    this.capabilities = capabilities;
    this.userPreset = this.deps.settingsService.getSetting('renderPreset');
    await this.replaceSession(true);
    if (!this.session) throw new DOMException('Rendering startup superseded', 'AbortError');
  }
  stopPipeline(): Promise<void> {
    this.capabilities = null;
    this.transitionAbort?.abort();
    this.stopRenderLoop();
    this.session?.terminate();
    this.session = null;
    return this.replaceSession(false);
  }
  private replaceSession(checkHealth: boolean): Promise<void> {
    this.transitionAbort?.abort();
    const abort = new AbortController();
    this.transitionAbort = abort;
    this.stopRenderLoop();
    const next = this.transition.catch(() => undefined).then(async () => {
      if (abort.signal.aborted) return;
      this.session?.terminate();
      this.session = null;
      const lifecycle = this.deps.canvasLifecycleService;
      if (this.canvasUsed) {
        await lifecycle.recreateCanvas();
        this.canvasUsed = false;
      }
      if (abort.signal.aborted) return;
      if (!this.capabilities) {
        lifecycle.setupCanvasSize();
        return;
      }
      const native = this.capabilities.nativeResolution ?? DeviceCatalog.nativeResolution();
      if (checkHealth) await this.waitForHealthyStream(abort.signal);
      if (abort.signal.aborted) return;
      this.gpuCapabilities ??= await detectBrowserGpuCapabilities();
      if (abort.signal.aborted) return;
      const preferred: Backend = !this.performanceMode && this.gpuCapabilities.webgpu && this.gpuCapabilities.transferControlToOffscreen ? 'webgpu' : 'canvas2d';
      const create = async (backend: Backend) => {
        lifecycle.setupCanvasSize(native, false);
        const canvas = this.deps.streamViewService.getCanvas();
        if (!canvas) throw new Error('Stream canvas is unavailable');
        this.canvasUsed = true;
        return createGpuVideoRendererSession({
          canvas, nativeResolution: native,
          backend,
          presetId: this.performanceMode ? PRESET_POLICY.performancePresetId : this.userPreset,
          brightness: this.brightness, signal: abort.signal,
          logger: this.logger
        });
      };
      let session: GpuVideoRendererSession;
      try {
        session = await create(preferred);
      } catch (error) {
        if (abort.signal.aborted) return;
        if (preferred !== 'webgpu') throw error;
        this.logger.warn('GPU initialization failed; using Canvas2D:', getErrorMessage(error));
        // A failed worker may already own the transferred canvas.
        await lifecycle.recreateCanvas();
        if (abort.signal.aborted) return;
        session = await create('canvas2d');
      }
      if (abort.signal.aborted) { session.terminate(); return; }
      this.session = session;
      session.setPreset(this.performanceMode ? PRESET_POLICY.performancePresetId : this.userPreset);
      session.setBrightness(this.brightness);
      lifecycle.setupCanvasSize(native, session.isCanvasTransferred);
      if (!this.hidden && this.deps.appState.isStreaming) this.startRenderLoop();
    }).catch((error) => {
      if (!abort.signal.aborted) throw error;
    });
    this.transition = next;
    return next;
  }
  private waitForHealthyStream(signal: AbortSignal): Promise<void> {
    const video = this.deps.streamViewService.getVideo();
    if (!video) return Promise.reject(new Error('Stream video is unavailable'));
    return new Promise((resolve, reject) => {
      const abort = () => { this.deps.streamHealthService.cleanup(); reject(signal.reason); };
      signal.addEventListener('abort', abort, { once: true });
      this.deps.streamHealthService.checkStreamHealth(video, () => {
        signal.removeEventListener('abort', abort);
        resolve();
      }, (data) => {
        signal.removeEventListener('abort', abort);
        reject(new Error(`No frames received: ${data.reason}`));
      }, 4000);
    });
  }
  isActive(): boolean { return this.session?.isActive ?? false; }
  captureFrame(): Promise<ImageBitmap> {
    if (!this.session) throw new Error('No active rendering session');
    return this.session.captureFrame();
  }
  getTargetDimensions(): Dimensions { return this.session?.getTargetDimensions() ?? DeviceCatalog.nativeResolution(); }
  private startRenderLoop(): void {
    this.stopRenderLoop();
    const generation = this.loopGeneration;
    const video = this.deps.streamViewService.getVideo();
    if (!video) return;
    this.frameVideo = video;
    let lastMediaTime = -1;
    const schedule = () => { this.frameHandle = video.requestVideoFrameCallback(render); };
    const render: VideoFrameRequestCallback = async (_now, metadata) => {
      this.frameHandle = null;
      if (generation !== this.loopGeneration || !this.session) return;
      if (metadata.mediaTime !== lastMediaTime && video.readyState >= video.HAVE_CURRENT_DATA) {
        await this.session.renderFrame(video);
        lastMediaTime = metadata.mediaTime;
      }
      if (generation !== this.loopGeneration) return;
      if (this.deps.appState.isStreaming && !this.hidden) schedule(); else this.stopRenderLoop();
    };
    schedule();
  }
  private stopRenderLoop(): void {
    this.loopGeneration++;
    if (this.frameVideo && this.frameHandle !== null) this.frameVideo.cancelVideoFrameCallback(this.frameHandle);
    this.frameHandle = null;
    this.frameVideo = null;
  }
  async cleanup(): Promise<void> {
    await this.stopPipeline();
    this.deps.canvasLifecycleService.cleanup();
    this.deps.streamHealthService.cleanup();
  }
  override async dispose(): Promise<void> { await this.cleanup(); await super.dispose(); }
}
