/**
 * SettingsOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsOrchestrator } from '@renderer/application/orchestrators/settings.orchestrator.ts';
import { EventChannels } from '@renderer/common/config/event-channels';

describe('SettingsOrchestrator', () => {
  let orchestrator;
  let mockSettingsService;
  let mockFullscreenService;
  let mockAppState;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
      unsubscribe: vi.fn()
    };

    mockSettingsService = {
      loadAllPreferences: vi.fn(() => ({
        volume: 80,
        statusStripVisible: false,
        performanceMode: true,
        minimalistFullscreen: true
      })),
      getFullscreenOnStartup: vi.fn(() => false)
    };

    mockFullscreenService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      toggleFullscreen: vi.fn(),
      enterFullscreen: vi.fn(),
      exitFullscreen: vi.fn()
    };

    mockAppState = {
      isCinematicModeEnabled: false,
      setCinematicMode: vi.fn()
    };

    orchestrator = new SettingsOrchestrator({
      settingsService: mockSettingsService,
      fullscreenService: mockFullscreenService,
      appState: mockAppState,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.settingsService).toBe(mockSettingsService);
      expect(orchestrator.fullscreenService).toBe(mockFullscreenService);
      expect(orchestrator.appState).toBe(mockAppState);
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new SettingsOrchestrator({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });
  });

  describe('onInitialize', () => {
    it('should initialize fullscreen service', async () => {
      await orchestrator.onInitialize();
      expect(mockFullscreenService.initialize).toHaveBeenCalled();
    });

    it('should subscribe to event channels', async () => {
      await orchestrator.onInitialize();
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.SETTINGS.PREFERENCES_LOADED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_TOGGLE_REQUESTED,
        expect.any(Function)
      );
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED,
        expect.any(Function)
      );
    });

    it('should call loadPreferences', async () => {
      const loadSpy = vi.spyOn(orchestrator, 'loadPreferences');
      await orchestrator.onInitialize();
      expect(loadSpy).toHaveBeenCalled();
    });
  });

  describe('onCleanup', () => {
    it('should dispose fullscreen service', async () => {
      await orchestrator.onCleanup();
      expect(mockFullscreenService.dispose).toHaveBeenCalled();
    });
  });

  describe('loadPreferences', () => {
    it('should load preferences from settings service', async () => {
      await orchestrator.loadPreferences();
      expect(mockSettingsService.loadAllPreferences).toHaveBeenCalled();
    });

    it('should publish volume changed event', async () => {
      await orchestrator.loadPreferences();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.SETTINGS.VOLUME_CHANGED,
        80
      );
    });

    it('should publish performance mode event', async () => {
      await orchestrator.loadPreferences();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED,
        true
      );
    });

    it('should publish minimalist fullscreen event', async () => {
      await orchestrator.loadPreferences();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED,
        true
      );
    });

    it('should publish preferences loaded event', async () => {
      const preferences = {
        volume: 80,
        statusStripVisible: false,
        performanceMode: true,
        minimalistFullscreen: true
      };
      await orchestrator.loadPreferences();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.SETTINGS.PREFERENCES_LOADED,
        preferences
      );
    });

    it('should log success message', async () => {
      await orchestrator.loadPreferences();
      expect(mockLogger.info).toHaveBeenCalledWith('Preferences loaded');
    });

    it('should handle errors gracefully', async () => {
      const error = new Error('Load failed');
      mockSettingsService.loadAllPreferences.mockImplementation(() => {
        throw error;
      });

      await orchestrator.loadPreferences();
      expect(mockLogger.error).toHaveBeenCalledWith('Error loading preferences:', error);
    });
  });

  describe('_applyStartupBehaviors', () => {
    it('should enter fullscreen if enabled in settings', () => {
      mockSettingsService.getFullscreenOnStartup.mockReturnValue(true);
      orchestrator._applyStartupBehaviors();
      expect(mockFullscreenService.enterFullscreen).toHaveBeenCalled();
    });

    it('should not enter fullscreen if disabled in settings', () => {
      mockSettingsService.getFullscreenOnStartup.mockReturnValue(false);
      orchestrator._applyStartupBehaviors();
      expect(mockFullscreenService.enterFullscreen).not.toHaveBeenCalled();
    });
  });

  describe('fullscreen controls', () => {
    it('should delegate toggleFullscreen', () => {
      orchestrator.toggleFullscreen();
      expect(mockFullscreenService.toggleFullscreen).toHaveBeenCalled();
    });

    it('should delegate enterFullscreen', () => {
      orchestrator.enterFullscreen();
      expect(mockFullscreenService.enterFullscreen).toHaveBeenCalled();
    });

    it('should delegate exitFullscreen', () => {
      orchestrator.exitFullscreen();
      expect(mockFullscreenService.exitFullscreen).toHaveBeenCalled();
    });
  });

  describe('toggleCinematicMode', () => {
    it('should toggle cinematic mode in appState and publish event', () => {
      mockAppState.isCinematicModeEnabled = false;
      orchestrator.toggleCinematicMode();

      expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
        { enabled: true }
      );
    });

    it('should toggle off when currently enabled', () => {
      mockAppState.isCinematicModeEnabled = true;
      orchestrator.toggleCinematicMode();

      expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
        { enabled: false }
      );
    });
  });
});
