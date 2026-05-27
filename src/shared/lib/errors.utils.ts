type AppErrorContext = Record<string, unknown>;
type ErrorLabelSource = { name?: unknown; message?: unknown };

function hasErrorLabelFields(value: unknown): value is ErrorLabelSource {
  return (typeof value === 'object' && value !== null) || typeof value === 'function';
}

export class AppError extends Error {
  context: AppErrorContext;
  timestamp: number;

  constructor(message: string, context: AppErrorContext = {}) {
    super(message);
    this.name = this.constructor.name;
    this.context = context;
    this.timestamp = Date.now();

    if ('captureStackTrace' in Error && typeof Error.captureStackTrace === 'function') {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

export function formatErrorLabel(error: unknown): string {
  const errorLike = hasErrorLabelFields(error) ? error : {};
  const name = errorLike.name || 'Error';
  const message = errorLike.message || error;
  return `${name}: ${message}`;
}
