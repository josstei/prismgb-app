import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NotesService, NotesStorageKeys } from '@platform/notes';
import { PlatformEventBus, EventChannels } from '@platform/events';
import { NotesPanelComponent } from '@renderer/presentation/features/notes/notes-panel.component.js';
import { createAppShellTemplate } from '@renderer/presentation/shell/app-shell.template.js';
import { createDomBindings } from '@renderer/presentation/primitives/dom-bindings.utils.js';
import { createLoggerFactory } from '../factories/logger.factory.js';
import { createStorageService } from '../factories/storage.factory.js';

describe('notes persistence and presentation', () => {
  let panel: NotesPanelComponent;
  let service: NotesService;
  let eventBus: PlatformEventBus;
  let storage: ReturnType<typeof createStorageService>;
  let dom: ReturnType<typeof createDomBindings>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = createAppShellTemplate();
    dom = createDomBindings(document);
    const loggerFactory = createLoggerFactory();
    storage = createStorageService();
    eventBus = new PlatformEventBus({ loggerFactory });
    service = new NotesService({ storageService: storage, eventBus, loggerFactory });
    panel = new NotesPanelComponent({ notesService: service, eventBus, logger: loggerFactory.create('NotesPanel') });
    panel.initialize(dom.flat);
  });

  afterEach(async () => {
    await panel.dispose();
    await service.dispose();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });

  it('reconciles each successful create, autosave and delete once', () => {
    const render = vi.spyOn(panel.children!.listView, 'render');
    dom.notes.notesNewBtn!.click();
    expect(render).toHaveBeenCalledTimes(1);
    const noteId = panel.currentNoteId!;
    expect(dom.notes.notesTitleInput!.value).toBe('Untitled Note');

    render.mockClear();
    dom.notes.notesTitleInput!.value = 'Route through the cave';
    dom.notes.notesTitleInput!.dispatchEvent(new Event('input'));
    panel.hide();
    expect(render).toHaveBeenCalledTimes(1);
    expect(service.getNote(noteId)?.title).toBe('Route through the cave');
    expect(dom.notes.notesList!.textContent).toContain('Route through the cave');
    expect(JSON.parse(storage.getItem(NotesStorageKeys.USER_NOTES)!)[0].title).toBe('Route through the cave');

    render.mockClear();
    dom.notes.notesDeleteBtn!.dispatchEvent(new MouseEvent('mousedown', { cancelable: true }));
    vi.advanceTimersByTime(2000);
    expect(render).toHaveBeenCalledTimes(1);
    expect(service.getNote(noteId)).toBeNull();
    expect(panel.currentNoteId).toBeNull();
    expect(dom.notes.notesList!.textContent).toContain('No notes yet');
  });

  it('normalizes a vanished game filter and preserves the edited note', () => {
    const note = service.createNote('Checklist', '', 'Old Game')!;
    panel._selectNote(note.id);
    panel.children!.gameFilter.setCurrentFilter('Old Game');
    dom.notes.notesGameInput!.value = 'New Game';
    dom.notes.notesGameInput!.dispatchEvent(new Event('input'));
    panel.hide();
    expect(panel.children!.gameFilter.getCurrentFilter()).toBe('');
    expect(panel.currentNoteId).toBe(note.id);
    expect(dom.notes.notesList!.textContent).toContain('New Game');
  });

  it('does not reconcile a rejected write and flushes pending edits before remount', async () => {
    dom.notes.notesNewBtn!.click();
    const noteId = panel.currentNoteId!;
    const render = vi.spyOn(panel.children!.listView, 'render');
    render.mockClear();
    storage.setItem.mockReturnValueOnce(false);
    dom.notes.notesTitleInput!.value = 'Rejected';
    dom.notes.notesTitleInput!.dispatchEvent(new Event('input'));
    panel.hide();
    expect(render).not.toHaveBeenCalled();
    expect(service.getNote(noteId)?.title).toBe('Untitled Note');

    dom.notes.notesTitleInput!.value = 'Saved before remount';
    dom.notes.notesTitleInput!.dispatchEvent(new Event('input'));
    panel.initialize(dom.flat);
    expect(service.getNote(noteId)?.title).toBe('Saved before remount');
    expect(dom.notes.notesTitleInput!.value).toBe('Saved before remount');
    expect(eventBus.emitter.listenerCount(EventChannels.NOTES.NOTE_UPDATED)).toBe(1);
    await panel.dispose();
    expect(eventBus.emitter.listenerCount(EventChannels.NOTES.NOTE_UPDATED)).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });
});
