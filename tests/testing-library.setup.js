/**
 * Testing Library Setup for Vitest
 *
 * Configures Testing Library defaults and custom matchers
 * for semantic DOM testing in happy-dom environment.
 */

import { configure } from '@testing-library/dom';

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
