/**
 * Application Orchestrator
 *
 * THIN coordinator that wires sub-orchestrators together
 * Should be <100 lines - delegates ALL business logic to domain orchestrators
 *
 * Responsibilities:
 * - Initialize and coordinate all sub-orchestrators
 * - Wire high-level cross-orchestrator events
 */

import { BaseOrchestrator } from '@shared/base/orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

const APP_CSS_CLASSES = Object.freeze({
  STREAMING: 'app-streaming',
  IDLE: 'app-idle',
  HIDDEN: 'app-hidden',
  ANIMATIONS_OFF: 'app-animations-off'
});

export class AppOrchestrator extends BaseOrchestrator {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {DeviceOrchestrator} dependencies.deviceOrchestrator - Device management
   * @param {StreamingOrchestrator} dependencies.streamingOrchestrator - Stream management
   * @param {CaptureOrchestrator} dependencies.captureOrchestrator - Screenshot/recording
   * @param {PreferencesOrchestrator} dependencies.preferencesOrchestrator - User preferences
   * @param {DisplayModeOrchestrator} dependencies.displayModeOrchestrator - Display modes
   * @param {UpdateOrchestrator} dependencies.updateOrchestrator - Auto-updates
   * @param {UISetupOrchestrator} dependencies.uiSetupOrchestrator - UI initialization
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   */
  constructor(dependencies) {
    super(
      dependencies,
      [
        'deviceOrchestrator',
        'streamingOrchestrator',
        'captureOrchestrator',
        'preferencesOrchestrator',
        'displayModeOrchestrator',
        'updateOrchestrator',
        'uiSetupOrchestrator',
        'eventBus',
        'loggerFactory'
      ],
      'AppOrchestrator'
    );

    this._idleTimeoutId = null;
    this._idleDelayMs = 30000;
    this._isStreaming = false;
    this._idleActivityEvents = ['pointermove', 'keydown', 'wheel', 'touchstart'];
    this._lastIdleReset = 0;
    this._animationSuppression = {
      reducedMotion: false,
      weakGPU: false,
      performanceMode: false
    };
    this._weakGpuSuppressionEnabled = false;
    this._weakGpuDetected = false;
    this._performanceModeEnabled = false;
    this._motionPreferenceCleanup = null;
  }

  /**
   * Initialize all sub-orchestrators in order
   * Wires high-level events before initializing to catch early events.
   * @override
   */
  async onInitialize() {
    // Wire high-level events FIRST (before sub-orchestrators emit events)
    this._wireHighLevelEvents();

    // Initialize domain orchestrators
    await this.deviceOrchestrator.initialize();
    await this.streamingOrchestrator.initialize();
    await this.captureOrchestrator.initialize();

    // Initialize application orchestrators
    await this.preferencesOrchestrator.initialize();
    await this.displayModeOrchestrator.initialize();
    await this.updateOrchestrator.initialize();
    await this.uiSetupOrchestrator.initialize();
  }

  /**
   * Start the application
   * Initializes UI components and sets up event listeners.
   */
  async start() {
    this.logger.info('Starting application orchestrator...');

    // Delegate UI setup to UISetupOrchestrator
    this.uiSetupOrchestrator.initializeSettingsMenu();
    this.uiSetupOrchestrator.initializeShaderSelector();
    this.uiSetupOrchestrator.setupOverlayClickHandlers();
    this.uiSetupOrchestrator.setupUIEventListeners();

    // Note: Preferences are loaded in PreferencesOrchestrator.onInitialize()

    this.logger.info('Application orchestrator started');
  }

  /**
   * Wire high-level events across orchestrators
   * @private
   */
  _wireHighLevelEvents() {
    this.subscribeWithCleanup({
      [EventChannels.DEVICE.STATUS_CHANGED]: (status) => this._handleDeviceStatusChanged(status),
      [EventChannels.DEVICE.ENUMERATION_FAILED]: (data) => {
        const message = data.reason === 'webcam_access'
          ? 'Camera access denied. Please allow camera permissions.'
          : `Device error: ${data.error}`;
        this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message, type: 'warning' });
      },
      [EventChannels.STREAM.STARTED]: () => this._handleStreamingStateChanged(true),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamingStateChanged(false),
      [EventChannels.RENDER.CAPABILITY_DETECTED]: (capabilities) => this._handleCapabilityDetected(capabilities),
      [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: (enabled) => this._handlePerformanceModeChanged(enabled)
    });

    this._setupVisibilityHandling();
    this._setupReducedMotionHandling();
    this._setupIdleHandling();
    this._startIdleTimer();
  }

  _setupVisibilityHandling() {
    this._handleVisibilityChange = () => {
      if (document.hidden) {
        document.body.classList.add(APP_CSS_CLASSES.HIDDEN);
        this._clearIdleTimer();
        this.logger.debug('App hidden - pausing decorative animations');
      } else {
        document.body.classList.remove(APP_CSS_CLASSES.HIDDEN);
        this.logger.debug('App visible - resuming decorative animations');
        this._resetIdleTimer();
      }
    };
    document.addEventListener('visibilitychange', this._handleVisibilityChange);
    this._handleVisibilityChange();
  }

  _setupReducedMotionHandling() {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handleChange = (event) => {
      this._setAnimationsSuppressed('reducedMotion', event.matches);
      if (event.matches) {
        this.logger.debug('Prefers-reduced-motion detected - pausing decorative animations');
      }
    };

    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', handleChange);
      this._motionPreferenceCleanup = () => mediaQuery.removeEventListener('change', handleChange);
    } else if (typeof mediaQuery.addListener === 'function') {
      // Safari fallback
      mediaQuery.addListener(handleChange);
      this._motionPreferenceCleanup = () => mediaQuery.removeListener(handleChange);
    }

    // Apply initial state
    this._setAnimationsSuppressed('reducedMotion', mediaQuery.matches);
  }

  _setupIdleHandling() {
    this._handleUserActivity = () => {
      if (this._isStreaming || document.hidden) {
        return;
      }

      const now = performance.now();
      if (now - this._lastIdleReset < 1000) {
        return;
      }

      this._resetIdleTimer();
    };

    this._idleActivityEvents.forEach((event) => {
      document.addEventListener(event, this._handleUserActivity, { passive: true });
    });
  }

  _handleStreamingStateChanged(isStreaming) {
    this._isStreaming = isStreaming;

    if (isStreaming) {
      document.body.classList.add(APP_CSS_CLASSES.STREAMING);
      document.body.classList.remove(APP_CSS_CLASSES.IDLE);
      this._clearIdleTimer();
      this.logger.debug('Streaming started - pausing decorative animations');
    } else {
      document.body.classList.remove(APP_CSS_CLASSES.STREAMING);
      this._startIdleTimer();
      this.logger.debug('Streaming stopped - starting idle timer');
    }
  }

  _startIdleTimer() {
    if (this._isStreaming || document.hidden) {
      return;
    }

    // Skip idle timer if animations are already suppressed (performance mode, weak GPU, etc.)
    if (this._isAnimationsSuppressed()) {
      return;
    }

    this._clearIdleTimer();
    this._lastIdleReset = performance.now();
    this._idleTimeoutId = setTimeout(() => {
      document.body.classList.add(APP_CSS_CLASSES.IDLE);
      this.logger.debug('App idle - pausing decorative animations');
    }, this._idleDelayMs);
  }

  _isAnimationsSuppressed() {
    return Object.values(this._animationSuppression).some(Boolean);
  }

  _resetIdleTimer() {
    this._lastIdleReset = performance.now();
    document.body.classList.remove(APP_CSS_CLASSES.IDLE);
    this._startIdleTimer();
  }

  _clearIdleTimer() {
    if (this._idleTimeoutId) {
      clearTimeout(this._idleTimeoutId);
      this._idleTimeoutId = null;
    }
  }

  _handleCapabilityDetected(capabilities) {
    this._weakGpuDetected = this._detectWeakGPU(capabilities);
    this._applyWeakGpuSuppression();
  }

  _detectWeakGPU(capabilities) {
    if (!capabilities) {
      return false;
    }

    const noAcceleratedPath = !capabilities.webgpu && !capabilities.webgl2;
    const usingCanvasFallback = capabilities.preferredAPI === 'canvas2d';
    const lowTextureBudget = capabilities.maxTextureSize > 0 && capabilities.maxTextureSize < 2048;

    return noAcceleratedPath || usingCanvasFallback || lowTextureBudget;
  }

  _applyWeakGpuSuppression() {
    const shouldSuppress = this._weakGpuSuppressionEnabled && this._weakGpuDetected;
    this._setAnimationsSuppressed('weakGPU', shouldSuppress);

    if (shouldSuppress) {
      this.logger.info('Weak GPU detected - pausing decorative animations to reduce load (performance mode enabled)');
    } else if (this._weakGpuDetected && !this._weakGpuSuppressionEnabled) {
      this.logger.info('Weak GPU detected but performance mode is off; keeping decorative animations');
    } else {
      this.logger.debug('GPU capabilities sufficient - decorative animations allowed');
    }
  }

  _handlePerformanceModeChanged(enabled) {
    this._weakGpuSuppressionEnabled = enabled;
    this._performanceModeEnabled = enabled;
    this._setAnimationsSuppressed('performanceMode', enabled);

    if (enabled) {
      // Clear idle timer and class since animations are now suppressed by performance mode
      this._clearIdleTimer();
      document.body.classList.remove(APP_CSS_CLASSES.IDLE);
      this.logger.info('Performance mode enabled - pausing decorative animations');
    } else {
      this.logger.info('Performance mode disabled - decorative animations allowed unless other suppressions active');
      // Restart idle timer if no other suppressions active
      if (!this._isAnimationsSuppressed()) {
        this._startIdleTimer();
      }
    }

    this._applyWeakGpuSuppression();
  }

  _setAnimationsSuppressed(reason, suppressed) {
    this._animationSuppression[reason] = suppressed;
    const shouldSuppress = Object.values(this._animationSuppression).some(Boolean);
    document.body.classList.toggle(APP_CSS_CLASSES.ANIMATIONS_OFF, shouldSuppress);
  }

  /**
   * Handle device status changed
   * @private
   */
  _handleDeviceStatusChanged(status) {
    const connected = status.connected;

    this.logger.info('Device ' + (connected ? 'CONNECTED' : 'DISCONNECTED'));

    // Note: App state automatically derives deviceConnected from DeviceService
    // No need to manually update appState.setDeviceConnected() anymore

    // Update UI via events
    if (connected) {
      this.eventBus.publish(EventChannels.UI.DEVICE_STATUS, { status });
      this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: true });
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Device ready' });
    } else {
      this.eventBus.publish(EventChannels.UI.DEVICE_STATUS, { status });
      this.eventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: false });
      this.eventBus.publish(EventChannels.UI.OVERLAY_VISIBLE, { visible: true });
      this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Device disconnected', type: 'warning' });
    }
  }

  /**
   * Cleanup all sub-orchestrators
   * Continues cleanup even if individual orchestrators fail.
   * @override
   */
  async onCleanup() {
    this.logger.info('Cleaning up AppOrchestrator...');

    this._clearIdleTimer();
    if (this._handleVisibilityChange) {
      document.removeEventListener('visibilitychange', this._handleVisibilityChange);
    }
    if (this._handleUserActivity) {
      this._idleActivityEvents.forEach((event) => {
        document.removeEventListener(event, this._handleUserActivity, { passive: true });
      });
    }
    if (this._motionPreferenceCleanup) {
      this._motionPreferenceCleanup();
      this._motionPreferenceCleanup = null;
    }

    // Cleanup all sub-orchestrators (continue even if one fails)
    const orchestrators = [
      ['uiSetupOrchestrator', this.uiSetupOrchestrator],
      ['updateOrchestrator', this.updateOrchestrator],
      ['displayModeOrchestrator', this.displayModeOrchestrator],
      ['preferencesOrchestrator', this.preferencesOrchestrator],
      ['streamingOrchestrator', this.streamingOrchestrator],
      ['captureOrchestrator', this.captureOrchestrator],
      ['deviceOrchestrator', this.deviceOrchestrator]
    ];

    for (const [name, orchestrator] of orchestrators) {
      try {
        await orchestrator.cleanup();
        this.logger.debug(`${name} cleaned up`);
      } catch (error) {
        this.logger.error(`Error cleaning up ${name}:`, error);
      }
    }

    this.logger.info('AppOrchestrator cleanup complete');
  }
}
