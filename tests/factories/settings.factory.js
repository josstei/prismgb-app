/**
 * Settings Factory
 *
 * Creates mock settings and notes instances for testing.
 * Extracted from tests/factories/index.js as part of the factory-split refactor.
 */

import { vi } from 'vitest';
import { createEventBus } from './event-bus.factory.js';
import { createLoggerFactory } from './logger.factory.js';
import { createStorageService } from './storage.factory.js';
import { SettingsService } from '@renderer/infrastructure/services/settings/settings.service';
import { SettingsDefinitions } from '@renderer/lib/settings.definitions.js';

export function createSettingsServiceHarness(overrides = {}) {
  const eventBus = overrides.eventBus ?? createEventBus();
  const loggerFactory = overrides.loggerFactory ?? createLoggerFactory();
  const storageService = overrides.storageService ?? createStorageService(overrides.initialValues);
  const service = new SettingsService({ eventBus, loggerFactory, storageService });
  return { service, eventBus, loggerFactory, storageService, storage: storageService, logger: loggerFactory._getLogger('SettingsService') };
}

/**
 * Creates a mock SettingsService.
 *
 * @param {Partial<import('vitest').Mocked<SettingsService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<SettingsService>} A strongly-typed mock SettingsService.
 */
export function createSettingsServiceMock(overrides = {}) {
  const { values: overrideValues = {}, ...methodOverrides } = /** @type {any} */ (overrides);
  const values = {
    ...Object.fromEntries(SettingsDefinitions.definitions.map((definition) => [definition.name, definition.default])),
    ...overrideValues
  };
  const read = (name) => values[name];
  const definitionByName = new Map(SettingsDefinitions.definitions.map((definition) => [definition.name, definition]));
  return /** @type {any} */ ({
    getSetting: vi.fn((name) => {
      const definition = definitionByName.get(name);
      if (definition?.externalSource === 'window.loginItemAPI') {
        return Promise.resolve(read(name));
      }
      return read(name);
    }),
    getNumberSetting: vi.fn((name) => Number(read(name))),
    getBooleanSetting: vi.fn((name) => read(name) === true || read(name) === 'true'),
    getStringSetting: vi.fn((name) => String(read(name))),
    setSetting: vi.fn((name, value) => {
      values[name] = value;
      return true;
    }),
    ...methodOverrides
  });
}

/**
 * @typedef {import('@prismgb/notes').NotesService} NotesService
 */

/**
 * Creates a mock NotesService.
 *
 * @param {Partial<import('vitest').Mocked<NotesService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<NotesService>} A strongly-typed mock NotesService.
 */
export function createNotesServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    getAllNotes: vi.fn(() => []),
    getNote: vi.fn(() => null),
    createNote: vi.fn(() => null),
    updateNote: vi.fn(() => null),
    updateNoteWithChangeDetection: vi.fn(() => null),
    deleteNote: vi.fn(() => false),
    searchNotes: vi.fn(() => []),
    getUniqueGames: vi.fn(() => []),
    getNotesGroupedByGame: vi.fn(() => ({})),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/settings/settings-fullscreen.service').SettingsFullscreenService} SettingsFullscreenService
 */

/**
 * Creates a mock FullscreenService.
 *
 * @param {Partial<import('vitest').Mocked<SettingsFullscreenService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<SettingsFullscreenService>} A strongly-typed mock FullscreenService.
 */
export function createSettingsFullscreenServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    initialize: vi.fn(),
    dispose: vi.fn(),
    toggleFullscreen: vi.fn(),
    enterFullscreen: vi.fn(),
    exitFullscreen: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/settings/settings-cinematic-mode.service').SettingsCinematicModeService} SettingsCinematicModeService
 */

/**
 * Creates a mock CinematicModeService.
 *
 * @param {Partial<import('vitest').Mocked<SettingsCinematicModeService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<SettingsCinematicModeService>} A strongly-typed mock CinematicModeService.
 */
export function createSettingsCinematicModeServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    toggleCinematicMode: vi.fn(),
    ...overrides
  });
}

/**
 * @typedef {import('@renderer/infrastructure/services/settings/settings-presentation-mode.service').PresentationModeService} PresentationModeService
 */

/**
 * Creates a mock PresentationModeService.
 *
 * @param {Partial<import('vitest').Mocked<PresentationModeService>>} [overrides={}] - Mock property and method overrides.
 * @returns {import('vitest').Mocked<PresentationModeService>} A strongly-typed mock PresentationModeService.
 */
export function createPresentationModeServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    handleStreamingMode: vi.fn(),
    handleCinematicModeChanged: vi.fn(),
    handleMinimalistFullscreenChanged: vi.fn(),
    handleFullscreenState: vi.fn(),
    ...overrides
  });
}
