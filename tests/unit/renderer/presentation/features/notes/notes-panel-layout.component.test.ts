/**
 * NotesPanelLayoutComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotesPanelLayoutComponent } from '@renderer/presentation/features/notes/notes-panel-layout.component.js';
import { createLogger } from '../../../../../factories/index.js';
import {
  installResizeObserverMock,
  installWindowPropertyMock
} from '../../../../../support/mocks/browser-api.installers.js';

describe('NotesPanelLayoutComponent', () => {
  let component;
  let mockLogger;
  let panelElement;
  let toolbarElement;
  let streamContainer;
  let toolbarRect;
  let innerWidthMock;
  let innerHeightMock;
  let resizeObserverMock;

  const setViewport = (width, height) => {
    innerWidthMock.setValue(width);
    innerHeightMock.setValue(height);
  };

  beforeEach(() => {
    mockLogger = createLogger({ name: 'NotesPanelLayoutComponent' });
    panelElement = document.createElement('div');
    toolbarElement = document.createElement('div');
    streamContainer = document.createElement('div');
    innerWidthMock = installWindowPropertyMock('innerWidth', window.innerWidth);
    innerHeightMock = installWindowPropertyMock('innerHeight', window.innerHeight);
    resizeObserverMock = installResizeObserverMock();

    toolbarRect = {
      top: 100,
      left: 200,
      right: 260,
      bottom: 140,
      width: 60,
      height: 40
    };
    toolbarElement.getBoundingClientRect = () => toolbarRect;

    component = new NotesPanelLayoutComponent({ logger: mockLogger });
  });

  afterEach(() => {
    component.dispose();
    resizeObserverMock.cleanup();
    innerHeightMock.cleanup();
    innerWidthMock.cleanup();
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

  it('applies right-of-toolbar positioning when there is enough horizontal space', () => {
    setViewport(760, 700);
    panelElement.style.right = '24px';

    component.initialize({ panelElement, toolbarElement, streamContainer });

    expect(panelElement.style.getPropertyValue('--notes-panel-left')).toBe('276px');
    expect(panelElement.style.getPropertyValue('--notes-panel-top')).toBe('100px');
    expect(panelElement.style.getPropertyValue('--notes-panel-min-width')).toBe('200px');
    expect(panelElement.style.getPropertyValue('--notes-panel-max-width')).toBe('450px');
    expect(panelElement.style.getPropertyValue('--notes-panel-min-height')).toBe('300px');
    expect(panelElement.style.getPropertyValue('--notes-panel-max-height')).toBe('600px');
  });

  it('falls back to dock-below and clamps size/position near viewport edges', () => {
    setViewport(360, 250);

    component.initialize({ panelElement, toolbarElement, streamContainer });

    expect(panelElement.style.getPropertyValue('--notes-panel-left')).toBe('160px');
    expect(panelElement.style.getPropertyValue('--notes-panel-top')).toBe('122px');
    expect(panelElement.style.getPropertyValue('--notes-panel-min-width')).toBe('200px');
    expect(panelElement.style.getPropertyValue('--notes-panel-max-width')).toBe('344px');
    expect(panelElement.style.getPropertyValue('--notes-panel-min-height')).toBe('120px');
    expect(panelElement.style.getPropertyValue('--notes-panel-max-height')).toBe('120px');
  });

  it('disconnects resize observer on dispose', () => {
    component.initialize({ panelElement, toolbarElement, streamContainer });
    const observer = component._resizeObserver;
    component.dispose();

    expect(observer).toBeTruthy();
    expect(observer.disconnect).toHaveBeenCalled();
    expect(component._resizeObserver).toBeNull();
  });

  it('cancels pending position updates on dispose', () => {
    vi.useFakeTimers();
    component.initialize({ panelElement, toolbarElement, streamContainer });
    const updateSpy = vi.spyOn(component, 'updatePosition');
    updateSpy.mockClear();

    component._schedulePositionUpdate();
    component.dispose();
    vi.advanceTimersByTime(100);
    vi.useRealTimers();

    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('reinitializes resize lifecycle without duplicate listeners', () => {
    vi.useFakeTimers();
    component.initialize({ panelElement, toolbarElement, streamContainer });
    component.initialize({ panelElement, toolbarElement, streamContainer });
    const scheduleSpy = vi.spyOn(component, '_schedulePositionUpdate');
    window.dispatchEvent(new Event('resize'));
    vi.advanceTimersByTime(100);
    vi.useRealTimers();
    expect(scheduleSpy).toHaveBeenCalledTimes(1);
  });
});
