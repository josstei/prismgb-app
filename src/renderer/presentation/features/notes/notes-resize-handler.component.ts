import { PresentationComponent } from '@platform/ui-base';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { NotesPanelConfig } from '@renderer/presentation/config/notes-panel.config';
import type { LoggerLike } from '@platform/core';

const DRAG_THRESHOLD = NotesPanelConfig.DRAG_THRESHOLD;
const LIST_WIDTH_MIN = NotesPanelConfig.LIST_WIDTH.MIN;
const LIST_WIDTH_MAX = NotesPanelConfig.LIST_WIDTH.MAX;
const LIST_WIDTH_DEFAULT = NotesPanelConfig.LIST_WIDTH.DEFAULT;

const DRAG_MOVE_MOUSE_LIFECYCLE = Symbol('notesResizeDragMoveMouseLifecycle');
const DRAG_MOVE_TOUCH_LIFECYCLE = Symbol('notesResizeDragMoveTouchLifecycle');
const DRAG_END_MOUSE_LIFECYCLE = Symbol('notesResizeDragEndMouseLifecycle');
const DRAG_END_TOUCH_LIFECYCLE = Symbol('notesResizeDragEndTouchLifecycle');
const DRAG_CANCEL_TOUCH_LIFECYCLE = Symbol('notesResizeDragCancelTouchLifecycle');
const DRAG_FRAME_LIFECYCLE = Symbol('notesResizeDragFrameLifecycle');
const LIST_TOGGLE_SETUP_LIFECYCLE = Symbol('notesResizeListToggleSetupLifecycle');

type BodyStyleSnapshot = { cursor: string; userSelect: string };

export interface NotesResizeHandlerComponentOptions {
  logger?: LoggerLike | null;
}

export interface NotesResizeHandlerInitializeOptions {
  listToggle?: HTMLElement | null;
  panelElement?: HTMLElement | null;
  panelContent?: HTMLElement | null;
  listWrapper?: HTMLElement | null;
  onToggle?: ((isVisible: boolean) => void) | null;
}

class NotesResizeHandlerComponent extends PresentationComponent {
  declare logger: LoggerLike | null | undefined;
  declare isListVisible: boolean;
  declare _isDragging: boolean;
  declare _dragStartX: number;
  declare _dragStartWidth: number;
  declare _customListWidth: number;
  declare _dragFramePending: boolean;
  declare _dragBodyStyleSnapshot: BodyStyleSnapshot | null;
  declare listToggle: HTMLElement | null | undefined;
  declare panelElement: HTMLElement | null | undefined;
  declare _contentElement: HTMLElement | null;
  declare _listWrapperElement: HTMLElement | null;
  declare onToggle: ((isVisible: boolean) => void) | null | undefined;

  constructor({ logger }: NotesResizeHandlerComponentOptions) {
    super();
    this.logger = logger;
    this.isListVisible = true;
    this._isDragging = false;
    this._dragStartX = 0;
    this._dragStartWidth = 0;
    this._customListWidth = LIST_WIDTH_DEFAULT;
    this._dragFramePending = false;
    this._dragBodyStyleSnapshot = null;
    this.listToggle = null;
    this.panelElement = null;
    this._contentElement = null;
    this._listWrapperElement = null;
  }

  initialize({ listToggle, panelElement, panelContent, listWrapper, onToggle }: NotesResizeHandlerInitializeOptions): void {
    this.cancelManaged(LIST_TOGGLE_SETUP_LIFECYCLE);
    this._cleanupDragListeners();
    this._cancelDragFrame();
    this._cleanupDragVisualState();
    this._isDragging = false;
    this.listToggle = listToggle;
    this.panelElement = panelElement;
    this.onToggle = onToggle;
    this._contentElement = panelContent || null;
    this._listWrapperElement = listWrapper || null;

    if (!this.listToggle) {
      this.logger?.warn('List toggle element not found');
      return;
    }

    this._setupListToggle();
  }

  isVisible(): boolean {
    return this.isListVisible;
  }

  setListWidth(width: number): void {
    this._customListWidth = width;
    this._setListWidth(width);
  }

  getListWidth(): number {
    return this._getListWidth();
  }

  _setupListToggle(): void {
    if (!this.listToggle) return;

    const getClientX = (event: Event): number => {
      if ('touches' in event) {
        const touchEvent = event as TouchEvent;
        return touchEvent.touches?.[0]?.clientX ?? 0;
      }
      return (event as MouseEvent).clientX;
    };

    let handleMove: EventListener;
    let endDrag: EventListener;

    const startDrag: EventListener = (event) => {
      event.preventDefault();
      this._dragStartX = getClientX(event);
      this._dragStartWidth = this._getListWidth();
      this._isDragging = false;

      this.replaceManaged(DRAG_MOVE_MOUSE_LIFECYCLE, this.listen(document, 'mousemove', handleMove));
      this.replaceManaged(DRAG_END_MOUSE_LIFECYCLE, this.listen(document, 'mouseup', endDrag));
      this.replaceManaged(DRAG_MOVE_TOUCH_LIFECYCLE, this.listen(document, 'touchmove', handleMove, { passive: false }));
      this.replaceManaged(DRAG_END_TOUCH_LIFECYCLE, this.listen(document, 'touchend', endDrag));
      this.replaceManaged(DRAG_CANCEL_TOUCH_LIFECYCLE, this.listen(document, 'touchcancel', endDrag));
      this._applyDragVisualState();
    };

    handleMove = (event): void => {
      const currentX = getClientX(event);
      const delta = currentX - this._dragStartX;

      if (!this._isDragging && Math.abs(delta) >= DRAG_THRESHOLD) {
        this._isDragging = true;
        this.listToggle?.classList.add('dragging');
      }

      if (this._isDragging) {
        event.preventDefault();
        if (this._dragFramePending) return;
        this._dragFramePending = true;

        const newWidth = Math.min(LIST_WIDTH_MAX, Math.max(LIST_WIDTH_MIN, this._dragStartWidth + delta));
        this.replaceAnimationFrame(DRAG_FRAME_LIFECYCLE, () => {
          this._dragFramePending = false;
          this._setListWidth(newWidth);
        });
      }
    };

    endDrag = (): void => {
      this._cleanupDragListeners();
      this._cancelDragFrame();
      this._cleanupDragVisualState();

      if (!this._isDragging) {
        this._toggleListVisibility();
      } else {
        this._customListWidth = this._getListWidth();
      }

      this._isDragging = false;
    };

    const setupDisposers = [
      this.listen(this.listToggle, 'mousedown', startDrag),
      this.listen(this.listToggle, 'touchstart', startDrag, { passive: false })
    ];

    this.replaceManaged(LIST_TOGGLE_SETUP_LIFECYCLE, () => {
      setupDisposers.splice(0).reverse().forEach((dispose) => dispose());
    });
  }

  _toggleListVisibility(): void {
    this.isListVisible = !this.isListVisible;

    if (!this._contentElement) return;

    if (this.isListVisible) {
      this._contentElement.classList.remove(CSSClasses.LIST_COLLAPSED);
      this._setListWidth(this._customListWidth);
      this.listToggle?.setAttribute('aria-expanded', 'true');
    } else {
      this._contentElement.classList.add(CSSClasses.LIST_COLLAPSED);
      this.listToggle?.setAttribute('aria-expanded', 'false');
    }

    this.onToggle?.(this.isListVisible);
  }

  _getListWidth(): number {
    if (!this._listWrapperElement) return LIST_WIDTH_DEFAULT;
    return this._listWrapperElement.offsetWidth;
  }

  _setListWidth(width: number): void {
    if (!this._contentElement) return;
    this._contentElement.style.setProperty('--notes-list-width', `${width}px`);
  }

  _cleanupDragListeners(): void {
    this.cancelManaged(DRAG_MOVE_MOUSE_LIFECYCLE);
    this.cancelManaged(DRAG_END_MOUSE_LIFECYCLE);
    this.cancelManaged(DRAG_MOVE_TOUCH_LIFECYCLE);
    this.cancelManaged(DRAG_END_TOUCH_LIFECYCLE);
    this.cancelManaged(DRAG_CANCEL_TOUCH_LIFECYCLE);
  }

  _cancelDragFrame(): void {
    this.cancelManaged(DRAG_FRAME_LIFECYCLE);
    this._dragFramePending = false;
  }

  _applyDragVisualState(): void {
    if (!this._dragBodyStyleSnapshot) {
      this._dragBodyStyleSnapshot = {
        cursor: document.body.style.cursor,
        userSelect: document.body.style.userSelect
      };
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  _cleanupDragVisualState(): void {
    if (this._dragBodyStyleSnapshot) {
      document.body.style.cursor = this._dragBodyStyleSnapshot.cursor;
      document.body.style.userSelect = this._dragBodyStyleSnapshot.userSelect;
      this._dragBodyStyleSnapshot = null;
    }
    this.listToggle?.classList.remove('dragging');
  }

  override dispose(): void | Promise<void> {
    this._cleanupDragListeners();
    this._cleanupDragVisualState();
    this._isDragging = false;
    this._cancelDragFrame();
    this._dragBodyStyleSnapshot = null;
    const disposed = super.dispose();
    this.listToggle = null;
    this.panelElement = null;
    this._contentElement = null;
    this._listWrapperElement = null;
    this.onToggle = null;
    this.logger = null;
    this.isListVisible = true;
    this._customListWidth = LIST_WIDTH_DEFAULT;
    return disposed;
  }
}

export { NotesResizeHandlerComponent };
