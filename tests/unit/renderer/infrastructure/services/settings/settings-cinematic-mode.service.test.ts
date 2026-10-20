/**
 * SettingsCinematicModeService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsCinematicModeService } from '@renderer/infrastructure/services/settings/settings-cinematic-mode.service';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { createAppState } from '../../../../../factories/index.js';
import { createInjectableHarness } from '../../../../../support/di/injectable.harness';

describe('SettingsCinematicModeService', () => {
  let service;
  let mockAppState;
  let mockEventBus;
  let mockLogger;

  beforeEach(() => {
    const h = createInjectableHarness(SettingsCinematicModeService, {
      overrides: {
        appState: createAppState({
          initialState: { isCinematicModeEnabled: false }
        })
      }
    });
    service = h.subject;
    mockLogger = h.logger;
    ({ appState: mockAppState, eventBus: mockEventBus } = h.deps);
  });

  describe('constructor', () => {
    it('should create service with required dependencies', () => {
      expect(service.appState).toBe(mockAppState);
      expect(service.eventBus).toBe(mockEventBus);
      expect(service.logger).toBe(mockLogger);
    });

  });

  describe('initialize', () => {
    it('should bind the cinematic toggle-requested event handler', () => {
      service.initialize();

      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED,
        expect.any(Function)
      );
    });

    it('should toggle cinematic mode when CINEMATIC_TOGGLE_REQUESTED is published', () => {
      mockAppState._forceSet('isCinematicModeEnabled', false);
      service.initialize();

      mockEventBus.publish(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED);

      expect(mockAppState.setCinematicMode).toHaveBeenCalledWith(true);
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

      it('should publish only the enabled status message', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish.mock.calls).toEqual([
          [EventChannels.UI.STATUS_MESSAGE, { message: 'Cinematic mode enabled' }]
        ]);
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

      it('should publish only the disabled status message', () => {
        service.toggleCinematicMode();

        expect(mockEventBus.publish.mock.calls).toEqual([
          [EventChannels.UI.STATUS_MESSAGE, { message: 'Cinematic mode disabled' }]
        ]);
      });
    });

    describe('state updates', () => {
      it('should update state before publishing the status message', () => {
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

      it('should publish the matching status message on each toggle', () => {
        mockAppState._forceSet('isCinematicModeEnabled', false);

        service.toggleCinematicMode();
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Cinematic mode enabled' }
        );

        mockAppState._forceSet('isCinematicModeEnabled', true);
        mockEventBus.publish.mockClear();

        service.toggleCinematicMode();
        expect(mockEventBus.publish).toHaveBeenCalledWith(
          EventChannels.UI.STATUS_MESSAGE,
          { message: 'Cinematic mode disabled' }
        );
      });
    });
  });
});
