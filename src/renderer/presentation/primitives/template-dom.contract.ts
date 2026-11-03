import { SettingsControlRefs } from '@renderer/lib/settings.definitions.js';

export const TemplateDomRefGroups = {
  shell: ['statusIndicator', 'statusText', 'statusMessage'], streaming: [
    'streamVideo', 'streamCanvas', 'streamOverlay', 'overlayMessage', 'screenshotBtn', 'recordBtn', 'fullscreenBtn', 'shaderBtn', 'shaderControls', 'shaderDropdown', 'shaderOptions', 'shaderUnavailableMessage', 'streamToolbar', 'cinematicToggle', 'cinematicPillText', 'brightnessSlider', 'brightnessPercentage', 'brightnessControl', 'volumeSliderVertical', 'volumePercentageVertical', 'deviceName', 'deviceStatusText', 'currentResolution', 'currentFPS', 'fullscreenControls', 'fsExitBtn', 'streamContainer', 'transcodeRing', 'transcodePercentLabel'
  ], settings: [
    'settingsBtn', 'settingsMenuContainer', ...SettingsControlRefs, 'disclaimerBtn', 'disclaimerContent', 'linkGithub', 'linkWebsite', 'linkX', 'linkKofi', 'linkModRetro', 'footer'
  ], updates: [
    'updateSection', 'updateCurrentVersion', 'updateStatusIndicator', 'updateStatusText', 'updateProgressContainer', 'updateProgressFill', 'updateProgressText', 'updateActionBtn', 'updateBadge'
  ], notes: [
    'notesBtn', 'notesPanel', 'notesPanelContent', 'notesListWrapper', 'notesSearchInput', 'notesGameFilter', 'notesGameFilterLabel', 'notesGameFilterMenu', 'notesListToggle', 'notesList', 'notesEditor', 'notesGameAddBtn', 'notesGameTagRow', 'notesGameTag', 'notesGameInput', 'notesGameAutocomplete', 'notesTitleInput', 'notesContentArea', 'notesNewBtn', 'notesDeleteBtn'
  ]
} as const;

export type TemplateDomShellRef = (typeof TemplateDomRefGroups.shell)[number];
export type TemplateDomStreamingRef = (typeof TemplateDomRefGroups.streaming)[number];
export type TemplateDomSettingsRef = (typeof TemplateDomRefGroups.settings)[number];
export type TemplateDomUpdatesRef = (typeof TemplateDomRefGroups.updates)[number];
export type TemplateDomNotesRef = (typeof TemplateDomRefGroups.notes)[number];
