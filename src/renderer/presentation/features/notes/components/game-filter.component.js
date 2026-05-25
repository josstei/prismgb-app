/**
 * Game Filter Component
 *
 * Handles game filter dropdown functionality, including:
 * - Game filter dropdown UI
 * - Filter state management
 * - Option rendering and selection
 * - Keyboard navigation
 */

import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { ListboxDropdownController } from '@renderer/presentation/primitives/listbox-dropdown.class.js';
import { renderListboxOptions } from '@renderer/presentation/primitives/listbox.utils.js';

const FILTER_SETUP_LIFECYCLE = Symbol('notesGameFilterSetupLifecycle');

class GameFilterComponent extends PresentationComponent {
  constructor({ notesService, logger }) {
    super();
    this.notesService = notesService;
    this.logger = logger;

    // Filter state
    this.currentGameFilter = '';
    this.isGameFilterOpen = false;
    this._filterDropdown = null;

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
    this.cancelManaged(FILTER_SETUP_LIFECYCLE);
    this.isGameFilterOpen = false;
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

    this.replaceManaged(FILTER_SETUP_LIFECYCLE, () => {
      this._filterDropdown?.hide();
      this._filterDropdown?.dispose();
      this._filterDropdown = null;
      this.isGameFilterOpen = false;
    });

    this._filterDropdown = new ListboxDropdownController({
      triggerElement: this.filterButton,
      menuElement: this.filterMenu,
      labelElement: this.filterLabel,
      optionSelector: '.notes-game-filter-option',
      outsideEvent: 'pointerdown',
      closeOnEscape: false,
      ignoreOutsideSelectors: ['.notes-filter-wrapper'],
      enableTriggerKeyboard: true,
      focusOnTriggerOpen: true,
      onChange: (value, label) => {
        this._selectGameFilterOption(value, label);
      },
      onShow: () => {
        this.isGameFilterOpen = true;
      },
      onHide: () => {
        this.isGameFilterOpen = false;
      },
      logger: this.logger
    });
    this._filterDropdown.initialize({ activeValue: this.currentGameFilter });
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
    this._filterDropdown?.setActive(this.currentGameFilter);
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
      return;
    }

    this.currentGameFilter = nextValue;
    this._updateGameFilterLabel(label);
    this._updateGameFilterActiveState();

    this.onFilterChange?.(nextValue, label);
  }

  /**
   * Toggle the filter menu
   * @private
   */
  _toggleGameFilterMenu() {
    this._filterDropdown?.toggle();
  }

  /**
   * Show the filter menu
   * @private
   */
  _showGameFilterMenu() {
    this._filterDropdown?.show();
  }

  /**
   * Hide the filter menu
   * @private
   */
  _hideGameFilterMenu() {
    this._filterDropdown?.hide();
  }

  /**
   * Cleanup resources
   */
  dispose() {
    super.dispose();

    // Clear references
    this.filterButton = null;
    this.filterLabel = null;
    this.filterMenu = null;
    this.onFilterChange = null;
    this.notesService = null;
    this.logger = null;
    this.currentGameFilter = '';
    this.isGameFilterOpen = false;
    this._filterDropdown = null;
  }
}

export { GameFilterComponent };
