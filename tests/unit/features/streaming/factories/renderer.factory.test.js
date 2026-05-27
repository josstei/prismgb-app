/**
 * StreamingRendererFactory Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { StreamingRendererFactory } from '@renderer/infrastructure/factories/streaming-renderer.factory.ts';
import { createEventBus, createLoggerFactory } from '../../../../factories/index.js';

class MockGpuRenderer {
  constructor(deps) {
    this._deps = deps || {};
  }
}

class MockCanvasRenderer {
  constructor(deps) {
    this._deps = deps || {};
  }
}

describe('StreamingRendererFactory', () => {
  let factory;
  let mockEventBus;
  let mockLoggerFactory;
  let mockLogger;
  let gpuProvider;
  let canvas2dProvider;
  let rendererProviders;

  beforeEach(() => {
    vi.clearAllMocks();

    mockEventBus = createEventBus();
    mockLoggerFactory = createLoggerFactory();

    gpuProvider = vi.fn((deps) => new MockGpuRenderer(deps));
    canvas2dProvider = vi.fn((deps) => new MockCanvasRenderer(deps));

    rendererProviders = {
      gpu: gpuProvider,
      canvas2d: canvas2dProvider
    };

    factory = new StreamingRendererFactory(mockEventBus, mockLoggerFactory, rendererProviders);
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

    const renderer = factory.createRenderer({
      type: 'gpu',
      dependencies: { appState: 'state' }
    });

    expect(renderer).toBeInstanceOf(MockGpuRenderer);
    expect(renderer._deps).toEqual({
      loggerFactory: mockLoggerFactory,
      appState: 'state'
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

    expect(() => factory.createRenderer({ type: 'invalid', dependencies: {} })).toThrow(
      'No renderer registered for type: invalid'
    );
  });

  it('should warn if initialized more than once', () => {
    factory.initialize();
    factory.initialize();

    expect(mockLogger.warn).toHaveBeenCalledWith('StreamingRendererFactory already initialized');
  });

  it('should report error when creating before initialization', () => {
    expect(() => factory.createRenderer({ type: 'gpu', dependencies: {} })).toThrow(
      'StreamingRendererFactory not initialized. Call initialize() first.'
    );
  });

  it('should support manual renderer registration and unregistration', () => {
    const CustomRenderer = class {
      constructor(deps) { this._deps = deps; }
    };
    const customProvider = vi.fn((deps) => new CustomRenderer(deps));

    factory.registerRenderer('gpu', customProvider, { supportsPresets: false });
    expect(factory.hasRenderer('gpu')).toBe(true);

    factory.initialize();
    expect(factory.hasRenderer('gpu')).toBe(true);

    const renderer = factory.createRenderer({ type: 'gpu', dependencies: { customDep: true } });
    expect(renderer).toBeInstanceOf(CustomRenderer);

    factory.unregister('gpu');
    expect(factory.hasRenderer('gpu')).toBe(false);
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
