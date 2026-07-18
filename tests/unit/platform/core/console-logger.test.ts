/**
 * ConsoleLoggerFactory Unit Tests
 */

import { describe, it, expect, beforeEach, vi, type MockInstance } from 'vitest';
import { ConsoleLoggerFactory, type LoggerLike } from '@platform/core';

describe('ConsoleLoggerFactory', () => {
  let factory: ConsoleLoggerFactory;
  let consoleSpy: {
    debug: MockInstance<typeof console.debug>;
    log: MockInstance<typeof console.log>;
    warn: MockInstance<typeof console.warn>;
    error: MockInstance<typeof console.error>;
  };

  beforeEach(() => {
    factory = new ConsoleLoggerFactory();
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  describe('create', () => {
    it('should create a logger with all methods', () => {
      const logger: LoggerLike = factory.create('Test');

      expect(logger).toHaveProperty('debug');
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('error');
    });

    it('should use default name when not provided', () => {
      const logger: LoggerLike = factory.create();
      logger.info('test');

      expect(consoleSpy.log).toHaveBeenCalledWith('[Log]', 'test');
    });

    it('should use provided name', () => {
      const logger: LoggerLike = factory.create('MyService');
      logger.info('test');

      expect(consoleSpy.log).toHaveBeenCalledWith('[MyService]', 'test');
    });
  });

  describe('logger.debug', () => {
    it('should log to console.debug with prefix', () => {
      const logger: LoggerLike = factory.create('Test');
      logger.debug('debug message', 'extra');

      expect(consoleSpy.debug).toHaveBeenCalledWith('[Test]', 'debug message', 'extra');
    });

    it('should handle multiple arguments', () => {
      const logger: LoggerLike = factory.create('Test');
      logger.debug('a', 'b', 'c', { d: 1 });

      expect(consoleSpy.debug).toHaveBeenCalledWith('[Test]', 'a', 'b', 'c', { d: 1 });
    });
  });

  describe('logger.info', () => {
    it('should log to console.log with prefix', () => {
      const logger: LoggerLike = factory.create('App');
      logger.info('info message');

      expect(consoleSpy.log).toHaveBeenCalledWith('[App]', 'info message');
    });
  });

  describe('logger.warn', () => {
    it('should log to console.warn with prefix', () => {
      const logger: LoggerLike = factory.create('Service');
      logger.warn('warning');

      expect(consoleSpy.warn).toHaveBeenCalledWith('[Service]', 'warning');
    });
  });

  describe('logger.error', () => {
    it('should log Error object with message and stack', () => {
      const logger: LoggerLike = factory.create('Error');
      const error = new Error('test error');

      logger.error('Something failed', error);

      expect(consoleSpy.error).toHaveBeenCalledWith('[Error]', 'Something failed', 'test error');
      expect(consoleSpy.error).toHaveBeenCalledWith(error.stack);
    });

    it('should log non-Error object directly', () => {
      const logger: LoggerLike = factory.create('Test');
      logger.error('Failed', { code: 500 });

      expect(consoleSpy.error).toHaveBeenCalledWith('[Test]', 'Failed', { code: 500 });
    });

    it('should log message only when error is undefined', () => {
      const logger: LoggerLike = factory.create('Test');
      logger.error('Simple error');

      expect(consoleSpy.error).toHaveBeenCalledWith('[Test]', 'Simple error');
    });

    it('should log string as error', () => {
      const logger: LoggerLike = factory.create('Test');
      logger.error('Failed', 'string error');

      expect(consoleSpy.error).toHaveBeenCalledWith('[Test]', 'Failed', 'string error');
    });

    it('should log null as error', () => {
      const logger: LoggerLike = factory.create('Test');
      logger.error('Failed', null);

      expect(consoleSpy.error).toHaveBeenCalledWith('[Test]', 'Failed', null);
    });
  });

  describe('Exports', () => {
    it('should export ConsoleLoggerFactory', () => {
      expect(ConsoleLoggerFactory).toBeDefined();
    });
  });
});
