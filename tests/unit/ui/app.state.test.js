/**
 * StateManager (AppState) Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AppState } from '@ui/app.state.js';

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

    it('should clear stream cache on stream:stopped', () => {
      // First set a stream
      state._streamCache = { id: 'test-stream' };

      subscribedHandlers['stream:stopped']();

      expect(state._streamCache).toBeNull();
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
});
