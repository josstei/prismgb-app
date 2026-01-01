/**
 * ServiceContainer Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ServiceContainer, asValue } from '@renderer/infrastructure/di/service-container.factory.js';

describe('ServiceContainer', () => {
  let container;

  beforeEach(() => {
    container = new ServiceContainer();
  });

  describe('Constructor', () => {
    it('should create empty container', () => {
      expect(container.has('anything')).toBe(false);
    });
  });

  describe('registerSingleton', () => {
    it('should register a class', () => {
      class TestService {}
      container.registerSingleton('testService', TestService);

      expect(container.has('testService')).toBe(true);
    });

    it('should register a factory function', () => {
      // Use asValue for non-class values
      container.register({ factory: asValue({ value: 42 }) });

      expect(container.has('factory')).toBe(true);
    });

    it('should return container for chaining', () => {
      class ServiceA {}
      class ServiceB {}

      const result = container
        .registerSingleton('a', ServiceA)
        .registerSingleton('b', ServiceB);

      expect(result).toBe(container);
    });

    it('should warn when overwriting existing service', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      container.registerSingleton('test', class A {});
      container.registerSingleton('test', class B {});

      expect(warnSpy).toHaveBeenCalledWith('[ServiceContainer] Service "test" is already registered. Overwriting.');
      warnSpy.mockRestore();
    });

    it('should register with dependencies', () => {
      class Logger {}
      class Service {
        constructor(logger) {
          this.logger = logger;
        }
      }

      container.registerSingleton('logger', Logger);
      container.registerSingleton('service', Service, ['logger']);

      const service = container.resolve('service');
      expect(service.logger).toBeInstanceOf(Logger);
    });
  });

  describe('register', () => {
    it('should register multiple services', () => {
      class ServiceA {}
      class ServiceB {}

      container.register({
        serviceA: ServiceA,
        serviceB: ServiceB
      });

      expect(container.has('serviceA')).toBe(true);
      expect(container.has('serviceB')).toBe(true);
    });

    it('should register values with asValue helper', () => {
      container.register({
        config: asValue({ apiUrl: 'http://test.com' }),
        number: asValue(42)
      });

      expect(container.resolve('config')).toEqual({ apiUrl: 'http://test.com' });
      expect(container.resolve('number')).toBe(42);
    });

    it('should return container for chaining', () => {
      const result = container.register({ test: class {} });
      expect(result).toBe(container);
    });
  });

  describe('resolve', () => {
    it('should resolve registered class', () => {
      class TestService {
        getValue() {
          return 'test';
        }
      }

      container.registerSingleton('test', TestService);
      const instance = container.resolve('test');

      expect(instance).toBeInstanceOf(TestService);
      expect(instance.getValue()).toBe('test');
    });

    it('should resolve value registered with asValue', () => {
      container.register({ factory: asValue({ value: 42 }) });

      const instance = container.resolve('factory');
      expect(instance.value).toBe(42);
    });

    it('should return same singleton instance', () => {
      class TestService {}
      container.registerSingleton('test', TestService);

      const instance1 = container.resolve('test');
      const instance2 = container.resolve('test');

      expect(instance1).toBe(instance2);
    });

    it('should resolve nested dependencies', () => {
      class Logger {}
      class Database {
        constructor(logger) {
          this.logger = logger;
        }
      }
      class UserService {
        constructor(db, logger) {
          this.db = db;
          this.logger = logger;
        }
      }

      container
        .registerSingleton('logger', Logger)
        .registerSingleton('database', Database, ['logger'])
        .registerSingleton('userService', UserService, ['database', 'logger']);

      const userService = container.resolve('userService');

      expect(userService.db).toBeInstanceOf(Database);
      expect(userService.logger).toBeInstanceOf(Logger);
      expect(userService.db.logger).toBe(userService.logger);
    });

    it('should throw for unregistered service', () => {
      expect(() => container.resolve('unknown')).toThrow(
        '[ServiceContainer] Service "unknown" not found'
      );
    });

    it('should throw for circular dependencies', () => {
      class ServiceA {
        constructor(serviceB) {}
      }
      class ServiceB {
        constructor(serviceA) {}
      }

      container
        .registerSingleton('serviceA', ServiceA, ['serviceB'])
        .registerSingleton('serviceB', ServiceB, ['serviceA']);

      expect(() => container.resolve('serviceA')).toThrow(
        '[ServiceContainer] Circular dependency detected: serviceA -> serviceB -> serviceA'
      );
    });

    it('should recover from resolution errors', () => {
      class BadService {
        constructor() {
          throw new Error('Constructor failed');
        }
      }

      container.registerSingleton('bad', BadService);

      expect(() => container.resolve('bad')).toThrow('Constructor failed');

      // Should be able to try again
      expect(() => container.resolve('bad')).toThrow('Constructor failed');
    });
  });

  describe('has', () => {
    it('should return true for registered definition', () => {
      container.registerSingleton('test', class {});
      expect(container.has('test')).toBe(true);
    });

    it('should return true for resolved instance', () => {
      container.register({ value: asValue(42) });
      expect(container.has('value')).toBe(true);
    });

    it('should return false for unregistered service', () => {
      expect(container.has('unknown')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should call dispose on services that have it', () => {
      const disposeSpy = vi.fn();
      const service = { dispose: disposeSpy };

      container.register({ service: asValue(service) });
      container.dispose();

      expect(disposeSpy).toHaveBeenCalled();
    });

    it('should clear all instances and definitions', () => {
      container.registerSingleton('test', class {});
      container.resolve('test');

      container.dispose();

      expect(container.has('test')).toBe(false);
    });

    it('should catch errors during dispose', () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badService = {
        dispose: () => {
          throw new Error('Dispose failed');
        }
      };

      container.register({ badService: asValue(badService) });
      container.dispose();

      expect(errorSpy).toHaveBeenCalledWith(
        '[ServiceContainer] Error disposing "badService":',
        expect.any(Error)
      );
      errorSpy.mockRestore();
    });

    it('should skip services without dispose method', () => {
      container.register({ value: asValue({ noDispose: true }) });
      expect(() => container.dispose()).not.toThrow();
    });
  });

  describe('asValue helper', () => {
    it('should create marked value object', () => {
      const result = asValue(42);

      expect(result.__asValue).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should work with objects', () => {
      const config = { key: 'value' };
      const result = asValue(config);

      expect(result.value).toBe(config);
    });

    it('should work with null', () => {
      const result = asValue(null);
      expect(result.value).toBeNull();
    });
  });
});
