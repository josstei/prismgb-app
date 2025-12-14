/**
 * DisplayModeOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DisplayModeOrchestrator } from '@features/settings/services/display-mode.orchestrator.js';
import { EventChannels } from '@infrastructure/events/event-channels.js';

describe('DisplayModeOrchestrator', () => {
  let orchestrator;
  let mockAppState;
  let mockSettingsService;
  let mockUiController;
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
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    mockAppState = {
      cinematicModeEnabled: false,
      setCinematicMode: vi.fn()
    };

    mockSettingsService = {
      setVolume: vi.fn()
    };

    mockUiController = {
      isVolumeSliderVisible: vi.fn(() => false),
      elements: {
        volumeSlider: { value: '75' }  // Volume slider is 0-100 range (HTML slider min=0 max=100)
      }
    };

    // Mock document fullscreen API
    global.document = {
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: vi.fn(() => Promise.resolve())
      },
      exitFullscreen: vi.fn(() => Promise.resolve())
    };

    orchestrator = new DisplayModeOrchestrator({
      appState: mockAppState,
      settingsService: mockSettingsService,
      uiController: mockUiController,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.appState).toBe(mockAppState);
      expect(orchestrator.settingsService).toBe(mockSettingsService);
      expect(orchestrator.uiController).toBe(mockUiController);
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new DisplayModeOrchestrator({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });
  });

  describe('toggleFullscreen', () => {
    it('should enter fullscreen when not in fullscreen', async () => {
      document.fullscreenElement = null;

      orchestrator.toggleFullscreen();

      expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );
    });

    it('should exit fullscreen when in fullscreen', () => {
      document.fullscreenElement = document.documentElement;

      orchestrator.toggleFullscreen();

      expect(document.exitFullscreen).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });

    it('should handle fullscreen error', async () => {
      document.fullscreenElement = null;
      const error = new Error('Fullscreen denied');
      document.documentElement.requestFullscreen.mockRejectedValue(error);

      orchestrator.toggleFullscreen();

      // Wait for the promise rejection to be handled
      await new Promise(resolve => setTimeout(resolve, 0));

      expect(mockLogger.error).toHaveBeenCalledWith('Error entering fullscreen:', error);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Could not enter fullscreen', type: 'error' }
      );
    });
  });

  describe('toggleVolumeSlider', () => {
    it('should toggle volume slider visibility on', () => {
      mockUiController.isVolumeSliderVisible.mockReturnValue(false);
      const mockEvent = { stopPropagation: vi.fn() };

      orchestrator.toggleVolumeSlider(mockEvent);

      expect(mockEvent.stopPropagation).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.VOLUME_SLIDER_VISIBLE,
        { visible: true }
      );
    });

    it('should toggle volume slider visibility off', () => {
      mockUiController.isVolumeSliderVisible.mockReturnValue(true);
      const mockEvent = { stopPropagation: vi.fn() };

      orchestrator.toggleVolumeSlider(mockEvent);

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.VOLUME_SLIDER_VISIBLE,
        { visible: false }
      );
    });
  });

  describe('handleVolumeSliderChange', () => {
    it('should publish volume level event with normalized 0-1 value', () => {
      orchestrator.handleVolumeSliderChange();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.VOLUME_LEVEL,
        { level: 0.75 }  // 75/100 = 0.75 normalized for video element
      );
    });

    it('should save volume to settings service in 0-100 range', () => {
      orchestrator.handleVolumeSliderChange();

      expect(mockSettingsService.setVolume).toHaveBeenCalledWith(75);  // 0-100 range for storage
    });

    it('should clamp volume to valid 0-100 range', () => {
      mockUiController.elements.volumeSlider.value = '150';  // Out of range
      orchestrator.handleVolumeSliderChange();
      expect(mockSettingsService.setVolume).toHaveBeenCalledWith(100);  // Clamped to max

      mockUiController.elements.volumeSlider.value = '-50';  // Negative
      orchestrator.handleVolumeSliderChange();
      expect(mockSettingsService.setVolume).toHaveBeenCalledWith(0);  // Clamped to min
    });

    it('should handle NaN values', () => {
      mockUiController.elements.volumeSlider.value = 'invalid';  // NaN
      orchestrator.handleVolumeSliderChange();
      expect(mockSettingsService.setVolume).toHaveBeenCalledWith(0);  // Default to 0
    });
  });

  describe('toggleCinematicMode', () => {
    it('should enable cinematic mode when currently disabled', () => {
      mockAppState.cinematicModeEnabled = false;

      orchestrator.toggleCinematicMode();

      expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.CINEMATIC_MODE,
        { enabled: true }
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Cinematic mode enabled' }
      );
    });

    it('should disable cinematic mode when currently enabled', () => {
      mockAppState.cinematicModeEnabled = true;

      orchestrator.toggleCinematicMode();

      expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.CINEMATIC_MODE,
        { enabled: false }
      );
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.STATUS_MESSAGE,
        { message: 'Cinematic mode disabled' }
      );
    });
  });
});
