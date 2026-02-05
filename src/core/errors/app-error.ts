import { ErrorCode } from './error-codes.enum';

/**
 * Application-specific error with error code.
 */
export class AppError extends Error {
  readonly code: ErrorCode;
  readonly cause: Error | undefined;

  constructor(code: ErrorCode, message: string, cause?: Error) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.cause = cause;

    // Maintains proper stack trace for where error was thrown
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, AppError);
    }
  }

  /**
   * Format error as a label string.
   */
  toLabel(): string {
    return `[${this.code}] ${this.message}`;
  }

  /**
   * Create error from unknown value (for catch blocks).
   */
  static from(error: unknown, fallbackCode: ErrorCode = ErrorCode.UNKNOWN): AppError {
    if (error instanceof AppError) {
      return error;
    }

    if (error instanceof Error) {
      return new AppError(fallbackCode, error.message, error);
    }

    return new AppError(fallbackCode, String(error));
  }
}
