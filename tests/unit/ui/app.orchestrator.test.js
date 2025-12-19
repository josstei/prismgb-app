/**
 * AppOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AppOrchestrator } from '@app/renderer/application/app.orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('AppOrchestrator', () => {
  let orchestrator;
  let mockDeviceOrchestrator;
  let mockStreamingOrchestrator;
  let mockCaptureOrchestrator;
  let mockPreferencesOrchestrator;
  let mockDisplayModeOrchestrator;
  let mockUpdateOrchestrator;
  let mockUISetupOrchestrator;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockDeviceOrchestrator = {
      initialize: vi.fn().mockResolvedValue(),
      cleanup: vi.fn().mockResolvedValue()
    };

    mockStreamingOrchestrator = {
      initialize: vi.fn().mockResolvedValue(),
      start: vi.fn(),
      stop: vi.fn(),
      cleanup: vi.fn().mockResolvedValue()
    };

    mockCaptureOrchestrator = {
      initialize: vi.fn().mockResolvedValue(),
      takeScreenshot: vi.fn(),
      toggleRecording: vi.fn(),
      cleanup: vi.fn().mockResolvedValue()
    };

    mockPreferencesOrchestrator = {
      initialize: vi.fn().mockResolvedValue(),
      loadPreferences: vi.fn().mockResolvedValue(),
      cleanup: vi.fn().mockResolvedValue()
    };

    mockDisplayModeOrchestrator = {
      initialize: vi.fn().mockResolvedValue(),
      toggleFullscreen: vi.fn(),
      toggleCinematicMode: vi.fn(),
      cleanup: vi.fn().mockResolvedValue()
    };

    mockUpdateOrchestrator = {
      initialize: vi.fn().mockResolvedValue(),
      cleanup: vi.fn().mockResolvedValue()
    };

    mockUISetupOrchestrator = {
      initialize: vi.fn().mockResolvedValue(),
      initializeSettingsMenu: vi.fn(),
      initializeShaderSelector: vi.fn(),
      setupOverlayClickHandlers: vi.fn(),
      setupUIEventListeners: vi.fn(),
      cleanup: vi.fn().mockResolvedValue()
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    orchestrator = new AppOrchestrator({
      deviceOrchestrator: mockDeviceOrchestrator,
      streamingOrchestrator: mockStreamingOrchestrator,
      captureOrchestrator: mockCaptureOrchestrator,
      preferencesOrchestrator: mockPreferencesOrchestrator,
      displayModeOrchestrator: mockDisplayModeOrchestrator,
      updateOrchestrator: mockUpdateOrchestrator,
      uiSetupOrchestrator: mockUISetupOrchestrator,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.className = '';
  });

  describe('Constructor', () => {
    it('should initialize subscriptions array', () => {
      expect(orchestrator._subscriptions).toEqual([]);
    });

    it('should not have domListeners manager (delegated to UISetupOrchestrator)', () => {
      expect(orchestrator._domListeners).toBeUndefined();
    });
  });

  describe('onInitialize', () => {
    it('should wire high-level events', async () => {
      await orchestrator.onInitialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(EventChannels.DEVICE.STATUS_CHANGED, expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(EventChannels.DEVICE.ENUMERATION_FAILED, expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(EventChannels.STREAM.STARTED, expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(EventChannels.STREAM.STOPPED, expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(EventChannels.RENDER.CAPABILITY_DETECTED, expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(EventChannels.SETTINGS.ANIMATION_POWER_SAVER_CHANGED, expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(6);
    });

    it('should initialize all domain orchestrators', async () => {
      await orchestrator.onInitialize();

      expect(mockDeviceOrchestrator.initialize).toHaveBeenCalled();
      expect(mockStreamingOrchestrator.initialize).toHaveBeenCalled();
      expect(mockCaptureOrchestrator.initialize).toHaveBeenCalled();
    });

    it('should initialize all application orchestrators', async () => {
      await orchestrator.onInitialize();

      expect(mockPreferencesOrchestrator.initialize).toHaveBeenCalled();
      expect(mockDisplayModeOrchestrator.initialize).toHaveBeenCalled();
      expect(mockUpdateOrchestrator.initialize).toHaveBeenCalled();
      expect(mockUISetupOrchestrator.initialize).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should delegate settings menu initialization to UISetupOrchestrator', async () => {
      await orchestrator.start();

      expect(mockUISetupOrchestrator.initializeSettingsMenu).toHaveBeenCalled();
    });

    it('should delegate overlay click handlers to UISetupOrchestrator', async () => {
      await orchestrator.start();

      expect(mockUISetupOrchestrator.setupOverlayClickHandlers).toHaveBeenCalled();
    });

    it('should delegate UI event listeners to UISetupOrchestrator', async () => {
      await orchestrator.start();

      expect(mockUISetupOrchestrator.setupUIEventListeners).toHaveBeenCalled();
    });

    it('should not call loadPreferences directly (delegated to PreferencesOrchestrator.initialize)', async () => {
      await orchestrator.start();

      // loadPreferences is now called during PreferencesOrchestrator.initialize()
      // not directly by AppOrchestrator.start()
      expect(mockPreferencesOrchestrator.loadPreferences).not.toHaveBeenCalled();
    });
  });

  describe('_handleDeviceStatusChanged', () => {
    it('should update UI when connected', () => {
      const status = { connected: true, device: { deviceName: 'Chromatic' } };

      orchestrator._handleDeviceStatusChanged(status);

      // UI updates are now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:device-status', { status });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-message', { deviceConnected: true });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Device ready' });
    });

    it('should update UI when disconnected', () => {
      const status = { connected: false };

      orchestrator._handleDeviceStatusChanged(status);

      // UI updates are now done via events
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:device-status', { status });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-message', { deviceConnected: false });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-visible', { visible: true });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Device disconnected', type: 'warning' });
    });
  });

  describe('onCleanup', () => {
    it('should unsubscribe all subscriptions via cleanup()', async () => {
      // Subscription cleanup now happens in BaseOrchestrator.cleanup()
      const unsubscribe1 = vi.fn();
      const unsubscribe2 = vi.fn();
      orchestrator._subscriptions = [unsubscribe1, unsubscribe2];

      await orchestrator.cleanup();

      expect(unsubscribe1).toHaveBeenCalled();
      expect(unsubscribe2).toHaveBeenCalled();
      expect(orchestrator._subscriptions).toEqual([]);
    });

    it('should cleanup all sub-orchestrators in correct order', async () => {
      await orchestrator.onCleanup();

      // Verify all orchestrators are cleaned up
      expect(mockUISetupOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockUpdateOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockDisplayModeOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockPreferencesOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockStreamingOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockCaptureOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockDeviceOrchestrator.cleanup).toHaveBeenCalled();
    });

    it('should continue cleanup even if one orchestrator fails', async () => {
      const error = new Error('Cleanup failed');
      mockStreamingOrchestrator.cleanup.mockRejectedValue(error);

      await orchestrator.onCleanup();

      // Should still attempt to cleanup all other orchestrators
      expect(mockUISetupOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockCaptureOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockDeviceOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Error cleaning up streamingOrchestrator:', error);
    });
  });

  describe('_handleCapabilityDetected', () => {
    it('should disable decorative animations on weak GPU when power saver is enabled', () => {
      orchestrator._handleAnimationPowerSaverChanged(true);

      orchestrator._handleCapabilityDetected({
        webgpu: false,
        webgl2: false,
        maxTextureSize: 1024,
        preferredAPI: 'canvas2d'
      });

      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });

    it('should allow decorative animations when GPU is capable', () => {
      orchestrator._animationSuppression.weakGPU = true;
      document.body.classList.add('app-animations-off');

      orchestrator._handleCapabilityDetected({
        webgpu: true,
        webgl2: true,
        maxTextureSize: 4096,
        preferredAPI: 'webgl2'
      });

      expect(document.body.classList.contains('app-animations-off')).toBe(false);
    });

    it('should respect user preference to keep animations on even if GPU is weak', () => {
      orchestrator._handleAnimationPowerSaverChanged(false);

      orchestrator._handleCapabilityDetected({
        webgpu: false,
        webgl2: false,
        maxTextureSize: 512,
        preferredAPI: 'canvas2d'
      });

      expect(document.body.classList.contains('app-animations-off')).toBe(false);
    });

    it('should pause animations when performance mode is enabled even on strong GPU', () => {
      orchestrator._handleAnimationPowerSaverChanged(true);

      orchestrator._handleCapabilityDetected({
        webgpu: true,
        webgl2: true,
        maxTextureSize: 4096,
        preferredAPI: 'webgl2'
      });

      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });
  });
});
