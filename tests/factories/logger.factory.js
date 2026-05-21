/**
 * Logger Factory
 *
 * Creates mock Logger and LoggerFactory instances for testing.
 * Supports log capture, filtering, and assertion helpers.
 */

import { vi } from 'vitest';

/**
 * Log levels in order of severity
 */
export const LogLevels = {
  TRACE: 0,
  DEBUG: 1,
  INFO: 2,
  WARN: 3,
  ERROR: 4,
  FATAL: 5,
};

/**
 * Creates a mock Logger instance
 * @param {Object} options - Factory options
 * @param {string} options.name - Logger name
 * @param {boolean} options.recordLogs - Whether to record logs (default: true)
 * @param {number} options.minLevel - Minimum level to record (default: TRACE)
 * @returns {Object} Mock Logger instance
 */
export function createLogger(options = {}) {
  const {
    name = 'test',
    recordLogs = true,
    minLevel = LogLevels.TRACE,
  } = options;

  const logs = [];

  const recordLog = (level, levelName, args) => {
    if (recordLogs && level >= minLevel) {
      logs.push({
        level: levelName,
        message: args[0],
        args: args.slice(1),
        timestamp: Date.now(),
        logger: name,
      });
    }
  };

  const logger = {
    name,

    trace: vi.fn((...args) => recordLog(LogLevels.TRACE, 'trace', args)),
    debug: vi.fn((...args) => recordLog(LogLevels.DEBUG, 'debug', args)),
    info: vi.fn((...args) => recordLog(LogLevels.INFO, 'info', args)),
    warn: vi.fn((...args) => recordLog(LogLevels.WARN, 'warn', args)),
    error: vi.fn((...args) => recordLog(LogLevels.ERROR, 'error', args)),
    fatal: vi.fn((...args) => recordLog(LogLevels.FATAL, 'fatal', args)),

    /**
     * Create a child logger
     */
    child: vi.fn((childName) => {
      return createLogger({
        name: `${name}.${childName}`,
        recordLogs,
        minLevel,
      });
    }),

    // ==========================================
    // Test Helpers
    // ==========================================

    /**
     * Get all recorded logs
     */
    _getLogs() {
      return [...logs];
    },

    /**
     * Get logs of a specific level
     */
    _getLogsOfLevel(level) {
      return logs.filter(l => l.level === level);
    },

    /**
     * Check if a message was logged at any level
     */
    _hasLoggedMessage(message) {
      return logs.some(l =>
        typeof l.message === 'string' && l.message.includes(message)
      );
    },

    /**
     * Check if a message was logged at a specific level
     */
    _hasLoggedAtLevel(level, message) {
      return logs.some(l =>
        l.level === level &&
        typeof l.message === 'string' &&
        l.message.includes(message)
      );
    },

    /**
     * Get last log entry
     */
    _getLastLog() {
      return logs[logs.length - 1] || null;
    },

    /**
     * Get error logs
     */
    _getErrors() {
      return logs.filter(l => l.level === 'error' || l.level === 'fatal');
    },

    /**
     * Check if any errors were logged
     */
    _hasErrors() {
      return logs.some(l => l.level === 'error' || l.level === 'fatal');
    },

    /**
     * Clear recorded logs
     */
    _clearLogs() {
      logs.length = 0;
    },

    /**
     * Full reset
     */
    _reset() {
      logs.length = 0;
      vi.clearAllMocks();
    },
  };

  return logger;
}

/**
 * Creates a mock LoggerFactory
 * @param {Object} options - Factory options
 * @param {boolean} options.recordLogs - Whether to record logs (default: true)
 * @returns {Object} Mock LoggerFactory instance
 */
export function createLoggerFactory(options = {}) {
  const { recordLogs = true } = options;

  const loggers = new Map();
  const allLogs = [];

  const factory = {
    /**
     * Create or get a logger
     */
    create: vi.fn((name) => {
      if (!loggers.has(name)) {
        const logger = createLogger({
          name,
          recordLogs,
        });

        // Proxy logs to factory-level collection
        const originalMethods = {};
        ['trace', 'debug', 'info', 'warn', 'error', 'fatal'].forEach(level => {
          originalMethods[level] = logger[level];
          logger[level] = vi.fn((...args) => {
            originalMethods[level](...args);
            if (recordLogs) {
              allLogs.push({
                level,
                message: args[0],
                args: args.slice(1),
                timestamp: Date.now(),
                logger: name,
              });
            }
          });
        });

        loggers.set(name, logger);
      }
      return loggers.get(name);
    }),

    /**
     * Get an existing logger
     */
    getLogger: vi.fn((name) => {
      return loggers.get(name) || factory.create(name);
    }),

    // ==========================================
    // Test Helpers
    // ==========================================

    /**
     * Get all loggers created
     */
    _getLoggers() {
      return new Map(loggers);
    },

    /**
     * Get a specific logger
     */
    _getLogger(name) {
      return loggers.get(name);
    },

    /**
     * Get all logs from all loggers
     */
    _getAllLogs() {
      return [...allLogs];
    },

    /**
     * Get logs from a specific logger
     */
    _getLogsFrom(loggerName) {
      return allLogs.filter(l => l.logger === loggerName);
    },

    /**
     * Get all error logs from all loggers
     */
    _getAllErrors() {
      return allLogs.filter(l => l.level === 'error' || l.level === 'fatal');
    },

    /**
     * Check if any logger has errors
     */
    _hasAnyErrors() {
      return allLogs.some(l => l.level === 'error' || l.level === 'fatal');
    },

    /**
     * Clear all logs from all loggers
     */
    _clearAllLogs() {
      allLogs.length = 0;
      loggers.forEach(logger => logger._clearLogs());
    },

    /**
     * Full reset
     */
    _reset() {
      allLogs.length = 0;
      loggers.clear();
      vi.clearAllMocks();
    },

    /**
     * Raw loggers map
     */
    _loggers: loggers,
  };

  return factory;
}

export default createLoggerFactory;
