/**
 * MainLogger Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { LoggerLike } from '@platform/core';
import { installProcessEnvMock } from '../../../../support/mocks/runtime-property.installers.js';

type ProcessEnvOverrides = Record<string, string | number | boolean | undefined>;
type ProcessEnvMock = ReturnType<typeof installProcessEnvMock> & {
  cleanup(): void;
  setEnv(nextOverrides?: ProcessEnvOverrides): NodeJS.ProcessEnv;
};

const scopedLogger: LoggerLike = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('electron-log/main', () => ({
  default: {
    scope: vi.fn(() => scopedLogger),
    transports: {
      console: { level: undefined },
      file: { level: undefined, maxSize: undefined, resolvePathFn: undefined }
    }
  }
}));

import log from 'electron-log/main';
import { MainLogger } from '@main/infrastructure/logging/logger.factory.js';

describe('MainLogger', () => {
  let envMock: ProcessEnvMock;

  beforeEach(() => {
    log.transports.console.level = undefined;
    log.transports.file.level = undefined;
    log.transports.file.resolvePathFn = undefined;
    envMock = installProcessEnvMock({
      NODE_ENV: 'development',
      LOG_LEVEL: undefined,
      LOG_FILE: undefined,
      LOG_DIR: undefined
    }) as ProcessEnvMock;
  });

  afterEach(() => {
    envMock.cleanup();
  });

  describe('transport configuration', () => {
    it('uses debug console level and disables file logging in development', () => {
      new MainLogger();

      expect(log.transports.console.level).toBe('debug');
      expect(log.transports.file.level).toBe(false);
    });

    it('uses info level and enables file logging in production', () => {
      envMock.setEnv({ NODE_ENV: 'production' });

      new MainLogger();

      expect(log.transports.console.level).toBe('info');
      expect(log.transports.file.level).toBe('info');
    });

    it('respects the LOG_LEVEL env var', () => {
      envMock.setEnv({ LOG_LEVEL: 'warn' });

      new MainLogger();

      expect(log.transports.console.level).toBe('warn');
    });

    it('enables file logging in development when LOG_FILE is set', () => {
      envMock.setEnv({ LOG_FILE: 'true' });

      new MainLogger();

      expect(log.transports.file.level).toBe('debug');
    });

    it('routes the log file into LOG_DIR when provided', () => {
      envMock.setEnv({ NODE_ENV: 'production', LOG_DIR: '/custom/log/dir' });

      new MainLogger();

      expect(typeof log.transports.file.resolvePathFn).toBe('function');
      const resolvePath = log.transports.file.resolvePathFn as () => string;
      expect(resolvePath()).toMatch(/custom[\\/]log[\\/]dir[\\/]combined\.log$/);
    });

    it('leaves the default log path when LOG_DIR is not set', () => {
      new MainLogger();

      expect(log.transports.file.resolvePathFn).toBeUndefined();
    });
  });

  describe('create', () => {
    it('creates a scoped logger per context', () => {
      const logger = new MainLogger();

      const contextLogger = logger.create('TestContext');

      expect(log.scope).toHaveBeenCalledWith('TestContext');
      expect(typeof contextLogger.debug).toBe('function');
      expect(typeof contextLogger.info).toBe('function');
      expect(typeof contextLogger.warn).toBe('function');
      expect(typeof contextLogger.error).toBe('function');
    });

    it('delegates each level with the given arguments', () => {
      const contextLogger = new MainLogger().create('TestContext');

      contextLogger.debug('debug message', { key: 'value' });
      contextLogger.info('info message', { data: 123 });
      contextLogger.warn('warning message', { severity: 'high' });

      expect(scopedLogger.debug).toHaveBeenCalledWith('debug message', { key: 'value' });
      expect(scopedLogger.info).toHaveBeenCalledWith('info message', { data: 123 });
      expect(scopedLogger.warn).toHaveBeenCalledWith('warning message', { severity: 'high' });
    });

    it('passes Error objects through to electron-log intact', () => {
      const contextLogger = new MainLogger().create('TestContext');
      const error = new Error('test error');

      contextLogger.error('error occurred', error);

      expect(scopedLogger.error).toHaveBeenCalledWith('error occurred', error);
    });

    it('passes plain metadata objects through on error', () => {
      const contextLogger = new MainLogger().create('TestContext');

      contextLogger.error('error occurred', { code: 500 });

      expect(scopedLogger.error).toHaveBeenCalledWith('error occurred', { code: 500 });
    });
  });
});
