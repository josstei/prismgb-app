/**
 * Notes List View Component
 *
 * Handles rendering and interaction with the notes list, including:
 * - List rendering with game grouping
 * - Item selection
 * - Game group expand/collapse
 * - Search term highlighting
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';
import { escapeHtml } from '@shared/utils/string.utils.js';

class NotesListViewComponent {
  constructor({ notesService, logger }) {
    this.notesService = notesService;
    this.logger = logger;

    // List state
    this.currentNoteId = null;
    this.currentGameFilter = '';
    this.collapsedGameGroups = new Set();

    // Track DOM listeners for cleanup
    this._domListeners = createDomListenerManager({ logger });

    // Elements
    this.listElement = null;
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} options
   * @param {HTMLElement} options.listElement - Notes list container
   * @param {Function} options.onNoteSelect - Callback when note is selected (noteId)
   */
  initialize({ listElement, onNoteSelect }) {
    this.listElement = listElement;
    this.onNoteSelect = onNoteSelect;

    if (!this.listElement) {
      this.logger?.warn('List element not found');
      return;
    }

    this._setupListClickHandler();
  }

  /**
   * Set current note ID for active state
   * @param {string|null} noteId
   */
  setCurrentNoteId(noteId) {
    this.currentNoteId = noteId;
  }

  /**
   * Set current game filter
   * @param {string} gameFilter
   */
  setGameFilter(gameFilter) {
    this.currentGameFilter = gameFilter || '';
  }

  /**
   * Render notes list with game grouping
   * @param {string} [searchQuery=''] - Optional search query
   */
  render(searchQuery = '') {
    if (!this.listElement) return;

    const notes = this.notesService.searchNotes(searchQuery, this.currentGameFilter);

    if (notes.length === 0) {
      this.listElement.innerHTML = `
        <div class="notes-list-empty">
          ${searchQuery ? 'No matching notes' : (this.currentGameFilter ? 'No notes for this game' : 'No notes yet')}
        </div>
      `;
      return;
    }

    // If filtering by a specific game, show flat list
    if (this.currentGameFilter) {
      this.listElement.innerHTML = notes
        .map(note => this._renderNoteItem(note, false))
        .join('');
      return;
    }

    // Group by game for "All Games" view
    const grouped = this._groupNotesByGame(notes);
    const gameNames = Object.keys(grouped).sort((a, b) => {
      // "General" (empty string) goes last
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });

    this.listElement.innerHTML = gameNames
      .map(gameName => this._renderGameGroup(gameName, grouped[gameName]))
      .join('');
  }

  /**
   * Update a single list item's display without full rebuild
   * @param {string} noteId - Note ID
   * @param {string} title - New title
   * @param {string} [gameName] - Game name
   */
  updateItemDisplay(noteId, title, gameName) {
    const item = this.listElement?.querySelector(`[data-note-id="${noteId}"]`);
    if (!item) return;

    // Iterate through direct children once instead of multiple querySelector calls
    for (const child of item.children) {
      if (child.classList.contains('note-list-item-title')) {
        child.textContent = title || 'Untitled Note';
      } else if (child.classList.contains('note-list-item-date')) {
        child.textContent = new Date().toLocaleDateString();
      } else if (child.classList.contains('note-list-item-game-tag') && gameName !== undefined) {
        child.textContent = gameName || '';
        child.style.display = gameName ? '' : 'none';
      }
    }
  }

  /**
   * Update active state in list
   * @param {string|null} noteId
   */
  updateActiveState(noteId) {
    const items = this.listElement?.querySelectorAll('.note-list-item');
    items?.forEach(item => {
      if (item.dataset.noteId === noteId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  /**
   * Setup event delegation for list item and game header clicks
   * @private
   */
  _setupListClickHandler() {
    if (!this.listElement) return;

    this._domListeners.add(this.listElement, 'click', (e) => {
      // Handle game group header click (expand/collapse)
      const gameHeader = e.target.closest('.notes-game-header');
      if (gameHeader) {
        const gameName = gameHeader.dataset.gameToggle || '';
        this._toggleGameGroup(gameName);
        return;
      }

      // Handle note item click
      const item = e.target.closest('.note-list-item');
      if (!item) return;

      const noteId = item.dataset.noteId;
      if (noteId && noteId !== this.currentNoteId) {
        this.onNoteSelect?.(noteId);
      }
    });
  }

  /**
   * Toggle game group expand/collapse
   * @param {string} gameName
   * @private
   */
  _toggleGameGroup(gameName) {
    const group = this.listElement?.querySelector(`[data-game="${gameName}"]`);
    if (!group) return;

    if (this.collapsedGameGroups.has(gameName)) {
      this.collapsedGameGroups.delete(gameName);
      group.classList.remove(CSSClasses.GAME_GROUP_COLLAPSED);
    } else {
      this.collapsedGameGroups.add(gameName);
      group.classList.add(CSSClasses.GAME_GROUP_COLLAPSED);
    }
  }

  /**
   * Group notes by game name
   * @param {Array} notes
   * @returns {Object} Map of gameName to notes array
   * @private
   */
  _groupNotesByGame(notes) {
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
   * Render a game group
   * @param {string} gameName
   * @param {Array} notes
   * @returns {string} HTML
   * @private
   */
  _renderGameGroup(gameName, notes) {
    const isCollapsed = this.collapsedGameGroups.has(gameName);
    const displayName = gameName || 'General';
    const safeGameName = escapeHtml(gameName);

    return `
      <div class="notes-game-group${isCollapsed ? ' collapsed' : ''}" data-game="${safeGameName}">
        <button class="notes-game-header" data-game-toggle="${safeGameName}">
          <span class="game-name">${escapeHtml(displayName)}</span>
          <span class="game-count">${notes.length}</span>
          <svg class="game-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M6 9l6 6 6-6"/>
          </svg>
        </button>
        <div class="notes-game-notes">
          ${notes.map(note => this._renderNoteItem(note, false)).join('')}
        </div>
      </div>
    `;
  }

  /**
   * Render a single note item
   * @param {Object} note
   * @param {boolean} showGameTag - Whether to show the game tag
   * @returns {string} HTML
   * @private
   */
  _renderNoteItem(note, showGameTag = true) {
    const isActive = note.id === this.currentNoteId;
    const safeId = escapeHtml(note.id || '');
    const title = escapeHtml(note.title || 'Untitled Note');
    const date = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : '';
    const gameName = note.gameName || '';
    const gameTagHtml = showGameTag && gameName
      ? `<div class="note-list-item-game-tag">${escapeHtml(gameName)}</div>`
      : '';

    return `
      <div class="note-list-item${isActive ? ' active' : ''}" data-note-id="${safeId}">
        <div class="note-list-item-title">${title}</div>
        ${gameTagHtml}
        <div class="note-list-item-date">${date}</div>
      </div>
    `;
  }

  /**
   * Cleanup resources
   */
  dispose() {
    // Remove DOM listeners
    this._domListeners.removeAll();

    // Clear state
    this.collapsedGameGroups.clear();
    this.currentNoteId = null;
    this.currentGameFilter = '';
    this.listElement = null;
    this.onNoteSelect = null;
    this.notesService = null;
    this.logger = null;
  }
}

export { NotesListViewComponent };
