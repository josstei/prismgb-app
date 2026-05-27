/**
 * AppOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator.ts';
import { EventChannels } from '@shared/events/event-channels.js';
import { createEventBus, createLoggerFactory, createOrchestratorMock } from '../../factories/index.js';

describe('AppOrchestrator', () => {
  let orchestrator;
  let mockDeviceOrchestrator;
  let mockStreamingOrchestrator;
  let mockStreamingAudioOrchestrator;
  let mockCaptureOrchestrator;
  let mockSettingsPreferencesOrchestrator;
  let mockSettingsDisplayModeOrchestrator;
  let mockUpdateOrchestrator;
  let mockUISetupOrchestrator;
  let mockPerformanceAnimationOrchestrator;
  let mockPerformanceMetricsOrchestrator;
  let mockPerformanceStateOrchestrator;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockDeviceOrchestrator = createOrchestratorMock();

    mockStreamingOrchestrator = createOrchestratorMock({
      start: vi.fn(),
      stop: vi.fn(),
    });

    mockStreamingAudioOrchestrator = createOrchestratorMock();

    mockCaptureOrchestrator = createOrchestratorMock({
      takeScreenshot: vi.fn(),
      toggleRecording: vi.fn(),
    });

    mockSettingsPreferencesOrchestrator = createOrchestratorMock({
      loadPreferences: vi.fn().mockResolvedValue(),
    });

    mockSettingsDisplayModeOrchestrator = createOrchestratorMock({
      toggleFullscreen: vi.fn(),
      toggleCinematicMode: vi.fn(),
    });

    mockUpdateOrchestrator = createOrchestratorMock();

    mockUISetupOrchestrator = createOrchestratorMock({
      initializeSettingsMenu: vi.fn(),
      initializeShaderSelector: vi.fn(),
      initializeNotesPanel: vi.fn(),
      setupOverlayClickHandlers: vi.fn(),
      setupUIEventListeners: vi.fn(),
    });

    mockPerformanceAnimationOrchestrator = createOrchestratorMock();

    mockPerformanceMetricsOrchestrator = createOrchestratorMock();

    mockPerformanceStateOrchestrator = createOrchestratorMock();

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    orchestrator = new AppOrchestrator({
      deviceOrchestrator: mockDeviceOrchestrator,
      streamingOrchestrator: mockStreamingOrchestrator,
      streamingAudioOrchestrator: mockStreamingAudioOrchestrator,
      captureOrchestrator: mockCaptureOrchestrator,
      preferencesOrchestrator: mockSettingsPreferencesOrchestrator,
      displayModeOrchestrator: mockSettingsDisplayModeOrchestrator,
      updateOrchestrator: mockUpdateOrchestrator,
      uiSetupOrchestrator: mockUISetupOrchestrator,
      animationPerformanceOrchestrator: mockPerformanceAnimationOrchestrator,
      performanceMetricsOrchestrator: mockPerformanceMetricsOrchestrator,
      performanceStateOrchestrator: mockPerformanceStateOrchestrator,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('AppOrchestrator');
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
      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(2);
    });

    it('should initialize all domain orchestrators', async () => {
      await orchestrator.onInitialize();

      expect(mockDeviceOrchestrator.initialize).toHaveBeenCalled();
      expect(mockStreamingOrchestrator.initialize).toHaveBeenCalled();
      expect(mockCaptureOrchestrator.initialize).toHaveBeenCalled();
    });

    it('should initialize all application orchestrators', async () => {
      await orchestrator.onInitialize();

      expect(mockSettingsPreferencesOrchestrator.initialize).toHaveBeenCalled();
      expect(mockSettingsDisplayModeOrchestrator.initialize).toHaveBeenCalled();
      expect(mockUpdateOrchestrator.initialize).toHaveBeenCalled();
      expect(mockPerformanceStateOrchestrator.initialize).toHaveBeenCalled();
      expect(mockPerformanceAnimationOrchestrator.initialize).toHaveBeenCalled();
      expect(mockPerformanceMetricsOrchestrator.initialize).toHaveBeenCalled();
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

    it('should not call loadPreferences directly (delegated to SettingsPreferencesOrchestrator.initialize)', async () => {
      await orchestrator.start();

      // loadPreferences is now called during SettingsPreferencesOrchestrator.initialize()
      // not directly by AppOrchestrator.start()
      expect(mockSettingsPreferencesOrchestrator.loadPreferences).not.toHaveBeenCalled();
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

    it('should ignore malformed device status payloads', () => {
      orchestrator._handleDeviceStatusChanged({ connected: 'false' });

      expect(mockEventBus.publish).not.toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalledWith('Ignoring invalid device status payload');
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
      expect(mockPerformanceAnimationOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockPerformanceMetricsOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockPerformanceStateOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockUpdateOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockSettingsDisplayModeOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockSettingsPreferencesOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockStreamingAudioOrchestrator.cleanup).toHaveBeenCalled();
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
});
