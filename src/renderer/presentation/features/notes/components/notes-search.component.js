/**
 * Notes Search Component
 *
 * Handles search input and debouncing for the notes panel, including:
 * - Search input handling
 * - Search debouncing
 * - Search query management
 */

import { createDomListenerManager } from '@shared/base/dom-listener.utils.js';

// Timing constant
const SEARCH_DEBOUNCE_MS = 200;

class NotesSearchComponent {
  constructor({ logger }) {
    this.logger = logger;

    // Search state
    this.currentQuery = '';

    // Debounce timer
    this._searchTimeout = null;

    // Track DOM listeners for cleanup
    this._domListeners = createDomListenerManager({ logger });

    // Elements
    this.searchInput = null;
  }

  /**
   * Initialize component with DOM elements
   * @param {Object} options
   * @param {HTMLInputElement} options.searchInput - Search input element
   * @param {Function} options.onSearch - Callback when search query changes (query)
   */
  initialize({ searchInput, onSearch }) {
    this.searchInput = searchInput;
    this.onSearch = onSearch;

    if (!this.searchInput) {
      this.logger?.warn('Search input element not found');
      return;
    }

    this._setupSearch();
  }

  /**
   * Get current search query
   * @returns {string}
   */
  getQuery() {
    return this.searchInput?.value || '';
  }

  /**
   * Focus search input
   */
  focus() {
    this.searchInput?.focus({ preventScroll: true });
  }

  /**
   * Clear search input
   */
  clear() {
    if (this.searchInput) {
      this.searchInput.value = '';
    }
    this.currentQuery = '';
  }

  /**
   * Setup search input with debouncing
   * @private
   */
  _setupSearch() {
    if (!this.searchInput) return;

    this._domListeners.add(this.searchInput, 'input', () => {
      this._scheduleSearch();
    });
  }

  /**
   * Schedule search with debounce
   * @private
   */
  _scheduleSearch() {
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
    }

    this._searchTimeout = setTimeout(() => {
      this._searchTimeout = null;
      this._handleSearch();
    }, SEARCH_DEBOUNCE_MS);
  }

  /**
   * Handle search input
   * @private
   */
  _handleSearch() {
    const query = this.searchInput?.value || '';
    this.currentQuery = query;
    this.onSearch?.(query);
  }

  /**
   * Cleanup resources
   */
  dispose() {
    // Clear timer
    if (this._searchTimeout) {
      clearTimeout(this._searchTimeout);
      this._searchTimeout = null;
    }

    // Remove DOM listeners
    this._domListeners.removeAll();

    // Clear references
    this.searchInput = null;
    this.onSearch = null;
    this.logger = null;
    this.currentQuery = '';
  }
}

export { NotesSearchComponent };
