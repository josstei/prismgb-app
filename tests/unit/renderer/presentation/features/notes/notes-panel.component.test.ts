// @ts-nocheck
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotesPanelComponent } from '@renderer/presentation/features/notes/notes-panel.component.js';
import { GameFilterComponent } from '@renderer/presentation/features/notes/game-filter.component.js';
import { GameAutocompleteComponent } from '@renderer/presentation/features/notes/game-autocomplete.component.js';
import { EventChannels } from '@platform/events';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import {
  createEventBus,
  createLogger,
  createNotesPanelElementsMock,
  createNotesServiceMock
} from '../../../../../factories/index.js';
describe('NotesPanelComponent', () => {
  let component;
  let mockNotesService;
  let mockEventBus;
  let mockLogger;
  let mockElements;
  beforeEach(() => {
    mockNotesService = createNotesServiceMock();
    mockEventBus = createEventBus();
    mockLogger = createLogger({ name: 'NotesPanelComponent' });
    mockElements = createNotesPanelElementsMock();
    mockElements.notesPanel.id = 'notesPanel';
    mockElements.notesList.className = 'notes-list';
    component = new NotesPanelComponent({
      notesService: mockNotesService,
      eventBus: mockEventBus,
      logger: mockLogger
    });
  });
  afterEach(async () => {
    await component.dispose();
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
    it('should not self-wire the notes button (toggling is the action dispatcher\'s responsibility)', () => {
      component.initialize(mockElements);
      mockElements.notesBtn.click();
      expect(component.isVisible).toBe(false);
      expect(mockElements.notesPanel.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    });
    it('should clear stale panel state when reinitialized without panel elements', () => {
      component.initialize(mockElements);
      component.show();
      component.initialize({});
      expect(component.isVisible).toBe(false);
      expect(mockElements.notesPanel.classList.contains(CSSClasses.VISIBLE)).toBe(false);
      expect(mockElements.notesBtn.classList.contains(CSSClasses.PANEL_OPEN)).toBe(false);
      expect(mockElements.notesBtn.getAttribute('aria-expanded')).toBe('false');
      mockElements.notesBtn.click();
      expect(component.isVisible).toBe(false);
    });
    it('should restore the selected note when reinitialized with replacement elements', () => {
      const note = { id: 'note_1', title: 'Persisted Title', content: 'Persisted Content', gameName: 'Game Alpha' };
      const replacementElements = Object.fromEntries(
        Object.entries(mockElements).map(([key, element]) => [key, document.createElement(element.tagName.toLowerCase())])
      );
      replacementElements.notesPanel.id = 'notesPanel';
      replacementElements.notesList.className = 'notes-list';
      mockNotesService.getNote.mockReturnValue(note);
      mockNotesService.searchNotes.mockReturnValue([note]);
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note, gameChanged: false });
      component.initialize(mockElements);
      component._selectNote('note_1');
      component.initialize(replacementElements);
      replacementElements.notesTitleInput.dispatchEvent(new Event('input'));
      component.hide();
      expect(mockNotesService.updateNoteWithChangeDetection).toHaveBeenLastCalledWith('note_1', {
        title: 'Persisted Title',
        content: 'Persisted Content',
        gameName: 'Game Alpha'
      });
    });
    it('should normalize a restored game filter after pending save invalidates it', () => {
      const oldNote = { id: 'note_1', title: 'Title', content: 'Body', gameName: 'Old Game' };
      const savedNote = { ...oldNote, gameName: 'New Game' };
      const replacementElements = Object.fromEntries(
        Object.entries(mockElements).map(([key, element]) => [key, document.createElement(element.tagName.toLowerCase())])
      );
      replacementElements.notesPanel.id = 'notesPanel';
      replacementElements.notesList.className = 'notes-list';
      mockNotesService.getNote.mockReturnValueOnce(oldNote).mockReturnValue(savedNote);
      mockNotesService.searchNotes.mockReturnValue([oldNote]);
      mockNotesService.getUniqueGames.mockReturnValue(['New Game']);
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: savedNote, gameChanged: true });
      component.initialize(mockElements);
      component.gameFilter.setCurrentFilter('Old Game');
      component._selectNote('note_1');
      mockElements.notesGameInput.value = 'New Game';
      mockElements.notesGameInput.dispatchEvent(new Event('input'));
      component.initialize(replacementElements);
      expect(mockNotesService.updateNoteWithChangeDetection).toHaveBeenCalledWith('note_1', {
        title: 'Title',
        content: 'Body',
        gameName: 'New Game'
      });
      expect(component.gameFilter.getCurrentFilter()).toBe('');
      expect(component.listView.currentGameFilter).toBe('');
      expect(replacementElements.notesGameInput.value).toBe('New Game');
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
      mockElements.notesGameInput.dispatchEvent(new Event('input'));
      mockElements.notesTitleInput.dispatchEvent(new Event('input'));
      mockElements.notesContentArea.dispatchEvent(new Event('input'));
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'note_1' }, gameChanged: false });
      component.hide();
      expect(mockNotesService.updateNoteWithChangeDetection).toHaveBeenCalledWith('note_1', {
        title: 'Test Title',
        content: 'Test Content',
        gameName: ''
      });
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
      mockElements.notesSearchInput.value = 'draft';
      const focusSpy = vi.spyOn(mockElements.notesTitleInput, 'focus');
      const selectSpy = vi.spyOn(mockElements.notesTitleInput, 'select');
      component._createNewNote();
      expect(focusSpy).toHaveBeenCalled();
      expect(selectSpy).toHaveBeenCalled();
      expect(mockNotesService.searchNotes).toHaveBeenLastCalledWith('draft', '');
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
    it('should clear stale list filter when deletion invalidates the active game filter', () => {
      const remainingNote = { id: 'note_2', title: 'Remaining', gameName: 'New Game', content: '' };
      component.gameFilter.setCurrentFilter('Old Game');
      component.listView.setGameFilter('Old Game');
      mockNotesService.deleteNote.mockReturnValue(true);
      mockNotesService.getUniqueGames.mockReturnValue(['New Game']);
      mockNotesService.searchNotes.mockImplementation((_query, gameFilter) => (gameFilter ? [] : [remainingNote]));
      mockNotesService.getNote.mockReturnValue(remainingNote);
      component._deleteCurrentNote();
      expect(component.gameFilter.getCurrentFilter()).toBe('');
      expect(component.listView.currentGameFilter).toBe('');
      expect(mockNotesService.searchNotes).toHaveBeenLastCalledWith('', '');
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
    it('should clear stale list filter when save changes game and invalidates active filter', () => {
      component.currentNoteId = 'note_1';
      component.gameFilter.setCurrentFilter('Old Game');
      component.listView.setGameFilter('Old Game');
      mockElements.notesSearchInput.value = 'Renamed';
      mockElements.notesGameInput.value = 'New Game';
      mockElements.notesTitleInput.value = 'Renamed';
      mockElements.notesContentArea.value = 'Updated Content';
      mockNotesService.getUniqueGames.mockReturnValue(['New Game']);
      mockNotesService.searchNotes.mockImplementation((_query, gameFilter) => (gameFilter ? [] : [{ id: 'note_1' }]));
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({
        note: { id: 'note_1', gameName: 'New Game' },
        gameChanged: true
      });
      component._saveCurrentNote();
      expect(component.gameFilter.getCurrentFilter()).toBe('');
      expect(component.listView.currentGameFilter).toBe('');
      expect(mockNotesService.searchNotes).toHaveBeenLastCalledWith('Renamed', '');
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
      expect(mockEventBus.publish.mock.calls.length).toBe(publishCallsBefore);
    });
    it('should close open game filter without hiding panel on Escape', () => {
      component.show();
      mockNotesService.getUniqueGames.mockReturnValue(['Game Alpha']);
      component.gameFilter.updateOptions();
      mockElements.notesGameFilter.click();
      expect(component.isVisible).toBe(true);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(component.isVisible).toBe(true);
      expect(component.gameFilter.isGameFilterOpen).toBe(false);
      expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    });
  });
  describe('dispose', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      component.initialize(mockElements);
    });
    it('should nullify references', async () => {
      const layoutDisposeSpy = vi.spyOn(component.layout, 'dispose');
      await component.dispose();
      expect(component.elements).toBeNull();
      expect(component.notesService).toBeNull();
      expect(component.eventBus).toBeNull();
      expect(component.logger).toBeNull();
      expect(layoutDisposeSpy).toHaveBeenCalled();
    });
    it('should reset state', async () => {
      component.currentNoteId = 'note_1';
      component.isVisible = true;
      await component.dispose();
      expect(component.currentNoteId).toBeNull();
      expect(component.isVisible).toBe(false);
    });
    it('should unsubscribe from events', async () => {
      const unsubscribeMocks = mockEventBus.subscribe.mock.results
        .map(result => result.value)
        .filter(unsubscribe => typeof unsubscribe === 'function');
      await component.dispose();
      unsubscribeMocks.forEach(unsubscribe => {
        expect(unsubscribe).toHaveBeenCalled();
      });
    });
    it('should handle unsubscribe errors gracefully', async () => {
      const errorEventBus = createEventBus();
      errorEventBus.subscribe = vi.fn(() => () => {
        throw new Error('Unsubscribe error');
      });

      const errorComponent = new NotesPanelComponent({
        notesService: mockNotesService,
        eventBus: errorEventBus,
        logger: mockLogger
      });
      errorComponent.initialize(mockElements);
      await expect(errorComponent.dispose()).resolves.not.toThrow();
      expect(mockLogger.warn).toHaveBeenCalledWith('Error unsubscribing from event', expect.any(Error));
    });
  });
  describe('Button click workflows', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });
    it('should create new note on new button click', () => {
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
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mousedown'));
      expect(mockNotesService.deleteNote).not.toHaveBeenCalled();
      vi.advanceTimersByTime(2000);
      expect(mockNotesService.deleteNote).toHaveBeenCalledWith('note_1');
    });
    it('should cancel delete if mouseup before 2 seconds', () => {
      mockNotesService.deleteNote.mockReturnValue(true);
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mousedown'));
      vi.advanceTimersByTime(1000);
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mouseup'));
      vi.advanceTimersByTime(1500);
      expect(mockNotesService.deleteNote).not.toHaveBeenCalled();
    });
    it('should cancel delete if mouse leaves button', () => {
      mockNotesService.deleteNote.mockReturnValue(true);
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mousedown'));
      vi.advanceTimersByTime(500);
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mouseleave'));
      vi.advanceTimersByTime(2000);
      expect(mockNotesService.deleteNote).not.toHaveBeenCalled();
    });
    it('should add holding class during hold', () => {
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mousedown'));
      expect(mockElements.notesDeleteBtn.classList.contains('holding')).toBe(true);
      mockElements.notesDeleteBtn.dispatchEvent(new MouseEvent('mouseup'));
      expect(mockElements.notesDeleteBtn.classList.contains('holding')).toBe(false);
    });
  });
  describe('List item click (event delegation)', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });
    it('should select clicked notes and save previous note before switching', () => {
      const note = { id: 'note_1', title: 'Test', content: 'Content' };
      mockNotesService.getNote.mockReturnValue(note);
      mockElements.notesList.innerHTML = `
        <div class="note-list-item" data-note-id="note_1">
          <div class="note-list-item-title">Test</div>
        </div>
      `;
      const listItem = mockElements.notesList.querySelector('.note-list-item');
      mockElements.notesList._triggerEvent('click', { target: listItem });
      expect(component.currentNoteId).toBe('note_1');

      component.currentNoteId = 'old_note';
      mockElements.notesGameInput.value = '';
      mockElements.notesTitleInput.value = 'Old Title';
      mockElements.notesContentArea.value = 'Old Content';
      mockElements.notesGameInput.dispatchEvent(new Event('input'));
      mockElements.notesTitleInput.dispatchEvent(new Event('input'));
      mockElements.notesContentArea.dispatchEvent(new Event('input'));
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'old_note' }, gameChanged: false });
      const newNote = { id: 'new_note', title: 'New', content: '', gameName: '' };
      mockNotesService.getNote.mockReturnValueOnce(newNote);
      mockElements.notesList.innerHTML = `
        <div class="note-list-item" data-note-id="new_note">
          <div class="note-list-item-title">New</div>
        </div>
      `;
      const nextListItem = mockElements.notesList.querySelector('.note-list-item');
      mockElements.notesList._triggerEvent('click', { target: nextListItem });
      expect(mockNotesService.updateNoteWithChangeDetection).toHaveBeenCalledWith('old_note', {
        title: 'Old Title',
        content: 'Old Content',
        gameName: ''
      });
    });
  });
  it('should reinitialize game filter lifecycle without stale open state or duplicate listeners', () => {
    const filterComponent = new GameFilterComponent({ notesService: mockNotesService, logger: mockLogger });
    const onFilterChange = vi.fn();
    const options = {
      filterButton: mockElements.notesGameFilter,
      filterLabel: mockElements.notesGameFilterLabel,
      filterMenu: mockElements.notesGameFilterMenu,
      onFilterChange
    };
    mockNotesService.getUniqueGames.mockReturnValue(['Game Alpha']);
    filterComponent.initialize(options);
    mockElements.notesGameFilter.click();
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(true);
    filterComponent.initialize(options);
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    const allGamesOption = mockElements.notesGameFilterMenu.querySelector('[data-value=""]');
    const allGamesFocusSpy = vi.spyOn(allGamesOption, 'focus');
    mockElements.notesGameFilter.click();
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(true);
    expect(allGamesFocusSpy).toHaveBeenCalledTimes(1);
    const gameOption = mockElements.notesGameFilterMenu.querySelector('[data-value="Game Alpha"]');
    onFilterChange.mockImplementation(() => {
      expect(filterComponent.isGameFilterOpen).toBe(false);
      expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    });
    gameOption.click();
    expect(onFilterChange).toHaveBeenCalledTimes(1);
    expect(onFilterChange).toHaveBeenCalledWith('Game Alpha', 'Game Alpha');
    filterComponent.dispose();
  });
  it('should support game filter keyboard toggles and option click selection', () => {
    const filterComponent = new GameFilterComponent({ notesService: mockNotesService, logger: mockLogger });
    const onFilterChange = vi.fn();
    mockNotesService.getUniqueGames.mockReturnValue(['Game Alpha', 'Game Beta']);
    filterComponent.initialize({
      filterButton: mockElements.notesGameFilter,
      filterLabel: mockElements.notesGameFilterLabel,
      filterMenu: mockElements.notesGameFilterMenu,
      onFilterChange
    });
    const allGamesOption = mockElements.notesGameFilterMenu.querySelector('[data-value=""]');
    const allGamesFocusSpy = vi.spyOn(allGamesOption, 'focus');

    mockElements.notesGameFilter.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(true);
    expect(allGamesFocusSpy).toHaveBeenCalledTimes(1);

    const betaOption = mockElements.notesGameFilterMenu.querySelector('[data-value="Game Beta"]');
    betaOption.click();
    expect(filterComponent.getCurrentFilter()).toBe('Game Beta');
    expect(mockElements.notesGameFilterLabel.textContent).toBe('Game Beta');
    expect(onFilterChange).toHaveBeenCalledWith('Game Beta', 'Game Beta');
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(false);

    const betaFocusSpy = vi.spyOn(betaOption, 'focus');
    mockElements.notesGameFilter.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(true);
    expect(betaFocusSpy).toHaveBeenCalledTimes(1);
    mockElements.notesGameFilter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    mockElements.notesGameFilter.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(true);
    expect(betaFocusSpy).toHaveBeenCalledTimes(2);
    filterComponent.dispose();
  });
  it('should clean up game filter lifecycle when reinitialized with missing elements', () => {
    const filterComponent = new GameFilterComponent({ notesService: mockNotesService, logger: mockLogger });
    mockNotesService.getUniqueGames.mockReturnValue(['Game Alpha']);
    filterComponent.initialize({
      filterButton: mockElements.notesGameFilter,
      filterLabel: mockElements.notesGameFilterLabel,
      filterMenu: mockElements.notesGameFilterMenu,
      onFilterChange: vi.fn()
    });
    mockElements.notesGameFilter.click();
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(true);
    filterComponent.initialize({ filterButton: null, filterLabel: null, filterMenu: null, onFilterChange: vi.fn() });
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    expect(filterComponent.isGameFilterOpen).toBe(false);
    mockElements.notesGameFilter.click();
    expect(mockElements.notesGameFilterMenu.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    filterComponent.dispose();
  });
  it('should clean up game autocomplete lifecycle when reinitialized with missing elements', () => {
    const autocompleteComponent = new GameAutocompleteComponent({ notesService: mockNotesService, logger: mockLogger });
    mockNotesService.getUniqueGames.mockReturnValue(['Game Alpha']);
    autocompleteComponent.initialize({
      gameInput: mockElements.notesGameInput,
      autocompleteDropdown: mockElements.notesGameAutocomplete,
      onInput: vi.fn(),
      onSelect: vi.fn(),
      onEnter: vi.fn(),
      onEscape: vi.fn(),
      onBlur: vi.fn(),
      onFocus: vi.fn()
    });
    mockElements.notesGameInput.dispatchEvent(new Event('focus'));
    expect(mockElements.notesGameAutocomplete.classList.contains(CSSClasses.VISIBLE)).toBe(true);
    autocompleteComponent.initialize({ gameInput: null, autocompleteDropdown: null });
    expect(mockElements.notesGameAutocomplete.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    mockElements.notesGameInput.dispatchEvent(new Event('focus'));
    expect(mockElements.notesGameAutocomplete.classList.contains(CSSClasses.VISIBLE)).toBe(false);
    autocompleteComponent.dispose();
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
    it('should select highlighted autocomplete suggestion with Enter', () => {
      mockNotesService.getUniqueGames.mockReturnValue(['Alpha Game', 'Beta Game']);
      mockElements.notesGameInput.value = 'Beta';
      mockElements.notesGameInput.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(150);
      mockElements.notesGameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
      mockElements.notesGameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(mockElements.notesGameInput.value).toBe('Beta Game');
      expect(mockElements.notesGameAutocomplete.classList.contains('visible')).toBe(false);
    });
    it('should hide autocomplete on Escape', () => {
      component.show();
      mockNotesService.getUniqueGames.mockReturnValue(['Alpha Game']);
      mockElements.notesGameInput.value = 'Alpha';
      mockElements.notesGameInput.dispatchEvent(new Event('input'));
      vi.advanceTimersByTime(150);
      mockElements.notesGameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(component.isVisible).toBe(true);
      expect(mockElements.notesGameAutocomplete.classList.contains('visible')).toBe(false);
      expect(mockElements.notesGameInput.getAttribute('aria-expanded')).toBe('false');
    });
    it('should schedule save on Enter key without highlighted item', () => {
      component.currentNoteId = 'note_1';
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'note_1' }, gameChanged: false });
      mockElements.notesGameInput.value = 'Custom Game';
      mockElements.notesGameInput.dispatchEvent(new Event('input'));
      mockElements.notesGameInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(mockElements.notesGameTagRow.classList.contains('editing')).toBe(false);
      vi.advanceTimersByTime(500);
      expect(mockNotesService.updateNoteWithChangeDetection).toHaveBeenCalledWith('note_1', expect.objectContaining({
        gameName: 'Custom Game'
      }));
    });
  });
  describe('Search and save handling', () => {
    beforeEach(() => {
      component.initialize(mockElements);
    });
    it('should render list with search query', () => {
      const renderSpy = vi.spyOn(component.listView, 'render');
      component._handleSearch('Alpha');
      expect(renderSpy).toHaveBeenCalledWith('Alpha');
    });
    it('should re-render list when game name changes', () => {
      component.currentNoteId = 'note_1';
      mockElements.notesGameInput.value = 'New Game';
      mockElements.notesTitleInput.value = 'Title';
      mockElements.notesContentArea.value = 'Content';
      mockNotesService.updateNoteWithChangeDetection.mockReturnValue({ note: { id: 'note_1', gameName: 'New Game' }, gameChanged: true });
      mockNotesService.searchNotes.mockReturnValue([]);
      component._saveCurrentNote();
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
  describe('Event subscription handling', () => {
    const callbackFor = (channel) => mockEventBus.subscribe.mock.calls.find(call => call[0] === channel)?.[1];

    beforeEach(() => {
      component.initialize(mockElements);
    });

    it('should handle note created event', () => {
      const noteCreatedCallback = callbackFor(EventChannels.NOTES.NOTE_CREATED);
      if (noteCreatedCallback) {
        mockNotesService.searchNotes.mockReturnValue([]);
        noteCreatedCallback({ id: 'new_note' });
        expect(mockNotesService.searchNotes).toHaveBeenCalled();
      }
    });

    it('should handle note updated event for non-selected note', () => {
      component.currentNoteId = 'note_1';
      mockNotesService.searchNotes.mockReturnValue([]);
      callbackFor(EventChannels.NOTES.NOTE_UPDATED)?.({ id: 'note_2' });
      expect(mockNotesService.searchNotes).toHaveBeenCalled();
    });

    it('should refresh normalized filter for external note updates', () => {
      component.currentNoteId = 'note_1';
      component.gameFilter.setCurrentFilter('Old Game');
      component.listView.setGameFilter('Old Game');
      mockElements.notesSearchInput.value = 'query';
      mockNotesService.getUniqueGames.mockReturnValue(['New Game']);

      callbackFor(EventChannels.NOTES.NOTE_UPDATED)?.({ id: 'note_1', gameName: 'New Game' });

      expect(component.gameFilter.getCurrentFilter()).toBe('');
      expect(component.listView.currentGameFilter).toBe('');
      expect(mockNotesService.searchNotes).toHaveBeenLastCalledWith('query', '');
    });

    it('should refresh normalized filter and recover selection for external current-note deletion', () => {
      const hiddenNote = { id: 'note_2', title: 'Hidden', gameName: 'New Game', content: '' };
      const matchingNote = { id: 'note_3', title: 'Match', gameName: 'New Game', content: '' };
      component.currentNoteId = 'note_1';
      component.gameFilter.setCurrentFilter('Old Game');
      component.listView.setGameFilter('Old Game');
      mockElements.notesSearchInput.value = 'match';
      mockNotesService.getUniqueGames.mockReturnValue(['New Game']);
      mockElements.notesSearchInput.value = 'match';
      mockNotesService.searchNotes.mockImplementation((query, gameFilter) => {
        if (gameFilter) return [];
        return query ? [matchingNote] : [hiddenNote, matchingNote];
      });
      mockNotesService.getNote.mockImplementation((id) => ({ note_2: hiddenNote, note_3: matchingNote })[id]);

      callbackFor(EventChannels.NOTES.NOTE_DELETED)?.({ id: 'note_1' });

      expect(component.gameFilter.getCurrentFilter()).toBe('');
      expect(component.listView.currentGameFilter).toBe('');
      expect(mockNotesService.searchNotes).toHaveBeenLastCalledWith('match', '');
      expect(component.currentNoteId).toBe('note_3');
    });
  });
});
