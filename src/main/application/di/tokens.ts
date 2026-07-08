import type { ServiceIdentifier } from 'inversify';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory.js';
import type { PlatformEventBus } from '@platform/events';
import type { WindowService } from '@main/infrastructure/window/window.service.js';
import type { DeviceConnectionService } from '@platform/devices/runtime';
import type { TrayService } from '@main/infrastructure/tray/tray.service.js';
import type { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import type { IpcPushBridge } from '@main/ipc/ipc-push.bridge.js';
import type { MainProcessTestControl } from '@main/ipc/test-control.port.js';
import type { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service.js';
import type { UpdateService } from '@platform/updates';
import type { TranscodeService } from '@platform/transcode/runtime';
import type { LoginItemService } from '@main/infrastructure/window/login-item.service.js';
import type { AppOrchestrator } from '../app.orchestrator.js';

/**
 * Shape of the pre-seeded application config value registered as the `config` token.
 */
export interface MainAppConfig {
  isDevelopment: boolean;
  appName: string;
  version: string;
}

function token<T>(name: string): ServiceIdentifier<T> {
  return Symbol.for(name) as ServiceIdentifier<T>;
}

export const TOKENS = {
  config: token<MainAppConfig>('config'),
  loggerFactory: token<MainLogger>('loggerFactory'),
  eventBus: token<PlatformEventBus>('eventBus'),
  windowService: token<WindowService>('windowService'),
  deviceConnectionService: token<DeviceConnectionService>('deviceConnectionService'),
  trayService: token<TrayService>('trayService'),
  ipcHandlerRegistry: token<IpcHandlerRegistry>('ipcHandlerRegistry'),
  ipcPushBridge: token<IpcPushBridge>('ipcPushBridge'),
  mainProcessTestControl: token<MainProcessTestControl>('mainProcessTestControl'),
  deviceIntegrationService: token<DeviceIntegrationService>('deviceIntegrationService'),
  updateService: token<UpdateService>('updateService'),
  transcodeService: token<TranscodeService>('transcodeService'),
  loginItemService: token<LoginItemService>('loginItemService'),
  appOrchestrator: token<AppOrchestrator>('appOrchestrator')
} as const;

export type TokenKey = keyof typeof TOKENS;
export const TOKEN_KEYS = Object.keys(TOKENS) as readonly TokenKey[];
