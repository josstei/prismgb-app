/**
 * IPC Channels Unit Tests
 */

import { describe, it, expect } from 'vitest';
import channels from '@infrastructure/ipc/channels.js';

describe('IPC Channels', () => {
  describe('DEVICE channels', () => {
    it('should define GET_STATUS channel', () => {
      expect(channels.DEVICE.GET_STATUS).toBe('device:get-status');
    });

    it('should define CONNECTED channel', () => {
      expect(channels.DEVICE.CONNECTED).toBe('device:connected');
    });

    it('should define DISCONNECTED channel', () => {
      expect(channels.DEVICE.DISCONNECTED).toBe('device:disconnected');
    });
  });

  describe('Structure', () => {
    it('should have DEVICE namespace', () => {
      expect(channels.DEVICE).toBeDefined();
      expect(typeof channels.DEVICE).toBe('object');
    });

    it('should have expected channel count', () => {
      const deviceChannels = Object.keys(channels.DEVICE);
      expect(deviceChannels.length).toBe(3);
    });
  });
});
