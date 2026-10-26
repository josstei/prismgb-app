import { BaseService, generateEntityId } from '@platform/core';
import type { LoggerFactoryLike, StorageServiceLike } from '@platform/core';
import { EventChannels, type TypedEventBusLike } from '@platform/events';

import { NotesStorageKeys, readStoredNote, type UserNote, type NoteUpdates } from './notes.types.js';

type NotesServiceDependencies = {
  eventBus: Pick<TypedEventBusLike, 'publish'>;
  loggerFactory: LoggerFactoryLike;
  storageService: StorageServiceLike;
};

class NotesService extends BaseService {
  private readonly eventBus: Pick<TypedEventBusLike, 'publish'>;
  private readonly storageService: StorageServiceLike;
  _notesCache: UserNote[] | null;

  constructor(dependencies: NotesServiceDependencies) {
    super({ loggerFactory: dependencies.loggerFactory }, 'NotesService');

    this.eventBus = dependencies.eventBus;
    this.storageService = dependencies.storageService;
    this._notesCache = null;
  }

  getAllNotes(): UserNote[] {
    if (this._notesCache !== null) {
      return this._notesCache;
    }

    const raw = this.storageService.getItem(NotesStorageKeys.USER_NOTES);
    if (!raw) {
      this._notesCache = [];
      return this._notesCache;
    }

    try {
      const notes = JSON.parse(raw) as unknown;
      this._notesCache = Array.isArray(notes)
        ? notes.map(readStoredNote).filter((note): note is UserNote => note !== null).sort((a, b) => b.updatedAt - a.updatedAt)
        : [];
      return this._notesCache;
    } catch (error) {
      this.logger.error('Failed to parse notes from storage - data may be corrupted', error);
      this._notesCache = [];
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

    const notes = [note, ...this.getAllNotes()];

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

    if (!this._saveNotes(notes.map((note, noteIndex) => noteIndex === index ? updatedNote : note))) {
      this.logger.error(`Failed to update note: ${id} - storage error`);
      return null;
    }

    this.logger.debug(`Updated note: ${id}`);
    this.eventBus.publish(EventChannels.NOTES.NOTE_UPDATED, updatedNote);

    return updatedNote;
  }

  deleteNote(id: string): boolean {
    const notes = this.getAllNotes();
    const index = notes.findIndex(note => note.id === id);

    if (index === -1) {
      this.logger.warn(`Note not found for deletion: ${id}`);
      return false;
    }

    if (!this._saveNotes(notes.filter((_, noteIndex) => noteIndex !== index))) {
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
        return allNotes.filter(note => note.gameName === gameFilter);
      }
      return allNotes;
    }

    const normalizedQuery = query.toLowerCase().trim();

    // Single pass: filter, score, and collect results in one loop
    // This reduces from 4 intermediate arrays to 1
    const scoredResults: Array<{ note: UserNote; score: number }> = [];
    for (const note of allNotes) {
      // Skip if game filter doesn't match
      if (gameFilter && note.gameName !== gameFilter) {
        continue;
      }

      const titleScore = this._fuzzyScore(note.title.toLowerCase(), normalizedQuery);
      const contentScore = this._fuzzyScore(note.content.toLowerCase(), normalizedQuery) * 0.5;
      const gameScore = this._fuzzyScore(note.gameName.toLowerCase(), normalizedQuery) * 0.7;
      const score = Math.max(titleScore, contentScore, gameScore);

      // Only add if score > 0 (skip the filter step)
      if (score > 0) {
        scoredResults.push({ note, score });
      }
    }

    // Sort and extract notes in single pass
    scoredResults.sort((a, b) => b.score - a.score);

    return scoredResults.map(({ note }) => note);
  }

  getUniqueGames(): string[] {
    const notes = this.getAllNotes();
    const games = new Set<string>();

    for (const note of notes) {
      if (note.gameName) {
        games.add(note.gameName);
      }
    }

    return [...games].sort((a, b) => a.localeCompare(b));
  }

  _fuzzyScore(text: string, query: string): number {
    const index = text.indexOf(query);
    if (index === -1) return 0;

    return 1 - (index / text.length) * 0.5;
  }

  _saveNotes(notes: UserNote[]): boolean {
    try {
      if (!this.storageService.setItem(NotesStorageKeys.USER_NOTES, JSON.stringify(notes))) {
        this.logger.error('Storage rejected notes save');
        return false;
      }
      this._notesCache = [...notes].sort((a, b) => b.updatedAt - a.updatedAt);
      return true;
    } catch (error) {
      this.logger.error('Failed to save notes to storage', error);
      return false;
    }
  }
}

export { NotesService };
export type { NotesServiceDependencies };
