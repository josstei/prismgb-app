/**
 * Configuration Loader
 * Centralized configuration loader with validation and type safety.
 *
 * App-level configuration - device-agnostic settings.
 */

import { z } from 'zod';

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

const configSchema = z
  .object({
    app: z
      .object({
        DEVICE_LAUNCH_DELAY: z.number().int().min(0),
        USB_SCAN_DELAY: z.number().int().min(0)
      })
      .strict(),
    ui: z
      .object({
        WINDOW_CONFIG: z
          .object({
            width: z.number().int().positive(),
            height: z.number().int().positive(),
            minWidth: z.number().int().positive(),
            minHeight: z.number().int().positive(),
            backgroundColor: z.string(),
            title: z.string()
          })
          .strict()
      })
      .strict()
  })
  .strict();

const config: AppConfiguration = {
  app,
  ui
};

function validateConfig(): AppConfiguration {
  const result = configSchema.safeParse(config);

  if (!result.success) {
    const errorMessage = result.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('\n  - ');
    throw new Error(`Configuration validation failed:\n  - ${errorMessage}`);
  }

  return result.data as AppConfiguration;
}

const validatedConfig = validateConfig();

Object.freeze(validatedConfig);
Object.freeze(validatedConfig.app);
Object.freeze(validatedConfig.ui);

export const appConfig = validatedConfig.app;
export const uiConfig = validatedConfig.ui;
