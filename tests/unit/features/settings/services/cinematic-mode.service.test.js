/**
 * CinematicModeService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CinematicModeService } from '@renderer/features/settings/services/cinematic-mode.service.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.js';

describe('CinematicModeService', () => {
  let service;
  let mockAppState;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    mockAppState = {
      cinematicModeEnabled: false,
      setCinematicMode: vi.fn()
    };

    service = new CinematicModeService({
      appState: mockAppState,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
  });

  describe('constructor', () => {
    it('should create service with required dependencies', () => {
      expect(service.appState).toBe(mockAppState);
      expect(service.eventBus).toBe(mockEventBus);
      expect(service.logger).toBe(mockLogger);
    });

    it('should throw if missing appState dependency', () => {
      expect(() => new CinematicModeService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });

    it('should throw if missing eventBus dependency', () => {
      expect(() => new CinematicModeService({
        appState: mockAppState,
        loggerFactory: mockLoggerFactory
      })).toThrow(/Missing required dependencies/);
    });

    it('should throw if missing loggerFactory dependency', () => {
      expect(() => new CinematicModeService({
        appState: mockAppState,
        eventBus: mockEventBus
      })).toThrow(/Missing required dependencies/);
    });

    it('should create logger with correct service name', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('CinematicModeService');
    });
  });

  describe('toggleCinematicMode', () => {
    describe('when disabled', () => {
      beforeEach(() => {
        mockAppState.cinematicModeEnabled = false;
      });

      it('should enable cinematic mode', () => {
        service.toggleCinematicMode();

        expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(true);
      });

      it('should publish cinematic mode event with enabled true', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
          { enabled: true }
        );
      });

      it('should publish status message event with enabled text', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Cinematic mode enabled' }
        );
      });

      it('should publish both events', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
      });
    });

    describe('when enabled', () => {
      beforeEach(() => {
        mockAppState.cinematicModeEnabled = true;
      });

      it('should disable cinematic mode', () => {
        service.toggleCinematicMode();

        expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(false);
      });

      it('should publish cinematic mode event with enabled false', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
          { enabled: false }
        );
      });

      it('should publish status message event with disabled text', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Cinematic mode disabled' }
        );
      });

      it('should publish both events', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish).toHaveBeenCalledTimes(2);
      });
    });

    describe('event publishing order', () => {
      it('should publish cinematic mode event before status message', () => {
        mockAppState.cinematicModeEnabled = false;
        const callOrder = [];

        mockEventBus.publish.mockImplementation((channel) => {
          callOrder.push(channel);
        });

        service.toggleCinematicMode();

        expect(callOrder[0]).toBe(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED);
        expect(callOrder[1]).toBe(EventChannels.UI.STATUS_MESSAGE);
      });
    });

    describe('state updates', () => {
      it('should update state before publishing events', () => {
        mockAppState.cinematicModeEnabled = false;
        let stateUpdated = false;

        mockAppState.setCinematicMode.mockImplementation(() => {
          stateUpdated = true;
        });

        mockEventBus.publish.mockImplementation(() => {
          expect(stateUpdated).toBe(true);
        });

        service.toggleCinematicMode();
      });
    });

    describe('multiple toggles', () => {
      it('should toggle between enabled and disabled states', () => {
        mockAppState.cinematicModeEnabled = false;

        // First toggle - enable
        service.toggleCinematicMode();
        expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(true);

        // Simulate state change
        mockAppState.cinematicModeEnabled = true;
        mockEventBus.publish.mockClear();

        // Second toggle - disable
        service.toggleCinematicMode();
        expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(false);
      });

      it('should publish correct messages on each toggle', () => {
        mockAppState.cinematicModeEnabled = false;

        // Enable
        service.toggleCinematicMode();
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Cinematic mode enabled' }
        );

        // Simulate state change and clear mocks
        mockAppState.cinematicModeEnabled = true;
        mockEventBus.publish.mockClear();

        // Disable
        service.toggleCinematicMode();
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Cinematic mode disabled' }
        );
      });
    });
  });
});
