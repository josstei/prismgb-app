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
  logger: LoggerLike | null | undefined;
  searchInput: HTMLInputElement | null | undefined;
  onSearch: ((query: string) => void) | null | undefined;

  constructor(options: NotesSearchComponentOptions) {
    super();
    this.logger = options.logger;
    this.searchInput = null;
  }

  initialize(options: NotesSearchInitializeOptions): void {
    this.cancelManaged(SEARCH_SETUP_LIFECYCLE);
    this.cancelManaged(SEARCH_DEBOUNCE_TIMEOUT);
    this.searchInput = options.searchInput;
    this.onSearch = options.onSearch;

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
    this.onSearch?.(query);
  }

  override dispose(): void | Promise<void> {
    const disposed = super.dispose();
    this.searchInput = null;
    this.onSearch = null;
    this.logger = null;
    return disposed;
  }
}

export { NotesSearchComponent };
