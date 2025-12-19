/**
 * Dependency Injection Container
 * Central container for all main process dependencies using Awilix
 */

import * as awilix from 'awilix';
const { createContainer, asClass, asValue, InjectionMode } = awilix;
import pkg from '../../../package.json' assert { type: 'json' };

/**
 * Create and configure the DI container
 * @param {Object} loggerFactory - Pre-configured MainLogger instance from Application
 * @returns {Promise<AwilixContainer>} Configured container
 */
async function createAppContainer(loggerFactory) {
  const container = createContainer({
    injectionMode: InjectionMode.PROXY
  });

  // Use provided logger factory (shared with Application)
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
    loggerFactory: asValue(loggerFactory)
  });

  // Manual registration for ESM compatibility (Awilix loadModules uses require)

  // Services
  const { default: WindowManager } = await import('./WindowManager.js');
  const { default: TrayManager } = await import('./TrayManager.js');
  const { default: IpcHandlers } = await import('./IpcHandlers.js');

  container.register({
    windowManager: asClass(WindowManager).singleton(),
    trayManager: asClass(TrayManager).singleton(),
    ipcHandlers: asClass(IpcHandlers).singleton()
  });

  // Device components
  const { default: DeviceManager } = await import('@features/devices/main/device.manager.js');
  const { default: ProfileRegistry } = await import('@features/devices/main/profile.registry.js');

  container.register({
    deviceManager: asClass(DeviceManager).singleton(),
    profileRegistry: asClass(ProfileRegistry).singleton()
  });

  // Update components
  const { default: UpdateManager } = await import('@features/updates/main/update.manager.js');

  container.register({
    updateManager: asClass(UpdateManager).singleton()
  });

  // Log registration count
  const count = Object.keys(container.registrations).length;
  containerLogger.info(`Registered ${count} dependencies`);

  return container;
}

export { createAppContainer };
