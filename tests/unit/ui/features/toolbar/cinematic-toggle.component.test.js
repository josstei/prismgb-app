/**
 * CinematicToggleComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { CinematicToggleComponent } from '@renderer/ui/features/toolbar/components/cinematic-toggle.component.js';
import { createMockEventBus, createMockAppState, createMockLogger } from '../../../../mocks/index.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

describe('CinematicToggleComponent', () => {
  let component;
  let mockEventBus;
  let mockAppState;
  let mockLogger;
  let toggleElement;
  let textElement;

  beforeEach(() => {
    mockEventBus = createMockEventBus();
    mockAppState = createMockAppState({ isCinematicModeEnabled: true });
    mockLogger = createMockLogger();

    toggleElement = document.createElement('button');
    textElement = document.createElement('span');

    document.body.appendChild(toggleElement);
    document.body.appendChild(textElement);

    component = new CinematicToggleComponent({
      eventBus: mockEventBus,
      appState: mockAppState,
      logger: mockLogger
    });
  });

  afterEach(() => {
    component?.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should store dependencies', () => {
      expect(component.eventBus).toBe(mockEventBus);
      expect(component.appState).toBe(mockAppState);
      expect(component.logger).toBe(mockLogger);
    });
  });

  describe('initialize', () => {
    it('should warn when toggle element is not provided', () => {
      component.initialize({ toggleElement: null, textElement });
      expect(mockLogger.warn).toHaveBeenCalledWith('Cinematic toggle elements not found');
    });

    it('should store element references', () => {
      component.initialize({ toggleElement, textElement });
      expect(component.toggleElement).toBe(toggleElement);
      expect(component.textElement).toBe(textElement);
    });

    it('should set initial state from appState', () => {
      mockAppState._state.isCinematicModeEnabled = true;
      component.initialize({ toggleElement, textElement });

      expect(toggleElement.classList.contains('active')).toBe(true);
      expect(toggleElement.getAttribute('aria-pressed')).toBe('true');
      expect(textElement.textContent).toBe('Cinematic On');
    });

    it('should use true as default when appState is undefined', () => {
      const componentNoState = new CinematicToggleComponent({
        eventBus: mockEventBus,
        appState: null,
        logger: mockLogger
      });

      componentNoState.initialize({ toggleElement, textElement });
      expect(toggleElement.classList.contains('active')).toBe(true);
      componentNoState.dispose();
    });

    it('should log debug message on successful init', () => {
      component.initialize({ toggleElement, textElement });
      expect(mockLogger.debug).toHaveBeenCalledWith('Cinematic toggle initialized');
    });

    it('should subscribe to cinematic mode changes', () => {
      component.initialize({ toggleElement, textElement });
      expect(mockEventBus.subscribe).toHaveBeenCalledWith(
        EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED,
        expect.any(Function)
      );
    });
  });

  describe('click handling', () => {
    it('should publish toggle event on click', () => {
      component.initialize({ toggleElement, textElement });
      toggleElement.click();

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED
      );
    });
  });

  describe('cinematic mode changes', () => {
    beforeEach(() => {
      component.initialize({ toggleElement, textElement });
    });

    it('should update to enabled state', () => {
      mockEventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: true });

      expect(toggleElement.classList.contains('active')).toBe(true);
      expect(toggleElement.getAttribute('aria-pressed')).toBe('true');
      expect(textElement.textContent).toBe('Cinematic On');
    });

    it('should update to disabled state', () => {
      mockEventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: false });

      expect(toggleElement.classList.contains('active')).toBe(false);
      expect(toggleElement.getAttribute('aria-pressed')).toBe('false');
      expect(textElement.textContent).toBe('Cinematic Off');
    });

    it('should handle missing text element gracefully', () => {
      component.dispose();

      component = new CinematicToggleComponent({
        eventBus: mockEventBus,
        appState: mockAppState,
        logger: mockLogger
      });
      component.initialize({ toggleElement, textElement: null });

      expect(() => {
        mockEventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: true });
      }).not.toThrow();
    });
  });

  describe('_updateCinematicPill', () => {
    it('should return early when toggle element is null', () => {
      component.initialize({ toggleElement, textElement });
      component.toggleElement = null;

      expect(() => {
        // Access private method via subscription
        mockEventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: true });
      }).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should clean up event subscriptions', () => {
      component.initialize({ toggleElement, textElement });
      const unsubscribeFn = mockEventBus.subscribe.mock.results[0].value;

      component.dispose();

      expect(unsubscribeFn).toHaveBeenCalled();
    });

    it('should nullify references', () => {
      component.initialize({ toggleElement, textElement });
      component.dispose();

      expect(component.toggleElement).toBeNull();
      expect(component.textElement).toBeNull();
      expect(component.eventBus).toBeNull();
      expect(component.appState).toBeNull();
      expect(component.logger).toBeNull();
    });

    it('should handle non-function unsubscribe gracefully', () => {
      component.initialize({ toggleElement, textElement });
      component._eventSubscriptions = ['not-a-function'];

      expect(() => component.dispose()).not.toThrow();
    });
  });
});
