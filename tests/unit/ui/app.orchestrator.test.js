/**
 * AppOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AppOrchestrator } from '@renderer/application/orchestrators/app.orchestrator.ts';
import { EventChannels } from '@renderer/common/config/event-channels';

describe('AppOrchestrator', () => {
  let orchestrator;
  let mockDeviceOrchestrator;
  let mockStreamingOrchestrator;
  let mockStreamingAudioOrchestrator;
  let mockCaptureOrchestrator;
  let mockSettingsOrchestrator;
  let mockUpdateService;
  let mockUiSetupOrchestrator;
  let mockPerformanceOrchestrator;
  let mockUiController;
  let mockAppState;
  let mockSettingsService;
  let mockNotesService;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    mockDeviceOrchestrator = {
      initialize: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined)
    };

    mockStreamingOrchestrator = {
      initialize: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined)
    };

    mockStreamingAudioOrchestrator = {
      initialize: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined)
    };

    mockCaptureOrchestrator = {
      initialize: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined)
    };

    mockSettingsOrchestrator = {
      initialize: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined)
    };

    mockUpdateService = {
      initialize: vi.fn().mockResolvedValue(undefined),
      dispose: vi.fn().mockResolvedValue(undefined)
    };

    mockUiSetupOrchestrator = {
      initialize: vi.fn().mockResolvedValue(undefined),
      setupOverlayClickHandlers: vi.fn(),
      cleanup: vi.fn().mockResolvedValue(undefined)
    };

    mockPerformanceOrchestrator = {
      initialize: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined)
    };

    mockUiController = {
      initializeDeferredComponents: vi.fn(),
      on: vi.fn(),
      toggleSettingsMenu: vi.fn(),
      toggleShaderSelector: vi.fn(),
      elements: {
        streamOverlay: {},
        streamVideo: {},
        streamCanvas: {}
      }
    };

    mockAppState = {
      isStreaming: false
    };

    mockSettingsService = {};
    mockNotesService = {};

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
      streamingAudioOrchestrator: mockStreamingAudioOrchestrator,
      captureOrchestrator: mockCaptureOrchestrator,
      settingsOrchestrator: mockSettingsOrchestrator,
      updateService: mockUpdateService,
      uiSetupOrchestrator: mockUiSetupOrchestrator,
      performanceOrchestrator: mockPerformanceOrchestrator,
      uiController: mockUiController,
      appState: mockAppState,
      settingsService: mockSettingsService,
      notesService: mockNotesService,
      eventBus: mockEventBus,
      loggerFactory: { create: vi.fn(() => mockLogger) }
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('wires high-level subscriptions during initialize', async () => {
    await orchestrator.onInitialize();

    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      EventChannels.DEVICE.STATUS_CHANGED,
      expect.any(Function)
    );
    expect(mockEventBus.subscribe).toHaveBeenCalledWith(
      EventChannels.DEVICE.ENUMERATION_FAILED,
      expect.any(Function)
    );
  });

  it('initializes orchestrators and update service', async () => {
    await orchestrator.onInitialize();

    expect(mockStreamingAudioOrchestrator.initialize).toHaveBeenCalled();
    expect(mockStreamingOrchestrator.initialize).toHaveBeenCalled();
    expect(mockDeviceOrchestrator.initialize).toHaveBeenCalled();
    expect(mockCaptureOrchestrator.initialize).toHaveBeenCalled();
    expect(mockPerformanceOrchestrator.initialize).toHaveBeenCalled();
    expect(mockSettingsOrchestrator.initialize).toHaveBeenCalled();
    expect(mockUpdateService.initialize).toHaveBeenCalled();
    expect(mockUiSetupOrchestrator.initialize).toHaveBeenCalled();
  });

  it('delegates start work to ui controller and ui setup orchestrator', async () => {
    await orchestrator.start();

    // Should initialize deferred components via UIController
    expect(mockUiController.initializeDeferredComponents).toHaveBeenCalledWith(
      expect.objectContaining({
        settingsService: mockSettingsService,
        updateService: mockUpdateService,
        notesService: mockNotesService,
        appState: mockAppState,
        eventBus: mockEventBus
      })
    );

    // Should set up overlay click handlers
    expect(mockUiSetupOrchestrator.setupOverlayClickHandlers).toHaveBeenCalledWith(mockUiController.elements);

    // Should set up UI event listeners
    expect(mockUiController.on).toHaveBeenCalled();
  });

  it('publishes connected device UI events', () => {
    const status = { connected: true, device: { deviceName: 'Chromatic' } };
    orchestrator._handleDeviceStatusChanged(status);

    expect(mockEventBus.publish).toHaveBeenCalledWith('ui:device-status', { status });
    expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-message', { deviceConnected: true });
    expect(mockEventBus.publish).toHaveBeenCalledWith('ui:status-message', { message: 'Device ready' });
  });

  it('publishes disconnected device UI events', () => {
    const status = { connected: false };
    orchestrator._handleDeviceStatusChanged(status);

    expect(mockEventBus.publish).toHaveBeenCalledWith('ui:device-status', { status });
    expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-message', { deviceConnected: false });
    expect(mockEventBus.publish).toHaveBeenCalledWith('ui:overlay-visible', { visible: true });
    expect(mockEventBus.publish).toHaveBeenCalledWith(
      'ui:status-message',
      { message: 'Device disconnected', type: 'warning' }
    );
  });

  it('cleanup disposes updateService and cleans orchestrators', async () => {
    await orchestrator.onCleanup();

    expect(mockUiSetupOrchestrator.cleanup).toHaveBeenCalled();
    expect(mockPerformanceOrchestrator.cleanup).toHaveBeenCalled();
    expect(mockUpdateService.dispose).toHaveBeenCalled();
    expect(mockDeviceOrchestrator.cleanup).toHaveBeenCalled();
  });

  it('continues cleanup when one dependency throws', async () => {
    const error = new Error('cleanup failed');
    mockStreamingOrchestrator.cleanup.mockRejectedValue(error);

    await orchestrator.onCleanup();

    expect(mockDeviceOrchestrator.cleanup).toHaveBeenCalled();
    expect(mockLogger.error).toHaveBeenCalledWith('Error cleaning up streamingOrchestrator:', error);
  });
});
