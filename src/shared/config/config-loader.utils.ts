/**
 * Configuration Loader
 * Centralized configuration loader with validation and type safety.
 *
 * App-level configuration - device-agnostic settings.
 */

import Joi from 'joi';

export interface AppConfig {
  DEVICE_LAUNCH_DELAY: number;
  USB_SCAN_DELAY: number;
}

export interface WindowConfig {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
  backgroundColor: string;
  title: string;
}

export interface UiConfig {
  WINDOW_CONFIG: WindowConfig;
}

export interface AppConfiguration {
  app: AppConfig;
  ui: UiConfig;
}

const app: AppConfig = {
  DEVICE_LAUNCH_DELAY: 500,
  USB_SCAN_DELAY: 1000
};

const ui: UiConfig = {
  WINDOW_CONFIG: {
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0f0f1e',
    title: 'PrismGB Launcher'
  }
};

const configSchema = Joi.object({
  app: Joi.object({
    DEVICE_LAUNCH_DELAY: Joi.number().integer().min(0).required(),
    USB_SCAN_DELAY: Joi.number().integer().min(0).required()
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

const config: AppConfiguration = {
  app,
  ui
};

function validateConfig(): AppConfiguration {
  const { error, value } = configSchema.validate(config, {
    abortEarly: false,
    allowUnknown: false
  });

  if (error) {
    const errorMessage = error.details
      .map((detail) => `${detail.path.join('.')}: ${detail.message}`)
      .join('\n  - ');
    throw new Error(`Configuration validation failed:\n  - ${errorMessage}`);
  }

  return value as AppConfiguration;
}

const validatedConfig = validateConfig();

Object.freeze(validatedConfig);
Object.freeze(validatedConfig.app);
Object.freeze(validatedConfig.ui);

export const appConfig = validatedConfig.app;
export const uiConfig = validatedConfig.ui;
