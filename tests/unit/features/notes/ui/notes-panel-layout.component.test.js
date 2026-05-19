/**
 * NotesPanelLayoutComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotesPanelLayoutComponent } from '@renderer/presentation/features/notes/components/notes-panel-layout.component.js';

describe('NotesPanelLayoutComponent', () => {
  let component;
  let mockLogger;
  let panelElement;
  let toolbarElement;
  let streamContainer;

  beforeEach(() => {
    mockLogger = { debug: vi.fn(), warn: vi.fn() };
    panelElement = document.createElement('div');
    toolbarElement = document.createElement('div');
    streamContainer = document.createElement('div');

    toolbarElement.getBoundingClientRect = () => ({
      top: 100,
      left: 200,
      right: 260,
      bottom: 140,
      width: 60,
      height: 40
    });

    component = new NotesPanelLayoutComponent({ logger: mockLogger });
  });

  afterEach(() => {
    component.dispose();
  });

  it('initializes and updates position when required elements exist', () => {
    const updateSpy = vi.spyOn(component, 'updatePosition');

    component.initialize({
      panelElement,
      toolbarElement,
      streamContainer
    });

    expect(updateSpy).toHaveBeenCalled();
    expect(panelElement.style.getPropertyValue('--notes-panel-left')).not.toBe('');
    expect(panelElement.style.getPropertyValue('--notes-panel-top')).not.toBe('');
  });

  it('skips initialization when required elements are missing', () => {
    const updateSpy = vi.spyOn(component, 'updatePosition');

    component.initialize({ panelElement: null, toolbarElement: null, streamContainer });

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('disconnects resize observer on dispose', () => {
    component.initialize({ panelElement, toolbarElement, streamContainer });
    const observer = component._resizeObserver;
    component.dispose();

    expect(observer).toBeTruthy();
    expect(observer.disconnect).toHaveBeenCalled();
    expect(component._resizeObserver).toBeNull();
  });

  it('clears pending resize timers on dispose', () => {
    component.initialize({ panelElement, toolbarElement, streamContainer });
    component._schedulePositionUpdate();

    component.dispose();

    expect(component._resizeTimeout).toBeNull();
  });
});
