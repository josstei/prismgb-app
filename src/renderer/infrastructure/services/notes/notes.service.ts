import { injectable, inject } from 'inversify';
import { BaseService } from '@platform/core';
import type { LoggerFactory, KeyValueStore } from '@platform/core';
import { NOTES_STORAGE_KEY } from '@renderer/lib/storage-keys.config';
import { TOKENS } from '@renderer/application/di/tokens';

interface UserNote {
  id: string;
  gameName: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

type NoteUpdates = Partial<Pick<UserNote, 'title' | 'content' | 'gameName'>>;

const byUpdatedDesc = (a: UserNote, b: UserNote): number => (b.updatedAt || 0) - (a.updatedAt || 0);

function fuzzyScore(text: string, query: string): number {
  const index = text.indexOf(query);
  if (index === -1) return 0;

  return 1 - (index / text.length) * 0.5;
}

@injectable()
export class NotesService extends BaseService {
  private cache: UserNote[] | null = null;

  constructor(
    @inject(TOKENS.storageService) private readonly storageService: KeyValueStore,
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactory
  ) {
    super(loggerFactory, 'NotesService');
  }

  getAllNotes(): UserNote[] {
    if (this.cache !== null) {
      return this.cache;
    }

    const raw = this.storageService.getItem(NOTES_STORAGE_KEY);
    if (!raw) {
      this.cache = [];
      return this.cache;
    }

    try {
      const notes = JSON.parse(raw) as unknown;
      this.cache = Array.isArray(notes) ? (notes as UserNote[]).sort(byUpdatedDesc) : [];
    } catch (error) {
      this.logger.error('Failed to parse notes from storage - data may be corrupted', error);
      this.cache = [];
    }
    return this.cache;
  }

  getNote(id: string): UserNote | null {
    return this.getAllNotes().find(note => note.id === id) || null;
  }

  createNote(title = '', content = '', gameName = ''): UserNote | null {
    const now = Date.now();
    const note: UserNote = {
      id: this.createNoteId(),
      gameName: gameName || '',
      title: title || 'Untitled Note',
      content,
      createdAt: now,
      updatedAt: now
    };

    const notes = this.getAllNotes();
    notes.unshift(note);

    if (!this.saveNotes(notes)) {
      this.logger.error('Failed to create note - storage error');
      return null;
    }

    this.logger.debug(`Created note: ${note.id}`);

    return note;
  }

  updateNote(id: string, updates: NoteUpdates): { note: UserNote; gameChanged: boolean } | null {
    const notes = this.getAllNotes();
    const index = notes.findIndex(note => note.id === id);

    if (index === -1) {
      this.logger.warn(`Note not found: ${id}`);
      return null;
    }

    const previous = notes[index];
    const previousGameName = previous.gameName || '';
    const gameChanged = previousGameName !== (updates.gameName ?? previousGameName);
    const note = {
      ...previous,
      ...updates,
      updatedAt: Date.now()
    };

    notes[index] = note;

    if (!this.saveNotes(notes)) {
      this.logger.error(`Failed to update note: ${id} - storage error`);
      return null;
    }

    this.logger.debug(`Updated note: ${id}`);

    return { note, gameChanged };
  }

  deleteNote(id: string): boolean {
    const notes = this.getAllNotes();
    const index = notes.findIndex(note => note.id === id);

    if (index === -1) {
      this.logger.warn(`Note not found for deletion: ${id}`);
      return false;
    }

    notes.splice(index, 1);

    if (!this.saveNotes(notes)) {
      this.logger.error(`Failed to delete note: ${id} - storage error`);
      return false;
    }

    this.logger.debug(`Deleted note: ${id}`);

    return true;
  }

  searchNotes(query: string, gameFilter = ''): UserNote[] {
    const allNotes = this.getAllNotes();

    if (!query || query.trim().length === 0) {
      return gameFilter ? allNotes.filter(note => (note.gameName || '') === gameFilter) : allNotes;
    }

    const normalizedQuery = query.toLowerCase().trim();
    const scored: Array<{ note: UserNote; score: number }> = [];
    for (const note of allNotes) {
      if (gameFilter && (note.gameName || '') !== gameFilter) {
        continue;
      }

      // Stored notes are user data and may be corrupted, so fields are type-checked before matching.
      const title = typeof note.title === 'string' ? note.title : '';
      const content = typeof note.content === 'string' ? note.content : '';
      const gameName = typeof note.gameName === 'string' ? note.gameName : '';

      const score = Math.max(
        fuzzyScore(title.toLowerCase(), normalizedQuery),
        fuzzyScore(content.toLowerCase(), normalizedQuery) * 0.5,
        fuzzyScore(gameName.toLowerCase(), normalizedQuery) * 0.7
      );

      if (score > 0) {
        scored.push({ note, score });
      }
    }

    return scored.sort((a, b) => b.score - a.score).map(result => result.note);
  }

  getUniqueGames(): string[] {
    const games = new Set<string>();

    for (const note of this.getAllNotes()) {
      if (note.gameName && typeof note.gameName === 'string') {
        games.add(note.gameName);
      }
    }

    return [...games].sort((a, b) => a.localeCompare(b));
  }

  private createNoteId(): string {
    return `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  private saveNotes(notes: UserNote[]): boolean {
    try {
      if (!this.storageService.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))) {
        this.logger.error('Storage rejected notes save');
        this.cache = null;
        return false;
      }
      this.cache = [...notes].sort(byUpdatedDesc);
      return true;
    } catch (error) {
      this.logger.error('Failed to save notes to storage', error);
      this.cache = null;
      return false;
    }
  }
}
