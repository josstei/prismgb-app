/**
 * AppOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator';
import { EventChannels } from '@platform/events';
import { createOrchestratorMock } from '../../../../factories/index.js';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('AppOrchestrator', () => {
  let orchestrator;
  let mockRendererDeviceRuntime;
  let mockStreamingOrchestrator;
  let mockStreamingAudioOrchestrator;
  let mockCaptureOrchestrator;
  let mockSettingsService;
  let mockSettingsDisplayModeOrchestrator;
  let mockUpdateService;
  let mockUpdateUiService;
  let mockUISetupOrchestrator;
  let mockPerformanceAnimationOrchestrator;
  let mockPerformanceMetricsOrchestrator;
  let mockPerformanceStateOrchestrator;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    const h = createInjectableHarness(AppOrchestrator, {
      overrides: {
        settingsService: { initialize: vi.fn().mockResolvedValue(undefined) },
        updateService: { initialize: vi.fn().mockResolvedValue(undefined) },
        updateUiService: { initialize: vi.fn() },
        uiSetupOrchestrator: createOrchestratorMock({ initializeDeferredComponents: vi.fn() })
      }
    });
    orchestrator = h.subject;
    mockLogger = h.logger;
    ({
      rendererDeviceRuntime: mockRendererDeviceRuntime,
      streamingOrchestrator: mockStreamingOrchestrator,
      streamingAudioOrchestrator: mockStreamingAudioOrchestrator,
      captureOrchestrator: mockCaptureOrchestrator,
      displayModeOrchestrator: mockSettingsDisplayModeOrchestrator,
      settingsService: mockSettingsService,
      updateService: mockUpdateService,
      updateUiService: mockUpdateUiService,
      uiSetupOrchestrator: mockUISetupOrchestrator,
      animationPerformanceOrchestrator: mockPerformanceAnimationOrchestrator,
      performanceMetricsOrchestrator: mockPerformanceMetricsOrchestrator,
      performanceStateOrchestrator: mockPerformanceStateOrchestrator,
      eventBus: mockEventBus
    } = h.deps);
  });

  afterEach(() => {
    document.body.className = '';
  });

  describe('Constructor', () => {
    it('should initialize disposables bag', () => {
      expect(orchestrator.disposables).toBeDefined();
    });

    it('should not have domListeners manager (delegated to UISetupOrchestrator)', () => {
      expect(orchestrator._domListeners).toBeUndefined();
    });
  });

  describe('onInitialize', () => {
    it('should wire high-level events on initialize', async () => {
      await orchestrator.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(EventChannels.DEVICE.STATUS_CHANGED, expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(EventChannels.DEVICE.ENUMERATION_FAILED, expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(2);
    });

    it('should initialize all domain orchestrators', async () => {
      await orchestrator.onInitialize();

      expect(mockRendererDeviceRuntime.initialize).toHaveBeenCalled();
      expect(mockStreamingOrchestrator.initialize).toHaveBeenCalled();
      expect(mockCaptureOrchestrator.initialize).toHaveBeenCalled();
    });

    it('should initialize all application orchestrators', async () => {
      await orchestrator.onInitialize();

      expect(mockSettingsService.initialize).toHaveBeenCalled();
      expect(mockSettingsDisplayModeOrchestrator.initialize).toHaveBeenCalled();
      expect(mockUpdateService.initialize).toHaveBeenCalled();
      expect(mockUpdateUiService.initialize).toHaveBeenCalled();
      expect(mockPerformanceStateOrchestrator.initialize).toHaveBeenCalled();
      expect(mockPerformanceAnimationOrchestrator.initialize).toHaveBeenCalled();
      expect(mockPerformanceMetricsOrchestrator.initialize).toHaveBeenCalled();
      expect(mockUISetupOrchestrator.initialize).toHaveBeenCalled();
    });
  });

  describe('start', () => {
    it('should delegate deferred components initialization to UISetupOrchestrator', async () => {
      await orchestrator.start();

      expect(mockUISetupOrchestrator.initializeDeferredComponents).toHaveBeenCalled();
    });

    it('should delegate UI event listeners to UISetupOrchestrator', async () => {
      await orchestrator.start();

      expect(mockUISetupOrchestrator.setupUIEventListeners).toHaveBeenCalled();
    });
  });

  describe('_handleDeviceStatusChanged', () => {
    it('should update UI when connected', () => {
      const status = { connected: true, device: { name: 'Mod Retro Chromatic' } };

      orchestrator._handleDeviceStatusChanged(status);

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:device-status', { status });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-message', { deviceConnected: true });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Device ready' });
    });

    it('should update UI when disconnected', () => {
      const status = { connected: false };

      orchestrator._handleDeviceStatusChanged(status);

      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:device-status', { status });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-message', { deviceConnected: false });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-visible', { visible: true });
      expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Device disconnected', type: 'warning' });
    });

  });

  describe('onCleanup', () => {
    it('should unsubscribe all subscriptions via cleanup()', async () => {
      const unsubscribe1 = vi.fn();
      const unsubscribe2 = vi.fn();
      orchestrator.track({ dispose: unsubscribe1 });
      orchestrator.track({ dispose: unsubscribe2 });

      await orchestrator.cleanup();

      expect(unsubscribe1).toHaveBeenCalled();
      expect(unsubscribe2).toHaveBeenCalled();
    });

    it('should cleanup all sub-orchestrators in correct order', async () => {
      await orchestrator.onCleanup();

      expect(mockUISetupOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockPerformanceAnimationOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockPerformanceMetricsOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockPerformanceStateOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockSettingsDisplayModeOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockStreamingAudioOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockStreamingOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockCaptureOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockRendererDeviceRuntime.cleanup).toHaveBeenCalled();
    });

    it('should continue cleanup even if one orchestrator fails', async () => {
      const error = new Error('Cleanup failed');
      mockStreamingOrchestrator.cleanup.mockRejectedValue(error);

      await orchestrator.onCleanup();

      expect(mockUISetupOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockCaptureOrchestrator.cleanup).toHaveBeenCalled();
      expect(mockRendererDeviceRuntime.cleanup).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Error cleaning up streamingOrchestrator:', error);
    });
  });
});
