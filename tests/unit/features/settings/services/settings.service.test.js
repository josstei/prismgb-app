/**
 * SettingsService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service.ts';
import settingsDefinitions from '@shared/features/settings/settings.definitions.json';

describe('SettingsService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let localStorageMock;

  beforeEach(() => {
    localStorageMock = {
      store: {},
      getItem: vi.fn((key) => localStorageMock.store[key] || null),
      setItem: vi.fn((key, value) => { localStorageMock.store[key] = value; }),
      removeItem: vi.fn((key) => { delete localStorageMock.store[key]; }),
      clear: vi.fn(() => { localStorageMock.store = {}; })
    };
    global.localStorage = localStorageMock;

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

    service = new SettingsService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      storageService: localStorageMock
    });
  });

  afterEach(() => {
    localStorageMock.clear();
    delete window.loginItemAPI;
  });

  describe('manifest contract', () => {
    it('uses enforced definitions without compatibility mappings', () => {
      expect(settingsDefinitions.mode).toBe('enforced');
      expect(settingsDefinitions.loadAllPreferencesShape).toEqual([
        'gameVolume',
        'statusStripVisible',
        'performanceMode',
        'minimalistFullscreen'
      ]);
      expect(settingsDefinitions.definitions.some((definition) => 'legacy' in definition)).toBe(false);
      expect(settingsDefinitions.definitions.some((definition) => 'compatibilityNotes' in definition)).toBe(false);
    });

    it('derives defaults, allowed values, and listing from settings definitions', () => {
      const manifestDefaults = Object.fromEntries(
        settingsDefinitions.definitions.map((definition) => [definition.name, definition.default])
      );
      const recordingFormat = settingsDefinitions.definitions.find(
        (definition) => definition.name === 'recordingFormat'
      );

      expect(service.defaults).toEqual(manifestDefaults);
      expect(service.validRecordingFormats).toEqual(recordingFormat.allowedValues);
      expect(service.listSettings()).toEqual(
        settingsDefinitions.definitions.map((definition) => definition.name)
      );
    });
  });

  describe('generic accessors', () => {
    it('reads defaults and saved values by definition name', () => {
      localStorageMock.store.gameVolume = '64';
      localStorageMock.store.minimalistFullscreen = 'true';

      expect(service.getSetting('gameVolume')).toBe(64);
      expect(service.getSetting('minimalistFullscreen')).toBe(true);
      expect(service.getSetting('recordingFormat')).toBe('webm');
      expect(service.getNumberSetting('gameVolume')).toBe(64);
      expect(service.getBooleanSetting('minimalistFullscreen')).toBe(true);
      expect(service.getStringSetting('recordingFormat')).toBe('webm');
    });

    it('fails fast for unknown settings instead of silently creating storage drift', () => {
      expect(() => service.getSetting('missingSetting')).toThrow('Unknown setting: missingSetting');
      expect(() => service.setSetting('missingSetting', true)).toThrow('Unknown setting: missingSetting');
    });

    it('clamps numeric settings and emits manifest events', () => {
      expect(service.setSetting('gameVolume', 140)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('gameVolume', '100');
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:volume-changed', 100);

      expect(service.setSetting('globalBrightness', 0.2)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('globalBrightness', '0.5');
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:brightness-changed', 0.5);
    });

    it('stores boolean settings with manifest event behavior', () => {
      expect(service.setSetting('statusStripVisible', true)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('statusStripVisible', 'true');
      expect(mockEventBus.publish).not.toHaveBeenCalledWith('status-strip-changed', true);

      expect(service.setSetting('performanceMode', true)).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('performanceMode', 'true');
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:performance-mode-changed', true);
    });

    it('validates enum settings', () => {
      expect(service.setSetting('recordingFormat', 'mp4')).toBe(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('recordingFormat', 'mp4');
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:recording-format-changed', 'mp4');

      expect(service.setSetting('recordingFormat', 'avi')).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Invalid recordingFormat: avi. Valid values: webm, mp4, mov');
    });
  });

  describe('loadAllPreferences', () => {
    it('loads preference shape from definition names', () => {
      localStorageMock.store.gameVolume = '30';
      localStorageMock.store.statusStripVisible = 'false';
      localStorageMock.store.performanceMode = 'false';
      localStorageMock.store.minimalistFullscreen = 'true';

      expect(service.loadAllPreferences()).toEqual({
        gameVolume: 30,
        statusStripVisible: false,
        performanceMode: false,
        minimalistFullscreen: true
      });
    });

    it('logs loaded preferences', () => {
      service.loadAllPreferences();

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Loaded preferences - GameVolume: 70%, StatusStrip: false, PerformanceMode: false, MinimalistFullscreen: false'
      );
    });
  });

  describe('launchOnLogin', () => {
    it('queries loginItemAPI through getSetting when available', async () => {
      window.loginItemAPI = { get: vi.fn(() => Promise.resolve(true)), set: vi.fn() };

      const result = await service.getSetting('launchOnLogin');

      expect(result).toBe(true);
      expect(window.loginItemAPI.get).toHaveBeenCalled();
      expect(localStorageMock.setItem).toHaveBeenCalledWith('launchOnLogin', 'true');
    });

    it('falls back to storage through getSetting when loginItemAPI is unavailable', async () => {
      localStorageMock.store.launchOnLogin = 'true';

      await expect(service.getSetting('launchOnLogin')).resolves.toBe(true);
    });

    it('updates loginItemAPI and cache through setSetting', async () => {
      window.loginItemAPI = { get: vi.fn(), set: vi.fn(() => Promise.resolve({ success: true })) };

      await expect(service.setSetting('launchOnLogin', true)).resolves.toBe(true);

      expect(window.loginItemAPI.set).toHaveBeenCalledWith(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('launchOnLogin', 'true');
    });
  });
});
