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

const STORAGE_KEY = 'userNotes';

class NotesService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'storageService'], 'NotesService');
  }

  /**
   * Generate a unique ID for a note
   * @returns {string} UUID-like identifier
   */
  _generateId() {
    return `note_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Get all notes from storage
   * @returns {Array<Object>} Array of note objects sorted by updatedAt (newest first)
   */
  getAllNotes() {
    const raw = this.storageService?.getItem(STORAGE_KEY);
    if (!raw) return [];

    try {
      const notes = JSON.parse(raw);
      return Array.isArray(notes)
        ? notes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
        : [];
    } catch (error) {
      this.logger.warn('Failed to parse notes from storage', error);
      return [];
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
   * @returns {Object} Created note object
   */
  createNote(title = '', content = '') {
    const now = Date.now();
    const note = {
      id: this._generateId(),
      title: title || 'Untitled Note',
      content,
      createdAt: now,
      updatedAt: now
    };

    const notes = this.getAllNotes();
    notes.unshift(note);
    this._saveNotes(notes);

    this.logger.debug(`Created note: ${note.id}`);
    this.eventBus.publish(EventChannels.NOTES.NOTE_CREATED, note);

    return note;
  }

  /**
   * Update an existing note
   * @param {string} id - Note ID
   * @param {Object} updates - Fields to update (title, content)
   * @returns {Object|null} Updated note or null if not found
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
    this._saveNotes(notes);

    this.logger.debug(`Updated note: ${id}`);
    this.eventBus.publish(EventChannels.NOTES.NOTE_UPDATED, updatedNote);

    return updatedNote;
  }

  /**
   * Delete a note
   * @param {string} id - Note ID
   * @returns {boolean} True if deleted, false if not found
   */
  deleteNote(id) {
    const notes = this.getAllNotes();
    const index = notes.findIndex(note => note.id === id);

    if (index === -1) {
      this.logger.warn(`Note not found for deletion: ${id}`);
      return false;
    }

    notes.splice(index, 1);
    this._saveNotes(notes);

    this.logger.debug(`Deleted note: ${id}`);
    this.eventBus.publish(EventChannels.NOTES.NOTE_DELETED, { id });

    return true;
  }

  /**
   * Search notes with fuzzy matching
   * @param {string} query - Search query
   * @returns {Array<Object>} Matching notes sorted by relevance
   */
  searchNotes(query) {
    if (!query || query.trim().length === 0) {
      return this.getAllNotes();
    }

    const normalizedQuery = query.toLowerCase().trim();
    const notes = this.getAllNotes();

    return notes
      .map(note => {
        const titleScore = this._fuzzyScore(note.title.toLowerCase(), normalizedQuery);
        const contentScore = this._fuzzyScore(note.content.toLowerCase(), normalizedQuery) * 0.5;
        return { note, score: Math.max(titleScore, contentScore) };
      })
      .filter(({ score }) => score > 0)
      .sort((a, b) => b.score - a.score)
      .map(({ note }) => note);
  }

  /**
   * Calculate fuzzy match score
   * @param {string} text - Text to search in
   * @param {string} query - Search query
   * @returns {number} Score from 0 to 1 (higher = better match)
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
   */
  _saveNotes(notes) {
    try {
      this.storageService?.setItem(STORAGE_KEY, JSON.stringify(notes));
    } catch (error) {
      this.logger.error('Failed to save notes', error);
    }
  }
}

export { NotesService };
