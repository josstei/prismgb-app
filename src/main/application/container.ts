/**
 * Dependency Injection Container
 * Central static container for all main process dependencies
 */

import pkg from '../../../package.json' assert { type: 'json' };
import { EventBus } from '@main/infrastructure/events/event-bus.js';
import { WindowService } from '@main/infrastructure/window/window.service.js';
import { TrayService } from '@main/infrastructure/tray/tray.service.js';
import { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import { DeviceService } from '@main/infrastructure/devices/device.service.js';
import { DeviceProfileRegistry } from '@main/infrastructure/devices/device-profile.registry.js';
import { DeviceLifecycleService } from '@main/infrastructure/devices/device-lifecycle.service.js';
import { DeviceBridgeService } from '@main/infrastructure/devices/device-bridge.service.js';
import type { ProfileClass } from '@main/infrastructure/devices/device.service.js';
import { UpdateService, UpdateBridge } from '@prismgb/updates';
import { TranscodeService } from '@main/infrastructure/transcode/transcode.service.js';
import { LoginItemService } from '@main/infrastructure/window/login-item.service.js';
import { DeviceChromaticProfile } from '@prismgb/devices';
import { chromaticConfig } from '@prismgb/devices';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory.js';
import { safeDispose } from '@prismgb/core';
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
  updateBridgeService: UpdateBridge;
  transcodeService: TranscodeService;
  loginItemService: LoginItemService;
}

/**
 * Static zero-overhead Dependency Injection Container for the Main process
 */
export class MainServiceContainer {
  private instances = new Map<string, any>();
  private cache = new Map<string, { value: unknown }>();
  public registrations: Record<string, any> = {};

  constructor(loggerFactory: MainLogger, overrides: Record<string, any> = {}) {
    const keys = [
      'config', 'loggerFactory', 'eventBus', 'windowService', 'trayService',
      'ipcHandlerRegistry', 'profileRegistry', 'deviceService', 'deviceLifecycleService',
      'updateService', 'deviceBridgeService', 'updateBridgeService', 'transcodeService',
      'loginItemService', 'appOrchestrator'
    ];
    for (const key of keys) {
      this.registrations[key] = {};
    }

    // Register config value
    this.instances.set('config', {
      isDevelopment: process.env.NODE_ENV === 'development',
      appName: 'PrismGB',
      version: pkg.version
    });

    // Register logger factory
    this.instances.set('loggerFactory', loggerFactory);

    // Apply overrides
    for (const [key, val] of Object.entries(overrides)) {
      const unwrapped = val && typeof val === 'object' && 'value' in val ? val.value : val;
      this.instances.set(key, unwrapped);
      this.cache.set(key, { value: unwrapped });
    }
  }

  public get cradle(): any {
    return new Proxy({}, {
      get: (_target: object, prop: string | symbol) => {
        if (typeof prop === 'string' && prop in this.registrations) {
          return this.resolve(prop);
        }
        return undefined;
      },
      has: (_target: object, prop: string | symbol) => {
        return typeof prop === 'string' && prop in this.registrations;
      },
      ownKeys: () => []
    }) as any;
  }

  public resolve<T = any>(token: string): T {
    if (this.instances.has(token)) {
      return this.instances.get(token) as T;
    }

    let instance: unknown;
    switch (token) {
      case 'eventBus':
        instance = new EventBus({ loggerFactory: this.resolve('loggerFactory') });
        break;
      case 'windowService':
        instance = new WindowService(this.cradle);
        break;
      case 'trayService':
        instance = new TrayService(this.cradle);
        break;
      case 'ipcHandlerRegistry':
        instance = new IpcHandlerRegistry(this.cradle);
        break;
      case 'profileRegistry':
        instance = new DeviceProfileRegistry({ loggerFactory: this.resolve('loggerFactory') });
        break;
      case 'deviceService': {
        const profileClasses = new Map<string, ProfileClass>([
          [chromaticConfig.id, DeviceChromaticProfile]
        ]);
        instance = new DeviceService({
          profileRegistry: this.resolve('profileRegistry'),
          eventBus: this.resolve('eventBus'),
          loggerFactory: this.resolve('loggerFactory')
        }, profileClasses);
        break;
      }
      case 'deviceLifecycleService':
        instance = new DeviceLifecycleService(this.cradle);
        break;
      case 'updateService':
        instance = new UpdateService(this.cradle);
        break;
      case 'deviceBridgeService':
        instance = new DeviceBridgeService(this.cradle);
        break;
      case 'updateBridgeService':
        instance = new UpdateBridge(this.cradle);
        break;
      case 'transcodeService':
        instance = new TranscodeService(this.cradle);
        break;
      case 'loginItemService':
        instance = new LoginItemService(this.cradle);
        break;
      case 'appOrchestrator':
        instance = new AppOrchestrator(this);
        break;
      default:
        throw new Error(`[MainServiceContainer] Could not resolve token: ${token}`);
    }

    this.instances.set(token, instance);
    this.cache.set(token, { value: instance });
    return instance as T;
  }

  public async dispose(): Promise<void> {
    const logger = this.resolve<MainLogger>('loggerFactory').create('Container');
    for (const [token, instance] of this.instances.entries()) {
      if (!instance) continue;
      const method = typeof instance.dispose === 'function' ? 'dispose' : (typeof instance.cleanup === 'function' ? 'cleanup' : undefined);
      if (method) {
        await safeDispose(logger, token, instance, method);
      }
    }
    this.instances.clear();
    this.cache.clear();
  }
}

/**
 * Create and configure the static DI container
 * @param loggerFactory - Pre-configured MainLogger instance
 * @returns Configured static container instance
 */
export async function createAppContainer(loggerFactory: MainLogger): Promise<MainServiceContainer> {
  const containerLogger = loggerFactory.create('Container');
  containerLogger.info('Initializing dependency injection container');

  const container = new MainServiceContainer(loggerFactory);

  // Eagerly resolve and initialize DeviceService during container bootstrap
  const deviceService = container.resolve<DeviceService>('deviceService');
  await deviceService.initialize();

  const count = Object.keys(container.registrations).length;
  containerLogger.info(`Registered ${count} dependencies`);

  return container;
}
