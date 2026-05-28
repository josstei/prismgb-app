import { describe, it, expect, vi } from 'vitest';
import {
  PrismError,
  PrismValidationError,
  PrismInitializationError,
  isDisposable,
  safeDispose,
  safeDisposeAll,
  createSubscription,
  Bus,
  Cache,
  Container,
  Factory,
  Logger,
  Pipeline,
  Registry,
  Store,
  Validator
} from '../../src/index';

describe('PrismError Classes', () => {
  it('should initialize PrismError with correct attributes', () => {
    const details = { path: '/dev/null' };
    const error = new PrismError('Something failed', 'TEST_FAIL', details);

    expect(error.message).toBe('Something failed');
    expect(error.code).toBe('TEST_FAIL');
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.details).toEqual(details);
    expect(error.name).toBe('PrismError');
  });

  it('should serialize to JSON correctly', () => {
    const error = new PrismError('JSON test', 'JSON_FAIL', { key: 'value' });
    const json = error.toJSON();

    expect(json.name).toBe('PrismError');
    expect(json.message).toBe('JSON test');
    expect(json.code).toBe('JSON_FAIL');
    expect(json.details).toEqual({ key: 'value' });
    expect(typeof json.timestamp).toBe('string');
    expect(typeof json.stack).toBe('string');
  });

  it('should create specialty validation and initialization errors', () => {
    const valError = new PrismValidationError('invalid settings');
    expect(valError.code).toBe('VALIDATION_ERROR');
    expect(valError.name).toBe('PrismValidationError');

    const initError = new PrismInitializationError('boot failure');
    expect(initError.code).toBe('INITIALIZATION_ERROR');
    expect(initError.name).toBe('PrismInitializationError');
  });
});

describe('Disposable utilities', () => {
  it('should identify disposables', () => {
    expect(isDisposable(null)).toBe(false);
    expect(isDisposable({})).toBe(false);
    expect(isDisposable({ dispose: 'not a function' })).toBe(false);
    expect(isDisposable({ dispose: () => {} })).toBe(true);
  });

  it('should dispose resources safely', async () => {
    const mockDispose = vi.fn();
    const disposable = { dispose: mockDispose };

    const result = await safeDispose(disposable);
    expect(result).toBe(true);
    expect(mockDispose).toHaveBeenCalledTimes(1);
  });

  it('should swallow errors during disposal and log them if logger provided', async () => {
    const disposable = {
      dispose: () => {
        throw new Error('Failed to clean up');
      }
    };
    const mockLogger = { error: vi.fn() };

    const result = await safeDispose(disposable, mockLogger);
    expect(result).toBe(false);
    expect(mockLogger.error).toHaveBeenCalledTimes(1);
  });

  it('should handle async dispose', async () => {
    let resolved = false;
    const disposable = {
      dispose: async () => {
        await new Promise(resolve => setTimeout(resolve, 5));
        resolved = true;
      }
    };

    const result = await safeDispose(disposable);
    expect(result).toBe(true);
    expect(resolved).toBe(true);
  });

  it('should dispose multiple resources safely', async () => {
    const d1 = { dispose: vi.fn() };
    const d2 = { dispose: vi.fn() };

    await safeDisposeAll([d1, d2]);
    expect(d1.dispose).toHaveBeenCalledTimes(1);
    expect(d2.dispose).toHaveBeenCalledTimes(1);
  });
});

describe('Subscription utilities', () => {
  it('should call unsubscribe when invoked', () => {
    const mockUnsub = vi.fn();
    const sub = createSubscription(mockUnsub);

    sub.unsubscribe();
    expect(mockUnsub).toHaveBeenCalledTimes(1);

    // Call it a second time, unsubscribe should not be called again
    sub.unsubscribe();
    expect(mockUnsub).toHaveBeenCalledTimes(1);
  });
});

describe('Bus primitive', () => {
  it('should subscribe and publish events', () => {
    const bus = new Bus<{ test: { foo: string } }>();
    const handler = vi.fn();

    const unsubscribe = bus.subscribe('test', handler);
    bus.publish('test', { foo: 'bar' });

    expect(handler).toHaveBeenCalledWith({ foo: 'bar' });

    unsubscribe();
    bus.publish('test', { foo: 'baz' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('should support async publication', async () => {
    const bus = new Bus<{ test: string }>();
    let value = '';
    bus.subscribe('test', async (val) => {
      await new Promise(resolve => setTimeout(resolve, 5));
      value = val;
    });

    await bus.publishAsync('test', 'completed');
    expect(value).toBe('completed');
  });

  it('should swallow errors in handlers gracefully', () => {
    const bus = new Bus<{ err: null }>();
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    bus.subscribe('err', () => {
      throw new Error('Boom');
    });
    bus.publish('err', null);

    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});

describe('Cache primitive', () => {
  it('should store and retrieve values with TTL support', async () => {
    const cache = new Cache<string, number>(2, 20); // max size 2, default TTL 20ms
    cache.set('a', 1);
    cache.set('b', 2);

    expect(cache.get('a')).toBe(1);
    expect(cache.size).toBe(2);

    // Trigger max size evict
    cache.set('c', 3);
    expect(cache.has('b')).toBe(false); // Evicted because 'b' is the least recently used after get('a')
    expect(cache.get('c')).toBe(3);

    // Let TTL expire
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(cache.get('b')).toBe(undefined);
  });

  it('should respect manual delete and clear', () => {
    const cache = new Cache<string, string>();
    cache.set('k', 'v');
    expect(cache.has('k')).toBe(true);

    expect(cache.delete('k')).toBe(true);
    expect(cache.has('k')).toBe(false);

    cache.set('x', 'y');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('Container primitive', () => {
  it('should register and resolve dependency factories', () => {
    const container = new Container<{ db: string; service: { db: string } }>();
    container.register('db', () => 'sqlite');
    container.register('service', (c) => ({ db: c.resolve('db') }));

    const service = container.resolve('service');
    expect(service.db).toBe('sqlite');
    // Verify caching/singleton behavior
    expect(container.resolve('service')).toBe(service);
  });

  it('should throw error when resolving unregistered token', () => {
    const container = new Container<any>();
    expect(() => container.resolve('missing')).toThrow();
  });
});

describe('Factory primitive', () => {
  it('should generate new objects from factory generator', () => {
    let count = 0;
    const factory = new Factory((name: string) => ({ id: ++count, name }));

    const obj1 = factory.create('A');
    const obj2 = factory.create('B');

    expect(obj1).toEqual({ id: 1, name: 'A' });
    expect(obj2).toEqual({ id: 2, name: 'B' });
  });
});

describe('Logger primitive', () => {
  it('should log message via custom writer if level meets threshold', () => {
    const writer = vi.fn();
    const logger = new Logger('App', writer, 'warn');

    logger.debug('should not write');
    logger.info('should not write');
    expect(writer).toHaveBeenCalledTimes(0);

    logger.warn('warning message');
    expect(writer).toHaveBeenLastCalledWith('warn', 'App', ['warning message']);

    logger.error('err message');
    expect(writer).toHaveBeenLastCalledWith('error', 'App', ['err message']);
  });
});

describe('Pipeline primitive', () => {
  it('should execute pipeline steps sequentially', async () => {
    const pipeline = new Pipeline<number, number>();
    pipeline.add(async (val, next) => {
      return (await next(val)) + 1;
    });
    pipeline.add(async (val, next) => {
      return (await next(val)) * 2;
    });

    const result = await pipeline.execute(5, async (v) => v);
    expect(result).toBe(11); // (5 * 2) + 1
  });
});

describe('Registry primitive', () => {
  it('should release tracked resources and handle failures with AggregateError', async () => {
    const releaser = vi.fn();
    const registry = new Registry<string>(releaser);

    registry.add('res1');
    registry.add('res2');
    expect(registry.size).toBe(2);

    registry.remove('res1');
    expect(registry.size).toBe(1);

    await registry.release();
    expect(releaser).toHaveBeenCalledWith('res2');
    expect(registry.size).toBe(0);
  });

  it('should collect release errors and throw AggregateError', async () => {
    const registry = new Registry<string>((res) => {
      throw new Error(`Failed to release ${res}`);
    });
    registry.add('a');
    registry.add('b');

    await expect(registry.release()).rejects.toThrow(AggregateError);
  });
});

describe('Store primitive', () => {
  it('should store and manage key-value pairs', async () => {
    const store = new Store<{ setting: boolean }>();
    expect(await store.get('setting')).toBe(null);

    await store.set('setting', true);
    expect(await store.get('setting')).toBe(true);

    await store.delete('setting');
    expect(await store.get('setting')).toBe(null);

    await store.set('setting', false);
    await store.clear();
    expect(await store.get('setting')).toBe(null);
  });
});

describe('Validator primitive', () => {
  it('should validate inputs using custom validation functions', () => {
    const validateFn = (input: unknown) => {
      if (typeof input === 'string') {
        return { success: true, data: input.toUpperCase() };
      }
      return { success: false, error: new Error('Not a string') };
    };

    const validator = new Validator<string>(validateFn);

    const okResult = validator.validate('hello');
    expect(okResult.success).toBe(true);
    expect(okResult.data).toBe('HELLO');

    const errResult = validator.validate(123);
    expect(errResult.success).toBe(false);
    expect(errResult.error?.message).toBe('Not a string');
  });
});
