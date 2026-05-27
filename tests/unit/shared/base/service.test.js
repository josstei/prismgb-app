/**
 * BaseService Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BaseService } from '@shared/base/service.base.js';
import { createEventBus, createLoggerFactory, createMockElement } from '../../../factories/index.js';
import { installAnimationFrameMock } from '../../../support/mocks/browser-api.installers.js';

describe('BaseService', () => {
  let mockEventBus;
  let mockLoggerFactory;
  let mockLogger;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();
    mockLogger = mockLoggerFactory.create('TestService');
    mockEventBus = createEventBus();
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

  describe('Lifecycle helpers', () => {
    let service;

    beforeEach(() => {
      service = new BaseService(
        { eventBus: mockEventBus, loggerFactory: mockLoggerFactory },
        ['eventBus', 'loggerFactory'],
        'TestService'
      );
    });

    it('tracks EventBus subscriptions through listen()', async () => {
      const listener = vi.fn();
      const unsub = vi.fn();
      mockEventBus.subscribe = vi.fn(() => unsub);

      const stopListening = service.listen('device:connected', listener);

      expect(mockEventBus.subscribe).toHaveBeenCalledWith('device:connected', listener);
      expect(unsub).not.toHaveBeenCalled();

      await service.dispose();
      stopListening();
      expect(unsub).toHaveBeenCalledTimes(1);
    });

    it('tracks DOM/event-target listeners', async () => {
      const target = createMockElement('button');
      const handler = vi.fn();

      service.subscribe(target, 'click', handler);
      expect(target.addEventListener).toHaveBeenCalledWith('click', handler, undefined);

      await service.dispose();
      expect(target.removeEventListener).toHaveBeenCalledWith('click', handler, undefined);
    });

    it('tracks timeout and interval lifecycles and clears them on dispose', async () => {
      vi.useFakeTimers();

      const timeoutHandler = vi.fn();
      const intervalHandler = vi.fn();

      service.timeout(timeoutHandler, 1000);
      service.interval(intervalHandler, 100);

      await service.dispose();
      vi.advanceTimersByTime(2000);

      expect(timeoutHandler).not.toHaveBeenCalled();
      expect(intervalHandler).not.toHaveBeenCalled();

      vi.useRealTimers();
    });

    it('tracks animation frames and cancels on dispose', async () => {
      const animationFrameMock = installAnimationFrameMock({ requestAnimationFrame: vi.fn(() => 77), cancelAnimationFrame: vi.fn() });
      const frame = vi.fn();

      try {
        service.animationFrame(frame);
        await service.dispose();
        expect(animationFrameMock.cancelAnimationFrame).toHaveBeenCalledWith(77);
      } finally {
        animationFrameMock.cleanup();
      }
    });

    it('throws nothing when dispose is called multiple times', async () => {
      const unsub = vi.fn();
      mockEventBus.subscribe = vi.fn(() => unsub);
      service.listen('one', vi.fn());

      await expect(service.dispose()).resolves.toBeUndefined();
      await expect(service.dispose()).resolves.toBeUndefined();
    });
  });
});
