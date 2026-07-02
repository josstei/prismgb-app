import { BaseService, generateEntityId } from '@prismgb/core';
import type { LoggerFactoryLike, StorageServiceLike } from '@prismgb/core';
import { EventChannels } from '@prismgb/events';
import type { IEventBus as EventBusLike } from '@prismgb/events';

const NotesStorageKeys = {
  USER_NOTES: 'userNotes' as const
};

interface UserNote {
  id: string;
  gameName: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

type NoteUpdates = Partial<Pick<UserNote, 'title' | 'content' | 'gameName'>>;


type NotesServiceDependencies = {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
  storageService: StorageServiceLike;
};

class NotesService extends BaseService {
  private readonly eventBus: EventBusLike;
  private readonly storageService: StorageServiceLike;
  _notesCache: UserNote[] | null;
  _cacheValid: boolean;

  constructor(dependencies: NotesServiceDependencies) {
    super(dependencies, 'NotesService');

    this.eventBus = dependencies.eventBus;
    this.storageService = dependencies.storageService;
    this._notesCache = null;
    this._cacheValid = false;
  }

  _invalidateCache() {
    this._notesCache = null;
    this._cacheValid = false;
  }

  getAllNotes(): UserNote[] {
    if (this._cacheValid && this._notesCache !== null) {
      return this._notesCache;
    }

    const raw = this.storageService.getItem(NotesStorageKeys.USER_NOTES);
    if (!raw) {
      this._notesCache = [];
      this._cacheValid = true;
      return this._notesCache;
    }

    try {
      const notes = JSON.parse(raw) as unknown;
      this._notesCache = Array.isArray(notes)
        ? (notes as UserNote[]).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        : [];
      this._cacheValid = true;
      return this._notesCache;
    } catch (error) {
      this.logger.error('Failed to parse notes from storage - data may be corrupted', error);
      this._notesCache = [];
      this._cacheValid = true;
      return this._notesCache;
    }
  }

  getNote(id: string): UserNote | null {
    const notes = this.getAllNotes();
    return notes.find(note => note.id === id) || null;
  }

  createNote(title = '', content = '', gameName = '') {
    const now = Date.now();
    const note = {
      id: generateEntityId('note'),
      gameName: gameName || '',
      title: title || 'Untitled Note',
      content,
      createdAt: now,
      updatedAt: now
    };

    const notes = this.getAllNotes();
    notes.unshift(note);

    if (!this._saveNotes(notes)) {
      this.logger.error('Failed to create note - storage error');
      return null;
    }

    this.logger.debug(`Created note: ${note.id}`);
    this.eventBus.publish(EventChannels.NOTES.NOTE_CREATED, note);

    return note;
  }

  updateNote(id: string, updates: NoteUpdates): UserNote | null {
    const notes = this.getAllNotes();
    const index = notes.findIndex(note => note.id === id);

    if (index === -1) {
      this.logger.warn(`Note not found: ${id}`);
      return null;
    }

    const updatedNote = {
      ...notes[index],
      ...updates,
      updatedAt: Date.now()
    };

    notes[index] = updatedNote;

    if (!this._saveNotes(notes)) {
      this.logger.error(`Failed to update note: ${id} - storage error`);
      return null;
    }

    this.logger.debug(`Updated note: ${id}`);
    this.eventBus.publish(EventChannels.NOTES.NOTE_UPDATED, updatedNote);

    return updatedNote;
  }

  updateNoteWithChangeDetection(id: string, updates: NoteUpdates): { note: UserNote; gameChanged: boolean } | null {
    const oldNote = this.getNote(id);
    if (!oldNote) {
      this.logger.warn(`Note not found for change detection: ${id}`);
      return null;
    }

    const oldGameName = oldNote.gameName || '';
    const newGameName = updates.gameName ?? oldGameName;
    const gameChanged = oldGameName !== newGameName;

    const updatedNote = this.updateNote(id, updates);
    if (!updatedNote) {
      return null;
    }

    return {
      note: updatedNote,
      gameChanged
    };
  }

  deleteNote(id: string): boolean {
    const notes = this.getAllNotes();
    const index = notes.findIndex(note => note.id === id);

    if (index === -1) {
      this.logger.warn(`Note not found for deletion: ${id}`);
      return false;
    }

    notes.splice(index, 1);

    if (!this._saveNotes(notes)) {
      this.logger.error(`Failed to delete note: ${id} - storage error`);
      return false;
    }

    this.logger.debug(`Deleted note: ${id}`);
    this.eventBus.publish(EventChannels.NOTES.NOTE_DELETED, { id });

    return true;
  }

  searchNotes(query: string, gameFilter = ''): UserNote[] {
    const allNotes = this.getAllNotes();

    // Early return for empty query
    if (!query || query.trim().length === 0) {
      // Filter by game if needed, otherwise return cached array directly
      if (gameFilter) {
        return allNotes.filter(note => (note.gameName || '') === gameFilter);
      }
      return allNotes;
    }

    const normalizedQuery = query.toLowerCase().trim();

    // Single pass: filter, score, and collect results in one loop
    // This reduces from 4 intermediate arrays to 1
    const scoredResults: Array<{ note: UserNote; score: number }> = [];
    for (const note of allNotes) {
      // Skip if game filter doesn't match
      if (gameFilter && (note.gameName || '') !== gameFilter) {
        continue;
      }

      // Guard against corrupted notes with missing/non-string fields
      const title = typeof note.title === 'string' ? note.title : '';
      const content = typeof note.content === 'string' ? note.content : '';
      const gameName = typeof note.gameName === 'string' ? note.gameName : '';

      const titleScore = this._fuzzyScore(title.toLowerCase(), normalizedQuery);
      const contentScore = this._fuzzyScore(content.toLowerCase(), normalizedQuery) * 0.5;
      const gameScore = this._fuzzyScore(gameName.toLowerCase(), normalizedQuery) * 0.7;
      const score = Math.max(titleScore, contentScore, gameScore);

      // Only add if score > 0 (skip the filter step)
      if (score > 0) {
        scoredResults.push({ note, score });
      }
    }

    // Sort and extract notes in single pass
    scoredResults.sort((a, b) => b.score - a.score);

    // Map to final array
    const results = new Array(scoredResults.length);
    for (let i = 0; i < scoredResults.length; i++) {
      results[i] = scoredResults[i].note;
    }

    return results;
  }

  getUniqueGames(): string[] {
    const notes = this.getAllNotes();
    const games = new Set<string>();

    for (const note of notes) {
      if (note.gameName && typeof note.gameName === 'string') {
        games.add(note.gameName);
      }
    }

    return [...games].sort((a, b) => a.localeCompare(b));
  }

  getNotesGroupedByGame(): Record<string, UserNote[]> {
    const notes = this.getAllNotes();
    const groups: Record<string, UserNote[]> = {};

    for (const note of notes) {
      const gameName = note.gameName || '';
      if (!groups[gameName]) {
        groups[gameName] = [];
      }
      groups[gameName].push(note);
    }

    return groups;
  }

  _fuzzyScore(text: string, query: string): number {
    const index = text.indexOf(query);
    if (index === -1) return 0;

    return 1 - (index / text.length) * 0.5;
  }

  _saveNotes(notes: UserNote[]): boolean {
    if (!this.storageService) {
      this._notesCache = [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      this._cacheValid = true;
      return true;
    }
    try {
      if (!this.storageService.setItem(NotesStorageKeys.USER_NOTES, JSON.stringify(notes))) {
        this.logger.error('Storage rejected notes save');
        this._invalidateCache();
        return false;
      }
      this._notesCache = [...notes].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      this._cacheValid = true;
      return true;
    } catch (error) {
      this.logger.error('Failed to save notes to storage', error);
      this._invalidateCache();
      return false;
    }
  }
}

export { NotesService };
export type { UserNote, NoteUpdates, NotesServiceDependencies, StorageServiceLike };
