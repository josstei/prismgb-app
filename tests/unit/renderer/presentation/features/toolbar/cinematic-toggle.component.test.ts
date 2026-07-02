/**
 * CinematicToggleComponent Unit Tests
 *
 * The pill state binds directly to the cinematic-mode signal; the click still publishes a
 * toggle request. No imperative pill-update method or event subscription remains.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CinematicToggleComponent } from '@renderer/presentation/features/toolbar/cinematic-toggle.component.js';
import { signal } from '@platform/ui-base/reactive';
import { createEventBus, createLogger } from '../../../../../factories/index.js';
import { EventChannels } from '@platform/events';

describe('CinematicToggleComponent', () => {
  let component;
  let mockEventBus;
  let cinematicSignal;
  let mockLogger;
  let toggleElement;
  let textElement;

  beforeEach(() => {
    mockEventBus = createEventBus();
    cinematicSignal = signal(true);
    mockLogger = createLogger();

    toggleElement = document.createElement('button');
    textElement = document.createElement('span');
    document.body.appendChild(toggleElement);
    document.body.appendChild(textElement);

    component = new CinematicToggleComponent({
      eventBus: mockEventBus,
      appState: { cinematicModeSignal: cinematicSignal },
      logger: mockLogger
    });
  });

  afterEach(() => {
    component?.dispose();
    document.body.innerHTML = '';
  });

  it('warns when the toggle element is missing', () => {
    component.initialize({ toggleElement: null, textElement });
    expect(mockLogger.warn).toHaveBeenCalledWith('Cinematic toggle elements not found');
  });

  it('reflects the initial cinematic signal state', () => {
    component.initialize({ toggleElement, textElement });
    expect(toggleElement.classList.contains('active')).toBe(true);
    expect(toggleElement.getAttribute('aria-pressed')).toBe('true');
    expect(textElement.textContent).toBe('Cinematic On');
  });

  it('updates the pill when the cinematic signal changes', () => {
    component.initialize({ toggleElement, textElement });

    cinematicSignal.value = false;
    expect(toggleElement.classList.contains('active')).toBe(false);
    expect(toggleElement.getAttribute('aria-pressed')).toBe('false');
    expect(textElement.textContent).toBe('Cinematic Off');

    cinematicSignal.value = true;
    expect(toggleElement.classList.contains('active')).toBe(true);
    expect(textElement.textContent).toBe('Cinematic On');
  });

  it('publishes the toggle request on click', () => {
    component.initialize({ toggleElement, textElement });
    toggleElement.click();
    expect(mockEventBus.publish).toHaveBeenCalledWith(EventChannels.UI.CINEMATIC_TOGGLE_REQUESTED);
  });

  it('handles a missing text element gracefully', () => {
    component.initialize({ toggleElement, textElement: null });
    expect(() => {
      cinematicSignal.value = false;
    }).not.toThrow();
  });

  it('tears down bindings on dispose', () => {
    component.initialize({ toggleElement, textElement });
    component.dispose();

    cinematicSignal.value = false;
    expect(toggleElement.classList.contains('active')).toBe(true);
    expect(component.toggleElement).toBeNull();
    expect(component.textElement).toBeNull();
  });
});
