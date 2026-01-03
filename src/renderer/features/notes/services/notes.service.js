/**
 * Notes Service
 *
 * Manages CRUD operations for user notes with localStorage persistence.
 * Provides fuzzy search across note titles and content.
 *
 * Events emitted:
 * - 'notes:note-created' - New note created
 * - 'notes:note-updated' - Note content/title updated
 * - 'notes:note-deleted' - Note deleted
 */

import { BaseService } from '@shared/base/service.base.js';
import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';
import { generateEntityId } from '@shared/utils/string.utils.js';
import { NotesStorageKeys } from '@shared/config/storage-keys.config.js';

class NotesService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'storageService'], 'NotesService');

    // In-memory cache to avoid redundant JSON parsing
    this._notesCache = null;
    this._cacheValid = false;
  }

  /**
   * Invalidate the in-memory cache
   * @private
   */
  _invalidateCache() {
    this._notesCache = null;
    this._cacheValid = false;
  }

  /**
   * Get all notes from storage (with caching)
   * @returns {Array<Object>} Array of note objects sorted by updatedAt (newest first)
   */
  getAllNotes() {
    // Return cached data if valid
    if (this._cacheValid && this._notesCache !== null) {
      return this._notesCache;
    }

    const raw = this.storageService?.getItem(NotesStorageKeys.USER_NOTES);
    if (!raw) {
      this._notesCache = [];
      this._cacheValid = true;
      return this._notesCache;
    }

    try {
      const notes = JSON.parse(raw);
      this._notesCache = Array.isArray(notes)
        ? notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
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

  /**
   * Get a single note by ID
   * @param {string} id - Note ID
   * @returns {Object|null} Note object or null if not found
   */
  getNote(id) {
    const notes = this.getAllNotes();
    return notes.find(note => note.id === id) || null;
  }

  /**
   * Create a new note
   * @param {string} [title=''] - Note title
   * @param {string} [content=''] - Note content
   * @param {string} [gameName=''] - Game name for organization
   * @returns {Object|null} Created note object, or null if save failed
   */
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

  /**
   * Update an existing note
   * @param {string} id - Note ID
   * @param {Object} updates - Fields to update (title, content)
   * @returns {Object|null} Updated note or null if not found or save failed
   */
  updateNote(id, updates) {
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

  /**
   * Delete a note
   * @param {string} id - Note ID
   * @returns {boolean} True if deleted, false if not found or save failed
   */
  deleteNote(id) {
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

  /**
   * Search notes with fuzzy matching
   * @param {string} query - Search query
   * @param {string} [gameFilter=''] - Optional game name to filter by
   * @returns {Array<Object>} Matching notes sorted by relevance
   */
  searchNotes(query, gameFilter = '') {
    let notes = this.getAllNotes();

    // Apply game filter if provided
    if (gameFilter) {
      notes = notes.filter(note => (note.gameName || '') === gameFilter);
    }

    if (!query || query.trim().length === 0) {
      return notes;
    }

    const normalizedQuery = query.toLowerCase().trim();

    return notes
      .map(note => {
        // Guard against corrupted notes with missing/non-string fields
        const title = typeof note.title === 'string' ? note.title : '';
        const content = typeof note.content === 'string' ? note.content : '';
        const gameName = typeof note.gameName === 'string' ? note.gameName : '';
        const titleScore = this._fuzzyScore(title.toLowerCase(), normalizedQuery);
        const contentScore = this._fuzzyScore(content.toLowerCase(), normalizedQuery) * 0.5;
        const gameScore = this._fuzzyScore(gameName.toLowerCase(), normalizedQuery) * 0.7;
        return { note, score: Math.max(titleScore, contentScore, gameScore) };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ note }) => note);
  }

  /**
   * Get unique game names from all notes
   * @returns {Array<string>} Sorted array of unique game names (excludes empty)
   */
  getUniqueGames() {
    const notes = this.getAllNotes();
    const games = new Set();

    for (const note of notes) {
      if (note.gameName && typeof note.gameName === 'string') {
        games.add(note.gameName);
      }
    }

    return [...games].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Get notes grouped by game name
   * @returns {Object} Map of gameName to array of notes, with '' key for general notes
   */
  getNotesGroupedByGame() {
    const notes = this.getAllNotes();
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
   * Calculate fuzzy match score
   * @param {string} text - Text to search in
   * @param {string} query - Search query
   * @returns {number} Score from 0 to 1 (higher = better match)
   * @private
   */
  _fuzzyScore(text, query) {
    const index = text.indexOf(query);
    if (index === -1) return 0;

    // Higher score for matches at start
    return 1 - (index / text.length) * 0.5;
  }

  /**
   * Save notes array to storage
   * @param {Array<Object>} notes - Notes to save
   * @returns {boolean} True if saved successfully, false otherwise
   * @private
   */
  _saveNotes(notes) {
    try {
      this.storageService?.setItem(NotesStorageKeys.USER_NOTES, JSON.stringify(notes));
      // Sort and cache the saved data to maintain getAllNotes() contract
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
