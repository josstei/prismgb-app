/**
 * Error Formatting Utilities
 */

/**
 * Format error into displayable label
 * @param {Error|string} error - Error object or message
 * @returns {string} Formatted error label
 */
export function formatErrorLabel(error) {
  return `${error?.name || 'Error'}: ${error?.message || error}`;
}
