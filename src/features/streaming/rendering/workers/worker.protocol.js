/**
 * Worker Protocol
 *
 * Defines the message protocol between the main thread and the render worker.
 * Ensures type-safe communication for the GPU rendering pipeline.
 */

/**
 * Message types sent from main thread to worker
 * @readonly
 * @enum {string}
 */
export const WorkerMessageType = Object.freeze({
  /** Initialize the renderer with canvas and config */
  INIT: 'init',

  /** Upload and render a new video frame */
  FRAME: 'frame',

  /** Resize the output canvas */
  RESIZE: 'resize',

  /** Change the active render preset */
  SET_PRESET: 'setPreset',

  /** Request capture of the last rendered frame */
  CAPTURE: 'capture',

  /** Release GPU resources while keeping worker alive (for idle memory savings) */
  RELEASE: 'release',

  /** Destroy renderer and release resources */
  DESTROY: 'destroy'
});

/**
 * Message types sent from worker to main thread
 * @readonly
 * @enum {string}
 */
export const WorkerResponseType = Object.freeze({
  /** Renderer initialized successfully */
  READY: 'ready',

  /** Frame rendered successfully */
  FRAME_RENDERED: 'frameRendered',

  /** Error occurred in worker */
  ERROR: 'error',

  /** Performance statistics update */
  STATS: 'stats',

  /** Captured frame ready (contains ImageBitmap) */
  CAPTURE_READY: 'captureReady',

  /** GPU resources released (worker still alive) */
  RELEASED: 'released',

  /** Renderer destroyed */
  DESTROYED: 'destroyed'
});

/**
 * Shader pass identifiers
 * @readonly
 * @enum {string}
 */
export const ShaderPass = Object.freeze({
  PIXEL_UPSCALE: 'pixelUpscale',
  UNSHARP_MASK: 'unsharpMask',
  COLOR_ELEVATION: 'colorElevation',
  CRT_LCD: 'crtLcd'
});

/**
 * Create a message to send to the worker
 * @param {WorkerMessageType} type - Message type
 * @param {Object} payload - Message payload
 * @returns {Object} Message object with timestamp
 */
export function createWorkerMessage(type, payload = {}) {
  return {
    type,
    payload,
    timestamp: performance.now()
  };
}

/**
 * Create a response from the worker
 * @param {WorkerResponseType} type - Response type
 * @param {Object} payload - Response payload
 * @returns {Object} Response object with timestamp
 */
export function createWorkerResponse(type, payload = {}) {
  return {
    type,
    payload,
    timestamp: performance.now()
  };
}

/**
 * @typedef {Object} InitPayload
 * @property {OffscreenCanvas} canvas - The transferred canvas
 * @property {Object} config - Renderer configuration
 * @property {number} config.nativeWidth - Source width (160)
 * @property {number} config.nativeHeight - Source height (144)
 * @property {number} config.targetWidth - Output canvas width
 * @property {number} config.targetHeight - Output canvas height
 * @property {'webgpu'|'webgl2'} config.api - API to use
 * @property {string} config.presetId - Initial preset ID
 */

/**
 * @typedef {Object} FramePayload
 * @property {ImageBitmap} imageBitmap - Video frame as ImageBitmap
 * @property {Object} uniforms - Current uniform values for all passes
 */

/**
 * @typedef {Object} ResizePayload
 * @property {number} width - New canvas width
 * @property {number} height - New canvas height
 * @property {number} scaleFactor - Integer scale factor
 */

/**
 * @typedef {Object} PresetPayload
 * @property {string} presetId - Preset identifier
 * @property {Object} preset - Full preset configuration
 */

/**
 * @typedef {Object} StatsPayload
 * @property {number} fps - Frames rendered per second
 * @property {number} frameTime - Average frame render time (ms)
 * @property {number} gpuTime - GPU execution time (ms) if available
 * @property {number} uploadTime - Texture upload time (ms)
 */

/**
 * @typedef {Object} ErrorPayload
 * @property {string} message - Error message
 * @property {string} [stack] - Error stack trace
 * @property {string} [code] - Error code for categorization
 */

/**
 * Validate a worker message
 * @param {Object} message - Message to validate
 * @returns {boolean} True if valid
 */
export function isValidWorkerMessage(message) {
  return (
    message !== null &&
    typeof message === 'object' &&
    typeof message.type === 'string' &&
    Object.values(WorkerMessageType).includes(message.type)
  );
}
