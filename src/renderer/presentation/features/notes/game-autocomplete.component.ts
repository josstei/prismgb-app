import { PresentationComponent, ComboboxListboxController } from '@platform/ui-base';
import { NotesPanelConfig } from '@renderer/presentation/config/notes-panel.config';
import type { LoggerLike } from '@platform/core';

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
}

class GameAutocompleteComponent extends PresentationComponent {
  notesService: NotesGameServiceLike | null;
  logger: LoggerLike | null | undefined;
  gameInput: HTMLInputElement | null | undefined;
  autocompleteDropdown: HTMLElement | null | undefined;
  comboboxController: ComboboxListboxController<string> | null;
  onInput: AutocompleteCallback | null | undefined;
  onSelect: AutocompleteSelectCallback | null | undefined;
  onEnter: AutocompleteCallback | null | undefined;
  onEscape: AutocompleteCallback | null | undefined;
  onBlur: AutocompleteCallback | null | undefined;

  constructor(options: GameAutocompleteComponentOptions) {
    super();
    this.notesService = options.notesService;
    this.logger = options.logger;
    this.gameInput = null;
    this.autocompleteDropdown = null;
    this.comboboxController = null;
  }

  initialize(options: GameAutocompleteInitializeOptions): void {
    void this.comboboxController?.dispose();
    this.comboboxController = null;
    this.gameInput = options.gameInput;
    this.autocompleteDropdown = options.autocompleteDropdown;
    this.onInput = options.onInput;
    this.onSelect = options.onSelect;
    this.onEnter = options.onEnter;
    this.onEscape = options.onEscape;
    this.onBlur = options.onBlur;

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
      onBlur: () => this.onBlur?.()
    });
    this.comboboxController.initialize({
      inputElement: this.gameInput,
      listboxElement: this.autocompleteDropdown
    });
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
    this.notesService = null;
    this.logger = null;
  }
}

export { GameAutocompleteComponent };
