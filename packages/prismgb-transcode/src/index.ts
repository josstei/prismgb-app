/**
 * Transcode Infrastructure
 * Barrel export: the renderer-safe configuration/state contract only.
 * The main-process TranscodeService (which pulls node/native deps) is exposed
 * separately via the `@prismgb/transcode/service` subpath so a renderer import of
 * this barrel never drags ffmpeg/electron/node modules into the renderer bundle.
 */

export { TRANSCODE_CONFIG, TranscodeState } from './transcode.config.js';
export type { TranscodeFormatKey } from './transcode.config.js';
