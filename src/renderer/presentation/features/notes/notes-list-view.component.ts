import { PresentationComponent } from '@prismgb/ui-base';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { escapeHtml } from '@prismgb/core';
import type { LoggerLike } from '@prismgb/core';

const LIST_SETUP_LIFECYCLE = Symbol('notesListSetupLifecycle');

interface UserNoteLike {
  id?: string;
  gameName?: string;
  title?: string;
  content?: string;
  updatedAt?: number;
}

interface NotesListServiceLike {
  searchNotes(query: string, gameFilter?: string): UserNoteLike[];
}

export interface NotesListViewComponentOptions {
  notesService: NotesListServiceLike;
  logger?: LoggerLike | null;
}

export interface NotesListViewInitializeOptions {
  listElement?: HTMLElement | null;
  onNoteSelect?: ((noteId: string) => void) | null;
}

class NotesListViewComponent extends PresentationComponent {
  declare notesService: NotesListServiceLike | null;
  declare logger: LoggerLike | null | undefined;
  declare currentNoteId: string | null;
  declare currentGameFilter: string;
  declare collapsedGameGroups: Set<string>;
  declare listElement: HTMLElement | null | undefined;
  declare onNoteSelect: ((noteId: string) => void) | null | undefined;

  constructor({ notesService, logger }: NotesListViewComponentOptions) {
    super();
    this.notesService = notesService;
    this.logger = logger;
    this.currentNoteId = null;
    this.currentGameFilter = '';
    this.collapsedGameGroups = new Set();
    this.listElement = null;
  }

  initialize({ listElement, onNoteSelect }: NotesListViewInitializeOptions): void {
    this.cancelManaged(LIST_SETUP_LIFECYCLE);
    this.listElement = listElement;
    this.onNoteSelect = onNoteSelect;

    if (!this.listElement) {
      this.logger?.warn('List element not found');
      return;
    }

    this._setupListClickHandler();
  }

  setCurrentNoteId(noteId: string | null): void {
    this.currentNoteId = noteId;
  }

  setGameFilter(gameFilter: string | null | undefined): void {
    this.currentGameFilter = gameFilter || '';
  }

  render(searchQuery = ''): void {
    if (!this.listElement) return;

    const notes = this.notesService!.searchNotes(searchQuery, this.currentGameFilter);

    if (notes.length === 0) {
      this.listElement.innerHTML = `
        <div class="notes-list-empty">
          ${searchQuery ? 'No matching notes' : (this.currentGameFilter ? 'No notes for this game' : 'No notes yet')}
        </div>
      `;
      return;
    }

    if (this.currentGameFilter) {
      this.listElement.innerHTML = notes.map((note) => this._renderNoteItem(note, false)).join('');
      return;
    }

    const grouped = this._groupNotesByGame(notes);
    const gameNames = Object.keys(grouped).sort((a, b) => {
      if (a === '') return 1;
      if (b === '') return -1;
      return a.localeCompare(b);
    });

    this.listElement.innerHTML = gameNames
      .map((gameName) => this._renderGameGroup(gameName, grouped[gameName] || []))
      .join('');
  }

  updateItemDisplay(noteId: string, title: string, gameName?: string): void {
    const item = this.listElement?.querySelector<HTMLElement>(`[data-note-id="${noteId}"]`);
    if (!item) return;

    for (const child of item.children) {
      const element = child as HTMLElement;
      if (element.classList.contains('note-list-item-title')) {
        element.textContent = title || 'Untitled Note';
      } else if (element.classList.contains('note-list-item-date')) {
        element.textContent = new Date().toLocaleDateString();
      } else if (element.classList.contains('note-list-item-game-tag') && gameName !== undefined) {
        element.textContent = gameName || '';
        element.style.display = gameName ? '' : 'none';
      }
    }
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
        if (noteId && noteId !== this.currentNoteId) {
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

  _groupNotesByGame(notes: UserNoteLike[]): Record<string, UserNoteLike[]> {
    const groups: Record<string, UserNoteLike[]> = {};
    for (const note of notes) {
      const gameName = note.gameName || '';
      groups[gameName] ??= [];
      groups[gameName].push(note);
    }
    return groups;
  }

  _renderGameGroup(gameName: string, notes: UserNoteLike[]): string {
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
          ${notes.map((note) => this._renderNoteItem(note, false)).join('')}
        </div>
      </div>
    `;
  }

  _renderNoteItem(note: UserNoteLike, showGameTag = true): string {
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

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.collapsedGameGroups.clear();
    this.currentNoteId = null;
    this.currentGameFilter = '';
    this.listElement = null;
    this.onNoteSelect = null;
    this.notesService = null;
    this.logger = null;
    return disposed;
  }
}

export { NotesListViewComponent };
