/**
 * Effects Module Index
 *
 * Re-exports all effect classes for convenient importing.
 */

export { UIEffects } from './ui-effects.class.js';
export { BodyModes } from './body-modes.class.js';

// Feature-colocated effects (for direct imports if needed)
export { CursorAutoHide } from '@renderer/ui/features/streaming/effects/cursor-auto-hide.class.js';
export { ToolbarAutoHide } from '@renderer/ui/features/toolbar/effects/toolbar-auto-hide.class.js';
export { ButtonFeedback } from '@renderer/ui/features/toolbar/effects/button-feedback.class.js';
export { CaptureEffects } from '@renderer/ui/features/toolbar/effects/capture-effects.class.js';
export { ControlsAutoHide } from '@renderer/ui/features/fullscreen/effects/controls-auto-hide.class.js';
