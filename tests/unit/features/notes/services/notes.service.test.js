/**
 * NotesService Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NotesService } from '@renderer/features/notes/services/notes.service.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';
import { NotesStorageKeys } from '@shared/config/storage-keys.config.js';

describe('NotesService', () => {
  let service;
  let mockEventBus;
  let mockLogger;
  let mockLoggerFactory;
  let mockStorageService;

  beforeEach(() => {
    mockStorageService = {
      store: {},
      getItem: vi.fn((key) => mockStorageService.store[key] || null),
      setItem: vi.fn((key, value) => { mockStorageService.store[key] = value; })
    };

    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };

    service = new NotesService({
      eventBus: mockEventBus,
      loggerFactory: mockLoggerFactory,
      storageService: mockStorageService
    });
  });

  afterEach(() => {
    mockStorageService.store = {};
    vi.restoreAllMocks();
  });

  describe('Constructor', () => {
    it('should create service with empty cache', () => {
      expect(service._notesCache).toBeNull();
      expect(service._cacheValid).toBe(false);
    });
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
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);

      const notes = service.getAllNotes();

      expect(notes).toHaveLength(2);
      expect(notes[0].title).toBe('Second'); // Sorted by updatedAt desc
      expect(notes[1].title).toBe('First');
    });

    it('should use cached data on subsequent calls', () => {
      const storedNotes = [{ id: 'note_1', title: 'Test', content: '', updatedAt: 1000 }];
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);

      service.getAllNotes();
      service.getAllNotes();
      service.getAllNotes();

      expect(mockStorageService.getItem).toHaveBeenCalledTimes(1);
    });

    it('should handle corrupted JSON gracefully', () => {
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = 'invalid json{';

      const notes = service.getAllNotes();

      expect(notes).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to parse notes from storage - data may be corrupted',
        expect.any(Error)
      );
    });

    it('should handle non-array JSON data', () => {
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify({ not: 'array' });

      const notes = service.getAllNotes();

      expect(notes).toEqual([]);
    });

    it('should sort notes by updatedAt descending', () => {
      const storedNotes = [
        { id: 'note_1', title: 'Old', updatedAt: 1000 },
        { id: 'note_2', title: 'New', updatedAt: 3000 },
        { id: 'note_3', title: 'Middle', updatedAt: 2000 }
      ];
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);

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
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);

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
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);
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
        NotesStorageKeys.USER_NOTES,
        expect.any(String)
      );

      const stored = JSON.parse(mockStorageService.store[NotesStorageKeys.USER_NOTES]);
      expect(stored).toHaveLength(1);
      expect(stored[0].title).toBe('Test');
    });

    it('should publish NOTE_CREATED event', () => {
      const note = service.createNote('Test', 'Content');

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.NOTES.NOTE_CREATED,
        note
      );
    });

    it('should add new note at beginning of list', () => {
      const storedNotes = [{ id: 'existing', title: 'Existing', updatedAt: 1000 }];
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);
      service._invalidateCache();

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
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);
      service._invalidateCache();
    });

    it('should update note title', () => {
      const updated = service.updateNote('note_1', { title: 'Updated Title' });

      expect(updated).not.toBeNull();
      expect(updated.title).toBe('Updated Title');
      expect(updated.content).toBe('Original Content');
    });

    it('should update note content', () => {
      const updated = service.updateNote('note_1', { content: 'Updated Content' });

      expect(updated.content).toBe('Updated Content');
    });

    it('should update updatedAt timestamp', () => {
      const beforeUpdate = Date.now();
      const updated = service.updateNote('note_1', { title: 'New' });

      expect(updated.updatedAt).toBeGreaterThanOrEqual(beforeUpdate);
    });

    it('should return null for non-existent note', () => {
      const updated = service.updateNote('non_existent', { title: 'New' });

      expect(updated).toBeNull();
      expect(mockLogger.warn).toHaveBeenCalledWith('Note not found: non_existent');
    });

    it('should persist changes to storage', () => {
      service.updateNote('note_1', { title: 'Updated' });

      const stored = JSON.parse(mockStorageService.store[NotesStorageKeys.USER_NOTES]);
      expect(stored[0].title).toBe('Updated');
    });

    it('should return null if storage fails', () => {
      mockStorageService.setItem = vi.fn(() => { throw new Error('Storage error'); });

      const updated = service.updateNote('note_1', { title: 'New' });

      expect(updated).toBeNull();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('deleteNote', () => {
    beforeEach(() => {
      const storedNotes = [
        { id: 'note_1', title: 'First', updatedAt: 1000 },
        { id: 'note_2', title: 'Second', updatedAt: 2000 }
      ];
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);
      service._invalidateCache();
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

      const stored = JSON.parse(mockStorageService.store[NotesStorageKeys.USER_NOTES]);
      expect(stored).toHaveLength(1);
      expect(stored[0].id).toBe('note_2');
    });

    it('should publish NOTE_DELETED event', () => {
      service.deleteNote('note_1');

      expect(mockEventBus.publish).toHaveBeenCalledWith(
        EventChannels.NOTES.NOTE_DELETED,
        { id: 'note_1' }
      );
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
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);
      service._invalidateCache();
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
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);
      service._invalidateCache();

      const results = service.searchNotes('tutorial');

      expect(results).toHaveLength(2);
      // Title match should come first (higher score)
      expect(results[0].title).toBe('Tutorial Guide');
    });

    it('should handle notes with missing title', () => {
      const storedNotes = [
        { id: 'note_1', content: 'Content with search term', updatedAt: 1000 }
      ];
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);
      service._invalidateCache();

      const results = service.searchNotes('search');

      expect(results).toHaveLength(1);
    });

    it('should handle notes with missing content', () => {
      const storedNotes = [
        { id: 'note_1', title: 'Search Title', updatedAt: 1000 }
      ];
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);
      service._invalidateCache();

      const results = service.searchNotes('search');

      expect(results).toHaveLength(1);
    });

    it('should handle notes with non-string title/content', () => {
      const storedNotes = [
        { id: 'note_1', title: 123, content: null, updatedAt: 1000 }
      ];
      mockStorageService.store[NotesStorageKeys.USER_NOTES] = JSON.stringify(storedNotes);
      service._invalidateCache();

      // Should not throw
      const results = service.searchNotes('test');
      expect(results).toEqual([]);
    });
  });

  describe('_fuzzyScore', () => {
    it('should return 0 for no match', () => {
      const score = service._fuzzyScore('hello world', 'xyz');

      expect(score).toBe(0);
    });

    it('should return higher score for match at start', () => {
      const scoreStart = service._fuzzyScore('hello world', 'hello');
      const scoreEnd = service._fuzzyScore('hello world', 'world');

      expect(scoreStart).toBeGreaterThan(scoreEnd);
    });

    it('should return 1 for match at index 0', () => {
      const score = service._fuzzyScore('hello', 'hello');

      expect(score).toBe(1);
    });
  });

  describe('_invalidateCache', () => {
    it('should clear cache', () => {
      service._notesCache = [{ id: 'note_1' }];
      service._cacheValid = true;

      service._invalidateCache();

      expect(service._notesCache).toBeNull();
      expect(service._cacheValid).toBe(false);
    });
  });

  describe('_saveNotes', () => {
    it('should save and update cache', () => {
      const notes = [{ id: 'note_1', title: 'Test', updatedAt: 1000 }];

      const result = service._saveNotes(notes);

      expect(result).toBe(true);
      expect(service._cacheValid).toBe(true);
      expect(service._notesCache).toEqual(notes);
    });

    it('should sort cache by updatedAt', () => {
      const notes = [
        { id: 'note_1', title: 'Old', updatedAt: 1000 },
        { id: 'note_2', title: 'New', updatedAt: 2000 }
      ];

      service._saveNotes(notes);

      expect(service._notesCache[0].title).toBe('New');
      expect(service._notesCache[1].title).toBe('Old');
    });

    it('should handle storage errors', () => {
      mockStorageService.setItem = vi.fn(() => { throw new Error('Storage full'); });

      const result = service._saveNotes([{ id: 'note_1' }]);

      expect(result).toBe(false);
      expect(service._cacheValid).toBe(false);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to save notes to storage',
        expect.any(Error)
      );
    });

    it('should handle null storageService', () => {
      service.storageService = null;

      const result = service._saveNotes([{ id: 'note_1' }]);

      expect(result).toBe(true);
    });
  });
});
