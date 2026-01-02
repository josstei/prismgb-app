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
      <div class="notes-panel-header">
        <span class="notes-panel-title">Notes</span>
        <div class="notes-panel-actions">
          <button class="notes-action-btn" id="notesCloseBtn" aria-label="Close notes">
            ${getIconSvg('notes-close')}
          </button>
        </div>
      </div>

      <div class="notes-panel-search">
        <input type="text" id="notesSearchInput" placeholder="Search notes..." autocomplete="off">
      </div>

      <div class="notes-panel-content">
        <div class="notes-list" id="notesList">
          <!-- Notes list rendered dynamically -->
        </div>

        <div class="notes-editor" id="notesEditor">
          <div class="notes-empty-state" id="notesEmptyState">
            ${getIconSvg('notes-empty')}
            <span>Click <strong>New</strong> to create a note</span>
          </div>
          <input type="text" class="notes-title-input" id="notesTitleInput" placeholder="Note title...">
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
