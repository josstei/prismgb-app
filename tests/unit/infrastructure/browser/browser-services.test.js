/**
 * Browser Services Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { MediaDevicesService } from '@infrastructure/browser/media-devices.service.js';
import { StorageService } from '@infrastructure/browser/storage.service.js';

describe('MediaDevicesService', () => {
  let service;
  let originalNavigator;

  beforeEach(() => {
    originalNavigator = global.navigator;
    global.navigator = {
      mediaDevices: {
        enumerateDevices: vi.fn(() => Promise.resolve([
          { kind: 'videoinput', deviceId: 'camera1', label: 'Camera' },
          { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone' }
        ])),
        getUserMedia: vi.fn(() => Promise.resolve({ id: 'mock-stream' })),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn()
      }
    };
    service = new MediaDevicesService();
  });

  afterEach(() => {
    global.navigator = originalNavigator;
  });

  describe('enumerateDevices', () => {
    it('should delegate to navigator.mediaDevices.enumerateDevices', async () => {
      const devices = await service.enumerateDevices();

      expect(navigator.mediaDevices.enumerateDevices).toHaveBeenCalled();
      expect(devices).toHaveLength(2);
      expect(devices[0].kind).toBe('videoinput');
    });
  });

  describe('getUserMedia', () => {
    it('should delegate to navigator.mediaDevices.getUserMedia', async () => {
      const constraints = { video: true, audio: true };

      const stream = await service.getUserMedia(constraints);

      expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(constraints);
      expect(stream.id).toBe('mock-stream');
    });
  });

  describe('addEventListener', () => {
    it('should delegate to navigator.mediaDevices.addEventListener', () => {
      const handler = vi.fn();

      service.addEventListener('devicechange', handler);

      expect(navigator.mediaDevices.addEventListener).toHaveBeenCalledWith('devicechange', handler);
    });
  });

  describe('removeEventListener', () => {
    it('should delegate to navigator.mediaDevices.removeEventListener', () => {
      const handler = vi.fn();

      service.removeEventListener('devicechange', handler);

      expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith('devicechange', handler);
    });
  });
});

describe('StorageService', () => {
  let service;
  let mockLogger;
  let storageData;

  beforeEach(() => {
    storageData = {};
    mockLogger = {
      warn: vi.fn(),
      error: vi.fn()
    };

    global.localStorage = {
      getItem: vi.fn((key) => storageData[key] ?? null),
      setItem: vi.fn((key, value) => {
        storageData[key] = value;
      }),
      removeItem: vi.fn((key) => {
        delete storageData[key];
      }),
      key: vi.fn((index) => Object.keys(storageData)[index]),
      get length() {
        return Object.keys(storageData).length;
      }
    };
    service = new StorageService({ logger: mockLogger });
  });

  describe('constructor', () => {
    it('should use console as default logger when none provided', () => {
      const defaultService = new StorageService();
      expect(defaultService.logger).toBe(console);
    });

    it('should use provided logger', () => {
      expect(service.logger).toBe(mockLogger);
    });
  });

  describe('PROTECTED_KEYS', () => {
    it('should contain expected protected keys', () => {
      expect(StorageService.PROTECTED_KEYS).toContain('gameVolume');
      expect(StorageService.PROTECTED_KEYS).toContain('statusStripVisible');
      expect(StorageService.PROTECTED_KEYS).toContain('renderPreset');
      expect(StorageService.PROTECTED_KEYS).toContain('globalBrightness');
    });
  });

  describe('getItem', () => {
    it('should delegate to localStorage.getItem', () => {
      storageData['existingKey'] = 'existingValue';
      const value = service.getItem('existingKey');

      expect(localStorage.getItem).toHaveBeenCalledWith('existingKey');
      expect(value).toBe('existingValue');
    });

    it('should return null for non-existent key', () => {
      const value = service.getItem('nonExistent');

      expect(value).toBeNull();
    });

    it('should return null and log warning on error', () => {
      const error = new Error('Storage access denied');
      localStorage.getItem = vi.fn(() => { throw error; });

      const value = service.getItem('testKey');

      expect(value).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'StorageService.getItem failed for key "testKey":',
        'Storage access denied'
      );
    });
  });

  describe('setItem', () => {
    it('should delegate to localStorage.setItem and return true', () => {
      const result = service.setItem('myKey', 'myValue');

      expect(localStorage.setItem).toHaveBeenCalledWith('myKey', 'myValue');
      expect(result).toBe(true);
    });

    it('should attempt cleanup on QuotaExceededError and retry', () => {
      let attempts = 0;
      localStorage.setItem = vi.fn(() => {
        attempts++;
        if (attempts === 1) {
          const error = new Error('Quota exceeded');
          error.name = 'QuotaExceededError';
          throw error;
        }
      });
      storageData['temp1'] = 'value1';
      storageData['temp2'] = 'value2';

      const result = service.setItem('myKey', 'myValue');

      expect(result).toBe(true);
      expect(mockLogger.warn).toHaveBeenCalledWith('StorageService: Quota exceeded, attempting cleanup');
    });

    it('should attempt cleanup on quota error code 22 and retry', () => {
      let attempts = 0;
      localStorage.setItem = vi.fn(() => {
        attempts++;
        if (attempts === 1) {
          const error = new Error('Quota exceeded');
          error.code = 22;
          throw error;
        }
      });

      const result = service.setItem('myKey', 'myValue');

      expect(result).toBe(true);
    });

    it('should return false if quota exceeded after cleanup', () => {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      localStorage.setItem = vi.fn(() => { throw error; });

      const result = service.setItem('myKey', 'myValue');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'StorageService: Quota still exceeded after cleanup for key "myKey"'
      );
    });

    it('should return false and log error for other errors', () => {
      const error = new Error('Unknown storage error');
      localStorage.setItem = vi.fn(() => { throw error; });

      const result = service.setItem('myKey', 'myValue');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'StorageService.setItem failed for key "myKey":',
        'Unknown storage error'
      );
    });
  });

  describe('removeItem', () => {
    it('should delegate to localStorage.removeItem', () => {
      service.removeItem('myKey');

      expect(localStorage.removeItem).toHaveBeenCalledWith('myKey');
    });

    it('should log warning on error', () => {
      const error = new Error('Remove failed');
      localStorage.removeItem = vi.fn(() => { throw error; });

      service.removeItem('testKey');

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'StorageService.removeItem failed for key "testKey":',
        'Remove failed'
      );
    });
  });

  describe('_cleanupOldEntries', () => {
    it('should remove half of non-protected entries', () => {
      storageData['temp1'] = 'value1';
      storageData['temp2'] = 'value2';
      storageData['temp3'] = 'value3';
      storageData['temp4'] = 'value4';

      service._cleanupOldEntries();

      expect(localStorage.removeItem).toHaveBeenCalled();
    });

    it('should not remove protected keys', () => {
      storageData['gameVolume'] = '0.5';
      storageData['renderPreset'] = 'vibrant';
      storageData['statusStripVisible'] = 'true';
      storageData['globalBrightness'] = '1.0';
      storageData['temp1'] = 'value1';
      storageData['temp2'] = 'value2';

      service._cleanupOldEntries();

      const removedKeys = localStorage.removeItem.mock.calls.map(call => call[0]);
      expect(removedKeys).not.toContain('gameVolume');
      expect(removedKeys).not.toContain('renderPreset');
      expect(removedKeys).not.toContain('statusStripVisible');
      expect(removedKeys).not.toContain('globalBrightness');
    });

    it('should handle null keys gracefully', () => {
      localStorage.key = vi.fn((index) => {
        if (index === 0) return null;
        return 'temp1';
      });
      Object.defineProperty(localStorage, 'length', { value: 2 });

      expect(() => service._cleanupOldEntries()).not.toThrow();
    });

    it('should ignore removal errors', () => {
      storageData['temp1'] = 'value1';
      storageData['temp2'] = 'value2';
      localStorage.removeItem = vi.fn(() => {
        throw new Error('Remove failed');
      });

      expect(() => service._cleanupOldEntries()).not.toThrow();
    });
  });
});
