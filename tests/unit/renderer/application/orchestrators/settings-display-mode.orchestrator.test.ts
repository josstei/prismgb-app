// @ts-nocheck
/**
 * SettingsDisplayModeOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsDisplayModeOrchestrator } from '@renderer/application/orchestrators/display-mode.orchestrator.ts';
import {
  createEventBus,
  createLoggerFactory,
  createSettingsCinematicModeServiceMock,
  createSettingsFullscreenServiceMock,
  createSettingsServiceMock
} from '../../../../factories/index.js';
import { installDocumentPropertyMock } from '../../../../support/mocks/browser-api.installers.js';

describe('SettingsDisplayModeOrchestrator', () => {
  let orchestrator;
  let mockSettingsFullscreenService;
  let mockSettingsCinematicModeService;
  let mockSettingsService;
  let mockEventBus;
  let mockLoggerFactory;
  let hiddenMock;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();

    mockSettingsFullscreenService = createSettingsFullscreenServiceMock();
    mockSettingsCinematicModeService = createSettingsCinematicModeServiceMock();

    mockSettingsService = createSettingsServiceMock({
      values: {
        fullscreenOnStartup: false
      }
    });

    mockEventBus = createEventBus();
    hiddenMock = installDocumentPropertyMock('hidden', false);

    orchestrator = new SettingsDisplayModeOrchestrator({
      fullscreenService: mockSettingsFullscreenService,
      cinematicModeService: mockSettingsCinematicModeService,
      settingsService: mockSettingsService,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  afterEach(() => {
    hiddenMock.cleanup();
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
      mockSettingsService.setSetting('fullscreenOnStartup', true);

      orchestrator._applyStartupBehaviors();

      expect(mockSettingsService.getBooleanSetting).toHaveBeenCalledWith('fullscreenOnStartup');
      expect(mockSettingsFullscreenService.enterFullscreen).toHaveBeenCalled();
    });

    it('should not enter fullscreen when fullscreenOnStartup is disabled', () => {
      mockSettingsService.setSetting('fullscreenOnStartup', false);

      orchestrator._applyStartupBehaviors();

      expect(mockSettingsFullscreenService.enterFullscreen).not.toHaveBeenCalled();
    });

    it('should remove deferred startup fullscreen listener during cleanup', async () => {
       mockSettingsService.setSetting('fullscreenOnStartup', true);
       hiddenMock.setValue(true);
       const addListenerSpy = vi.spyOn(document, 'addEventListener');
       const removeListenerSpy = vi.spyOn(document, 'removeEventListener');
 
       orchestrator._applyStartupBehaviors();
       await orchestrator.onCleanup();
 
       expect(addListenerSpy).toHaveBeenCalled();
       expect(addListenerSpy.mock.calls[0][0]).toBe('visibilitychange');
       expect(typeof addListenerSpy.mock.calls[0][1]).toBe('function');
 
       expect(removeListenerSpy).toHaveBeenCalled();
       expect(removeListenerSpy.mock.calls[0][0]).toBe('visibilitychange');
       expect(typeof removeListenerSpy.mock.calls[0][1]).toBe('function');
    });
  });
});
