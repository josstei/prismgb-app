import type { EventBusLike, LoggerFactoryLike } from '@platform/core';
import type { ReadonlySignal } from '@platform/ui-base/reactive';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { PresentationModeStore } from '../../presentation/state/presentation-mode.store';
import { BrowserStorageAdapter } from '../../infrastructure/browser/browser-storage.adapter';
import { PROTECTED_STORAGE_KEYS } from '@renderer/lib/storage-keys.config.js';

import {
  BrowserMediaDevicesPort,
  StorageDevicePreferenceStore,
  TrpcDeviceStatusPort
} from '../../infrastructure/services/devices/device-platform.adapters';
import { UIComponentRegistry } from '../../presentation/controller/component.registry';
import { rendererUiComponentDefinitions } from '../../presentation/controller/ui-component.catalog';

/** Resolver handed to each provider so it can pull already-registered tokens. */
export type ResolveFn = <T = unknown>(token: string) => T;

/** Constructs an instance for a token whose wiring is not plain `new X(cradle)`. */
export type ManualProvider = (resolve: ResolveFn) => unknown;

/**
 * Tokens whose construction is non-standard (global access, provider/adapter
 * maps, `initialize()` calls, derived named loggers, or config/positional
 * constructor args) and therefore cannot be expressed as a plain `new X(cradle)`.
 * Standard-construction services are registered in `service-registrations.ts`.
 */
export const manualProviders: Record<string, ManualProvider> = {
  storageService: () =>
    new BrowserStorageAdapter({ protectedKeys: PROTECTED_STORAGE_KEYS }),

  deviceStatusPort: (resolve) =>
    new TrpcDeviceStatusPort(
      trpcClient,
      resolve<LoggerFactoryLike>('loggerFactory').create('TrpcDeviceStatusPort')
    ),

  mediaDevicesPort: (resolve) =>
    new BrowserMediaDevicesPort(
      resolve('browserMediaService'),
      resolve<LoggerFactoryLike>('loggerFactory').create('BrowserMediaDevicesPort')
    ),

  devicePreferenceStore: (resolve) =>
    new StorageDevicePreferenceStore(
      resolve('storageService'),
      resolve<LoggerFactoryLike>('loggerFactory').create('StorageDevicePreferenceStore')
    ),

  presentationModeStore: (resolve) =>
    new PresentationModeStore({
      eventBus: resolve<EventBusLike>('eventBus'),
      cinematicEnabled: resolve<{ cinematicModeSignal: ReadonlySignal<boolean> }>('appState').cinematicModeSignal
    }),



  uiComponentRegistry: (resolve) =>
    new UIComponentRegistry({
      componentDefinitions: rendererUiComponentDefinitions,
      loggerFactory: resolve('loggerFactory')
    })
};
