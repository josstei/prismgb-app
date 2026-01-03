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

// Autocomplete debounce
const AUTOCOMPLETE_DEBOUNCE_MS = 100;

class NotesPanelComponent {
  constructor({ notesService, eventBus, logger }) {
    this.notesService = notesService;
    this.eventBus = eventBus;
    this.logger = logger;

    // Panel state
    this.isVisible = false;
    this.currentNoteId = null;
    this.isListVisible = true;
    this.currentGameFilter = '';
    this.collapsedGameGroups = new Set();
    this.autocompleteHighlightIndex = -1;

    // Debounce timers
    this._saveTimeout = null;
    this._searchTimeout = null;
    this._resizeTimeout = null;
    this._autocompleteTimeout = null;

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
      notesGameFilter: elements.notesGameFilter,
      notesListToggle: elements.notesListToggle,
      notesList: elements.notesList,
      notesEditor: elements.notesEditor,
      notesGameAddBtn: elements.notesGameAddBtn,
      notesGameTagRow: elements.notesGameTagRow,
      notesGameTag: elements.notesGameTag,
      notesGameInput: elements.notesGameInput,
      notesGameAutocomplete: elements.notesGameAutocomplete,
      notesTitleInput: elements.notesTitleInput,
      notesContentArea: elements.notesContentArea,
      notesNewBtn: elements.notesNewBtn,
      notesDeleteBtn: elements.notesDeleteBtn
    };

    if (!this.elements.notesBtn || !this.elements.notesPanel) {
      this.logger?.warn('Notes panel elements not found');
      return;
    }

    this._setupToggleButton();
    this._setupSearch();
    this._setupGameFilter();
    this._setupListToggle();
    this._setupEditor();
    this._setupGameTagUI();
    this._setupGameInput();
    this._setupNewButton();
    this._setupDeleteButton();
    this._setupEscapeKey();
    this._setupResizeHandler();
    this._setupListClickHandler();
    this._updatePanelPosition();
    this._updateGameFilterOptions();
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
   * Setup game filter dropdown
   * @private
   */
  _setupGameFilter() {
    if (!this.elements.notesGameFilter) return;

    this._domListeners.add(this.elements.notesGameFilter, 'change', () => {
      this.currentGameFilter = this.elements.notesGameFilter.value;
      this._renderNotesList(this.elements.notesSearchInput?.value || '');
    });
  }

  /**
   * Update game filter dropdown options
   * @private
   */
  _updateGameFilterOptions() {
    if (!this.elements.notesGameFilter) return;

    const games = this.notesService.getUniqueGames();
    const currentValue = this.elements.notesGameFilter.value;

    // Rebuild options
    this.elements.notesGameFilter.innerHTML = '<option value="">All Games</option>';

    for (const game of games) {
      const option = document.createElement('option');
      option.value = game;
      option.textContent = game;
      this.elements.notesGameFilter.appendChild(option);
    }

    // Restore selection if still valid
    if (currentValue && games.includes(currentValue)) {
      this.elements.notesGameFilter.value = currentValue;
    } else {
      this.elements.notesGameFilter.value = '';
      this.currentGameFilter = '';
    }
  }

  /**
   * Setup list toggle (collapse/expand divider)
   * @private
   */
  _setupListToggle() {
    if (!this.elements.notesListToggle) return;

    this._domListeners.add(this.elements.notesListToggle, 'click', () => {
      this._toggleListVisibility();
    });
  }

  /**
   * Toggle list visibility
   * @private
   */
  _toggleListVisibility() {
    this.isListVisible = !this.isListVisible;

    const content = this.elements.notesPanel?.querySelector('.notes-panel-content');
    if (!content) return;

    if (this.isListVisible) {
      content.classList.remove(CSSClasses.LIST_COLLAPSED);
      this.elements.notesListToggle?.setAttribute('aria-expanded', 'true');
    } else {
      content.classList.add(CSSClasses.LIST_COLLAPSED);
      this.elements.notesListToggle?.setAttribute('aria-expanded', 'false');
    }
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
   * Setup game tag UI (add button, tag click to edit)
   * @private
   */
  _setupGameTagUI() {
    // Add game button - show game input
    if (this.elements.notesGameAddBtn) {
      this._domListeners.add(this.elements.notesGameAddBtn, 'click', () => {
        this._showGameInput();
      });
    }

    // Game tag click - edit game
    if (this.elements.notesGameTag) {
      this._domListeners.add(this.elements.notesGameTag, 'click', () => {
        this._showGameInput();
      });
    }
  }

  /**
   * Show game input for editing
   * @private
   */
  _showGameInput() {
    if (!this.elements.notesGameTagRow || !this.elements.notesGameInput) return;

    this.elements.notesGameTagRow.classList.add('editing');
    this.elements.notesGameInput.focus();
    this.elements.notesGameInput.select();
  }

  /**
   * Hide game input and show tag
   * @private
   */
  _hideGameInput() {
    if (!this.elements.notesGameTagRow) return;

    this.elements.notesGameTagRow.classList.remove('editing');
    this._updateGameTagDisplay();
  }

  /**
   * Update game tag display based on current value
   * @private
   */
  _updateGameTagDisplay() {
    const gameName = this.elements.notesGameInput?.value || '';

    // Update tag text
    if (this.elements.notesGameTag) {
      this.elements.notesGameTag.textContent = gameName;
    }

    // Toggle has-game class on editor
    if (this.elements.notesEditor) {
      if (gameName) {
        this.elements.notesEditor.classList.add('has-game');
      } else {
        this.elements.notesEditor.classList.remove('has-game');
      }
    }
  }

  /**
   * Setup game input with autocomplete
   * @private
   */
  _setupGameInput() {
    if (!this.elements.notesGameInput) return;

    // Autocomplete on input
    this._domListeners.add(this.elements.notesGameInput, 'input', () => {
      this._scheduleAutocomplete();
      this._scheduleSave();
      this._updateGameTagDisplay();
    });

    // Keyboard navigation
    this._domListeners.add(this.elements.notesGameInput, 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this._hideGameInput();
        return;
      }
      if (e.key === 'Escape') {
        this._hideGameInput();
        return;
      }
      this._handleAutocompleteKeydown(e);
    });

    // Hide input on blur (with delay to allow autocomplete click)
    this._domListeners.add(this.elements.notesGameInput, 'blur', () => {
      setTimeout(() => {
        this._hideAutocomplete();
        this._hideGameInput();
      }, 150);
    });

    // Show autocomplete on focus
    this._domListeners.add(this.elements.notesGameInput, 'focus', () => {
      this._showAutocomplete();
    });
  }

  /**
   * Schedule autocomplete update with debounce
   * @private
   */
  _scheduleAutocomplete() {
    if (this._autocompleteTimeout) {
      clearTimeout(this._autocompleteTimeout);
    }

    this._autocompleteTimeout = setTimeout(() => {
      this._autocompleteTimeout = null;
      this._showAutocomplete();
    }, AUTOCOMPLETE_DEBOUNCE_MS);
  }

  /**
   * Show autocomplete dropdown
   * @private
   */
  _showAutocomplete() {
    if (!this.elements.notesGameAutocomplete || !this.elements.notesGameInput) return;

    const query = this.elements.notesGameInput.value.toLowerCase().trim();
    const games = this.notesService.getUniqueGames();

    // Filter games matching query
    const matches = query
      ? games.filter(g => g.toLowerCase().includes(query))
      : games;

    if (matches.length === 0) {
      this._hideAutocomplete();
      return;
    }

    this.autocompleteHighlightIndex = -1;
    this.elements.notesGameAutocomplete.innerHTML = matches
      .map((game, i) => `<div class="notes-game-autocomplete-item" data-index="${i}" data-value="${escapeHtml(game)}">${escapeHtml(game)}</div>`)
      .join('');

    // Add click handlers
    this.elements.notesGameAutocomplete.querySelectorAll('.notes-game-autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        this._selectAutocompleteItem(item.dataset.value);
      });
    });

    this.elements.notesGameAutocomplete.classList.add(CSSClasses.VISIBLE);
  }

  /**
   * Hide autocomplete dropdown
   * @private
   */
  _hideAutocomplete() {
    this.elements.notesGameAutocomplete?.classList.remove(CSSClasses.VISIBLE);
    this.autocompleteHighlightIndex = -1;
  }

  /**
   * Handle keyboard navigation in autocomplete
   * @param {KeyboardEvent} e
   * @private
   */
  _handleAutocompleteKeydown(e) {
    const items = this.elements.notesGameAutocomplete?.querySelectorAll('.notes-game-autocomplete-item');
    if (!items || items.length === 0) return;

    const isVisible = this.elements.notesGameAutocomplete?.classList.contains(CSSClasses.VISIBLE);
    if (!isVisible) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.autocompleteHighlightIndex = Math.min(this.autocompleteHighlightIndex + 1, items.length - 1);
      this._updateAutocompleteHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.autocompleteHighlightIndex = Math.max(this.autocompleteHighlightIndex - 1, 0);
      this._updateAutocompleteHighlight(items);
    } else if (e.key === 'Enter' && this.autocompleteHighlightIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[this.autocompleteHighlightIndex];
      if (selectedItem) {
        this._selectAutocompleteItem(selectedItem.dataset.value);
      }
    } else if (e.key === 'Escape') {
      this._hideAutocomplete();
    }
  }

  /**
   * Update autocomplete highlight
   * @param {NodeList} items
   * @private
   */
  _updateAutocompleteHighlight(items) {
    items.forEach((item, i) => {
      if (i === this.autocompleteHighlightIndex) {
        item.classList.add('highlighted');
      } else {
        item.classList.remove('highlighted');
      }
    });
  }

  /**
   * Select an autocomplete item
   * @param {string} value
   * @private
   */
  _selectAutocompleteItem(value) {
    if (this.elements.notesGameInput) {
      this.elements.notesGameInput.value = value;
    }
    this._hideAutocomplete();
    this._hideGameInput();
    this._scheduleSave();
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
    const gameName = this.elements.notesGameInput?.value || '';

    const oldNote = this.notesService.getNote(this.currentNoteId);
    const oldGameName = oldNote?.gameName || '';
    const gameChanged = oldGameName !== gameName;

    const result = this.notesService.updateNote(this.currentNoteId, { title, content, gameName });
    if (!result) {
      this.logger?.warn('Failed to save note - may have been deleted');
      return;
    }

    // If game changed, update filter options and re-render list for proper grouping
    if (gameChanged) {
      this._updateGameFilterOptions();
      this._renderNotesList(this.elements.notesSearchInput?.value || '');
    } else {
      // Update only the current item in the list (not full rebuild)
      this._updateListItemDisplay(this.currentNoteId, title, gameName);
    }
  }

  /**
   * Update a single list item's display without full rebuild
   * @param {string} noteId - Note ID
   * @param {string} title - New title
   * @param {string} [gameName] - Game name
   * @private
   */
  _updateListItemDisplay(noteId, title, gameName) {
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
      // Update game tag if present
      const gameTagEl = item.querySelector('.note-list-item-game-tag');
      if (gameTagEl && gameName !== undefined) {
        gameTagEl.textContent = gameName || '';
        gameTagEl.style.display = gameName ? '' : 'none';
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
    // Use current game filter as default game for new note
    const gameName = this.currentGameFilter || '';
    const note = this.notesService.createNote('', '', gameName);
    if (!note) {
      this.logger?.error('Failed to create note');
      return;
    }

    this._selectNote(note.id);
    this._updateGameFilterOptions();
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
    if (this.elements.notesGameInput) {
      this.elements.notesGameInput.value = '';
    }
    if (this.elements.notesTitleInput) {
      this.elements.notesTitleInput.value = '';
    }
    if (this.elements.notesContentArea) {
      this.elements.notesContentArea.value = '';
    }

    // Update delete button state
    this.elements.notesDeleteBtn?.setAttribute('disabled', '');

    // Update game filter options (game might no longer have notes)
    this._updateGameFilterOptions();

    // Re-render list and select first note if available, or show empty state
    this._renderNotesList();
    const notes = this.notesService.searchNotes('', this.currentGameFilter);
    if (notes.length > 0) {
      this._selectNote(notes[0].id);
    } else {
      // No notes left - show empty state
      this.elements.notesEditor?.classList.remove('has-note');
    }
  }

  /**
   * Setup event delegation for list item and game header clicks
   * Single listener on container handles all clicks
   * @private
   */
  _setupListClickHandler() {
    if (!this.elements.notesList) return;

    this._domListeners.add(this.elements.notesList, 'click', (e) => {
      // Handle game group header click (expand/collapse)
      const gameHeader = e.target.closest('.notes-game-header');
      if (gameHeader) {
        const gameName = gameHeader.dataset.gameToggle || '';
        this._toggleGameGroup(gameName);
        return;
      }

      // Handle note item click
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
   * Toggle game group expand/collapse
   * @param {string} gameName
   * @private
   */
  _toggleGameGroup(gameName) {
    const group = this.elements.notesList?.querySelector(`[data-game="${gameName}"]`);
    if (!group) return;

    if (this.collapsedGameGroups.has(gameName)) {
      this.collapsedGameGroups.delete(gameName);
      group.classList.remove(CSSClasses.GAME_GROUP_COLLAPSED);
    } else {
      this.collapsedGameGroups.add(gameName);
      group.classList.add(CSSClasses.GAME_GROUP_COLLAPSED);
    }
  }

  /**
   * Render notes list with game grouping
   * @param {string} [searchQuery=''] - Optional search query
   * @private
   */
  _renderNotesList(searchQuery = '') {
    if (!this.elements.notesList) return;

    const notes = this.notesService.searchNotes(searchQuery, this.currentGameFilter);

    if (notes.length === 0) {
      this.elements.notesList.innerHTML = `
        <div class="notes-list-empty">
          ${searchQuery ? 'No matching notes' : (this.currentGameFilter ? 'No notes for this game' : 'No notes yet')}
        </div>
      `;
      return;
    }

    // If filtering by a specific game, show flat list
    if (this.currentGameFilter) {
      this.elements.notesList.innerHTML = notes
        .map(note => this._renderNoteItem(note, false))
        .join('');
      return;
    }

    // Group by game for "All Games" view
    const grouped = this._groupNotesByGame(notes);
    const gameNames = Object.keys(grouped).sort((a, b) => {
      // "General" (empty string) goes last
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });

    this.elements.notesList.innerHTML = gameNames
      .map(gameName => this._renderGameGroup(gameName, grouped[gameName]))
      .join('');
  }

  /**
   * Group notes by game name
   * @param {Array} notes
   * @returns {Object} Map of gameName to notes array
   * @private
   */
  _groupNotesByGame(notes) {
    const groups = {};
    for (const note of notes) {
      const gameName = note.gameName || '';
      if (!groups[gameName]) {
        groups[gameName] = [];
      }
      groups[gameName].push(note);
    }
    return groups;
  }

  /**
   * Render a game group
   * @param {string} gameName
   * @param {Array} notes
   * @returns {string} HTML
   * @private
   */
  _renderGameGroup(gameName, notes) {
    const isCollapsed = this.collapsedGameGroups.has(gameName);
    const displayName = gameName || 'General';
    const safeGameName = escapeHtml(gameName);

    return `
      <div class="notes-game-group${isCollapsed ? ' collapsed' : ''}" data-game="${safeGameName}">
        <button class="notes-game-header" data-game-toggle="${safeGameName}">
          <span class="game-name">${escapeHtml(displayName)}</span>
          <span class="game-count">${notes.length}</span>
          <svg class="game-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="notes-game-notes">
          ${notes.map(note => this._renderNoteItem(note, false)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a single note item
   * @param {Object} note
   * @param {boolean} showGameTag - Whether to show the game tag
   * @returns {string} HTML
   * @private
   */
  _renderNoteItem(note, showGameTag = true) {
    const isActive = note.id === this.currentNoteId;
    const safeId = escapeHtml(note.id || '');
    const title = escapeHtml(note.title || 'Untitled Note');
    const date = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : '';
    const gameName = note.gameName || '';
    const gameTagHtml = showGameTag && gameName
      ? `<div class="note-list-item-game-tag">${escapeHtml(gameName)}</div>`
      : '';

    return `
      <div class="note-list-item${isActive ? ' active' : ''}" data-note-id="${safeId}">
        <div class="note-list-item-title">${title}</div>
        ${gameTagHtml}
        <div class="note-list-item-date">${date}</div>
      </div>
    `;
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
    if (this.elements.notesGameInput) {
      this.elements.notesGameInput.value = note.gameName || '';
    }
    if (this.elements.notesTitleInput) {
      this.elements.notesTitleInput.value = note.title || '';
    }
    if (this.elements.notesContentArea) {
      this.elements.notesContentArea.value = note.content || '';
    }

    // Update game tag display
    this._updateGameTagDisplay();

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
    if (this._autocompleteTimeout) {
      clearTimeout(this._autocompleteTimeout);
      this._autocompleteTimeout = null;
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
    this.isListVisible = true;
    this.currentGameFilter = '';
    this.collapsedGameGroups.clear();
  }
}

export { NotesPanelComponent };
