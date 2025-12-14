/**
 * IDeviceAdapter Interface Unit Tests
 */

import { describe, it, expect } from 'vitest';
import { IDeviceAdapter } from '@shared/interfaces/device-adapter.interface.js';

describe('IDeviceAdapter', () => {
  let adapter;

  beforeEach(() => {
    adapter = new IDeviceAdapter();
  });

  describe('Interface Methods', () => {
    it('should throw on initialize()', async () => {
      await expect(adapter.initialize({})).rejects.toThrow('initialize() must be implemented');
    });

    it('should throw on getStream()', async () => {
      await expect(adapter.getStream()).rejects.toThrow('getStream() must be implemented');
    });

    it('should throw on getStream() with options', async () => {
      await expect(adapter.getStream({ includeAudio: true })).rejects.toThrow('getStream() must be implemented');
    });

    it('should throw on releaseStream()', async () => {
      await expect(adapter.releaseStream({})).rejects.toThrow('releaseStream() must be implemented');
    });

    it('should throw on getCapabilities()', () => {
      expect(() => adapter.getCapabilities()).toThrow('getCapabilities() must be implemented');
    });

    it('should throw on getProfile()', () => {
      expect(() => adapter.getProfile()).toThrow('getProfile() must be implemented');
    });

    it('should throw on cleanup()', async () => {
      await expect(adapter.cleanup()).rejects.toThrow('cleanup() must be implemented');
    });
  });

  describe('Subclass Implementation', () => {
    it('should allow subclasses to override methods', () => {
      class TestAdapter extends IDeviceAdapter {
        async initialize(deviceInfo) {
          this.deviceInfo = deviceInfo;
        }

        async getStream(options) {
          return { id: 'test-stream', options };
        }

        async releaseStream(stream) {
          // No-op
        }

        getCapabilities() {
          return { hasAudio: true, hasVideo: true };
        }

        getProfile() {
          return { name: 'test' };
        }

        async cleanup() {
          this.deviceInfo = null;
        }
      }

      const testAdapter = new TestAdapter();

      expect(async () => await testAdapter.initialize({ id: '123' })).not.toThrow();
      expect(testAdapter.getCapabilities()).toEqual({ hasAudio: true, hasVideo: true });
      expect(testAdapter.getProfile()).toEqual({ name: 'test' });
    });
  });
});
