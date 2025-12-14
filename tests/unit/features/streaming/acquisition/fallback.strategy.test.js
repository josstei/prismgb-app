/**
 * DeviceAwareFallbackStrategy Unit Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceAwareFallbackStrategy } from '@features/streaming/acquisition/fallback.strategy.js';
import { AcquisitionContext } from '@features/streaming/acquisition/acquisition.context.js';

describe('DeviceAwareFallbackStrategy', () => {
  let strategy;
  let context;

  beforeEach(() => {
    strategy = new DeviceAwareFallbackStrategy();
    context = new AcquisitionContext({
      deviceId: 'test-device-123',
      profile: {
        audio: { sampleRate: 48000 },
        video: { width: 160, height: 144 }
      }
    });
  });

  describe('Constructor', () => {
    it('should create strategy with null chain before initialization', () => {
      expect(strategy.chain).toBeNull();
      expect(strategy.currentIndex).toBe(-1);
    });

    it('should not have context before initialization', () => {
      expect(strategy.getContext()).toBeNull();
    });
  });

  describe('initialize', () => {
    it('should build chain based on context profile', () => {
      strategy.initialize(context);

      expect(strategy.chain).not.toBeNull();
      expect(strategy.chain.length).toBeGreaterThan(0);
    });

    it('should reset current index', () => {
      strategy.initialize(context);
      strategy.getNext();
      strategy.getNext();

      strategy.initialize(context);

      expect(strategy.currentIndex).toBe(-1);
    });

    it('should store context reference', () => {
      strategy.initialize(context);

      expect(strategy.getContext()).toBe(context);
    });

    it('should build correct fallback chain for audio+video profile', () => {
      strategy.initialize(context);

      const names = strategy.chain.map(f => f.name);
      expect(names).toContain('simple');
      expect(names).toContain('minimal');
      expect(names).toContain('video-only-simple');
      expect(names).toContain('video-only-minimal');
    });

    it('should build video-only fallbacks for video-only profile', () => {
      const videoOnlyContext = new AcquisitionContext({
        deviceId: 'test-device-123',
        profile: { video: { width: 160, height: 144 } }
      });

      strategy.initialize(videoOnlyContext);

      const names = strategy.chain.map(f => f.name);
      expect(names).not.toContain('simple');
      expect(names).not.toContain('minimal');
      expect(names).toContain('video-only-simple');
      expect(names).toContain('video-only-minimal');
    });
  });

  describe('getNext', () => {
    beforeEach(() => {
      strategy.initialize(context);
    });

    it('should return first fallback on first call', () => {
      const result = strategy.getNext();
      expect(result.name).toBe('simple');
    });

    it('should return subsequent fallbacks on repeated calls', () => {
      strategy.getNext(); // first
      const second = strategy.getNext();
      expect(second.name).toBe('minimal');
    });

    it('should return null when chain is exhausted', () => {
      // Exhaust all fallbacks
      while (strategy.hasMore()) {
        strategy.getNext();
      }
      strategy.getNext(); // Last one

      const result = strategy.getNext();
      expect(result).toBeNull();
    });

    it('should throw error if not initialized', () => {
      const uninitializedStrategy = new DeviceAwareFallbackStrategy();
      expect(() => uninitializedStrategy.getNext()).toThrow('must be initialized');
    });

    it('should return fallbacks with correct structure', () => {
      const fallback = strategy.getNext();

      expect(fallback).toHaveProperty('name');
      expect(fallback).toHaveProperty('detailLevel');
      expect(fallback).toHaveProperty('audio');
      expect(fallback).toHaveProperty('video');
      expect(fallback).toHaveProperty('description');
    });
  });

  describe('hasMore', () => {
    beforeEach(() => {
      strategy.initialize(context);
    });

    it('should return true before any fallbacks used', () => {
      expect(strategy.hasMore()).toBe(true);
    });

    it('should return true when more fallbacks available', () => {
      strategy.getNext();
      expect(strategy.hasMore()).toBe(true);
    });

    it('should return false when on last fallback', () => {
      // Get all fallbacks
      while (strategy.hasMore()) {
        strategy.getNext();
      }
      expect(strategy.hasMore()).toBe(false);
    });

    it('should return false if not initialized', () => {
      const uninitializedStrategy = new DeviceAwareFallbackStrategy();
      expect(uninitializedStrategy.hasMore()).toBe(false);
    });
  });

  describe('reset', () => {
    beforeEach(() => {
      strategy.initialize(context);
    });

    it('should reset current index', () => {
      strategy.getNext();
      strategy.getNext();

      strategy.reset();

      expect(strategy.currentIndex).toBe(-1);
    });

    it('should allow restarting fallback chain after reset', () => {
      const first1 = strategy.getNext();
      strategy.reset();
      const first2 = strategy.getNext();

      expect(first1.name).toBe(first2.name);
    });
  });

  describe('getRemainingCount', () => {
    beforeEach(() => {
      strategy.initialize(context);
    });

    it('should return full count before any used', () => {
      const total = strategy.chain.length;
      expect(strategy.getRemainingCount()).toBe(total);
    });

    it('should decrease as fallbacks are used', () => {
      const initial = strategy.getRemainingCount();
      strategy.getNext();
      expect(strategy.getRemainingCount()).toBe(initial - 1);
    });

    it('should return 0 when exhausted', () => {
      while (strategy.hasMore()) {
        strategy.getNext();
      }
      strategy.getNext(); // Last one

      expect(strategy.getRemainingCount()).toBe(0);
    });

    it('should return 0 if not initialized', () => {
      const uninitializedStrategy = new DeviceAwareFallbackStrategy();
      expect(uninitializedStrategy.getRemainingCount()).toBe(0);
    });
  });

  describe('Fallback configurations', () => {
    beforeEach(() => {
      strategy.initialize(context);
    });

    it('should have simple fallback with both audio and video', () => {
      const simple = strategy.chain.find(f => f.name === 'simple');
      expect(simple.audio).toBe(true);
      expect(simple.video).toBe(true);
      expect(simple.detailLevel).toBe('simple');
    });

    it('should have minimal fallback with both audio and video', () => {
      const minimal = strategy.chain.find(f => f.name === 'minimal');
      expect(minimal.audio).toBe(true);
      expect(minimal.video).toBe(true);
      expect(minimal.detailLevel).toBe('minimal');
    });

    it('should have video-only-simple with video only', () => {
      const videoSimple = strategy.chain.find(f => f.name === 'video-only-simple');
      expect(videoSimple.audio).toBe(false);
      expect(videoSimple.video).toBe(true);
      expect(videoSimple.detailLevel).toBe('simple');
    });

    it('should have video-only-minimal as last resort', () => {
      const videoMinimal = strategy.chain.find(f => f.name === 'video-only-minimal');
      expect(videoMinimal.audio).toBe(false);
      expect(videoMinimal.video).toBe(true);
      expect(videoMinimal.detailLevel).toBe('minimal');
    });
  });
});
