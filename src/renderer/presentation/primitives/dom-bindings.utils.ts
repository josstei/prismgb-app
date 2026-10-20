const DOM_REF_GROUPS = {
  shell: ['statusIndicator', 'statusText', 'statusMessage'],
  streaming: ['streamVideo', 'streamCanvas', 'streamOverlay', 'overlayMessage', 'screenshotBtn', 'recordBtn', 'fullscreenBtn', 'shaderBtn', 'shaderControls', 'shaderDropdown', 'shaderOptions', 'shaderUnavailableMessage', 'streamToolbar', 'cinematicToggle', 'cinematicPillText', 'brightnessSlider', 'brightnessPercentage', 'brightnessControl', 'volumeSliderVertical', 'volumePercentageVertical', 'deviceName', 'deviceStatusText', 'currentResolution', 'currentFPS', 'fullscreenControls', 'streamContainer', 'transcodeRing', 'transcodePercentLabel'],
  settings: ['settingsBtn', 'settingsMenuContainer', 'settingLaunchOnLogin', 'settingStatusStrip', 'settingFullscreenOnStartup', 'settingAutoStreamOnConnect', 'settingMinimalistFullscreen', 'settingAnimationSaver', 'settingRecordingFormat', 'recordingFormatLabel', 'recordingFormatMenu', 'disclaimerBtn', 'disclaimerContent', 'footer'],
  updates: ['updateSection', 'updateCurrentVersion', 'updateStatusIndicator', 'updateStatusText', 'updateProgressContainer', 'updateProgressFill', 'updateProgressText', 'updateActionBtn', 'updateBadge'],
  notes: ['notesBtn', 'notesPanel', 'notesPanelContent', 'notesListWrapper', 'notesSearchInput', 'notesGameFilter', 'notesGameFilterLabel', 'notesGameFilterMenu', 'notesListToggle', 'notesList', 'notesEditor', 'notesGameAddBtn', 'notesGameTagRow', 'notesGameTag', 'notesGameInput', 'notesGameAutocomplete', 'notesTitleInput', 'notesContentArea', 'notesNewBtn', 'notesDeleteBtn']
} as const;

type DomRefGroups = typeof DOM_REF_GROUPS;

type DomGroupBindings<
  TGroup extends keyof DomRefGroups,
  TElementTypes extends Partial<Record<DomRefGroups[TGroup][number], HTMLElement>> = Record<never, never>
> = {
  [TRef in DomRefGroups[TGroup][number]]: TRef extends keyof TElementTypes ? TElementTypes[TRef] | null : HTMLElement | null;
};

export type DomStreamingBindings = DomGroupBindings<'streaming', {
  streamVideo: HTMLVideoElement;
  streamCanvas: HTMLCanvasElement;
  screenshotBtn: HTMLButtonElement;
  recordBtn: HTMLButtonElement;
  brightnessSlider: HTMLInputElement;
  volumeSliderVertical: HTMLInputElement;
}>;

export interface DomBindings {
  shell: DomGroupBindings<'shell'>;
  streaming: DomStreamingBindings;
  settings: DomGroupBindings<'settings'>;
  updates: DomGroupBindings<'updates', { updateActionBtn: HTMLButtonElement }>;
  notes: DomGroupBindings<'notes', {
    notesSearchInput: HTMLInputElement;
    notesGameInput: HTMLInputElement;
    notesTitleInput: HTMLInputElement;
    notesContentArea: HTMLTextAreaElement;
    notesDeleteBtn: HTMLButtonElement;
  }>;
}

function pickRefs<TBindings>(root: ParentNode, refs: readonly string[]): TBindings {
  return Object.fromEntries(
    refs.map((ref) => [ref, root.querySelector<HTMLElement>(`[data-ref="${ref}"]`)])
  ) as TBindings;
}

export function createDomBindings(root: ParentNode = document): DomBindings {
  return {
    shell: pickRefs(root, DOM_REF_GROUPS.shell),
    streaming: pickRefs(root, DOM_REF_GROUPS.streaming),
    settings: pickRefs(root, DOM_REF_GROUPS.settings),
    updates: pickRefs(root, DOM_REF_GROUPS.updates),
    notes: pickRefs(root, DOM_REF_GROUPS.notes)
  };
}
