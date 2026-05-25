/**
 * Game Autocomplete Component
 *
 * Notes-specific wrapper around a reusable combobox/listbox controller.
 */

import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { ComboboxListboxController } from '@renderer/presentation/primitives/listbox-dropdown.class.js';
import { NotesPanelConfig } from '@renderer/presentation/config/notes-panel.config';

const AUTOCOMPLETE_DEBOUNCE_MS = 100;

class GameAutocompleteComponent extends PresentationComponent {
  constructor({ notesService, logger }) {
    super();
    this.notesService = notesService;
    this.logger = logger;

    // Elements
    this.gameInput = null;
    this.autocompleteDropdown = null;
    this.comboboxController = null;
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} options
   * @param {HTMLInputElement} options.gameInput - Game input element
   * @param {HTMLElement} options.autocompleteDropdown - Autocomplete dropdown element
   * @param {Function} options.onInput - Callback when input changes
   * @param {Function} options.onSelect - Callback when item is selected (value)
   * @param {Function} options.onEnter - Callback when Enter is pressed without selection
   * @param {Function} options.onEscape - Callback when Escape is pressed
   * @param {Function} options.onBlur - Callback when input loses focus
   * @param {Function} options.onFocus - Callback when input gains focus
   */
  initialize({
    gameInput,
    autocompleteDropdown,
    onInput,
    onSelect,
    onEnter,
    onEscape,
    onBlur,
    onFocus
  }) {
    this.comboboxController?.dispose();
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

    this.comboboxController = new ComboboxListboxController({
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

  /**
   * Get current input value
   * @returns {string}
   */
  getValue() {
    return this.comboboxController?.getValue() || this.gameInput?.value || '';
  }

  /**
   * Set input value
   * @param {string} value
   */
  setValue(value) {
    if (this.comboboxController) {
      this.comboboxController.setValue(value);
      return;
    }

    if (this.gameInput) {
      this.gameInput.value = value ?? '';
    }
  }

  /**
   * Show autocomplete dropdown
   */
  show() {
    this.comboboxController?.show();
  }

  /**
   * Hide autocomplete dropdown
   */
  hide() {
    this.comboboxController?.hide();
  }

  /**
   * Check if autocomplete is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.comboboxController?.isVisible() || false;
  }

  /**
   * Get highlighted index
   * @returns {number}
   */
  getHighlightedIndex() {
    return this.comboboxController?.getHighlightedIndex() ?? -1;
  }

  /**
   * Focus game input
   */
  focus() {
    if (this.comboboxController) {
      this.comboboxController.focus();
      return;
    }

    this.gameInput?.focus();
  }

  /**
   * Select all text in game input
   */
  select() {
    if (this.comboboxController) {
      this.comboboxController.select();
      return;
    }

    this.gameInput?.select();
  }

  /**
   * Filter unique games by query
   * @param {string} query
   * @returns {string[]}
   * @private
   */
  _getMatchingGames(query) {
    const normalizedQuery = String(query || '').toLowerCase().trim();
    const games = this.notesService?.getUniqueGames?.() || [];

    if (!normalizedQuery) {
      return games;
    }

    return games.filter((game) => game.toLowerCase().includes(normalizedQuery));
  }

  /**
   * Cleanup resources
   */
  dispose() {
    this.comboboxController?.dispose();
    this.comboboxController = null;

    super.dispose();

    // Clear references
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
