/**
 * Dependency Injection Container
 * Central container for all main process dependencies using Awilix
 */

import * as awilix from 'awilix';
const { createContainer, asClass, asValue, InjectionMode } = awilix;
import pkg from '../../package.json' assert { type: 'json' };
import { EventBus } from './infrastructure/events/event-bus.js';

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
  const { WindowService } = await import('./window/window.service.js');
  const { TrayService } = await import('./tray/tray.service.js');
  const { IpcHandlerRegistry } = await import('./ipc/ipc-handler.registry.js');

  container.register({
    windowService: asClass(WindowService).singleton(),
    trayService: asClass(TrayService).singleton(),
    ipcHandlerRegistry: asClass(IpcHandlerRegistry).singleton()
  });

  // Device components
  const { DeviceService } = await import('@main/features/devices/device.service.js');
  const { ProfileRegistry } = await import('@main/features/devices/profile.registry.js');
  const { DeviceLifecycleService } = await import('@main/features/devices/device-lifecycle.service.js');

  container.register({
    deviceService: asClass(DeviceService).singleton(),
    profileRegistry: asClass(ProfileRegistry).singleton(),
    deviceLifecycleService: asClass(DeviceLifecycleService).singleton()
  });

  // Update components
  const { UpdateService } = await import('@main/features/updates/update.service.js');

  const { DeviceBridge } = await import('./features/devices/device.bridge.js');
  const { UpdateBridge } = await import('./features/updates/update.bridge.js');

  container.register({
    updateService: asClass(UpdateService).singleton(),
    deviceBridgeService: asClass(DeviceBridge).singleton(),
    updateBridgeService: asClass(UpdateBridge).singleton()
  });

  // Log registration count
  const count = Object.keys(container.registrations).length;
  containerLogger.info(`Registered ${count} dependencies`);

  return container;
}

export { createAppContainer };
