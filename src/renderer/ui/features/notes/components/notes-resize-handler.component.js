/**
 * Notes Resize Handler Component
 *
 * Handles drag-to-resize functionality for the notes list, including:
 * - Drag-to-resize logic
 * - Width constraints
 * - Resize state management
 * - Click-to-collapse toggle
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';
import { NotesPanelConfig } from '@shared/config/notes-panel.config.js';

// List resize constraints
const DRAG_THRESHOLD = NotesPanelConfig.DRAG_THRESHOLD;
const LIST_WIDTH_MIN = NotesPanelConfig.LIST_WIDTH.MIN;
const LIST_WIDTH_MAX = NotesPanelConfig.LIST_WIDTH.MAX;
const LIST_WIDTH_DEFAULT = NotesPanelConfig.LIST_WIDTH.DEFAULT;

class NotesResizeHandlerComponent {
  constructor({ logger }) {
    this.logger = logger;

    // Resize state
    this.isListVisible = true;
    this._isDragging = false;
    this._dragStartX = 0;
    this._dragStartWidth = 0;
    this._customListWidth = LIST_WIDTH_DEFAULT;
    this._boundDragMove = null;
    this._boundDragEnd = null;

    // Track DOM listeners for cleanup
    this._domListeners = createDomListenerManager({ logger });

    // Elements
    this.listToggle = null;
    this.panelElement = null;
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} options
   * @param {HTMLElement} options.listToggle - List toggle handle element
   * @param {HTMLElement} options.panelElement - Panel container element
   * @param {Function} options.onToggle - Callback when list is toggled
   */
  initialize({ listToggle, panelElement, onToggle }) {
    this.listToggle = listToggle;
    this.panelElement = panelElement;
    this.onToggle = onToggle;

    if (!this.listToggle) {
      this.logger?.warn('List toggle element not found');
      return;
    }

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

      document.addEventListener('mousemove', handleMove);
      document.addEventListener('mouseup', endDrag);
      document.addEventListener('touchmove', handleMove, { passive: false });
      document.addEventListener('touchend', endDrag);
      document.addEventListener('touchcancel', endDrag);

      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
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
        const newWidth = Math.min(
          LIST_WIDTH_MAX,
          Math.max(LIST_WIDTH_MIN, this._dragStartWidth + delta)
        );
        this._setListWidth(newWidth);
      }
    };

    const endDrag = () => {
      this._cleanupDragListeners();

      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      this.listToggle?.classList.remove('dragging');

      if (!this._isDragging) {
        this._toggleListVisibility();
      } else {
        this._customListWidth = this._getListWidth();
      }

      this._isDragging = false;
      this._boundDragMove = null;
      this._boundDragEnd = null;
    };

    this._domListeners.add(this.listToggle, 'mousedown', startDrag);
    this._domListeners.add(this.listToggle, 'touchstart', startDrag, { passive: false });
  }

  /**
   * Toggle list visibility
   * @private
   */
  _toggleListVisibility() {
    this.isListVisible = !this.isListVisible;

    const content = this.panelElement?.querySelector('.notes-panel-content');
    if (!content) return;

    if (this.isListVisible) {
      content.classList.remove(CSSClasses.LIST_COLLAPSED);
      this._setListWidth(this._customListWidth);
      this.listToggle?.setAttribute('aria-expanded', 'true');
    } else {
      content.classList.add(CSSClasses.LIST_COLLAPSED);
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
    const listWrapper = this.panelElement?.querySelector('.notes-list-wrapper');
    if (!listWrapper) return LIST_WIDTH_DEFAULT;
    return listWrapper.offsetWidth;
  }

  /**
   * Set list width
   * @param {number} width - Width in pixels
   * @private
   */
  _setListWidth(width) {
    const content = this.panelElement?.querySelector('.notes-panel-content');
    if (!content) return;
    content.style.setProperty('--notes-list-width', `${width}px`);
  }

  /**
   * Cleanup drag listeners
   * @private
   */
  _cleanupDragListeners() {
    if (this._boundDragMove) {
      document.removeEventListener('mousemove', this._boundDragMove);
      document.removeEventListener('touchmove', this._boundDragMove);
    }
    if (this._boundDragEnd) {
      document.removeEventListener('mouseup', this._boundDragEnd);
      document.removeEventListener('touchend', this._boundDragEnd);
      document.removeEventListener('touchcancel', this._boundDragEnd);
    }
  }

  /**
   * Cleanup resources
   */
  dispose() {
    // Clean up drag state
    this._cleanupDragListeners();
    this._isDragging = false;
    this._boundDragMove = null;
    this._boundDragEnd = null;

    // Remove DOM listeners
    this._domListeners.removeAll();

    // Clear references
    this.listToggle = null;
    this.panelElement = null;
    this.onToggle = null;
    this.logger = null;
    this.isListVisible = true;
    this._customListWidth = LIST_WIDTH_DEFAULT;
  }
}

export { NotesResizeHandlerComponent };
