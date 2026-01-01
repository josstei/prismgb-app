/**
 * AcquisitionContext Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AcquisitionContext } from '@shared/streaming/acquisition/acquisition-context.class.js';

describe('AcquisitionContext', () => {
  describe('Constructor', () => {
    it('should create context with required deviceId', () => {
      const context = new AcquisitionContext({ deviceId: 'device-123' });

      expect(context.deviceId).toBe('device-123');
      expect(context.groupId).toBeNull();
      expect(context.profile).toEqual({});
    });

    it('should create context with deviceId and groupId', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        groupId: 'group-456'
      });

      expect(context.deviceId).toBe('device-123');
      expect(context.groupId).toBe('group-456');
    });

    it('should create context with profile', () => {
      const profile = {
        audio: { sampleRate: 48000 },
        video: { width: 160, height: 144 }
      };

      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile
      });

      expect(context.profile).toEqual(profile);
    });

    it('should throw error if deviceId is missing', () => {
      expect(() => {
        new AcquisitionContext({});
      }).toThrow('AcquisitionContext requires deviceId');
    });

    it('should throw error if deviceId is null', () => {
      expect(() => {
        new AcquisitionContext({ deviceId: null });
      }).toThrow('AcquisitionContext requires deviceId');
    });

    it('should throw error if deviceId is empty string', () => {
      expect(() => {
        new AcquisitionContext({ deviceId: '' });
      }).toThrow('AcquisitionContext requires deviceId');
    });

    it('should freeze the profile object', () => {
      const profile = { audio: { sampleRate: 48000 } };
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile
      });

      expect(Object.isFrozen(context.profile)).toBe(true);
    });

    it('should freeze the context instance', () => {
      const context = new AcquisitionContext({ deviceId: 'device-123' });

      expect(Object.isFrozen(context)).toBe(true);
    });

    it('should set createdAt timestamp', () => {
      const beforeCreation = Date.now();
      const context = new AcquisitionContext({ deviceId: 'device-123' });
      const afterCreation = Date.now();

      expect(context.createdAt).toBeGreaterThanOrEqual(beforeCreation);
      expect(context.createdAt).toBeLessThanOrEqual(afterCreation);
    });

    it('should create shallow copy of profile (nested objects not deep cloned)', () => {
      const profile = { audio: { sampleRate: 48000 } };
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile
      });

      // The profile object itself is frozen and a separate copy
      expect(Object.isFrozen(context.profile)).toBe(true);
      expect(context.profile).not.toBe(profile);

      // However, nested objects are shallow references (not deep cloned)
      // This is a known limitation of the spread operator
      expect(context.profile.audio).toBe(profile.audio);
    });
  });

  describe('Immutability', () => {
    it('should prevent modification of deviceId', () => {
      const context = new AcquisitionContext({ deviceId: 'device-123' });

      expect(() => {
        context.deviceId = 'new-device';
      }).toThrow();
    });

    it('should prevent modification of groupId', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        groupId: 'group-456'
      });

      expect(() => {
        context.groupId = 'new-group';
      }).toThrow();
    });

    it('should prevent modification of profile', () => {
      const context = new AcquisitionContext({ deviceId: 'device-123' });

      expect(() => {
        context.profile = { new: 'profile' };
      }).toThrow();
    });

    it('should prevent modification of createdAt', () => {
      const context = new AcquisitionContext({ deviceId: 'device-123' });

      expect(() => {
        context.createdAt = Date.now();
      }).toThrow();
    });
  });

  describe('getDeviceConstraint', () => {
    it('should return exact constraint for deviceId', () => {
      const context = new AcquisitionContext({ deviceId: 'device-123' });
      const constraint = context.getDeviceConstraint();

      expect(constraint).toEqual({ exact: 'device-123' });
    });

    it('should always return exact constraint regardless of groupId', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        groupId: 'group-456'
      });
      const constraint = context.getDeviceConstraint();

      expect(constraint).toEqual({ exact: 'device-123' });
    });
  });

  describe('getAudioDeviceConstraint', () => {
    it('should return groupId constraint when groupId is present', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        groupId: 'group-456'
      });
      const constraint = context.getAudioDeviceConstraint();

      expect(constraint).toEqual({ groupId: 'group-456' });
    });

    it('should fallback to exact deviceId when groupId is null', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        groupId: null
      });
      const constraint = context.getAudioDeviceConstraint();

      expect(constraint).toEqual({ exact: 'device-123' });
    });

    it('should fallback to exact deviceId when groupId is not provided', () => {
      const context = new AcquisitionContext({ deviceId: 'device-123' });
      const constraint = context.getAudioDeviceConstraint();

      expect(constraint).toEqual({ exact: 'device-123' });
    });
  });

  describe('hasAudioProfile', () => {
    it('should return true when audio profile exists', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { audio: { sampleRate: 48000 } }
      });

      expect(context.hasAudioProfile()).toBe(true);
    });

    it('should return false when audio profile is missing', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { video: { width: 160, height: 144 } }
      });

      expect(context.hasAudioProfile()).toBe(false);
    });

    it('should return false when profile is empty', () => {
      const context = new AcquisitionContext({ deviceId: 'device-123' });

      expect(context.hasAudioProfile()).toBe(false);
    });

    it('should return false when audio is null', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { audio: null }
      });

      expect(context.hasAudioProfile()).toBe(false);
    });

    it('should return false when audio is undefined', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { audio: undefined }
      });

      expect(context.hasAudioProfile()).toBe(false);
    });

    it('should return true for empty audio object (truthy)', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { audio: {} }
      });

      expect(context.hasAudioProfile()).toBe(true);
    });
  });

  describe('hasVideoProfile', () => {
    it('should return true when video profile exists', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { video: { width: 160, height: 144 } }
      });

      expect(context.hasVideoProfile()).toBe(true);
    });

    it('should return false when video profile is missing', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { audio: { sampleRate: 48000 } }
      });

      expect(context.hasVideoProfile()).toBe(false);
    });

    it('should return false when profile is empty', () => {
      const context = new AcquisitionContext({ deviceId: 'device-123' });

      expect(context.hasVideoProfile()).toBe(false);
    });

    it('should return false when video is null', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { video: null }
      });

      expect(context.hasVideoProfile()).toBe(false);
    });

    it('should return false when video is undefined', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { video: undefined }
      });

      expect(context.hasVideoProfile()).toBe(false);
    });

    it('should return true for empty video object (truthy)', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        profile: { video: {} }
      });

      expect(context.hasVideoProfile()).toBe(true);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle context with both audio and video profiles', () => {
      const context = new AcquisitionContext({
        deviceId: 'device-123',
        groupId: 'group-456',
        profile: {
          audio: { sampleRate: 48000, channels: 2 },
          video: { width: 160, height: 144, frameRate: 60 }
        }
      });

      expect(context.hasAudioProfile()).toBe(true);
      expect(context.hasVideoProfile()).toBe(true);
      expect(context.getDeviceConstraint()).toEqual({ exact: 'device-123' });
      expect(context.getAudioDeviceConstraint()).toEqual({ groupId: 'group-456' });
    });

    it('should handle USB composite device scenario (different audio/video deviceIds)', () => {
      // Simulates USB device with separate audio/video devices in same group
      const context = new AcquisitionContext({
        deviceId: 'video-device-123', // Video capture device ID
        groupId: 'usb-group-456', // Shared USB group
        profile: {
          audio: { sampleRate: 48000 },
          video: { width: 160, height: 144 }
        }
      });

      // Video constraint uses exact video device ID
      expect(context.getDeviceConstraint()).toEqual({ exact: 'video-device-123' });

      // Audio constraint uses groupId to find matching audio device
      expect(context.getAudioDeviceConstraint()).toEqual({ groupId: 'usb-group-456' });
    });

    it('should handle simple device scenario (single deviceId, no groupId)', () => {
      const context = new AcquisitionContext({
        deviceId: 'unified-device-123',
        profile: {
          audio: { sampleRate: 48000 },
          video: { width: 160, height: 144 }
        }
      });

      // Both constraints use same deviceId when no groupId
      expect(context.getDeviceConstraint()).toEqual({ exact: 'unified-device-123' });
      expect(context.getAudioDeviceConstraint()).toEqual({ exact: 'unified-device-123' });
    });

    it('should preserve context state throughout lifecycle', () => {
      const profile = {
        audio: { sampleRate: 48000 },
        video: { width: 160, height: 144 }
      };

      const context = new AcquisitionContext({
        deviceId: 'device-123',
        groupId: 'group-456',
        profile
      });

      // Initial state
      const initialDeviceId = context.deviceId;
      const initialGroupId = context.groupId;
      const initialProfile = context.profile;
      const initialCreatedAt = context.createdAt;

      // Attempt operations that might lose state in mutable implementations
      context.getDeviceConstraint();
      context.getAudioDeviceConstraint();
      context.hasAudioProfile();
      context.hasVideoProfile();

      // State should be unchanged
      expect(context.deviceId).toBe(initialDeviceId);
      expect(context.groupId).toBe(initialGroupId);
      expect(context.profile).toBe(initialProfile);
      expect(context.createdAt).toBe(initialCreatedAt);
    });
  });
});
