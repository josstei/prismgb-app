/**
 * SettingsDisplayModeOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsDisplayModeOrchestrator } from '@renderer/features/settings/services/settings-display-mode.orchestrator.js';

describe('SettingsDisplayModeOrchestrator', () => {
  let orchestrator;
  let mockSettingsFullscreenService;
  let mockSettingsCinematicModeService;
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

    mockSettingsFullscreenService = {
      initialize: vi.fn(),
      dispose: vi.fn(),
      toggleFullscreen: vi.fn(),
      enterFullscreen: vi.fn(),
      exitFullscreen: vi.fn()
    };

    mockSettingsCinematicModeService = {
      toggleCinematicMode: vi.fn()
    };

    mockSettingsService = {
      getFullscreenOnStartup: vi.fn(() => false)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };

    orchestrator = new SettingsDisplayModeOrchestrator({
      fullscreenService: mockSettingsFullscreenService,
      cinematicModeService: mockSettingsCinematicModeService,
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
      expect(orchestrator.fullscreenService).toBe(mockSettingsFullscreenService);
      expect(orchestrator.cinematicModeService).toBe(mockSettingsCinematicModeService);
      expect(orchestrator.settingsService).toBe(mockSettingsService);
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new SettingsDisplayModeOrchestrator({
        fullscreenService: mockSettingsFullscreenService,
        cinematicModeService: mockSettingsCinematicModeService,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });
  });

  describe('onInitialize', () => {
    it('should initialize fullscreen service', async () => {
      await orchestrator.onInitialize();

      expect(mockSettingsFullscreenService.initialize).toHaveBeenCalled();
    });
  });

  describe('onCleanup', () => {
    it('should dispose fullscreen service', async () => {
      await orchestrator.onCleanup();

      expect(mockSettingsFullscreenService.dispose).toHaveBeenCalled();
    });
  });

  describe('toggleFullscreen', () => {
    it('should delegate to fullscreen service', () => {
      orchestrator.toggleFullscreen();

      expect(mockSettingsFullscreenService.toggleFullscreen).toHaveBeenCalled();
    });
  });

  describe('toggleCinematicMode', () => {
    it('should delegate to cinematic mode service', () => {
      orchestrator.toggleCinematicMode();

      expect(mockSettingsCinematicModeService.toggleCinematicMode).toHaveBeenCalled();
    });
  });

  describe('enterFullscreen', () => {
    it('should delegate to fullscreen service', () => {
      orchestrator.enterFullscreen();

      expect(mockSettingsFullscreenService.enterFullscreen).toHaveBeenCalled();
    });
  });

  describe('exitFullscreen', () => {
    it('should delegate to fullscreen service', () => {
      orchestrator.exitFullscreen();

      expect(mockSettingsFullscreenService.exitFullscreen).toHaveBeenCalled();
    });
  });

  describe('_applyStartupBehaviors', () => {
    it('should enter fullscreen when fullscreenOnStartup is enabled', () => {
      mockSettingsService.getFullscreenOnStartup.mockReturnValue(true);

      orchestrator._applyStartupBehaviors();

      expect(mockSettingsFullscreenService.enterFullscreen).toHaveBeenCalled();
    });

    it('should not enter fullscreen when fullscreenOnStartup is disabled', () => {
      mockSettingsService.getFullscreenOnStartup.mockReturnValue(false);

      orchestrator._applyStartupBehaviors();

      expect(mockSettingsFullscreenService.enterFullscreen).not.toHaveBeenCalled();
    });
  });
});
