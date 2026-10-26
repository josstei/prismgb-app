import { vi } from 'vitest';

/** @typedef {import('@platform/notes').NotesService} NotesService */

/**
 * @param {Partial<import('vitest').Mocked<NotesService>>} [overrides={}]
 * @returns {import('vitest').Mocked<NotesService>}
 */
export function createNotesServiceMock(overrides = {}) {
  return /** @type {any} */ ({
    getAllNotes: vi.fn(() => []),
    getNote: vi.fn(() => null),
    createNote: vi.fn(() => null),
    updateNote: vi.fn(() => null),
    deleteNote: vi.fn(() => false),
    searchNotes: vi.fn(() => []),
    getUniqueGames: vi.fn(() => []),
    ...overrides
  });
}
