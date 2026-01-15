/**
 * NotesPanelLayoutComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotesPanelLayoutComponent } from '@renderer/ui/features/notes/components/notes-panel-layout.component.js';

describe('NotesPanelLayoutComponent', () => {
  let component;
  let mockLogger;
  let panelElement;
  let toolbarElement;
  let streamContainer;
  let originalResizeObserver;

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

    originalResizeObserver = global.ResizeObserver;
    component = new NotesPanelLayoutComponent({ logger: mockLogger });
  });

  afterEach(() => {
    component.dispose();
    global.ResizeObserver = originalResizeObserver;
    vi.restoreAllMocks();
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
    const disconnect = vi.fn();
    const observe = vi.fn();
    function ResizeObserverMock(callback) {
      this.callback = callback;
      this.observe = observe;
      this.disconnect = disconnect;
    }
    global.ResizeObserver = ResizeObserverMock;

    component.initialize({ panelElement, toolbarElement, streamContainer });
    component.dispose();

    expect(disconnect).toHaveBeenCalled();
  });

  it('clears pending resize timers on dispose', () => {
    component.initialize({ panelElement, toolbarElement, streamContainer });
    component._schedulePositionUpdate();

    component.dispose();

    expect(component._resizeTimeout).toBeNull();
  });
});
