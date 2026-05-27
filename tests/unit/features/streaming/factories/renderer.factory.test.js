/**
 * StreamingRendererFactory Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamingRendererFactory } from '@renderer/infrastructure/factories/streaming-renderer.factory.ts';
import { createEventBus, createLoggerFactory } from '../../../../factories/index.js';

class MockGpuRenderer {
  constructor() {
    this._deps = arguments[0] || {};
  }
}

class MockCanvasRenderer {
  constructor() {
    this._deps = arguments[0] || {};
  }
}

describe('StreamingRendererFactory', () => {
  let factory;
  let mockEventBus;
  let mockLoggerFactory;
  let mockLogger;
  let rendererClasses;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    rendererClasses = new Map([
      ['gpu', MockGpuRenderer],
      ['canvas2d', MockCanvasRenderer]
    ]);

    factory = new StreamingRendererFactory(mockEventBus, mockLoggerFactory, rendererClasses);
    mockLogger = mockLoggerFactory._getLogger('StreamingRendererFactory');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should initialize and track renderer registrations', () => {
    factory.initialize();

    expect(factory.hasRenderer('gpu')).toBe(true);
    expect(factory.hasRenderer('canvas2d')).toBe(true);
    expect(factory.getRegisteredTypes()).toEqual(['gpu', 'canvas2d']);
    expect(factory._initialized).toBe(true);
  });

  it('should create configured renderer instances with merged dependencies', () => {
    factory.initialize();

    const renderer = factory.createRenderer('gpu', { loggerFactory: 'override' });

    expect(renderer).toBeInstanceOf(MockGpuRenderer);
    expect(renderer._deps).toEqual({
      loggerFactory: 'override'
    });
  });

  it('should preserve metadata defaults', () => {
    factory.initialize();

    expect(factory.getMetadata('gpu')).toEqual({
      typeId: 'gpu',
      supportsPresets: true
    });
    expect(factory.getMetadata('canvas2d')).toEqual({
      typeId: 'canvas2d',
      supportsPresets: false
    });
  });

  it('should throw for unknown renderer creation', () => {
    factory.initialize();

    expect(() => factory.createRenderer('invalid', {})).toThrow(
      'No renderer registered for type: invalid'
    );
  });

  it('should warn if initialized more than once', () => {
    factory.initialize();
    factory.initialize();

    expect(mockLogger.warn).toHaveBeenCalledWith('StreamingRendererFactory already initialized');
  });

  it('should report error when creating before initialization', () => {
    expect(() => factory.createRenderer('gpu')).toThrow(
      'StreamingRendererFactory not initialized. Call initialize() first.'
    );
  });

  it('should support manual renderer registration and unregistration', () => {
    const unregisterType = 'custom';
    const CustomRenderer = class {};

    factory.registerRenderer(unregisterType, CustomRenderer, { supportsPresets: false });
    expect(factory.hasRenderer(unregisterType)).toBe(true);

    factory.initialize();
    expect(factory.hasRenderer(unregisterType)).toBe(true);

    factory.registerRenderer(unregisterType, CustomRenderer, { supportsPresets: false });
    expect(factory.hasRenderer(unregisterType)).toBe(true);
    expect(factory.getMetadata(unregisterType)).toEqual({
      typeId: unregisterType,
      supportsPresets: false
    });

    factory.unregister(unregisterType);
    expect(factory.hasRenderer(unregisterType)).toBe(false);
  });

  it('should clear registrations and reset initialization state', () => {
    factory.initialize();
    factory.clear();

    expect(factory.getRegisteredTypes()).toEqual([]);
    expect(factory._initialized).toBe(false);
    expect(factory.hasRenderer('gpu')).toBe(false);
  });

  it('should resolve render type by capability and performance mode', () => {
    expect(factory.selectRendererType({}, false, true)).toBe('gpu');
    expect(factory.selectRendererType({}, true, true)).toBe('canvas2d');
    expect(factory.selectRendererType({ supportsGPU: false }, false, true)).toBe('canvas2d');
  });
});
