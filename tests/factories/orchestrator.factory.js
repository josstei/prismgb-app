/**
 * Orchestrator Factory
 *
 * Creates mock orchestrator and application container instances for testing.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';

/**
 * @typedef {import('@renderer/application/orchestrators/app.orchestrator').AppOrchestrator} AppOrchestrator
 */

/**
 * Creates a generic orchestrator mock covering the shared lifecycle surface.
 *
 * @param {Record<string, any>} [overrides={}] - Mock property and method overrides.
 * @returns {any} A generic orchestrator mock.
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
