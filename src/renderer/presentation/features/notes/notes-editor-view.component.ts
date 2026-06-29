import { PresentationComponent } from '@prismgb/ui-base';
import { NotesPanelConfig } from '@renderer/presentation/config/notes-panel.config';
import type { LoggerLike } from '@prismgb/core';

const SAVE_DEBOUNCE_MS = NotesPanelConfig.AUTOSAVE_DEBOUNCE_MS;
const SAVE_DEBOUNCE_TIMEOUT = Symbol('notesEditorSaveDebounceTimeout');
const DELETE_HOLD_TIMEOUT = Symbol('notesEditorDeleteHoldTimeout');
const EDITOR_SETUP_LIFECYCLE = Symbol('notesEditorSetupLifecycle');

interface UserNoteLike {
  id?: string;
  gameName?: string;
  title?: string;
  content?: string;
}

type EditorCallback = () => void;

export interface NotesEditorViewComponentOptions {
  notesService?: unknown;
  logger?: LoggerLike | null;
}

export interface NotesEditorViewInitializeOptions {
  editorElement?: HTMLElement | null;
  titleInput?: HTMLInputElement | null;
  contentArea?: HTMLTextAreaElement | null;
  deleteBtn?: HTMLButtonElement | null;
  gameTagRow?: HTMLElement | null;
  gameTag?: HTMLElement | null;
  gameInput?: HTMLInputElement | null;
  gameAddBtn?: HTMLElement | null;
  onSave?: EditorCallback | null;
  onDelete?: EditorCallback | null;
  onGameInputChange?: EditorCallback | null;
  onShowGameInput?: EditorCallback | null;
}

class NotesEditorViewComponent extends PresentationComponent {
  declare notesService: unknown;
  declare logger: LoggerLike | null | undefined;
  declare currentNoteId: string | null | undefined;
  declare hasNote: boolean;
  declare editorElement: HTMLElement | null | undefined;
  declare titleInput: HTMLInputElement | null | undefined;
  declare contentArea: HTMLTextAreaElement | null | undefined;
  declare deleteBtn: HTMLButtonElement | null | undefined;
  declare gameTagRow: HTMLElement | null | undefined;
  declare gameTag: HTMLElement | null | undefined;
  declare gameInput: HTMLInputElement | null | undefined;
  declare gameAddBtn: HTMLElement | null | undefined;
  declare onSave: EditorCallback | null | undefined;
  declare onDelete: EditorCallback | null | undefined;
  declare onGameInputChange: EditorCallback | null | undefined;
  declare onShowGameInput: EditorCallback | null | undefined;
  private _hasPendingSave: boolean;

  constructor({ notesService, logger }: NotesEditorViewComponentOptions) {
    super();
    this.notesService = notesService;
    this.logger = logger;
    this.currentNoteId = null;
    this.hasNote = false;
    this.editorElement = null;
    this.titleInput = null;
    this.contentArea = null;
    this.deleteBtn = null;
    this.gameTagRow = null;
    this.gameTag = null;
    this.gameInput = null;
    this.gameAddBtn = null;
    this._hasPendingSave = false;
  }

  initialize({
    editorElement,
    titleInput,
    contentArea,
    deleteBtn,
    gameTagRow,
    gameTag,
    gameInput,
    gameAddBtn,
    onSave,
    onDelete,
    onGameInputChange,
    onShowGameInput
  }: NotesEditorViewInitializeOptions): void {
    this.flushSave();
    this.cancelManaged(EDITOR_SETUP_LIFECYCLE);
    this._cancelDeleteHold();
    this.editorElement = editorElement;
    this.titleInput = titleInput;
    this.contentArea = contentArea;
    this.deleteBtn = deleteBtn;
    this.gameTagRow = gameTagRow;
    this.gameTag = gameTag;
    this.gameInput = gameInput;
    this.gameAddBtn = gameAddBtn;
    this.onSave = onSave;
    this.onDelete = onDelete;
    this.onGameInputChange = onGameInputChange;
    this.onShowGameInput = onShowGameInput;

    const setupDisposers: Array<() => void> = [];
    this._setupEditor(setupDisposers);
    this._setupGameTagUI(setupDisposers);
    this._setupDeleteButton(setupDisposers);
    this.replaceManaged(EDITOR_SETUP_LIFECYCLE, () => {
      setupDisposers.splice(0).reverse().forEach((dispose) => dispose());
    });
  }

  loadNote(note: UserNoteLike | null | undefined): void {
    if (!note) return;

    this.currentNoteId = note.id;
    this.hasNote = true;
    this.editorElement?.classList.add('has-note');
    if (this.gameInput) this.gameInput.value = note.gameName || '';
    if (this.titleInput) this.titleInput.value = note.title || '';
    if (this.contentArea) this.contentArea.value = note.content || '';
    this._updateGameTagDisplay();
    this.deleteBtn?.removeAttribute('disabled');
  }

  clear(): void {
    this.currentNoteId = null;
    this.hasNote = false;
    if (this.gameInput) this.gameInput.value = '';
    if (this.titleInput) this.titleInput.value = '';
    if (this.contentArea) this.contentArea.value = '';
    this.editorElement?.classList.remove('has-note');
    this.deleteBtn?.setAttribute('disabled', '');
    this._updateGameTagDisplay();
  }

  focusTitle(): void {
    this.titleInput?.focus();
    this.titleInput?.select();
  }

  getValues(): { title: string; content: string; gameName: string } {
    return {
      title: this.titleInput?.value || '',
      content: this.contentArea?.value || '',
      gameName: this.gameInput?.value || ''
    };
  }

  showGameInput(): void {
    if (!this.gameTagRow || !this.gameInput) return;
    this.gameTagRow.classList.add('editing');
    this.gameInput.focus();
    this.gameInput.select();
  }

  hideGameInput(): void {
    if (!this.gameTagRow) return;
    this.gameTagRow.classList.remove('editing');
    this._updateGameTagDisplay();
  }

  flushSave(): void {
    this.cancelManaged(SAVE_DEBOUNCE_TIMEOUT);
    if (!this._hasPendingSave) {
      return;
    }
    this._hasPendingSave = false;
    this.onSave?.();
  }

  cancelPendingSave(): void {
    this.cancelManaged(SAVE_DEBOUNCE_TIMEOUT);
    this._hasPendingSave = false;
  }

  scheduleSave(): void {
    this._scheduleSave();
  }

  _setupEditor(setupDisposers: Array<() => void>): void {
    if (this.titleInput) {
      setupDisposers.push(this.listen(this.titleInput, 'input', () => this._scheduleSave()));
    }
    if (this.contentArea) {
      setupDisposers.push(this.listen(this.contentArea, 'input', () => this._scheduleSave()));
    }
  }

  _setupGameTagUI(setupDisposers: Array<() => void>): void {
    if (this.gameAddBtn) {
      setupDisposers.push(this.listen(this.gameAddBtn, 'click', () => this.onShowGameInput?.()));
    }
    if (this.gameTag) {
      setupDisposers.push(this.listen(this.gameTag, 'click', () => this.onShowGameInput?.()));
    }
  }

  _updateGameTagDisplay(): void {
    const gameName = this.gameInput?.value || '';
    if (this.gameTag) this.gameTag.textContent = gameName;
    if (this.editorElement) {
      if (gameName) this.editorElement.classList.add('has-game');
      else this.editorElement.classList.remove('has-game');
    }
  }

  _setupDeleteButton(setupDisposers: Array<() => void>): void {
    if (!this.deleteBtn) return;

    const DELETE_HOLD_MS = 2000;
    const startHold = (event: Event): void => {
      event.preventDefault();
      const deleteButton = this.deleteBtn;
      if (!deleteButton || deleteButton.disabled) return;

      deleteButton.classList.add('holding');
      deleteButton.style.setProperty('--hold-duration', `${DELETE_HOLD_MS}ms`);
      this.replaceTimeout(DELETE_HOLD_TIMEOUT, () => {
        this.onDelete?.();
        this._cancelDeleteHold();
      }, DELETE_HOLD_MS);
    };
    const cancelHold = (): void => this._cancelDeleteHold();

    setupDisposers.push(this.listen(this.deleteBtn, 'mousedown', startHold));
    setupDisposers.push(this.listen(this.deleteBtn, 'touchstart', startHold));
    setupDisposers.push(this.listen(this.deleteBtn, 'mouseup', cancelHold));
    setupDisposers.push(this.listen(this.deleteBtn, 'mouseleave', cancelHold));
    setupDisposers.push(this.listen(this.deleteBtn, 'touchend', cancelHold));
    setupDisposers.push(this.listen(this.deleteBtn, 'touchcancel', cancelHold));
  }

  _cancelDeleteHold(): void {
    this.cancelManaged(DELETE_HOLD_TIMEOUT);
    this.deleteBtn?.classList.remove('holding');
  }

  _scheduleSave(): void {
    this._hasPendingSave = true;
    this.replaceTimeout(SAVE_DEBOUNCE_TIMEOUT, () => {
      this._hasPendingSave = false;
      this.onSave?.();
    }, SAVE_DEBOUNCE_MS);
  }

  override dispose(): void | Promise<void> {
    this.flushSave();
    const disposed = super.dispose();
    this.editorElement = null;
    this.titleInput = null;
    this.contentArea = null;
    this.deleteBtn = null;
    this.gameTagRow = null;
    this.gameTag = null;
    this.gameInput = null;
    this.gameAddBtn = null;
    this.onSave = null;
    this.onDelete = null;
    this.onGameInputChange = null;
    this.onShowGameInput = null;
    this.notesService = null;
    this.logger = null;
    return disposed;
  }
}

export { NotesEditorViewComponent };
