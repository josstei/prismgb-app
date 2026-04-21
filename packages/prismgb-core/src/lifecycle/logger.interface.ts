/**
 * Severity levels supported by the platform logger contract.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured logging contract consumed by all PrismGB services.
 *
 * Implementations must route each call to the appropriate severity level
 * of the underlying logging backend (pino, Winston, etc.).
 */
export interface Logger {
  /**
   * Emits a debug-level message for detailed diagnostic output.
   *
   * @param message - Log message template.
   * @param args - Interpolation values or structured metadata objects.
   */
  debug(message: string, ...args: unknown[]): void;

  /**
   * Emits an info-level message for standard operational events.
   *
   * @param message - Log message template.
   * @param args - Interpolation values or structured metadata objects.
   */
  info(message: string, ...args: unknown[]): void;

  /**
   * Emits a warn-level message for recoverable anomalies.
   *
   * @param message - Log message template.
   * @param args - Interpolation values or structured metadata objects.
   */
  warn(message: string, ...args: unknown[]): void;

  /**
   * Emits an error-level message for unexpected failures.
   *
   * @param message - Log message template.
   * @param args - Interpolation values or structured metadata objects.
   */
  error(message: string, ...args: unknown[]): void;
}

/**
 * Factory that creates scoped `Logger` instances for individual services.
 *
 * Each call to `create` returns a new `Logger` tagged with the given context
 * string so log output can be filtered or routed by service name.
 */
export interface LoggerFactory {
  /**
   * Creates a `Logger` scoped to the given service context.
   *
   * @param context - Human-readable label (typically the service class name).
   * @returns A logger whose output is tagged with `context`.
   */
  create(context: string): Logger;
}
