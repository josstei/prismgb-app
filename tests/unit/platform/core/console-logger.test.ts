import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsoleLoggerFactory } from '@platform/core';

describe('ConsoleLoggerFactory', () => {
  const factory = new ConsoleLoggerFactory();
  const consoleSpy = {
    debug: vi.fn(), log: vi.fn(), warn: vi.fn(), error: vi.fn()
  };

  beforeEach(() => {
    vi.spyOn(console, 'debug').mockImplementation(consoleSpy.debug);
    vi.spyOn(console, 'log').mockImplementation(consoleSpy.log);
    vi.spyOn(console, 'warn').mockImplementation(consoleSpy.warn);
    vi.spyOn(console, 'error').mockImplementation(consoleSpy.error);
  });

  it('preserves the default and supplied logger names', () => {
    factory.create().info('default');
    factory.create('MyService').info('named');
    expect(consoleSpy.log.mock.calls).toEqual([['[Log]', 'default'], ['[MyService]', 'named']]);
  });

  it('routes debug, info and warn with the prefix and every argument', () => {
    const logger = factory.create('Test');
    const metadata = { code: 42 };
    for (const [level, target] of [['debug', 'debug'], ['info', 'log'], ['warn', 'warn']] as const) {
      logger[level]('a', 'b', 'c', metadata);
      expect(consoleSpy[target]).toHaveBeenCalledExactlyOnceWith('[Test]', 'a', 'b', 'c', metadata);
    }
  });

  it('logs an Error message and stack separately', () => {
    const error = new Error('test error');
    factory.create('Error').error('Something failed', error);
    expect(consoleSpy.error.mock.calls).toEqual([
      ['[Error]', 'Something failed', 'test error'], [error.stack]
    ]);
  });

  it('passes non-Error values through, omitting an undefined second argument', () => {
    const logger = factory.create('Test');
    for (const value of [{ code: 500 }, 'string error', null, undefined]) {
      consoleSpy.error.mockClear();
      logger.error('Failed', value);
      const expected = value === undefined ? ['[Test]', 'Failed'] : ['[Test]', 'Failed', value];
      expect(consoleSpy.error).toHaveBeenCalledExactlyOnceWith(...expected);
    }
  });
});
