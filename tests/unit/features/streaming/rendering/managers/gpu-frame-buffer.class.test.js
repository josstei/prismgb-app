import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GpuFrameBuffer } from '@renderer/features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js';

describe('GpuFrameBuffer', () => {
  let buffer;
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };
    mockLoggerFactory = {
      create: vi.fn(() => mockLogger)
    };
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
});
