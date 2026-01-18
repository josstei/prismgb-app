/**
 * Game Autocomplete Component
 *
 * Handles game autocomplete functionality, including:
 * - Game input handling
 * - Autocomplete dropdown
 * - Keyboard navigation
 * - Item selection
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@shared/config/css-classes.config.js';
import { escapeHtml } from '@shared/utils/string.utils.js';
import { NotesPanelConfig } from '@shared/config/notes-panel.config.js';

// Autocomplete debounce
const AUTOCOMPLETE_DEBOUNCE_MS = 100;

class GameAutocompleteComponent {
  constructor({ notesService, logger }) {
    this.notesService = notesService;
    this.logger = logger;

    // Autocomplete state
    this.autocompleteHighlightIndex = -1;

    // Debounce timer
    this._autocompleteTimeout = null;

    // Blur timer (tracked for cleanup)
    this._blurTimerId = null;

    // Track DOM listeners for cleanup
    this._domListeners = createDomListenerManager({ logger });

    // Elements
    this.gameInput = null;
    this.autocompleteDropdown = null;
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

    this._setupGameInput();
  }

  /**
   * Get current input value
   * @returns {string}
   */
  getValue() {
    return this.gameInput?.value || '';
  }

  /**
   * Set input value
   * @param {string} value
   */
  setValue(value) {
    if (this.gameInput) {
      this.gameInput.value = value;
    }
  }

  /**
   * Show autocomplete dropdown
   */
  show() {
    this._showAutocomplete();
  }

  /**
   * Hide autocomplete dropdown
   */
  hide() {
    this._hideAutocomplete();
  }

  /**
   * Check if autocomplete is visible
   * @returns {boolean}
   */
  isVisible() {
    return this.autocompleteDropdown?.classList.contains(CSSClasses.VISIBLE) || false;
  }

  /**
   * Get highlighted index
   * @returns {number}
   */
  getHighlightedIndex() {
    return this.autocompleteHighlightIndex;
  }

  /**
   * Focus game input
   */
  focus() {
    this.gameInput?.focus();
  }

  /**
   * Select all text in game input
   */
  select() {
    this.gameInput?.select();
  }

  /**
   * Setup game input with autocomplete
   * @private
   */
  _setupGameInput() {
    if (!this.gameInput) return;

    // Add combobox ARIA attributes
    this.gameInput.setAttribute('role', 'combobox');
    this.gameInput.setAttribute('aria-autocomplete', 'list');
    this.gameInput.setAttribute('aria-expanded', 'false');
    this.gameInput.setAttribute('aria-controls', 'notesGameAutocomplete');

    // Autocomplete on input
    this._domListeners.add(this.gameInput, 'input', () => {
      this._scheduleAutocomplete();
      this.onInput?.();
    });

    // Keyboard navigation
    this._domListeners.add(this.gameInput, 'keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        // Check if autocomplete has a highlighted item to select
        const isAutocompleteVisible = this.isVisible();
        if (isAutocompleteVisible && this.autocompleteHighlightIndex >= 0) {
          const items = this.autocompleteDropdown.querySelectorAll('.notes-game-autocomplete-item');
          const selectedItem = items[this.autocompleteHighlightIndex];
          if (selectedItem) {
            this._selectAutocompleteItem(selectedItem.dataset.value);
            return;
          }
        }
        // No highlighted item - trigger onEnter callback
        this.onEnter?.();
        return;
      }
      if (e.key === 'Escape') {
        this._hideAutocomplete();
        this.onEscape?.();
        return;
      }
      this._handleAutocompleteKeydown(e);
    });

    // Delay hiding autocomplete on blur to allow click events on dropdown items
    // to fire before the dropdown is hidden. 150ms is sufficient for most click
    // interactions while still feeling responsive.
    // See: https://stackoverflow.com/questions/17769005/onclick-and-onblur-ordering-issue
    this._domListeners.add(this.gameInput, 'blur', () => {
      this._blurTimerId = setTimeout(() => {
        this._blurTimerId = null;
        this._hideAutocomplete();
        this.onBlur?.();
      }, NotesPanelConfig.BLUR_DELAY_MS);
    });

    // Show autocomplete on focus (cancel any pending blur timer to prevent race condition)
    this._domListeners.add(this.gameInput, 'focus', () => {
      if (this._blurTimerId) {
        clearTimeout(this._blurTimerId);
        this._blurTimerId = null;
      }
      this._showAutocomplete();
      this.onFocus?.();
    });

    // Delegated selection handler for autocomplete items (avoids untracked listeners)
    if (this.autocompleteDropdown) {
      const handleAutocompleteSelect = (e) => {
        const target = e.target instanceof Element ? e.target : e.target?.parentElement;
        const item = target?.closest('.notes-game-autocomplete-item');
        if (!item) return;

        // Prevent blur from cancelling the selection before it applies.
        e.preventDefault();
        this._selectAutocompleteItem(item.dataset.value);
      };

      this._domListeners.add(this.autocompleteDropdown, 'pointerdown', handleAutocompleteSelect);
      this._domListeners.add(this.autocompleteDropdown, 'click', handleAutocompleteSelect);
    }
  }

  /**
   * Schedule autocomplete update with debounce
   * @private
   */
  _scheduleAutocomplete() {
    if (this._autocompleteTimeout) {
      clearTimeout(this._autocompleteTimeout);
    }

    this._autocompleteTimeout = setTimeout(() => {
      this._autocompleteTimeout = null;
      this._showAutocomplete();
    }, AUTOCOMPLETE_DEBOUNCE_MS);
  }

  /**
   * Show autocomplete dropdown
   * @private
   */
  _showAutocomplete() {
    if (!this.autocompleteDropdown || !this.gameInput) return;

    const query = this.gameInput.value.toLowerCase().trim();
    const games = this.notesService.getUniqueGames();

    // Filter games matching query
    const matches = query
      ? games.filter(g => g.toLowerCase().includes(query))
      : games;

    if (matches.length === 0) {
      this._hideAutocomplete();
      return;
    }

    this.autocompleteHighlightIndex = -1;

    // Add listbox role to container
    this.autocompleteDropdown.setAttribute('role', 'listbox');
    this.autocompleteDropdown.setAttribute('aria-label', 'Game suggestions');

    this.autocompleteDropdown.innerHTML = matches
      .map((game, i) => `<div class="notes-game-autocomplete-item" data-index="${i}" data-value="${escapeHtml(game)}" role="option" id="autocomplete-option-${i}" aria-selected="false">${escapeHtml(game)}</div>`)
      .join('');

    // Click handlers use event delegation (see _setupGameInput)
    this.autocompleteDropdown.classList.add(CSSClasses.VISIBLE);

    // Update aria-expanded on input
    this.gameInput.setAttribute('aria-expanded', 'true');
  }

  /**
   * Hide autocomplete dropdown
   * @private
   */
  _hideAutocomplete() {
    this.autocompleteDropdown?.classList.remove(CSSClasses.VISIBLE);
    this.autocompleteHighlightIndex = -1;

    // Update aria-expanded on input
    if (this.gameInput) {
      this.gameInput.setAttribute('aria-expanded', 'false');
      this.gameInput.removeAttribute('aria-activedescendant');
    }
  }

  /**
   * Handle keyboard navigation in autocomplete
   * @param {KeyboardEvent} e
   * @private
   */
  _handleAutocompleteKeydown(e) {
    const items = this.autocompleteDropdown?.querySelectorAll('.notes-game-autocomplete-item');
    if (!items || items.length === 0) return;

    const isVisible = this.isVisible();
    if (!isVisible) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.autocompleteHighlightIndex = Math.min(this.autocompleteHighlightIndex + 1, items.length - 1);
      this._updateAutocompleteHighlight(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.autocompleteHighlightIndex = Math.max(this.autocompleteHighlightIndex - 1, 0);
      this._updateAutocompleteHighlight(items);
    } else if (e.key === 'Enter' && this.autocompleteHighlightIndex >= 0) {
      e.preventDefault();
      const selectedItem = items[this.autocompleteHighlightIndex];
      if (selectedItem) {
        this._selectAutocompleteItem(selectedItem.dataset.value);
      }
    } else if (e.key === 'Escape') {
      this._hideAutocomplete();
    }
  }

  /**
   * Update autocomplete highlight
   * @param {NodeList} items
   * @private
   */
  _updateAutocompleteHighlight(items) {
    items.forEach((item, i) => {
      const isHighlighted = i === this.autocompleteHighlightIndex;
      item.classList.toggle('highlighted', isHighlighted);
      item.setAttribute('aria-selected', isHighlighted ? 'true' : 'false');
    });

    // Update aria-activedescendant on input
    if (this.autocompleteHighlightIndex >= 0 && items[this.autocompleteHighlightIndex]) {
      this.gameInput.setAttribute('aria-activedescendant', items[this.autocompleteHighlightIndex].id);
    } else {
      this.gameInput.removeAttribute('aria-activedescendant');
    }
  }

  /**
   * Select an autocomplete item
   * @param {string} value
   * @private
   */
  _selectAutocompleteItem(value) {
    if (this.gameInput) {
      this.gameInput.value = value;
    }
    this._hideAutocomplete();
    this.onSelect?.(value);
  }

  /**
   * Cleanup resources
   */
  dispose() {
    // Clear timers
    if (this._autocompleteTimeout) {
      clearTimeout(this._autocompleteTimeout);
      this._autocompleteTimeout = null;
    }
    if (this._blurTimerId) {
      clearTimeout(this._blurTimerId);
      this._blurTimerId = null;
    }

    // Remove DOM listeners
    this._domListeners.removeAll();

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
    this.autocompleteHighlightIndex = -1;
  }
}

export { GameAutocompleteComponent };
