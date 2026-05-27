import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GpuFrameBuffer } from '@renderer/infrastructure/services/streaming/gpu-frame-buffer.ts';
import { createLoggerFactory } from '../../../../../factories/index.js';

describe('GpuFrameBuffer', () => {
  let buffer;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();
  });

  describe('constructor', () => {
    it('should create buffer with default size of 3', () => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });

      expect(buffer.getCapacity()).toBe(3);
      expect(buffer.getSize()).toBe(0);
    });

    it('should create buffer with custom size', () => {
      buffer = new GpuFrameBuffer({
        loggerFactory: mockLoggerFactory,
        bufferSize: 5
      });

      expect(buffer.getCapacity()).toBe(5);
    });
  });

  describe('enqueue', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should add frame to queue and return true', () => {
      const frame = { imageBitmap: {}, uniforms: {} };

      const result = buffer.enqueue(frame);

      expect(result).toBe(true);
      expect(buffer.getSize()).toBe(1);
    });

    it('should reject frame when queue is full and return false', () => {
      const frame = { imageBitmap: {}, uniforms: {} };

      // Fill the buffer (default capacity = 3)
      buffer.enqueue(frame);
      buffer.enqueue(frame);
      buffer.enqueue(frame);

      // This should be rejected
      const result = buffer.enqueue(frame);

      expect(result).toBe(false);
      expect(buffer.getSize()).toBe(3);
    });
  });

  describe('dequeue', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should return oldest frame (FIFO order)', () => {
      const frame1 = { id: 1 };
      const frame2 = { id: 2 };

      buffer.enqueue(frame1);
      buffer.enqueue(frame2);

      const result = buffer.dequeue();

      expect(result).toEqual(frame1);
      expect(buffer.getSize()).toBe(1);
    });

    it('should return null when queue is empty', () => {
      const result = buffer.dequeue();

      expect(result).toBeNull();
    });
  });

  describe('isFull', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should return false when queue has space', () => {
      buffer.enqueue({ id: 1 });

      expect(buffer.isFull()).toBe(false);
    });

    it('should return true when queue is at capacity', () => {
      buffer.enqueue({ id: 1 });
      buffer.enqueue({ id: 2 });
      buffer.enqueue({ id: 3 });

      expect(buffer.isFull()).toBe(true);
    });
  });

  describe('flush', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should clear all frames from queue', () => {
      buffer.enqueue({ id: 1 });
      buffer.enqueue({ id: 2 });

      buffer.flush();

      expect(buffer.getSize()).toBe(0);
      expect(buffer.isFull()).toBe(false);
    });
  });

  describe('getMetrics', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should return zero metrics for empty buffer', () => {
      const metrics = buffer.getMetrics();

      expect(metrics).toEqual({
        queued: 0,
        dropped: 0,
        avgLatency: 0
      });
    });

    it('should track dropped frames', () => {
      // Fill buffer
      buffer.enqueue({ id: 1 });
      buffer.enqueue({ id: 2 });
      buffer.enqueue({ id: 3 });

      // Try to add more (should be dropped)
      buffer.enqueue({ id: 4 });
      buffer.enqueue({ id: 5 });

      const metrics = buffer.getMetrics();

      expect(metrics.queued).toBe(3);
      expect(metrics.dropped).toBe(2);
    });

    it('should calculate average latency after dequeue', () => {
      buffer.enqueue({ id: 1 });
      buffer.dequeue();

      const metrics = buffer.getMetrics();

      expect(metrics.avgLatency).toBeGreaterThanOrEqual(0);
    });
  });

  describe('resetMetrics', () => {
    beforeEach(() => {
      buffer = new GpuFrameBuffer({ loggerFactory: mockLoggerFactory });
    });

    it('should reset all counters', () => {
      buffer.enqueue({ id: 1 });
      buffer.enqueue({ id: 2 });
      buffer.enqueue({ id: 3 });
      buffer.enqueue({ id: 4 }); // dropped
      buffer.dequeue();

      buffer.resetMetrics();

      const metrics = buffer.getMetrics();
      expect(metrics.dropped).toBe(0);
      expect(metrics.avgLatency).toBe(0);
    });
  });
});
