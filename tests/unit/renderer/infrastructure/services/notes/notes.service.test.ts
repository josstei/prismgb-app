import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NotesService } from '@renderer/infrastructure/services/notes/notes.service';
import { NOTES_STORAGE_KEY } from '@renderer/lib/storage-keys.config';
import { createLoggerFactory, createStorageService } from '../../../../../factories/index.js';

describe('NotesService', () => {
  let service;
  let mockLogger;
  let mockLoggerFactory;
  let mockStorageService;

  function setStoredNotes(notes) {
    mockStorageService.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes));
  }

  function setStoredNotesRaw(rawNotes) {
    mockStorageService.setItem(NOTES_STORAGE_KEY, rawNotes);
  }

  function getStoredNotes() {
    return JSON.parse(mockStorageService.getItem(NOTES_STORAGE_KEY));
  }

  beforeEach(() => {
    mockStorageService = createStorageService();
    mockLoggerFactory = createLoggerFactory();

    service = new NotesService(mockStorageService, mockLoggerFactory);
    mockLogger = mockLoggerFactory._getLogger('NotesService');
  });

  describe('getAllNotes', () => {
    it('should return empty array when no notes exist', () => {
      const notes = service.getAllNotes();
      expect(notes).toEqual([]);
    });

    it('should return notes from storage', () => {
      const storedNotes = [
        { id: 'note_1', title: 'First', content: 'Content 1', updatedAt: 1000 },
        { id: 'note_2', title: 'Second', content: 'Content 2', updatedAt: 2000 }
      ];
      setStoredNotes(storedNotes);

      const notes = service.getAllNotes();

      expect(notes).toHaveLength(2);
      expect(notes[0].title).toBe('Second'); // Sorted by updatedAt desc
      expect(notes[1].title).toBe('First');
    });

    it('should use cached data on subsequent calls', () => {
      const storedNotes = [{ id: 'note_1', title: 'Test', content: '', updatedAt: 1000 }];
      setStoredNotes(storedNotes);

      service.getAllNotes();
      service.getAllNotes();
      service.getAllNotes();

      expect(mockStorageService.getItem).toHaveBeenCalledTimes(1);
    });

    it('should handle corrupted JSON gracefully', () => {
      setStoredNotesRaw('invalid json{');

      const notes = service.getAllNotes();

      expect(notes).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse notes from storage - data may be corrupted',
        expect.any(Error)
      );
    });

    it('should handle non-array JSON data', () => {
      setStoredNotesRaw(JSON.stringify({ not: 'array' }));

      const notes = service.getAllNotes();

      expect(notes).toEqual([]);
    });

    it('should sort notes by updatedAt descending', () => {
      const storedNotes = [
        { id: 'note_1', title: 'Old', updatedAt: 1000 },
        { id: 'note_2', title: 'New', updatedAt: 3000 },
        { id: 'note_3', title: 'Middle', updatedAt: 2000 }
      ];
      setStoredNotes(storedNotes);

      const notes = service.getAllNotes();

      expect(notes[0].title).toBe('New');
      expect(notes[1].title).toBe('Middle');
      expect(notes[2].title).toBe('Old');
    });

    it('should handle notes without updatedAt', () => {
      const storedNotes = [
        { id: 'note_1', title: 'No date' },
        { id: 'note_2', title: 'Has date', updatedAt: 1000 }
      ];
      setStoredNotes(storedNotes);

      const notes = service.getAllNotes();

      expect(notes).toHaveLength(2);
    });
  });

  describe('getNote', () => {
    beforeEach(() => {
      const storedNotes = [
        { id: 'note_1', title: 'First', content: 'Content 1' },
        { id: 'note_2', title: 'Second', content: 'Content 2' }
      ];
      setStoredNotes(storedNotes);
    });

    it('should return note by id', () => {
      const note = service.getNote('note_1');

      expect(note).not.toBeNull();
      expect(note.title).toBe('First');
    });

    it('should return null for non-existent note', () => {
      const note = service.getNote('non_existent');

      expect(note).toBeNull();
    });
  });

  describe('createNote', () => {
    it('should create note with default title', () => {
      const note = service.createNote();

      expect(note).not.toBeNull();
      expect(note.title).toBe('Untitled Note');
      expect(note.content).toBe('');
      expect(note.id).toMatch(/^note_/);
      expect(note.createdAt).toBeDefined();
      expect(note.updatedAt).toBeDefined();
    });

    it('should generate persisted ids as note_<timestamp>_<base36 suffix>', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
        const note = service.createNote();

        expect(note.id).toMatch(/^note_\d+_[a-z0-9]{1,7}$/);
        expect(note.id.startsWith(`note_${Date.now()}_`)).toBe(true);
      } finally {
        vi.useRealTimers();
      }
    });

    it('should generate unique ids', () => {
      const ids = new Set(Array.from({ length: 50 }, () => service.createNote().id));

      expect(ids.size).toBe(50);
    });

    it('should create note with provided title and content', () => {
      const note = service.createNote('My Title', 'My Content');

      expect(note.title).toBe('My Title');
      expect(note.content).toBe('My Content');
    });

    it('should use default title when empty string provided', () => {
      const note = service.createNote('', 'Content');

      expect(note.title).toBe('Untitled Note');
    });

    it('should persist note to storage', () => {
      service.createNote('Test', 'Content');

      expect(mockStorageService.setItem).toHaveBeenCalledWith(
        NOTES_STORAGE_KEY,
        expect.any(String)
      );

      const stored = getStoredNotes();
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe('Test');
    });

    it('should add new note at beginning of list', () => {
      const storedNotes = [{ id: 'existing', title: 'Existing', updatedAt: 1000 }];
      setStoredNotes(storedNotes);

      service.createNote('New Note');

      const notes = service.getAllNotes();
      expect(notes[0].title).toBe('New Note');
    });

    it('should return null if storage fails', () => {
      mockStorageService.setItem = vi.fn(() => { throw new Error('Storage full'); });

      const note = service.createNote('Test');

      expect(note).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('updateNote', () => {
    beforeEach(() => {
      const storedNotes = [
        { id: 'note_1', title: 'Original', content: 'Original Content', updatedAt: 1000 }
      ];
      setStoredNotes(storedNotes);
    });

    it('should update note title', () => {
      const result = service.updateNote('note_1', { title: 'Updated Title' });

      expect(result).not.toBeNull();
      expect(result.note.title).toBe('Updated Title');
      expect(result.note.content).toBe('Original Content');
    });

    it('should update note content', () => {
      const result = service.updateNote('note_1', { content: 'Updated Content' });

      expect(result.note.content).toBe('Updated Content');
    });

    it('should update updatedAt timestamp', () => {
      const beforeUpdate = Date.now();
      const result = service.updateNote('note_1', { title: 'New' });

      expect(result.note.updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
    });

    it('should report no game change when gameName is omitted or unchanged', () => {
      expect(service.updateNote('note_1', { title: 'New' }).gameChanged).toBe(false);
      expect(service.updateNote('note_1', { gameName: '' }).gameChanged).toBe(false);
    });

    it('should report a game change when gameName differs', () => {
      const result = service.updateNote('note_1', { gameName: 'Zelda' });

      expect(result.gameChanged).toBe(true);
      expect(result.note.gameName).toBe('Zelda');
      expect(service.updateNote('note_1', { gameName: 'Zelda' }).gameChanged).toBe(false);
    });

    it('should return null for non-existent note', () => {
      const updated = service.updateNote('non_existent', { title: 'New' });

      expect(updated).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Note not found: non_existent');
    });

    it('should persist changes to storage', () => {
      service.updateNote('note_1', { title: 'Updated' });

      const stored = getStoredNotes();
      expect(stored[0].title).toBe('Updated');
    });

    it('should return null if storage fails', () => {
      mockStorageService.setItem = vi.fn(() => { throw new Error('Storage error'); });

      const updated = service.updateNote('note_1', { title: 'New' });

      expect(updated).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to save notes to storage', expect.any(Error));
      expect(mockLogger.error).toHaveBeenCalledWith('Failed to update note: note_1 - storage error');
    });

    it('should return null and reload from storage when storage rejects the save', () => {
      service.getAllNotes();
      mockStorageService.setItem = vi.fn(() => false);

      const updated = service.updateNote('note_1', { title: 'New' });

      expect(updated).toBeNull();
      expect(mockLogger.error).toHaveBeenCalledWith('Storage rejected notes save');
      expect(service.getNote('note_1').title).toBe('Original');
      expect(mockStorageService.getItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('deleteNote', () => {
    beforeEach(() => {
      const storedNotes = [
        { id: 'note_1', title: 'First', updatedAt: 1000 },
        { id: 'note_2', title: 'Second', updatedAt: 2000 }
      ];
      setStoredNotes(storedNotes);
    });

    it('should delete existing note', () => {
      const result = service.deleteNote('note_1');

      expect(result).toBe(true);
      const notes = service.getAllNotes();
      expect(notes).toHaveLength(1);
      expect(notes[0].id).toBe('note_2');
    });

    it('should return false for non-existent note', () => {
      const result = service.deleteNote('non_existent');

      expect(result).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith('Note not found for deletion: non_existent');
    });

    it('should persist deletion to storage', () => {
      service.deleteNote('note_1');

      const stored = getStoredNotes();
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('note_2');
    });

    it('should return false if storage fails', () => {
      mockStorageService.setItem = vi.fn(() => { throw new Error('Storage error'); });

      const result = service.deleteNote('note_1');

      expect(result).toBe(false);
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('searchNotes', () => {
    beforeEach(() => {
      const storedNotes = [
        { id: 'note_1', title: 'JavaScript Tutorial', content: 'Learn JS basics', updatedAt: 3000 },
        { id: 'note_2', title: 'Python Guide', content: 'Python programming', updatedAt: 2000 },
        { id: 'note_3', title: 'CSS Styling', content: 'CSS tutorial and tips', updatedAt: 1000 }
      ];
      setStoredNotes(storedNotes);
    });

    it('should return all notes for empty query', () => {
      const results = service.searchNotes('');

      expect(results).toHaveLength(3);
    });

    it('should return all notes for whitespace query', () => {
      const results = service.searchNotes('   ');

      expect(results).toHaveLength(3);
    });

    it('should return all notes for null query', () => {
      const results = service.searchNotes(null);

      expect(results).toHaveLength(3);
    });

    it('should find notes by title match', () => {
      const results = service.searchNotes('JavaScript');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('JavaScript Tutorial');
    });

    it('should find notes by content match', () => {
      const results = service.searchNotes('programming');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Python Guide');
    });

    it('should be case insensitive', () => {
      const results = service.searchNotes('PYTHON');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Python Guide');
    });

    it('should find partial matches', () => {
      const results = service.searchNotes('tutorial');

      expect(results).toHaveLength(2); // JavaScript Tutorial and CSS tutorial
    });

    it('should return empty array for no matches', () => {
      const results = service.searchNotes('nonexistent');

      expect(results).toEqual([]);
    });

    it('should prioritize title matches over content matches', () => {
      // Add a note where 'tutorial' is in title (higher priority) vs content
      const storedNotes = [
        { id: 'note_1', title: 'Tutorial Guide', content: 'Some content', updatedAt: 1000 },
        { id: 'note_2', title: 'Other Note', content: 'This is a tutorial', updatedAt: 2000 }
      ];
      setStoredNotes(storedNotes);

      const results = service.searchNotes('tutorial');

      expect(results).toHaveLength(2);
      // Title match should come first (higher score)
      expect(results[0].title).toBe('Tutorial Guide');
    });

    it('should handle notes with missing title', () => {
      const storedNotes = [
        { id: 'note_1', content: 'Content with search term', updatedAt: 1000 }
      ];
      setStoredNotes(storedNotes);

      const results = service.searchNotes('search');

      expect(results).toHaveLength(1);
    });

    it('should handle notes with missing content', () => {
      const storedNotes = [
        { id: 'note_1', title: 'Search Title', updatedAt: 1000 }
      ];
      setStoredNotes(storedNotes);

      const results = service.searchNotes('search');

      expect(results).toHaveLength(1);
    });

    it('should handle notes with non-string title/content', () => {
      const storedNotes = [
        { id: 'note_1', title: 123, content: null, updatedAt: 1000 }
      ];
      setStoredNotes(storedNotes);

      // Should not throw
      const results = service.searchNotes('test');
      expect(results).toEqual([]);
    });
  });

  describe('search ranking', () => {
    it('should rank an earlier match above a later one in the same field', () => {
      setStoredNotes([
        { id: 'late', title: 'hello world', updatedAt: 2000 },
        { id: 'early', title: 'world hello', updatedAt: 1000 }
      ]);

      expect(service.searchNotes('world').map((note) => note.id)).toEqual(['early', 'late']);
    });

    it('should weight game matches above content matches', () => {
      setStoredNotes([
        { id: 'content', title: 'A', content: 'zelda', gameName: '', updatedAt: 2000 },
        { id: 'game', title: 'B', content: '', gameName: 'zelda', updatedAt: 1000 }
      ]);

      expect(service.searchNotes('zelda').map((note) => note.id)).toEqual(['game', 'content']);
    });

    it('should restrict results to the game filter', () => {
      setStoredNotes([
        { id: 'zelda', title: 'Boss notes', gameName: 'Zelda', updatedAt: 2000 },
        { id: 'pokemon', title: 'Boss notes', gameName: 'Pokemon', updatedAt: 1000 }
      ]);

      expect(service.searchNotes('boss', 'Zelda').map((note) => note.id)).toEqual(['zelda']);
      expect(service.searchNotes('', 'Pokemon').map((note) => note.id)).toEqual(['pokemon']);
    });
  });

  describe('cache', () => {
    it('should serve writes from the cache sorted by updatedAt', () => {
      setStoredNotes([{ id: 'note_1', title: 'Old', updatedAt: 1000 }]);
      service.getAllNotes();

      vi.useFakeTimers();
      try {
        vi.setSystemTime(5000);
        service.createNote('New');
      } finally {
        vi.useRealTimers();
      }

      expect(service.getAllNotes().map((note) => note.title)).toEqual(['New', 'Old']);
      expect(mockStorageService.getItem).toHaveBeenCalledTimes(1);
    });

    it('should persist the JSON array in its existing order and field layout', () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(1234);
        const note = service.createNote('Title', 'Body', 'Game');

        expect(mockStorageService.setItem).toHaveBeenLastCalledWith(
          'userNotes',
          JSON.stringify([{ id: note.id, gameName: 'Game', title: 'Title', content: 'Body', createdAt: 1234, updatedAt: 1234 }])
        );
      } finally {
        vi.useRealTimers();
      }
    });

    it('should reload from storage after a failed save', () => {
      setStoredNotes([{ id: 'note_1', title: 'Stored', updatedAt: 1000 }]);
      service.getAllNotes();
      mockStorageService.setItem = vi.fn(() => { throw new Error('Storage full'); });

      expect(service.createNote('Lost')).toBeNull();
      expect(service.getAllNotes().map((note) => note.title)).toEqual(['Stored']);
      expect(mockStorageService.getItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('getUniqueGames', () => {
    it('should return empty array when no notes exist', () => {
      const games = service.getUniqueGames();
      expect(games).toEqual([]);
    });

    it('should return sorted unique game names', () => {
      const storedNotes = [
        { id: 'note_1', gameName: 'Zelda', updatedAt: 1000 },
        { id: 'note_2', gameName: 'Pokemon', updatedAt: 2000 },
        { id: 'note_3', gameName: 'Zelda', updatedAt: 3000 },
        { id: 'note_4', gameName: '', updatedAt: 4000 }
      ];
      setStoredNotes(storedNotes);

      const games = service.getUniqueGames();

      expect(games).toEqual(['Pokemon', 'Zelda']);
    });
  });
});
