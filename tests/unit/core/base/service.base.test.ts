import { describe, it, expect, vi } from 'vitest';
import { BaseService } from '@core/base/service.base';

describe('BaseService', () => {
  describe('constructor', () => {
    it('should validate required dependencies', () => {
      expect(() => {
        new BaseService({}, ['eventBus'], 'TestService');
      }).toThrow('TestService: missing required dependency: eventBus');
    });

    it('should assign required dependencies to instance', () => {
      const mockEventBus = { publish: vi.fn() };
      const service = new BaseService(
        { eventBus: mockEventBus },
        ['eventBus'],
        'TestService'
      );

      expect((service as any).eventBus).toBe(mockEventBus);
    });

    it('should create logger if loggerFactory provided', () => {
      const mockLogger = { info: vi.fn() };
      const mockLoggerFactory = { create: vi.fn().mockReturnValue(mockLogger) };

      const service = new BaseService(
        { loggerFactory: mockLoggerFactory },
        [],
        'TestService'
      );

      expect(mockLoggerFactory.create).toHaveBeenCalledWith('TestService');
      expect((service as any).logger).toBe(mockLogger);
    });

    it('should use constructor name if serviceName not provided', () => {
      class MyService extends BaseService {
        constructor() {
          super({}, [], null);
        }
      }

      const service = new MyService();
      expect((service as any)._serviceName).toBe('MyService');
    });
  });
});
