/**
 * Event Contracts
 *
 * Defines schemas for event payloads to ensure contract compliance.
 * Uses Joi for schema validation.
 */

import Joi from 'joi';

/**
 * Device event contracts
 */
export const DeviceContracts = {
  'device:status-changed': Joi.object({
    connected: Joi.boolean().required(),
    deviceId: Joi.string().allow(null),
    label: Joi.string().allow(null),
  }),

  'device:supported-device-available': Joi.object({
    device: Joi.object({
      deviceId: Joi.string().required(),
      label: Joi.string().required(),
      kind: Joi.string().valid('videoinput').required(),
    }).required(),
  }),

  'device:enumeration-failed': Joi.object({
    error: Joi.any().required(),
    message: Joi.string(),
  }),

  'device:disconnected-during-session': Joi.object({
    deviceId: Joi.string(),
    wasStreaming: Joi.boolean(),
  }),
};

/**
 * Stream event contracts
 */
export const StreamContracts = {
  'stream:started': Joi.object({
    stream: Joi.object().required(),
    device: Joi.object({
      deviceId: Joi.string().required(),
      label: Joi.string(),
      kind: Joi.string().valid('videoinput'),
    }),
    capabilities: Joi.object({
      nativeResolution: Joi.object({
        width: Joi.number().integer().positive().required(),
        height: Joi.number().integer().positive().required(),
      }),
      supportedFrameRates: Joi.array().items(Joi.number()),
      canvasScale: Joi.number().integer().positive(),
      deviceName: Joi.string(),
    }),
  }),

  'stream:stopped': Joi.object({
    reason: Joi.string(),
    wasRecording: Joi.boolean(),
  }).allow({}),

  'stream:error': Joi.object({
    error: Joi.any().required(),
    operation: Joi.string().valid('start', 'stop', 'restart'),
    deviceId: Joi.string(),
    message: Joi.string(),
  }),

  'stream:health-ok': Joi.object({
    frameCount: Joi.number().integer(),
    fps: Joi.number(),
  }).allow({}),

  'stream:health-timeout': Joi.object({
    lastFrameTime: Joi.number(),
    timeout: Joi.number(),
  }),
};

/**
 * Capture event contracts
 */
export const CaptureContracts = {
  'capture:screenshot-triggered': Joi.object().allow({}),

  'capture:screenshot-ready': Joi.object({
    filename: Joi.string().pattern(/^prismgb-screenshot.*\.png$/).required(),
    blob: Joi.object().required(),
  }),

  'capture:recording-started': Joi.object().allow({}),

  'capture:recording-stopped': Joi.object().allow({}),

  'capture:recording-ready': Joi.object({
    filename: Joi.string().pattern(/^prismgb-recording.*\.webm$/).required(),
    blob: Joi.object().required(),
  }),

  'capture:recording-error': Joi.object({
    error: Joi.string().required(),
    name: Joi.string().required(),
  }),

  'capture:recording-degraded': Joi.object({
    reason: Joi.string(),
    droppedFrames: Joi.number().integer(),
  }),
};

/**
 * Settings event contracts
 */
export const SettingsContracts = {
  'settings:volume-changed': Joi.object({
    volume: Joi.number().min(0).max(100).required(),
  }),

  'settings:brightness-changed': Joi.object({
    brightness: Joi.number().min(0.5).max(1.5).required(),
  }),

  'settings:render-preset-changed': Joi.object({
    preset: Joi.string().valid('sharp', 'smooth', 'retro').required(),
  }),

  'settings:performance-mode-changed': Joi.object({
    mode: Joi.string().valid('performance', 'balanced', 'quality').required(),
  }),

  'settings:cinematic-mode-changed': Joi.object({
    enabled: Joi.boolean().required(),
  }),

  'settings:minimalist-fullscreen-changed': Joi.object({
    enabled: Joi.boolean().required(),
  }),

  'settings:preferences-loaded': Joi.object({
    volume: Joi.number(),
    brightness: Joi.number(),
    performanceMode: Joi.string(),
    renderPreset: Joi.string(),
    cinematicMode: Joi.boolean(),
  }),
};

/**
 * UI event contracts
 */
export const UIContracts = {
  'ui:status-message': Joi.object({
    message: Joi.string().required(),
    type: Joi.string().valid('info', 'success', 'warning', 'error'),
    duration: Joi.number().integer().positive(),
  }),

  'ui:overlay-message': Joi.object({
    message: Joi.string().required(),
    type: Joi.string().valid('info', 'error', 'waiting'),
  }),

  'ui:streaming-mode': Joi.object({
    streaming: Joi.boolean().required(),
  }),

  'ui:recording-state': Joi.object({
    recording: Joi.boolean().required(),
  }),

  'ui:fullscreen-state': Joi.object({
    fullscreen: Joi.boolean().required(),
  }),

  'ui:shutter-flash': Joi.object().allow({}),

  'ui:record-button-pop': Joi.object().allow({}),

  'ui:screenshot-requested': Joi.object().allow({}),

  'ui:recording-toggle-requested': Joi.object().allow({}),
};

/**
 * All event contracts combined
 */
export const EventContracts = {
  ...DeviceContracts,
  ...StreamContracts,
  ...CaptureContracts,
  ...SettingsContracts,
  ...UIContracts,
};

/**
 * Validates an event payload against its contract
 * @param {string} eventName - Name of the event
 * @param {*} payload - Event payload to validate
 * @returns {{ valid: boolean, error?: string }} Validation result
 */
export function validateEventPayload(eventName, payload) {
  const schema = EventContracts[eventName];

  if (!schema) {
    return {
      valid: true,
      warning: `No contract defined for event: ${eventName}`,
    };
  }

  const { error, value } = schema.validate(payload, {
    abortEarly: false,
    allowUnknown: true,
  });

  if (error) {
    return {
      valid: false,
      error: `Contract violation for '${eventName}': ${error.message}`,
      details: error.details,
    };
  }

  return { valid: true, value };
}

/**
 * Creates an assertion helper for event contracts
 * @param {string} eventName - Event name
 * @param {*} payload - Event payload
 * @throws {Error} If contract is violated
 */
export function assertEventContract(eventName, payload) {
  const result = validateEventPayload(eventName, payload);

  if (!result.valid) {
    throw new Error(result.error);
  }
}

/**
 * Creates a contract-validating event bus wrapper
 * @param {Object} eventBus - EventBus instance to wrap
 * @param {Object} options - Options
 * @param {boolean} options.strict - Throw on unknown events (default: false)
 * @returns {Object} Wrapped event bus
 */
export function wrapWithContractValidation(eventBus, options = {}) {
  const { strict = false } = options;
  const originalPublish = eventBus.publish;

  eventBus.publish = (event, data) => {
    const result = validateEventPayload(event, data);

    if (!result.valid) {
      throw new Error(result.error);
    }

    if (strict && result.warning) {
      throw new Error(result.warning);
    }

    return originalPublish.call(eventBus, event, data);
  };

  return eventBus;
}

/**
 * Gets all defined event names
 * @returns {string[]} Array of event names
 */
export function getDefinedEventNames() {
  return Object.keys(EventContracts);
}

/**
 * Checks if a contract is defined for an event
 * @param {string} eventName - Event name
 * @returns {boolean}
 */
export function hasContract(eventName) {
  return eventName in EventContracts;
}

export default {
  EventContracts,
  DeviceContracts,
  StreamContracts,
  CaptureContracts,
  SettingsContracts,
  UIContracts,
  validateEventPayload,
  assertEventContract,
  wrapWithContractValidation,
  getDefinedEventNames,
  hasContract,
};
