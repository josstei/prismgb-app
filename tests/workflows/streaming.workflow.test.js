/**
 * Streaming Workflow Integration Tests
 *
 * Tests complete streaming workflows from device connection to rendering.
 * Validates state machines, event sequences, and error recovery.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createEventBus } from '../factories/event-bus.factory.js';
import { createAppState } from '../factories/app-state.factory.js';
import { createLoggerFactory } from '../factories/logger.factory.js';
import { createDeviceService, createDeviceAdapter } from '../factories/device.factory.js';
import { createStreamingService, StreamingState } from '../factories/stream.factory.js';
import {
  MockDeviceStateMachine,
  DeviceState,
  createChromaticWithFSM,
} from '../mocks/MockDeviceStateMachine.js';
import { CHROMATIC_DEVICE, CHROMATIC_CAPABILITIES } from '../fixtures/devices.fixture.js';
import { STREAM_EVENTS } from '../fixtures/streams.fixture.js';
import { EventChannels } from '../../src/renderer/common/config/event-channels';

describe('Streaming Workflow Integration', () => {
  let eventBus;
  let appState;
  let loggerFactory;
  let device;

  beforeEach(() => {
    eventBus = createEventBus();
    appState = createAppState();
    loggerFactory = createLoggerFactory();
    device = createChromaticWithFSM();
  });

  afterEach(() => {
    device.reset();
    eventBus._reset();
    vi.clearAllMocks();
  });

  describe('Device Connection Flow', () => {
    it('should complete full device connection workflow', async () => {
      const events = [];

      // Track state transitions
      device.on('statechange', ({ oldState, newState }) => {
        events.push(`${oldState}->${newState}`);
      });

      // Subscribe to EventBus events
      eventBus.subscribe(EventChannels.DEVICE.STATUS_CHANGED, (data) => {
        events.push(`status:${data.connected}`);
      });

      // 1. Connect device
      await device.connect();
      expect(device.state).toBe(DeviceState.CONNECTED);

      // 2. Publish connection event
      eventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, {
        connected: true,
        deviceId: device.deviceInfo.deviceId,
        label: device.deviceInfo.label,
      });

      // 3. Update app state
      appState.setDeviceConnected(true);
      appState.setSelectedDeviceId(device.deviceInfo.deviceId);

      // Verify state
      expect(appState.deviceConnected).toBe(true);
      expect(appState.selectedDeviceId).toBe(device.deviceInfo.deviceId);
      expect(events).toContain('disconnected->connected');
      expect(events).toContain('status:true');
    });

    it('should handle device disconnect during idle', async () => {
      // Connect first
      await device.connect();
      appState.setDeviceConnected(true);

      const events = [];
      eventBus.subscribe(EventChannels.DEVICE.STATUS_CHANGED, (data) => {
        events.push(`status:${data.connected}`);
      });

      // Disconnect
      device.disconnect();
      eventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, {
        connected: false,
        deviceId: device.deviceInfo.deviceId,
      });
      appState.setDeviceConnected(false);

      expect(device.state).toBe(DeviceState.DISCONNECTED);
      expect(appState.deviceConnected).toBe(false);
      expect(events).toContain('status:false');
    });
  });

  describe('Stream Acquisition Flow', () => {
    beforeEach(async () => {
      await device.connect();
      appState.setDeviceConnected(true);
    });

    it('should complete full stream start workflow', async () => {
      const events = [];

      device.on('statechange', ({ newState }) => {
        events.push(`device:${newState}`);
      });

      eventBus.subscribe(EventChannels.STREAM.STARTED, () =>
        events.push('stream:started')
      );

      // 1. Request stream
      const stream = await device.getStream();
      expect(device.state).toBe(DeviceState.STREAMING);

      // 2. Publish stream started
      eventBus.publish(EventChannels.STREAM.STARTED, {
        stream,
        device: device.getDeviceInfo(),
        capabilities: device.getCapabilities(),
      });

      // 3. Update app state
      appState.setStreaming(true);

      // Verify
      expect(stream).toBeDefined();
      expect(stream.getVideoTracks()).toHaveLength(1);
      expect(appState.isStreaming).toBe(true);
      expect(events).toContain('device:streaming');
      expect(events).toContain('stream:started');
    });

    it('should handle permission denied', async () => {
      const events = [];

      device.on('statechange', ({ newState }) => {
        events.push(`device:${newState}`);
      });

      // Simulate permission denied
      device.setPermissionState('denied');

      await expect(device.getStream()).rejects.toThrow();
      expect(device.state).toBe(DeviceState.PERMISSION_DENIED);
      expect(events).toContain('device:permission_pending');
      expect(events).toContain('device:permission_denied');
    });

    it('should handle stream acquisition failure', async () => {
      const events = [];

      eventBus.subscribe(EventChannels.STREAM.ERROR, (data) => {
        events.push(`error:${data.operation}`);
      });

      // Make next operation fail
      device.failNextOperation('Hardware error');

      try {
        await device.getStream();
      } catch (error) {
        eventBus.publish(EventChannels.STREAM.ERROR, {
          error,
          operation: 'start',
          deviceId: device.deviceInfo.deviceId,
          message: error.message,
        });
      }

      expect(device.state).toBe(DeviceState.ERROR);
      expect(events).toContain('error:start');
    });
  });

  describe('Stream Lifecycle', () => {
    beforeEach(async () => {
      await device.connect();
      await device.getStream();
      appState.setDeviceConnected(true);
      appState.setStreaming(true);
    });

    it('should stop stream cleanly', () => {
      const events = [];

      eventBus.subscribe(EventChannels.STREAM.STOPPED, () =>
        events.push('stopped')
      );

      // Stop stream
      device.stopStream();
      eventBus.publish(EventChannels.STREAM.STOPPED, {});
      appState.setStreaming(false);

      expect(device.state).toBe(DeviceState.CONNECTED);
      expect(device.isStreaming).toBe(false);
      expect(appState.isStreaming).toBe(false);
      expect(events).toContain('stopped');
    });

    it('should handle unexpected disconnect during streaming', () => {
      const events = [];

      device.on('device:disconnected-while-streaming', () => {
        events.push('disconnected-while-streaming');
      });

      eventBus.subscribe(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION, () => {
        events.push('session-interrupted');
      });

      // Simulate unexpected disconnect
      device.simulateUnexpectedDisconnect();

      eventBus.publish(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION, {
        deviceId: device.deviceInfo.deviceId,
        wasStreaming: true,
      });

      appState.setStreaming(false);
      appState.setDeviceConnected(false);

      expect(device.state).toBe(DeviceState.DISCONNECTED);
      expect(appState.isStreaming).toBe(false);
      expect(events).toContain('disconnected-while-streaming');
      expect(events).toContain('session-interrupted');
    });

    it('should handle stream error during streaming', () => {
      const events = [];

      // Subscribe to event bus first
      eventBus.subscribe(EventChannels.STREAM.ERROR, () => {
        events.push('error-event');
      });

      // Simulate stream error - this moves device to ERROR state
      device.simulateStreamError('Frame timeout');

      // Publish error event to event bus
      eventBus.publish(EventChannels.STREAM.ERROR, {
        error: new Error('Frame timeout'),
        operation: 'stream',
      });

      expect(device.state).toBe(DeviceState.ERROR);
      expect(events).toContain('error-event');
    });
  });

  describe('Error Recovery', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should recover from error state', async () => {
      const events = [];

      device.on('statechange', ({ newState }) => {
        events.push(newState);
      });

      // Get into error state
      device.failNextOperation('Temporary error');
      try {
        await device.getStream();
      } catch {
        // Expected
      }

      expect(device.state).toBe(DeviceState.ERROR);

      // Recover
      await device.recover();
      expect(device.state).toBe(DeviceState.CONNECTED);

      // Should be able to stream again
      const stream = await device.getStream();
      expect(stream).toBeDefined();
      expect(device.state).toBe(DeviceState.STREAMING);
    });

    it('should retry stream acquisition after permission retry', async () => {
      // First attempt - denied
      device.setPermissionState('denied');
      await expect(device.getStream()).rejects.toThrow();
      expect(device.state).toBe(DeviceState.PERMISSION_DENIED);

      // User grants permission on retry
      device.setPermissionState('granted');
      device._forceState(DeviceState.CONNECTED); // Reset for retry

      const stream = await device.getStream();
      expect(stream).toBeDefined();
      expect(device.state).toBe(DeviceState.STREAMING);
    });
  });

  describe('State Machine Validation', () => {
    it('should reject invalid state transitions', async () => {
      await device.connect();

      // Cannot go from CONNECTED directly to STREAMING
      expect(() => device._forceState(DeviceState.STREAMING)).not.toThrow();

      // Properly test transition validation
      const freshDevice = createChromaticWithFSM();
      expect(freshDevice.canTransitionTo(DeviceState.STREAMING)).toBe(false);
      expect(freshDevice.canTransitionTo(DeviceState.CONNECTED)).toBe(true);
    });

    it('should track complete state history', async () => {
      await device.connect();
      await device.getStream();
      device.stopStream();
      device.disconnect();

      const history = device.stateHistory;

      expect(history.length).toBeGreaterThanOrEqual(4);
      expect(history[0].from).toBe(DeviceState.DISCONNECTED);
      expect(history[0].to).toBe(DeviceState.CONNECTED);
      expect(history[history.length - 1].to).toBe(DeviceState.DISCONNECTED);
    });
  });

  describe('Concurrent Operations', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should handle concurrent stream requests', async () => {
      // Start two stream requests simultaneously
      const promise1 = device.getStream();

      // Second request should fail as first is in progress
      // (device is in PERMISSION_PENDING state)
      await expect(device.getStream()).rejects.toThrow();

      // First request completes
      const stream = await promise1;
      expect(stream).toBeDefined();
    });
  });
});

describe('Streaming Service Integration', () => {
  let streamingService;
  let eventBus;

  beforeEach(() => {
    streamingService = createStreamingService();
    eventBus = createEventBus();
  });

  it('should track streaming state correctly', async () => {
    expect(streamingService._getState()).toBe(StreamingState.IDLE);

    await streamingService.start('device-1');
    expect(streamingService._getState()).toBe(StreamingState.STREAMING);
    expect(streamingService.isActive()).toBe(true);

    await streamingService.stop();
    expect(streamingService._getState()).toBe(StreamingState.IDLE);
    expect(streamingService.isActive()).toBe(false);
  });

  it('should prevent starting when already streaming', async () => {
    await streamingService.start('device-1');

    await expect(streamingService.start('device-2')).rejects.toThrow('Already streaming');
  });
});
