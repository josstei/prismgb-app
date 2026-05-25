/**
 * Notes Editor View Component
 *
 * Handles the note editor interface, including:
 * - Title and content editing
 * - Autosave debouncing
 * - Dirty state tracking
 * - Editor state management
 */

import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { NotesPanelConfig } from '@renderer/presentation/config/notes-panel.config';

// Timing constants
const SAVE_DEBOUNCE_MS = NotesPanelConfig.AUTOSAVE_DEBOUNCE_MS;
const SAVE_DEBOUNCE_TIMEOUT = Symbol('notesEditorSaveDebounceTimeout');
const DELETE_HOLD_TIMEOUT = Symbol('notesEditorDeleteHoldTimeout');

class NotesEditorViewComponent extends PresentationComponent {
  constructor({ notesService, logger }) {
    super();
    this.notesService = notesService;
    this.logger = logger;

    // Editor state
    this.currentNoteId = null;
    this.hasNote = false;

    // Elements
    this.editorElement = null;
    this.titleInput = null;
    this.contentArea = null;
    this.deleteBtn = null;
    this.gameTagRow = null;
    this.gameTag = null;
    this.gameInput = null;
    this.gameAddBtn = null;
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} options
   * @param {HTMLElement} options.editorElement - Notes editor container
   * @param {HTMLInputElement} options.titleInput - Title input
   * @param {HTMLTextAreaElement} options.contentArea - Content textarea
   * @param {HTMLButtonElement} options.deleteBtn - Delete button
   * @param {HTMLElement} options.gameTagRow - Game tag row container
   * @param {HTMLElement} options.gameTag - Game tag display
   * @param {HTMLInputElement} options.gameInput - Game input field
   * @param {HTMLButtonElement} options.gameAddBtn - Add game button
   * @param {Function} options.onSave - Callback when note should be saved
   * @param {Function} options.onDelete - Callback when note should be deleted
   * @param {Function} options.onGameInputChange - Callback when game input changes
   * @param {Function} options.onShowGameInput - Callback when game input should be shown
   */
  initialize({
    editorElement,
    titleInput,
    contentArea,
    deleteBtn,
    gameTagRow,
    gameTag,
    gameInput,
    gameAddBtn,
    onSave,
    onDelete,
    onGameInputChange,
    onShowGameInput
  }) {
    this.editorElement = editorElement;
    this.titleInput = titleInput;
    this.contentArea = contentArea;
    this.deleteBtn = deleteBtn;
    this.gameTagRow = gameTagRow;
    this.gameTag = gameTag;
    this.gameInput = gameInput;
    this.gameAddBtn = gameAddBtn;
    this.onSave = onSave;
    this.onDelete = onDelete;
    this.onGameInputChange = onGameInputChange;
    this.onShowGameInput = onShowGameInput;

    this._setupEditor();
    this._setupGameTagUI();
    this._setupDeleteButton();
  }

  /**
   * Load note into editor
   * @param {Object} note - Note object
   */
  loadNote(note) {
    if (!note) return;

    this.currentNoteId = note.id;
    this.hasNote = true;

    // Show editor inputs (add has-note class)
    this.editorElement?.classList.add('has-note');

    // Update inputs
    if (this.gameInput) {
      this.gameInput.value = note.gameName || '';
    }
    if (this.titleInput) {
      this.titleInput.value = note.title || '';
    }
    if (this.contentArea) {
      this.contentArea.value = note.content || '';
    }

    // Update game tag display
    this._updateGameTagDisplay();

    // Enable delete button
    this.deleteBtn?.removeAttribute('disabled');
  }

  /**
   * Clear editor
   */
  clear() {
    this.currentNoteId = null;
    this.hasNote = false;

    // Clear inputs
    if (this.gameInput) {
      this.gameInput.value = '';
    }
    if (this.titleInput) {
      this.titleInput.value = '';
    }
    if (this.contentArea) {
      this.contentArea.value = '';
    }

    // Hide editor state
    this.editorElement?.classList.remove('has-note');

    // Disable delete button
    this.deleteBtn?.setAttribute('disabled', '');

    // Update game tag display
    this._updateGameTagDisplay();
  }

  /**
   * Focus title input
   */
  focusTitle() {
    this.titleInput?.focus();
    this.titleInput?.select();
  }

  /**
   * Get current editor values
   * @returns {Object} { title, content, gameName }
   */
  getValues() {
    return {
      title: this.titleInput?.value || '',
      content: this.contentArea?.value || '',
      gameName: this.gameInput?.value || ''
    };
  }

  /**
   * Show game input for editing
   */
  showGameInput() {
    if (!this.gameTagRow || !this.gameInput) return;

    this.gameTagRow.classList.add('editing');
    this.gameInput.focus();
    this.gameInput.select();
  }

  /**
   * Hide game input and show tag
   */
  hideGameInput() {
    if (!this.gameTagRow) return;

    this.gameTagRow.classList.remove('editing');
    this._updateGameTagDisplay();
  }

  /**
   * Flush pending save immediately
   */
  flushSave() {
    this.cancelManaged(SAVE_DEBOUNCE_TIMEOUT);
    this.onSave?.();
  }

  /**
   * Schedule a save using the editor debounce
   */
  scheduleSave() {
    this._scheduleSave();
  }

  /**
   * Setup editor inputs
   * @private
   */
  _setupEditor() {
    // Auto-save on title change
    if (this.titleInput) {
      this.listen(this.titleInput, 'input', () => {
        this._scheduleSave();
      });
    }

    // Auto-save on content change
    if (this.contentArea) {
      this.listen(this.contentArea, 'input', () => {
        this._scheduleSave();
      });
    }
  }

  /**
   * Setup game tag UI (add button, tag click to edit)
   * @private
   */
  _setupGameTagUI() {
    // Add game button - show game input
    if (this.gameAddBtn) {
      this.listen(this.gameAddBtn, 'click', () => {
        this.onShowGameInput?.();
      });
    }

    // Game tag click - edit game
    if (this.gameTag) {
      this.listen(this.gameTag, 'click', () => {
        this.onShowGameInput?.();
      });
    }
  }

  /**
   * Update game tag display based on current value
   * @private
   */
  _updateGameTagDisplay() {
    const gameName = this.gameInput?.value || '';

    // Update tag text
    if (this.gameTag) {
      this.gameTag.textContent = gameName;
    }

    // Toggle has-game class on editor
    if (this.editorElement) {
      if (gameName) {
        this.editorElement.classList.add('has-game');
      } else {
        this.editorElement.classList.remove('has-game');
      }
    }
  }

  /**
   * Setup delete button with hold-to-delete
   * @private
   */
  _setupDeleteButton() {
    if (!this.deleteBtn) return;

    const DELETE_HOLD_MS = 2000;

    // Start hold on mousedown/touchstart
    const startHold = (e) => {
      e.preventDefault();
      if (this.deleteBtn.disabled) return;

      this.deleteBtn.classList.add('holding');
      this.deleteBtn.style.setProperty('--hold-duration', `${DELETE_HOLD_MS}ms`);

      this.replaceTimeout(DELETE_HOLD_TIMEOUT, () => {
        this.onDelete?.();
        this._cancelDeleteHold();
      }, DELETE_HOLD_MS);
    };

    // Cancel hold on mouseup/mouseleave/touchend/touchcancel
    const cancelHold = () => {
      this._cancelDeleteHold();
    };

    this.listen(this.deleteBtn, 'mousedown', startHold);
    this.listen(this.deleteBtn, 'touchstart', startHold);
    this.listen(this.deleteBtn, 'mouseup', cancelHold);
    this.listen(this.deleteBtn, 'mouseleave', cancelHold);
    this.listen(this.deleteBtn, 'touchend', cancelHold);
    this.listen(this.deleteBtn, 'touchcancel', cancelHold);
  }

  /**
   * Cancel delete hold operation
   * @private
   */
  _cancelDeleteHold() {
    this.cancelManaged(DELETE_HOLD_TIMEOUT);
    this.deleteBtn?.classList.remove('holding');
  }

  /**
   * Schedule auto-save with debounce
   * @private
   */
  _scheduleSave() {
    this.replaceTimeout(SAVE_DEBOUNCE_TIMEOUT, () => {
      this.onSave?.();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Cleanup resources
   */
  dispose() {
    super.dispose();

    // Clear references
    this.editorElement = null;
    this.titleInput = null;
    this.contentArea = null;
    this.deleteBtn = null;
    this.gameTagRow = null;
    this.gameTag = null;
    this.gameInput = null;
    this.gameAddBtn = null;
    this.onSave = null;
    this.onDelete = null;
    this.onGameInputChange = null;
    this.onShowGameInput = null;
    this.notesService = null;
    this.logger = null;
  }
}

export { NotesEditorViewComponent };
