/**
 * Error Classes and Formatting Utilities
 */

/**
 * Base application error with context
 * Provides consistent error handling across the application with structured context
 */
export class AppError extends Error {
  /**
   * @param {string} message - Error message
   * @param {Object} context - Additional context information
   */
  constructor(message, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.timestamp = Date.now();

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Format error into displayable label
 * @param {Error|string} error - Error object or message
 * @returns {string} Formatted error label
 */
export function formatErrorLabel(error) {
  return `${error?.name || 'Error'}: ${error?.message || error}`;
}
