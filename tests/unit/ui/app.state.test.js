/**
 * StateManager (AppState) Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppState } from '@renderer/application/app.state.js';

describe('AppState', () => {
  let state;
  let mockStreamingService;
  let mockDeviceService;
  let mockEventBus;
  let subscribedHandlers;

  beforeEach(() => {
    subscribedHandlers = {};

    // Create mock services
    mockStreamingService = {
      isStreaming: false
    };

    mockDeviceService = {
      isConnected: false
    };

    mockEventBus = {
      subscribe: vi.fn((event, handler) => {
        subscribedHandlers[event] = handler;
        return vi.fn(); // unsubscribe function
      }),
      publish: vi.fn()
    };

    state = new AppState({
      streamingService: mockStreamingService,
      deviceService: mockDeviceService,
      eventBus: mockEventBus
    });
  });

  describe('Constructor', () => {
    it('should initialize with default state', () => {
      expect(state.isStreaming).toBe(false);
      expect(state.deviceConnected).toBe(false);
      expect(state.cinematicModeEnabled).toBe(true);
    });

    it('should work without dependencies (graceful degradation)', () => {
      const stateNoDeps = new AppState();
      expect(stateNoDeps.isStreaming).toBe(false);
      expect(stateNoDeps.deviceConnected).toBe(false);
    });

    it('should setup event subscriptions when eventBus provided', () => {
      expect(mockEventBus.subscribe).toHaveBeenCalledTimes(2);
    });
  });

  describe('Derived State - isStreaming', () => {
    it('should derive streaming state from StreamingService', () => {
      expect(state.isStreaming).toBe(false);

      // Change service state
      mockStreamingService.isStreaming = true;
      expect(state.isStreaming).toBe(true);

      mockStreamingService.isStreaming = false;
      expect(state.isStreaming).toBe(false);
    });
  });

  describe('Derived State - deviceConnected', () => {
    it('should derive device connection state from DeviceService', () => {
      expect(state.deviceConnected).toBe(false);

      // Change service state
      mockDeviceService.isConnected = true;
      expect(state.deviceConnected).toBe(true);

      mockDeviceService.isConnected = false;
      expect(state.deviceConnected).toBe(false);
    });
  });

  describe('setCinematicMode', () => {
    it('should enable cinematic mode', () => {
      state.cinematicModeEnabled = false;
      state.setCinematicMode(true);
      expect(state.cinematicModeEnabled).toBe(true);
    });

    it('should disable cinematic mode', () => {
      state.setCinematicMode(false);
      expect(state.cinematicModeEnabled).toBe(false);
    });
  });

  describe('State Integration', () => {
    it('should maintain independent state values', () => {
      // Update service state (the real way to change state now)
      mockStreamingService.isStreaming = true;
      mockDeviceService.isConnected = true;
      state.setCinematicMode(false);

      expect(state.isStreaming).toBe(true);
      expect(state.deviceConnected).toBe(true);
      expect(state.cinematicModeEnabled).toBe(false);
    });

    it('should reflect service state changes', () => {
      // Start with defaults
      expect(state.isStreaming).toBe(false);
      expect(state.deviceConnected).toBe(false);

      // Change services
      mockStreamingService.isStreaming = true;
      mockDeviceService.isConnected = true;

      // State reflects service changes
      expect(state.isStreaming).toBe(true);
      expect(state.deviceConnected).toBe(true);

      // Reset services
      mockStreamingService.isStreaming = false;
      mockDeviceService.isConnected = false;

      expect(state.isStreaming).toBe(false);
      expect(state.deviceConnected).toBe(false);
    });
  });

  describe('EventBus Subscriptions', () => {
    it('should subscribe to stream events', () => {
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:started', expect.any(Function));
      expect(mockEventBus.subscribe).toHaveBeenCalledWith('stream:stopped', expect.any(Function));
    });

    it('should cache stream on stream:started', () => {
      const mockStream = { id: 'test-stream' };
      subscribedHandlers['stream:started']({ stream: mockStream });

      expect(state.currentStream).toBe(mockStream);
    });

    it('should cache capabilities on stream:started', () => {
      const mockCapabilities = { frameRate: 60, nativeResolution: { width: 160, height: 144 } };
      subscribedHandlers['stream:started']({ stream: {}, capabilities: mockCapabilities });

      expect(state.currentCapabilities).toBe(mockCapabilities);
    });

    it('should clear stream cache on stream:stopped', () => {
      state._streamCache = { id: 'test-stream' };

      subscribedHandlers['stream:stopped']();

      expect(state._streamCache).toBeNull();
    });

    it('should clear capabilities cache on stream:stopped', () => {
      state._capabilitiesCache = { frameRate: 60 };

      subscribedHandlers['stream:stopped']();

      expect(state._capabilitiesCache).toBeNull();
      expect(state.currentCapabilities).toBeNull();
    });

    it('should not setup subscriptions without eventBus', () => {
      const stateNoEventBus = new AppState({
        streamingService: mockStreamingService,
        deviceService: mockDeviceService
      });

      // Should not throw and state should work
      expect(stateNoEventBus.isStreaming).toBe(false);
    });
  });

  describe('currentStream getter', () => {
    it('should return cached stream when cache is populated', () => {
      const mockStream = { id: 'cached-stream' };
      state._streamCache = mockStream;

      expect(state.currentStream).toBe(mockStream);
    });

    it('should fallback to streamingService.getStream when cache is null', () => {
      state._streamCache = null;
      const mockStream = { id: 'service-stream' };
      mockStreamingService.getStream = vi.fn(() => mockStream);

      expect(state.currentStream).toBe(mockStream);
      expect(mockStreamingService.getStream).toHaveBeenCalled();
    });

    it('should return null when no cache and no service', () => {
      state._streamCache = null;
      state.streamingService = null;

      expect(state.currentStream).toBeNull();
    });

    it('should return null when no cache and service has no getStream', () => {
      state._streamCache = null;
      mockStreamingService.getStream = undefined;

      expect(state.currentStream).toBeNull();
    });

    it('should prefer cache over service getStream', () => {
      const cachedStream = { id: 'cached-stream' };
      const serviceStream = { id: 'service-stream' };
      state._streamCache = cachedStream;
      mockStreamingService.getStream = vi.fn(() => serviceStream);

      expect(state.currentStream).toBe(cachedStream);
      expect(mockStreamingService.getStream).not.toHaveBeenCalled();
    });
  });

  describe('currentCapabilities getter', () => {
    it('should return cached capabilities when cache is populated', () => {
      const mockCapabilities = { frameRate: 60, nativeResolution: { width: 160, height: 144 } };
      state._capabilitiesCache = mockCapabilities;

      expect(state.currentCapabilities).toBe(mockCapabilities);
    });

    it('should fallback to streamingService.currentCapabilities when cache is null', () => {
      state._capabilitiesCache = null;
      const mockCapabilities = { frameRate: 60, nativeResolution: { width: 160, height: 144 } };
      mockStreamingService.currentCapabilities = mockCapabilities;

      expect(state.currentCapabilities).toBe(mockCapabilities);
    });

    it('should return null when no cache and no service', () => {
      state._capabilitiesCache = null;
      state.streamingService = null;

      expect(state.currentCapabilities).toBeNull();
    });

    it('should return null when no cache and service has no currentCapabilities', () => {
      state._capabilitiesCache = null;
      mockStreamingService.currentCapabilities = undefined;

      expect(state.currentCapabilities).toBeNull();
    });

    it('should prefer cache over service currentCapabilities', () => {
      const cachedCapabilities = { frameRate: 60 };
      const serviceCapabilities = { frameRate: 30 };
      state._capabilitiesCache = cachedCapabilities;
      mockStreamingService.currentCapabilities = serviceCapabilities;

      expect(state.currentCapabilities).toBe(cachedCapabilities);
    });
  });

  describe('dispose', () => {
    it('should unsubscribe from all event subscriptions', () => {
      const unsubscribe1 = vi.fn();
      const unsubscribe2 = vi.fn();
      state._subscriptions = [unsubscribe1, unsubscribe2];

      state.dispose();

      expect(unsubscribe1).toHaveBeenCalled();
      expect(unsubscribe2).toHaveBeenCalled();
    });

    it('should clear subscriptions array after unsubscribing', () => {
      state._subscriptions = [vi.fn(), vi.fn()];

      state.dispose();

      expect(state._subscriptions).toEqual([]);
    });

    it('should clear stream cache', () => {
      state._streamCache = { id: 'test-stream' };

      state.dispose();

      expect(state._streamCache).toBeNull();
    });

    it('should clear capabilities cache', () => {
      state._capabilitiesCache = { frameRate: 60 };

      state.dispose();

      expect(state._capabilitiesCache).toBeNull();
    });

    it('should handle null subscriptions gracefully', () => {
      state._subscriptions = null;

      expect(() => state.dispose()).not.toThrow();
    });

    it('should handle undefined subscriptions gracefully', () => {
      state._subscriptions = undefined;

      expect(() => state.dispose()).not.toThrow();
    });

    it('should skip non-function subscription entries', () => {
      state._subscriptions = [vi.fn(), null, undefined, 'not-a-function', vi.fn()];

      expect(() => state.dispose()).not.toThrow();
      expect(state._subscriptions).toEqual([]);
    });

    it('should be idempotent - safe to call multiple times', () => {
      state.dispose();
      state.dispose();

      expect(state._streamCache).toBeNull();
      expect(state._capabilitiesCache).toBeNull();
      expect(state._subscriptions).toEqual([]);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing streamingService gracefully', () => {
      const stateNoService = new AppState({
        deviceService: mockDeviceService,
        eventBus: mockEventBus
      });

      expect(stateNoService.isStreaming).toBe(false);
      expect(stateNoService.currentStream).toBeNull();
      expect(stateNoService.currentCapabilities).toBeNull();
    });

    it('should handle missing deviceService gracefully', () => {
      const stateNoDevice = new AppState({
        streamingService: mockStreamingService,
        eventBus: mockEventBus
      });

      expect(stateNoDevice.deviceConnected).toBe(false);
    });

    it('should handle completely empty dependencies', () => {
      const stateEmpty = new AppState({});

      expect(stateEmpty.isStreaming).toBe(false);
      expect(stateEmpty.deviceConnected).toBe(false);
      expect(stateEmpty.currentStream).toBeNull();
      expect(stateEmpty.currentCapabilities).toBeNull();
    });

    it('should maintain cinematic mode state independently of services', () => {
      state.streamingService = null;
      state.deviceService = null;

      state.setCinematicMode(false);
      expect(state.cinematicModeEnabled).toBe(false);

      state.setCinematicMode(true);
      expect(state.cinematicModeEnabled).toBe(true);
    });
  });

  describe('Cache and Service Interaction', () => {
    it('should update cache when stream:started event fires', () => {
      const mockStream = { id: 'event-stream' };
      const mockCapabilities = { frameRate: 60 };

      expect(state._streamCache).toBeNull();
      expect(state._capabilitiesCache).toBeNull();

      subscribedHandlers['stream:started']({ stream: mockStream, capabilities: mockCapabilities });

      expect(state._streamCache).toBe(mockStream);
      expect(state._capabilitiesCache).toBe(mockCapabilities);
    });

    it('should clear cache when stream:stopped event fires', () => {
      state._streamCache = { id: 'test-stream' };
      state._capabilitiesCache = { frameRate: 60 };

      subscribedHandlers['stream:stopped']();

      expect(state._streamCache).toBeNull();
      expect(state._capabilitiesCache).toBeNull();
    });

    it('should reflect real-time service state changes', () => {
      mockStreamingService.isStreaming = false;
      expect(state.isStreaming).toBe(false);

      mockStreamingService.isStreaming = true;
      expect(state.isStreaming).toBe(true);

      mockStreamingService.isStreaming = false;
      expect(state.isStreaming).toBe(false);
    });

    it('should handle stream:started event without capabilities', () => {
      const mockStream = { id: 'stream-only' };

      subscribedHandlers['stream:started']({ stream: mockStream });

      expect(state._streamCache).toBe(mockStream);
      expect(state._capabilitiesCache).toBeUndefined();
    });

    it('should handle stream:started event without stream', () => {
      const mockCapabilities = { frameRate: 60 };

      subscribedHandlers['stream:started']({ capabilities: mockCapabilities });

      expect(state._streamCache).toBeUndefined();
      expect(state._capabilitiesCache).toBe(mockCapabilities);
    });
  });
});
