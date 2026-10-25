import type { UserNote } from '@platform/notes';
import { PresentationComponent } from '@platform/ui-base';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { escapeHtml } from '@platform/core';
import type { LoggerLike } from '@platform/core';

const LIST_SETUP_LIFECYCLE = Symbol('notesListSetupLifecycle');

export interface NotesListViewComponentOptions {
  logger?: LoggerLike | null;
}

export interface NotesListViewInitializeOptions {
  listElement?: HTMLElement | null;
  onNoteSelect?: ((noteId: string) => void) | null;
}

class NotesListViewComponent extends PresentationComponent {
  logger: LoggerLike | null | undefined;
  collapsedGameGroups: Set<string>;
  listElement: HTMLElement | null | undefined;
  onNoteSelect: ((noteId: string) => void) | null | undefined;

  constructor(options: NotesListViewComponentOptions) {
    super();
    this.logger = options.logger;
    this.collapsedGameGroups = new Set();
    this.listElement = null;
  }

  initialize(options: NotesListViewInitializeOptions): void {
    this.cancelManaged(LIST_SETUP_LIFECYCLE);
    this.listElement = options.listElement;
    this.onNoteSelect = options.onNoteSelect;

    if (!this.listElement) {
      this.logger?.warn('List element not found');
      return;
    }

    this._setupListClickHandler();
  }

  render(notes: UserNote[], { searchQuery, gameFilter, selectedNoteId }: {
    searchQuery: string;
    gameFilter: string;
    selectedNoteId: string | null;
  }): void {
    if (!this.listElement) return;

    if (notes.length === 0) {
      this.listElement.innerHTML = `
        <div class="notes-list-empty">
          ${searchQuery ? 'No matching notes' : (gameFilter ? 'No notes for this game' : 'No notes yet')}
        </div>
      `;
      return;
    }

    if (gameFilter) {
      this.listElement.innerHTML = notes.map((note) => this._renderNoteItem(note, selectedNoteId)).join('');
      return;
    }

    const grouped = this._groupNotesByGame(notes);
    const gameNames = Object.keys(grouped).sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });

    this.listElement.innerHTML = gameNames
      .map((gameName) => this._renderGameGroup(gameName, grouped[gameName] || [], selectedNoteId))
      .join('');
  }

  updateActiveState(noteId: string | null): void {
    const items = this.listElement?.querySelectorAll<HTMLElement>('.note-list-item');
    items?.forEach((item) => {
      if (item.dataset.noteId === noteId) {
        item.classList.add('active');
      } else {
        item.classList.remove('active');
      }
    });
  }

  _setupListClickHandler(): void {
    if (!this.listElement) return;

    this.replaceManaged(
      LIST_SETUP_LIFECYCLE,
      this.listen(this.listElement, 'click', (event) => {
        const target = event.target instanceof Element ? event.target : null;
        const gameHeader = target?.closest<HTMLElement>('.notes-game-header');
        if (gameHeader) {
          this._toggleGameGroup(gameHeader.dataset.gameToggle || '');
          return;
        }

        const item = target?.closest<HTMLElement>('.note-list-item');
        if (!item) return;

        const noteId = item.dataset.noteId;
        if (noteId) {
          this.onNoteSelect?.(noteId);
        }
      })
    );
  }

  _toggleGameGroup(gameName: string): void {
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

  _groupNotesByGame(notes: UserNote[]): Record<string, UserNote[]> {
    const groups: Record<string, UserNote[]> = {};
    for (const note of notes) {
      const gameName = note.gameName || '';
      groups[gameName] ??= [];
      groups[gameName].push(note);
    }
    return groups;
  }

  _renderGameGroup(gameName: string, notes: UserNote[], selectedNoteId: string | null): string {
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
          ${notes.map((note) => this._renderNoteItem(note, selectedNoteId)).join('')}
        </div>
      </div>
    `;
  }

  _renderNoteItem(note: UserNote, selectedNoteId: string | null): string {
    const isActive = note.id === selectedNoteId;
    const safeId = escapeHtml(note.id || '');
    const title = escapeHtml(note.title || 'Untitled Note');
    const date = note.updatedAt ? new Date(note.updatedAt).toLocaleDateString() : '';


    return `
      <div class="note-list-item${isActive ? ' active' : ''}" data-note-id="${safeId}">
        <div class="note-list-item-title">${title}</div>
        <div class="note-list-item-date">${date}</div>
      </div>
    `;
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.collapsedGameGroups.clear();
    this.listElement = null;
    this.onNoteSelect = null;
    this.logger = null;
    return disposed;
  }
}

export { NotesListViewComponent };
