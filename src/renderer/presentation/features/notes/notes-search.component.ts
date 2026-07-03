import { PresentationComponent } from '@platform/ui-base';
import type { LoggerLike } from '@platform/core';

const SEARCH_DEBOUNCE_MS = 200;
const SEARCH_DEBOUNCE_TIMEOUT = Symbol('notesSearchDebounceTimeout');
const SEARCH_SETUP_LIFECYCLE = Symbol('notesSearchSetupLifecycle');

export interface NotesSearchComponentOptions {
  logger?: LoggerLike | null;
}

export interface NotesSearchInitializeOptions {
  searchInput?: HTMLInputElement | null;
  onSearch?: ((query: string) => void) | null;
}

class NotesSearchComponent extends PresentationComponent {
  declare logger: LoggerLike | null | undefined;
  declare currentQuery: string;
  declare searchInput: HTMLInputElement | null | undefined;
  declare onSearch: ((query: string) => void) | null | undefined;

  constructor(options: NotesSearchComponentOptions) {
    super();
    this.applyOptions<NotesSearchComponentOptions>({}, options);
    this.currentQuery = '';
    this.searchInput = null;
  }

  initialize(options: NotesSearchInitializeOptions): void {
    this.cancelManaged(SEARCH_SETUP_LIFECYCLE);
    this.cancelManaged(SEARCH_DEBOUNCE_TIMEOUT);
    this.applyOptions<NotesSearchInitializeOptions>({}, options);

    if (!this.searchInput) {
      this.logger?.warn('Search input element not found');
      return;
    }

    this._setupSearch();
  }

  getQuery(): string {
    return this.searchInput?.value || '';
  }

  focus(): void {
    this.searchInput?.focus({ preventScroll: true });
  }

  clear(): void {
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    this.currentQuery = '';
  }

  _setupSearch(): void {
    if (!this.searchInput) return;

    this.replaceManaged(
      SEARCH_SETUP_LIFECYCLE,
      this.listen(this.searchInput, 'input', () => {
        this._scheduleSearch();
      })
    );
  }

  _scheduleSearch(): void {
    this.replaceTimeout(SEARCH_DEBOUNCE_TIMEOUT, () => {
      this._handleSearch();
    }, SEARCH_DEBOUNCE_MS);
  }

  _handleSearch(): void {
    const query = this.searchInput?.value || '';
    this.currentQuery = query;
    this.onSearch?.(query);
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.searchInput = null;
    this.onSearch = null;
    this.logger = null;
    this.currentQuery = '';
    return disposed;
  }
}

export { NotesSearchComponent };
