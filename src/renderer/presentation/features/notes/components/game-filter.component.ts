import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
import { ListboxDropdownController } from '@renderer/presentation/primitives/listbox-dropdown.class.js';
import { renderListboxOptions } from '@renderer/presentation/primitives/listbox.utils.js';
import type { LoggerLike } from '@shared/interfaces/infrastructure.types.js';

const FILTER_SETUP_LIFECYCLE = Symbol('notesGameFilterSetupLifecycle');

interface NotesGameServiceLike {
  getUniqueGames(): string[];
}

export interface GameFilterComponentOptions {
  notesService: NotesGameServiceLike;
  logger?: LoggerLike | null;
}

export interface GameFilterInitializeOptions {
  filterButton?: HTMLElement | null;
  filterLabel?: HTMLElement | null;
  filterMenu?: HTMLElement | null;
  onFilterChange?: ((value: string, label: string) => void) | null;
}

class GameFilterComponent extends PresentationComponent {
  declare notesService: NotesGameServiceLike | null;
  declare logger: LoggerLike | null | undefined;
  declare currentGameFilter: string;
  declare isGameFilterOpen: boolean;
  declare _filterDropdown: ListboxDropdownController | null;
  declare filterButton: HTMLElement | null | undefined;
  declare filterLabel: HTMLElement | null | undefined;
  declare filterMenu: HTMLElement | null | undefined;
  declare onFilterChange: ((value: string, label: string) => void) | null | undefined;

  constructor({ notesService, logger }: GameFilterComponentOptions) {
    super();
    this.notesService = notesService;
    this.logger = logger;
    this.currentGameFilter = '';
    this.isGameFilterOpen = false;
    this._filterDropdown = null;
    this.filterButton = null;
    this.filterLabel = null;
    this.filterMenu = null;
  }

  initialize({ filterButton, filterLabel, filterMenu, onFilterChange }: GameFilterInitializeOptions): void {
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

  getCurrentFilter(): string {
    return this.currentGameFilter;
  }

  setCurrentFilter(value: string | null | undefined): void {
    this.currentGameFilter = value || '';
    this._updateGameFilterLabel();
    this._updateGameFilterActiveState();
  }

  updateOptions(): void {
    if (!this.filterMenu) return;

    const games = this.notesService?.getUniqueGames() || [];
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

  hide(): void {
    this._hideGameFilterMenu();
  }

  _setupGameFilter(): void {
    if (!this.filterButton || !this.filterMenu) return;

    const filterDropdown = new ListboxDropdownController({
      triggerElement: this.filterButton,
      menuElement: this.filterMenu,
      labelElement: this.filterLabel,
      optionSelector: '.notes-game-filter-option',
      outsideEvent: 'pointerdown',
      closeOnEscape: false,
      ignoreOutsideSelectors: ['.notes-filter-wrapper'],
      enableTriggerKeyboard: true,
      focusOnTriggerOpen: true,
      onChange: (value, label) => this._selectGameFilterOption(value, label),
      onShow: () => {
        this.isGameFilterOpen = true;
      },
      onHide: () => {
        this.isGameFilterOpen = false;
      },
      logger: this.logger
    });
    this._filterDropdown = filterDropdown;
    this.replaceManaged(FILTER_SETUP_LIFECYCLE, async () => {
      filterDropdown.hide();
      await filterDropdown.dispose();
      if (this._filterDropdown === filterDropdown) {
        this._filterDropdown = null;
        this.isGameFilterOpen = false;
      }
    });
    filterDropdown.initialize({ activeValue: this.currentGameFilter });
  }

  _updateGameFilterLabel(labelOverride = ''): void {
    if (!this.filterLabel) return;
    this.filterLabel.textContent = labelOverride || this.currentGameFilter || 'All Games';
  }

  _createGameFilterOption(value: string, label: string): HTMLButtonElement {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'notes-game-filter-option';
    option.dataset.value = value;
    option.setAttribute('role', 'option');
    option.textContent = label;
    return option;
  }

  _updateGameFilterActiveState(): void {
    this._filterDropdown?.setActive(this.currentGameFilter);
  }

  _selectGameFilterOption(value: string, label: string): void {
    const nextValue = value || '';
    if (this.currentGameFilter === nextValue) {
      return;
    }

    this.currentGameFilter = nextValue;
    this._updateGameFilterLabel(label);
    this._updateGameFilterActiveState();
    this.onFilterChange?.(nextValue, label);
  }

  _toggleGameFilterMenu(): void {
    this._filterDropdown?.toggle();
  }

  _showGameFilterMenu(): void {
    this._filterDropdown?.show();
  }

  _hideGameFilterMenu(): void {
    this._filterDropdown?.hide();
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.filterButton = null;
    this.filterLabel = null;
    this.filterMenu = null;
    this.onFilterChange = null;
    this.notesService = null;
    this.logger = null;
    this.currentGameFilter = '';
    this.isGameFilterOpen = false;
    this._filterDropdown = null;
    return disposed;
  }
}

export { GameFilterComponent };
