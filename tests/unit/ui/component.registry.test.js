/**
 * UIComponentRegistry Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIComponentRegistry } from '@renderer/presentation/controller/component.registry.js';
import { createLoggerFactory, createUIComponentMock } from '../../factories/index.js';

describe('UIComponentRegistry', () => {
  let mockLogger;
  let mockLoggerFactory;

  beforeEach(() => {
    mockLoggerFactory = createLoggerFactory();
    mockLogger = mockLoggerFactory.create('UIComponentRegistry');
  });

  it('registers valid definitions', () => {
    const registry = new UIComponentRegistry({ loggerFactory: mockLoggerFactory });
    const create = vi.fn(() => createUIComponentMock());

    registry.register({ id: 'valid', create });

    expect(registry.get('valid')).toBeUndefined();
    expect(registry.definitions.has('valid')).toBe(true);
  });

  it('initializes core components only', () => {
    const coreComponent = createUIComponentMock();
    const deferredComponent = createUIComponentMock();
    const coreCreate = vi.fn(() => coreComponent);
    const deferredCreate = vi.fn(() => deferredComponent);
    const elements = { foo: 'bar' };
    const dependencies = { dep: true };

    const registry = new UIComponentRegistry({
      loggerFactory: mockLoggerFactory,
      componentDefinitions: [
        { id: 'core', create: coreCreate },
        { id: 'deferred', stage: 'deferred', create: deferredCreate }
      ]
    });

    registry.initialize(elements, dependencies);

    expect(coreCreate).toHaveBeenCalledWith({ elements, dependencies });
    expect(coreComponent.initialize).toHaveBeenCalledWith(elements);
    expect(deferredCreate).not.toHaveBeenCalled();
  });

  it('initializes a deferred component on demand', () => {
    const deferredComponent = createUIComponentMock();
    const deferredCreate = vi.fn(() => deferredComponent);
    const elements = { alpha: true };
    const dependencies = { beta: true };

    const registry = new UIComponentRegistry({
      loggerFactory: mockLoggerFactory,
      componentDefinitions: [{ id: 'deferred', stage: 'deferred', create: deferredCreate }]
    });

    const component = registry.initializeComponent('deferred', { elements, dependencies });

    expect(component).toBe(deferredComponent);
    expect(deferredCreate).toHaveBeenCalledWith({ elements, dependencies });
    expect(deferredComponent.initialize).toHaveBeenCalledWith(elements);
  });

  it('returns existing components without re-creating', () => {
    const component = createUIComponentMock();
    const create = vi.fn(() => component);

    const registry = new UIComponentRegistry({
      loggerFactory: mockLoggerFactory,
      componentDefinitions: [{ id: 'once', create }]
    });

    const first = registry.initializeComponent('once', { elements: {} });
    const second = registry.initializeComponent('once', { elements: {} });

    expect(first).toBe(component);
    expect(second).toBe(component);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('warns when initializing an unknown component', () => {
    const registry = new UIComponentRegistry({ loggerFactory: mockLoggerFactory });

    const result = registry.initializeComponent('missing');

    expect(result).toBeUndefined();
    expect(mockLogger.warn).toHaveBeenCalledWith('Component definition not found: missing');
  });

  it('disposes all created components', async () => {
    const componentA = createUIComponentMock();
    const componentB = createUIComponentMock();

    const registry = new UIComponentRegistry({
      loggerFactory: mockLoggerFactory,
      componentDefinitions: [
        { id: 'a', create: vi.fn(() => componentA) },
        { id: 'b', create: vi.fn(() => componentB) }
      ]
    });

    registry.initializeComponent('a', { elements: {} });
    registry.initializeComponent('b', { elements: {} });
    await registry.dispose();

    expect(componentA.dispose).toHaveBeenCalled();
    expect(componentB.dispose).toHaveBeenCalled();
    expect(registry.get('a')).toBeUndefined();
    expect(registry.get('b')).toBeUndefined();
  });
});
