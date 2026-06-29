import { describe, it, expect, vi } from 'vitest';
import {
  PrismError,
  PrismValidationError,
  PrismInitializationError,
  isDisposable,
  safeDisposeItem,
  safeDisposeItemAll,
  createSubscription,
  Container
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

    const result = await safeDisposeItem(disposable);
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

    const result = await safeDisposeItem(disposable, mockLogger);
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

    const result = await safeDisposeItem(disposable);
    expect(result).toBe(true);
    expect(resolved).toBe(true);
  });

  it('should dispose multiple resources safely', async () => {
    const d1 = { dispose: vi.fn() };
    const d2 = { dispose: vi.fn() };

    await safeDisposeItemAll([d1, d2]);
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

describe('Container primitive', () => {
  it('should register and resolve dependency factories', () => {
    const container = new Container<{ db: string; service: { db: string } }>();
    container.register('db', () => 'sqlite');
    container.register('service', (c) => ({ db: c.resolve('db') }));

    const service = container.resolve('service');
    expect(service.db).toBe('sqlite');
    expect(container.resolve('service')).toBe(service);
  });

  it('should throw error when resolving unregistered token', () => {
    const container = new Container<any>();
    expect(() => container.resolve('missing')).toThrow();
  });
});
