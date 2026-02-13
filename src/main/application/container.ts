/**
 * Dependency Injection Container
 * Central container for all main process dependencies using Awilix
 */

import * as awilix from 'awilix';
import type { AwilixContainer } from 'awilix';
const { createContainer, asClass, asValue, InjectionMode } = awilix;
import pkg from '../../../package.json' assert { type: 'json' };
import { EventBus } from '@main/infrastructure/events/index.js';
import { WindowService } from '@main/infrastructure/window/index.js';
import { TrayService } from '@main/infrastructure/tray/index.js';
import { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import {
  DeviceService,
  DeviceProfileRegistry,
  DeviceLifecycleService,
  DeviceBridgeService,
  type ProfileClass
} from '@main/infrastructure/devices/index.js';
import { UpdateService } from '@main/infrastructure/updates/index.js';
import { TranscodeService } from '@main/infrastructure/transcode/index.js';
import { DeviceChromaticProfile } from '@prismgb/devices';
import type { MainLogger } from '@main/infrastructure/logging/index.js';

/**
 * Application configuration interface
 */
interface AppConfig {
  isDevelopment: boolean;
  appName: string;
  version: string;
}

/**
 * Container dependencies interface
 */
export interface ContainerDependencies {
  config: AppConfig;
  loggerFactory: MainLogger;
  eventBus: EventBus;
  windowService: WindowService;
  trayService: TrayService;
  ipcHandlerRegistry: IpcHandlerRegistry;
  deviceService: DeviceService;
  profileRegistry: DeviceProfileRegistry;
  deviceLifecycleService: DeviceLifecycleService;
  deviceBridgeService: DeviceBridgeService;
  updateService: UpdateService;
  transcodeService: TranscodeService;
}

/**
 * Create and configure the DI container
 * @param loggerFactory - Pre-configured MainLogger instance from MainAppOrchestrator
 * @returns Configured container
 */
async function createAppContainer(loggerFactory: MainLogger): Promise<AwilixContainer<ContainerDependencies>> {
  const container = createContainer<ContainerDependencies>({
    injectionMode: InjectionMode.PROXY
  });

  // Use provided logger factory (shared with MainAppOrchestrator)
  const containerLogger = loggerFactory.create('Container');
  containerLogger.info('Initializing dependency injection container');

  // Register configuration and utilities
  container.register({
    // Config - simple value
    config: asValue<AppConfig>({
      isDevelopment: process.env.NODE_ENV === 'development',
      appName: 'PrismGB',
      version: pkg.version
    }),

    // Logger factory - singleton instance
    loggerFactory: asValue(loggerFactory),

    // EventBus - singleton for cross-service communication
    eventBus: asClass(EventBus).singleton()
  });

  // Register core services
  container.register({
    windowService: asClass(WindowService).singleton(),
    trayService: asClass(TrayService).singleton(),
    ipcHandlerRegistry: asClass(IpcHandlerRegistry).singleton()
  });

  // Register device components
  container.register({
    profileRegistry: asClass(DeviceProfileRegistry).singleton()
  });

  // Profile classes injected via DI (same pattern as adapterClasses in renderer)
  const profileClasses = new Map<string, ProfileClass>([
    ['chromatic-mod-retro', DeviceChromaticProfile]
  ]);

  // Manual instantiation required because DeviceService.initialize() is async
  // and must be awaited during container bootstrap (Awilix doesn't support async factories)
  const deviceService = new DeviceService({
    profileRegistry: container.resolve('profileRegistry'),
    eventBus: container.resolve('eventBus'),
    loggerFactory: container.resolve('loggerFactory')
  }, profileClasses);
  await deviceService.initialize();

  container.register({
    deviceService: asValue(deviceService),
    deviceLifecycleService: asClass(DeviceLifecycleService).singleton()
  });

  // Register update components
  container.register({
    updateService: asClass(UpdateService).singleton(),
    deviceBridgeService: asClass(DeviceBridgeService).singleton()
  });

  // Register transcode components
  container.register({
    transcodeService: asClass(TranscodeService).singleton()
  });

  // Log registration count
  const count = Object.keys(container.registrations).length;
  containerLogger.info(`Registered ${count} dependencies`);

  return container;
}

export { createAppContainer };
