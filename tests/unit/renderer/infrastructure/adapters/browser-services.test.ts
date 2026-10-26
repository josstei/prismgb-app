/**
 * Browser Services Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { BrowserMediaDevicesPort } from '@renderer/infrastructure/services/devices/browser-media-devices.port.js';
import { BrowserStorageAdapter } from '@renderer/infrastructure/adapters/browser-storage.adapter.js';
import type { LoggerLike } from '@platform/core';
import { createLogger } from '../../../../factories/index.js';
import {
  installLocalStorageMock,
  installMediaMocks,
  installNavigatorMock
} from '../../../../support/mocks/browser-api.installers.js';

type NavigatorMockValue = Navigator | Partial<Navigator> | undefined;
type BrowserStorageAdapterInternals = {
  logger: LoggerLike;
  protectedKeys: string[];
};

function storageInternals(service: BrowserStorageAdapter): BrowserStorageAdapterInternals {
  return service as unknown as BrowserStorageAdapterInternals;
}

function withNavigatorMock<T>(value: NavigatorMockValue, assertion: () => T): T {
  const navigatorMock = installNavigatorMock(value);

  try {
    return assertion();
  } finally {
    navigatorMock.cleanup();
  }
}

async function withNavigatorMockAsync<T>(value: NavigatorMockValue, assertion: () => Promise<T>): Promise<T> {
  const navigatorMock = installNavigatorMock(value);

  try {
    return await assertion();
  } finally {
    navigatorMock.cleanup();
  }
}

describe('installMediaMocks', () => {
  it('should preserve existing navigator prototype properties while installing mediaDevices', () => {
    const navigatorPrototype: { userAgent?: string } = {};
    Object.defineProperty(navigatorPrototype, 'userAgent', {
      configurable: true,
      get: () => 'preserved-test-agent',
    });
    const customNavigator = Object.create(navigatorPrototype) as Navigator;
    const navigatorMock = installNavigatorMock(customNavigator);
    let mediaMock: ReturnType<typeof installMediaMocks> | undefined;

    try {
      mediaMock = installMediaMocks();

      expect(navigator).toBe(customNavigator);
      expect(navigator.userAgent).toBe('preserved-test-agent');
      expect(navigator.mediaDevices.getUserMedia).toEqual(expect.any(Function));
    } finally {
      mediaMock?.cleanup();
      navigatorMock.cleanup();
    }
  });
});

describe('BrowserMediaDevicesPort', () => {
  let service: BrowserMediaDevicesPort;
  let mediaMock: ReturnType<typeof installMediaMocks>;

  beforeEach(() => {
    vi.useFakeTimers();
    mediaMock = installMediaMocks({
      devices: [
        { kind: 'videoinput', deviceId: 'camera1', label: 'Camera' },
        { kind: 'audioinput', deviceId: 'mic1', label: 'Microphone' }
      ],
      stream: { id: 'mock-stream' }
    });
    service = new BrowserMediaDevicesPort(undefined, undefined, 50);
  });

  afterEach(() => {
    mediaMock.cleanup();
    vi.useRealTimers();
  });

  it('enumerates and acquires media through the browser API', async () => {
    const devices = await service.enumerateDevices();
    expect(devices).toHaveLength(2);
    expect(devices[0].kind).toBe('videoinput');
    const constraints = { video: true, audio: true };
    const stream = await service.getUserMedia(constraints);
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith(constraints);
    expect(stream.id).toBe('mock-stream');
  });

  it('supports an injected media source without accessing navigator', async () => {
    const injected = new BrowserMediaDevicesPort(mediaMock.mediaDevices);
    await withNavigatorMockAsync(undefined, async () => {
      await expect(injected.enumerateDevices()).resolves.toHaveLength(2);
      await expect(injected.getUserMedia({ video: true })).resolves.toHaveProperty('id', 'mock-stream');
    });
  });

  it('debounces device changes and cancels pending callbacks when unsubscribed', () => {
    const onChange = vi.fn();
    const unsubscribe = service.subscribeDeviceChange(onChange);
    mediaMock.mediaDevices._emitDeviceChange();
    mediaMock.mediaDevices._emitDeviceChange();
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(50);
    expect(onChange).toHaveBeenCalledOnce();
    mediaMock.mediaDevices._emitDeviceChange();
    unsubscribe();
    mediaMock.mediaDevices._emitDeviceChange();
    vi.runAllTimers();
    expect(onChange).toHaveBeenCalledOnce();
  });

  it('releases each subscription independently against its original source', () => {
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = service.subscribeDeviceChange(first);
    const releaseSecond = service.subscribeDeviceChange(second);
    withNavigatorMock(undefined, releaseFirst);
    mediaMock.mediaDevices._emitDeviceChange();
    vi.runAllTimers();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    releaseSecond();
  });

  it.each([undefined, {}])('rejects operations when the browser API is absent (%s)', async (value) => {
    await withNavigatorMockAsync(value, async () => {
      const unavailable = new BrowserMediaDevicesPort();
      await expect(unavailable.enumerateDevices()).rejects.toThrow('MediaDevices API not available');
      await expect(unavailable.getUserMedia({ video: true })).rejects.toThrow('MediaDevices API not available');
      expect(() => unavailable.subscribeDeviceChange(vi.fn())).toThrow('MediaDevices API not available');
    });
  });
});

describe('BrowserStorageAdapter', () => {
  let service: BrowserStorageAdapter;
  let mockLogger: ReturnType<typeof createLogger>;
  let storageData: Record<string, string>;
  let localStorageMock: ReturnType<typeof installLocalStorageMock>;

  beforeEach(() => {
    mockLogger = createLogger({ name: 'BrowserStorageAdapter' });
    localStorageMock = installLocalStorageMock();
    storageData = localStorageMock.storageData;
    service = new BrowserStorageAdapter({ logger: mockLogger });
  });

  afterEach(() => {
    localStorageMock.cleanup();
  });

  describe('constructor', () => {
    it('should use console as default logger when none provided', () => {
      const defaultService = new BrowserStorageAdapter();
      expect(storageInternals(defaultService).logger).toBe(console);
    });

    it('should use provided logger', () => {
      expect(storageInternals(service).logger).toBe(mockLogger);
    });

    it('should use empty array as default protectedKeys when none provided', () => {
      const defaultService = new BrowserStorageAdapter();
      expect(storageInternals(defaultService).protectedKeys).toEqual([]);
    });

    it('should use provided protectedKeys', () => {
      const protectedKeys = ['key1', 'key2'];
      const serviceWithProtectedKeys = new BrowserStorageAdapter({ logger: mockLogger, protectedKeys });
      expect(storageInternals(serviceWithProtectedKeys).protectedKeys).toEqual(protectedKeys);
    });
  });

  describe('getItem', () => {
    it('should delegate to localStorage.getItem', () => {
      storageData['existingKey'] = 'existingValue';
      const value = service.getItem('existingKey');

      expect(localStorageMock.getItem).toHaveBeenCalledWith('existingKey');
      expect(value).toBe('existingValue');
    });

    it('should return null for non-existent key', () => {
      const value = service.getItem('nonExistent');

      expect(value).toBeNull();
    });

    it('should return null and log warning on error', () => {
      const error = new Error('Storage access denied');
      localStorageMock.getItem.mockImplementation(() => { throw error; });

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

      expect(localStorageMock.setItem).toHaveBeenCalledWith('myKey', 'myValue');
      expect(result).toBe(true);
    });

    it('should attempt cleanup on QuotaExceededError and retry', () => {
      let attempts = 0;
      localStorageMock.setItem.mockImplementation(() => {
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
      localStorageMock.setItem.mockImplementation(() => {
        attempts++;
        if (attempts === 1) {
          const error = Object.assign(new Error('Quota exceeded'), { code: 22 }) as unknown as Error & { code: string };
          throw error;
        }
      });

      const result = service.setItem('myKey', 'myValue');

      expect(result).toBe(true);
    });

    it('should return false if quota exceeded after cleanup', () => {
      const error = new Error('Quota exceeded');
      error.name = 'QuotaExceededError';
      localStorageMock.setItem.mockImplementation(() => { throw error; });

      const result = service.setItem('myKey', 'myValue');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'BrowserStorageAdapter: Quota still exceeded after cleanup for key "myKey"'
      );
    });

    it('should return false and log error for other errors', () => {
      const error = new Error('Unknown storage error');
      localStorageMock.setItem.mockImplementation(() => { throw error; });

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

      expect(localStorageMock.removeItem).toHaveBeenCalledWith('myKey');
    });

    it('should log warning on error', () => {
      const error = new Error('Remove failed');
      localStorageMock.removeItem.mockImplementation(() => { throw error; });

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

      expect(localStorageMock.removeItem).toHaveBeenCalled();
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

      const removedKeys: string[] = localStorageMock.removeItem.mock.calls.map((call) => call[0]);
      expect(removedKeys).not.toContain('gameVolume');
      expect(removedKeys).not.toContain('renderPreset');
      expect(removedKeys).not.toContain('statusStripVisible');
      expect(removedKeys).not.toContain('globalBrightness');
    });

    it('should handle null keys gracefully', () => {
      localStorageMock.key.mockImplementation((index) => {
        if (index === 0) return null;
        return 'temp1';
      });
      vi.spyOn(localStorageMock.localStorage, 'length', 'get').mockReturnValue(2);

      expect(() => service._cleanupOldEntries()).not.toThrow();
    });

    it('should ignore removal errors', () => {
      storageData['temp1'] = 'value1';
      storageData['temp2'] = 'value2';
      localStorageMock.removeItem.mockImplementation(() => {
        throw new Error('Remove failed');
      });

      expect(() => service._cleanupOldEntries()).not.toThrow();
    });
  });
});
