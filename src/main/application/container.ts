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
import { MainProcessTestControl } from '@main/ipc/test-control.port.js';
import { DeviceConnectionService } from '@prismgb/devices/runtime';
import { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service.js';
import { UpdateService, UpdateBridge } from '@prismgb/updates';
import { TranscodeService } from '@prismgb/transcode/service';
import { LoginItemService } from '@main/infrastructure/window/login-item.service.js';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory.js';
import { AppOrchestrator } from './app.orchestrator.js';

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

function isE2eTestControlEnabled(): boolean {
  return process.env.PRISMGB_E2E_TEST_CONTROL === '1';
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
  container.register('deviceConnectionService', (c) => new DeviceConnectionService({ loggerFactory: c.resolve('loggerFactory') }));
  container.register('trayService', (c) => new TrayService(c.cradle));
  container.register('ipcHandlerRegistry', (c) => new IpcHandlerRegistry(c.cradle));
  container.register('ipcPushBridge', () => new IpcPushBridge());
  container.register('mainProcessTestControl', (c) => new MainProcessTestControl({
    enabled: isE2eTestControlEnabled(),
    ipcPushBridge: c.resolve('ipcPushBridge')
  }));
  container.register('deviceIntegrationService', (c) => new DeviceIntegrationService(c.cradle));
  container.register('updateService', (c) => new UpdateService(c.cradle));
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
 * Create the container. Device monitoring starts from AppOrchestrator after
 * app-owned integration side effects have subscribed to runtime events.
 */
export async function createAppContainer(loggerFactory: MainLogger): Promise<MainServiceContainer> {
  const containerLogger = loggerFactory.create('Container');
  containerLogger.info('Initializing dependency injection container');

  const container = createMainContainer(loggerFactory);

  containerLogger.info(`Registered ${container.tokens.length} dependencies`);

  return container;
}
