/**
 * Configuration Loader
 * Centralized configuration loader with validation and type safety
 *
 * App-level configuration - device-agnostic settings
 */

import Joi from 'joi';

// App config - application-level settings (device-agnostic)
const app = {
  DEVICE_LAUNCH_DELAY: 500,    // Delay before launching stream after device connection
  USB_SCAN_DELAY: 1000,        // Delay before scanning for connected devices after USB monitoring starts
  USB_INIT_DELAY: 500          // Delay for USB monitoring to initialize before enumeration
};

// UI config - window and display settings
const ui = {
  WINDOW_CONFIG: {
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f1e',  // Default dark theme background
    title: 'PrismGB Launcher'
  }
};

/**
 * Configuration Validation Schema
 */
const configSchema = Joi.object({
  app: Joi.object({
    DEVICE_LAUNCH_DELAY: Joi.number().integer().min(0).required(),
    USB_SCAN_DELAY: Joi.number().integer().min(0).required(),
    USB_INIT_DELAY: Joi.number().integer().min(0).required()
  }).required(),

  ui: Joi.object({
    WINDOW_CONFIG: Joi.object({
      width: Joi.number().integer().positive().required(),
      height: Joi.number().integer().positive().required(),
      minWidth: Joi.number().integer().positive().required(),
      minHeight: Joi.number().integer().positive().required(),
      backgroundColor: Joi.string().required(),
      title: Joi.string().required()
    }).required()
  }).required()
});

/**
 * Main configuration object
 */
const config = {
  app,
  ui
};

/**
 * Validate configuration on load
 * Always runs to catch configuration issues early
 */
function validateConfig() {
  const { error, value } = configSchema.validate(config, {
    abortEarly: false,
    allowUnknown: false
  });

  if (error) {
    const errorMessage = error.details
      .map(detail => `${detail.path.join('.')}: ${detail.message}`)
      .join('\n  - ');
    throw new Error(`Configuration validation failed:\n  - ${errorMessage}`);
  }

  return value;
}

// Run validation on module load
const validatedConfig = validateConfig();

// Freeze config to prevent accidental modifications
Object.freeze(validatedConfig);
Object.freeze(validatedConfig.app);
Object.freeze(validatedConfig.ui);

// Named exports for convenience
export const appConfig = validatedConfig.app;
export const uiConfig = validatedConfig.ui;
