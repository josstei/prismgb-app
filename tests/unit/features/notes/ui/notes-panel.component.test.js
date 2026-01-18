/**
 * NotesPanelComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotesPanelComponent } from '@renderer/ui/features/notes/notes-panel.component.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';

describe('NotesPanelComponent', () => {
  let component;
  let mockNotesService;
  let mockEventBus;
  let mockLogger;
  let mockElements;

  beforeEach(() => {
    // Mock notes service
    mockNotesService = {
      getAllNotes: vi.fn(() => []),
      getNote: vi.fn(),
      createNote: vi.fn(),
      updateNote: vi.fn(),
      updateNoteWithChangeDetection: vi.fn(),
      deleteNote: vi.fn(),
      searchNotes: vi.fn(() => []),
      getUniqueGames: vi.fn(() => []),
      getNotesGroupedByGame: vi.fn(() => ({}))
    };

    // Mock event bus
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn()) // Returns unsubscribe function
    };

    // Mock logger
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    // Create mock DOM elements
    mockElements = {
      notesBtn: document.createElement('button'),
      notesPanel: document.createElement('div'),
      notesPanelContent: document.createElement('div'),
      notesListWrapper: document.createElement('div'),
      notesSearchInput: document.createElement('input'),
      notesGameFilter: document.createElement('button'),
      notesGameFilterLabel: document.createElement('span'),
      notesGameFilterMenu: document.createElement('div'),
      notesListToggle: document.createElement('button'),
      notesList: document.createElement('div'),
      notesEditor: document.createElement('div'),
      notesGameAddBtn: document.createElement('button'),
      notesGameTagRow: document.createElement('div'),
      notesGameTag: document.createElement('button'),
      notesGameInput: document.createElement('input'),
      notesGameAutocomplete: document.createElement('div'),
      notesTitleInput: document.createElement('input'),
      notesContentArea: document.createElement('textarea'),
      notesNewBtn: document.createElement('button'),
      notesDeleteBtn: document.createElement('button'),
      streamContainer: document.createElement('div'),
      streamToolbar: document.createElement('div')
    };

    // Set up element IDs for querySelector usage
    mockElements.notesPanel.id = 'notesPanel';
    mockElements.notesList.className = 'notes-list';

    component = new NotesPanelComponent({
      notesService: mockNotesService,
      eventBus: mockEventBus,
      logger: mockLogger
    });
  });

  afterEach(() => {
    component.dispose();
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should create component with default state', () => {
      expect(component.isVisible).toBe(false);
      expect(component.currentNoteId).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should initialize with DOM elements', () => {
      component.initialize(mockElements);

      expect(component.elements.notesBtn).toBe(mockElements.notesBtn);
      expect(component.elements.notesPanel).toBe(mockElements.notesPanel);
    });

    it('should warn if required elements are missing', () => {
      component.initialize({});

      expect(mockLogger.warn).toHaveBeenCalledWith('Notes panel elements not found');
    });

    it('should render notes list on initialize', () => {
      component.initialize(mockElements);

      expect(mockNotesService.searchNotes).toHaveBeenCalled();
    });

    it('should subscribe to events on initialize', () => {
      component.initialize(mockElements);

      expect(mockEventBus.subscribe).toHaveBeenCalled();
    });

    it('should log debug message on successful initialize', () => {
      component.initialize(mockElements);

      expect(mockLogger.debug).toHaveBeenCalledWith('NotesPanelComponent initialized');
    });
  });

  describe('toggle', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should show panel when currently hidden', () => {
      component.isVisible = false;

      component.toggle();

      expect(component.isVisible).toBe(true);
    });

    it('should hide panel when currently visible', () => {
      component.isVisible = true;
      mockElements.notesPanel.classList.add(CSSClasses.VISIBLE);

      component.toggle();

      expect(component.isVisible).toBe(false);
    });
  });

  describe('show', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should add visible class to panel', () => {
      component.show();

      expect(mockElements.notesPanel.classList.contains(CSSClasses.VISIBLE)).toBe(true);
    });

    it('should add panel-open class to button', () => {
      component.show();

      expect(mockElements.notesBtn.classList.contains(CSSClasses.PANEL_OPEN)).toBe(true);
    });

    it('should set aria-expanded to true', () => {
      component.show();

      expect(mockElements.notesBtn.getAttribute('aria-expanded')).toBe('true');
    });

    it('should set isVisible to true', () => {
      component.show();

      expect(component.isVisible).toBe(true);
    });

    it('should focus search input', () => {
      const focusSpy = vi.spyOn(mockElements.notesSearchInput, 'focus');

      component.show();

      expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    });

    it('should update layout position when shown', () => {
      const updateSpy = vi.spyOn(component.layout, 'updatePosition');

      component.show();

      expect(updateSpy).toHaveBeenCalled();
    });

    it('should not throw if panel element is missing', () => {
      component.elements.notesPanel = null;

      expect(() => component.show()).not.toThrow();
    });
  });

  describe('hide', () => {
    beforeEach(() => {
      component.initialize(mockElements);
      component.isVisible = true;
      mockElements.notesPanel.classList.add(CSSClasses.VISIBLE);
    });

    it('should remove visible class from panel', () => {
      component.hide();

      expect(mockElements.notesPanel.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    });

    it('should remove panel-open class from button', () => {
      mockElements.notesBtn.classList.add(CSSClasses.PANEL_OPEN);

      component.hide();

      expect(mockElements.notesBtn.classList.contains(CSSClasses.PANEL_OPEN)).toBe(false);
    });

    it('should set aria-expanded to false', () => {
      component.hide();

      expect(mockElements.notesBtn.getAttribute('aria-expanded')).toBe('false');
    });

    it('should set isVisible to false', () => {
      component.hide();

      expect(component.isVisible).toBe(false);
    });

    it('should save current note before hiding', () => {
      component.currentNoteId = 'note_1';
      mockElements.notesGameInput.value = '';
      mockElements.notesTitleInput.value = 'Test Title';
      mockElements.notesContentArea.value = 'Test Content';
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'note_1' }, gameChanged: false });

      component.hide();

      expect(mockNotesService.updateNoteWithChangeDetection).toHaveBeenCalledWith('note_1', {
        title: 'Test Title',
        content: 'Test Content',
        gameName: ''
      });
    });

    // NOTE: Save timeout is now managed by EditorViewComponent
  });

  describe('_createNewNote', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should create note via service', () => {
      mockNotesService.createNote.mockReturnValue({ id: 'new_note', title: 'Untitled Note' });

      component._createNewNote();

      expect(mockNotesService.createNote).toHaveBeenCalled();
    });

    it('should select the newly created note', () => {
      const newNote = { id: 'new_note', title: 'Untitled Note', content: '' };
      mockNotesService.createNote.mockReturnValue(newNote);
      mockNotesService.getNote.mockReturnValue(newNote);

      component._createNewNote();

      expect(component.currentNoteId).toBe('new_note');
    });

    it('should focus and select title input', () => {
      const newNote = { id: 'new_note', title: 'Untitled Note', content: '' };
      mockNotesService.createNote.mockReturnValue(newNote);
      mockNotesService.getNote.mockReturnValue(newNote);

      const focusSpy = vi.spyOn(mockElements.notesTitleInput, 'focus');
      const selectSpy = vi.spyOn(mockElements.notesTitleInput, 'select');

      component._createNewNote();

      expect(focusSpy).toHaveBeenCalled();
      expect(selectSpy).toHaveBeenCalled();
    });

    it('should log error if note creation fails', () => {
      mockNotesService.createNote.mockReturnValue(null);

      component._createNewNote();

      expect(mockLogger.error).toHaveBeenCalledWith('Failed to create note');
    });
  });

  describe('_deleteCurrentNote', () => {
    beforeEach(() => {
      component.initialize(mockElements);
      component.currentNoteId = 'note_1';
    });

    it('should delete note via service', () => {
      mockNotesService.deleteNote.mockReturnValue(true);
      mockNotesService.getAllNotes.mockReturnValue([]);

      component._deleteCurrentNote();

      expect(mockNotesService.deleteNote).toHaveBeenCalledWith('note_1');
    });

    it('should clear current note id after deletion', () => {
      mockNotesService.deleteNote.mockReturnValue(true);
      mockNotesService.getAllNotes.mockReturnValue([]);

      component._deleteCurrentNote();

      expect(component.currentNoteId).toBeNull();
    });

    it('should clear editor inputs after deletion', () => {
      mockNotesService.deleteNote.mockReturnValue(true);
      mockNotesService.getAllNotes.mockReturnValue([]);
      mockElements.notesTitleInput.value = 'Test';
      mockElements.notesContentArea.value = 'Content';

      component._deleteCurrentNote();

      expect(mockElements.notesTitleInput.value).toBe('');
      expect(mockElements.notesContentArea.value).toBe('');
    });

    it('should disable delete button after deletion', () => {
      mockNotesService.deleteNote.mockReturnValue(true);
      mockNotesService.getAllNotes.mockReturnValue([]);

      component._deleteCurrentNote();

      expect(mockElements.notesDeleteBtn.hasAttribute('disabled')).toBe(true);
    });

    it('should select first remaining note after deletion', () => {
      const remainingNote = { id: 'note_2', title: 'Remaining', gameName: '', content: '' };
      mockNotesService.deleteNote.mockReturnValue(true);
      mockNotesService.searchNotes.mockReturnValue([remainingNote]);
      mockNotesService.getNote.mockReturnValue(remainingNote);

      component._deleteCurrentNote();

      expect(component.currentNoteId).toBe('note_2');
    });

    it('should remove has-note class when no notes remain', () => {
      mockNotesService.deleteNote.mockReturnValue(true);
      mockNotesService.getAllNotes.mockReturnValue([]);
      mockElements.notesEditor.classList.add('has-note');

      component._deleteCurrentNote();

      expect(mockElements.notesEditor.classList.contains('has-note')).toBe(false);
    });

    it('should not delete if no current note', () => {
      component.currentNoteId = null;

      component._deleteCurrentNote();

      expect(mockNotesService.deleteNote).not.toHaveBeenCalled();
    });

    it('should log warning if deletion fails', () => {
      mockNotesService.deleteNote.mockReturnValue(false);

      component._deleteCurrentNote();

      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to delete note');
    });
  });

  describe('_selectNote', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should load note content into editor', () => {
      const note = { id: 'note_1', title: 'Test Title', content: 'Test Content' };
      mockNotesService.getNote.mockReturnValue(note);

      component._selectNote('note_1');

      expect(mockElements.notesTitleInput.value).toBe('Test Title');
      expect(mockElements.notesContentArea.value).toBe('Test Content');
    });

    it('should set current note id', () => {
      const note = { id: 'note_1', title: 'Test', content: '' };
      mockNotesService.getNote.mockReturnValue(note);

      component._selectNote('note_1');

      expect(component.currentNoteId).toBe('note_1');
    });

    it('should add has-note class to editor', () => {
      const note = { id: 'note_1', title: 'Test', content: '' };
      mockNotesService.getNote.mockReturnValue(note);

      component._selectNote('note_1');

      expect(mockElements.notesEditor.classList.contains('has-note')).toBe(true);
    });

    it('should enable delete button', () => {
      const note = { id: 'note_1', title: 'Test', content: '' };
      mockNotesService.getNote.mockReturnValue(note);
      mockElements.notesDeleteBtn.setAttribute('disabled', '');

      component._selectNote('note_1');

      expect(mockElements.notesDeleteBtn.hasAttribute('disabled')).toBe(false);
    });

    it('should not select if note not found', () => {
      mockNotesService.getNote.mockReturnValue(null);

      component._selectNote('non_existent');

      expect(component.currentNoteId).toBeNull();
    });

    it('should handle note with missing title/content', () => {
      const note = { id: 'note_1' };
      mockNotesService.getNote.mockReturnValue(note);

      component._selectNote('note_1');

      expect(mockElements.notesTitleInput.value).toBe('');
      expect(mockElements.notesContentArea.value).toBe('');
    });
  });

  // NOTE: _renderNotesList is now handled by NotesListViewComponent
  // These rendering tests should be moved to notes-list-view.component.test.js

  describe('_saveCurrentNote', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should not save if no current note', () => {
      component.currentNoteId = null;

      component._saveCurrentNote();

      expect(mockNotesService.updateNoteWithChangeDetection).not.toHaveBeenCalled();
    });

    it('should save current note with editor values', () => {
      component.currentNoteId = 'note_1';
      mockElements.notesGameInput.value = 'Test Game';
      mockElements.notesTitleInput.value = 'Updated Title';
      mockElements.notesContentArea.value = 'Updated Content';
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'note_1' }, gameChanged: false });

      component._saveCurrentNote();

      expect(mockNotesService.updateNoteWithChangeDetection).toHaveBeenCalledWith('note_1', {
        title: 'Updated Title',
        content: 'Updated Content',
        gameName: 'Test Game'
      });
    });

    it('should log warning if save fails', () => {
      component.currentNoteId = 'note_1';
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue(null);

      component._saveCurrentNote();

      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to save note - may have been deleted');
    });
  });

  // NOTE: _scheduleSave is now handled by NotesEditorViewComponent
  // These debouncing tests should be moved to notes-editor-view.component.test.js

  // NOTE: _scheduleSearch is now handled by NotesSearchComponent
  // These debouncing tests should be moved to notes-search.component.test.js

  describe('Escape key handling', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should hide panel on Escape key when visible', () => {
      component.isVisible = true;
      mockElements.notesPanel.classList.add(CSSClasses.VISIBLE);

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      expect(component.isVisible).toBe(false);
    });

    it('should not hide panel on Escape key when already hidden', () => {
      component.isVisible = false;
      const publishCallsBefore = mockEventBus.publish.mock.calls.length;

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      document.dispatchEvent(event);

      // No visibility change event should be published
      expect(mockEventBus.publish.mock.calls.length).toBe(publishCallsBefore);
    });
  });

  describe('dispose', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      component.initialize(mockElements);
    });

    it('should nullify references', () => {
      const layoutDisposeSpy = vi.spyOn(component.layout, 'dispose');

      component.dispose();

      expect(component.elements).toBeNull();
      expect(component.notesService).toBeNull();
      expect(component.eventBus).toBeNull();
      expect(component.logger).toBeNull();
      expect(layoutDisposeSpy).toHaveBeenCalled();
    });

    it('should reset state', () => {
      component.currentNoteId = 'note_1';
      component.isVisible = true;

      component.dispose();

      expect(component.currentNoteId).toBeNull();
      expect(component.isVisible).toBe(false);
    });

    it('should unsubscribe from events', () => {
      const unsubscribeMock = vi.fn();
      component._eventSubscriptions = [unsubscribeMock];

      component.dispose();

      expect(unsubscribeMock).toHaveBeenCalled();
    });

    it('should handle unsubscribe errors gracefully', () => {
      const errorUnsubscribe = vi.fn(() => { throw new Error('Unsubscribe error'); });
      component._eventSubscriptions = [errorUnsubscribe];

      expect(() => component.dispose()).not.toThrow();
    });
  });

  // NOTE: _updateListItemDisplay is now handled by NotesListViewComponent
  // These tests should be moved to notes-list-view.component.test.js

  describe('Toggle button click', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should toggle panel on button click', () => {
      expect(component.isVisible).toBe(false);

      mockElements.notesBtn.click();

      expect(component.isVisible).toBe(true);

      mockElements.notesBtn.click();

      expect(component.isVisible).toBe(false);
    });
  });

  describe('Close button click', () => {
    beforeEach(() => {
      component.initialize(mockElements);
      component.show();
    });

    it('should hide panel on toggle button click when visible', () => {
      expect(component.isVisible).toBe(true);

      mockElements.notesBtn.click();

      expect(component.isVisible).toBe(false);
    });
  });

  describe('New button click', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should create new note on button click', () => {
      mockNotesService.createNote.mockReturnValue({ id: 'new_note', title: 'Untitled Note' });
      mockNotesService.getNote.mockReturnValue({ id: 'new_note', title: 'Untitled Note', content: '' });

      mockElements.notesNewBtn.click();

      expect(mockNotesService.createNote).toHaveBeenCalled();
    });
  });

  describe('Delete button hold-to-delete', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      component.initialize(mockElements);
      component.currentNoteId = 'note_1';
    });

    it('should delete current note after holding for 2 seconds', () => {
      mockNotesService.deleteNote.mockReturnValue(true);
      mockNotesService.getAllNotes.mockReturnValue([]);

      // Simulate mousedown to start hold
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mousedown'));

      // Should not delete immediately
      expect(mockNotesService.deleteNote).not.toHaveBeenCalled();

      // Advance timers by 2 seconds
      vi.advanceTimersByTime(2000);

      // Now it should be deleted
      expect(mockNotesService.deleteNote).toHaveBeenCalledWith('note_1');
    });

    it('should cancel delete if mouseup before 2 seconds', () => {
      mockNotesService.deleteNote.mockReturnValue(true);

      // Start hold
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mousedown'));

      // Release after 1 second
      vi.advanceTimersByTime(1000);
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mouseup'));

      // Advance past the 2 second mark
      vi.advanceTimersByTime(1500);

      // Should not have deleted
      expect(mockNotesService.deleteNote).not.toHaveBeenCalled();
    });

    it('should cancel delete if mouse leaves button', () => {
      mockNotesService.deleteNote.mockReturnValue(true);

      // Start hold
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mousedown'));

      // Leave button after 500ms
      vi.advanceTimersByTime(500);
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mouseleave'));

      // Advance past the 2 second mark
      vi.advanceTimersByTime(2000);

      // Should not have deleted
      expect(mockNotesService.deleteNote).not.toHaveBeenCalled();
    });

    it('should add holding class during hold', () => {
      // Start hold
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mousedown'));

      expect(mockElements.notesDeleteBtn.classList.contains('holding')).toBe(true);

      // Release
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mouseup'));

      expect(mockElements.notesDeleteBtn.classList.contains('holding')).toBe(false);
    });
  });

  describe('List item click (event delegation)', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should select note when list item clicked', () => {
      const note = { id: 'note_1', title: 'Test', content: 'Content' };
      mockNotesService.getNote.mockReturnValue(note);

      // Set up list with a note item
      mockElements.notesList.innerHTML = `
        <div class="note-list-item" data-note-id="note_1">
          <div class="note-list-item-title">Test</div>
        </div>
      `;

      const listItem = mockElements.notesList.querySelector('.note-list-item');
      listItem.click();

      expect(component.currentNoteId).toBe('note_1');
    });

    it('should save current note before switching', () => {
      component.currentNoteId = 'old_note';
      mockElements.notesGameInput.value = '';
      mockElements.notesTitleInput.value = 'Old Title';
      mockElements.notesContentArea.value = 'Old Content';
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'old_note' }, gameChanged: false });

      const newNote = { id: 'new_note', title: 'New', content: '', gameName: '' };
      mockNotesService.getNote.mockReturnValueOnce(newNote);

      mockElements.notesList.innerHTML = `
        <div class="note-list-item" data-note-id="new_note">
          <div class="note-list-item-title">New</div>
        </div>
      `;

      const listItem = mockElements.notesList.querySelector('.note-list-item');
      listItem.click();

      expect(mockNotesService.updateNoteWithChangeDetection).toHaveBeenCalledWith('old_note', {
        title: 'Old Title',
        content: 'Old Content',
        gameName: ''
      });
    });

    // NOTE: List item click handling and selection logic is now in NotesListViewComponent
  });

  // NOTE: Game filter functionality is now handled by GameFilterComponent
  // These tests should be moved to game-filter.component.test.js

  // NOTE: List toggle functionality is now handled by NotesResizeHandlerComponent

  describe('Game tag UI', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should show game input when add button clicked', () => {
      mockElements.notesGameAddBtn.click();

      expect(mockElements.notesGameTagRow.classList.contains('editing')).toBe(true);
    });

    it('should hide game input and save on Enter', () => {
      component.currentNoteId = 'note_1';
      mockElements.notesGameInput.value = 'Game Alpha';
      mockElements.notesGameTagRow.classList.add('editing');
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'note_1' }, gameChanged: false });

      const event = new KeyboardEvent('keydown', { key: 'Enter' });
      mockElements.notesGameInput.dispatchEvent(event);

      expect(mockElements.notesGameTagRow.classList.contains('editing')).toBe(false);
    });

    it('should hide game input on Escape without saving', () => {
      mockElements.notesGameInput.value = 'Game Alpha';
      mockElements.notesGameTagRow.classList.add('editing');

      const event = new KeyboardEvent('keydown', { key: 'Escape' });
      mockElements.notesGameInput.dispatchEvent(event);

      expect(mockElements.notesGameTagRow.classList.contains('editing')).toBe(false);
    });

    // NOTE: Game tag display is now handled by NotesEditorViewComponent

    it('should toggle game tag on click', () => {
      mockElements.notesGameTag.click();

      expect(mockElements.notesGameTagRow.classList.contains('editing')).toBe(true);
    });
  });

  describe('Autocomplete functionality', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      component.initialize(mockElements);
      mockElements.notesGameTagRow.classList.add('editing');
    });

    it('should schedule autocomplete on input', () => {
      mockNotesService.getUniqueGames.mockReturnValue(['Alpha Game', 'Beta Game']);
      mockElements.notesGameInput.value = 'Alpha';

      mockElements.notesGameInput.dispatchEvent(new Event('input'));

      vi.advanceTimersByTime(150);

      expect(mockElements.notesGameAutocomplete.classList.contains('visible')).toBe(true);
    });

    it('should hide autocomplete when input is empty', () => {
      mockElements.notesGameAutocomplete.classList.add('visible');
      mockElements.notesGameInput.value = '';

      mockElements.notesGameInput.dispatchEvent(new Event('input'));

      vi.advanceTimersByTime(150);

      expect(mockElements.notesGameAutocomplete.classList.contains('visible')).toBe(false);
    });

    // NOTE: Autocomplete filtering and internal methods are now handled by GameAutocompleteComponent
    // These tests should be moved to game-autocomplete.component.test.js

    it('should schedule save on Enter key without highlighted item', () => {
      component.currentNoteId = 'note_1';
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'note_1' }, gameChanged: false });
      mockElements.notesGameInput.value = 'Custom Game';

      // Press Enter without highlighting anything
      mockElements.notesGameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));

      // Should hide input
      expect(mockElements.notesGameTagRow.classList.contains('editing')).toBe(false);

      // Advance timers to trigger save
      vi.advanceTimersByTime(500);
      expect(mockNotesService.updateNoteWithChangeDetection).toHaveBeenCalledWith('note_1', expect.objectContaining({
        gameName: 'Custom Game'
      }));
    });

    // NOTE: Autocomplete item click handling is now in GameAutocompleteComponent
  });

  // NOTE: Game grouping functionality is now handled by NotesListViewComponent
  // These tests should be moved to notes-list-view.component.test.js

  describe('Search handling', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should render list with search query', () => {
      const renderSpy = vi.spyOn(component.listView, 'render');

      component._handleSearch('Alpha');

      expect(renderSpy).toHaveBeenCalledWith('Alpha');
    });
  });

  describe('Save with game change', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should re-render list when game name changes', () => {
      component.currentNoteId = 'note_1';
      mockElements.notesGameInput.value = 'New Game';
      mockElements.notesTitleInput.value = 'Title';
      mockElements.notesContentArea.value = 'Content';
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'note_1', gameName: 'New Game' }, gameChanged: true });
      mockNotesService.searchNotes.mockReturnValue([]);

      component._saveCurrentNote();

      // Game changed, so list should be re-rendered
      expect(mockNotesService.searchNotes).toHaveBeenCalled();
    });

    it('should update list item display when title changes', () => {
      component.currentNoteId = 'note_1';
      mockElements.notesGameInput.value = '';
      mockElements.notesTitleInput.value = 'New Title';
      mockElements.notesContentArea.value = 'Content';
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'note_1', gameName: '' }, gameChanged: false });

      mockElements.notesList.innerHTML = `
        <div class="note-list-item" data-note-id="note_1">
          <div class="note-list-item-title">Old Title</div>
          <div class="note-list-item-date">01/01/2024</div>
        </div>
      `;

      component._saveCurrentNote();

      const titleEl = mockElements.notesList.querySelector('.note-list-item-title');
      expect(titleEl.textContent).toBe('New Title');
    });
  });

  // NOTE: Delete hold and autocomplete timeout are now handled by sub-components
  // (NotesEditorViewComponent and GameAutocompleteComponent respectively)

  // NOTE: Autocomplete highlight functionality is now handled by GameAutocompleteComponent
  // These tests should be moved to game-autocomplete.component.test.js

  describe('Event subscription handling', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should handle note created event', () => {
      const noteCreatedCallback = mockEventBus.subscribe.mock.calls.find(
        call => call[0] === EventChannels.NOTES.NOTE_CREATED
      )?.[1];

      if (noteCreatedCallback) {
        mockNotesService.searchNotes.mockReturnValue([]);
        noteCreatedCallback({ note: { id: 'new_note' } });
        expect(mockNotesService.searchNotes).toHaveBeenCalled();
      }
    });
  });
});
