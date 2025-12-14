/**
 * BrowserLogger Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BrowserLogger } from '@infrastructure/logging/logger.js';

describe('BrowserLogger', () => {
  let factory;
  let consoleSpy;

  beforeEach(() => {
    factory = new BrowserLogger();
    consoleSpy = {
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      error: vi.spyOn(console, 'error').mockImplementation(() => {})
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('create', () => {
    it('should create a logger with all methods', () => {
      const logger = factory.create('Test');

      expect(logger).toHaveProperty('debug');
      expect(logger).toHaveProperty('info');
      expect(logger).toHaveProperty('warn');
      expect(logger).toHaveProperty('error');
    });

    it('should use default name when not provided', () => {
      const logger = factory.create();
      logger.info('test');

      expect(consoleSpy.log).toHaveBeenCalledWith('[Log]', 'test');
    });

    it('should use provided name', () => {
      const logger = factory.create('MyService');
      logger.info('test');

      expect(consoleSpy.log).toHaveBeenCalledWith('[MyService]', 'test');
    });
  });

  describe('logger.debug', () => {
    it('should log to console.debug with prefix', () => {
      const logger = factory.create('Test');
      logger.debug('debug message', 'extra');

      expect(consoleSpy.debug).toHaveBeenCalledWith('[Test]', 'debug message', 'extra');
    });

    it('should handle multiple arguments', () => {
      const logger = factory.create('Test');
      logger.debug('a', 'b', 'c', { d: 1 });

      expect(consoleSpy.debug).toHaveBeenCalledWith('[Test]', 'a', 'b', 'c', { d: 1 });
    });
  });

  describe('logger.info', () => {
    it('should log to console.log with prefix', () => {
      const logger = factory.create('App');
      logger.info('info message');

      expect(consoleSpy.log).toHaveBeenCalledWith('[App]', 'info message');
    });
  });

  describe('logger.warn', () => {
    it('should log to console.warn with prefix', () => {
      const logger = factory.create('Service');
      logger.warn('warning');

      expect(consoleSpy.warn).toHaveBeenCalledWith('[Service]', 'warning');
    });
  });

  describe('logger.error', () => {
    it('should log Error object with message and stack', () => {
      const logger = factory.create('Error');
      const error = new Error('test error');

      logger.error('Something failed', error);

      expect(consoleSpy.error).toHaveBeenCalledWith('[Error]', 'Something failed', 'test error');
      expect(consoleSpy.error).toHaveBeenCalledWith(error.stack);
    });

    it('should log non-Error object directly', () => {
      const logger = factory.create('Test');
      logger.error('Failed', { code: 500 });

      expect(consoleSpy.error).toHaveBeenCalledWith('[Test]', 'Failed', { code: 500 });
    });

    it('should log message only when error is undefined', () => {
      const logger = factory.create('Test');
      logger.error('Simple error');

      expect(consoleSpy.error).toHaveBeenCalledWith('[Test]', 'Simple error');
    });

    it('should log string as error', () => {
      const logger = factory.create('Test');
      logger.error('Failed', 'string error');

      expect(consoleSpy.error).toHaveBeenCalledWith('[Test]', 'Failed', 'string error');
    });

    it('should log null as error', () => {
      const logger = factory.create('Test');
      logger.error('Failed', null);

      expect(consoleSpy.error).toHaveBeenCalledWith('[Test]', 'Failed', null);
    });
  });

  describe('Exports', () => {
    it('should export BrowserLogger', () => {
      expect(BrowserLogger).toBeDefined();
    });
  });
});
