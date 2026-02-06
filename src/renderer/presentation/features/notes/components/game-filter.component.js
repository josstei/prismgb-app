/**
 * Game Filter Component
 *
 * Handles game filter dropdown functionality, including:
 * - Game filter dropdown UI
 * - Filter state management
 * - Option rendering and selection
 * - Keyboard navigation
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';
import { CSSClasses } from '@renderer/presentation/config/css-classes.config.ts';
import { DisclosureController } from '@renderer/presentation/primitives/disclosure.class.js';
import { renderListboxOptions, updateListboxActiveState } from '@renderer/presentation/primitives/listbox.utils.js';

class GameFilterComponent {
  constructor({ notesService, logger }) {
    this.notesService = notesService;
    this.logger = logger;

    // Filter state
    this.currentGameFilter = '';
    this.isGameFilterOpen = false;
    this._menuDisclosure = null;

    // Track DOM listeners for cleanup
    this._domListeners = createDomListenerManager({ logger });

    // Elements
    this.filterButton = null;
    this.filterLabel = null;
    this.filterMenu = null;
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} options
   * @param {HTMLButtonElement} options.filterButton - Filter button element
   * @param {HTMLElement} options.filterLabel - Filter label element
   * @param {HTMLElement} options.filterMenu - Filter menu element
   * @param {Function} options.onFilterChange - Callback when filter changes (value, label)
   */
  initialize({ filterButton, filterLabel, filterMenu, onFilterChange }) {
    this.filterButton = filterButton;
    this.filterLabel = filterLabel;
    this.filterMenu = filterMenu;
    this.onFilterChange = onFilterChange;

    if (!this.filterButton || !this.filterMenu) {
      this.logger?.warn('Game filter elements not found');
      return;
    }

    this._setupGameFilter();
    this.updateOptions();
  }

  /**
   * Get current filter value
   * @returns {string}
   */
  getCurrentFilter() {
    return this.currentGameFilter;
  }

  /**
   * Set current filter value
   * @param {string} value
   */
  setCurrentFilter(value) {
    this.currentGameFilter = value || '';
    this._updateGameFilterLabel();
    this._updateGameFilterActiveState();
  }

  /**
   * Update filter options from service
   */
  updateOptions() {
    if (!this.filterMenu) return;

    const games = this.notesService.getUniqueGames();

    // If current filter is no longer valid, reset it
    if (this.currentGameFilter && !games.includes(this.currentGameFilter)) {
      this.currentGameFilter = '';
    }

    renderListboxOptions({
      container: this.filterMenu,
      options: [
        { value: '', label: 'All Games' },
        ...games.map((game) => ({ value: game, label: game }))
      ],
      createOption: (option) => this._createGameFilterOption(option.value, option.label)
    });

    this._updateGameFilterActiveState();
    this._updateGameFilterLabel();
  }

  /**
   * Hide filter menu
   */
  hide() {
    this._hideGameFilterMenu();
  }

  /**
   * Setup game filter dropdown
   * @private
   */
  _setupGameFilter() {
    if (!this.filterButton || !this.filterMenu) return;

    this._setupFilterDisclosure();

    // Button click
    this._domListeners.add(this.filterButton, 'click', (event) => {
      event.preventDefault();
      this._toggleGameFilterMenu();
    });

    // Button keyboard
    this._domListeners.add(this.filterButton, 'keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        this._toggleGameFilterMenu();
        return;
      }

      if (event.key === 'ArrowDown') {
        event.preventDefault();
        this._showGameFilterMenu();
        this._focusCurrentGameFilterOption();
      }
    });

    // Menu click
    this._domListeners.add(this.filterMenu, 'click', (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const option = target?.closest('.notes-game-filter-option');
      if (!option) return;

      this._selectGameFilterOption(option.dataset.value, option.textContent || '');
    });

  }

  /**
   * Setup filter menu disclosure behavior
   * @private
   */
  _setupFilterDisclosure() {
    if (!this.filterButton || !this.filterMenu) return;

    this._menuDisclosure = new DisclosureController({
      toggleElement: this.filterButton,
      panelElement: this.filterMenu,
      visibleClass: CSSClasses.VISIBLE,
      outsideEvent: 'pointerdown',
      ignoreOutsideSelectors: ['.notes-filter-wrapper'],
      onShow: () => {
        this.isGameFilterOpen = true;
      },
      onHide: () => {
        this.isGameFilterOpen = false;
      },
      logger: this.logger
    });

    this._menuDisclosure.initialize();
  }

  /**
   * Sync game filter label with the selected option
   * @private
   */
  _updateGameFilterLabel(labelOverride = '') {
    if (!this.filterLabel) return;

    const label = labelOverride || this.currentGameFilter || 'All Games';
    this.filterLabel.textContent = label;
  }

  /**
   * Create a filter option button
   * @param {string} value - Game filter value
   * @param {string} label - Display label
   * @returns {HTMLButtonElement}
   * @private
   */
  _createGameFilterOption(value, label) {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'notes-game-filter-option';
    option.dataset.value = value;
    option.setAttribute('role', 'option');
    option.textContent = label;
    return option;
  }

  /**
   * Update active state in the filter menu
   * @private
   */
  _updateGameFilterActiveState() {
    updateListboxActiveState({
      container: this.filterMenu,
      optionSelector: '.notes-game-filter-option',
      activeValue: this.currentGameFilter
    });
  }

  /**
   * Select a game filter option
   * @param {string} value - Selected game value
   * @param {string} label - Selected label
   * @private
   */
  _selectGameFilterOption(value, label) {
    const nextValue = value || '';
    if (this.currentGameFilter === nextValue) {
      this._hideGameFilterMenu();
      return;
    }

    this.currentGameFilter = nextValue;
    this._updateGameFilterLabel(label);
    this._updateGameFilterActiveState();
    this._hideGameFilterMenu();

    this.onFilterChange?.(nextValue, label);
  }

  /**
   * Toggle the filter menu
   * @private
   */
  _toggleGameFilterMenu() {
    if (this.isGameFilterOpen) {
      this._hideGameFilterMenu();
      return;
    }

    this._showGameFilterMenu();
    this._focusCurrentGameFilterOption();
  }

  /**
   * Show the filter menu
   * @private
   */
  _showGameFilterMenu() {
    this._menuDisclosure?.show();
  }

  /**
   * Hide the filter menu
   * @private
   */
  _hideGameFilterMenu() {
    this._menuDisclosure?.hide();
  }

  /**
   * Focus the current or first option in the filter menu
   * @private
   */
  _focusCurrentGameFilterOption() {
    if (!this.filterMenu) return;

    const activeOption = this.filterMenu.querySelector('.notes-game-filter-option.active');
    const option = activeOption || this.filterMenu.querySelector('.notes-game-filter-option');
    option?.focus();
  }

  /**
   * Cleanup resources
   */
  dispose() {
    // Remove DOM listeners
    this._domListeners.removeAll();
    this._menuDisclosure?.dispose();
    this._menuDisclosure = null;

    // Clear references
    this.filterButton = null;
    this.filterLabel = null;
    this.filterMenu = null;
    this.onFilterChange = null;
    this.notesService = null;
    this.logger = null;
    this.currentGameFilter = '';
    this.isGameFilterOpen = false;
  }
}

export { GameFilterComponent };
