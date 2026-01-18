/**
 * Browser Services Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BrowserMediaAdapter } from '@renderer/infrastructure/browser/browser-media.adapter.js';
import { BrowserStorageAdapter } from '@renderer/infrastructure/browser/browser-storage.adapter.js';

describe('BrowserMediaAdapter', () => {
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
    service = new BrowserMediaAdapter();
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

    it('should remove handler from tracking map', () => {
      const handler = vi.fn();
      service.addEventListener('devicechange', handler);

      service.removeEventListener('devicechange', handler);

      expect(service._listeners.get('devicechange')).toBeUndefined();
    });

    it('should handle removing non-existent handler gracefully', () => {
      const handler = vi.fn();

      expect(() => service.removeEventListener('devicechange', handler)).not.toThrow();
    });

    it('should remove only the specific handler from tracking', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      service.addEventListener('devicechange', handler1);
      service.addEventListener('devicechange', handler2);

      service.removeEventListener('devicechange', handler1);

      expect(service._listeners.get('devicechange').size).toBe(1);
      expect(service._listeners.get('devicechange').has(handler2)).toBe(true);
    });
  });

  describe('isAvailable', () => {
    it('should return true when mediaDevices is available', () => {
      expect(service.isAvailable()).toBe(true);
    });

    it('should return false when navigator is undefined', () => {
      global.navigator = undefined;
      const newService = new BrowserMediaAdapter();

      expect(newService.isAvailable()).toBe(false);
    });

    it('should return false when mediaDevices is undefined', () => {
      global.navigator = {};
      const newService = new BrowserMediaAdapter();

      expect(newService.isAvailable()).toBe(false);
    });
  });

  describe('_ensureAvailable', () => {
    it('should throw when MediaDevices API is not available', () => {
      global.navigator = undefined;
      const newService = new BrowserMediaAdapter();

      expect(() => newService._ensureAvailable()).toThrow('MediaDevices API not available');
    });

    it('should not throw when MediaDevices API is available', () => {
      expect(() => service._ensureAvailable()).not.toThrow();
    });
  });

  describe('error handling', () => {
    it('should throw when enumerateDevices is called without API', async () => {
      global.navigator = undefined;
      const newService = new BrowserMediaAdapter();

      await expect(newService.enumerateDevices()).rejects.toThrow('MediaDevices API not available');
    });

    it('should throw when getUserMedia is called without API', async () => {
      global.navigator = undefined;
      const newService = new BrowserMediaAdapter();

      await expect(newService.getUserMedia({ video: true })).rejects.toThrow('MediaDevices API not available');
    });

    it('should throw when addEventListener is called without API', () => {
      global.navigator = undefined;
      const newService = new BrowserMediaAdapter();
      const handler = vi.fn();

      expect(() => newService.addEventListener('devicechange', handler)).toThrow('MediaDevices API not available');
    });

    it('should throw when removeEventListener is called without API', () => {
      global.navigator = undefined;
      const newService = new BrowserMediaAdapter();
      const handler = vi.fn();

      expect(() => newService.removeEventListener('devicechange', handler)).toThrow('MediaDevices API not available');
    });
  });

  describe('removeAllListeners', () => {
    it('should remove all tracked event listeners', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      service.addEventListener('devicechange', handler1);
      service.addEventListener('devicechange', handler2);

      service.removeAllListeners();

      expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith('devicechange', handler1);
      expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith('devicechange', handler2);
      expect(service._listeners.size).toBe(0);
    });

    it('should handle multiple event types', () => {
      const handler1 = vi.fn();
      const handler2 = vi.fn();
      service.addEventListener('devicechange', handler1);
      service.addEventListener('someevent', handler2);

      service.removeAllListeners();

      expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith('devicechange', handler1);
      expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith('someevent', handler2);
      expect(service._listeners.size).toBe(0);
    });

    it('should do nothing when API is not available', () => {
      const handler = vi.fn();
      service.addEventListener('devicechange', handler);
      global.navigator = undefined;

      expect(() => service.removeAllListeners()).not.toThrow();
    });

    it('should do nothing when no listeners registered', () => {
      expect(() => service.removeAllListeners()).not.toThrow();
      expect(service._listeners.size).toBe(0);
    });
  });

  describe('dispose', () => {
    it('should call removeAllListeners', () => {
      const handler = vi.fn();
      service.addEventListener('devicechange', handler);

      service.dispose();

      expect(navigator.mediaDevices.removeEventListener).toHaveBeenCalledWith('devicechange', handler);
      expect(service._listeners.size).toBe(0);
    });
  });
});

describe('BrowserStorageAdapter', () => {
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
    service = new BrowserStorageAdapter({ logger: mockLogger });
  });

  describe('constructor', () => {
    it('should use console as default logger when none provided', () => {
      const defaultService = new BrowserStorageAdapter();
      expect(defaultService.logger).toBe(console);
    });

    it('should use provided logger', () => {
      expect(service.logger).toBe(mockLogger);
    });

    it('should use empty array as default protectedKeys when none provided', () => {
      const defaultService = new BrowserStorageAdapter();
      expect(defaultService.protectedKeys).toEqual([]);
    });

    it('should use provided protectedKeys', () => {
      const protectedKeys = ['key1', 'key2'];
      const serviceWithProtectedKeys = new BrowserStorageAdapter({ logger: mockLogger, protectedKeys });
      expect(serviceWithProtectedKeys.protectedKeys).toEqual(protectedKeys);
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
        'BrowserStorageAdapter.getItem failed for key "testKey":',
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
      expect(mockLogger.warn).toHaveBeenCalledWith('BrowserStorageAdapter: Quota exceeded, attempting cleanup');
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
        'BrowserStorageAdapter: Quota still exceeded after cleanup for key "myKey"'
      );
    });

    it('should return false and log error for other errors', () => {
      const error = new Error('Unknown storage error');
      localStorage.setItem = vi.fn(() => { throw error; });

      const result = service.setItem('myKey', 'myValue');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'BrowserStorageAdapter.setItem failed for key "myKey":',
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
        'BrowserStorageAdapter.removeItem failed for key "testKey":',
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
      const protectedKeys = ['gameVolume', 'renderPreset', 'statusStripVisible', 'globalBrightness'];
      const serviceWithProtectedKeys = new BrowserStorageAdapter({ logger: mockLogger, protectedKeys });

      storageData['gameVolume'] = '0.5';
      storageData['renderPreset'] = 'vibrant';
      storageData['statusStripVisible'] = 'true';
      storageData['globalBrightness'] = '1.0';
      storageData['temp1'] = 'value1';
      storageData['temp2'] = 'value2';

      serviceWithProtectedKeys._cleanupOldEntries();

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
