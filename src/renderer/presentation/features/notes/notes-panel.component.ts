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
import { disposeInOrder, type LoggerLike } from '@platform/core';
import type { NotesService, UserNote } from '@platform/notes';
import type { TypedEventBusLike } from '@platform/events';


const NOTES_CREATED_SUBSCRIPTION = Symbol('notesPanelCreatedSubscription');
const NOTES_DELETED_SUBSCRIPTION = Symbol('notesPanelDeletedSubscription');
const NOTES_UPDATED_SUBSCRIPTION = Symbol('notesPanelUpdatedSubscription');
const NOTES_PANEL_SETUP_LIFECYCLE = Symbol('notesPanelSetupLifecycle');
const NOTES_PANEL_SUBCOMPONENT_LIFECYCLE = Symbol('notesPanelSubcomponentLifecycle');

type NotesServiceLike = Pick<NotesService, 'getNote' | 'createNote' | 'updateNote' | 'deleteNote' | 'searchNotes' | 'getUniqueGames'>;
type NotesEventBusLike = Pick<TypedEventBusLike, 'subscribe'>;
interface NotesPanelChildren {
  listView: NotesListViewComponent;
  editorView: NotesEditorViewComponent;
  searchComponent: NotesSearchComponent;
  gameFilter: GameFilterComponent;
  gameAutocomplete: GameAutocompleteComponent;
  resizeHandler: NotesResizeHandlerComponent;
  layout: NotesPanelLayoutComponent;
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

class NotesPanelComponent extends PresentationComponent {
  notesService: NotesServiceLike | null;
  eventBus: NotesEventBusLike | null;
  logger: LoggerLike | null | undefined;
  isVisible: boolean;
  currentNoteId: string | null;
  elements: NotesPanelElements | null;
  children: NotesPanelChildren | null = null;

  constructor(options: NotesPanelComponentOptions) {
    super();
    this.notesService = options.notesService;
    this.eventBus = options.eventBus;
    this.logger = options.logger;
    this.isVisible = false;
    this.currentNoteId = null;
    this.elements = null;
  }

  _replaceSubComponents(): void {
    void this.cancelManaged(NOTES_PANEL_SUBCOMPONENT_LIFECYCLE);
    const children: NotesPanelChildren = {
      listView: new NotesListViewComponent({ notesService: this.notesService!, logger: this.logger }),
      editorView: new NotesEditorViewComponent(),
      searchComponent: new NotesSearchComponent({ logger: this.logger }),
      gameFilter: new GameFilterComponent({ notesService: this.notesService!, logger: this.logger }),
      gameAutocomplete: new GameAutocompleteComponent({ notesService: this.notesService!, logger: this.logger }),
      resizeHandler: new NotesResizeHandlerComponent({ logger: this.logger }),
      layout: new NotesPanelLayoutComponent()
    };
    this.children = children;
    this.replaceManaged(NOTES_PANEL_SUBCOMPONENT_LIFECYCLE, async () => {
      const results = await Promise.allSettled(Object.values(children).map(async (component) => component.dispose()));
      if (this.children === children) this.children = null;
      const failures = results.filter((result) => result.status === 'rejected').map((result) => result.reason);
      if (failures.length) throw new AggregateError(failures, 'Notes panel disposal failed');
    });
  }

  _resetPanelVisibilityState(): void {
    this.children?.editorView.flushSave();
    this.children?.gameFilter.hide();
    this.elements?.notesPanel?.classList.remove(CSSClasses.VISIBLE);
    this.elements?.notesBtn?.classList.remove(CSSClasses.PANEL_OPEN);
    this.elements?.notesBtn?.setAttribute('aria-expanded', 'false');
    this.isVisible = false;
  }

  initialize(elements: NotesPanelElements): void {
    this._resetPanelVisibilityState();
    const currentGameFilter = this.children?.gameFilter.getCurrentFilter() || '';
    this.cancelManaged(NOTES_PANEL_SETUP_LIFECYCLE);
    [NOTES_CREATED_SUBSCRIPTION, NOTES_DELETED_SUBSCRIPTION, NOTES_UPDATED_SUBSCRIPTION].forEach((key) => this.cancelManaged(key));
    void this.cancelManaged(NOTES_PANEL_SUBCOMPONENT_LIFECYCLE);
    this.children = null;

    this.elements = elements;

    if (!this.elements.notesBtn || !this.elements.notesPanel) {
      this.logger?.warn('Notes panel elements not found');
      this.elements = null;
      return;
    }

    this._replaceSubComponents();
    this._initializeSubComponents();
    if (currentGameFilter) {
      this.children!.gameFilter.setCurrentFilter(currentGameFilter);
      this._refreshGameFilterOptionsAndRenderList(this.children!.searchComponent.getQuery());
    }
    this._restoreSelectedNote();

    const setupDisposers: Array<() => void> = [];
    this.replaceManaged(NOTES_PANEL_SETUP_LIFECYCLE, () => setupDisposers.splice(0).reverse().forEach((dispose) => dispose()));
    this._setupNewButton(setupDisposers);
    this._setupEscapeKey(setupDisposers);
    this.children!.layout.initialize({
      panelElement: this.elements.notesPanel,
      toolbarElement: this.elements.streamToolbar,
      streamContainer: this.elements.streamContainer
    });
    this._subscribeToEvents();

    this.logger?.debug('NotesPanelComponent initialized');
  }

  _initializeSubComponents(): void {
    this.children!.searchComponent.initialize({
      searchInput: this.elements!.notesSearchInput,
      onSearch: (query: string) => this._handleSearch(query)
    });
    this.children!.gameFilter.initialize({
      filterButton: this.elements!.notesGameFilter,
      filterLabel: this.elements!.notesGameFilterLabel,
      filterMenu: this.elements!.notesGameFilterMenu,
      onFilterChange: (value: string) => this._handleGameFilterChange(value)
    });
    this.children!.listView.initialize({
      listElement: this.elements!.notesList,
      onNoteSelect: (noteId: string) => this._handleNoteSelect(noteId)
    });
    this.children!.editorView.initialize({
      editorElement: this.elements!.notesEditor,
      titleInput: this.elements!.notesTitleInput,
      contentArea: this.elements!.notesContentArea,
      deleteBtn: this.elements!.notesDeleteBtn,
      gameTagRow: this.elements!.notesGameTagRow,
      gameTag: this.elements!.notesGameTag,
      gameInput: this.elements!.notesGameInput,
      gameAddBtn: this.elements!.notesGameAddBtn,
      onSave: () => this._saveCurrentNote(),
      onDelete: () => this._deleteCurrentNote(),
      onShowGameInput: () => this._showGameInput()
    });
    this.children!.gameAutocomplete.initialize({
      gameInput: this.elements!.notesGameInput,
      autocompleteDropdown: this.elements!.notesGameAutocomplete,
      onInput: () => this._handleGameInputChange(),
      onSelect: (value: string) => this._handleAutocompleteSelect(value),
      onEnter: () => this._handleAutocompleteEnter(),
      onEscape: () => this._handleAutocompleteEscape(),
      onBlur: () => this.children!.editorView.hideGameInput()
    });
    this.children!.resizeHandler.initialize({
      listToggle: this.elements!.notesListToggle,
      panelElement: this.elements!.notesPanel,
      panelContent: this.elements!.notesPanelContent,
      listWrapper: this.elements!.notesListWrapper
    });
    this._refreshGameFilterOptionsAndRenderList();
  }

  toggle(): void {
    if (this.isVisible) this.hide();
    else this.show();
  }

  show(): void {
    if (!this.elements?.notesPanel) return;

    this.children!.layout.updatePosition();
    this.elements.notesPanel.classList.add(CSSClasses.VISIBLE);
    this.elements.notesBtn?.classList.add(CSSClasses.PANEL_OPEN);
    this.elements.notesBtn?.setAttribute('aria-expanded', 'true');
    this.isVisible = true;
    this.children!.searchComponent.focus();
    this.logger?.debug('Notes panel shown');
  }

  hide(): void {
    if (!this.elements?.notesPanel) return;

    this.children!.editorView.flushSave();
    this.children!.gameFilter.hide();
    this.elements.notesPanel.classList.remove(CSSClasses.VISIBLE);
    this.elements.notesBtn?.classList.remove(CSSClasses.PANEL_OPEN);
    this.elements.notesBtn?.setAttribute('aria-expanded', 'false');
    this.isVisible = false;
    this.logger?.debug('Notes panel hidden');
  }

  _handleSearch(query: string): void {
    this.children!.listView.render(query);
  }

  _handleGameFilterChange(value: string): void {
    this.children!.listView.setGameFilter(value);
    this.children!.listView.render(this.children!.searchComponent.getQuery());
  }

  _refreshGameFilterOptionsAndRenderList(searchQuery = ''): string {
    this.children!.gameFilter.updateOptions();
    const normalizedGameFilter = this.children!.gameFilter.getCurrentFilter();
    this.children!.listView.setGameFilter(normalizedGameFilter);
    this.children!.listView.render(searchQuery);
    return normalizedGameFilter;
  }

  _selectFirstNoteForFilter(gameFilter: string, searchQuery = ''): void {
    const notes = this.notesService!.searchNotes(searchQuery, gameFilter);
    if (notes.length > 0) {
      this._selectNote(notes[0].id);
    }
  }

  _handleNoteSelect(noteId: string): void {
    this.children!.editorView.flushSave();
    this._selectNote(noteId);
  }

  _restoreSelectedNote(): void {
    if (!this.currentNoteId) {
      this.children!.listView.setCurrentNoteId(null);
      this.children!.listView.updateActiveState(null);
      return;
    }

    const note = this.notesService!.getNote(this.currentNoteId);
    if (!note) {
      this.currentNoteId = null;
      this.children!.editorView.clear();
      this.children!.listView.setCurrentNoteId(null);
      this.children!.listView.updateActiveState(null);
      return;
    }

    this._loadNoteIntoViews(note);
  }

  _handleGameInputChange(): void {
    this.children!.editorView.scheduleSave();
  }

  _showGameInput(): void {
    this.children!.editorView.showGameInput();
  }

  _handleAutocompleteSelect(_value: string): void {
    this.children!.editorView.scheduleSave();
    this.children!.editorView.hideGameInput();
    this.children!.editorView.flushSave();
  }

  _handleAutocompleteEnter(): void {
    this.children!.editorView.hideGameInput();
    this.children!.editorView.flushSave();
  }

  _handleAutocompleteEscape(): void {
    this.children!.editorView.hideGameInput();
  }

  _saveCurrentNote(): void {
    if (!this.currentNoteId) return;

    const { title, content, gameName } = this.children!.editorView.getValues();
    const result = this.notesService!.updateNote(this.currentNoteId, { title, content, gameName });
    if (!result) {
      this.logger?.warn('Failed to save note - may have been deleted');
      return;
    }
  }

  _setupNewButton(setupDisposers: Array<() => void>): void {
    if (!this.elements?.notesNewBtn) return;
    setupDisposers.push(this.listen(this.elements.notesNewBtn, 'click', () => this._createNewNote()));
  }

  _createNewNote(): void {
    this.children!.editorView.flushSave();
    const gameName = this.children!.gameFilter.getCurrentFilter() || '';
    const note = this.notesService!.createNote('', '', gameName);
    if (!note) {
      this.logger?.error('Failed to create note');
      return;
    }

    this._selectNote(note.id);
    this.children!.editorView.focusTitle();
  }

  _deleteCurrentNote(): void {
    if (!this.currentNoteId) return;

    this.children!.editorView.flushSave();
    const success = this.notesService!.deleteNote(this.currentNoteId);
    if (!success) {
      this.logger?.warn('Failed to delete note');
      return;
    }
  }

  _selectNote(noteId: string | null | undefined): void {
    if (!noteId) return;
    const note = this.notesService!.getNote(noteId);
    if (!note) return;

    this._loadNoteIntoViews(note);
    this.logger?.debug(`Selected note: ${noteId}`);
  }

  _loadNoteIntoViews(note: UserNote): void {
    this.currentNoteId = note.id || null;
    this.children!.editorView.loadNote(note);
    this.children!.listView.setCurrentNoteId(note.id || null);
    this.children!.listView.updateActiveState(note.id || null);
  }

  _setupEscapeKey(setupDisposers: Array<() => void>): void {
    setupDisposers.push(this.listen(document, 'keydown', (event) => {
      const keyboardEvent = event as KeyboardEvent;
      if (keyboardEvent.key === 'Escape' && this.isVisible) {
        if (this.children?.gameFilter.isGameFilterOpen) {
          this.children!.gameFilter.hide();
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
          if (note.id !== this.currentNoteId) {
            this._refreshGameFilterOptionsAndRenderList(this.children!.searchComponent.getQuery());
          }
        }),
        (error) => this.logger?.warn('Error unsubscribing from event', error)
      )
    );

    this.replaceManaged(
      NOTES_DELETED_SUBSCRIPTION,
      this.trackSubscription(
        this.eventBus!.subscribe(EventChannels.NOTES.NOTE_DELETED, (payload) => {
          const searchQuery = this.children!.searchComponent.getQuery();
          const currentFilter = this._refreshGameFilterOptionsAndRenderList(searchQuery);
          if (payload.id === this.currentNoteId) {
            this.children!.editorView.cancelPendingSave();
            this.currentNoteId = null;
            this.children!.editorView.clear();
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
            this._refreshGameFilterOptionsAndRenderList(this.children!.searchComponent.getQuery());
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
    try {
      await disposeInOrder([
        () => this.children?.editorView.flushSave(),
        () => this.cancelManaged(NOTES_PANEL_SUBCOMPONENT_LIFECYCLE),
        () => super.dispose()
      ]);
    } finally {
      this.elements = null;
      this.notesService = null;
      this.eventBus = null;
      this.logger = null;
      this.currentNoteId = null;
      this.isVisible = false;
    }
  }
}

export { NotesPanelComponent };
