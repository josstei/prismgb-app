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
 * Device-related errors
 * Used for device detection, connection, and communication failures
 */
export class DeviceError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} context - Additional context (deviceId, etc.)
   */
  constructor(message, context = {}) {
    super(message, { ...context, domain: 'device' });
  }
}

/**
 * Streaming-related errors
 * Used for video stream acquisition, rendering, and pipeline failures
 */
export class StreamingError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} context - Additional context (streamId, format, etc.)
   */
  constructor(message, context = {}) {
    super(message, { ...context, domain: 'streaming' });
  }
}

/**
 * Capture-related errors (screenshot/recording)
 * Used for screenshot and video recording failures
 */
export class CaptureError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} context - Additional context (filepath, format, etc.)
   */
  constructor(message, context = {}) {
    super(message, { ...context, domain: 'capture' });
  }
}

/**
 * Configuration/settings errors
 * Used for invalid configuration, settings persistence failures
 */
export class ConfigError extends AppError {
  /**
   * @param {string} message - Error message
   * @param {Object} context - Additional context (key, value, etc.)
   */
  constructor(message, context = {}) {
    super(message, { ...context, domain: 'config' });
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
