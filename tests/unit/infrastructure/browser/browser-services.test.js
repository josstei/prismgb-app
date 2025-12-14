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

  beforeEach(() => {
    // happy-dom provides localStorage, but let's mock it for isolation
    global.localStorage = {
      getItem: vi.fn((key) => {
        if (key === 'existingKey') return 'existingValue';
        return null;
      }),
      setItem: vi.fn()
    };
    service = new StorageService();
  });

  describe('getItem', () => {
    it('should delegate to localStorage.getItem', () => {
      const value = service.getItem('existingKey');

      expect(localStorage.getItem).toHaveBeenCalledWith('existingKey');
      expect(value).toBe('existingValue');
    });

    it('should return null for non-existent key', () => {
      const value = service.getItem('nonExistent');

      expect(value).toBeNull();
    });
  });

  describe('setItem', () => {
    it('should delegate to localStorage.setItem', () => {
      service.setItem('myKey', 'myValue');

      expect(localStorage.setItem).toHaveBeenCalledWith('myKey', 'myValue');
    });
  });
});
