/**
 * Core Interfaces Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { IConstraintBuilder, IStreamLifecycle } from '@shared/streaming/acquisition/acquisition.interface.js';
import { IFallbackStrategy } from '@shared/interfaces/fallback-strategy.interface.js';

describe('IConstraintBuilder', () => {
  let builder;

  beforeEach(() => {
    builder = new IConstraintBuilder();
  });

  describe('Interface Methods', () => {
    it('should throw on build()', () => {
      expect(() => builder.build({}, 'full', {})).toThrow('build() must be implemented');
    });

    it('should throw on build() with different detail levels', () => {
      expect(() => builder.build({}, 'simple', {})).toThrow('build() must be implemented');
      expect(() => builder.build({}, 'minimal', {})).toThrow('build() must be implemented');
    });
  });

  describe('Subclass Implementation', () => {
    it('should allow subclasses to override methods', () => {
      class TestConstraintBuilder extends IConstraintBuilder {
        build(context, detailLevel = 'full', options = {}) {
          const deviceConstraint = { exact: context.deviceId };
          if (detailLevel === 'minimal') {
            return { video: { deviceId: deviceConstraint } };
          }
          return {
            video: { deviceId: deviceConstraint, width: context.profile?.video?.width }
          };
        }
      }

      const testBuilder = new TestConstraintBuilder();
      const mockContext = {
        deviceId: 'test-123',
        profile: { video: { width: 640 } }
      };

      expect(testBuilder.build(mockContext, 'full')).toEqual({
        video: { deviceId: { exact: 'test-123' }, width: 640 }
      });
      expect(testBuilder.build(mockContext, 'minimal')).toEqual({
        video: { deviceId: { exact: 'test-123' } }
      });
    });
  });
});

describe('IStreamLifecycle', () => {
  let lifecycle;

  beforeEach(() => {
    lifecycle = new IStreamLifecycle();
  });

  describe('Interface Methods', () => {
    it('should throw on acquireStream()', async () => {
      await expect(lifecycle.acquireStream({})).rejects.toThrow('acquireStream() must be implemented');
    });

    it('should throw on acquireStream() with options', async () => {
      await expect(lifecycle.acquireStream({}, { fallback: true })).rejects.toThrow('acquireStream() must be implemented');
    });

    it('should throw on releaseStream()', async () => {
      await expect(lifecycle.releaseStream({})).rejects.toThrow('releaseStream() must be implemented');
    });

    it('should throw on getStreamInfo()', () => {
      expect(() => lifecycle.getStreamInfo({})).toThrow('getStreamInfo() must be implemented');
    });

    it('should throw on isStreamActive()', () => {
      expect(() => lifecycle.isStreamActive({})).toThrow('isStreamActive() must be implemented');
    });

    it('should throw on getActiveStreams()', () => {
      expect(() => lifecycle.getActiveStreams()).toThrow('getActiveStreams() must be implemented');
    });
  });

  describe('Subclass Implementation', () => {
    it('should allow subclasses to override methods', async () => {
      class TestStreamLifecycle extends IStreamLifecycle {
        constructor() {
          super();
          this.streams = [];
        }

        async acquireStream(constraints, options = {}) {
          const stream = { id: 'test', active: true };
          this.streams.push(stream);
          return stream;
        }

        async releaseStream(stream) {
          this.streams = this.streams.filter(s => s !== stream);
        }

        getStreamInfo(stream) {
          return { id: stream.id };
        }

        isStreamActive(stream) {
          return stream.active;
        }

        getActiveStreams() {
          return this.streams;
        }
      }

      const testLifecycle = new TestStreamLifecycle();

      const stream = await testLifecycle.acquireStream({});
      expect(stream.id).toBe('test');
      expect(testLifecycle.isStreamActive(stream)).toBe(true);
      expect(testLifecycle.getActiveStreams()).toHaveLength(1);
    });
  });
});

describe('IFallbackStrategy', () => {
  let strategy;

  beforeEach(() => {
    strategy = new IFallbackStrategy();
  });

  describe('Interface Methods', () => {
    it('should throw on initialize()', () => {
      expect(() => strategy.initialize({})).toThrow('initialize() must be implemented');
    });

    it('should throw on getNext()', () => {
      expect(() => strategy.getNext()).toThrow('getNext() must be implemented');
    });

    it('should throw on reset()', () => {
      expect(() => strategy.reset()).toThrow('reset() must be implemented');
    });

    it('should throw on hasMore()', () => {
      expect(() => strategy.hasMore()).toThrow('hasMore() must be implemented');
    });
  });

  describe('Subclass Implementation', () => {
    it('should allow subclasses to override methods', () => {
      class TestFallbackStrategy extends IFallbackStrategy {
        constructor() {
          super();
          this.fallbacks = [{ level: 1 }, { level: 2 }];
          this.index = 0;
        }

        initialize(context) {
          this.context = context;
          this.index = 0;
        }

        getNext() {
          if (this.index >= this.fallbacks.length) return null;
          return this.fallbacks[this.index++];
        }

        reset() {
          this.index = 0;
        }

        hasMore() {
          return this.index < this.fallbacks.length;
        }
      }

      const testStrategy = new TestFallbackStrategy();
      testStrategy.initialize({});

      expect(testStrategy.hasMore()).toBe(true);
      expect(testStrategy.getNext()).toEqual({ level: 1 });

      testStrategy.reset();
      expect(testStrategy.hasMore()).toBe(true);
    });
  });
});
