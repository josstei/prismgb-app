export const TIMING = {
  RESIZE_DEBOUNCE_MS: 100,
  BUTTON_FEEDBACK_MS: 200,
  // Absorbs rapid USB connect/disconnect sequences before re-enumerating devices.
  DEVICE_CHANGE_DEBOUNCE_MS: 150,
  UI_TIMEOUT_MS: 150,
  CURSOR_HIDE_DELAY_MS: 2000,
  MINIMALIST_TRANSITION_MS: 250
} as const;
