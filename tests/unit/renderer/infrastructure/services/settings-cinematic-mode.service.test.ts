// @ts-nocheck
/**
 * SettingsCinematicModeService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsCinematicModeService } from '@renderer/infrastructure/services/settings/settings-cinematic-mode.service';
import { EventChannels } from '@platform/events';
import { createAppState, createEventBus, createLoggerFactory } from '../../../../factories/index.js';

describe('SettingsCinematicModeService', () => {
  let service;
  let mockAppState;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();
    mockEventBus = createEventBus();
    mockAppState = createAppState({
      initialState: { isCinematicModeEnabled: false }
    });

    service = new SettingsCinematicModeService({
      appState: mockAppState,
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory
    });
    mockLogger = mockLoggerFactory._getLogger('SettingsCinematicModeService');
  });

  describe('constructor', () => {
    it('should create service with required dependencies', () => {
      expect(service.appState).toBe(mockAppState);
      expect(service.eventBus).toBe(mockEventBus);
      expect(service.logger).toBe(mockLogger);
    });

    it('should create logger with correct service name', () => {
      expect(mockLoggerFactory.create).toHaveBeenCalledWith('SettingsCinematicModeService');
    });
  });

  describe('toggleCinematicMode', () => {
    describe('when disabled', () => {
      beforeEach(() => {
        mockAppState._forceSet('isCinematicModeEnabled', false);
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

      it('should publish domain event only (UI messaging handled by UIEventBridge)', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      });
    });

    describe('when enabled', () => {
      beforeEach(() => {
        mockAppState._forceSet('isCinematicModeEnabled', true);
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

      it('should publish domain event only (UI messaging handled by UIEventBridge)', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish).toHaveBeenCalledTimes(1);
      });
    });

    describe('state updates', () => {
      it('should update state before publishing events', () => {
        mockAppState._forceSet('isCinematicModeEnabled', false);
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
        mockAppState._forceSet('isCinematicModeEnabled', false);

        // First toggle - enable
        service.toggleCinematicMode();
        expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(true);

        // Simulate state change
        mockAppState._forceSet('isCinematicModeEnabled', true);
        mockEventBus.publish.mockClear();

        // Second toggle - disable
        service.toggleCinematicMode();
        expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(false);
      });

      it('should publish correct domain events on each toggle', () => {
        mockAppState._forceSet('isCinematicModeEnabled', false);

        // Enable
        service.toggleCinematicMode();
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
          { enabled: true }
        );

        // Simulate state change and clear mocks
        mockAppState._forceSet('isCinematicModeEnabled', true);
        mockEventBus.publish.mockClear();

        // Disable
        service.toggleCinematicMode();
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
          { enabled: false }
        );
      });
    });
  });
});
