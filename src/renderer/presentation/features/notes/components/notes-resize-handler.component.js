/**
 * Notes Resize Handler Component
 *
 * Handles drag-to-resize functionality for the notes list, including:
 * - Drag-to-resize logic
 * - Width constraints
 * - Resize state management
 * - Click-to-collapse toggle
 */

import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { NotesPanelConfig } from '@renderer/presentation/config/notes-panel.config';

// List resize constraints
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

class NotesResizeHandlerComponent extends PresentationComponent {
  constructor({ logger }) {
    super();
    this.logger = logger;

    // Resize state
    this.isListVisible = true;
    this._isDragging = false;
    this._dragStartX = 0;
    this._dragStartWidth = 0;
    this._customListWidth = LIST_WIDTH_DEFAULT;
    this._boundDragMove = null;
    this._boundDragEnd = null;

    // RAF throttling for drag
    this._dragFramePending = false;
    this._rafId = null;
    this._dragBodyStyleSnapshot = null;

    // Elements (cached for performance)
    this.listToggle = null;
    this.panelElement = null;
    this._contentElement = null;
    this._listWrapperElement = null;
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} options
   * @param {HTMLElement} options.listToggle - List toggle handle element
   * @param {HTMLElement} options.panelElement - Panel container element
   * @param {Function} options.onToggle - Callback when list is toggled
   * @param {HTMLElement} options.panelContent - Panel content element
   * @param {HTMLElement} options.listWrapper - List wrapper element
   */
  initialize({ listToggle, panelElement, panelContent, listWrapper, onToggle }) {
    this.listToggle = listToggle;
    this.panelElement = panelElement;
    this.onToggle = onToggle;

    if (!this.listToggle) {
      this.logger?.warn('List toggle element not found');
      return;
    }

    // Cache DOM elements for performance
    this._contentElement = panelContent || null;
    this._listWrapperElement = listWrapper || null;

    this._setupListToggle();
  }

  /**
   * Get current list visibility state
   * @returns {boolean}
   */
  isVisible() {
    return this.isListVisible;
  }

  /**
   * Set list width
   * @param {number} width - Width in pixels
   */
  setListWidth(width) {
    this._customListWidth = width;
    this._setListWidth(width);
  }

  /**
   * Get current list width
   * @returns {number}
   */
  getListWidth() {
    return this._getListWidth();
  }

  /**
   * Setup list toggle with drag-to-resize and click-to-collapse
   * @private
   */
  _setupListToggle() {
    if (!this.listToggle) return;

    const getClientX = (e) => e.touches?.[0]?.clientX ?? e.clientX;

    const startDrag = (e) => {
      e.preventDefault();

      this._dragStartX = getClientX(e);
      this._dragStartWidth = this._getListWidth();
      this._isDragging = false;

      this._boundDragMove = handleMove;
      this._boundDragEnd = endDrag;

      this.replaceManaged(DRAG_MOVE_MOUSE_LIFECYCLE, this.listen(document, 'mousemove', handleMove));
      this.replaceManaged(DRAG_END_MOUSE_LIFECYCLE, this.listen(document, 'mouseup', endDrag));
      this.replaceManaged(DRAG_MOVE_TOUCH_LIFECYCLE, this.listen(document, 'touchmove', handleMove, { passive: false }));
      this.replaceManaged(DRAG_END_TOUCH_LIFECYCLE, this.listen(document, 'touchend', endDrag));
      this.replaceManaged(DRAG_CANCEL_TOUCH_LIFECYCLE, this.listen(document, 'touchcancel', endDrag));

      this._applyDragVisualState();
    };

    const handleMove = (e) => {
      const currentX = getClientX(e);
      const delta = currentX - this._dragStartX;

      if (!this._isDragging && Math.abs(delta) >= DRAG_THRESHOLD) {
        this._isDragging = true;
        this.listToggle?.classList.add('dragging');
      }

      if (this._isDragging) {
        e.preventDefault();

        // RAF throttle the width update to avoid layout thrashing
        if (this._dragFramePending) return;
        this._dragFramePending = true;

        const newWidth = Math.min(
          LIST_WIDTH_MAX,
          Math.max(LIST_WIDTH_MIN, this._dragStartWidth + delta)
        );

        const rafId = requestAnimationFrame(() => {
          this._dragFramePending = false;
          this._rafId = null;
          this.cancelManaged(DRAG_FRAME_LIFECYCLE);
          this._setListWidth(newWidth);
        });
        this._rafId = rafId;
        this.replaceManaged(DRAG_FRAME_LIFECYCLE, this.track(() => {
          cancelAnimationFrame(rafId);
          if (this._rafId === rafId) {
            this._rafId = null;
          }
          this._dragFramePending = false;
        }));
      }
    };

    const endDrag = () => {
      this._cleanupDragListeners();

      // Cancel any pending RAF
      this.cancelManaged(DRAG_FRAME_LIFECYCLE);
      if (this._rafId) {
        cancelAnimationFrame(this._rafId);
        this._rafId = null;
      }
      this._dragFramePending = false;

      this._cleanupDragVisualState();

      if (!this._isDragging) {
        this._toggleListVisibility();
      } else {
        this._customListWidth = this._getListWidth();
      }

      this._isDragging = false;
      this._boundDragMove = null;
      this._boundDragEnd = null;
    };

    this.listen(this.listToggle, 'mousedown', startDrag);
    this.listen(this.listToggle, 'touchstart', startDrag, { passive: false });
  }

  /**
   * Toggle list visibility
   * @private
   */
  _toggleListVisibility() {
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

  /**
   * Get current list width
   * @returns {number}
   * @private
   */
  _getListWidth() {
    if (!this._listWrapperElement) return LIST_WIDTH_DEFAULT;
    return this._listWrapperElement.offsetWidth;
  }

  /**
   * Set list width
   * @param {number} width - Width in pixels
   * @private
   */
  _setListWidth(width) {
    if (!this._contentElement) return;
    this._contentElement.style.setProperty('--notes-list-width', `${width}px`);
  }

  /**
   * Cleanup drag listeners
   * @private
   */
  _cleanupDragListeners() {
    this.cancelManaged(DRAG_MOVE_MOUSE_LIFECYCLE);
    this.cancelManaged(DRAG_END_MOUSE_LIFECYCLE);
    this.cancelManaged(DRAG_MOVE_TOUCH_LIFECYCLE);
    this.cancelManaged(DRAG_END_TOUCH_LIFECYCLE);
    this.cancelManaged(DRAG_CANCEL_TOUCH_LIFECYCLE);
  }

  _applyDragVisualState() {
    if (!this._dragBodyStyleSnapshot) {
      this._dragBodyStyleSnapshot = {
        cursor: document.body.style.cursor,
        userSelect: document.body.style.userSelect
      };
    }
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }

  /**
   * Cleanup drag visual state
   * @private
   */
  _cleanupDragVisualState() {
    if (this._dragBodyStyleSnapshot) {
      document.body.style.cursor = this._dragBodyStyleSnapshot.cursor;
      document.body.style.userSelect = this._dragBodyStyleSnapshot.userSelect;
      this._dragBodyStyleSnapshot = null;
    }
    this.listToggle?.classList.remove('dragging');
  }

  /**
   * Cleanup resources
   */
  dispose() {
    // Clean up drag state
    this._cleanupDragListeners();
    this._cleanupDragVisualState();
    this._isDragging = false;
    this._boundDragMove = null;
    this._boundDragEnd = null;

    // Cancel any pending RAF
    this.cancelManaged(DRAG_FRAME_LIFECYCLE);
    if (this._rafId) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    this._dragFramePending = false;
    this._dragBodyStyleSnapshot = null;
    super.dispose();

    // Clear references
    this.listToggle = null;
    this.panelElement = null;
    this._contentElement = null;
    this._listWrapperElement = null;
    this.onToggle = null;
    this.logger = null;
    this.isListVisible = true;
    this._customListWidth = LIST_WIDTH_DEFAULT;
  }
}

export { NotesResizeHandlerComponent };
