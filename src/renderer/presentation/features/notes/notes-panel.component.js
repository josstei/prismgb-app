/**
 * Notes Panel Component
 *
 * Fixed right-side sliding sidebar for taking notes during gameplay.
 * Orchestrates sub-components for search, filtering, editing, and list management.
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { EventChannels } from '@shared/events/event-channels.js';
import { NotesListViewComponent } from './components/notes-list-view.component.js';
import { NotesEditorViewComponent } from './components/notes-editor-view.component.js';
import { NotesSearchComponent } from './components/notes-search.component.js';
import { GameFilterComponent } from './components/game-filter.component.js';
import { GameAutocompleteComponent } from './components/game-autocomplete.component.js';
import { NotesResizeHandlerComponent } from './components/notes-resize-handler.component.js';
import { NotesPanelLayoutComponent } from './components/notes-panel-layout.component.js';

class NotesPanelComponent {
  constructor({ notesService, eventBus, logger }) {
    this.notesService = notesService;
    this.eventBus = eventBus;
    this.logger = logger;

    // Panel state
    this.isVisible = false;
    this.currentNoteId = null;

    // Sub-components
    this.listView = new NotesListViewComponent({ notesService, logger });
    this.editorView = new NotesEditorViewComponent({ notesService, logger });
    this.searchComponent = new NotesSearchComponent({ logger });
    this.gameFilter = new GameFilterComponent({ notesService, logger });
    this.gameAutocomplete = new GameAutocompleteComponent({ notesService, logger });
    this.resizeHandler = new NotesResizeHandlerComponent({ logger });
    this.layout = new NotesPanelLayoutComponent({ logger });

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
      notesPanelContent: elements.notesPanelContent,
      notesListWrapper: elements.notesListWrapper,
      notesSearchInput: elements.notesSearchInput,
      notesGameFilter: elements.notesGameFilter,
      notesGameFilterLabel: elements.notesGameFilterLabel,
      notesGameFilterMenu: elements.notesGameFilterMenu,
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
      streamContainer: elements.streamContainer,
      streamToolbar: elements.streamToolbar,
      notesNewBtn: elements.notesNewBtn,
      notesDeleteBtn: elements.notesDeleteBtn
    };

    if (!this.elements.notesBtn || !this.elements.notesPanel) {
      this.logger?.warn('Notes panel elements not found');
      return;
    }

    // Initialize sub-components
    this._initializeSubComponents();

    // Setup main panel controls
    this._setupToggleButton();
    this._setupNewButton();
    this._setupEscapeKey();
    this.layout.initialize({
      panelElement: this.elements.notesPanel,
      toolbarElement: this.elements.streamToolbar,
      streamContainer: this.elements.streamContainer
    });
    this._subscribeToEvents();

    this.logger?.debug('NotesPanelComponent initialized');
  }

  /**
   * Initialize all sub-components
   * @private
   */
  _initializeSubComponents() {
    // Initialize search component
    this.searchComponent.initialize({
      searchInput: this.elements.notesSearchInput,
      onSearch: (query) => this._handleSearch(query)
    });

    // Initialize game filter component
    this.gameFilter.initialize({
      filterButton: this.elements.notesGameFilter,
      filterLabel: this.elements.notesGameFilterLabel,
      filterMenu: this.elements.notesGameFilterMenu,
      onFilterChange: (value) => this._handleGameFilterChange(value)
    });

    // Initialize list view component
    this.listView.initialize({
      listElement: this.elements.notesList,
      onNoteSelect: (noteId) => this._handleNoteSelect(noteId)
    });

    // Initialize editor view component
    this.editorView.initialize({
      editorElement: this.elements.notesEditor,
      titleInput: this.elements.notesTitleInput,
      contentArea: this.elements.notesContentArea,
      deleteBtn: this.elements.notesDeleteBtn,
      gameTagRow: this.elements.notesGameTagRow,
      gameTag: this.elements.notesGameTag,
      gameInput: this.elements.notesGameInput,
      gameAddBtn: this.elements.notesGameAddBtn,
      onSave: () => this._saveCurrentNote(),
      onDelete: () => this._deleteCurrentNote(),
      onGameInputChange: () => this._handleGameInputChange(),
      onShowGameInput: () => this._showGameInput()
    });

    // Initialize game autocomplete component
    this.gameAutocomplete.initialize({
      gameInput: this.elements.notesGameInput,
      autocompleteDropdown: this.elements.notesGameAutocomplete,
      onInput: () => this._handleGameInputChange(),
      onSelect: (value) => this._handleAutocompleteSelect(value),
      onEnter: () => this._handleAutocompleteEnter(),
      onEscape: () => this._handleAutocompleteEscape(),
      onBlur: () => this.editorView.hideGameInput(),
      onFocus: () => {}
    });

    // Initialize resize handler component
    this.resizeHandler.initialize({
      listToggle: this.elements.notesListToggle,
      panelElement: this.elements.notesPanel,
      panelContent: this.elements.notesPanelContent,
      listWrapper: this.elements.notesListWrapper,
      onToggle: () => {}
    });

    // Set initial game filter on list view
    this.listView.setGameFilter(this.gameFilter.getCurrentFilter());

    // Render initial state
    this.gameFilter.updateOptions();
    this.listView.render();
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

    this.layout.updatePosition();
    this.elements.notesPanel.classList.add(CSSClasses.VISIBLE);
    this.elements.notesBtn?.classList.add(CSSClasses.PANEL_OPEN);
    this.elements.notesBtn?.setAttribute('aria-expanded', 'true');
    this.isVisible = true;

    // Focus search input without scrolling
    this.searchComponent.focus();

    this.logger?.debug('Notes panel shown');
  }

  /**
   * Hide panel
   */
  hide() {
    if (!this.elements.notesPanel) return;

    // Flush pending save immediately
    this.editorView.flushSave();

    // Hide game filter menu
    this.gameFilter.hide();

    this.elements.notesPanel.classList.remove(CSSClasses.VISIBLE);
    this.elements.notesBtn?.classList.remove(CSSClasses.PANEL_OPEN);
    this.elements.notesBtn?.setAttribute('aria-expanded', 'false');
    this.isVisible = false;

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
   * Handle search query change
   * @param {string} query
   * @private
   */
  _handleSearch(query) {
    this.listView.render(query);
  }

  /**
   * Handle game filter change
   * @param {string} value
   * @private
   */
  _handleGameFilterChange(value) {
    this.listView.setGameFilter(value);
    this.listView.render(this.searchComponent.getQuery());
  }

  /**
   * Handle note selection from list
   * @param {string} noteId
   * @private
   */
  _handleNoteSelect(noteId) {
    // Save current note before switching
    this.editorView.flushSave();
    this._selectNote(noteId);
  }

  /**
   * Handle game input change
   * @private
   */
  _handleGameInputChange() {
    // Trigger save via editor component (already debounced)
    this.editorView.scheduleSave();
  }

  /**
   * Show game input for editing
   * @private
   */
  _showGameInput() {
    this.editorView.showGameInput();
    this.gameAutocomplete.focus();
    this.gameAutocomplete.select();
  }

  /**
   * Handle autocomplete item selection
   * @param {string} _value
   * @private
   */
  _handleAutocompleteSelect(_value) {
    this.editorView.hideGameInput();
    this.editorView.flushSave();
  }

  /**
   * Handle autocomplete Enter key (no selection)
   * @private
   */
  _handleAutocompleteEnter() {
    this.editorView.hideGameInput();
    this.editorView.flushSave();
  }

  /**
   * Handle autocomplete Escape key
   * @private
   */
  _handleAutocompleteEscape() {
    this.editorView.hideGameInput();
  }

  /**
   * Save current note
   * @private
   */
  _saveCurrentNote() {
    if (!this.currentNoteId) return;

    const { title, content, gameName } = this.editorView.getValues();

    // Use service method that encapsulates change detection logic
    const result = this.notesService.updateNoteWithChangeDetection(
      this.currentNoteId,
      { title, content, gameName }
    );

    if (!result) {
      this.logger?.warn('Failed to save note - may have been deleted');
      return;
    }

    // If game changed, update filter options and re-render list for proper grouping
    if (result.gameChanged) {
      this.gameFilter.updateOptions();
      this.listView.render(this.searchComponent.getQuery());
    } else {
      // Update only the current item in the list (not full rebuild)
      this.listView.updateItemDisplay(this.currentNoteId, title, gameName);
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
    const gameName = this.gameFilter.getCurrentFilter() || '';
    const note = this.notesService.createNote('', '', gameName);
    if (!note) {
      this.logger?.error('Failed to create note');
      return;
    }

    this._selectNote(note.id);
    this.gameFilter.updateOptions();
    this.listView.render();

    // Focus title input
    this.editorView.focusTitle();
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
    this.editorView.clear();

    // Update game filter options (game might no longer have notes)
    this.gameFilter.updateOptions();

    // Re-render list and select first note if available, or show empty state
    const currentFilter = this.gameFilter.getCurrentFilter();
    this.listView.render();
    const notes = this.notesService.searchNotes('', currentFilter);
    if (notes.length > 0) {
      this._selectNote(notes[0].id);
    }
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

    // Update editor view
    this.editorView.loadNote(note);

    // Update list view active state
    this.listView.setCurrentNoteId(noteId);
    this.listView.updateActiveState(noteId);

    this.logger?.debug(`Selected note: ${noteId}`);
  }

  /**
   * Setup escape key to close panel
   * @private
   */
  _setupEscapeKey() {
    this._domListeners.add(document, 'keydown', (e) => {
      if (e.key === 'Escape' && this.isVisible) {
        // Check if game filter is open
        if (this.gameFilter && this.gameFilter.isGameFilterOpen) {
          this.gameFilter.hide();
          return;
        }

        this.hide();
      }
    });
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
          this.listView.render(this.searchComponent.getQuery());
        }
      }
    );
    this._eventSubscriptions.push(unsubscribeCreated);

    const unsubscribeDeleted = this.eventBus.subscribe(
      EventChannels.NOTES.NOTE_DELETED,
      () => {
        this.listView.render(this.searchComponent.getQuery());
      }
    );
    this._eventSubscriptions.push(unsubscribeDeleted);

    const unsubscribeUpdated = this.eventBus.subscribe(
      EventChannels.NOTES.NOTE_UPDATED,
      (note) => {
        if (note && note.id !== this.currentNoteId) {
          this.listView.render(this.searchComponent.getQuery());
        }
      }
    );
    this._eventSubscriptions.push(unsubscribeUpdated);
  }

  /**
   * Cleanup resources
   */
  dispose() {
    // Dispose sub-components
    this.listView?.dispose();
    this.editorView?.dispose();
    this.searchComponent?.dispose();
    this.gameFilter?.dispose();
    this.gameAutocomplete?.dispose();
    this.resizeHandler?.dispose();
    this.layout?.dispose();

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
    this.listView = null;
    this.editorView = null;
    this.searchComponent = null;
    this.gameFilter = null;
    this.gameAutocomplete = null;
    this.resizeHandler = null;
    this.layout = null;
  }
}

export { NotesPanelComponent };
