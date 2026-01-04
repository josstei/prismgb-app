/**
 * SettingsService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsService } from '@renderer/features/settings/services/settings.service.js';

describe('SettingsService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let localStorageMock;

  beforeEach(() => {
    // Mock localStorage
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
  });

  describe('Constructor', () => {
    it('should create service with default settings', () => {
      expect(service.defaults.gameVolume).toBe(70);
      expect(service.defaults.statusStripVisible).toBe(false);
      expect(service.defaults.performanceMode).toBe(false);
      expect(service.defaults.fullscreenOnStartup).toBe(false);
      expect(service.defaults.minimalistFullscreen).toBe(false);
    });

    it('should have correct setting keys', () => {
      expect(service.keys.VOLUME).toBe('gameVolume');
      expect(service.keys.STATUS_STRIP).toBe('statusStripVisible');
      expect(service.keys.RENDER_PRESET).toBe('renderPreset');
      expect(service.keys.GLOBAL_BRIGHTNESS).toBe('globalBrightness');
      expect(service.keys.PERFORMANCE_MODE).toBe('performanceMode');
      expect(service.keys.FULLSCREEN_ON_STARTUP).toBe('fullscreenOnStartup');
      expect(service.keys.MINIMALIST_FULLSCREEN).toBe('minimalistFullscreen');
    });
  });

  describe('getVolume', () => {
    it('should return default volume when not set', () => {
      expect(service.getVolume()).toBe(70);
    });

    it('should return saved volume', () => {
      localStorageMock.store['gameVolume'] = '50';
      expect(service.getVolume()).toBe(50);
    });

    it('should parse stored value as integer', () => {
      localStorageMock.store['gameVolume'] = '85';
      expect(service.getVolume()).toBe(85);
    });
  });

  describe('setVolume', () => {
    it('should save volume to localStorage', () => {
      service.setVolume(80);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('gameVolume', '80');
    });

    it('should clamp volume to 0-100 range (high)', () => {
      service.setVolume(150);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('gameVolume', '100');
    });

    it('should clamp volume to 0-100 range (low)', () => {
      service.setVolume(-20);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('gameVolume', '0');
    });

    it('should emit volume-changed event', () => {
      service.setVolume(50);
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:volume-changed', 50);
    });
  });

  describe('getStatusStripVisible', () => {
    it('should return default status strip visibility when not set', () => {
      expect(service.getStatusStripVisible()).toBe(false);
    });

    it('should return true when stored as "true"', () => {
      localStorageMock.store['statusStripVisible'] = 'true';
      expect(service.getStatusStripVisible()).toBe(true);
    });

    it('should return false when stored as "false"', () => {
      localStorageMock.store['statusStripVisible'] = 'false';
      expect(service.getStatusStripVisible()).toBe(false);
    });
  });

  describe('setStatusStripVisible', () => {
    it('should save status strip visibility to localStorage', () => {
      service.setStatusStripVisible(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('statusStripVisible', 'false');
    });

    it('should log status strip shown', () => {
      service.setStatusStripVisible(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Status strip shown');
    });

    it('should log status strip hidden', () => {
      service.setStatusStripVisible(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Status strip hidden');
    });
  });

  describe('loadAllPreferences', () => {
    it('should load all preferences with defaults', () => {
      const prefs = service.loadAllPreferences();
      expect(prefs).toEqual({
        volume: 70,
        statusStripVisible: false,
        performanceMode: false,
        minimalistFullscreen: false
      });
    });

    it('should load saved preferences', () => {
      localStorageMock.store['gameVolume'] = '30';
      localStorageMock.store['statusStripVisible'] = 'false';
      localStorageMock.store['performanceMode'] = 'false';
      localStorageMock.store['minimalistFullscreen'] = 'true';

      const prefs = service.loadAllPreferences();
      expect(prefs).toEqual({
        volume: 30,
        statusStripVisible: false,
        performanceMode: false,
        minimalistFullscreen: true
      });
    });

    it('should log loaded preferences', () => {
      service.loadAllPreferences();
      expect(mockLogger.info).toHaveBeenCalledWith('Loaded preferences - Volume: 70%, StatusStrip: false, PerformanceMode: false, MinimalistFullscreen: false');
    });
  });

  describe('getGlobalBrightness', () => {
    it('should return default brightness when not set', () => {
      expect(service.getGlobalBrightness()).toBe(1.0);
    });

    it('should return saved brightness', () => {
      localStorageMock.store['globalBrightness'] = '0.8';
      expect(service.getGlobalBrightness()).toBe(0.8);
    });

    it('should parse stored value as float', () => {
      localStorageMock.store['globalBrightness'] = '1.25';
      expect(service.getGlobalBrightness()).toBe(1.25);
    });
  });

  describe('setGlobalBrightness', () => {
    it('should save brightness to localStorage', () => {
      service.setGlobalBrightness(1.2);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('globalBrightness', '1.2');
    });

    it('should clamp brightness to 0.5-1.5 range (high)', () => {
      service.setGlobalBrightness(2.0);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('globalBrightness', '1.5');
    });

    it('should clamp brightness to 0.5-1.5 range (low)', () => {
      service.setGlobalBrightness(0.2);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('globalBrightness', '0.5');
    });

    it('should emit brightness-changed event', () => {
      service.setGlobalBrightness(0.9);
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:brightness-changed', 0.9);
    });

    it('should emit clamped value in event', () => {
      service.setGlobalBrightness(2.0);
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:brightness-changed', 1.5);
    });

    it('should log brightness change', () => {
      service.setGlobalBrightness(0.75);
      expect(mockLogger.debug).toHaveBeenCalledWith('Global brightness set to 0.75');
    });
  });

  describe('getPerformanceMode', () => {
    it('should return default when not set', () => {
      expect(service.getPerformanceMode()).toBe(false);
    });

    it('should return saved preference (true)', () => {
      localStorageMock.store['performanceMode'] = 'true';
      expect(service.getPerformanceMode()).toBe(true);
    });

    it('should return saved preference (false)', () => {
      localStorageMock.store['performanceMode'] = 'false';
      expect(service.getPerformanceMode()).toBe(false);
    });
  });

  describe('setPerformanceMode', () => {
    it('should save preference to localStorage', () => {
      service.setPerformanceMode(false);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('performanceMode', 'false');
    });

    it('should emit performance mode changed event', () => {
      service.setPerformanceMode(true);
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:performance-mode-changed', true);
    });

    it('should log preference change', () => {
      service.setPerformanceMode(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Performance mode disabled');
    });
  });

  describe('getFullscreenOnStartup', () => {
    it('should return default when not set', () => {
      expect(service.getFullscreenOnStartup()).toBe(false);
    });

    it('should return saved preference (true)', () => {
      localStorageMock.store['fullscreenOnStartup'] = 'true';
      expect(service.getFullscreenOnStartup()).toBe(true);
    });

    it('should return saved preference (false)', () => {
      localStorageMock.store['fullscreenOnStartup'] = 'false';
      expect(service.getFullscreenOnStartup()).toBe(false);
    });
  });

  describe('setFullscreenOnStartup', () => {
    it('should save preference to localStorage', () => {
      service.setFullscreenOnStartup(true);
      expect(localStorageMock.setItem).toHaveBeenCalledWith('fullscreenOnStartup', 'true');
    });

    it('should log preference change (enabled)', () => {
      service.setFullscreenOnStartup(true);
      expect(mockLogger.debug).toHaveBeenCalledWith('Fullscreen on startup enabled');
    });

    it('should log preference change (disabled)', () => {
      service.setFullscreenOnStartup(false);
      expect(mockLogger.debug).toHaveBeenCalledWith('Fullscreen on startup disabled');
    });
  });

});
