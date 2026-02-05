/**
 * Dependency Injection Container
 * Central container for all main process dependencies using Awilix
 */

import * as awilix from 'awilix';
const { createContainer, asClass, asValue, InjectionMode } = awilix;
import pkg from '../../package.json' assert { type: 'json' };
import { EventBus } from './infrastructure/events/event-bus.class.js';

/**
 * Create and configure the DI container
 * @param {Object} loggerFactory - Pre-configured MainLogger instance from MainAppOrchestrator
 * @returns {Promise<AwilixContainer>} Configured container
 */
async function createAppContainer(loggerFactory) {
  const container = createContainer({
    injectionMode: InjectionMode.PROXY
  });

  // Use provided logger factory (shared with MainAppOrchestrator)
  const containerLogger = loggerFactory.create('Container');
  containerLogger.info('Initializing dependency injection container');

  // Register configuration and utilities
  container.register({
    // Config - simple value
    config: asValue({
      isDevelopment: process.env.NODE_ENV === 'development',
      appName: 'PrismGB',
      version: pkg.version
    }),

    // Logger factory - singleton instance
    loggerFactory: asValue(loggerFactory),

    // EventBus - singleton for cross-service communication
    eventBus: asClass(EventBus).singleton()
  });

  // Manual registration for ESM compatibility (Awilix loadModules uses require)

  // Services
  const { WindowService } = await import('./infrastructure/window/index.js');
  const { TrayService } = await import('./infrastructure/tray/tray.service.js');
  const { IpcHandlerRegistry } = await import('./ipc/ipc-handler.registry.js');

  container.register({
    windowService: asClass(WindowService).singleton(),
    trayService: asClass(TrayService).singleton(),
    ipcHandlerRegistry: asClass(IpcHandlerRegistry).singleton()
  });

  // Device components
  const { DeviceService } = await import('@main/infrastructure/devices/device.service.js');
  const { DeviceProfileRegistry } = await import('@main/infrastructure/devices/device-profile.registry.js');
  const { DeviceLifecycleService } = await import('@main/infrastructure/devices/device-lifecycle.service.js');
  const { DeviceChromaticProfile } = await import('@shared/features/devices/profiles/chromatic/device-chromatic.profile.js');

  container.register({
    profileRegistry: asClass(DeviceProfileRegistry).singleton()
  });

  // Profile classes injected via DI (same pattern as adapterClasses in renderer)
  const profileClasses = new Map([
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

  // Update components
  const { UpdateService } = await import('@main/features/updates/update.service.js');

  const { DeviceBridgeService } = await import('@main/infrastructure/devices/device-bridge.service.js');
  const { UpdateBridge } = await import('./features/updates/update.bridge.js');

  container.register({
    updateService: asClass(UpdateService).singleton(),
    deviceBridgeService: asClass(DeviceBridgeService).singleton(),
    updateBridgeService: asClass(UpdateBridge).singleton()
  });

  // Transcode components
  const { TranscodeService } = await import('@main/features/transcode/transcode.service.js');

  container.register({
    transcodeService: asClass(TranscodeService).singleton()
  });

  // Log registration count
  const count = Object.keys(container.registrations).length;
  containerLogger.info(`Registered ${count} dependencies`);

  return container;
}

export { createAppContainer };
