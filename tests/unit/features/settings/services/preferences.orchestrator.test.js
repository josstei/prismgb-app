/**
 * SettingsPreferencesOrchestrator Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsPreferencesOrchestrator } from '@renderer/features/settings/services/settings-preferences.orchestrator.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

describe('SettingsPreferencesOrchestrator', () => {
  let orchestrator;
  let mockSettingsService;
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
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    mockSettingsService = {
      loadAllPreferences: vi.fn(() => ({
        volume: 80,
        statusStripVisible: false,
        performanceMode: true
      }))
    };

    mockAppState = {};

    orchestrator = new SettingsPreferencesOrchestrator({
      settingsService: mockSettingsService,
      appState: mockAppState,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
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
