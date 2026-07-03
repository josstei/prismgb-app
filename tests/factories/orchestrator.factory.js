/**
 * Orchestrator Factory
 *
 * Creates mock orchestrator and application container instances for testing.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';
import { createLoggerFactory } from './logger.factory.js';
import { createUIEffectsMock } from './ui.factory.js';
import { createEventBus } from './event-bus.factory.js';

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
 * Resolves the string key a mock inversify token stands for, so the mock
 * container can key its dependency map the same way regardless of whether a
 * caller passes a `Symbol.for(name)` service identifier or a plain name.
 *
 * @param {unknown} token - A `TOKENS.x` service identifier or a plain string.
 * @returns {string} The token's lookup key.
 */
function tokenKey(token) {
  return typeof token === 'symbol' ? (token.description ?? String(token)) : String(token);
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
    eventBus = createEventBus(),
    appState = {
      cinematicModeSignal: { value: true },
      isCinematicModeEnabled: true,
      isStreaming: false
    },
    bodyClassManager = {
      bindPresentationMode: vi.fn(),
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
    uiComponentRegistry,
    uiEffects,
    uiEventBridge,
    captureUiBridge,
    transcodeUiBridge,
    transcodeService,
    eventBus,
    appState,
    bodyClassManager,
    loggerFactory,
    ...services,
  };

  return {
    get: resolve
      ? vi.fn((token) => resolve(tokenKey(token), dependencyMap))
      : vi.fn((token) => dependencyMap[tokenKey(token)] || {}),
    bind: vi.fn((token) => ({
      toConstantValue: (value) => {
        dependencyMap[tokenKey(token)] = value;
      }
    })),
    isBound: vi.fn((token) => tokenKey(token) in dependencyMap),
    register,
    dispose,
    ...containerOverrides
  };
}
