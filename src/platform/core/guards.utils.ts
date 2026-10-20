interface ErrorLike {
  message: string;
}

function isErrorLike(value: unknown): value is ErrorLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

/** Narrows to a thenable. */
export function isPromiseLike<T = unknown>(value: unknown): value is Promise<T> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}

export function getErrorMessage(value: unknown, fallback = 'Unknown error'): string {
  if (isErrorLike(value)) {
    return value.message || fallback;
  }

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return fallback;
}
