/**
 * Notes Panel Template
 *
 * Sidebar panel for note-taking during gameplay.
 */

import { getIconSvg } from '@renderer/ui/icons/icon.utils.js';

/**
 * Create notes panel HTML
 * @returns {string} Notes panel HTML string
 */
export default function createNotesPanelTemplate() {
  return `
    <div class="notes-panel" id="notesPanel">
      <div class="notes-panel-toolbar">
        <div class="notes-search-wrapper">
          <span class="notes-search-icon">${getIconSvg('search')}</span>
          <input type="text" id="notesSearchInput" placeholder="Search..." autocomplete="off">
        </div>
        <div class="notes-filter-wrapper">
          <span class="notes-filter-icon">${getIconSvg('filter')}</span>
          <select class="notes-game-filter" id="notesGameFilter" aria-label="Filter by game">
            <option value="">All</option>
          </select>
        </div>
      </div>

      <div class="notes-panel-content">
        <div class="notes-list-wrapper">
          <div class="notes-list" id="notesList">
            <!-- Notes list rendered dynamically -->
          </div>
        </div>

        <button class="notes-list-toggle" id="notesListToggle" aria-label="Toggle notes list" aria-expanded="true">
          <span class="toggle-handle"></span>
        </button>

        <div class="notes-editor" id="notesEditor">
          <div class="notes-empty-state" id="notesEmptyState">
            ${getIconSvg('notes-empty')}
            <span>Click <strong>New</strong> to create a note</span>
          </div>
          <div class="notes-title-row">
            <input type="text" class="notes-title-input" id="notesTitleInput" placeholder="Title..." maxlength="25">
            <button class="notes-game-tag" id="notesGameTag" aria-label="Edit game"></button>
            <button class="notes-game-add-btn" id="notesGameAddBtn" aria-label="Add game tag" title="Add game">
              ${getIconSvg('tag-add')}
            </button>
          </div>
          <div class="notes-game-input-row" id="notesGameTagRow">
            <div class="notes-game-input-wrapper">
              <input type="text" class="notes-game-input" id="notesGameInput" placeholder="Game name..." autocomplete="off">
              <div class="notes-game-autocomplete" id="notesGameAutocomplete"></div>
            </div>
          </div>
          <textarea class="notes-content-area" id="notesContentArea" placeholder="Start typing..."></textarea>
        </div>
      </div>

      <div class="notes-panel-footer">
        <button class="notes-footer-btn notes-new-btn" id="notesNewBtn" aria-label="New note">
          ${getIconSvg('notes-new')}
          New
        </button>
        <button class="notes-footer-btn notes-delete-btn" id="notesDeleteBtn" aria-label="Delete note" disabled>
          ${getIconSvg('notes-delete')}
          Delete
        </button>
      </div>
    </div>
  `;
}
