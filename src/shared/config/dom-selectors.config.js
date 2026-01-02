/**
 * DOM Element Selectors
 *
 * Centralized constants for all DOM element IDs used in the renderer.
 * Prevents typos and enables IDE autocomplete.
 */

export const DOMSelectors = {
  // Status indicators
  STATUS_INDICATOR: 'statusIndicator',
  STATUS_TEXT: 'statusText',
  STATUS_MESSAGE: 'statusMessage',

  // Stream display
  STREAM_VIDEO: 'streamVideo',
  STREAM_CANVAS: 'streamCanvas',
  STREAM_OVERLAY: 'streamOverlay',
  OVERLAY_MESSAGE: 'overlayMessage',

  // Control buttons
  SETTINGS_BTN: 'settingsBtn',
  SCREENSHOT_BTN: 'screenshotBtn',
  RECORD_BTN: 'recordBtn',
  FULLSCREEN_BTN: 'fullscreenBtn',
  SHADER_BTN: 'shaderBtn',

  // Shader selector
  SHADER_CONTROLS: 'shaderControls',
  SHADER_DROPDOWN: 'shaderDropdown',
  BRIGHTNESS_SLIDER: 'brightnessSlider',
  BRIGHTNESS_PERCENTAGE: 'brightnessPercentage',
  VOLUME_SLIDER_VERTICAL: 'volumeSliderVertical',
  VOLUME_PERCENTAGE_VERTICAL: 'volumePercentageVertical',

  // Toolbar
  STREAM_TOOLBAR: 'streamToolbar',
  CINEMATIC_TOGGLE: 'cinematicToggle',

  // Device info
  DEVICE_NAME: 'deviceName',
  DEVICE_STATUS_TEXT: 'deviceStatusText',
  CURRENT_RESOLUTION: 'currentResolution',
  CURRENT_FPS: 'currentFPS',

  // Settings menu
  SETTINGS_MENU_CONTAINER: 'settingsMenuContainer',
  SETTING_STATUS_STRIP: 'settingStatusStrip',
  SETTING_ANIMATION_SAVER: 'settingAnimationSaver',
  SETTING_RENDER_PRESET: 'settingRenderPreset',
  SETTING_FULLSCREEN_ON_STARTUP: 'settingFullscreenOnStartup',
  DISCLAIMER_BTN: 'disclaimerBtn',
  DISCLAIMER_CONTENT: 'disclaimerContent',

  // Footer links
  APP_VERSION: 'appVersion',
  LINK_GITHUB: 'linkGithub',
  LINK_WEBSITE: 'linkWebsite',
  LINK_MOD_RETRO: 'linkModRetro',

  // Fullscreen controls
  FULLSCREEN_CONTROLS: 'fullscreenControls',
  FS_EXIT_BTN: 'fsExitBtn',

  // Stream container (for animation class)
  STREAM_CONTAINER: 'streamContainer',

  // Update section
  UPDATE_SECTION: 'updateSection',
  UPDATE_CURRENT_VERSION: 'updateCurrentVersion',
  UPDATE_STATUS_INDICATOR: 'updateStatusIndicator',
  UPDATE_STATUS_TEXT: 'updateStatusText',
  UPDATE_PROGRESS_CONTAINER: 'updateProgressContainer',
  UPDATE_PROGRESS_FILL: 'updateProgressFill',
  UPDATE_PROGRESS_TEXT: 'updateProgressText',
  UPDATE_ACTION_BTN: 'updateActionBtn',
  UPDATE_BADGE: 'updateBadge',

  // Notes panel
  NOTES_BTN: 'notesBtn',
  NOTES_PANEL: 'notesPanel',
  NOTES_SEARCH_INPUT: 'notesSearchInput',
  NOTES_LIST: 'notesList',
  NOTES_EDITOR: 'notesEditor',
  NOTES_EMPTY_STATE: 'notesEmptyState',
  NOTES_TITLE_INPUT: 'notesTitleInput',
  NOTES_CONTENT_AREA: 'notesContentArea',
  NOTES_NEW_BTN: 'notesNewBtn',
  NOTES_DELETE_BTN: 'notesDeleteBtn',
  NOTES_CLOSE_BTN: 'notesCloseBtn'
};
