/**
 * Notes Panel Component
 *
 * Fixed right-side sliding sidebar for taking notes during gameplay.
 * Features: fuzzy search, auto-save.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';
import { DOMSelectors } from '@shared/config/dom-selectors.config.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

// Debounce delay for auto-save
const SAVE_DEBOUNCE_MS = 500;

class NotesPanelComponent {
  constructor({ notesService, eventBus, logger }) {
    this.notesService = notesService;
    this.eventBus = eventBus;
    this.logger = logger;

    // Panel state
    this.isVisible = false;
    this.currentNoteId = null;

    // Auto-save timer
    this._saveTimeout = null;

    // Track DOM listeners for cleanup
    this._domListeners = createDomListenerManager({ logger });
    this._eventSubscriptions = [];

  }

  /**
   * Initialize component with DOM elements
   * @param {Object} elements - DOM element references
   */
  initialize(elements) {
    this.elements = {
      notesBtn: elements.notesBtn,
      notesPanel: elements.notesPanel,
      notesSearchInput: elements.notesSearchInput,
      notesList: elements.notesList,
      notesEditor: elements.notesEditor,
      notesEmptyState: elements.notesEmptyState,
      notesTitleInput: elements.notesTitleInput,
      notesContentArea: elements.notesContentArea,
      notesNewBtn: elements.notesNewBtn,
      notesDeleteBtn: elements.notesDeleteBtn,
      notesCloseBtn: elements.notesCloseBtn
    };

    if (!this.elements.notesBtn || !this.elements.notesPanel) {
      this.logger?.warn('Notes panel elements not found');
      return;
    }

    this._setupToggleButton();
    this._setupCloseButton();
    this._setupSearch();
    this._setupEditor();
    this._setupNewButton();
    this._setupDeleteButton();
    this._setupEscapeKey();
    this._setupResizeHandler();
    this._updatePanelPosition(); // Set initial position
    this._renderNotesList();
    this._subscribeToEvents();

    this.logger?.debug('NotesPanelComponent initialized');
  }

  /**
   * Toggle panel visibility
   */
  toggle() {
    if (this.isVisible) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Show panel
   */
  show() {
    if (!this.elements.notesPanel) return;

    this.elements.notesPanel.classList.add(CSSClasses.VISIBLE);
    this.elements.notesBtn?.classList.add(CSSClasses.PANEL_OPEN);
    this.elements.notesBtn?.setAttribute('aria-expanded', 'true');
    this.isVisible = true;

    // Focus search input without scrolling
    this.elements.notesSearchInput?.focus({ preventScroll: true });

    this.eventBus.publish(EventChannels.NOTES.PANEL_VISIBILITY_CHANGED, { visible: true });
    this.logger?.debug('Notes panel shown');
  }

  /**
   * Hide panel
   */
  hide() {
    if (!this.elements.notesPanel) return;

    // Save current note before hiding
    this._saveCurrentNote();

    this.elements.notesPanel.classList.remove(CSSClasses.VISIBLE);
    this.elements.notesBtn?.classList.remove(CSSClasses.PANEL_OPEN);
    this.elements.notesBtn?.setAttribute('aria-expanded', 'false');
    this.isVisible = false;

    this.eventBus.publish(EventChannels.NOTES.PANEL_VISIBILITY_CHANGED, { visible: false });
    this.logger?.debug('Notes panel hidden');
  }

  /**
   * Setup toggle button click handler
   * @private
   */
  _setupToggleButton() {
    if (!this.elements.notesBtn) return;

    this._domListeners.add(this.elements.notesBtn, 'click', () => {
      this.toggle();
    });
  }

  /**
   * Setup close button
   * @private
   */
  _setupCloseButton() {
    if (!this.elements.notesCloseBtn) return;

    this._domListeners.add(this.elements.notesCloseBtn, 'click', () => {
      this.hide();
    });
  }

  /**
   * Setup search input
   * @private
   */
  _setupSearch() {
    if (!this.elements.notesSearchInput) return;

    this._domListeners.add(this.elements.notesSearchInput, 'input', () => {
      this._handleSearch();
    });
  }

  /**
   * Handle search input
   * @private
   */
  _handleSearch() {
    const query = this.elements.notesSearchInput?.value || '';
    this._renderNotesList(query);
  }

  /**
   * Setup editor inputs
   * @private
   */
  _setupEditor() {
    // Auto-save on title change
    if (this.elements.notesTitleInput) {
      this._domListeners.add(this.elements.notesTitleInput, 'input', () => {
        this._scheduleSave();
      });
    }

    // Auto-save on content change
    if (this.elements.notesContentArea) {
      this._domListeners.add(this.elements.notesContentArea, 'input', () => {
        this._scheduleSave();
      });
    }
  }

  /**
   * Schedule auto-save with debounce
   * @private
   */
  _scheduleSave() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }

    this._saveTimeout = setTimeout(() => {
      this._saveCurrentNote();
    }, SAVE_DEBOUNCE_MS);
  }

  /**
   * Save current note
   * @private
   */
  _saveCurrentNote() {
    if (!this.currentNoteId) return;

    const title = this.elements.notesTitleInput?.value || '';
    const content = this.elements.notesContentArea?.value || '';

    this.notesService.updateNote(this.currentNoteId, { title, content });
    this._renderNotesList(this.elements.notesSearchInput?.value || '');
  }

  /**
   * Setup new note button
   * @private
   */
  _setupNewButton() {
    if (!this.elements.notesNewBtn) return;

    this._domListeners.add(this.elements.notesNewBtn, 'click', () => {
      this._createNewNote();
    });
  }

  /**
   * Create a new note
   * @private
   */
  _createNewNote() {
    const note = this.notesService.createNote();
    this._selectNote(note.id);
    this._renderNotesList();

    // Focus title input
    this.elements.notesTitleInput?.focus();
    this.elements.notesTitleInput?.select();
  }

  /**
   * Setup delete button
   * @private
   */
  _setupDeleteButton() {
    if (!this.elements.notesDeleteBtn) return;

    this._domListeners.add(this.elements.notesDeleteBtn, 'click', () => {
      this._deleteCurrentNote();
    });
  }

  /**
   * Delete current note
   * @private
   */
  _deleteCurrentNote() {
    if (!this.currentNoteId) return;

    this.notesService.deleteNote(this.currentNoteId);
    this.currentNoteId = null;

    // Clear editor
    if (this.elements.notesTitleInput) {
      this.elements.notesTitleInput.value = '';
    }
    if (this.elements.notesContentArea) {
      this.elements.notesContentArea.value = '';
    }

    // Update delete button state
    this.elements.notesDeleteBtn?.setAttribute('disabled', '');

    // Re-render list and select first note if available, or show empty state
    this._renderNotesList();
    const notes = this.notesService.getAllNotes();
    if (notes.length > 0) {
      this._selectNote(notes[0].id);
    } else {
      // No notes left - show empty state
      this.elements.notesEditor?.classList.remove('has-note');
    }
  }

  /**
   * Render notes list
   * @param {string} [searchQuery=''] - Optional search query
   * @private
   */
  _renderNotesList(searchQuery = '') {
    if (!this.elements.notesList) return;

    const notes = searchQuery
      ? this.notesService.searchNotes(searchQuery)
      : this.notesService.getAllNotes();

    if (notes.length === 0) {
      this.elements.notesList.innerHTML = `
        <div class="notes-list-empty">
          ${searchQuery ? 'No matching notes' : 'No notes yet'}
        </div>
      `;
      return;
    }

    this.elements.notesList.innerHTML = notes
      .map(note => {
        const isActive = note.id === this.currentNoteId;
        const date = new Date(note.updatedAt).toLocaleDateString();
        return `
          <div class="note-list-item${isActive ? ' active' : ''}" data-note-id="${note.id}">
            <div class="note-list-item-title">${this._escapeHtml(note.title)}</div>
            <div class="note-list-item-date">${date}</div>
          </div>
        `;
      })
      .join('');

    // Add click handlers to list items
    const items = this.elements.notesList.querySelectorAll('.note-list-item');
    items.forEach(item => {
      this._domListeners.add(item, 'click', () => {
        const noteId = item.dataset.noteId;
        if (noteId && noteId !== this.currentNoteId) {
          // Save current note before switching
          this._saveCurrentNote();
          this._selectNote(noteId);
        }
      });
    });
  }

  /**
   * Select a note
   * @param {string} noteId - Note ID
   * @private
   */
  _selectNote(noteId) {
    const note = this.notesService.getNote(noteId);
    if (!note) return;

    this.currentNoteId = noteId;

    // Show editor inputs (add has-note class)
    this.elements.notesEditor?.classList.add('has-note');

    // Update editor
    if (this.elements.notesTitleInput) {
      this.elements.notesTitleInput.value = note.title;
    }
    if (this.elements.notesContentArea) {
      this.elements.notesContentArea.value = note.content;
    }

    // Enable delete button
    this.elements.notesDeleteBtn?.removeAttribute('disabled');

    // Update active state in list
    const items = this.elements.notesList?.querySelectorAll('.note-list-item');
    items?.forEach(item => {
      if (item.dataset.noteId === noteId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });

    this.eventBus.publish(EventChannels.NOTES.NOTE_SELECTED, { id: noteId });
    this.logger?.debug(`Selected note: ${noteId}`);
  }

  /**
   * Escape HTML to prevent XSS
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   * @private
   */
  _escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Setup escape key to close panel
   * @private
   */
  _setupEscapeKey() {
    this._domListeners.add(document, 'keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        this.hide();
      }
    });
  }

  /**
   * Setup window resize handler to update panel position
   * @private
   */
  _setupResizeHandler() {
    this._domListeners.add(window, 'resize', () => {
      this._updatePanelPosition();
    });
  }

  /**
   * Update panel left position based on toolbar location
   * @private
   */
  _updatePanelPosition() {
    if (!this.elements.notesPanel) return;

    const toolbar = document.getElementById(DOMSelectors.STREAM_TOOLBAR);
    if (!toolbar) return;

    const toolbarRect = toolbar.getBoundingClientRect();
    const gap = 16;
    const leftPos = Math.round(toolbarRect.right + gap);

    this.elements.notesPanel.style.setProperty('--notes-panel-left', `${leftPos}px`);
  }

  /**
   * Subscribe to external events
   * @private
   */
  _subscribeToEvents() {
    // Listen for note changes from other sources
    const unsubscribeCreated = this.eventBus.subscribe(
      EventChannels.NOTES.NOTE_CREATED,
      () => {
        this._renderNotesList(this.elements.notesSearchInput?.value || '');
      }
    );
    this._eventSubscriptions.push(unsubscribeCreated);

    const unsubscribeDeleted = this.eventBus.subscribe(
      EventChannels.NOTES.NOTE_DELETED,
      () => {
        this._renderNotesList(this.elements.notesSearchInput?.value || '');
      }
    );
    this._eventSubscriptions.push(unsubscribeDeleted);

  }

  /**
   * Cleanup resources
   */
  dispose() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }

    this._domListeners.removeAll();
    this._eventSubscriptions.forEach(unsubscribe => unsubscribe());
    this._eventSubscriptions = [];
  }
}

export { NotesPanelComponent };
