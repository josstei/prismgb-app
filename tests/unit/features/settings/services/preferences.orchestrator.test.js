/**
 * SettingsPreferencesOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsPreferencesOrchestrator } from '@renderer/application/orchestrators/preferences.orchestrator.ts';
import { EventChannels } from '@shared/events/event-channels.js';
import {
  createAppState,
  createEventBus,
  createLoggerFactory,
  createSettingsServiceMock
} from '../../../../factories/index.js';

describe('SettingsPreferencesOrchestrator', () => {
  let orchestrator;
  let mockSettingsService;
  let mockAppState;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();
    mockEventBus = createEventBus();

    mockSettingsService = createSettingsServiceMock({
      loadAllPreferences: vi.fn(() => ({
        gameVolume: 80,
        statusStripVisible: false,
        performanceMode: true,
        minimalistFullscreen: false
      }))
    });

    mockAppState = createAppState();

    orchestrator = new SettingsPreferencesOrchestrator({
      settingsService: mockSettingsService,
      appState: mockAppState,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('SettingsPreferencesOrchestrator');
  });

  describe('constructor', () => {
    it('should create orchestrator with dependencies', () => {
      expect(orchestrator.settingsService).toBe(mockSettingsService);
      expect(orchestrator.appState).toBe(mockAppState);
      expect(orchestrator.eventBus).toBe(mockEventBus);
    });

    it('should throw if missing required dependencies', () => {
      expect(() => new SettingsPreferencesOrchestrator({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });
  });

  describe('onInitialize', () => {
    it('should call loadPreferences on initialize', async () => {
      const loadSpy = vi.spyOn(orchestrator, 'loadPreferences');

      await orchestrator.onInitialize();

      expect(loadSpy).toHaveBeenCalled();
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
});
