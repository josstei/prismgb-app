/**
 * Testing Library Setup for Vitest
 *
 * Configures Testing Library defaults and custom matchers
 * for semantic DOM testing in happy-dom environment.
 */

import { configure } from '@testing-library/dom';

// Polyfill navigator.clipboard for happy-dom (required by @testing-library/user-event)
if (typeof navigator !== 'undefined' && !navigator.clipboard) {
  const clipboardData = { text: '' };
  Object.defineProperty(navigator, 'clipboard', {
    value: {
      writeText: async (text) => {
        clipboardData.text = text;
        return Promise.resolve();
      },
      readText: async () => {
        return Promise.resolve(clipboardData.text);
      },
      write: async () => Promise.resolve(),
      read: async () => Promise.resolve([]),
    },
    writable: true,
    configurable: true,
  });
}

// Configure Testing Library
configure({
  // Use data-testid for test IDs (fallback when aria-* not sufficient)
  testIdAttribute: 'data-testid',

  // Throw helpful suggestions when queries fail
  throwSuggestions: true,

  // Custom element error formatting
  getElementError: (message, container) => {
    const error = new Error(
      [
        message,
        '\nContainer HTML:',
        container.innerHTML.slice(0, 500) + (container.innerHTML.length > 500 ? '...' : ''),
      ].join('\n')
    );
    error.name = 'TestingLibraryElementError';
    return error;
  },
});

// Export configured Testing Library for use in tests
// Note: userEvent is NOT exported here to avoid module-level initialization issues
// with happy-dom. Import it directly in tests that need it:
//   import userEvent from '@testing-library/user-event';
export { screen, within, waitFor, fireEvent } from '@testing-library/dom';
