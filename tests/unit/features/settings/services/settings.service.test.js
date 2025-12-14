/**
 * SettingsService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SettingsService } from '@features/settings/services/settings.service.js';

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
    });

    it('should have correct setting keys', () => {
      expect(service.keys.VOLUME).toBe('gameVolume');
      expect(service.keys.STATUS_STRIP).toBe('statusStripVisible');
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

    it('should log volume change', () => {
      service.setVolume(60);
      expect(mockLogger.debug).toHaveBeenCalledWith('Volume set to 60%');
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

    it('should emit status-strip-changed event', () => {
      service.setStatusStripVisible(false);
      expect(mockEventBus.publish).toHaveBeenCalledWith('settings:status-strip-changed', false);
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
        statusStripVisible: false
      });
    });

    it('should load saved preferences', () => {
      localStorageMock.store['gameVolume'] = '30';
      localStorageMock.store['statusStripVisible'] = 'false';

      const prefs = service.loadAllPreferences();
      expect(prefs).toEqual({
        volume: 30,
        statusStripVisible: false
      });
    });

    it('should log loaded preferences', () => {
      service.loadAllPreferences();
      expect(mockLogger.info).toHaveBeenCalledWith('Loaded preferences - Volume: 70%, StatusStrip: false');
    });
  });

});
