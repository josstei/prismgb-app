/**
 * DisplayModeOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DisplayModeOrchestrator } from '@renderer/features/settings/services/display-mode.orchestrator.js';

describe('DisplayModeOrchestrator', () => {
  let orchestrator;
  let mockFullscreenService;
  let mockCinematicModeService;
  let mockSettingsService;
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

    mockFullscreenService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      toggleFullscreen: vi.fn(),
      enterFullscreen: vi.fn(),
      exitFullscreen: vi.fn()
    };

    mockCinematicModeService = {
      toggleCinematicMode: vi.fn()
    };

    mockSettingsService = {
      getFullscreenOnStartup: vi.fn(() => false)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    orchestrator = new DisplayModeOrchestrator({
      fullscreenService: mockFullscreenService,
      cinematicModeService: mockCinematicModeService,
      settingsService: mockSettingsService,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.fullscreenService).toBe(mockFullscreenService);
      expect(orchestrator.cinematicModeService).toBe(mockCinematicModeService);
      expect(orchestrator.settingsService).toBe(mockSettingsService);
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new DisplayModeOrchestrator({
        fullscreenService: mockFullscreenService,
        cinematicModeService: mockCinematicModeService,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });
  });

  describe('onInitialize', () => {
    it('should initialize fullscreen service', async () => {
      await orchestrator.onInitialize();

      expect(mockFullscreenService.initialize).toHaveBeenCalled();
    });
  });

  describe('onCleanup', () => {
    it('should dispose fullscreen service', async () => {
      await orchestrator.onCleanup();

      expect(mockFullscreenService.dispose).toHaveBeenCalled();
    });
  });

  describe('toggleFullscreen', () => {
    it('should delegate to fullscreen service', () => {
      orchestrator.toggleFullscreen();

      expect(mockFullscreenService.toggleFullscreen).toHaveBeenCalled();
    });
  });

  describe('toggleCinematicMode', () => {
    it('should delegate to cinematic mode service', () => {
      orchestrator.toggleCinematicMode();

      expect(mockCinematicModeService.toggleCinematicMode).toHaveBeenCalled();
    });
  });

  describe('enterFullscreen', () => {
    it('should delegate to fullscreen service', () => {
      orchestrator.enterFullscreen();

      expect(mockFullscreenService.enterFullscreen).toHaveBeenCalled();
    });
  });

  describe('exitFullscreen', () => {
    it('should delegate to fullscreen service', () => {
      orchestrator.exitFullscreen();

      expect(mockFullscreenService.exitFullscreen).toHaveBeenCalled();
    });
  });

  describe('_applyStartupBehaviors', () => {
    it('should enter fullscreen when fullscreenOnStartup is enabled', () => {
      mockSettingsService.getFullscreenOnStartup.mockReturnValue(true);

      orchestrator._applyStartupBehaviors();

      expect(mockFullscreenService.enterFullscreen).toHaveBeenCalled();
    });

    it('should not enter fullscreen when fullscreenOnStartup is disabled', () => {
      mockSettingsService.getFullscreenOnStartup.mockReturnValue(false);

      orchestrator._applyStartupBehaviors();

      expect(mockFullscreenService.enterFullscreen).not.toHaveBeenCalled();
    });
  });
});
