import { PresentationComponent } from '@platform/ui-base';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config';
import { EventChannels } from '@platform/events';
import { NotesListViewComponent } from './notes-list-view.component.js';
import { NotesEditorViewComponent } from './notes-editor-view.component.js';
import { NotesSearchComponent } from './notes-search.component.js';
import { GameFilterComponent } from './game-filter.component.js';
import { GameAutocompleteComponent } from './game-autocomplete.component.js';
import { NotesResizeHandlerComponent } from './notes-resize-handler.component.js';
import { NotesPanelLayoutComponent } from './notes-panel-layout.component.js';
import type { LoggerLike } from '@platform/core';
import { wireNotesPanel } from './notes-panel-wiring.js';


const NOTES_CREATED_SUBSCRIPTION = Symbol('notesPanelCreatedSubscription');
const NOTES_DELETED_SUBSCRIPTION = Symbol('notesPanelDeletedSubscription');
const NOTES_UPDATED_SUBSCRIPTION = Symbol('notesPanelUpdatedSubscription');
const NOTES_PANEL_SETUP_LIFECYCLE = Symbol('notesPanelSetupLifecycle');
const NOTES_PANEL_SUBCOMPONENT_LIFECYCLE = Symbol('notesPanelSubcomponentLifecycle');

interface UserNoteLike {
  id?: string;
  gameName?: string;
  title?: string;
  content?: string;
}

interface NotesServiceLike {
  getNote(id: string | null | undefined): UserNoteLike | null | undefined;
  createNote(title?: string, content?: string, gameName?: string): UserNoteLike | null;
  updateNoteWithChangeDetection(
    id: string,
    updates: { title: string; content: string; gameName: string }
  ): { note: UserNoteLike; gameChanged: boolean } | null;
  deleteNote(id: string): boolean;
  searchNotes(query: string, gameFilter?: string): UserNoteLike[];
  getUniqueGames(): string[];
}

interface NotesEventBusLike {
  subscribe(event: string, handler: (payload?: unknown) => void): () => void;
}

export interface NotesPanelElements {
  notesBtn?: HTMLElement | null;
  notesPanel?: HTMLElement | null;
  notesPanelContent?: HTMLElement | null;
  notesListWrapper?: HTMLElement | null;
  notesSearchInput?: HTMLInputElement | null;
  notesGameFilter?: HTMLElement | null;
  notesGameFilterLabel?: HTMLElement | null;
  notesGameFilterMenu?: HTMLElement | null;
  notesListToggle?: HTMLElement | null;
  notesList?: HTMLElement | null;
  notesEditor?: HTMLElement | null;
  notesGameAddBtn?: HTMLElement | null;
  notesGameTagRow?: HTMLElement | null;
  notesGameTag?: HTMLElement | null;
  notesGameInput?: HTMLInputElement | null;
  notesGameAutocomplete?: HTMLElement | null;
  notesTitleInput?: HTMLInputElement | null;
  notesContentArea?: HTMLTextAreaElement | null;
  streamContainer?: HTMLElement | null;
  streamToolbar?: HTMLElement | null;
  notesNewBtn?: HTMLElement | null;
  notesDeleteBtn?: HTMLButtonElement | null;
}

export interface NotesPanelComponentOptions {
  notesService: NotesServiceLike;
  eventBus: NotesEventBusLike;
  logger?: LoggerLike | null;
}

function getPayloadNoteId(payload: unknown): string | undefined {
  return payload && typeof payload === 'object' && 'id' in payload
    ? String((payload as { id?: unknown }).id)
    : undefined;
}

class NotesPanelComponent extends PresentationComponent {
  declare notesService: NotesServiceLike | null;
  declare eventBus: NotesEventBusLike | null;
  declare logger: LoggerLike | null | undefined;
  declare isVisible: boolean;
  declare currentNoteId: string | null;
  declare elements: NotesPanelElements | null;
  declare listView: NotesListViewComponent | null;
  declare editorView: NotesEditorViewComponent | null;
  declare searchComponent: NotesSearchComponent | null;
  declare gameFilter: GameFilterComponent | null;
  declare gameAutocomplete: GameAutocompleteComponent | null;
  declare resizeHandler: NotesResizeHandlerComponent | null;
  declare layout: NotesPanelLayoutComponent | null;

  constructor(options: NotesPanelComponentOptions) {
    super();
    this.applyOptions<NotesPanelComponentOptions>({}, options);
    this.isVisible = false;
    this.currentNoteId = null;
    this.elements = null;
    this._replaceSubComponents();
  }

  _replaceSubComponents(): void {
    this.cancelManaged(NOTES_PANEL_SUBCOMPONENT_LIFECYCLE);
    this.listView = new NotesListViewComponent({ notesService: this.notesService!, logger: this.logger });
    this.editorView = new NotesEditorViewComponent({ notesService: this.notesService, logger: this.logger });
    this.searchComponent = new NotesSearchComponent({ logger: this.logger });
    this.gameFilter = new GameFilterComponent({ notesService: this.notesService!, logger: this.logger });
    this.gameAutocomplete = new GameAutocompleteComponent({ notesService: this.notesService!, logger: this.logger });
    this.resizeHandler = new NotesResizeHandlerComponent({ logger: this.logger });
    this.layout = new NotesPanelLayoutComponent({ logger: this.logger });

    const subcomponents = {
      listView: this.listView,
      editorView: this.editorView,
      searchComponent: this.searchComponent,
      gameFilter: this.gameFilter,
      gameAutocomplete: this.gameAutocomplete,
      resizeHandler: this.resizeHandler,
      layout: this.layout
    };

    this.replaceManaged(NOTES_PANEL_SUBCOMPONENT_LIFECYCLE, async () => {
      await Promise.all([
        subcomponents.listView?.dispose(),
        subcomponents.editorView?.dispose(),
        subcomponents.searchComponent?.dispose(),
        subcomponents.gameFilter?.dispose(),
        subcomponents.gameAutocomplete?.dispose(),
        subcomponents.resizeHandler?.dispose(),
        subcomponents.layout?.dispose()
      ]);
      if (this.listView === subcomponents.listView) this.listView = null;
      if (this.editorView === subcomponents.editorView) this.editorView = null;
      if (this.searchComponent === subcomponents.searchComponent) this.searchComponent = null;
      if (this.gameFilter === subcomponents.gameFilter) this.gameFilter = null;
      if (this.gameAutocomplete === subcomponents.gameAutocomplete) this.gameAutocomplete = null;
      if (this.resizeHandler === subcomponents.resizeHandler) this.resizeHandler = null;
      if (this.layout === subcomponents.layout) this.layout = null;
    });
  }

  _resetPanelVisibilityState(): void {
    this.editorView?.flushSave?.();
    this.gameFilter?.hide?.();
    this.elements?.notesPanel?.classList.remove(CSSClasses.VISIBLE);
    this.elements?.notesBtn?.classList.remove(CSSClasses.PANEL_OPEN);
    this.elements?.notesBtn?.setAttribute('aria-expanded', 'false');
    this.isVisible = false;
  }

  initialize(elements: NotesPanelElements): void {
    this._resetPanelVisibilityState();
    const currentGameFilter = this.gameFilter?.getCurrentFilter?.() || '';
    this.cancelManaged(NOTES_PANEL_SETUP_LIFECYCLE);
    [NOTES_CREATED_SUBSCRIPTION, NOTES_DELETED_SUBSCRIPTION, NOTES_UPDATED_SUBSCRIPTION].forEach((key) => this.cancelManaged(key));
    this._replaceSubComponents();

    this.elements = {
      notesBtn: elements.notesBtn,
      notesPanel: elements.notesPanel,
      notesPanelContent: elements.notesPanelContent,
      notesListWrapper: elements.notesListWrapper,
      notesSearchInput: elements.notesSearchInput,
      notesGameFilter: elements.notesGameFilter,
      notesGameFilterLabel: elements.notesGameFilterLabel,
      notesGameFilterMenu: elements.notesGameFilterMenu,
      notesListToggle: elements.notesListToggle,
      notesList: elements.notesList,
      notesEditor: elements.notesEditor,
      notesGameAddBtn: elements.notesGameAddBtn,
      notesGameTagRow: elements.notesGameTagRow,
      notesGameTag: elements.notesGameTag,
      notesGameInput: elements.notesGameInput,
      notesGameAutocomplete: elements.notesGameAutocomplete,
      notesTitleInput: elements.notesTitleInput,
      notesContentArea: elements.notesContentArea,
      streamContainer: elements.streamContainer,
      streamToolbar: elements.streamToolbar,
      notesNewBtn: elements.notesNewBtn,
      notesDeleteBtn: elements.notesDeleteBtn
    };

    if (!this.elements.notesBtn || !this.elements.notesPanel) {
      this.logger?.warn('Notes panel elements not found');
      this.elements = null;
      return;
    }

    this._initializeSubComponents();
    if (currentGameFilter) {
      this.gameFilter!.setCurrentFilter(currentGameFilter);
      this._refreshGameFilterOptionsAndRenderList(this.searchComponent!.getQuery());
    }
    this._restoreSelectedNote();

    const setupDisposers: Array<() => void> = [];
    this.replaceManaged(NOTES_PANEL_SETUP_LIFECYCLE, () => setupDisposers.splice(0).reverse().forEach((dispose) => dispose()));
    this._setupNewButton(setupDisposers);
    this._setupEscapeKey(setupDisposers);
    this.layout!.initialize({
      panelElement: this.elements.notesPanel,
      toolbarElement: this.elements.streamToolbar,
      streamContainer: this.elements.streamContainer
    });
    this._subscribeToEvents();

    this.logger?.debug('NotesPanelComponent initialized');
  }

  _initializeSubComponents(): void {
    wireNotesPanel(this, this.elements!);
    this._refreshGameFilterOptionsAndRenderList();
  }

  toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  show(): void {
    if (!this.elements?.notesPanel) return;

    this.layout!.updatePosition();
    this.elements.notesPanel.classList.add(CSSClasses.VISIBLE);
    this.elements.notesBtn?.classList.add(CSSClasses.PANEL_OPEN);
    this.elements.notesBtn?.setAttribute('aria-expanded', 'true');
    this.isVisible = true;
    this.searchComponent!.focus();
    this.logger?.debug('Notes panel shown');
  }

  hide(): void {
    if (!this.elements?.notesPanel) return;

    this.editorView!.flushSave();
    this.gameFilter!.hide();
    this.elements.notesPanel.classList.remove(CSSClasses.VISIBLE);
    this.elements.notesBtn?.classList.remove(CSSClasses.PANEL_OPEN);
    this.elements.notesBtn?.setAttribute('aria-expanded', 'false');
    this.isVisible = false;
    this.logger?.debug('Notes panel hidden');
  }

  _handleSearch(query: string): void {
    this.listView!.render(query);
  }

  _handleGameFilterChange(value: string): void {
    this.listView!.setGameFilter(value);
    this.listView!.render(this.searchComponent!.getQuery());
  }

  _refreshGameFilterOptionsAndRenderList(searchQuery = ''): string {
    this.gameFilter!.updateOptions();
    const normalizedGameFilter = this.gameFilter!.getCurrentFilter();
    this.listView!.setGameFilter(normalizedGameFilter);
    this.listView!.render(searchQuery);
    return normalizedGameFilter;
  }

  _selectFirstNoteForFilter(gameFilter: string, searchQuery = ''): void {
    const notes = this.notesService!.searchNotes(searchQuery, gameFilter);
    if (notes.length > 0) {
      this._selectNote(notes[0].id);
    }
  }

  _handleNoteSelect(noteId: string): void {
    this.editorView!.flushSave();
    this._selectNote(noteId);
  }

  _restoreSelectedNote(): void {
    if (!this.currentNoteId) {
      this.listView!.setCurrentNoteId(null);
      this.listView!.updateActiveState(null);
      return;
    }

    const note = this.notesService!.getNote(this.currentNoteId);
    if (!note) {
      this.currentNoteId = null;
      this.editorView!.clear();
      this.listView!.setCurrentNoteId(null);
      this.listView!.updateActiveState(null);
      return;
    }

    this._loadNoteIntoViews(note);
  }

  _handleGameInputChange(): void {
    this.editorView!.scheduleSave();
  }

  _showGameInput(): void {
    this.editorView!.showGameInput();
    this.gameAutocomplete!.focus();
    this.gameAutocomplete!.select();
  }

  _handleAutocompleteSelect(_value: string): void {
    this.editorView!.scheduleSave();
    this.editorView!.hideGameInput();
    this.editorView!.flushSave();
  }

  _handleAutocompleteEnter(): void {
    this.editorView!.hideGameInput();
    this.editorView!.flushSave();
  }

  _handleAutocompleteEscape(): void {
    this.editorView!.hideGameInput();
  }

  _saveCurrentNote(): void {
    if (!this.currentNoteId) return;

    const { title, content, gameName } = this.editorView!.getValues();
    const result = this.notesService!.updateNoteWithChangeDetection(this.currentNoteId, { title, content, gameName });
    if (!result) {
      this.logger?.warn('Failed to save note - may have been deleted');
      return;
    }

    if (result.gameChanged) {
      this._refreshGameFilterOptionsAndRenderList(this.searchComponent!.getQuery());
    } else {
      this.listView!.updateItemDisplay(this.currentNoteId, title, gameName);
    }
  }

  _setupNewButton(setupDisposers: Array<() => void>): void {
    if (!this.elements?.notesNewBtn) return;
    setupDisposers.push(this.listen(this.elements.notesNewBtn, 'click', () => this._createNewNote()));
  }

  _createNewNote(): void {
    this.editorView!.flushSave();
    const gameName = this.gameFilter!.getCurrentFilter() || '';
    const note = this.notesService!.createNote('', '', gameName);
    if (!note) {
      this.logger?.error('Failed to create note');
      return;
    }

    this._selectNote(note.id);
    this._refreshGameFilterOptionsAndRenderList(this.searchComponent!.getQuery());
    this.editorView!.focusTitle();
  }

  _deleteCurrentNote(): void {
    if (!this.currentNoteId) return;

    this.editorView!.flushSave();
    const success = this.notesService!.deleteNote(this.currentNoteId);
    if (!success) {
      this.logger?.warn('Failed to delete note');
      return;
    }

    this.currentNoteId = null;
    this.editorView!.clear();
    const searchQuery = this.searchComponent!.getQuery();
    const currentFilter = this._refreshGameFilterOptionsAndRenderList(searchQuery);
    this._selectFirstNoteForFilter(currentFilter, searchQuery);
  }

  _selectNote(noteId: string | null | undefined): void {
    const note = this.notesService!.getNote(noteId);
    if (!note) return;

    this._loadNoteIntoViews(note);
    this.logger?.debug(`Selected note: ${noteId}`);
  }

  _loadNoteIntoViews(note: UserNoteLike): void {
    this.currentNoteId = note.id || null;
    this.editorView!.loadNote(note);
    this.listView!.setCurrentNoteId(note.id || null);
    this.listView!.updateActiveState(note.id || null);
  }

  _setupEscapeKey(setupDisposers: Array<() => void>): void {
    setupDisposers.push(this.listen(document, 'keydown', (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === 'Escape' && this.isVisible) {
        if (this.gameFilter?.isGameFilterOpen) {
          this.gameFilter.hide();
          return;
        }
        this.hide();
      }
    }));
  }

  _subscribeToEvents(): void {
    this.replaceManaged(
      NOTES_CREATED_SUBSCRIPTION,
      this.trackSubscription(
        this.eventBus!.subscribe(EventChannels.NOTES.NOTE_CREATED, (note) => {
          const noteId = getPayloadNoteId(note);
          if (note && noteId !== this.currentNoteId) {
            this._refreshGameFilterOptionsAndRenderList(this.searchComponent!.getQuery());
          }
        }),
        (error) => this.logger?.warn('Error unsubscribing from event', error)
      )
    );

    this.replaceManaged(
      NOTES_DELETED_SUBSCRIPTION,
      this.trackSubscription(
        this.eventBus!.subscribe(EventChannels.NOTES.NOTE_DELETED, (payload) => {
          const searchQuery = this.searchComponent!.getQuery();
          const currentFilter = this._refreshGameFilterOptionsAndRenderList(searchQuery);
          if (getPayloadNoteId(payload) === this.currentNoteId) {
            this.editorView!.cancelPendingSave();
            this.currentNoteId = null;
            this.editorView!.clear();
            this._selectFirstNoteForFilter(currentFilter, searchQuery);
          }
        }),
        (error) => this.logger?.warn('Error unsubscribing from event', error)
      )
    );

    this.replaceManaged(
      NOTES_UPDATED_SUBSCRIPTION,
      this.trackSubscription(
        this.eventBus!.subscribe(EventChannels.NOTES.NOTE_UPDATED, (note) => {
          if (note) {
            this._refreshGameFilterOptionsAndRenderList(this.searchComponent!.getQuery());
          }
        }),
        (error) => this.logger?.warn('Error unsubscribing from event', error)
      )
    );
  }

  protected override onDisposeError(error: unknown): void {
    this.logger?.warn('Error disposing notes panel lifecycle resources', error);
  }

  override async dispose(): Promise<void> {
    this.editorView?.flushSave?.();
    await this.cancelManaged(NOTES_PANEL_SUBCOMPONENT_LIFECYCLE);
    await super.dispose();
    this.elements = null;
    this.notesService = null;
    this.eventBus = null;
    this.logger = null;
    this.currentNoteId = null;
    this.isVisible = false;
  }
}

export { NotesPanelComponent };
