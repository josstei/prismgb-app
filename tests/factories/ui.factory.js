import { vi } from 'vitest';
import { createDeviceStatusComponentMock } from './device.factory.js';

/**
 * Use the test document for DOM behavior; spies observe calls without replacing
 * selector matching, event dispatch, attributes, focus, or node ownership.
 * @template {keyof HTMLElementTagNameMap} T
 * @param {T} tagName
 * @returns {import('vitest').MockedObjectDeep<HTMLElementTagNameMap[T]>}
 */
export function createMockElement(tagName = 'div', { attributes = {}, ...properties } = {}) {
  const element = document.createElement(tagName);
  Object.assign(element, properties);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, String(value));
  for (const method of ['add', 'remove', 'toggle']) vi.spyOn(element.classList, method);
  for (const method of ['addEventListener', 'removeEventListener', 'getBoundingClientRect', 'setAttribute', 'removeAttribute', 'focus']) {
    vi.spyOn(element, method);
  }
  vi.spyOn(element.style, 'setProperty');
  return vi.mocked(element, { deep: true });
}

function createMockButton(options = {}) {
  return createMockElement('button', options);
}

function createMockInput(options = {}) {
  return createMockElement('input', { type: 'text', value: '', ...options });
}

export function createDeviceStatusElementsMock(overrides = {}) {
  const elements = {
    statusIndicator: createMockElement('div', { className: 'status-indicator' }),
    statusText: createMockElement('span', { className: 'status-text' }),
    deviceStatusText: createMockElement('span', { className: 'device-status-text' }),
    deviceName: createMockElement('span', { className: 'device-name' }),
    overlayMessage: createMockElement('div', { className: 'overlay-message' }),
    streamOverlay: createMockElement('div', { className: 'stream-overlay' }),
  };

  return {
    ...elements,
    ...overrides,
  };
}

export function createTranscodeToastElementsMock(overrides = {}) {
  const recordBtn = createMockButton({ className: 'record-btn' });
  const transcodeRing = createMockElement('div', { className: 'transcode-ring' });
  const transcodePercentLabel = createMockElement('span', { className: 'transcode-percent' });

  return {
    recordBtn,
    transcodeRing,
    transcodePercentLabel,
    ...overrides,
  };
}

export function createShaderSelectorElementsMock(overrides = {}) {
  const elements = {
    shaderBtn: createMockButton({ className: 'shader-btn' }),
    shaderDropdown: createMockElement('div', { className: 'shader-dropdown' }),
    shaderOptions: createMockElement('div', { className: 'shader-options' }),
    shaderUnavailableMessage: createMockElement('div', { className: 'shader-unavailable-message' }),
    cinematicToggle: createMockInput({ type: 'checkbox' }),
    cinematicPillText: createMockElement('span', { className: 'cinematic-pill-text' }),
    brightnessSlider: createMockInput({ type: 'range' }),
    brightnessPercentage: createMockElement('span', { className: 'brightness-percentage' }),
    brightnessControl: createMockElement('div', { className: 'brightness-control' }),
    volumeSlider: createMockInput({ type: 'range' }),
    volumePercentage: createMockElement('span', { className: 'volume-percentage' }),
    streamVideo: createMockElement('video', { className: 'stream-video' }),
  };

  return {
    ...elements,
    ...overrides,
  };
}

export function createSettingsMenuElementsMock(overrides = {}) {
  const elements = {
    settingsMenuContainer: createMockElement('div', { className: 'settings-menu-container' }),
    settingsBtn: createMockButton({ className: 'settings-btn' }),
    settingStatusStrip: createMockInput({ type: 'checkbox' }),
    settingAnimationSaver: createMockInput({ type: 'checkbox' }),
    settingLaunchOnLogin: createMockInput({ type: 'checkbox' }),
    disclaimerBtn: createMockButton({ className: 'disclaimer-btn' }),
    disclaimerContent: createMockElement('div', { className: 'disclaimer-content' }),
    footer: createMockElement('footer', { className: 'footer' }),
  };

  return {
    ...elements,
    ...overrides,
  };
}

/**
 * Creates notes fixture elements without interaction spies.
 */
function createDocumentElement(tagName, { className = '', type } = {}) {
  const element = globalThis.document.createElement(tagName);
  if (className) element.className = className;
  if (type) element.type = type;
  return element;
}

/**
 * Creates the notes panel element set as real document elements. The notes panel layout reads
 * `window.getComputedStyle` on the panel element during initialization.
 */
export function createNotesPanelElementsMock(overrides = {}) {
  const elements = {
    notesBtn: createDocumentElement('button', { className: 'notes-btn' }),
    notesPanel: createDocumentElement('div', { className: 'notes-panel' }),
    notesPanelContent: createDocumentElement('div', { className: 'notes-panel-content' }),
    notesListWrapper: createDocumentElement('div', { className: 'notes-list-wrapper' }),
    notesSearchInput: createDocumentElement('input', { type: 'text' }),
    notesGameFilter: createDocumentElement('button', { className: 'notes-game-filter' }),
    notesGameFilterLabel: createDocumentElement('span', { className: 'notes-game-filter-label' }),
    notesGameFilterMenu: createDocumentElement('div', { className: 'notes-game-filter-menu' }),
    notesListToggle: createDocumentElement('button', { className: 'notes-list-toggle' }),
    notesList: createDocumentElement('div', { className: 'notes-list' }),
    notesEditor: createDocumentElement('div', { className: 'notes-editor' }),
    notesGameAddBtn: createDocumentElement('button', { className: 'notes-game-add-btn' }),
    notesGameTagRow: createDocumentElement('div', { className: 'notes-game-tag-row' }),
    notesGameTag: createDocumentElement('button', { className: 'notes-game-tag' }),
    notesGameInput: createDocumentElement('input', { type: 'text' }),
    notesGameAutocomplete: createDocumentElement('div', { className: 'notes-game-autocomplete' }),
    notesTitleInput: createDocumentElement('input', { type: 'text' }),
    notesContentArea: createDocumentElement('textarea', { className: 'notes-content-area' }),
    notesNewBtn: createDocumentElement('button', { className: 'notes-new-btn' }),
    notesDeleteBtn: createDocumentElement('button', { className: 'notes-delete-btn' }),
    streamContainer: createDocumentElement('div', { className: 'stream-container' }),
    streamToolbar: createDocumentElement('div', { className: 'stream-toolbar' }),
  };

  return {
    ...elements,
    ...overrides,
  };
}

export function createUISetupControllerMock(overrides = {}) {
  const {
    on,
    elements = {},
    dom = {},
    streamOverlay,
    streamVideo,
    streamCanvas,
    shaderBtn,
    shaderDropdown,
    shaderOptions,
    shaderUnavailableMessage,
    cinematicToggle,
    cinematicPillText,
    streamToolbar,
    brightnessSlider,
    brightnessPercentage,
    brightnessControl,
    volumeSliderVertical,
    volumePercentageVertical,
    streamContainer,
    notesBtn,
    initSettingsMenu,
    initShaderSelector,
    initNotesPanel,
    toggleSettingsMenu,
    toggleShaderSelector,
    ...componentOverrides
  } = overrides;

  const resolvedElements = {
    streamOverlay: streamOverlay ?? createMockElement('div'),
    streamVideo: streamVideo ?? createMockElement('video'),
    streamCanvas: streamCanvas ?? createMockElement('canvas'),
    shaderBtn: shaderBtn ?? createMockElement('button'),
    shaderDropdown: shaderDropdown ?? createMockElement('select'),
    streamToolbar: streamToolbar ?? createMockElement('div'),
    ...elements
  };

  const resolvedDom = {
    streaming: {
      shaderBtn: resolvedElements.shaderBtn,
      shaderDropdown: shaderDropdown ?? resolvedElements.shaderDropdown,
      shaderOptions: shaderOptions ?? createMockElement('div'),
      shaderUnavailableMessage: shaderUnavailableMessage ?? createMockElement('div'),
      cinematicToggle: cinematicToggle ?? createMockElement('input'),
      cinematicPillText: cinematicPillText ?? createMockElement('span'),
      streamToolbar: resolvedElements.streamToolbar,
      brightnessSlider: brightnessSlider ?? createMockElement('input'),
      brightnessPercentage: brightnessPercentage ?? createMockElement('span'),
      brightnessControl: brightnessControl ?? createMockElement('div'),
      volumeSliderVertical: volumeSliderVertical ?? createMockElement('input'),
      volumePercentageVertical: volumePercentageVertical ?? createMockElement('span'),
      streamVideo: resolvedElements.streamVideo,
      streamContainer: streamContainer ?? createMockElement('div'),
      ...dom.streaming
    },
    notes: {
      notesBtn: notesBtn ?? createMockElement('button'),
      ...dom.notes
    },
    ...dom
  };

  return {
    on: on ?? vi.fn(),
    elements: {
      ...resolvedElements,
      ...elements
    },
    dom: resolvedDom,
    initSettingsMenu: initSettingsMenu ?? vi.fn(),
    initShaderSelector: initShaderSelector ?? vi.fn(),
    initNotesPanel: initNotesPanel ?? vi.fn(),
    toggleSettingsMenu: toggleSettingsMenu ?? vi.fn(),
    toggleShaderSelector: toggleShaderSelector ?? vi.fn(),
    ...componentOverrides
  };
}

export function createUIEventBridgeControllerMock(overrides = {}) {
  return {
    setStreamingMode: vi.fn(),
    updateFullscreenButton: vi.fn(),
    enableControlsAutoHide: vi.fn(),
    disableControlsAutoHide: vi.fn(),
    triggerShutterFlash: vi.fn(),
    triggerRecordButtonPop: vi.fn(),
    triggerRecordButtonPress: vi.fn(),
    triggerButtonFeedback: vi.fn(),
    updateRecordingButtonState: vi.fn(),
    setRecordButtonDisabled: vi.fn(),
    ...overrides
  };
}

export function createStatusNotificationComponentMock(overrides = {}) {
  return {
    show: vi.fn(),
    ...overrides
  };
}

export function createStreamControlsComponentMock(overrides = {}) {
  return {
    setCinematicMode: vi.fn(),
    setStreamingMode: vi.fn(),
    updateStreamInfo: vi.fn(),
    ...overrides
  };
}

export function createSettingsMenuComponentMock(overrides = {}) {
  return {
    toggle: vi.fn(),
    initialize: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  };
}

export function createShaderSelectorComponentMock(overrides = {}) {
  return {
    hide: vi.fn(),
    ...overrides
  };
}

export function createUiComponentHostMock(overrides = {}) {
  const {
    statusNotificationComponent = createStatusNotificationComponentMock(),
    deviceStatusComponent = createDeviceStatusComponentMock(),
    streamControlsComponent = createStreamControlsComponentMock(),
    settingsMenuComponent = createSettingsMenuComponentMock(),
    shaderSelectorComponent = createShaderSelectorComponentMock(),
    touchCore = vi.fn(),
    touchDeferred = vi.fn(),
    dispose = vi.fn(),
    get,
    components = {},
    ...hostOverrides
  } = overrides;

  const componentMap = {
    statusNotificationComponent,
    deviceStatusComponent,
    streamControlsComponent,
    settingsMenuComponent,
    shaderSelectorComponent,
    ...components
  };

  const getWithDefaults = get ?? vi.fn((id) => componentMap[id] || null);
  const host = {
    get: getWithDefaults,
    touchCore,
    touchDeferred,
    dispose,
    _components: componentMap,
    _setComponent: (id, component) => {
      componentMap[id] = component;
    },
    ...hostOverrides
  };

  return host;
}

export function createUIEffectsMock(overrides = {}) {
  return {
    setElements: vi.fn(),
    triggerShutterFlash: vi.fn(),
    triggerRecordButtonPop: vi.fn(),
    triggerRecordButtonPress: vi.fn(),
    triggerButtonFeedback: vi.fn(),
    enableCursorAutoHide: vi.fn(),
    disableCursorAutoHide: vi.fn(),
    enableToolbarAutoHide: vi.fn(),
    disableToolbarAutoHide: vi.fn(),
    setRecordingButtonState: vi.fn(),
    setCinematicMode: vi.fn(),
    setStreamingMode: vi.fn(),
    setMinimalistFullscreen: vi.fn(),
    setFullscreenMode: vi.fn(),
    enableControlsAutoHide: vi.fn(),
    disableControlsAutoHide: vi.fn(),
    dispose: vi.fn(),
    ...overrides
  };
}

export function createUIBodyClassManagerMock(overrides = {}) {
  return {
    setStreamingMode: vi.fn(),
    setCinematicMode: vi.fn(),
    setMinimalistFullscreen: vi.fn(),
    setFullscreenMode: vi.fn(),
    areAnimationsOff: vi.fn(),
    ...overrides
  };
}


export function createUIEffectsElementsMock(overrides = {}) {
  const recordBtn = createMockElement('button', { className: 'record-btn' });
  Object.defineProperty(recordBtn, 'offsetWidth', { value: 100 });

  const flashElement = createMockElement('div', { className: '' });
  document.createElement('div').appendChild(flashElement);
  flashElement.addEventListener = vi.fn();
  flashElement.remove = vi.fn();

  return {
    recordBtn,
    flashElement,
    ...overrides
  };
}

export function createStreamingControlsElementsMock(overrides = {}) {
  const streamOverlay = createMockElement('div', { className: 'stream-overlay' });
  const screenshotBtn = createMockButton({ className: 'screenshot-btn' });
  screenshotBtn.disabled = true;
  const recordBtn = createMockButton({ className: 'record-btn' });
  recordBtn.disabled = true;
  const shaderControls = createMockElement('div', { className: 'shader-controls' });
  const currentResolution = createMockElement('span', { className: 'current-resolution' });
  const currentFPS = createMockElement('span', { className: 'current-fps' });

  return {
    streamOverlay,
    screenshotBtn,
    recordBtn,
    shaderControls,
    currentResolution,
    currentFPS,
    ...overrides,
  };
}

export function createUIControllerElementsMock(overrides = {}) {
  const statusIndicator = createMockElement('div', { className: 'status-indicator' });
  const statusText = createMockElement('span', { className: 'status-text' });
  const statusMessage = createMockElement('span', { className: 'status-message' });
  const streamVideo = createMockElement('video', { className: 'stream-video' });
  streamVideo.volume = 1;
  const streamCanvas = createMockElement('canvas', { className: 'stream-canvas' });
  const streamOverlay = createMockElement('div', { className: 'stream-overlay' });
  const overlayMessage = createMockElement('div', { className: 'overlay-message' });
  const screenshotBtn = createMockButton({ className: 'screenshot-btn' });
  screenshotBtn.disabled = false;
  const recordBtn = createMockButton({ className: 'record-btn' });
  recordBtn.disabled = false;
  const fullscreenBtn = createMockButton({ className: 'fullscreen-btn' });
  const settingsBtn = createMockButton({ className: 'settings-btn' });

  return {
    statusIndicator,
    statusText,
    statusMessage,
    streamVideo,
    streamCanvas,
    streamOverlay,
    overlayMessage,
    screenshotBtn,
    recordBtn,
    fullscreenBtn,
    settingsBtn,
    deviceName: createMockElement('span', { className: 'device-name' }),
    deviceStatusText: createMockElement('span', { className: 'device-status-text' }),
    currentResolution: createMockElement('span', { className: 'current-resolution' }),
    currentFPS: createMockElement('span', { className: 'current-fps' }),
    streamToolbar: createMockElement('div', { className: 'stream-toolbar' }),
    fullscreenControls: createMockElement('div', { className: 'fullscreen-controls' }),
    ...overrides
  };
}
