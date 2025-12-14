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

    mockSettingsService = {};

    mockUiController = {
      enableHeaderAutoHide: vi.fn(),
      disableHeaderAutoHide: vi.fn(),
      enableControlsAutoHide: vi.fn(),
      disableControlsAutoHide: vi.fn(),
      elements: {}
    };

    // Mock stream container element for animation class
    const mockStreamContainer = {
      classList: {
        add: vi.fn(),
        remove: vi.fn()
      }
    };

    // Mock body classList
    const mockBodyClassList = {
      add: vi.fn(),
      remove: vi.fn()
    };

    // Mock document fullscreen API
    global.document = {
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: vi.fn(() => Promise.resolve())
      },
      exitFullscreen: vi.fn(() => Promise.resolve()),
      getElementById: vi.fn((id) => {
        if (id === 'streamContainer') return mockStreamContainer;
        return null;
      }),
      body: {
        classList: mockBodyClassList
      }
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
    it('should request fullscreen when not in fullscreen', async () => {
      document.fullscreenElement = null;

      orchestrator.toggleFullscreen();

      // toggleFullscreen only triggers the request - state management is in _handleFullscreenChange
      expect(document.documentElement.requestFullscreen).toHaveBeenCalled();
    });

    it('should exit fullscreen when in fullscreen', () => {
      document.fullscreenElement = document.documentElement;

      orchestrator.toggleFullscreen();

      // toggleFullscreen only triggers the exit - state management is in _handleFullscreenChange
      expect(document.exitFullscreen).toHaveBeenCalled();
    });

    it('should handle fullscreen error and re-sync state', async () => {
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
      // Should re-sync state on failure
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });
  });

  describe('fullscreenchange event handling', () => {
    let fullscreenChangeHandler;

    beforeEach(() => {
      // Capture the fullscreenchange handler
      document.addEventListener = vi.fn((event, handler) => {
        if (event === 'fullscreenchange') {
          fullscreenChangeHandler = handler;
        }
      });
      document.removeEventListener = vi.fn();
    });

    it('should register fullscreenchange listener on initialize', async () => {
      await orchestrator.onInitialize();

      expect(document.addEventListener).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    });

    it('should remove fullscreenchange listener on cleanup', async () => {
      await orchestrator.onInitialize();
      await orchestrator.onCleanup();

      expect(document.removeEventListener).toHaveBeenCalledWith('fullscreenchange', expect.any(Function));
    });

    it('should enable controls auto-hide when entering fullscreen via system controls', async () => {
      await orchestrator.onInitialize();

      // Simulate entering fullscreen (fullscreenElement is set)
      document.fullscreenElement = document.documentElement;
      fullscreenChangeHandler();

      expect(mockUiController.enableControlsAutoHide).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: true }
      );
    });

    it('should disable controls auto-hide when exiting fullscreen via ESC key', async () => {
      await orchestrator.onInitialize();

      // First enter fullscreen to set state
      document.fullscreenElement = document.documentElement;
      fullscreenChangeHandler();
      mockUiController.disableControlsAutoHide.mockClear();
      mockEventBus.publish.mockClear();

      // Simulate exiting fullscreen (no fullscreenElement)
      document.fullscreenElement = null;
      fullscreenChangeHandler();

      expect(mockUiController.disableControlsAutoHide).toHaveBeenCalled();
      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.FULLSCREEN_STATE,
        { active: false }
      );
    });

    it('should not duplicate work when state has not changed', async () => {
      await orchestrator.onInitialize();

      // Enter fullscreen
      document.fullscreenElement = document.documentElement;
      fullscreenChangeHandler();
      mockUiController.enableControlsAutoHide.mockClear();
      mockEventBus.publish.mockClear();

      // Call handler again with same state
      fullscreenChangeHandler();

      // Should not call again since state hasn't changed
      expect(mockUiController.enableControlsAutoHide).not.toHaveBeenCalled();
      expect(mockEventBus.publish).not.toHaveBeenCalled();
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
