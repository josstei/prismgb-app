/**
 * Notes Panel Component
 *
 * Fixed right-side sliding sidebar for taking notes during gameplay.
 * Features: fuzzy search with debouncing, auto-save, event delegation for list.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';
import { DOMSelectors } from '@shared/config/dom-selectors.config.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';
import { escapeHtml } from '@shared/utils/string.utils.js';

// Timing constants
const SAVE_DEBOUNCE_MS = 500;
const SEARCH_DEBOUNCE_MS = 200;
const RESIZE_DEBOUNCE_MS = 100;

class NotesPanelComponent {
  constructor({ notesService, eventBus, logger }) {
    this.notesService = notesService;
    this.eventBus = eventBus;
    this.logger = logger;

    // Panel state
    this.isVisible = false;
    this.currentNoteId = null;

    // Debounce timers
    this._saveTimeout = null;
    this._searchTimeout = null;
    this._resizeTimeout = null;

    // Track DOM listeners for cleanup
    this._domListeners = createDomListenerManager({ logger });
    this._eventSubscriptions = [];

    // ResizeObserver for stream layout changes
    this._resizeObserver = null;
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
    this._setupListClickHandler(); // Event delegation for list
    this._updatePanelPosition();
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

    this._updatePanelPosition();
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

    // Flush pending save immediately
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
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
   * Setup search input with debouncing
   * @private
   */
  _setupSearch() {
    if (!this.elements.notesSearchInput) return;

    this._domListeners.add(this.elements.notesSearchInput, 'input', () => {
      this._scheduleSearch();
    });
  }

  /**
   * Schedule search with debounce
   * @private
   */
  _scheduleSearch() {
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
    }

    this._searchTimeout = setTimeout(() => {
      this._searchTimeout = null;
      this._handleSearch();
    }, SEARCH_DEBOUNCE_MS);
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
      this._saveTimeout = null;
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

    const result = this.notesService.updateNote(this.currentNoteId, { title, content });
    if (!result) {
      this.logger?.warn('Failed to save note - may have been deleted');
      return;
    }

    // Update only the current item in the list (not full rebuild)
    this._updateListItemDisplay(this.currentNoteId, title);
  }

  /**
   * Update a single list item's display without full rebuild
   * @param {string} noteId - Note ID
   * @param {string} title - New title
   * @private
   */
  _updateListItemDisplay(noteId, title) {
    const item = this.elements.notesList?.querySelector(`[data-note-id="${noteId}"]`);
    if (item) {
      const titleEl = item.querySelector('.note-list-item-title');
      if (titleEl) {
        titleEl.textContent = title || 'Untitled Note';
      }
      const dateEl = item.querySelector('.note-list-item-date');
      if (dateEl) {
        dateEl.textContent = new Date().toLocaleDateString();
      }
    }
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
    if (!note) {
      this.logger?.error('Failed to create note');
      return;
    }

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

    const success = this.notesService.deleteNote(this.currentNoteId);
    if (!success) {
      this.logger?.warn('Failed to delete note');
      return;
    }

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
   * Setup event delegation for list item clicks
   * Single listener on container handles all item clicks
   * @private
   */
  _setupListClickHandler() {
    if (!this.elements.notesList) return;

    this._domListeners.add(this.elements.notesList, 'click', (e) => {
      const item = e.target.closest('.note-list-item');
      if (!item) return;

      const noteId = item.dataset.noteId;
      if (noteId && noteId !== this.currentNoteId) {
        // Save current note before switching
        this._saveCurrentNote();
        this._selectNote(noteId);
      }
    });
  }

  /**
   * Render notes list (without individual click handlers - using event delegation)
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
        const safeId = escapeHtml(note.id || '');
        const title = escapeHtml(note.title || 'Untitled Note');
        const date = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : '';
        return `
          <div class="note-list-item${isActive ? ' active' : ''}" data-note-id="${safeId}">
            <div class="note-list-item-title">${title}</div>
            <div class="note-list-item-date">${date}</div>
          </div>
        `;
      })
      .join('');
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
      this.elements.notesTitleInput.value = note.title || '';
    }
    if (this.elements.notesContentArea) {
      this.elements.notesContentArea.value = note.content || '';
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
   * Setup window resize handler to update panel position with debouncing
   * @private
   */
  _setupResizeHandler() {
    this._domListeners.add(window, 'resize', () => {
      this._schedulePositionUpdate();
    });

    const streamContainer = document.getElementById(DOMSelectors.STREAM_CONTAINER);
    if (!streamContainer || typeof ResizeObserver === 'undefined') return;

    this._resizeObserver = new ResizeObserver(() => {
      this._schedulePositionUpdate();
    });
    this._resizeObserver.observe(streamContainer);
  }

  /**
   * Schedule position update with debounce
   * @private
   */
  _schedulePositionUpdate() {
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
    }

    this._resizeTimeout = setTimeout(() => {
      this._resizeTimeout = null;
      this._updatePanelPosition();
    }, RESIZE_DEBOUNCE_MS);
  }

  /**
   * Update panel position based on toolbar location
   * Aligns panel top with toolbar top, and left edge to toolbar right
   * @private
   */
  _updatePanelPosition() {
    if (!this.elements.notesPanel) return;

    const toolbar = document.getElementById(DOMSelectors.STREAM_TOOLBAR);
    if (!toolbar) return;

    const toolbarRect = toolbar.getBoundingClientRect();
    const gap = 16;
    const leftPos = Math.round(toolbarRect.right + gap);
    const topPos = Math.round(toolbarRect.top);

    this.elements.notesPanel.style.setProperty('--notes-panel-left', `${leftPos}px`);
    this.elements.notesPanel.style.setProperty('--notes-panel-top', `${topPos}px`);
  }

  /**
   * Subscribe to external events
   * @private
   */
  _subscribeToEvents() {
    // Listen for note changes from other sources (e.g., sync, import)
    const unsubscribeCreated = this.eventBus.subscribe(
      EventChannels.NOTES.NOTE_CREATED,
      (note) => {
        // Only re-render if note was created externally (not by this component)
        if (note && note.id !== this.currentNoteId) {
          this._renderNotesList(this.elements.notesSearchInput?.value || '');
        }
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
    // Clear all timers
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
      this._searchTimeout = null;
    }
    if (this._resizeTimeout) {
      clearTimeout(this._resizeTimeout);
      this._resizeTimeout = null;
    }

    // Disconnect resize observer
    if (this._resizeObserver) {
      this._resizeObserver.disconnect();
      this._resizeObserver = null;
    }

    // Remove DOM listeners
    this._domListeners.removeAll();

    // Unsubscribe from events (with error protection)
    this._eventSubscriptions.forEach(unsubscribe => {
      try {
        unsubscribe();
      } catch (error) {
        this.logger?.warn('Error unsubscribing from event', error);
      }
    });
    this._eventSubscriptions = [];

    // Nullify references to allow GC
    this.elements = null;
    this.notesService = null;
    this.eventBus = null;
    this.logger = null;
    this.currentNoteId = null;
    this.isVisible = false;
  }
}

export { NotesPanelComponent };
