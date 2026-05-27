/**
 * UI Factory
 *
 * Creates mock UI components and controllers for testing.
 * Includes UIController, DOM elements, and UI effects mocks.
 */

import { vi } from "vitest";
import { createMockCanvas, createMockVideo } from "./stream.factory.js";

// Helper to check if a mock element matches a basic CSS selector
function matchesSelector(el, sel) {
  if (!el || !sel) return false;
  let isMatch = true;

  // 1. Attribute selectors like [data-value="val"] or [data-value]
  const attrRegex = /\[([a-zA-Z0-9_-]+)(?:=([\"']?)(.*?)\2)?\]/g;
  let attrMatch;
  let cleanSel = sel;
  while ((attrMatch = attrRegex.exec(sel)) !== null) {
    const name = attrMatch[1];
    const val = attrMatch[3];
    cleanSel = cleanSel.replace(attrMatch[0], "");
    if (val !== undefined) {
      if (el.getAttribute(name) !== val && el.dataset?.[name.replace(/^data-/, "")] !== val) {
        isMatch = false;
      }
    } else {
      if (!el.hasAttribute(name)) {
        isMatch = false;
      }
    }
  }

  // 2. Class and Tag name selectors
  const parts = cleanSel.split(/(?=\.)/);
  for (const part of parts) {
    if (!part) continue;
    if (part.startsWith(".")) {
      const cls = part.slice(1);
      if (!el.classList?.contains(cls)) {
        isMatch = false;
      }
    } else {
      if (el.tagName && el.tagName.toLowerCase() !== part.toLowerCase()) {
        isMatch = false;
      }
    }
  }

  return isMatch;
}

// Helper to query all elements matching a selector inside a parent
function queryAllMockElements(el, sel) {
  const result = [];
  function search(node) {
    if (matchesSelector(node, sel)) {
      result.push(node);
    }
    const children = node.children || node.childNodes || [];
    for (const child of children) {
      search(child);
    }
  }

  const children = el.children || el.childNodes || [];
  for (const child of children) {
    search(child);
  }
  return result;
}

/**
 * Creates a mock DOM element with common properties
 * @param {string} tagName - Element tag name
 * @param {Object} options - Element options
 * @returns {Object} Mock element
 */
export function createMockElement(tagName = "div", options = {}) {
  const {
    id = "",
    className = "",
    textContent = "",
    innerHTML = "",
    attributes = {},
  } = options;

  const classList = new Set(className.split(" ").filter(Boolean));
  const eventBuckets = {};
  const eventListeners = new Map();
  const attrs = new Map(Object.entries(attributes));
  
  const style = {
    setProperty: vi.fn((name, value) => {
      style[name] = value;
    }),
    removeProperty: vi.fn((name) => {
      delete style[name];
    }),
  };

  const children = [];
  let hidden = false;
  let customInnerHTML = innerHTML;

  const element = {
    tagName: tagName.toUpperCase(),
    id,
    get className() { return Array.from(classList).join(" "); },
    set className(v) {
      classList.clear();
      v.split(" ").filter(Boolean).forEach(c => classList.add(c));
    },
    textContent,
    get innerHTML() { return customInnerHTML; },
    set innerHTML(v) {
      customInnerHTML = v;
      children.forEach(c => {
        Object.defineProperty(c, 'parentNode', { value: null, configurable: true, writable: true });
      });
      children.length = 0;

      if (v !== "" && typeof document !== 'undefined') {
        const temp = document.createElement('div');
        temp.innerHTML = v;
        const tempChildren = Array.from(temp.children);
        tempChildren.forEach(child => {
          element.appendChild(child);
        });
      }
    },
    get hidden() { return hidden; },
    set hidden(v) { hidden = v; },
    style,

    // Children hierarchy
    children,
    get childNodes() { return children; },
    get firstChild() { return children[0] || null; },
    get lastChild() { return children[children.length - 1] || null; },

    classList: {
      add: vi.fn((...classes) => classes.forEach(c => classList.add(c))),
      remove: vi.fn((...classes) => classes.forEach(c => classList.delete(c))),
      toggle: vi.fn((c, force) => {
        const has = classList.has(c);
        const shouldHave = force !== undefined ? Boolean(force) : !has;
        if (shouldHave) {
          classList.add(c);
          return true;
        } else {
          classList.delete(c);
          return false;
        }
      }),
      contains: vi.fn((c) => classList.has(c)),
      replace: vi.fn((oldC, newC) => {
        if (classList.has(oldC)) {
          classList.delete(oldC);
          classList.add(newC);
          return true;
        }
        return false;
      }),
    },

    getAttribute: vi.fn((name) => attrs.get(name) || null),
    setAttribute: vi.fn((name, value) => attrs.set(name, value)),
    removeAttribute: vi.fn((name) => attrs.delete(name)),
    hasAttribute: vi.fn((name) => attrs.has(name)),

    dataset: new Proxy({}, {
      get: (_, prop) => {
        if (typeof prop === 'symbol') return undefined;
        return attrs.get(`data-${prop}`);
      },
      set: (_, prop, value) => {
        if (typeof prop === 'symbol') return false;
        attrs.set(`data-${prop}`, value);
        return true;
      },
    }),

    addEventListener: vi.fn((event, handler, options) => {
      if (!eventListeners.has(event)) {
        eventListeners.set(event, []);
      }
      eventListeners.get(event).push({ handler, options });

      if (!eventBuckets[event]) {
        eventBuckets[event] = [];
      }
      eventBuckets[event].push(handler);
    }),

    removeEventListener: vi.fn((event, handler) => {
      const listeners = eventListeners.get(event);
      if (listeners) {
        const index = listeners.findIndex(l => l.handler === handler);
        if (index > -1) listeners.splice(index, 1);
      }

      if (eventBuckets[event]) {
        if (!handler) {
          eventBuckets[event] = [];
        } else {
          const bucketIndex = eventBuckets[event].indexOf(handler);
          if (bucketIndex > -1) {
            eventBuckets[event].splice(bucketIndex, 1);
          }
        }
      }
    }),

    dispatchEvent: vi.fn((event) => {
      const listeners = eventListeners.get(event.type) || [];
      listeners.forEach(({ handler }) => handler(event));
      return true;
    }),

    focus: vi.fn(function() { this.dispatchEvent({ type: 'focus' }); }),
    blur: vi.fn(function() { this.dispatchEvent({ type: 'blur' }); }),
    click: vi.fn(function() { this.dispatchEvent({ type: 'click' }); }),

    appendChild: vi.fn((child) => {
      if (child) {
        if (child.parentNode) {
          child.parentNode.removeChild(child);
        }
        Object.defineProperty(child, 'parentNode', { value: element, configurable: true, writable: true });
        children.push(child);
      }
      return child;
    }),
    removeChild: vi.fn((child) => {
      const idx = children.indexOf(child);
      if (idx > -1) {
        children.splice(idx, 1);
        Object.defineProperty(child, 'parentNode', { value: null, configurable: true, writable: true });
      }
      return child;
    }),
    insertBefore: vi.fn((newChild, refChild) => {
      if (newChild) {
        if (newChild.parentNode) {
          newChild.parentNode.removeChild(newChild);
        }
        Object.defineProperty(newChild, 'parentNode', { value: element, configurable: true, writable: true });
        const idx = children.indexOf(refChild);
        if (idx > -1) {
          children.splice(idx, 0, newChild);
        } else {
          children.push(newChild);
        }
      }
      return newChild;
    }),
    replaceChild: vi.fn((newChild, oldChild) => {
      if (newChild && oldChild) {
        if (newChild.parentNode) {
          newChild.parentNode.removeChild(newChild);
        }
        const idx = children.indexOf(oldChild);
        if (idx > -1) {
          children[idx] = newChild;
          Object.defineProperty(newChild, 'parentNode', { value: element, configurable: true, writable: true });
          Object.defineProperty(oldChild, 'parentNode', { value: null, configurable: true, writable: true });
        }
      }
      return oldChild;
    }),

    querySelector: vi.fn((sel) => queryAllMockElements(element, sel)[0] || null),
    querySelectorAll: vi.fn((sel) => queryAllMockElements(element, sel)),
    contains: vi.fn((child) => {
      if (!child) return false;
      if (child === element) return true;
      const search = (node) => {
        const children = node.children || node.childNodes || [];
        for (const c of children) {
          if (c === child || search(c)) return true;
        }
        return false;
      };
      return search(element);
    }),

    getBoundingClientRect: vi.fn(() => ({
      width: 0,
      height: 0,
      top: 0,
      left: 0,
      bottom: 0,
      right: 0,
      x: 0,
      y: 0,
      toJSON: () => {}
    })),

    // Test helpers
    _triggerEvent(eventType, eventData = {}) {
      const event = { type: eventType, target: element, ...eventData };
      const listeners = eventListeners.get(eventType) || [];
      listeners.forEach(({ handler }) => handler(event));
    },
    _getClasses: () => Array.from(classList),
    _eventListeners: eventListeners,
    _listeners: eventBuckets,
    _trigger(eventType, eventData = {}) {
      const event = { type: eventType, target: element, ...eventData };
      const listeners = eventListeners.get(eventType) || [];
      listeners.forEach(({ handler }) => handler(event));
    },
    _attrs: attrs,
    _reset() {
      classList.clear();
      eventListeners.clear();
      Object.keys(eventBuckets).forEach((key) => {
        eventBuckets[key] = [];
      });
      attrs.clear();
      vi.clearAllMocks();
    },
  };

  return element;
}

/**
 * Creates a mock button element
 */
export function createMockButton(options = {}) {
  const button = createMockElement('button', options);
  button.disabled = false;
  return button;
}

/**
 * Creates a mock input element
 */
export function createMockInput(options = {}) {
  const { type = 'text', value = '' } = options;
  const input = createMockElement('input', options);
  input.type = type;
  input.value = value;
  input.checked = false;
  input.select = vi.fn();
  return input;
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

export function createStatusNotificationElementsMock(overrides = {}) {
  const elements = {
    statusMessage: createMockElement('span', { className: 'status-message' }),
  };

  return {
    ...elements,
    ...overrides,
  };
}

export function createTranscodeToastElementsMock(overrides = {}) {
  const recordBtn = createMockButton({ className: 'record-btn' });
  const transcodeRing = createMockElement('div', { className: 'transcode-ring' });
  transcodeRing.style = {
    setProperty: vi.fn(),
  };
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

export function createNotesPanelElementsMock(overrides = {}) {
  const elements = {
    notesBtn: createMockButton({ className: 'notes-btn' }),
    notesPanel: createMockElement('div', { className: 'notes-panel' }),
    notesPanelContent: createMockElement('div', { className: 'notes-panel-content' }),
    notesListWrapper: createMockElement('div', { className: 'notes-list-wrapper' }),
    notesSearchInput: createMockInput({ type: 'text' }),
    notesGameFilter: createMockButton({ className: 'notes-game-filter' }),
    notesGameFilterLabel: createMockElement('span', { className: 'notes-game-filter-label' }),
    notesGameFilterMenu: createMockElement('div', { className: 'notes-game-filter-menu' }),
    notesListToggle: createMockButton({ className: 'notes-list-toggle' }),
    notesList: createMockElement('div', { className: 'notes-list' }),
    notesEditor: createMockElement('div', { className: 'notes-editor' }),
    notesGameAddBtn: createMockButton({ className: 'notes-game-add-btn' }),
    notesGameTagRow: createMockElement('div', { className: 'notes-game-tag-row' }),
    notesGameTag: createMockButton({ className: 'notes-game-tag' }),
    notesGameInput: createMockInput({ type: 'text' }),
    notesGameAutocomplete: createMockElement('div', { className: 'notes-game-autocomplete' }),
    notesTitleInput: createMockInput({ type: 'text' }),
    notesContentArea: createMockElement('textarea', { className: 'notes-content-area' }),
    notesNewBtn: createMockButton({ className: 'notes-new-btn' }),
    notesDeleteBtn: createMockButton({ className: 'notes-delete-btn' }),
    streamContainer: createMockElement('div', { className: 'stream-container' }),
    streamToolbar: createMockElement('div', { className: 'stream-toolbar' }),
  };

  return {
    ...elements,
    ...overrides,
  };
}

/**
 * Creates a mock UIController
 * @param {Object} options - Controller options
 * @returns {Object} Mock UIController
 */
export function createUIController(options = {}) {
  const canvas = createMockCanvas(options);
  const video = createMockVideo(options);

  const elements = {
    streamCanvas: canvas,
    streamVideo: video,
    overlayMessage: createMockElement('div', { className: 'overlay-message' }),
    streamOverlay: createMockElement('div', { className: 'stream-overlay' }),
    statusNotification: createMockElement('div', { className: 'status-notification' }),
    statusMessage: createMockElement('span', { className: 'status-message' }),
    deviceStatus: createMockElement('span', { className: 'device-status' }),
    streamInfo: createMockElement('span', { className: 'stream-info' }),
    toolbar: createMockElement('div', { className: 'toolbar' }),
    screenshotBtn: createMockButton({ className: 'screenshot-btn' }),
    recordBtn: createMockButton({ className: 'record-btn' }),
    fullscreenBtn: createMockButton({ className: 'fullscreen-btn' }),
    settingsBtn: createMockButton({ className: 'settings-btn' }),
    ...options.elements,
  };

  const controller = {
    elements,

    /**
     * Set streaming mode (show/hide elements)
     */
    setStreamingMode: vi.fn((isStreaming) => {
      elements.streamOverlay.hidden = isStreaming;
    }),

    /**
     * Update overlay message
     */
    updateOverlayMessage: vi.fn((message, type = 'info') => {
      elements.overlayMessage.textContent = message;
      elements.overlayMessage.dataset.type = type;
    }),

    /**
     * Update status message
     */
    updateStatusMessage: vi.fn((message, type = 'info') => {
      elements.statusMessage.textContent = message;
      elements.statusMessage.dataset.type = type;
    }),

    /**
     * Show error overlay
     */
    showErrorOverlay: vi.fn((message) => {
      elements.overlayMessage.textContent = message;
      elements.overlayMessage.dataset.type = 'error';
      elements.streamOverlay.hidden = false;
    }),

    /**
     * Update device status
     */
    updateDeviceStatus: vi.fn((status) => {
      elements.deviceStatus.textContent = status;
    }),

    /**
     * Update stream info
     */
    updateStreamInfo: vi.fn((info) => {
      elements.streamInfo.textContent = info;
    }),

    /**
     * Enable/disable record button
     */
    setRecordButtonEnabled: vi.fn((enabled) => {
      elements.recordBtn.disabled = !enabled;
    }),

    /**
     * Set recording state on button
     */
    setRecordingState: vi.fn((isRecording) => {
      if (isRecording) {
        elements.recordBtn.classList.add('recording');
      } else {
        elements.recordBtn.classList.remove('recording');
      }
    }),

    // ==========================================
    // Test Helpers
    // ==========================================

    _getElement(name) {
      return elements[name];
    },

    _setElement(name, element) {
      elements[name] = element;
    },

    _reset() {
      Object.values(elements).forEach(el => el._reset?.());
      vi.clearAllMocks();
    },
  };

  return controller;
}

/**
 * Creates mock capture effects
 */
export function createCaptureEffects() {
  const effects = {
    triggerShutterFlash: vi.fn(),
    dispose: vi.fn(),
    _reset() { vi.clearAllMocks(); },
  };
  return effects;
}

/**
 * Creates mock button feedback
 */
export function createButtonFeedback(options = {}) {
  const { recordBtn = createMockButton() } = options;

  const feedback = {
    triggerRecordButtonPop: vi.fn(),
    triggerRecordButtonPress: vi.fn(),
    triggerButtonFeedback: vi.fn(),
    setRecordingButtonState: vi.fn((active) => {
      if (active) {
        recordBtn.classList.add('recording');
      } else {
        recordBtn.classList.remove('recording');
      }
    }),
    dispose: vi.fn(),
    _recordBtn: recordBtn,
    _reset() { vi.clearAllMocks(); },
  };
  return feedback;
}

export default {
  createMockElement,
  createMockButton,
  createMockInput,
  createDeviceStatusElementsMock,
  createStatusNotificationElementsMock,
  createTranscodeToastElementsMock,
  createShaderSelectorElementsMock,
  createSettingsMenuElementsMock,
  createNotesPanelElementsMock,
  createUIController,
  createCaptureEffects,
  createButtonFeedback,
};
