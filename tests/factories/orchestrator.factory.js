/**
 * Orchestrator Factory
 *
 * Creates mock orchestrator and application container instances for testing.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';
import { createLoggerFactory } from './logger.factory.js';
import { createUIEffectsMock } from './ui.factory.js';

/**
 * @typedef {import('@renderer/application/orchestrators/app.orchestrator').AppOrchestrator} AppOrchestrator
 */

/**
 * Creates a mock AppOrchestrator.
 *
 * @param {Partial<import('vitest').Mocked<AppOrchestrator>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<AppOrchestrator>} A strongly-typed mock AppOrchestrator.
 */
export function createOrchestratorMock(overrides = {}) {
  return /** @type {any} */ ({
    initialize: vi.fn().mockResolvedValue(undefined),
    onInitialize: vi.fn().mockResolvedValue(undefined),
    onCleanup: vi.fn().mockResolvedValue(undefined),
    cleanup: vi.fn().mockResolvedValue(undefined),
    start: vi.fn(),
    stop: vi.fn(),
    loadPreferences: vi.fn(),
    toggleFullscreen: vi.fn(),
    toggleCinematicMode: vi.fn(),
    initializeSettingsMenu: vi.fn(),
    initializeShaderSelector: vi.fn(),
    initializeNotesPanel: vi.fn(),
    setupOverlayClickHandlers: vi.fn(),
    setupUIEventListeners: vi.fn(),
    ...overrides
  });
}

/**
 * Creates a mock RendererAppContainer.
 *
 * @param {Record<string, any>} [overrides={}] - Mock property and container overrides.
 * @returns {any} A mock RendererAppContainer.
 */
export function createRendererAppContainerMock(overrides = {}) {
  const {
    appOrchestrator = createOrchestratorMock({
      initialize: vi.fn().mockResolvedValue(undefined),
      start: vi.fn().mockResolvedValue(undefined),
      cleanup: vi.fn().mockResolvedValue(undefined)
    }),
    adapterFactory = {
      initialize: vi.fn().mockResolvedValue(undefined)
    },
    uiComponentRegistry = {
      initialize: vi.fn(),
      initializeComponent: vi.fn(),
      get: vi.fn(),
      dispose: vi.fn()
    },
    uiEffects = {
      elements: null,
      triggerShutterFlash: vi.fn(),
      triggerButtonFeedback: vi.fn(),
      ...createUIEffectsMock(),
    },
    uiEventBridge = {
      initialize: vi.fn(),
      dispose: vi.fn()
    },
    captureUiBridge = {
      initialize: vi.fn(),
      dispose: vi.fn()
    },
    transcodeUiBridge = {
      initialize: vi.fn(),
      dispose: vi.fn()
    },
    transcodeService = {
      initialize: vi.fn(),
      dispose: vi.fn()
    },
    loggerFactory = createLoggerFactory(),
    services = {},
    register = vi.fn(),
    dispose = vi.fn(),
    resolve,
    ...containerOverrides
  } = overrides;

  const dependencyMap = {
    appOrchestrator,
    adapterFactory,
    uiComponentRegistry,
    uiEffects,
    uiEventBridge,
    captureUiBridge,
    transcodeUiBridge,
    transcodeService,
    loggerFactory,
    ...services,
  };

  return {
    resolve: resolve
      ? vi.fn((name) => resolve(name, dependencyMap))
      : vi.fn((name) => dependencyMap[name] || {}),
    register,
    dispose,
    ...containerOverrides
  };
}
