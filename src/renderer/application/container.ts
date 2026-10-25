import { ConsoleLoggerFactory } from '@platform/core';
import { PlatformEventBus } from '@platform/events';
import { RendererDeviceRuntime } from '../infrastructure/services/devices/device-runtime.service';
import { DeviceMediaAcquirer } from '../infrastructure/services/streaming/device-media-acquirer.service';
import { StreamingService } from '../infrastructure/services/streaming/streaming.service';
import { StreamingViewService } from '../infrastructure/services/streaming/streaming-view.service';
import { StreamingRenderService } from '../infrastructure/services/streaming/streaming-render.service';
import { CaptureGpuRecordingService } from '../infrastructure/services/gpu/gpu-recording.service';
import { SettingsService } from '../infrastructure/services/settings/settings.service';
import { StreamingAudioPipelineService } from '../infrastructure/services/streaming/audio-pipeline.service';
import { CaptureService } from '../infrastructure/services/capture/capture.service';
import { TranscodeService } from '../infrastructure/services/transcode/transcode.service';
import { CaptureSaveService } from '../infrastructure/services/capture/capture-save.service';
import { SettingsFullscreenService } from '../infrastructure/services/settings/settings-fullscreen.service';
import { SettingsCinematicModeService } from '../infrastructure/services/settings/settings-cinematic-mode.service';
import { UpdateService } from '../infrastructure/services/updates/update.service';
import { UpdateUiService } from '../infrastructure/services/updates/update-ui.service';
import { VisibilityAdapter } from '../infrastructure/adapters/visibility.adapter';
import { UserActivityAdapter } from '../infrastructure/adapters/user-activity.adapter';
import { ReducedMotionAdapter } from '../infrastructure/adapters/reduced-motion.adapter';
import { PerformanceStateService } from '../infrastructure/services/performance/performance-state.service';
import { BrowserMediaAdapter } from '../infrastructure/adapters/browser-media.adapter';
import { StreamingHealthService } from '../infrastructure/services/platform/health.service';
import { StreamingViewportService } from '../infrastructure/services/platform/viewport.service';
import { StreamingOrchestrator } from './orchestrators/streaming.orchestrator';
import { StreamingAudioOrchestrator } from './orchestrators/streaming-audio.orchestrator';
import { CaptureOrchestrator } from './orchestrators/capture.orchestrator';
import { SettingsDisplayModeOrchestrator } from './orchestrators/display-mode.orchestrator';
import { UISetupOrchestrator } from './orchestrators/ui-setup.orchestrator';
import { PerformanceStateOrchestrator } from './orchestrators/performance/performance-state.orchestrator';
import { AppOrchestrator } from './orchestrators/app.orchestrator';
import { NotesService } from '@platform/notes';
import { trpcClient } from '@renderer/infrastructure/ipc/trpc-client';
import { downloadFile as downloadBlobFile } from '@renderer/lib/file-download.utils.js';
import { PROTECTED_STORAGE_KEYS } from '@renderer/lib/storage-keys.config.js';
import { BodyClassManager } from '../presentation/effects/body-class.effect';
import { CaptureUIBridge } from '../presentation/bridges/capture-ui.bridge';
import { TranscodeUIBridge } from '../presentation/bridges/transcode-ui.bridge';
import { UIEventBridge } from '../presentation/bridges/ui-event.bridge';
import { UIEffects } from '../presentation/effects/ui-effects.host';
import { AppState } from './state/app-state';
import { PresentationModeStore } from '../presentation/state/presentation-mode.store';
import { createDomBindings } from '../presentation/primitives/dom-bindings.utils';
import { createTemplateComponentElements } from '../presentation/primitives/template-dom.contract';
import { StatusNotificationComponent } from '../presentation/shared/status-notification.component';
import { StatusNotificationStore } from '../presentation/state/status-notification.store';
import { DeviceStatusComponent } from '../presentation/shared/device-status.component';
import { DeviceStatusStore } from '../presentation/state/device-status.store';
import { StreamingControlsComponent } from '../presentation/features/streaming/streaming-controls.component';
import { StreamInfoStore } from '../presentation/state/stream-info.store';
import { TranscodeToastComponent } from '../presentation/features/transcode/transcode-toast.component';
import { TranscodeProgressStore } from '../presentation/state/transcode-progress.store';
import { SettingsMenuComponent } from '../presentation/features/settings/settings-menu.component';
import { UpdateSectionComponent } from '../presentation/features/updates/update-section.component';
import { ShaderSelectorComponent } from '../presentation/features/toolbar/shader-selector.component';
import { NotesPanelComponent } from '../presentation/features/notes/notes-panel.component';
import { BrowserStorageAdapter } from '../infrastructure/adapters/browser-storage.adapter';
import { BrowserMediaDevicesPort } from '../infrastructure/services/devices/browser-media-devices.port';
import { StorageDevicePreferenceStore } from '../infrastructure/services/devices/storage-device-preference.store';
import { TrpcDeviceStatusPort } from '../infrastructure/services/devices/trpc-device-status.port';
import { createApplicationLifecycle, disposeInOrder, type LoggerFactoryLike, type StorageServiceLike } from '@platform/core';
import { StreamingCanvasLifecycleService } from '../infrastructure/services/streaming/canvas-lifecycle.service.js';
import { UiComponentHost, type RendererUiComponentInstanceMap } from '../presentation/controller/ui-component.host.js';
import { RendererTemplateCoreComponentIds } from '../presentation/primitives/template-dom.contract.js';
import { UIController } from '../presentation/controller/ui.controller.js';

export interface RendererRuntimeOptions {
  loggerFactory?: LoggerFactoryLike;
  storageService?: StorageServiceLike;
  deviceStatusPort?: ConstructorParameters<typeof RendererDeviceRuntime>[0]['deviceStatusPort'];
  mediaDevicesPort?: ConstructorParameters<typeof RendererDeviceRuntime>[0]['mediaDevicesPort'];
  devicePreferenceStore?: ConstructorParameters<typeof RendererDeviceRuntime>[0]['devicePreferenceStore'];
}

/** Process-local typed composition; component factories preserve deferred UI construction. */
export function createRendererRuntime(options: RendererRuntimeOptions = {}) {
  const downloadFile = (blob: Blob, filename: string) => downloadBlobFile(blob, filename, {
    expect: (url) => trpcClient.window.expectDownload.mutate({ url }),
    cancel: (url) => trpcClient.window.cancelDownload.mutate({ url })
  });
  const loggerFactory = options.loggerFactory ?? new ConsoleLoggerFactory();
  const eventBus = new PlatformEventBus({ loggerFactory });
  const storageService = options.storageService ?? new BrowserStorageAdapter({ protectedKeys: PROTECTED_STORAGE_KEYS });
  const browserMediaService = new BrowserMediaAdapter();
  const deviceStatusPort = options.deviceStatusPort ?? new TrpcDeviceStatusPort(trpcClient, loggerFactory.create('TrpcDeviceStatusPort'));
  const mediaDevicesPort = options.mediaDevicesPort ?? new BrowserMediaDevicesPort(browserMediaService, loggerFactory.create('BrowserMediaDevicesPort'));
  const devicePreferenceStore = options.devicePreferenceStore ?? new StorageDevicePreferenceStore(storageService, loggerFactory.create('StorageDevicePreferenceStore'));
  const rendererDeviceRuntime = new RendererDeviceRuntime({ deviceStatusPort, mediaDevicesPort, devicePreferenceStore, eventBus, loggerFactory });
  const deviceMediaAcquirer = new DeviceMediaAcquirer({ mediaDevicesPort, loggerFactory });
  const streamingService = new StreamingService({ rendererDeviceRuntime, deviceMediaAcquirer, eventBus, loggerFactory });
  const appState = new AppState({ streamingService, rendererDeviceRuntime, eventBus });
  const settingsService = new SettingsService({ eventBus, loggerFactory, storageService });
  const updateService = new UpdateService({ eventBus, loggerFactory });
  const updateUiService = new UpdateUiService({ eventBus, loggerFactory });
  const notesService = new NotesService({ eventBus, storageService, loggerFactory });
  const presentationModeStore = new PresentationModeStore({ eventBus, cinematicEnabled: appState.cinematicModeSignal });
  const bodyClassManager = new BodyClassManager();
  const domBindings = createDomBindings(document);
  const uiEffects = new UIEffects({ bodyClassManager });
  const uiComponentHost = new UiComponentHost<RendererUiComponentInstanceMap>({
    statusNotificationComponent: () => new StatusNotificationComponent({
      elements: createTemplateComponentElements('statusNotificationComponent', domBindings),
      store: new StatusNotificationStore({ eventBus })
    }),
    deviceStatusComponent: () => new DeviceStatusComponent({
      elements: createTemplateComponentElements('deviceStatusComponent', domBindings),
      store: new DeviceStatusStore({ eventBus, deviceConnectedSignal: appState.deviceConnectedSignal })
    }),
    streamControlsComponent: () => new StreamingControlsComponent({
      elements: createTemplateComponentElements('streamControlsComponent', domBindings),
      bodyClassManager, store: new StreamInfoStore({ eventBus })
    }),
    transcodeToastComponent: () => new TranscodeToastComponent({
      elements: createTemplateComponentElements('transcodeToastComponent', domBindings),
      store: new TranscodeProgressStore({ eventBus })
    }),
    settingsMenuComponent: (own) => {
      const component = own(new SettingsMenuComponent({
        settingsService,
        updateSectionComponent: new UpdateSectionComponent({ updateService, eventBus, loggerFactory }),
        logger: loggerFactory.create('SettingsMenuComponent')
      }));
      component.initialize(createTemplateComponentElements('settingsMenuComponent', domBindings));
      return component;
    },
    shaderSelectorComponent: (own) => {
      const component = own(new ShaderSelectorComponent({ settingsService, appState, eventBus, logger: loggerFactory.create('ShaderSelectorComponent') }));
      component.initialize(createTemplateComponentElements('shaderSelectorComponent', domBindings));
      return component;
    },
    notesPanelComponent: (own) => {
      const component = own(new NotesPanelComponent({ notesService, eventBus, logger: loggerFactory.create('NotesPanelComponent') }));
      component.initialize(createTemplateComponentElements('notesPanelComponent', domBindings));
      return component;
    }
  }, RendererTemplateCoreComponentIds, loggerFactory);
  const uiController = new UIController({ downloadFile, uiComponentHost, domBindings, uiEffects, loggerFactory });
  const streamViewService = new StreamingViewService({ uiController, loggerFactory });
  const viewportService = new StreamingViewportService({ loggerFactory });
  const canvasLifecycleService = new StreamingCanvasLifecycleService({ streamViewService, viewportService, eventBus, loggerFactory });
  const streamHealthService = new StreamingHealthService({ loggerFactory });
  const streamingRenderService = new StreamingRenderService({ appState, streamViewService, canvasLifecycleService, streamHealthService, settingsService, eventBus, loggerFactory });
  const gpuRecordingService = new CaptureGpuRecordingService({ streamingRenderService, eventBus, loggerFactory });
  const streamingAudioPipelineService = new StreamingAudioPipelineService({ eventBus, loggerFactory, settingsService });
  const captureService = new CaptureService({ eventBus, loggerFactory });
  const transcodeService = new TranscodeService({ eventBus, loggerFactory });
  const captureSaveService = new CaptureSaveService({ downloadFile, eventBus, settingsService, transcodeService, loggerFactory });
  const fullscreenService = new SettingsFullscreenService({ eventBus, loggerFactory });
  const cinematicModeService = new SettingsCinematicModeService({ appState, eventBus, loggerFactory });
  const performanceStateService = new PerformanceStateService({ loggerFactory, visibilityAdapter: new VisibilityAdapter(), userActivityAdapter: new UserActivityAdapter(), reducedMotionAdapter: new ReducedMotionAdapter() });
  const streamingOrchestrator = new StreamingOrchestrator({ streamingService, appState, streamViewService, streamingRenderService, gpuRecordingService, settingsService, eventBus, loggerFactory });
  const streamingAudioOrchestrator = new StreamingAudioOrchestrator({ streamingAudioPipelineService, streamViewService, appState, eventBus, loggerFactory });
  const captureOrchestrator = new CaptureOrchestrator({ captureService, appState, streamViewService, streamingRenderService, gpuRecordingService, transcodeService, captureSaveService, eventBus, loggerFactory });
  const displayModeOrchestrator = new SettingsDisplayModeOrchestrator({ fullscreenService, cinematicModeService, settingsService, eventBus, loggerFactory });
  const uiSetupOrchestrator = new UISetupOrchestrator({ appState, uiController, eventBus, loggerFactory });
  const performanceStateOrchestrator = new PerformanceStateOrchestrator({ eventBus, performanceStateService, loggerFactory });
  const uiEventBridge = new UIEventBridge({ eventBus, uiController, loggerFactory });
  const captureUiBridge = new CaptureUIBridge({ eventBus, uiController, loggerFactory });
  const transcodeUiBridge = new TranscodeUIBridge({ eventBus, loggerFactory });
  const appOrchestrator = new AppOrchestrator({ rendererDeviceRuntime, streamingOrchestrator, streamingAudioOrchestrator, captureOrchestrator, displayModeOrchestrator, settingsService, updateService, updateUiService, uiSetupOrchestrator, performanceStateOrchestrator, eventBus, loggerFactory });

  const lifecycle = createApplicationLifecycle(async () => {
    bodyClassManager.bindPresentationMode(presentationModeStore);
    bodyClassManager.bindPerformanceState(eventBus);
    uiEffects.setElements(uiController.elements);
    uiController.initializeComponents();
    uiEventBridge.initialize();
    captureUiBridge.initialize();
    transcodeUiBridge.initialize();
    transcodeService.initialize();
    await appOrchestrator.initialize();
  }, () => disposeInOrder([
    () => appOrchestrator.cleanup(),
    () => streamingAudioPipelineService.dispose(),
    () => streamingRenderService.dispose(),
    () => captureService.dispose(),
    () => gpuRecordingService.dispose(),
    () => captureSaveService.dispose(),
    () => transcodeService.dispose(),
    () => updateService.dispose(),
    () => updateUiService.dispose(),
    () => settingsService.dispose(),
    () => uiEventBridge.dispose(),
    () => captureUiBridge.dispose(),
    () => transcodeUiBridge.dispose(),
    // UI disposal flushes pending note edits before the note service and event bus are released.
    () => uiController.dispose(),
    () => notesService.dispose(),
    () => bodyClassManager.dispose(),
    () => presentationModeStore.dispose(),
    () => appState.dispose(),
    () => streamViewService.dispose(),
    () => deviceMediaAcquirer.dispose(),
    () => streamingService.dispose()
  ]));
  let starting: Promise<void> | null = null;
  let stopping: Promise<void> | null = null;
  let closing = false;
  return {
    initialize: lifecycle.initialize,
    start(): Promise<void> {
      if (closing) return Promise.reject(new Error('Runtime has been disposed'));
      return starting ??= lifecycle.initialize().then(() => appOrchestrator.start()).catch(async (error: unknown) => {
        closing = true;
        try { await lifecycle.dispose(); } catch { /* Keep the startup error. */ }
        throw error;
      });
    },
    dispose(): Promise<void> {
      closing = true;
      return stopping ??= (async () => {
        try { await starting; } catch { /* Startup already rolled back. */ }
        await lifecycle.dispose();
      })();
    },
    uiComponentHost,
    eventBus
  };
}

export type RendererRuntime = ReturnType<typeof createRendererRuntime>;
