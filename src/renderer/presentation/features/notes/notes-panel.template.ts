/**
 * Notes Panel Template
 *
 * Sidebar panel for note-taking during gameplay.
 */

import { getIconSvg } from '@renderer/presentation/icons/icon.utils.js';

export default function createNotesPanelTemplate(): string {
  return `
    <div class="notes-panel" id="notesPanel" data-ref="notesPanel">
      <div class="notes-panel-toolbar">
        <div class="notes-search-wrapper">
          <span class="notes-search-icon">${getIconSvg('search')}</span>
          <input type="text" id="notesSearchInput" data-ref="notesSearchInput" placeholder="Search..." autocomplete="off">
        </div>
        <div class="notes-filter-wrapper">
          <span class="notes-filter-icon">${getIconSvg('filter')}</span>
          <button class="notes-game-filter" id="notesGameFilter" data-ref="notesGameFilter" type="button" aria-haspopup="listbox" aria-expanded="false" aria-controls="notesGameFilterMenu">
            <span class="notes-filter-label" id="notesGameFilterLabel" data-ref="notesGameFilterLabel">All Games</span>
          </button>
          <div class="notes-game-filter-menu" id="notesGameFilterMenu" data-ref="notesGameFilterMenu" role="listbox" aria-label="Filter by game"></div>
        </div>
      </div>

      <div class="notes-panel-content" id="notesPanelContent" data-ref="notesPanelContent">
        <div class="notes-list-wrapper" id="notesListWrapper" data-ref="notesListWrapper">
          <div class="notes-list" id="notesList" data-ref="notesList">
            <!-- Notes list rendered dynamically -->
          </div>
        </div>

        <button class="notes-list-toggle" id="notesListToggle" data-ref="notesListToggle" aria-label="Toggle notes list" aria-expanded="true">
          <span class="toggle-handle"></span>
        </button>

        <div class="notes-editor" id="notesEditor" data-ref="notesEditor">
          <div class="notes-empty-state" id="notesEmptyState" data-ref="notesEmptyState">
            ${getIconSvg('notes-empty')}
            <span>Click <strong>New</strong> to create a note</span>
          </div>
          <div class="notes-title-row">
            <input type="text" class="notes-title-input" id="notesTitleInput" data-ref="notesTitleInput" placeholder="Title..." maxlength="25">
            <button class="notes-game-tag" id="notesGameTag" data-ref="notesGameTag" aria-label="Edit game"></button>
            <button class="notes-game-add-btn" id="notesGameAddBtn" data-ref="notesGameAddBtn" aria-label="Add game tag" title="Add game">
              ${getIconSvg('tag-add')}
            </button>
          </div>
          <div class="notes-game-input-row" id="notesGameTagRow" data-ref="notesGameTagRow">
            <div class="notes-game-input-wrapper">
              <input type="text" class="notes-game-input" id="notesGameInput" data-ref="notesGameInput" placeholder="Game name..." autocomplete="off">
              <div class="notes-game-autocomplete" id="notesGameAutocomplete" data-ref="notesGameAutocomplete"></div>
            </div>
          </div>
          <textarea class="notes-content-area" id="notesContentArea" data-ref="notesContentArea" placeholder="Start typing..."></textarea>
        </div>
      </div>

      <div class="notes-panel-footer">
        <button class="notes-footer-btn notes-new-btn" id="notesNewBtn" data-ref="notesNewBtn" aria-label="New note">
          ${getIconSvg('notes-new')}
          New
        </button>
        <button class="notes-footer-btn notes-delete-btn" id="notesDeleteBtn" data-ref="notesDeleteBtn" aria-label="Hold to delete note" title="Hold to delete" disabled>
          <span class="btn-content">${getIconSvg('notes-delete')}Delete</span>
        </button>
      </div>
    </div>
  `;
}
