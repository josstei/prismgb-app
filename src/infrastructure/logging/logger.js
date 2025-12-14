/**
 * Browser-safe BrowserLogger
 * Lightweight console-backed logger for renderer/tests
 */

class BrowserLogger {
  create(name = 'Log') {
    const prefix = `[${name}]`;

    return {
      debug: (...args) => console.debug(prefix, ...args),
      info: (...args) => console.log(prefix, ...args),
      warn: (...args) => console.warn(prefix, ...args),
      error: (message, error) => {
        if (error instanceof Error) {
          console.error(prefix, message, error.message);
          console.error(error.stack);
        } else if (error !== undefined) {
          console.error(prefix, message, error);
        } else {
          console.error(prefix, message);
        }
      }
    };
  }
}

export { BrowserLogger };
