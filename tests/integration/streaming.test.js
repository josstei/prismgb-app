/**
 * Streaming Pipeline Integration Tests
 *
 * Tests the complete streaming flow from device connection
 * through stream acquisition to canvas rendering.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  MockDevice,
  MockDeviceManager,
  CHROMATIC_SPECS,
  createMockDependencies,
  createMockEventBus,
  createMockAppState,
  createMockUIController,
  performanceUtils,
} from '../mocks/index.js';
import { ResolutionCalculator } from '../utilities/ResolutionCalculator.js';
import { AnimationCache } from '../../src/shared/utils/performance-cache.utils.js';

describe('Streaming Pipeline Integration', () => {
  let mockDeviceManager;
  let chromaticDevice;
  let deps;
  let animationCache;

  beforeEach(() => {
    // Setup mock device infrastructure
    mockDeviceManager = new MockDeviceManager();
    chromaticDevice = MockDeviceManager.createChromatic();
    mockDeviceManager.addDevice(chromaticDevice);
    mockDeviceManager.setupMediaDevicesMock();

    // Setup mock dependencies
    deps = createMockDependencies();

    // Create test animation cache
    animationCache = new AnimationCache();

    // Clear caches
    ResolutionCalculator.clearCache();
    animationCache.cancelAllAnimations();
  });

  afterEach(() => {
    mockDeviceManager.reset();
    vi.clearAllMocks();
  });

  describe('Device Detection Flow', () => {
    it('should detect Chromatic device via mediaDevices API', async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();

      expect(devices).toHaveLength(1);
      expect(devices[0].label).toBe('Chromatic');
      expect(devices[0].kind).toBe('videoinput');
    });

    it('should emit device change events', async () => {
      const changeHandler = vi.fn();
      navigator.mediaDevices.addEventListener('devicechange', changeHandler);

      // Add another device
      const secondDevice = new MockDevice({ deviceId: 'second-device', label: 'Second Camera' });
      mockDeviceManager.addDevice(secondDevice);

      expect(changeHandler).toHaveBeenCalled();
    });

    it('should handle device disconnection', async () => {
      const changeHandler = vi.fn();
      navigator.mediaDevices.addEventListener('devicechange', changeHandler);

      // Disconnect the Chromatic
      mockDeviceManager.removeDevice(chromaticDevice.deviceInfo.deviceId);

      const devices = await navigator.mediaDevices.enumerateDevices();

      expect(changeHandler).toHaveBeenCalled();
      expect(devices).toHaveLength(0);
    });
  });

  describe('Stream Acquisition Flow', () => {
    it('should acquire stream from Chromatic device', async () => {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          deviceId: { exact: chromaticDevice.deviceInfo.deviceId },
          width: { exact: CHROMATIC_SPECS.nativeWidth },
          height: { exact: CHROMATIC_SPECS.nativeHeight },
        },
      });

      expect(stream).toBeDefined();
      expect(stream.getVideoTracks()).toHaveLength(1);

      const track = stream.getVideoTracks()[0];
      const settings = track.getSettings();

      expect(settings.width).toBe(CHROMATIC_SPECS.nativeWidth);
      expect(settings.height).toBe(CHROMATIC_SPECS.nativeHeight);
    });

    it('should fail when device is disconnected', async () => {
      chromaticDevice.disconnect();

      await expect(
        navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: chromaticDevice.deviceInfo.deviceId } },
        })
      ).rejects.toThrow('Requested device not found');
    });

    it('should get stream with default constraints', async () => {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });

      expect(stream).toBeDefined();
      expect(stream.active).toBe(true);
    });
  });

  describe('Resolution Calculation Integration', () => {
    it('should calculate correct canvas dimensions for Chromatic', () => {
      const calc = new ResolutionCalculator(
        CHROMATIC_SPECS.nativeWidth,
        CHROMATIC_SPECS.nativeHeight
      );

      // Default 4x scale
      const scaled = calc.calculateScaled(4);
      expect(scaled).toEqual({ width: 640, height: 576, scale: 4 });

      // Fit to typical display
      const fitted = calc.fitToContainer(1920, 1080, { maxScale: 8 });
      expect(fitted.scale).toBe(7); // 1920/160=12, 1080/144=7.5, min=7
    });

    it('should maintain aspect ratio through scaling', () => {
      const calc = new ResolutionCalculator(
        CHROMATIC_SPECS.nativeWidth,
        CHROMATIC_SPECS.nativeHeight
      );

      const nativeRatio = CHROMATIC_SPECS.nativeWidth / CHROMATIC_SPECS.nativeHeight;

      [1, 2, 4, 8].forEach(scale => {
        const scaled = calc.calculateScaled(scale);
        const scaledRatio = scaled.width / scaled.height;
        expect(scaledRatio).toBeCloseTo(nativeRatio, 10);
      });
    });
  });

  describe('Event Flow Integration', () => {
    it('should publish stream events in correct order', async () => {
      const eventOrder = [];
      const eventBus = createMockEventBus();

      eventBus.subscribe('stream:starting', () => eventOrder.push('starting'));
      eventBus.subscribe('stream:started', () => eventOrder.push('started'));
      eventBus.subscribe('stream:stopped', () => eventOrder.push('stopped'));

      // Simulate stream lifecycle
      eventBus.publish('stream:starting', { deviceId: 'test' });
      eventBus.publish('stream:started', { stream: {}, capabilities: {} });
      eventBus.publish('stream:stopped', {});

      expect(eventOrder).toEqual(['starting', 'started', 'stopped']);
    });

    it('should handle device events triggering stream events', async () => {
      const events = [];
      const eventBus = createMockEventBus();

      eventBus.subscribe('device:connected', () => events.push('device:connected'));
      eventBus.subscribe('device:disconnected', () => events.push('device:disconnected'));
      eventBus.subscribe('stream:stopped', () => events.push('stream:stopped'));

      // Simulate device connection
      eventBus.publish('device:connected', { deviceId: 'chromatic' });

      // Simulate device disconnection triggering stream stop
      eventBus.publish('device:disconnected', { deviceId: 'chromatic' });
      eventBus.publish('stream:stopped', {});

      expect(events).toContain('device:connected');
      expect(events).toContain('device:disconnected');
      expect(events).toContain('stream:stopped');
    });
  });

  describe('State Management Integration', () => {
    it('should update app state during stream lifecycle', () => {
      const appState = createMockAppState();

      // Initial state
      expect(appState.isStreaming).toBe(false);

      // Start streaming
      appState.setStreaming(true);

      expect(appState.isStreaming).toBe(true);

      // Stop streaming
      appState.setStreaming(false);

      expect(appState.isStreaming).toBe(false);
    });
  });

  describe('Canvas Rendering Integration', () => {
    it('should setup canvas with correct dimensions', () => {
      const uiController = createMockUIController();
      const canvas = uiController.elements.streamCanvas;

      // Simulate canvas setup for 4x scale
      const calc = new ResolutionCalculator(160, 144);
      const dimensions = calc.calculateScaled(4);

      canvas.width = dimensions.width;
      canvas.height = dimensions.height;

      expect(canvas.width).toBe(640);
      expect(canvas.height).toBe(576);
    });

    it('should get 2D context with correct options', () => {
      const uiController = createMockUIController();
      const canvas = uiController.elements.streamCanvas;

      const ctx = canvas.getContext('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      });

      expect(canvas.getContext).toHaveBeenCalledWith('2d', {
        alpha: false,
        desynchronized: true,
        willReadFrequently: false,
      });
    });
  });

  describe('Full Pipeline Simulation', () => {
    it('should complete full stream start/stop cycle', async () => {
      const eventBus = createMockEventBus();
      const appState = createMockAppState();
      const events = [];

      // Subscribe to all events
      eventBus.subscribe('device:connected', (d) => events.push({ type: 'device:connected', data: d }));
      eventBus.subscribe('stream:started', (d) => events.push({ type: 'stream:started', data: d }));
      eventBus.subscribe('stream:stopped', () => events.push({ type: 'stream:stopped' }));

      // 1. Device connects
      eventBus.publish('device:connected', { deviceId: chromaticDevice.deviceInfo.deviceId });

      // 2. Acquire stream
      const stream = await chromaticDevice.getStream();
      expect(stream).toBeDefined();

      // 3. Start streaming
      appState.setStreaming(true);
      eventBus.publish('stream:started', {
        stream,
        capabilities: chromaticDevice.getCapabilities(),
      });

      expect(appState.isStreaming).toBe(true);
      expect(events.some(e => e.type === 'stream:started')).toBe(true);

      // 4. Stop streaming
      chromaticDevice.stopStream();
      appState.setStreaming(false);
      eventBus.publish('stream:stopped');

      expect(appState.isStreaming).toBe(false);
      expect(events.some(e => e.type === 'stream:stopped')).toBe(true);
    });

    it('should handle visibility change during streaming', async () => {
      const appState = createMockAppState();
      appState.setStreaming(true);

      // Simulate tab hidden
      const wasRendering = appState.isStreaming && !document.hidden;
      expect(wasRendering).toBe(true);

      // Simulate visibility change
      Object.defineProperty(document, 'hidden', { value: true, writable: true });

      // Should pause rendering
      const shouldRender = appState.isStreaming && !document.hidden;
      expect(shouldRender).toBe(false);

      // Restore visibility
      Object.defineProperty(document, 'hidden', { value: false, writable: true });

      // Should resume rendering
      const shouldRenderAgain = appState.isStreaming && !document.hidden;
      expect(shouldRenderAgain).toBe(true);
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle stream acquisition failure gracefully', async () => {
      const eventBus = createMockEventBus();
      let errorReceived = null;

      eventBus.subscribe('stream:error', (error) => {
        errorReceived = error;
      });

      // Disconnect device before stream acquisition
      chromaticDevice.disconnect();

      try {
        await navigator.mediaDevices.getUserMedia({
          video: { deviceId: { exact: chromaticDevice.deviceInfo.deviceId } },
        });
      } catch (error) {
        eventBus.publish('stream:error', { message: error.message, name: error.name });
      }

      expect(errorReceived).toBeDefined();
      expect(errorReceived.name).toBe('NotFoundError');
    });

    it('should clean up on unexpected disconnection', async () => {
      const appState = createMockAppState();
      const eventBus = createMockEventBus();

      // Start streaming
      const stream = await chromaticDevice.getStream();
      appState.setStreaming(true);

      // Simulate unexpected disconnection
      chromaticDevice.disconnect();

      // Handle disconnection
      if (!chromaticDevice.isConnected && appState.isStreaming) {
        appState.setStreaming(false);
        eventBus.publish('stream:stopped');
        eventBus.publish('device:disconnected-during-session');
      }

      expect(appState.isStreaming).toBe(false);
    });
  });

  describe('Performance Integration', () => {
    it('should cache resolution calculations across stream restarts', async () => {
      const calc = new ResolutionCalculator(160, 144);

      // First stream session
      calc.calculateScaled(4);
      const statsAfterFirst = ResolutionCalculator.getCacheStats();

      // Second stream session (simulated restart)
      calc.calculateScaled(4);
      const statsAfterSecond = ResolutionCalculator.getCacheStats();

      // Should have cache hit on second session
      expect(statsAfterSecond.hits).toBeGreaterThan(statsAfterFirst.hits);
    });

    it('should complete 100 stream start/stop cycles under time limit', async () => {
      const result = await performanceUtils.measureTime(async () => {
        for (let i = 0; i < 100; i++) {
          const stream = await chromaticDevice.getStream();
          chromaticDevice.stopStream();
        }
      }, 1);

      console.log(`100 stream cycles: ${result.total.toFixed(2)}ms`);

      // Should complete in under 1 second
      expect(result.total).toBeLessThan(1000);
    });
  });
});

describe('Mock Device Accuracy', () => {
  it('should match real Chromatic specifications', () => {
    const device = MockDeviceManager.createChromatic();
    const caps = device.getCapabilities();

    expect(caps.nativeResolution.width).toBe(160);
    expect(caps.nativeResolution.height).toBe(144);
    expect(caps.canvasScale).toBe(4);
    expect(caps.deviceName).toBe('Chromatic');
  });

  it('should provide accurate stream settings', async () => {
    const device = MockDeviceManager.createChromatic();
    const stream = await device.getStream();
    const track = stream.getVideoTracks()[0];
    const settings = track.getSettings();

    expect(settings.width).toBe(160);
    expect(settings.height).toBe(144);
    expect(settings.frameRate).toBe(60);
  });
});
