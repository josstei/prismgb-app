import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import pkg from '../../../package.json' assert { type: 'json' };
import { createApplicationLifecycle, disposeInOrder, type LoggerFactoryLike } from '@platform/core';
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

export interface MainRuntimeOptions {
  onRendererReady?: () => void;
}

/** Explicit process composition. Construction never starts hardware monitoring. */
export function createMainRuntime(loggerFactory: LoggerFactoryLike, options: MainRuntimeOptions = {}) {
  const logger = loggerFactory.create('MainRuntime');
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
  const lifecycle = createApplicationLifecycle(
    async () => {
      logger.info('Starting PrismGB...');
      // Subscribe to device changes before the first scan can publish them.
      deviceIntegrationService.initialize();
      await updateService.initialize();
      updateService.startAutoCheck();
      transcodeService.initialize();
      trayService.createTray();

      // Packaged macOS applications obtain their dock icon from the app bundle.
      if (process.platform === 'darwin' && !app.isPackaged) {
        const iconPath = [app.getAppPath(), process.cwd()]
          .map((root) => path.join(root, 'assets/icon.png'))
          .find((candidate) => fs.existsSync(candidate));
        if (iconPath) app.dock?.setIcon(iconPath);
        else logger.warn('Dock icon not found; continuing without custom dock icon');
      }

      ipcHandlerRegistry.registerHandlers();
      const hidden = loginItemService.wasLaunchedAsHidden();
      if (hidden) logger.info('Hidden launch detected - starting in system tray');
      ipcHandlerRegistry.attachWindow(windowService.createWindow({ hidden }));
      await deviceConnectionService.initialize();
      const status = await deviceConnectionService.reconcileDeviceStatus('startup');
      if (status.connected) logger.info('Device already connected');
      logger.info('PrismGB initialized successfully');
    },
    async () => {
      logger.info('Shutting down PrismGB...');
      await disposeInOrder([
        // Keep IPC and transcode alive until renderer-owned edits and captures are flushed.
        () => ipcHandlerRegistry.shutdownRenderer(),
        () => transcodeService.drain(),
        () => windowService.drainDownloads(),
        () => deviceConnectionService.dispose(),
        () => deviceIntegrationService.dispose(),
        () => updateService.dispose(),
        () => transcodeService.dispose(),
        () => ipcHandlerRegistry.dispose(),
        () => trayService.destroy(),
        () => windowService.dispose(),
        () => loginItemService.dispose(),
        () => ipcPushBridge.dispose()
      ]);
      logger.info('PrismGB shutdown complete');
    }
  );
  return { ...lifecycle, windowService };
}

export type MainRuntime = ReturnType<typeof createMainRuntime>;
