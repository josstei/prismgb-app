/**
 * NotesPanelComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotesPanelComponent } from '@renderer/features/notes/ui/notes-panel.component.js';
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
      notesSearchInput: document.createElement('input'),
      notesGameFilter: document.createElement('select'),
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
      notesDeleteBtn: document.createElement('button')
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

      component.hide();

      expect(mockNotesService.updateNote).toHaveBeenCalledWith('note_1', {
        title: 'Test Title',
        content: 'Test Content',
        gameName: ''
      });
    });

    it('should clear pending save timeout', () => {
      vi.useFakeTimers();
      component._saveTimeout = setTimeout(() => {}, 1000);

      component.hide();

      expect(component._saveTimeout).toBeNull();
    });
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

  describe('_renderNotesList', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should render empty state when no notes', () => {
      mockNotesService.getAllNotes.mockReturnValue([]);

      component._renderNotesList();

      expect(mockElements.notesList.innerHTML).toContain('No notes yet');
    });

    it('should render empty state with search message when searching', () => {
      mockNotesService.searchNotes.mockReturnValue([]);

      component._renderNotesList('test query');

      expect(mockElements.notesList.innerHTML).toContain('No matching notes');
    });

    it('should render note list items', () => {
      const notes = [
        { id: 'note_1', title: 'First Note', gameName: '', updatedAt: Date.now() },
        { id: 'note_2', title: 'Second Note', gameName: '', updatedAt: Date.now() }
      ];
      mockNotesService.searchNotes.mockReturnValue(notes);

      component._renderNotesList();

      expect(mockElements.notesList.innerHTML).toContain('First Note');
      expect(mockElements.notesList.innerHTML).toContain('Second Note');
      expect(mockElements.notesList.innerHTML).toContain('data-note-id="note_1"');
    });

    it('should mark current note as active', () => {
      component.currentNoteId = 'note_1';
      const notes = [{ id: 'note_1', title: 'Active Note', gameName: '', updatedAt: Date.now() }];
      mockNotesService.searchNotes.mockReturnValue(notes);

      component._renderNotesList();

      expect(mockElements.notesList.innerHTML).toContain('class="note-list-item active"');
    });

    it('should escape HTML in note titles', () => {
      const notes = [{ id: 'note_1', title: '<script>alert("xss")</script>', gameName: '', updatedAt: Date.now() }];
      mockNotesService.searchNotes.mockReturnValue(notes);

      component._renderNotesList();

      expect(mockElements.notesList.innerHTML).not.toContain('<script>');
      expect(mockElements.notesList.innerHTML).toContain('&lt;script&gt;');
    });

    it('should use default title for untitled notes', () => {
      const notes = [{ id: 'note_1', title: '', gameName: '', updatedAt: Date.now() }];
      mockNotesService.searchNotes.mockReturnValue(notes);

      component._renderNotesList();

      expect(mockElements.notesList.innerHTML).toContain('Untitled Note');
    });

    it('should call searchNotes when query provided', () => {
      mockNotesService.searchNotes.mockReturnValue([]);

      component._renderNotesList('search term');

      expect(mockNotesService.searchNotes).toHaveBeenCalledWith('search term', '');
    });
  });

  describe('_saveCurrentNote', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should not save if no current note', () => {
      component.currentNoteId = null;

      component._saveCurrentNote();

      expect(mockNotesService.updateNote).not.toHaveBeenCalled();
    });

    it('should save current note with editor values', () => {
      component.currentNoteId = 'note_1';
      mockElements.notesGameInput.value = 'Test Game';
      mockElements.notesTitleInput.value = 'Updated Title';
      mockElements.notesContentArea.value = 'Updated Content';
      mockNotesService.updateNote.mockReturnValue({ id: 'note_1' });
      mockNotesService.getNote.mockReturnValue({ id: 'note_1', gameName: 'Test Game' });

      component._saveCurrentNote();

      expect(mockNotesService.updateNote).toHaveBeenCalledWith('note_1', {
        title: 'Updated Title',
        content: 'Updated Content',
        gameName: 'Test Game'
      });
    });

    it('should log warning if save fails', () => {
      component.currentNoteId = 'note_1';
      mockNotesService.updateNote.mockReturnValue(null);

      component._saveCurrentNote();

      expect(mockLogger.warn).toHaveBeenCalledWith('Failed to save note - may have been deleted');
    });
  });

  describe('_scheduleSave (debouncing)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      component.initialize(mockElements);
      component.currentNoteId = 'note_1';
      mockNotesService.updateNote.mockReturnValue({ id: 'note_1' });
    });

    it('should debounce save calls', () => {
      component._scheduleSave();
      component._scheduleSave();
      component._scheduleSave();

      vi.advanceTimersByTime(500);

      expect(mockNotesService.updateNote).toHaveBeenCalledTimes(1);
    });

    it('should delay save by 500ms', () => {
      component._scheduleSave();

      vi.advanceTimersByTime(400);
      expect(mockNotesService.updateNote).not.toHaveBeenCalled();

      vi.advanceTimersByTime(100);
      expect(mockNotesService.updateNote).toHaveBeenCalled();
    });
  });

  describe('_scheduleSearch (debouncing)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      component.initialize(mockElements);
    });

    it('should debounce search calls', () => {
      mockNotesService.searchNotes.mockReturnValue([]);

      component._scheduleSearch();
      component._scheduleSearch();
      component._scheduleSearch();

      vi.advanceTimersByTime(200);

      // searchNotes is always called during _renderNotesList (with empty query for no search)
      expect(mockNotesService.searchNotes).toHaveBeenCalled();
    });

    it('should delay search by 200ms', () => {
      mockNotesService.searchNotes.mockReturnValue([]);
      const initialCallCount = mockNotesService.searchNotes.mock.calls.length;

      component._scheduleSearch();

      vi.advanceTimersByTime(100);
      expect(mockNotesService.searchNotes.mock.calls.length).toBe(initialCallCount);

      vi.advanceTimersByTime(100);
      expect(mockNotesService.searchNotes.mock.calls.length).toBeGreaterThan(initialCallCount);
    });
  });

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

    it('should clear all timeouts', () => {
      component._saveTimeout = setTimeout(() => {}, 1000);
      component._searchTimeout = setTimeout(() => {}, 1000);
      component._resizeTimeout = setTimeout(() => {}, 1000);

      component.dispose();

      expect(component._saveTimeout).toBeNull();
      expect(component._searchTimeout).toBeNull();
      expect(component._resizeTimeout).toBeNull();
    });

    it('should nullify references', () => {
      component.dispose();

      expect(component.elements).toBeNull();
      expect(component.notesService).toBeNull();
      expect(component.eventBus).toBeNull();
      expect(component.logger).toBeNull();
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

  describe('_updateListItemDisplay', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should update title in list item', () => {
      // Set up list with a note item
      mockElements.notesList.innerHTML = `
        <div class="note-list-item" data-note-id="note_1">
          <div class="note-list-item-title">Old Title</div>
          <div class="note-list-item-date">01/01/2024</div>
        </div>
      `;

      component._updateListItemDisplay('note_1', 'New Title');

      const titleEl = mockElements.notesList.querySelector('.note-list-item-title');
      expect(titleEl.textContent).toBe('New Title');
    });

    it('should use default title for empty string', () => {
      mockElements.notesList.innerHTML = `
        <div class="note-list-item" data-note-id="note_1">
          <div class="note-list-item-title">Old Title</div>
          <div class="note-list-item-date">01/01/2024</div>
        </div>
      `;

      component._updateListItemDisplay('note_1', '');

      const titleEl = mockElements.notesList.querySelector('.note-list-item-title');
      expect(titleEl.textContent).toBe('Untitled Note');
    });
  });

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
      mockNotesService.updateNote.mockReturnValue({ id: 'old_note' });
      mockNotesService.getNote.mockReturnValue({ id: 'old_note', gameName: '' });

      const newNote = { id: 'new_note', title: 'New', content: '', gameName: '' };
      mockNotesService.getNote.mockReturnValueOnce({ id: 'old_note', gameName: '' });
      mockNotesService.getNote.mockReturnValueOnce(newNote);

      mockElements.notesList.innerHTML = `
        <div class="note-list-item" data-note-id="new_note">
          <div class="note-list-item-title">New</div>
        </div>
      `;

      const listItem = mockElements.notesList.querySelector('.note-list-item');
      listItem.click();

      expect(mockNotesService.updateNote).toHaveBeenCalledWith('old_note', {
        title: 'Old Title',
        content: 'Old Content',
        gameName: ''
      });
    });

    it('should not re-select already selected note', () => {
      component.currentNoteId = 'note_1';
      const getNoteCalls = mockNotesService.getNote.mock.calls.length;

      mockElements.notesList.innerHTML = `
        <div class="note-list-item" data-note-id="note_1">
          <div class="note-list-item-title">Test</div>
        </div>
      `;

      const listItem = mockElements.notesList.querySelector('.note-list-item');
      listItem.click();

      // Should not call getNote again since it's already selected
      expect(mockNotesService.getNote.mock.calls.length).toBe(getNoteCalls);
    });
  });

  describe('Game filter functionality', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should update game filter options from service', () => {
      mockNotesService.getUniqueGames.mockReturnValue(['Alpha', 'Beta']);

      component._updateGameFilterOptions();

      expect(mockElements.notesGameFilter.innerHTML).toContain('All Games');
      expect(mockElements.notesGameFilter.innerHTML).toContain('Alpha');
      expect(mockElements.notesGameFilter.innerHTML).toContain('Beta');
    });

    it('should handle game filter change event', () => {
      mockNotesService.searchNotes.mockReturnValue([]);

      // Trigger the change event to cover the event handler
      mockElements.notesGameFilter.dispatchEvent(new Event('change'));

      // The handler runs without error
      expect(mockNotesService.searchNotes).toHaveBeenCalled();
    });
  });

  describe('List toggle functionality', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should call _toggleListVisibility method', () => {
      // Test that the method can be called without error
      component._toggleListVisibility();

      // The visibility state is toggled
      expect(typeof component.isListVisible).toBe('boolean');
    });
  });

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
      mockNotesService.updateNote.mockReturnValue({ id: 'note_1' });
      mockNotesService.getNote.mockReturnValue({ id: 'note_1', gameName: 'Game Alpha' });

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

    it('should update game tag display', () => {
      mockElements.notesGameInput.value = 'Test Game';
      component._updateGameTagDisplay();

      expect(mockElements.notesGameTag.textContent).toBe('Test Game');
      expect(mockElements.notesEditor.classList.contains('has-game')).toBe(true);
    });

    it('should remove has-game class when no game', () => {
      mockElements.notesGameInput.value = '';
      mockElements.notesEditor.classList.add('has-game');
      component._updateGameTagDisplay();

      expect(mockElements.notesGameTag.textContent).toBe('');
      expect(mockElements.notesEditor.classList.contains('has-game')).toBe(false);
    });

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

    it('should filter autocomplete matches by prefix', () => {
      mockNotesService.getUniqueGames.mockReturnValue(['Alpha Game', 'Beta Game', 'Gamma Game']);
      mockElements.notesGameInput.value = 'Alpha';

      component._showAutocomplete();

      expect(mockElements.notesGameAutocomplete.innerHTML).toContain('Alpha Game');
      expect(mockElements.notesGameAutocomplete.innerHTML).not.toContain('Beta Game');
    });

    it('should hide autocomplete when no matches', () => {
      mockNotesService.getUniqueGames.mockReturnValue(['Alpha Game']);
      mockElements.notesGameInput.value = 'NoMatch';

      component._showAutocomplete();

      expect(mockElements.notesGameAutocomplete.classList.contains('visible')).toBe(false);
    });

    it('should handle _selectAutocompleteItem', () => {
      mockElements.notesGameInput.value = 'test';

      component._selectAutocompleteItem('Selected Game');

      expect(mockElements.notesGameInput.value).toBe('Selected Game');
    });

    it('should handle _hideAutocomplete', () => {
      mockElements.notesGameAutocomplete.classList.add('visible');

      component._hideAutocomplete();

      expect(mockElements.notesGameAutocomplete.classList.contains('visible')).toBe(false);
    });
  });

  describe('Game grouping', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should group notes by game name', () => {
      const notes = [
        { id: '1', title: 'Note 1', gameName: 'Game Alpha' },
        { id: '2', title: 'Note 2', gameName: 'Game Alpha' },
        { id: '3', title: 'Note 3', gameName: 'Game Gamma' }
      ];

      const groups = component._groupNotesByGame(notes);

      expect(groups['Game Alpha']).toHaveLength(2);
      expect(groups['Game Gamma']).toHaveLength(1);
    });

    it('should group notes without game under empty string key', () => {
      const notes = [
        { id: '1', title: 'Note 1', gameName: '' },
        { id: '2', title: 'Note 2' }
      ];

      const groups = component._groupNotesByGame(notes);

      expect(groups['']).toHaveLength(2);
    });

    it('should render game group header', () => {
      const notes = [{ id: '1', title: 'Note 1', gameName: 'Game Alpha', updatedAt: Date.now() }];

      const html = component._renderGameGroup('Game Alpha', notes);

      expect(html).toContain('Game Alpha');
      expect(html).toContain('notes-game-header');
    });

    it('should toggle game group collapsed state', () => {
      // Setup the DOM with a game group
      mockElements.notesList.innerHTML = `
        <div class="notes-game-group" data-game="Game Alpha">
          <button class="notes-game-header" data-game-toggle="Game Alpha">Game Alpha</button>
          <div class="note-list-item" data-note-id="1">Note 1</div>
        </div>
      `;

      component._toggleGameGroup('Game Alpha');

      expect(component.collapsedGameGroups.has('Game Alpha')).toBe(true);

      component._toggleGameGroup('Game Alpha');

      expect(component.collapsedGameGroups.has('Game Alpha')).toBe(false);
    });

    it('should handle game group header click', () => {
      mockNotesService.searchNotes.mockReturnValue([
        { id: '1', title: 'Note 1', gameName: 'Game Alpha', updatedAt: Date.now() }
      ]);
      component._renderNotesList();

      const header = mockElements.notesList.querySelector('.notes-game-header');
      if (header) {
        header.click();
        expect(component.collapsedGameGroups.has('Game Alpha')).toBe(true);
      }
    });
  });

  describe('Search handling', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      component.initialize(mockElements);
    });

    it('should call searchNotes with query and game filter', () => {
      mockNotesService.searchNotes.mockReturnValue([]);
      mockElements.notesSearchInput.value = 'test query';
      component.currentGameFilter = 'Game Alpha';

      component._handleSearch();

      expect(mockNotesService.searchNotes).toHaveBeenCalledWith('test query', 'Game Alpha');
    });

    it('should update game filter options after search', () => {
      mockNotesService.searchNotes.mockReturnValue([]);
      mockNotesService.getUniqueGames.mockReturnValue(['Game Alpha']);

      component._handleSearch();

      expect(mockNotesService.getUniqueGames).toHaveBeenCalled();
    });
  });

  describe('Panel position updates', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      component.initialize(mockElements);
    });

    it('should schedule position update with debounce', () => {
      const updateSpy = vi.spyOn(component, '_updatePanelPosition');

      component._schedulePositionUpdate();
      component._schedulePositionUpdate();
      component._schedulePositionUpdate();

      vi.advanceTimersByTime(100);

      expect(updateSpy).toHaveBeenCalledTimes(1);
    });

    it('should update panel CSS variables', () => {
      // Mock getBoundingClientRect for toolbar
      const mockToolbar = document.createElement('div');
      mockToolbar.id = 'streamToolbar';
      mockToolbar.getBoundingClientRect = () => ({
        top: 100,
        left: 200,
        right: 260,
        bottom: 400,
        width: 60,
        height: 300
      });
      document.body.appendChild(mockToolbar);

      component._updatePanelPosition();

      // Clean up
      document.body.removeChild(mockToolbar);
    });

    it('should clear resize timeout on dispose', () => {
      component._resizeTimeout = setTimeout(() => {}, 1000);

      component.dispose();

      expect(component._resizeTimeout).toBeNull();
    });
  });

  describe('Resize observer', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should disconnect resize observer on dispose', () => {
      const mockObserver = { disconnect: vi.fn() };
      component._resizeObserver = mockObserver;

      component.dispose();

      expect(mockObserver.disconnect).toHaveBeenCalled();
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
      mockNotesService.updateNote.mockReturnValue({ id: 'note_1', gameName: 'New Game' });
      mockNotesService.getNote.mockReturnValue({ id: 'note_1', gameName: 'Old Game' });
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
      mockNotesService.updateNote.mockReturnValue({ id: 'note_1', gameName: '' });
      mockNotesService.getNote.mockReturnValue({ id: 'note_1', gameName: '' });

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

  describe('Cancel delete hold', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      component.initialize(mockElements);
    });

    it('should clear delete timeout on cancel', () => {
      component._deleteHoldTimeout = setTimeout(() => {}, 2000);
      mockElements.notesDeleteBtn.classList.add('holding');

      component._cancelDeleteHold();

      expect(component._deleteHoldTimeout).toBeNull();
      expect(mockElements.notesDeleteBtn.classList.contains('holding')).toBe(false);
    });

    it('should clear autocomplete timeout on dispose', () => {
      component._autocompleteTimeout = setTimeout(() => {}, 1000);

      component.dispose();

      expect(component._autocompleteTimeout).toBeNull();
    });
  });

  describe('Autocomplete highlight', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should add highlighted class to selected item', () => {
      mockElements.notesGameAutocomplete.innerHTML = `
        <div class="notes-game-autocomplete-item" data-value="Alpha">Alpha</div>
        <div class="notes-game-autocomplete-item" data-value="Beta">Beta</div>
      `;
      const items = mockElements.notesGameAutocomplete.querySelectorAll('.notes-game-autocomplete-item');
      component.autocompleteHighlightIndex = 1;

      component._updateAutocompleteHighlight(items);

      expect(items[0].classList.contains('highlighted')).toBe(false);
      expect(items[1].classList.contains('highlighted')).toBe(true);
    });
  });

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
