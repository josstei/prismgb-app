/**
 * NotesResizeHandlerComponent Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { NotesResizeHandlerComponent } from '@renderer/presentation/features/notes/notes-resize-handler.component.js';
import { createLogger } from '../../../../../factories/index.js';
import { installAnimationFrameMock } from '../../../../../support/mocks/browser-api.installers.js';

type ClientXTouch = Pick<Touch, 'clientX'>;

const createClientXTouch = (clientX: number): ClientXTouch => ({ clientX });

const createTouchEvent = (type: string, touch?: ClientXTouch): TouchEvent =>
  new TouchEvent(type, {
    touches: touch ? ([touch] as unknown as Touch[]) : [],
    cancelable: true
  });

describe('NotesResizeHandlerComponent', () => {
  let component: NotesResizeHandlerComponent;
  let mockLogger: ReturnType<typeof createLogger>;
  let animationFrameMock: ReturnType<typeof installAnimationFrameMock> | undefined;

  beforeEach(() => {
    mockLogger = createLogger({ name: 'NotesResizeHandlerComponent' });

    component = new NotesResizeHandlerComponent({ logger: mockLogger });
  });

  afterEach(() => {
    component.dispose();
    animationFrameMock?.cleanup();
  });

  describe('constructor', () => {
    it('should create component with default state', () => {
      expect(component.isListVisible).toBe(true);
      expect(component.listToggle).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should set up toggle when elements are provided', () => {
      const listToggle = document.createElement('button');
      const panelContent = document.createElement('div');
      const listWrapper = document.createElement('div');

      component.initialize({
        listToggle,
        panelContent,
        listWrapper,
      });

      expect(component.listToggle).toBe(listToggle);
    });

    it('should warn when list toggle element is missing', () => {
      component.initialize({
        listToggle: null,
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('List toggle element not found');
    });

    it('should handle logger being undefined when toggle is missing', () => {
      const comp = new NotesResizeHandlerComponent({ logger: undefined });
      expect(() => comp.initialize({
        listToggle: null,
      })).not.toThrow();
      comp.dispose();
    });

    it('should handle null panelContent and listWrapper', () => {
      const listToggle = document.createElement('button');
      component.initialize({
        listToggle,
        panelContent: null,
        listWrapper: null,
      });

      expect(component._contentElement).toBeNull();
      expect(component._listWrapperElement).toBeNull();
    });
  });

  describe('click-to-toggle (no drag)', () => {
    let listToggle: HTMLButtonElement;
    let panelContent: HTMLDivElement;

    beforeEach(() => {
      listToggle = document.createElement('button');
      panelContent = document.createElement('div');

      component.initialize({
        listToggle,
        panelContent,
        listWrapper: document.createElement('div'),
      });
    });

    it('should collapse list on click when visible', () => {
      component.isListVisible = true;

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(component.isListVisible).toBe(false);
      expect(panelContent.classList.contains('notes-list-collapsed')).toBe(true);
    });

    it('should expand list on click when collapsed', () => {
      component.isListVisible = false;
      panelContent.classList.add('notes-list-collapsed');

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(component.isListVisible).toBe(true);
      expect(panelContent.classList.contains('notes-list-collapsed')).toBe(false);
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


  });

  describe('drag-to-resize', () => {
    let listToggle: HTMLButtonElement;
    let panelContent: HTMLDivElement;

    beforeEach(() => {
      listToggle = document.createElement('button');
      panelContent = document.createElement('div');

      component.initialize({
        listToggle,
        panelContent,
        listWrapper: document.createElement('div'),
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
      animationFrameMock = installAnimationFrameMock();

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));

      document.dispatchEvent(new MouseEvent('mouseup'));

      expect(animationFrameMock.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should throttle RAF during drag', () => {
      animationFrameMock = installAnimationFrameMock({ requestAnimationFrame: vi.fn((cb) => { cb(); return 1; }) });

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));

      expect(animationFrameMock.requestAnimationFrame).toHaveBeenCalled();
    });

    it('should skip RAF when frame is already pending', () => {
      animationFrameMock = installAnimationFrameMock({ requestAnimationFrame: vi.fn(() => 1) });

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));

      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));
      const firstCallCount = animationFrameMock.requestAnimationFrame.mock.calls.length;

      component._dragFramePending = true;
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 115 }));

      expect(animationFrameMock.requestAnimationFrame.mock.calls.length).toBe(firstCallCount);
    });
  });

  describe('touch events', () => {
    let listToggle: HTMLButtonElement;

    beforeEach(() => {
      listToggle = document.createElement('button');
      component.initialize({
        listToggle,
        panelContent: document.createElement('div'),
        listWrapper: document.createElement('div'),
      });
    });

    it('should handle touchstart as drag start', () => {
      const touch = createClientXTouch(100);
      const event = createTouchEvent('touchstart', touch);

      listToggle.dispatchEvent(event);

      expect(component._dragStartX).toBe(100);
    });

    it('should clean up touch listeners on touchend', () => {
      const touch = createClientXTouch(100);
      listToggle.dispatchEvent(createTouchEvent('touchstart', touch));

      document.dispatchEvent(createTouchEvent('touchend'));

      expect(component._isDragging).toBe(false);
    });

    it('should clean up on touchcancel', () => {
      const touch = createClientXTouch(100);
      listToggle.dispatchEvent(createTouchEvent('touchstart', touch));

      document.dispatchEvent(createTouchEvent('touchcancel'));

      expect(component._isDragging).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should cancel pending RAF', () => {
      animationFrameMock = installAnimationFrameMock();
      const listToggle = document.createElement('button');
      component.initialize({
        listToggle,
        panelContent: document.createElement('div'),
        listWrapper: document.createElement('div'),
      });

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));
      document.dispatchEvent(new MouseEvent('mousemove', { clientX: 110 }));

      component.dispose();

      expect(animationFrameMock.cancelAnimationFrame).toHaveBeenCalled();
    });

    it('should handle dispose without active RAF', () => {
      expect(() => component.dispose()).not.toThrow();
    });

    it('should clean up drag listeners if active', () => {
      const listToggle = document.createElement('button');
      component.initialize({
        listToggle,
        panelContent: document.createElement('div'),
        listWrapper: document.createElement('div'),
      });

      listToggle.dispatchEvent(new MouseEvent('mousedown', { clientX: 100 }));

      component.dispose();

      expect(component.listToggle).toBeNull();
    });

    it('should clear drag visual state when disposed during active drag', () => {
      const listToggle = document.createElement('button');
      document.body.style.cursor = 'wait';
      document.body.style.userSelect = 'text';
      component.initialize({
        listToggle,
        panelContent: document.createElement('div'),
        listWrapper: document.createElement('div'),
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
      expect(component._contentElement).toBeNull();
      expect(component._listWrapperElement).toBeNull();
      expect(component.logger).toBeNull();
    });
  });
});
