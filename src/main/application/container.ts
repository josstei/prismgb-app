import { app } from 'electron';
import pkg from '../../../package.json' assert { type: 'json' };
import { createApplicationLifecycle, disposeInOrder } from '@platform/core';
import { DeviceConnectionService } from '@platform/devices/runtime';
import { UpdateService } from '@platform/updates';
import { TranscodeService } from '@platform/transcode/service';
import { WindowService } from '@main/infrastructure/window/window.service.js';
import { TrayService } from '@main/infrastructure/tray/tray.service.js';
import { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry.js';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge.js';
import { MainProcessTestControl } from '@main/ipc/test-control.port.js';
import { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service.js';
import { LoginItemService } from '@main/infrastructure/window/login-item.service.js';
import { AppOrchestrator } from './app.orchestrator.js';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory.js';

export interface MainRuntimeOptions {
  onRendererReady?: () => void;
}

/** Explicit process composition. Construction never starts hardware monitoring. */
export function createMainRuntime(loggerFactory: MainLogger, options: MainRuntimeOptions = {}) {
  const ipcPushBridge = new IpcPushBridge();
  const windowService = new WindowService({ ipcPushBridge, loggerFactory });
  const deviceConnectionService = new DeviceConnectionService({ loggerFactory });
  const trayService = new TrayService({ windowService, deviceConnectionService, loggerFactory });
  const loginItemService = new LoginItemService({ loggerFactory });
  const updateService = new UpdateService({
    pushPublisher: ipcPushBridge,
    prepareInstall: () => { app.isQuitting = true; },
    loggerFactory,
    config: { isDevelopment: process.env.NODE_ENV === 'development', version: pkg.version }
  });
  const transcodeService = new TranscodeService({
    pushPublisher: ipcPushBridge,
    loggerFactory,
    environment: {
      downloadsDir: app.getPath('downloads'),
      tempDir: app.getPath('temp'),
      isPackaged: app.isPackaged,
      resourcesPath: process.resourcesPath
    }
  });
  const mainProcessTestControl = new MainProcessTestControl({
    enabled: process.env.PRISMGB_E2E_TEST_CONTROL === '1', ipcPushBridge
  });
  const deviceIntegrationService = new DeviceIntegrationService({
    deviceConnectionService, trayService, windowService, pushPublisher: ipcPushBridge, loggerFactory
  });
  const ipcHandlerRegistry = new IpcHandlerRegistry({
    deviceConnectionService, mainProcessTestControl, updateService, windowService,
    transcodeService, loginItemService, ipcPushBridge, loggerFactory,
    onRendererReady: options.onRendererReady ?? (() => {})
  });
  const appOrchestrator = new AppOrchestrator({
    windowService, deviceConnectionService, deviceIntegrationService, trayService,
    ipcHandlerRegistry, updateService, transcodeService, loginItemService, loggerFactory
  });
  const lifecycle = createApplicationLifecycle(
    () => appOrchestrator.initialize(),
    () => disposeInOrder([
      // Keep IPC and transcode alive until renderer-owned edits and captures are flushed.
      async () => {
        await ipcHandlerRegistry.shutdownRenderer();
        await disposeInOrder([
          () => transcodeService.drain(),
          () => windowService.drainDownloads()
        ]);
      },
      () => appOrchestrator.cleanup(),
      () => windowService.dispose(),
      () => loginItemService.dispose(),
      () => ipcPushBridge.dispose()
    ])
  );
  return { ...lifecycle, windowService };
}

export type MainRuntime = ReturnType<typeof createMainRuntime>;
