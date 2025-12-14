/**
 * BaseService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseService } from '@shared/base/service.js';

describe('BaseService', () => {
  let mockEventBus;
  let mockLoggerFactory;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn()
    };

    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };

    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(),
      unsubscribe: vi.fn()
    };
  });

  describe('Constructor', () => {
    it('should create service with valid dependencies', () => {
      const service = new BaseService(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus', 'loggerFactory'],
        'TestService'
      );

      expect(service.eventBus).toBe(mockEventBus);
      expect(service.loggerFactory).toBe(mockLoggerFactory);
      expect(service.logger).toBe(mockLogger);
    });

    it('should throw for missing required dependencies', () => {
      expect(() => new BaseService(
        { loggerFactory: mockLoggerFactory },
        ['eventBus', 'loggerFactory'],
        'TestService'
      )).toThrow('TestService: Missing required dependencies: eventBus');
    });

    it('should throw for multiple missing dependencies', () => {
      expect(() => new BaseService(
        {},
        ['eventBus', 'loggerFactory', 'otherDep'],
        'TestService'
      )).toThrow('Missing required dependencies: eventBus, loggerFactory, otherDep');
    });

    it('should use constructor name if serviceName not provided', () => {
      class MyService extends BaseService {
        constructor(deps) {
          super(deps, ['eventBus'], null);
        }
      }

      expect(() => new MyService({})).toThrow('MyService: Missing required dependencies: eventBus');
    });

    it('should work without loggerFactory', () => {
      const service = new BaseService(
        { eventBus: mockEventBus },
        ['eventBus'],
        'TestService'
      );

      expect(service.logger).toBeUndefined();
    });

    it('should allow empty required dependencies', () => {
      const service = new BaseService({}, [], 'TestService');
      expect(service._serviceName).toBe('TestService');
    });
  });
});
