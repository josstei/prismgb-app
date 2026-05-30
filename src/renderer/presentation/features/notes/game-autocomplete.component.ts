import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { ComboboxListboxController } from '@renderer/presentation/primitives/combobox-listbox.class.js';
import { NotesPanelConfig } from '@renderer/presentation/config/notes-panel.config';
import type { LoggerLike } from '@prismgb/core';

const AUTOCOMPLETE_DEBOUNCE_MS = 100;

interface NotesGameServiceLike {
  getUniqueGames?(): string[];
}

type AutocompleteCallback = () => void;
type AutocompleteSelectCallback = (value: string) => void;

export interface GameAutocompleteComponentOptions {
  notesService: NotesGameServiceLike;
  logger?: LoggerLike | null;
}

export interface GameAutocompleteInitializeOptions {
  gameInput?: HTMLInputElement | null;
  autocompleteDropdown?: HTMLElement | null;
  onInput?: AutocompleteCallback | null;
  onSelect?: AutocompleteSelectCallback | null;
  onEnter?: AutocompleteCallback | null;
  onEscape?: AutocompleteCallback | null;
  onBlur?: AutocompleteCallback | null;
  onFocus?: AutocompleteCallback | null;
}

class GameAutocompleteComponent extends PresentationComponent {
  declare notesService: NotesGameServiceLike | null;
  declare logger: LoggerLike | null | undefined;
  declare gameInput: HTMLInputElement | null | undefined;
  declare autocompleteDropdown: HTMLElement | null | undefined;
  declare comboboxController: ComboboxListboxController<string> | null;
  declare onInput: AutocompleteCallback | null | undefined;
  declare onSelect: AutocompleteSelectCallback | null | undefined;
  declare onEnter: AutocompleteCallback | null | undefined;
  declare onEscape: AutocompleteCallback | null | undefined;
  declare onBlur: AutocompleteCallback | null | undefined;
  declare onFocus: AutocompleteCallback | null | undefined;

  constructor({ notesService, logger }: GameAutocompleteComponentOptions) {
    super();
    this.notesService = notesService;
    this.logger = logger;
    this.gameInput = null;
    this.autocompleteDropdown = null;
    this.comboboxController = null;
  }

  initialize({
    gameInput,
    autocompleteDropdown,
    onInput,
    onSelect,
    onEnter,
    onEscape,
    onBlur,
    onFocus
  }: GameAutocompleteInitializeOptions): void {
    void this.comboboxController?.dispose();
    this.comboboxController = null;
    this.gameInput = gameInput;
    this.autocompleteDropdown = autocompleteDropdown;
    this.onInput = onInput;
    this.onSelect = onSelect;
    this.onEnter = onEnter;
    this.onEscape = onEscape;
    this.onBlur = onBlur;
    this.onFocus = onFocus;

    if (!this.gameInput || !this.autocompleteDropdown) {
      this.logger?.warn('Game autocomplete elements not found');
      return;
    }

    this.comboboxController = new ComboboxListboxController<string>({
      logger: this.logger,
      optionSelector: '.notes-game-autocomplete-item',
      optionClassName: 'notes-game-autocomplete-item',
      optionIdPrefix: 'autocomplete-option',
      listboxAriaLabel: 'Game suggestions',
      debounceMs: AUTOCOMPLETE_DEBOUNCE_MS,
      blurDelayMs: NotesPanelConfig.BLUR_DELAY_MS,
      getOptions: (query) => this._getMatchingGames(query),
      getOptionValue: (game) => game,
      getOptionLabel: (game) => game,
      onInput: () => this.onInput?.(),
      onSelect: (value) => this.onSelect?.(value),
      onEnter: () => this.onEnter?.(),
      onEscape: () => this.onEscape?.(),
      onBlur: () => this.onBlur?.(),
      onFocus: () => this.onFocus?.()
    });
    this.comboboxController.initialize({
      inputElement: this.gameInput,
      listboxElement: this.autocompleteDropdown
    });
  }

  getValue(): string {
    return this.comboboxController?.getValue() || this.gameInput?.value || '';
  }

  setValue(value: string | null | undefined): void {
    if (this.comboboxController) {
      this.comboboxController.setValue(value);
      return;
    }

    if (this.gameInput) {
      this.gameInput.value = value ?? '';
    }
  }

  show(): void {
    this.comboboxController?.show();
  }

  hide(): void {
    this.comboboxController?.hide();
  }

  isVisible(): boolean {
    return this.comboboxController?.isVisible() || false;
  }

  getHighlightedIndex(): number {
    return this.comboboxController?.getHighlightedIndex() ?? -1;
  }

  focus(): void {
    if (this.comboboxController) {
      this.comboboxController.focus();
      return;
    }
    this.gameInput?.focus();
  }

  select(): void {
    if (this.comboboxController) {
      this.comboboxController.select();
      return;
    }
    this.gameInput?.select();
  }

  _getMatchingGames(query: string): string[] {
    const normalizedQuery = String(query || '').toLowerCase().trim();
    const games = this.notesService?.getUniqueGames?.() || [];
    return normalizedQuery
      ? games.filter((game) => game.toLowerCase().includes(normalizedQuery))
      : games;
  }

  override async dispose(): Promise<void> {
    await this.comboboxController?.dispose();
    this.comboboxController = null;
    await super.dispose();
    this.gameInput = null;
    this.autocompleteDropdown = null;
    this.onInput = null;
    this.onSelect = null;
    this.onEnter = null;
    this.onEscape = null;
    this.onBlur = null;
    this.onFocus = null;
    this.notesService = null;
    this.logger = null;
  }
}

export { GameAutocompleteComponent };
