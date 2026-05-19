import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createContainer,
  registerRendererDescriptors,
  defineRendererDescriptors
} from '@renderer/infrastructure/di/renderer-container.factory.ts';

class Logger {
  dispose() {}
}

class UsesLogger {
  constructor(dependencies) {
    this.logger = dependencies.logger;
  }
}

describe('Renderer DI descriptors', () => {
  let container;

  beforeEach(() => {
    container = createContainer();
  });

  it('registers class descriptors and resolves dependencies via constructor cradle', () => {
    registerRendererDescriptors(
      container,
      defineRendererDescriptors([
        {
          token: 'logger',
          kind: 'class',
          resolver: Logger
        }
      ])
    );

    registerRendererDescriptors(
      container,
      defineRendererDescriptors([
        {
          token: 'classUsingLogger',
          kind: 'class',
          resolver: UsesLogger,
          dependencies: ['logger']
        }
      ])
    );

    const classService = container.resolve('classUsingLogger');
    expect(classService.logger).toBeInstanceOf(Logger);

    registerRendererDescriptors(
      container,
      defineRendererDescriptors([
        {
          token: 'useLogger',
          kind: 'function',
          dependencies: ['logger'],
          resolver: ({ logger }) => ({ logger })
        }
      ])
    );

    const service = container.resolve('useLogger');
    expect(service.logger).toBeInstanceOf(Logger);
  });

  it('registers function descriptors with explicit dependency metadata', () => {
    const valueFactory = vi.fn(() => ({ logger: { dispose: vi.fn() } }));

    registerRendererDescriptors(
      container,
      defineRendererDescriptors([
        {
          token: 'factoryValue',
          kind: 'function',
          dependencies: [],
          resolver: valueFactory
        }
      ])
    );

    const service = container.resolve('factoryValue');
    expect(service).toEqual({ logger: { dispose: expect.any(Function) } });
  });

  it('registers value descriptors and applies disposer on dispose', async () => {
    const disposed = vi.fn();
    registerRendererDescriptors(
      container,
      defineRendererDescriptors([
        {
          token: 'valueService',
          kind: 'value',
          value: {
            dispose: disposed
          }
        }
      ])
    );

    expect(container.resolve('valueService').dispose).toBe(disposed);
    await container.dispose();
    expect(disposed).toHaveBeenCalled();
  });

  it('warns on duplicate token registration', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    registerRendererDescriptors(
      container,
      defineRendererDescriptors([
        {
          token: 'appKey',
          kind: 'value',
          value: 'one'
        },
        {
          token: 'appKey',
          kind: 'value',
          value: 'two'
        }
      ])
    );

    expect(warnSpy).toHaveBeenCalledWith('[RendererContainer] Token "appKey" is already registered. Overwriting.');
    expect(container.resolve('appKey')).toBe('two');
  });

  it('throws a helpful error for missing function dependencies', () => {
    registerRendererDescriptors(
      container,
      defineRendererDescriptors([
        {
          token: 'factoryValue',
          kind: 'function',
          dependencies: ['appKey'],
          resolver: () => ({ logger: {} })
        }
      ])
    );

    expect(() => container.resolve('factoryValue')).toThrow('[RendererContainer] Missing dependency "appKey" for "factoryValue"');
  });

  it('disposes async class services', async () => {
    const asyncDisposed = vi.fn(async () => {});
    class AsyncService {
      dispose() {
        return asyncDisposed();
      }
    }

    registerRendererDescriptors(
      container,
      defineRendererDescriptors([
        {
          token: 'logger',
          kind: 'class',
          resolver: AsyncService
        }
      ])
    );

    container.resolve('logger');
    await container.dispose();
    expect(asyncDisposed).toHaveBeenCalled();
  });
});
