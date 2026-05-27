import { Service } from '@shared/di/decorators.js';
import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@shared/events/event-channels.js';
import { CapabilityDetector } from '@renderer/infrastructure/rendering/capability-detector.utils';
import {
  WorkerMessageType,
  WorkerResponseType
} from '@renderer/infrastructure/rendering/workers/worker-protocol.config';
import type {
  WorkerRendererConfig,
  WorkerStatsPayload
} from '@renderer/infrastructure/rendering/workers/worker-protocol.config';
import { PresetRegistry, buildUniforms } from '@prismgb/gpu';
import type {
  IPipelineCapabilities,
  IPreset,
  PipelineUniforms,
  RenderAPI
} from '@prismgb/gpu';
import { getErrorMessage } from '@shared/lib/errors/error-guards.js';
import { getDefaultNativeResolution } from '@shared/features/devices/device-defaults.js';
import type { TypedEventBusLike } from '@shared/events/event-payloads.js';
import type {
  LoggerFactoryLike
} from '@shared/interfaces/infrastructure.types.js';
import type { Dimensions } from '@renderer/infrastructure/streaming/streaming-contracts.js';

type GpuRendererCleanupOptions = {
  emitCanvasExpired?: boolean;
};
import type { GpuWorkerManager } from './gpu-worker-manager';
import {
  calculateNativeScaleFactor,
  createNativeBitmapOptions,
  normalizeNativeResolution
} from './native-resolution.utils';

/**
 * Maximum number of frames that can be pending render
 * This implements triple buffering
 */
const MAX_PENDING_FRAMES = 2;
const CAPTURE_TIMEOUT_LIFECYCLE = Symbol('gpuCaptureTimeout');
const BRIGHTNESS_SUBSCRIPTION_LIFECYCLE = Symbol('gpuBrightnessSubscription');

type RendererCapabilities = IPipelineCapabilities & {
  gpuPolicyApplied: boolean;
  gpuPolicyReason: string | null;
};

type SettingsServiceLike = {
  getNumberSetting(name: string): number;
  getStringSetting(name: string): string;
};

type GpuFrameBufferLike = {
  flush(): void;
  getMetrics(): unknown;
  resetMetrics(): void;
};

type StreamingGpuRendererDependencies = {
  eventBus: TypedEventBusLike;
  loggerFactory: LoggerFactoryLike;
  settingsService: SettingsServiceLike;
  gpuFrameBuffer: GpuFrameBufferLike;
  gpuWorkerManager: GpuWorkerManager;
};

function isWorkerRenderAPI(value: RenderAPI): value is WorkerRendererConfig['api'] {
  return value === 'webgpu' || value === 'webgl2';
}

@Service({
  "token": "gpuRendererService",
  "disposal": "dispose"
})
export class StreamingGpuRendererService extends BaseService {
  protected readonly eventBus: TypedEventBusLike;
  private readonly settingsService: SettingsServiceLike;

  private readonly _frameBuffer: GpuFrameBufferLike;
  private readonly _workerManager: GpuWorkerManager;
  private _pendingFrames: number;
  private _capabilities: RendererCapabilities | null;
  private _currentPresetId: string | null;
  private _currentPreset: IPreset | null;
  private _globalBrightness: number;
  private _nativeResolution: Dimensions;
  private _bitmapOptions: ImageBitmapOptions;
  private _scaleFactor: number;
  private _targetWidth: number;
  private _targetHeight: number;
  private _cachedUniforms: PipelineUniforms | null;
  private _cachedPresetId: string | null;
  private _cachedNativeWidth: number | null;
  private _cachedNativeHeight: number | null;
  private _cachedScaleFactor: number | null;
  private _cachedTargetWidth: number | null;
  private _cachedTargetHeight: number | null;
  private _cachedBrightness: number | null;
  private _lastStats: WorkerStatsPayload | null;
  private _isUsingFallback: boolean;
  private _pendingCaptureResolve: ((result: ImageBitmap) => void) | null;
  private _pendingCaptureReject: ((error: Error) => void) | null;
  private _isWaitingForCapturedFrame: boolean;
  private _isDestroying: boolean;
  private _skippedFrames: number;
  private _lastBackpressureLog: number;
  private _messageUnsubscribers: Array<() => void>;

  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {EventBus} dependencies.eventBus - Event publisher for render events
   * @param {Function} dependencies.loggerFactory - Logger factory
   * @param {SettingsService} dependencies.settingsService - Settings for brightness/preset
   * @param {GpuFrameBuffer} dependencies.gpuFrameBuffer - Frame buffer manager
   * @param {GpuWorkerManager} dependencies.gpuWorkerManager - Worker lifecycle manager
   */
  constructor(dependencies: StreamingGpuRendererDependencies) {
    super(
      dependencies,
      ['eventBus', 'loggerFactory', 'settingsService', 'gpuFrameBuffer', 'gpuWorkerManager'],
      'StreamingGpuRendererService'
    );

    this.eventBus = dependencies.eventBus;
    this.settingsService = dependencies.settingsService;
    this._frameBuffer = dependencies.gpuFrameBuffer;
    this._workerManager = dependencies.gpuWorkerManager;

    this._pendingFrames = 0;

    this._capabilities = null;

    this._currentPresetId = null;
    this._currentPreset = null;
    this._globalBrightness = 1.0;
    this._nativeResolution = getDefaultNativeResolution();
    this._bitmapOptions = createNativeBitmapOptions(this._nativeResolution);
    this._scaleFactor = 1;
    this._targetWidth = this._nativeResolution.width;
    this._targetHeight = this._nativeResolution.height;

    this._cachedUniforms = null;
    this._cachedPresetId = null;
    this._cachedNativeWidth = null;
    this._cachedNativeHeight = null;
    this._cachedScaleFactor = null;
    this._cachedTargetWidth = null;
    this._cachedTargetHeight = null;
    this._cachedBrightness = null;

    this._lastStats = null;

    this._isUsingFallback = false;

    this._pendingCaptureResolve = null;
    this._pendingCaptureReject = null;
    this._isWaitingForCapturedFrame = false;

    this._isDestroying = false;

    this._skippedFrames = 0;
    this._lastBackpressureLog = 0;

    this._messageUnsubscribers = [];
  }

  /**
   * Initialize the GPU renderer with a canvas element
   * Detects GPU capabilities, delegates worker creation to GpuWorkerManager,
   * and sets up the rendering pipeline.
   * @param {HTMLCanvasElement} canvasElement - Canvas to render to (control will be transferred)
   * @param {Object} [nativeResolution] - Native device resolution
   * @returns {Promise<boolean>} True if GPU rendering is available, false if fallback needed
   */
  async initialize(
    canvasElement: HTMLCanvasElement,
    nativeResolution: Dimensions = getDefaultNativeResolution()
  ): Promise<boolean> {
    this.logger.info('Initializing GPU renderer...');

    const activeNativeResolution = normalizeNativeResolution(nativeResolution);
    this._nativeResolution = activeNativeResolution;
    this._bitmapOptions = createNativeBitmapOptions(activeNativeResolution);
    this._cachedUniforms = null;

    this._globalBrightness = this.settingsService.getNumberSetting('globalBrightness');
    this.disposables.replace(
      BRIGHTNESS_SUBSCRIPTION_LIFECYCLE,
      this.eventBus.subscribe(
        EventChannels.SETTINGS.BRIGHTNESS_CHANGED,
        (brightness) => {
          if (!Number.isFinite(brightness)) {
            this.logger.warn('Ignoring invalid brightness payload from event bus');
            return;
          }
          this._globalBrightness = brightness;
          this.logger.debug(`Global brightness updated to ${brightness.toFixed(2)}`);
        }
      )
    );

    this._capabilities = await CapabilityDetector.detect();
    this.logger.info(CapabilityDetector.describeCapabilities(this._capabilities));

    this.eventBus.publish(EventChannels.RENDER.CAPABILITY_DETECTED, this._capabilities);

    if (!CapabilityDetector.isGPURenderingAvailable(this._capabilities)) {
      this.logger.warn('GPU rendering not available, will use Canvas2D fallback');
      this._isUsingFallback = true;
      return false;
    }

    if (!CapabilityDetector.isWorkerRenderingAvailable(this._capabilities)) {
      this.logger.warn(
        'Worker rendering not available; main-thread GPU mode is unsupported, using Canvas2D fallback'
      );
      this._isUsingFallback = true;
      return false;
    }

    try {
      this._scaleFactor = calculateNativeScaleFactor(
        activeNativeResolution,
        canvasElement.clientWidth,
        canvasElement.clientHeight
      );
      this._targetWidth = activeNativeResolution.width * this._scaleFactor;
      this._targetHeight = activeNativeResolution.height * this._scaleFactor;

      const savedPresetId = this.settingsService.getStringSetting('renderPreset') || PresetRegistry.getDefault().id;
      this._currentPresetId = savedPresetId;
      this._currentPreset = PresetRegistry.get(savedPresetId) || PresetRegistry.getDefault();

      if (!isWorkerRenderAPI(this._capabilities.preferredAPI)) {
        this.logger.warn(`Unsupported worker render API: ${this._capabilities.preferredAPI}`);
        this._isUsingFallback = true;
        return false;
      }

      const config: WorkerRendererConfig = {
        nativeWidth: activeNativeResolution.width,
        nativeHeight: activeNativeResolution.height,
        targetWidth: this._targetWidth,
        targetHeight: this._targetHeight,
        scaleFactor: this._scaleFactor,
        api: this._capabilities.preferredAPI,
        presetId: this._currentPresetId
      };

      this._registerMessageHandlers();

      const initialized = await this._workerManager.initialize(canvasElement, config, 5000);

      if (!initialized) {
        this.logger.error('Worker manager initialization returned false');
        this._unregisterMessageHandlers();
        this._isUsingFallback = true;
        return false;
      }

      this.logger.info(`GPU renderer initialized with ${this._capabilities.preferredAPI}`);
      return true;

    } catch (error) {
      this.logger.error('Failed to initialize GPU renderer:', getErrorMessage(error));
      this._cleanup();
      this._isUsingFallback = true;
      return false;
    }
  }

  /**
   * Register domain-specific message handlers on the worker manager
   * @private
   */
  _registerMessageHandlers(): void {
    this._unregisterMessageHandlers();

    this._messageUnsubscribers = [
      this._workerManager.onMessage(WorkerResponseType.READY, (payload) => {
        this.logger.info(`Render worker ready (API: ${payload.api})`);
        this.eventBus.publish(EventChannels.RENDER.PIPELINE_READY, payload);
      }),

      this._workerManager.onMessage(WorkerResponseType.FRAME_RENDERED, () => {
        this._pendingFrames = Math.max(0, this._pendingFrames - 1);
        if (this._isWaitingForCapturedFrame) {
          this._isWaitingForCapturedFrame = false;
          this._workerManager.sendCommand(WorkerMessageType.CAPTURE);
        }
      }),

      this._workerManager.onMessage(WorkerResponseType.STATS, (payload) => {
        this._lastStats = payload;
        this.eventBus.publish(EventChannels.RENDER.STATS_UPDATE, payload);
      }),

      this._workerManager.onMessage(WorkerResponseType.ERROR, (payload) => {
        if (payload.code === 'DEVICE_LOST' && payload.message?.includes('destroyed')) {
          this.logger.debug('GPU device destroyed (expected during cleanup)');
          return;
        }
        this.logger.error('Render worker error:', payload.message);
        this._pendingFrames = 0;
        this.eventBus.publish(EventChannels.RENDER.PIPELINE_ERROR, payload);
        this._resolvePendingCapture(null, new Error(payload.message));
      }),

      this._workerManager.onMessage(WorkerResponseType.CAPTURE_REQUESTED, () => {}),

      this._workerManager.onMessage(WorkerResponseType.CAPTURE_READY, (payload) => {
        this._resolvePendingCapture(payload.bitmap, null);
      }),

      this._workerManager.onMessage(WorkerResponseType.RELEASED, () => {
        this.logger.info('GPU resources released (worker still alive)');
      }),

      this._workerManager.onMessage(WorkerResponseType.DESTROYED, () => {
        this.logger.info('Render worker destroyed');
      })
    ];
  }

  /**
   * Unregister all domain-specific message handlers
   * @private
   */
  _unregisterMessageHandlers(): void {
    for (const unsub of this._messageUnsubscribers) {
      unsub();
    }
    this._messageUnsubscribers = [];
  }

  /**
   * Render a video frame through the GPU pipeline
   * Applies shader effects based on current preset and brightness settings.
   * Implements triple buffering to prevent frame drops.
   * @param {HTMLVideoElement} videoElement - Video element to capture frame from
   * @returns {Promise<void>}
   */
  async renderFrame(videoElement: HTMLVideoElement): Promise<void> {
    if (!this._workerManager.isReady() || this._pendingFrames >= MAX_PENDING_FRAMES) {
      if (this._workerManager.isReady() && this._pendingFrames >= MAX_PENDING_FRAMES) {
        this._skippedFrames++;
        const now = performance.now();
        if (now - this._lastBackpressureLog > 5000) {
          this.logger.warn(`GPU backpressure: ${this._skippedFrames} frame(s) skipped (pending: ${this._pendingFrames})`);
          this._skippedFrames = 0;
          this._lastBackpressureLog = now;
        }
      }
      return;
    }

    if (videoElement.readyState < videoElement.HAVE_CURRENT_DATA) {
      return;
    }

    let imageBitmap: ImageBitmap | null = null;

    try {
      imageBitmap = await createImageBitmap(videoElement, this._bitmapOptions);

      const uniforms = this._getCachedUniforms();

      this._pendingFrames++;

      this._workerManager.sendCommand(
        WorkerMessageType.FRAME,
        { imageBitmap, uniforms },
        [imageBitmap]
      );
      imageBitmap = null;
    } catch (error) {
      this.logger.error('Failed to render frame:', getErrorMessage(error));
      if (imageBitmap) {
        imageBitmap.close();
      }
    }
  }

  /**
   * Get cached uniforms, rebuilding only when preset, dimensions, or brightness change
   * Uses direct value comparison instead of string concatenation to avoid GC pressure
   * @returns {Object} Uniform values for all shader passes
   * @private
   */
  _getCachedUniforms(): PipelineUniforms {
    if (this._cachedUniforms &&
        this._cachedPresetId === this._currentPresetId &&
        this._cachedNativeWidth === this._nativeResolution.width &&
        this._cachedNativeHeight === this._nativeResolution.height &&
        this._cachedScaleFactor === this._scaleFactor &&
        this._cachedTargetWidth === this._targetWidth &&
        this._cachedTargetHeight === this._targetHeight &&
        this._cachedBrightness === this._globalBrightness) {
      return this._cachedUniforms;
    }

    const baseUniforms = buildUniforms({
      preset: this._currentPreset ?? PresetRegistry.getDefault(),
      nativeWidth: this._nativeResolution.width,
      nativeHeight: this._nativeResolution.height,
      outputWidth: this._targetWidth,
      outputHeight: this._targetHeight,
      brightness: this._globalBrightness
    });
    this._cachedUniforms = baseUniforms;

    this._cachedPresetId = this._currentPresetId;
    this._cachedNativeWidth = this._nativeResolution.width;
    this._cachedNativeHeight = this._nativeResolution.height;
    this._cachedScaleFactor = this._scaleFactor;
    this._cachedTargetWidth = this._targetWidth;
    this._cachedTargetHeight = this._targetHeight;
    this._cachedBrightness = this._globalBrightness;

    return this._cachedUniforms;
  }

  /**
   * Set the active render preset (shader configuration)
   * @param {string} presetId - Preset ID (e.g., 'authentic', 'vivid', 'sharp')
   */
  setPreset(presetId: string): void {
    const preset = PresetRegistry.get(presetId);
    if (!preset) {
      this.logger.warn(`Unknown preset: ${presetId}`);
      return;
    }

    if (this._currentPresetId === presetId) {
      return;
    }

    this._currentPresetId = presetId;
    this._currentPreset = preset;

    this.logger.info(`Render preset changed to: ${preset.name}`);

    if (this._workerManager.isReady()) {
      this._workerManager.sendCommand(WorkerMessageType.SET_PRESET, {
        presetId,
        preset
      });
    }
  }

  /**
   * Get current preset ID
   * @returns {string|null} Current preset ID, or null if not initialized
   */
  getPresetId(): string | null {
    return this._currentPresetId;
  }

  /**
   * Resize the render target to new dimensions
   * Recalculates scale factor and updates worker textures.
   * @param {number} width - New width in CSS pixels
   * @param {number} height - New height in CSS pixels
   */
  resize(width: number, height: number): void {
    this._scaleFactor = calculateNativeScaleFactor(this._nativeResolution, width, height);

    this._targetWidth = this._nativeResolution.width * this._scaleFactor;
    this._targetHeight = this._nativeResolution.height * this._scaleFactor;

    if (this._workerManager.isReady()) {
      this._workerManager.sendCommand(WorkerMessageType.RESIZE, {
        width: this._targetWidth,
        height: this._targetHeight,
        scaleFactor: this._scaleFactor
      });
    }

    this.logger.debug(`Resized to ${this._targetWidth}×${this._targetHeight} (${this._scaleFactor}× scale)`);
  }

  /**
   * Check if GPU rendering is active
   * @returns {boolean} True if ready and not using fallback
   */
  isActive(): boolean {
    return this._workerManager.isReady() && !this._isUsingFallback;
  }

  /**
   * Check if using fallback renderer (Canvas2D)
   * @returns {boolean} True if GPU unavailable and using fallback
   */
  isFallback(): boolean {
    return this._isUsingFallback;
  }

  /**
   * Check if canvas control was transferred to offscreen
   * If true, Canvas2D fallback cannot use this canvas.
   * @returns {boolean} True if canvas was transferred (irreversible)
   */
  isCanvasTransferred(): boolean {
    return this._workerManager.isCanvasTransferred();
  }

  /**
   * Get detected GPU capabilities
   * @returns {Object|null} GPU capabilities or null if not detected
   */
  getCapabilities(): RendererCapabilities | null {
    return this._capabilities;
  }

  /**
   * Get current target rendering dimensions
   * @returns {{width: number, height: number}} Target dimensions for rendered output
   */
  getTargetDimensions(): Dimensions {
    return {
      width: this._targetWidth,
      height: this._targetHeight
    };
  }

  /**
   * Capture the current rendered frame with shader effects applied
   * Uses request-before-capture pattern: arms lazy capture, waits for next frame,
   * then retrieves the captured frame with all shader effects at upscaled resolution.
   * @returns {Promise<ImageBitmap>} The captured frame as ImageBitmap
   * @throws {Error} If renderer not ready or capture already in progress
   */
  async captureFrame(): Promise<ImageBitmap> {
    if (this._isDestroying) {
      throw new Error('GPU renderer is shutting down');
    }

    if (!this._workerManager.isReady()) {
      throw new Error('GPU renderer not ready');
    }

    if (this._pendingCaptureResolve) {
      throw new Error('Capture already in progress');
    }

    return new Promise((resolve, reject) => {
      this._pendingCaptureResolve = resolve;
      this._pendingCaptureReject = reject;

      this._workerManager.sendCommand(WorkerMessageType.REQUEST_CAPTURE);

      this._isWaitingForCapturedFrame = true;

      const captureTimeoutId = setTimeout(() => {
        this.disposables.cancel(CAPTURE_TIMEOUT_LIFECYCLE);
        this._isWaitingForCapturedFrame = false;
        this._resolvePendingCapture(null, new Error('Capture request timed out'));
      }, 1000);
      this.disposables.replace(CAPTURE_TIMEOUT_LIFECYCLE, () => clearTimeout(captureTimeoutId));
    });
  }

  /**
   * Release GPU resources while keeping worker alive
   * Allows re-initialization without needing a new canvas transfer.
   * Used for idle memory savings when streaming stops.
   */
  releaseGpuResources(): void {
    if (!this._workerManager.isReady()) {
      this.logger.debug('releaseGpuResources: Nothing to release (worker not ready)');
      return;
    }

    this._workerManager.releaseResources();
    this._pendingFrames = 0;

    this._skippedFrames = 0;
    this._lastBackpressureLog = 0;

    this.logger.info('GPU resources released (worker kept alive for re-init)');
  }

  /**
   * Fully terminate worker and reset canvas state
   * Forces Chromium GPU process to release cached resources.
   * Emits CANVAS_EXPIRED event so UI can provide fresh canvas on next init.
   */
  terminateAndReset(emitCanvasExpired = true): void {
    if (!this._workerManager.isCanvasTransferred()) {
      this.logger.debug('terminateAndReset: Nothing to terminate');
      return;
    }

    this._cleanup(false);

    if (emitCanvasExpired) {
      this.eventBus.publish(EventChannels.RENDER.CANVAS_EXPIRED);
      this.logger.info('GPU renderer terminated - canvas expired, will need fresh canvas');
    } else {
      this.logger.info('GPU renderer terminated - caller will handle canvas refresh');
    }
  }

  /**
   * Resolve or reject a pending capture request and clean up state
   * @param {ImageBitmap|null} result - The captured frame (null if error)
   * @param {Error|null} error - The error (null if success)
   * @private
   */
  _resolvePendingCapture(result: ImageBitmap | null, error: Error | null): void {
    this.disposables.cancel(CAPTURE_TIMEOUT_LIFECYCLE);

    if (error && this._pendingCaptureReject) {
      this._pendingCaptureReject(error);
    } else if (result && this._pendingCaptureResolve) {
      this._pendingCaptureResolve(result);
    }

    this._pendingCaptureResolve = null;
    this._pendingCaptureReject = null;
  }

  /**
   * Cleanup resources by delegating to worker manager
   * @param {boolean} [emitCanvasExpired=true] - Whether to emit CANVAS_EXPIRED
   */
  _cleanup(emitCanvasExpired = true): void {
    this._isDestroying = true;

    this.disposables.cancel(BRIGHTNESS_SUBSCRIPTION_LIFECYCLE);

    this._resolvePendingCapture(null, new Error('GPU renderer cleanup'));

    this._unregisterMessageHandlers();

    const wasTransferred = this._workerManager.isCanvasTransferred();

    this._workerManager.terminate();

    this._pendingFrames = 0;
    this._skippedFrames = 0;
    this._lastBackpressureLog = 0;

    if (emitCanvasExpired && wasTransferred) {
      this.eventBus.publish(EventChannels.RENDER.CANVAS_EXPIRED);
      this.logger.info('Canvas expired - orchestrator will recreate for next session');
    }

    this._isDestroying = false;
  }

  cleanup(options: GpuRendererCleanupOptions = {}): void {
    this._cleanup(options.emitCanvasExpired ?? true);
    this.logger.info('GPU renderer service cleaned up');
  }

  override dispose(): void | Promise<void> {
    this.cleanup({ emitCanvasExpired: false });
    return super.dispose();
  }
}
