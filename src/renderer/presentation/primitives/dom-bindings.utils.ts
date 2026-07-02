import {
  bindTemplateRefs,
  type TemplateRefLegacyIdMap,
} from '@platform/ui-base';
import {
  TemplateDomRefGroups,
  TemplateRefLegacyIds,
  type TemplateDomNotesRef,
  type TemplateDomSettingsRef,
  type TemplateDomShellRef,
  type TemplateDomStreamingRef,
  type TemplateDomUpdatesRef
} from '@renderer/presentation/primitives/template-dom.contract.js';

type DomBindingsFor<
  TRef extends string,
  TElementTypes extends Partial<Record<TRef, HTMLElement>> = Record<never, never>
> = {
  [TKey in TRef]: TKey extends keyof TElementTypes ? TElementTypes[TKey] | null : HTMLElement | null;
};

export type DomShellBindings = DomBindingsFor<TemplateDomShellRef>;

interface DomStreamingElementTypes {
  streamVideo: HTMLVideoElement;
  streamCanvas: HTMLCanvasElement;
  screenshotBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
  brightnessSlider: HTMLInputElement;
  volumeSliderVertical: HTMLInputElement;
}

export type DomStreamingBindings = DomBindingsFor<TemplateDomStreamingRef, DomStreamingElementTypes>;

export type DomSettingsBindings = DomBindingsFor<TemplateDomSettingsRef>;

interface DomUpdateElementTypes {
  updateActionBtn: HTMLButtonElement;
}

export type DomUpdateBindings = DomBindingsFor<TemplateDomUpdatesRef, DomUpdateElementTypes>;

interface DomNotesElementTypes {
  notesSearchInput: HTMLInputElement;
  notesGameInput: HTMLInputElement;
  notesTitleInput: HTMLInputElement;
  notesContentArea: HTMLTextAreaElement;
  notesDeleteBtn: HTMLButtonElement;
}

export type DomNotesBindings = DomBindingsFor<TemplateDomNotesRef, DomNotesElementTypes>;

export type DomBindingsFlat =
  DomShellBindings &
  DomStreamingBindings &
  DomSettingsBindings &
  DomUpdateBindings &
  DomNotesBindings;

export interface DomBindings {
  shell: DomShellBindings;
  streaming: DomStreamingBindings;
  settings: DomSettingsBindings;
  updates: DomUpdateBindings;
  notes: DomNotesBindings;
  flat: DomBindingsFlat;
}

const settingsLegacyIds = TemplateRefLegacyIds satisfies TemplateRefLegacyIdMap<DomSettingsBindings>;

function createDomBindings(root: ParentNode = document): DomBindings {
  const shell = bindTemplateRefs<DomShellBindings>(root, TemplateDomRefGroups.shell);
  const streaming = bindTemplateRefs<DomStreamingBindings>(root, TemplateDomRefGroups.streaming);
  const settings = bindTemplateRefs<DomSettingsBindings>(root, TemplateDomRefGroups.settings, {
    legacyIds: settingsLegacyIds
  });
  const updates = bindTemplateRefs<DomUpdateBindings>(root, TemplateDomRefGroups.updates);
  const notes = bindTemplateRefs<DomNotesBindings>(root, TemplateDomRefGroups.notes);

  const flat = {
    ...shell,
    ...streaming,
    ...settings,
    ...updates,
    ...notes
  };

  return {
    shell,
    streaming,
    settings,
    updates,
    notes,
    flat
  };
}

export { createDomBindings };
