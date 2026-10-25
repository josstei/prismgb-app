import { SettingsControlRefs } from '@renderer/lib/settings.definitions.js';
import type { RendererUiComponentInstanceMap } from '@renderer/presentation/controller/ui-component.host.js';
import type { DomBindings } from '@renderer/presentation/primitives/dom-bindings.utils.js';
import type { SettingsMenuElements } from '@renderer/presentation/features/settings/settings-menu.component.js';
import type { ShaderSelectorElements } from '@renderer/presentation/features/toolbar/shader-selector.component.js';
import type { NotesPanelElements } from '@renderer/presentation/features/notes/notes-panel.component.js';
import type { StreamingControlsElements } from '@renderer/presentation/features/streaming/streaming-controls.component.js';
import type { StatusNotificationElements } from '@renderer/presentation/shared/status-notification.component.js';
import type { DeviceStatusElements } from '@renderer/presentation/shared/device-status.component.js';
import type { TranscodeToastElements } from '@renderer/presentation/features/transcode/transcode-toast.component.js';

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

export interface RendererTemplateComponentElementSlices {
  statusNotificationComponent: StatusNotificationElements;
  deviceStatusComponent: DeviceStatusElements;
  streamControlsComponent: StreamingControlsElements;
  transcodeToastComponent: TranscodeToastElements;
  settingsMenuComponent: SettingsMenuElements;
  shaderSelectorComponent: ShaderSelectorElements;
  notesPanelComponent: NotesPanelElements;
}

export type RendererTemplateComponentId = keyof RendererUiComponentInstanceMap;
export const RendererTemplateCoreComponentIds = ['statusNotificationComponent', 'deviceStatusComponent', 'streamControlsComponent', 'transcodeToastComponent'] as const satisfies readonly RendererTemplateComponentId[];
export const RendererTemplateDeferredComponentIds = ['settingsMenuComponent', 'shaderSelectorComponent', 'notesPanelComponent'] as const satisfies readonly RendererTemplateComponentId[];
export type RendererTemplateDeferredComponentId = (typeof RendererTemplateDeferredComponentIds)[number];

type TemplateComponentElementFactory<TId extends RendererTemplateComponentId> = (dom: DomBindings | undefined) => RendererTemplateComponentElementSlices[TId];
const TemplateComponentElementFactories = {
  statusNotificationComponent: (dom) => ({
    statusMessage: dom?.shell.statusMessage
  }), deviceStatusComponent: (dom) => ({
    statusIndicator: dom?.shell.statusIndicator, statusText: dom?.shell.statusText, deviceName: dom?.streaming.deviceName, deviceStatusText: dom?.streaming.deviceStatusText, streamOverlay: dom?.streaming.streamOverlay, overlayMessage: dom?.streaming.overlayMessage
  }), streamControlsComponent: (dom) => ({
    currentResolution: dom?.streaming.currentResolution, currentFPS: dom?.streaming.currentFPS, screenshotBtn: dom?.streaming.screenshotBtn, recordBtn: dom?.streaming.recordBtn, shaderControls: dom?.streaming.shaderControls, streamOverlay: dom?.streaming.streamOverlay
  }), transcodeToastComponent: (dom) => ({
    recordBtn: dom?.streaming.recordBtn, transcodeRing: dom?.streaming.transcodeRing, transcodePercentLabel: dom?.streaming.transcodePercentLabel
  }), settingsMenuComponent: (dom) => ({
    ...dom?.settings, ...dom?.updates
  }), shaderSelectorComponent: (dom) => ({
    shaderBtn: dom?.streaming.shaderBtn, shaderDropdown: dom?.streaming.shaderDropdown, shaderOptions: dom?.streaming.shaderOptions, shaderUnavailableMessage: dom?.streaming.shaderUnavailableMessage, cinematicToggle: dom?.streaming.cinematicToggle, cinematicPillText: dom?.streaming.cinematicPillText, brightnessSlider: dom?.streaming.brightnessSlider, brightnessPercentage: dom?.streaming.brightnessPercentage, brightnessControl: dom?.streaming.brightnessControl, volumeSlider: dom?.streaming.volumeSliderVertical, volumePercentage: dom?.streaming.volumePercentageVertical, streamVideo: dom?.streaming.streamVideo
  }), notesPanelComponent: (dom) => ({
    ...dom?.notes, streamContainer: dom?.streaming.streamContainer, streamToolbar: dom?.streaming.streamToolbar
  })
} as const satisfies {
  [TId in RendererTemplateComponentId]: TemplateComponentElementFactory<TId>;
};

export function createTemplateComponentElements<TId extends RendererTemplateComponentId>(
  id: TId,
  dom: DomBindings | undefined
): RendererTemplateComponentElementSlices[TId] {
  return TemplateComponentElementFactories[id](dom);
}
