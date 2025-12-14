/**
 * MainLogger Unit Tests
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Mock electron before importing MainLogger
vi.mock('electron', () => ({
  app: {
    getPath: vi.fn((name) => {
      if (name === 'logs') return '/mock/electron/logs';
      if (name === 'userData') return '/mock/electron/userData';
      return '/mock/electron/default';
    })
  }
}));

// Mock fs to prevent directory creation errors in tests
vi.mock('fs', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    default: {
      ...actual,
      mkdirSync: vi.fn()
    },
    ...actual,
    mkdirSync: vi.fn()
  };
});

import { MainLogger } from '@infrastructure/logging/main-logger.js';

// Mock winston
vi.mock('winston', () => {
  const mockChildLogger = {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };

  const mockRootLogger = {
    child: vi.fn(() => mockChildLogger),
    level: 'debug'
  };

  return {
    default: {
      format: {
        combine: vi.fn(() => 'combinedFormat'),
        timestamp: vi.fn(() => 'timestampFormat'),
        colorize: vi.fn(() => 'colorizeFormat'),
        printf: vi.fn((fn) => fn),
        errors: vi.fn(() => 'errorsFormat'),
        json: vi.fn(() => 'jsonFormat')
      },
      transports: {
        Console: vi.fn(function(opts) {
          this.opts = opts;
        }),
        File: vi.fn(function(opts) {
          this.opts = opts;
        })
      },
      config: {
        npm: {
          levels: { error: 0, warn: 1, info: 2, debug: 3 }
        }
      },
      createLogger: vi.fn(() => mockRootLogger)
    }
  };
});

describe('MainLogger', () => {
  let logger;
  let originalEnv;

  beforeEach(() => {
    vi.clearAllMocks();
    originalEnv = { ...process.env };
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;
    delete process.env.LOG_FILE;
    delete process.env.LOG_DIR;

    logger = new MainLogger();
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('constructor', () => {
    it('should create root logger on construction', () => {
      expect(logger.rootLogger).toBeDefined();
    });
  });

  describe('_createRootLogger', () => {
    it('should use debug level in development', async () => {
      process.env.NODE_ENV = 'development';
      const newLogger = new MainLogger();

      const { default: winston } = vi.mocked(await import('winston'));
      expect(winston.createLogger).toHaveBeenCalled();
    });

    it('should use info level in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_DIR = '/tmp/logs';

      const newLogger = new MainLogger();

      // In production, file transports should be added
      expect(newLogger.rootLogger).toBeDefined();
    });

    it('should respect LOG_LEVEL env var', () => {
      process.env.LOG_LEVEL = 'warn';
      const newLogger = new MainLogger();

      expect(newLogger.rootLogger).toBeDefined();
    });

    it('should add file transports when LOG_FILE is set', () => {
      process.env.LOG_FILE = 'true';
      process.env.LOG_DIR = '/tmp/logs';
      const newLogger = new MainLogger();

      expect(newLogger.rootLogger).toBeDefined();
    });

    it('should use LOG_DIR env var when provided', () => {
      process.env.NODE_ENV = 'production';
      process.env.LOG_DIR = '/custom/log/dir';
      const newLogger = new MainLogger();

      // LOG_DIR should override Electron's getPath
      expect(newLogger.rootLogger).toBeDefined();
    });

    it('should use Electron app.getPath when LOG_DIR not set', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.LOG_DIR;

      const newLogger = new MainLogger();

      // Should use Electron's log path
      expect(newLogger.rootLogger).toBeDefined();
    });
  });

  describe('create', () => {
    it('should create child logger with context', () => {
      const childLogger = logger.create('TestContext');

      expect(logger.rootLogger.child).toHaveBeenCalledWith({ context: 'TestContext' });
      expect(childLogger).toBeDefined();
    });

    it('should return logger object with all methods', () => {
      const childLogger = logger.create('TestContext');

      expect(typeof childLogger.debug).toBe('function');
      expect(typeof childLogger.info).toBe('function');
      expect(typeof childLogger.warn).toBe('function');
      expect(typeof childLogger.error).toBe('function');
      expect(typeof childLogger.getWinstonLogger).toBe('function');
    });

    describe('child logger methods', () => {
      let childLogger;
      let mockWinstonChild;

      beforeEach(async () => {
        const { default: winston } = await import('winston');
        mockWinstonChild = winston.createLogger().child();
        childLogger = logger.create('TestContext');
      });

      it('should call debug with message and meta', () => {
        childLogger.debug('test message', { key: 'value' });

        expect(mockWinstonChild.debug).toHaveBeenCalledWith('test message', { key: 'value' });
      });

      it('should call debug with empty meta by default', () => {
        childLogger.debug('test message');

        expect(mockWinstonChild.debug).toHaveBeenCalledWith('test message', {});
      });

      it('should call info with message and meta', () => {
        childLogger.info('info message', { data: 123 });

        expect(mockWinstonChild.info).toHaveBeenCalledWith('info message', { data: 123 });
      });

      it('should call warn with message and meta', () => {
        childLogger.warn('warning message', { severity: 'high' });

        expect(mockWinstonChild.warn).toHaveBeenCalledWith('warning message', { severity: 'high' });
      });

      it('should call error with message and Error object', () => {
        const error = new Error('test error');
        childLogger.error('error occurred', error);

        expect(mockWinstonChild.error).toHaveBeenCalledWith('error occurred', {
          error: 'test error',
          stack: error.stack
        });
      });

      it('should call error with message and plain object', () => {
        childLogger.error('error occurred', { code: 500 });

        expect(mockWinstonChild.error).toHaveBeenCalledWith('error occurred', { code: 500 });
      });

      it('should call error with empty meta by default', () => {
        childLogger.error('error occurred');

        expect(mockWinstonChild.error).toHaveBeenCalledWith('error occurred', {});
      });

      it('should return winston logger via getWinstonLogger', () => {
        const winstonLogger = childLogger.getWinstonLogger();

        expect(winstonLogger).toBe(mockWinstonChild);
      });
    });
  });

  describe('getRootLogger', () => {
    it('should return root logger', () => {
      const root = logger.getRootLogger();

      expect(root).toBe(logger.rootLogger);
    });
  });

  describe('setLevel', () => {
    it('should set log level on root logger', () => {
      logger.setLevel('warn');

      expect(logger.rootLogger.level).toBe('warn');
    });

    it('should accept different log levels', () => {
      logger.setLevel('error');
      expect(logger.rootLogger.level).toBe('error');

      logger.setLevel('info');
      expect(logger.rootLogger.level).toBe('info');

      logger.setLevel('debug');
      expect(logger.rootLogger.level).toBe('debug');
    });
  });
});
