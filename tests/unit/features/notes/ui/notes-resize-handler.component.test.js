/**
 * NotesResizeHandlerComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotesResizeHandlerComponent } from '@renderer/presentation/features/notes/components/notes-resize-handler.component.js';
import { createLogger } from '../../../../factories/index.js';

describe('NotesResizeHandlerComponent', () => {
  let component;
  let mockLogger;

  beforeEach(() => {
    mockLogger = createLogger({ name: 'NotesResizeHandlerComponent' });

    component = new NotesResizeHandlerComponent({ logger: mockLogger });
  });

  afterEach(() => {
    component.dispose();
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create component with default state', () => {
      expect(component.isListVisible).toBe(true);
      expect(component.listToggle).toBeNull();
      expect(component.panelElement).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should set up toggle when elements are provided', () => {
      const listToggle = document.createElement('button');
      const panelElement = document.createElement('div');
      const panelContent = document.createElement('div');
      const listWrapper = document.createElement('div');

      component.initialize({
        listToggle,
        panelElement,
        panelContent,
        listWrapper,
        onToggle: vi.fn()
      });

      expect(component.listToggle).toBe(listToggle);
      expect(component.panelElement).toBe(panelElement);
    });

    it('should warn when list toggle element is missing', () => {
      component.initialize({
        listToggle: null,
        panelElement: document.createElement('div'),
        onToggle: vi.fn()
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('List toggle element not found');
    });

    it('should handle logger being undefined when toggle is missing', () => {
      const comp = new NotesResizeHandlerComponent({ logger: undefined });
      expect(() => comp.initialize({
        listToggle: null,
        panelElement: null,
        onToggle: vi.fn()
      })).not.toThrow();
      comp.dispose();
    });

    it('should handle null panelContent and listWrapper', () => {
      const listToggle = document.createElement('button');
      component.initialize({
        listToggle,
        panelElement: document.createElement('div'),
        panelContent: null,
        listWrapper: null,
        onToggle: vi.fn()
      });

      expect(component._contentElement).toBeNull();
      expect(component._listWrapperElement).toBeNull();
    });
  });

  describe('isVisible', () => {
    it('should return true by default', () => {
      expect(component.isVisible()).toBe(true);
    });

    it('should reflect toggled state', () => {
      component.isListVisible = false;
      expect(component.isVisible()).toBe(false);
    });
  });

  describe('setListWidth', () => {
    it('should set width via CSS custom property', () => {
      const contentElement = document.createElement('div');
      component._contentElement = contentElement;

      component.setListWidth(150);

      expect(contentElement.style.getPropertyValue('--notes-list-width')).toBe('150px');
      expect(component._customListWidth).toBe(150);
    });

    it('should not throw when content element is null', () => {
      component._contentElement = null;
      expect(() => component.setListWidth(150)).not.toThrow();
    });
  });

  describe('getListWidth', () => {
    it('should return default width when list wrapper is null', () => {
      component._listWrapperElement = null;
      expect(component.getListWidth()).toBe(130);
    });

    it('should return offsetWidth when list wrapper exists', () => {
      const wrapper = document.createElement('div');
      Object.defineProperty(wrapper, 'offsetWidth', { value: 180 });
      component._listWrapperElement = wrapper;

      expect(component.getListWidth()).toBe(180);
    });
  });

  describe('click-to-toggle (no drag)', () => {
    let listToggle;
    let panelContent;
    let onToggle;

    beforeEach(() => {
      listToggle = document.createElement('button');
      panelContent = document.createElement('div');
      onToggle = vi.fn();

      component.initialize({
        listToggle,
        panelElement: document.createElement('div'),
        panelContent,
        listWrapper: document.createElement('div'),
        onToggle
      });
    });

    it('should collapse list on click when visible', () => {
      component.isListVisible = true;

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(component.isListVisible).toBe(false);
      expect(panelContent.classList.contains('notes-list-collapsed')).toBe(true);
      expect(onToggle).toHaveBeenCalledWith(false);
    });

    it('should expand list on click when collapsed', () => {
      component.isListVisible = false;
      panelContent.classList.add('notes-list-collapsed');

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(component.isListVisible).toBe(true);
      expect(panelContent.classList.contains('notes-list-collapsed')).toBe(false);
      expect(onToggle).toHaveBeenCalledWith(true);
    });

    it('should set aria-expanded attribute on toggle', () => {
      component.isListVisible = true;

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(listToggle.getAttribute('aria-expanded')).toBe('false');
    });

    it('should handle toggle without content element', () => {
      component._contentElement = null;
      component.isListVisible = true;

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(component.isListVisible).toBe(false);
    });

    it('should handle toggle without onToggle callback', () => {
      component.onToggle = null;
      component.isListVisible = true;

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      expect(() => document.dispatchEvent(new MouseEvent('mouseup'))).not.toThrow();
    });
  });

  describe('drag-to-resize', () => {
    let listToggle;
    let panelContent;

    beforeEach(() => {
      listToggle = document.createElement('button');
      panelContent = document.createElement('div');

      component.initialize({
        listToggle,
        panelElement: document.createElement('div'),
        panelContent,
        listWrapper: document.createElement('div'),
        onToggle: vi.fn()
      });
    });

    it('should enter drag mode when moved past threshold', () => {
      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 104 }));

      expect(component._isDragging).toBe(true);
      expect(listToggle.classList.contains('dragging')).toBe(true);
    });

    it('should not enter drag mode when moved less than threshold', () => {
      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 101 }));

      expect(component._isDragging).toBe(false);
    });

    it('should reset cursor style on drag end', () => {
      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));
      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
    });

    it('should save custom width after drag', () => {
      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));
      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(component._isDragging).toBe(false);
    });

    it('should cancel pending RAF on drag end', () => {
      const cancelSpy = vi.spyOn(global, 'cancelAnimationFrame');

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));

      component._rafId = 123;
      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(cancelSpy).toHaveBeenCalledWith(123);
    });

    it('should throttle RAF during drag', () => {
      const rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockImplementation(cb => {
        cb();
        return 1;
      });

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));

      expect(rafSpy).toHaveBeenCalled();
    });

    it('should skip RAF when frame is already pending', () => {
      const rafSpy = vi.spyOn(global, 'requestAnimationFrame').mockReturnValue(1);

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));

      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));
      const firstCallCount = rafSpy.mock.calls.length;

      component._dragFramePending = true;
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 115 }));

      expect(rafSpy.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('touch events', () => {
    let listToggle;

    beforeEach(() => {
      listToggle = document.createElement('button');
      component.initialize({
        listToggle,
        panelElement: document.createElement('div'),
        panelContent: document.createElement('div'),
        listWrapper: document.createElement('div'),
        onToggle: vi.fn()
      });
    });

    it('should handle touchstart as drag start', () => {
      const touch = { clientX: 100 };
      const event = new TouchEvent('touchstart', {
        touches: [touch],
        cancelable: true
      });

      listToggle.dispatchEvent(event);

      expect(component._dragStartX).toBe(100);
    });

    it('should clean up touch listeners on touchend', () => {
      const touch = { clientX: 100 };
      listToggle.dispatchEvent(new TouchEvent('touchstart', {
        touches: [touch],
        cancelable: true
      }));

      document.dispatchEvent(new TouchEvent('touchend'));

      expect(component._boundDragMove).toBeNull();
      expect(component._boundDragEnd).toBeNull();
    });

    it('should clean up on touchcancel', () => {
      const touch = { clientX: 100 };
      listToggle.dispatchEvent(new TouchEvent('touchstart', {
        touches: [touch],
        cancelable: true
      }));

      document.dispatchEvent(new TouchEvent('touchcancel'));

      expect(component._isDragging).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should cancel pending RAF', () => {
      const cancelSpy = vi.spyOn(global, 'cancelAnimationFrame');
      component._rafId = 456;

      component.dispose();

      expect(cancelSpy).toHaveBeenCalledWith(456);
      expect(component._rafId).toBeNull();
    });

    it('should handle dispose without active RAF', () => {
      component._rafId = null;
      expect(() => component.dispose()).not.toThrow();
    });

    it('should clean up drag listeners if active', () => {
      const listToggle = document.createElement('button');
      component.initialize({
        listToggle,
        panelElement: document.createElement('div'),
        panelContent: document.createElement('div'),
        listWrapper: document.createElement('div'),
        onToggle: vi.fn()
      });

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));

      component.dispose();

      expect(component._boundDragMove).toBeNull();
      expect(component._boundDragEnd).toBeNull();
      expect(component.listToggle).toBeNull();
    });

    it('should clear drag visual state when disposed during active drag', () => {
      const listToggle = document.createElement('button');
      document.body.style.cursor = 'wait';
      document.body.style.userSelect = 'text';
      component.initialize({
        listToggle,
        panelElement: document.createElement('div'),
        panelContent: document.createElement('div'),
        listWrapper: document.createElement('div'),
        onToggle: vi.fn()
      });

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 104 }));

      expect(document.body.style.cursor).toBe('col-resize');
      expect(document.body.style.userSelect).toBe('none');
      expect(listToggle.classList.contains('dragging')).toBe(true);

      component.dispose();

      expect(document.body.style.cursor).toBe('wait');
      expect(document.body.style.userSelect).toBe('text');
      expect(listToggle.classList.contains('dragging')).toBe(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    });

    it('should reset all state', () => {
      component.dispose();

      expect(component.isListVisible).toBe(true);
      expect(component._isDragging).toBe(false);
      expect(component._dragFramePending).toBe(false);
      expect(component.panelElement).toBeNull();
      expect(component._contentElement).toBeNull();
      expect(component._listWrapperElement).toBeNull();
      expect(component.onToggle).toBeNull();
      expect(component.logger).toBeNull();
    });
  });
});
