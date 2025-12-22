/**
 * DisplayModeOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { DisplayModeOrchestrator } from '@features/settings/services/display-mode.orchestrator.js';

describe('DisplayModeOrchestrator', () => {
  let orchestrator;
  let mockFullscreenService;
  let mockCinematicModeService;
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
      toggleFullscreen: vi.fn()
    };

    mockCinematicModeService = {
      toggleCinematicMode: vi.fn()
    };

    orchestrator = new DisplayModeOrchestrator({
      fullscreenService: mockFullscreenService,
      cinematicModeService: mockCinematicModeService,
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
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new DisplayModeOrchestrator({
        fullscreenService: mockFullscreenService,
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
});
