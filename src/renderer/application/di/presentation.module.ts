import { ContainerModule } from 'inversify';
import { NotesService } from '@platform/notes';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { PROTECTED_STORAGE_KEYS } from '@renderer/lib/storage-keys.config.js';
import { BodyClassManager } from '../../presentation/effects/body-class.class';
import { CaptureUIBridge } from '../../presentation/bridges/capture-ui.bridge';
import { TranscodeUIBridge } from '../../presentation/bridges/transcode-ui.bridge';
import { UIEventBridge } from '../../presentation/bridges/ui-event.bridge';
import { UIEffects } from '../../presentation/effects/ui-effects.class';
import { AppState } from '../state/app-state';
import { PresentationModeStore } from '../../presentation/state/presentation-mode.store';
import { UIComponentRegistry } from '../../presentation/controller/component.registry';
import { rendererUiComponentDefinitions } from '../../presentation/controller/ui-component.catalog';
import { BrowserStorageAdapter } from '../../infrastructure/browser/browser-storage.adapter';
import {
  BrowserMediaDevicesPort,
  StorageDevicePreferenceStore,
  TrpcDeviceStatusPort
} from '../../infrastructure/services/devices/device-platform.adapters';
import { TOKENS } from './tokens.js';

/**
 * Binding module for every renderer presentation-layer token: decorated
 * bridges/effects bind straight to their class; the non-standard-construction
 * tokens (platform storage/device ports, the UI component registry) and the
 * non-decorated platform-adjacent classes (`NotesService`, `AppState`,
 * `UIEffects`) bind through factories that mirror their prior cradle wiring.
 */
export const presentationModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.bodyClassManager).to(BodyClassManager).inSingletonScope();
  bind(TOKENS.captureUiBridge).to(CaptureUIBridge).inSingletonScope();
  bind(TOKENS.transcodeUiBridge).to(TranscodeUIBridge).inSingletonScope();
  bind(TOKENS.uiEventBridge).to(UIEventBridge).inSingletonScope();

  bind(TOKENS.storageService).toDynamicValue(() =>
    new BrowserStorageAdapter({ protectedKeys: PROTECTED_STORAGE_KEYS })
  ).inSingletonScope();

  bind(TOKENS.deviceStatusPort).toDynamicValue((ctx) =>
    new TrpcDeviceStatusPort(
      trpcClient,
      ctx.get(TOKENS.loggerFactory).create('TrpcDeviceStatusPort')
    )
  ).inSingletonScope();

  bind(TOKENS.mediaDevicesPort).toDynamicValue((ctx) =>
    new BrowserMediaDevicesPort(
      ctx.get(TOKENS.browserMediaService),
      ctx.get(TOKENS.loggerFactory).create('BrowserMediaDevicesPort')
    )
  ).inSingletonScope();

  bind(TOKENS.devicePreferenceStore).toDynamicValue((ctx) =>
    new StorageDevicePreferenceStore(
      ctx.get(TOKENS.storageService),
      ctx.get(TOKENS.loggerFactory).create('StorageDevicePreferenceStore')
    )
  ).inSingletonScope();

  bind(TOKENS.presentationModeStore).toDynamicValue((ctx) =>
    new PresentationModeStore({
      eventBus: ctx.get(TOKENS.eventBus),
      cinematicEnabled: ctx.get(TOKENS.appState).cinematicModeSignal
    })
  ).inSingletonScope();

  bind(TOKENS.uiComponentRegistry).toDynamicValue((ctx) =>
    new UIComponentRegistry({
      componentDefinitions: rendererUiComponentDefinitions,
      loggerFactory: ctx.get(TOKENS.loggerFactory)
    })
  ).inSingletonScope();

  bind(TOKENS.notesService).toDynamicValue((ctx) => new NotesService({
    eventBus: ctx.get(TOKENS.eventBus),
    storageService: ctx.get(TOKENS.storageService),
    loggerFactory: ctx.get(TOKENS.loggerFactory)
  })).inSingletonScope();

  bind(TOKENS.appState).toDynamicValue((ctx) => new AppState({
    streamingService: ctx.get(TOKENS.streamingService),
    rendererDeviceRuntime: ctx.get(TOKENS.rendererDeviceRuntime),
    eventBus: ctx.get(TOKENS.eventBus)
  })).inSingletonScope();

  bind(TOKENS.uiEffects).toDynamicValue((ctx) => new UIEffects({
    bodyClassManager: ctx.get(TOKENS.bodyClassManager)
  })).inSingletonScope();
});
