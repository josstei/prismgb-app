/**
 * DOM bindings
 *
 * Centralizes DOM element lookups and groups them by UI domain.
 *
 * Assumptions:
 * - All element IDs defined in DOMSelectors are expected to exist in the DOM
 * - If an element is not found, the binding will be null (no error thrown)
 * - Components should handle null elements gracefully if they are optional
 * - Required elements should be validated by the consuming component at initialization
 *
 * This design allows the template and bindings to evolve independently,
 * with components responsible for enforcing their own requirements.
 */

import { DOMSelectors } from '@renderer/presentation/config/dom-selectors.config.ts';

/**
 * Bind DOM elements by ID from a selector map
 * @param {Document|Element} root - Root element to query from
 * @param {Object<string, string>} selectors - Map of key names to element IDs
 * @returns {Object<string, Element|null>} Map of key names to DOM elements (or null if not found)
 */
const bindById = (root, selectors) => {
  const elements = {};
  Object.entries(selectors).forEach(([key, id]) => {
    elements[key] = root.getElementById(id);
  });
  return elements;
};

function createDomBindings(root = document) {
  const shell = bindById(root, {
    statusIndicator: DOMSelectors.STATUS_INDICATOR,
    statusText: DOMSelectors.STATUS_TEXT,
    statusMessage: DOMSelectors.STATUS_MESSAGE
  });

  const streaming = bindById(root, {
    streamVideo: DOMSelectors.STREAM_VIDEO,
    streamCanvas: DOMSelectors.STREAM_CANVAS,
    streamOverlay: DOMSelectors.STREAM_OVERLAY,
    overlayMessage: DOMSelectors.OVERLAY_MESSAGE,
    screenshotBtn: DOMSelectors.SCREENSHOT_BTN,
    recordBtn: DOMSelectors.RECORD_BTN,
    fullscreenBtn: DOMSelectors.FULLSCREEN_BTN,
    shaderBtn: DOMSelectors.SHADER_BTN,
    shaderControls: DOMSelectors.SHADER_CONTROLS,
    shaderDropdown: DOMSelectors.SHADER_DROPDOWN,
    shaderOptions: DOMSelectors.SHADER_OPTIONS,
    shaderUnavailableMessage: DOMSelectors.SHADER_UNAVAILABLE_MESSAGE,
    streamToolbar: DOMSelectors.STREAM_TOOLBAR,
    cinematicToggle: DOMSelectors.CINEMATIC_TOGGLE,
    cinematicPillText: DOMSelectors.CINEMATIC_PILL_TEXT,
    brightnessSlider: DOMSelectors.BRIGHTNESS_SLIDER,
    brightnessPercentage: DOMSelectors.BRIGHTNESS_PERCENTAGE,
    brightnessControl: DOMSelectors.BRIGHTNESS_CONTROL,
    volumeSliderVertical: DOMSelectors.VOLUME_SLIDER_VERTICAL,
    volumePercentageVertical: DOMSelectors.VOLUME_PERCENTAGE_VERTICAL,
    deviceName: DOMSelectors.DEVICE_NAME,
    deviceStatusText: DOMSelectors.DEVICE_STATUS_TEXT,
    currentResolution: DOMSelectors.CURRENT_RESOLUTION,
    currentFPS: DOMSelectors.CURRENT_FPS,
    fullscreenControls: DOMSelectors.FULLSCREEN_CONTROLS,
    fsExitBtn: DOMSelectors.FS_EXIT_BTN,
    streamContainer: DOMSelectors.STREAM_CONTAINER,
    transcodeRing: DOMSelectors.TRANSCODE_RING,
    transcodePercentLabel: DOMSelectors.TRANSCODE_PERCENT_LABEL
  });

  const settings = bindById(root, {
    settingsBtn: DOMSelectors.SETTINGS_BTN,
    settingsMenuContainer: DOMSelectors.SETTINGS_MENU_CONTAINER,
    settingStatusStrip: DOMSelectors.SETTING_STATUS_STRIP,
    settingFullscreenOnStartup: DOMSelectors.SETTING_FULLSCREEN_ON_STARTUP,
    settingAutoStreamOnConnect: DOMSelectors.SETTING_AUTO_STREAM_ON_CONNECT,
    settingMinimalistFullscreen: DOMSelectors.SETTING_MINIMALIST_FULLSCREEN,
    settingAnimationSaver: DOMSelectors.SETTING_ANIMATION_SAVER,
    settingRenderPreset: DOMSelectors.SETTING_RENDER_PRESET,
    settingRecordingFormat: DOMSelectors.SETTING_RECORDING_FORMAT,
    recordingFormatLabel: DOMSelectors.RECORDING_FORMAT_LABEL,
    recordingFormatMenu: DOMSelectors.RECORDING_FORMAT_MENU,
    disclaimerBtn: DOMSelectors.DISCLAIMER_BTN,
    disclaimerContent: DOMSelectors.DISCLAIMER_CONTENT,
    appVersion: DOMSelectors.APP_VERSION,
    linkGithub: DOMSelectors.LINK_GITHUB,
    linkWebsite: DOMSelectors.LINK_WEBSITE,
    linkX: DOMSelectors.LINK_X,
    linkKofi: DOMSelectors.LINK_KOFI,
    linkModRetro: DOMSelectors.LINK_MOD_RETRO
  });

  settings.footer = root.getElementById(DOMSelectors.STATUS_FOOTER);

  const updates = bindById(root, {
    updateSection: DOMSelectors.UPDATE_SECTION,
    updateCurrentVersion: DOMSelectors.UPDATE_CURRENT_VERSION,
    updateStatusIndicator: DOMSelectors.UPDATE_STATUS_INDICATOR,
    updateStatusText: DOMSelectors.UPDATE_STATUS_TEXT,
    updateProgressContainer: DOMSelectors.UPDATE_PROGRESS_CONTAINER,
    updateProgressFill: DOMSelectors.UPDATE_PROGRESS_FILL,
    updateProgressText: DOMSelectors.UPDATE_PROGRESS_TEXT,
    updateActionBtn: DOMSelectors.UPDATE_ACTION_BTN,
    updateBadge: DOMSelectors.UPDATE_BADGE
  });

  const notes = bindById(root, {
    notesBtn: DOMSelectors.NOTES_BTN,
    notesPanel: DOMSelectors.NOTES_PANEL,
    notesPanelContent: DOMSelectors.NOTES_PANEL_CONTENT,
    notesListWrapper: DOMSelectors.NOTES_LIST_WRAPPER,
    notesSearchInput: DOMSelectors.NOTES_SEARCH_INPUT,
    notesGameFilter: DOMSelectors.NOTES_GAME_FILTER,
    notesGameFilterLabel: DOMSelectors.NOTES_GAME_FILTER_LABEL,
    notesGameFilterMenu: DOMSelectors.NOTES_GAME_FILTER_MENU,
    notesListToggle: DOMSelectors.NOTES_LIST_TOGGLE,
    notesList: DOMSelectors.NOTES_LIST,
    notesEditor: DOMSelectors.NOTES_EDITOR,
    notesEmptyState: DOMSelectors.NOTES_EMPTY_STATE,
    notesGameAddBtn: DOMSelectors.NOTES_GAME_ADD_BTN,
    notesGameTagRow: DOMSelectors.NOTES_GAME_TAG_ROW,
    notesGameTag: DOMSelectors.NOTES_GAME_TAG,
    notesGameInput: DOMSelectors.NOTES_GAME_INPUT,
    notesGameAutocomplete: DOMSelectors.NOTES_GAME_AUTOCOMPLETE,
    notesTitleInput: DOMSelectors.NOTES_TITLE_INPUT,
    notesContentArea: DOMSelectors.NOTES_CONTENT_AREA,
    notesNewBtn: DOMSelectors.NOTES_NEW_BTN,
    notesDeleteBtn: DOMSelectors.NOTES_DELETE_BTN
  });

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
