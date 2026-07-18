/**
 * Application timing constants
 *
 * Shared timing values used by renderer presentation and infrastructure layers.
 */
export const TIMING = {
  // UI resize debounce delay (ms)
  RESIZE_DEBOUNCE_MS: 100,

  // Button feedback animation duration (ms)
  BUTTON_FEEDBACK_MS: 200,

  // Device enumeration cooldown window (ms)
  DEVICE_ENUMERATE_COOLDOWN_MS: 300,

  // Device change event debounce delay (ms)
  // Prevents race conditions from rapid USB connect/disconnect sequences
  DEVICE_CHANGE_DEBOUNCE_MS: 150,

  // UI operation timeout (ms)
  UI_TIMEOUT_MS: 150,

  // Cursor auto-hide delay (ms)
  CURSOR_HIDE_DELAY_MS: 2000,

  // Minimalist fullscreen transition duration (ms)
  MINIMALIST_TRANSITION_MS: 250
};
