import {
  bindTemplateRefs,
  type TemplateRefLegacyIdMap,
  type TemplateRefList
} from '@renderer/presentation/primitives/template-ref.utils.js';
import {
  getSettingsControlRefs,
  type SettingsControlRef
} from '@shared/features/settings/settings.definitions.js';

export type DomBindingElement = HTMLElement | null;

export interface DomShellBindings {
  statusIndicator: HTMLElement | null;
  statusText: HTMLElement | null;
  statusMessage: HTMLElement | null;
}

export interface DomStreamingBindings {
  streamVideo: HTMLVideoElement | null;
  streamCanvas: HTMLCanvasElement | null;
  streamOverlay: HTMLElement | null;
  overlayMessage: HTMLElement | null;
  screenshotBtn: HTMLButtonElement | null;
  recordBtn: HTMLButtonElement | null;
  fullscreenBtn: HTMLElement | null;
  shaderBtn: HTMLElement | null;
  shaderControls: HTMLElement | null;
  shaderDropdown: HTMLElement | null;
  shaderOptions: HTMLElement | null;
  shaderUnavailableMessage: HTMLElement | null;
  streamToolbar: HTMLElement | null;
  cinematicToggle: HTMLElement | null;
  cinematicPillText: HTMLElement | null;
  brightnessSlider: HTMLInputElement | null;
  brightnessPercentage: HTMLElement | null;
  brightnessControl: HTMLElement | null;
  volumeSliderVertical: HTMLInputElement | null;
  volumePercentageVertical: HTMLElement | null;
  deviceName: HTMLElement | null;
  deviceStatusText: HTMLElement | null;
  currentResolution: HTMLElement | null;
  currentFPS: HTMLElement | null;
  fullscreenControls: HTMLElement | null;
  fsExitBtn: HTMLElement | null;
  streamContainer: HTMLElement | null;
  transcodeRing: HTMLElement | null;
  transcodePercentLabel: HTMLElement | null;
}

type DomSettingsControlBindings = Record<SettingsControlRef, HTMLElement | null>;

export interface DomSettingsBindings extends DomSettingsControlBindings {
  settingsBtn: HTMLElement | null;
  settingsMenuContainer: HTMLElement | null;
  disclaimerBtn: HTMLElement | null;
  disclaimerContent: HTMLElement | null;
  linkGithub: HTMLElement | null;
  linkWebsite: HTMLElement | null;
  linkX: HTMLElement | null;
  linkKofi: HTMLElement | null;
  linkModRetro: HTMLElement | null;
  footer: HTMLElement | null;
}

export interface DomUpdateBindings {
  updateSection: HTMLElement | null;
  updateCurrentVersion: HTMLElement | null;
  updateStatusIndicator: HTMLElement | null;
  updateStatusText: HTMLElement | null;
  updateProgressContainer: HTMLElement | null;
  updateProgressFill: HTMLElement | null;
  updateProgressText: HTMLElement | null;
  updateActionBtn: HTMLButtonElement | null;
  updateBadge: HTMLElement | null;
}

export interface DomNotesBindings {
  notesBtn: HTMLElement | null;
  notesPanel: HTMLElement | null;
  notesPanelContent: HTMLElement | null;
  notesListWrapper: HTMLElement | null;
  notesSearchInput: HTMLInputElement | null;
  notesGameFilter: HTMLElement | null;
  notesGameFilterLabel: HTMLElement | null;
  notesGameFilterMenu: HTMLElement | null;
  notesListToggle: HTMLElement | null;
  notesList: HTMLElement | null;
  notesEditor: HTMLElement | null;
  notesEmptyState: HTMLElement | null;
  notesGameAddBtn: HTMLElement | null;
  notesGameTagRow: HTMLElement | null;
  notesGameTag: HTMLElement | null;
  notesGameInput: HTMLInputElement | null;
  notesGameAutocomplete: HTMLElement | null;
  notesTitleInput: HTMLInputElement | null;
  notesContentArea: HTMLTextAreaElement | null;
  notesNewBtn: HTMLElement | null;
  notesDeleteBtn: HTMLButtonElement | null;
}

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

const shellRefs = [
  'statusIndicator',
  'statusText',
  'statusMessage'
] as const satisfies TemplateRefList<DomShellBindings>;

const streamingRefs = [
  'streamVideo',
  'streamCanvas',
  'streamOverlay',
  'overlayMessage',
  'screenshotBtn',
  'recordBtn',
  'fullscreenBtn',
  'shaderBtn',
  'shaderControls',
  'shaderDropdown',
  'shaderOptions',
  'shaderUnavailableMessage',
  'streamToolbar',
  'cinematicToggle',
  'cinematicPillText',
  'brightnessSlider',
  'brightnessPercentage',
  'brightnessControl',
  'volumeSliderVertical',
  'volumePercentageVertical',
  'deviceName',
  'deviceStatusText',
  'currentResolution',
  'currentFPS',
  'fullscreenControls',
  'fsExitBtn',
  'streamContainer',
  'transcodeRing',
  'transcodePercentLabel'
] as const satisfies TemplateRefList<DomStreamingBindings>;

const settingsRefs = [
  'settingsBtn',
  'settingsMenuContainer',
  ...getSettingsControlRefs(),
  'disclaimerBtn',
  'disclaimerContent',
  'linkGithub',
  'linkWebsite',
  'linkX',
  'linkKofi',
  'linkModRetro',
  'footer'
] as const satisfies TemplateRefList<DomSettingsBindings>;

const updateRefs = [
  'updateSection',
  'updateCurrentVersion',
  'updateStatusIndicator',
  'updateStatusText',
  'updateProgressContainer',
  'updateProgressFill',
  'updateProgressText',
  'updateActionBtn',
  'updateBadge'
] as const satisfies TemplateRefList<DomUpdateBindings>;

const notesRefs = [
  'notesBtn',
  'notesPanel',
  'notesPanelContent',
  'notesListWrapper',
  'notesSearchInput',
  'notesGameFilter',
  'notesGameFilterLabel',
  'notesGameFilterMenu',
  'notesListToggle',
  'notesList',
  'notesEditor',
  'notesEmptyState',
  'notesGameAddBtn',
  'notesGameTagRow',
  'notesGameTag',
  'notesGameInput',
  'notesGameAutocomplete',
  'notesTitleInput',
  'notesContentArea',
  'notesNewBtn',
  'notesDeleteBtn'
] as const satisfies TemplateRefList<DomNotesBindings>;

const settingsLegacyIds = {
  footer: 'statusFooter'
} as const satisfies TemplateRefLegacyIdMap<DomSettingsBindings>;

function createDomBindings(root: ParentNode = document): DomBindings {
  const shell = bindTemplateRefs<DomShellBindings>(root, shellRefs);
  const streaming = bindTemplateRefs<DomStreamingBindings>(root, streamingRefs);
  const settings = bindTemplateRefs<DomSettingsBindings>(root, settingsRefs, {
    legacyIds: settingsLegacyIds
  });
  const updates = bindTemplateRefs<DomUpdateBindings>(root, updateRefs);
  const notes = bindTemplateRefs<DomNotesBindings>(root, notesRefs);

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
