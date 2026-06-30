/**
 * Dependency Injection Container
 * Wires every main-process service onto the core Container primitive.
 */

import pkg from '../../../package.json' assert { type: 'json' };
import { Container } from '@prismgb/core';
import { EventBus } from '@main/infrastructure/events/event-bus.js';
import { WindowService } from '@main/infrastructure/window/window.service.js';
import { TrayService } from '@main/infrastructure/tray/tray.service.js';
import { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import { IpcPushBridge } from '@main/ipc/event-bridge.js';
import { DeviceService } from '@prismgb/devices/service';
import { DeviceProfileRegistry } from '@prismgb/devices/service';
import { DeviceLifecycleService } from '@prismgb/devices/service';
import { DeviceBridgeService } from '@prismgb/devices/service';
import type { ProfileClass } from '@prismgb/devices/service';
import { UpdateService, UpdateBridge } from '@prismgb/updates';
import { TranscodeService } from '@prismgb/transcode/service';
import { LoginItemService } from '@main/infrastructure/window/login-item.service.js';
import { DeviceChromaticProfile } from '@prismgb/devices';
import { chromaticConfig } from '@prismgb/devices';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory.js';
import { AppOrchestrator } from './app.orchestrator.js';

/**
 * Application configuration interface
 */
interface AppConfig {
  isDevelopment: boolean;
  appName: string;
  version: string;
}

/**
 * Main-process DI container, backed by the core {@link Container} primitive.
 */
export type MainServiceContainer = Container;

/**
 * Unwraps the legacy `{ value }` override envelope while passing plain instances through.
 */
function unwrapOverride(value: unknown): unknown {
  return value && typeof value === 'object' && 'value' in value
    ? (value as { value: unknown }).value
    : value;
}

/**
 * Build the main-process DI container: pre-seeded config + logger, every service
 * registered against the core Container primitive, then test overrides. No
 * hand-rolled switch — the registration calls are the source of truth.
 */
export function createMainContainer(
  loggerFactory: MainLogger,
  overrides: Record<string, unknown> = {}
): MainServiceContainer {
  const container = new Container();

  container.registerValue('config', {
    isDevelopment: process.env.NODE_ENV === 'development',
    appName: 'PrismGB',
    version: pkg.version
  });
  container.registerValue('loggerFactory', loggerFactory);

  container.register('eventBus', (c) => new EventBus({ loggerFactory: c.resolve('loggerFactory') }));
  container.register('windowService', (c) => new WindowService(c.cradle));
  container.register('trayService', (c) => new TrayService(c.cradle));
  container.register('ipcHandlerRegistry', (c) => new IpcHandlerRegistry(c.cradle));
  container.register('ipcPushBridge', () => new IpcPushBridge());
  container.register('profileRegistry', (c) => new DeviceProfileRegistry({ loggerFactory: c.resolve('loggerFactory') }));
  container.register('deviceService', (c) => {
    const profileClasses = new Map<string, ProfileClass>([[chromaticConfig.id, DeviceChromaticProfile]]);
    return new DeviceService(
      {
        profileRegistry: c.resolve('profileRegistry'),
        eventBus: c.resolve('eventBus'),
        loggerFactory: c.resolve('loggerFactory')
      },
      profileClasses
    );
  });
  container.register('deviceLifecycleService', (c) => new DeviceLifecycleService(c.cradle));
  container.register('updateService', (c) => new UpdateService(c.cradle));
  container.register('deviceBridgeService', (c) => new DeviceBridgeService(c.cradle));
  container.register('updateBridgeService', (c) => new UpdateBridge(c.cradle));
  container.register('transcodeService', (c) => new TranscodeService(c.cradle));
  container.register('loginItemService', (c) => new LoginItemService(c.cradle));
  container.register('appOrchestrator', (c) => new AppOrchestrator(c));

  for (const [token, value] of Object.entries(overrides)) {
    container.registerValue(token, unwrapOverride(value));
  }

  return container;
}

/**
 * Create the container and eagerly bootstrap the device service.
 * @param loggerFactory - Pre-configured MainLogger instance
 * @returns Configured container instance
 */
export async function createAppContainer(loggerFactory: MainLogger): Promise<MainServiceContainer> {
  const containerLogger = loggerFactory.create('Container');
  containerLogger.info('Initializing dependency injection container');

  const container = createMainContainer(loggerFactory);

  const deviceService = container.resolve<DeviceService>('deviceService');
  await deviceService.initialize();

  containerLogger.info(`Registered ${container.tokens.length} dependencies`);

  return container;
}
