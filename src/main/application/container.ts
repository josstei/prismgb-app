import { Container } from 'inversify';
import type { LoggerFactory } from '@platform/core';
import { WindowService } from '@main/infrastructure/window/window.service';
import { AutoUpdateService } from '@main/infrastructure/updates/auto-update.service';
import { TranscodeService } from '@main/infrastructure/transcode/transcode.service';
import { TrayService } from '@main/infrastructure/tray/tray.service';
import { LoginItemService } from '@main/infrastructure/system/login-item.service';
import { createNodeUsbMonitor } from '@main/infrastructure/devices/usb.monitor';
import { DeviceConnectionService } from '@main/infrastructure/devices/device-connection.service';
import { IpcHost } from '@main/ipc/ipc.host';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import { AppOrchestrator } from './app.orchestrator';
import { TOKENS } from './di/tokens';

export function createMainContainer(loggerFactory: LoggerFactory): Container {
  const container = new Container({ defaultScope: 'Singleton' });

  container.bind(TOKENS.loggerFactory).toConstantValue(loggerFactory);
  container.bind(TOKENS.usbMonitor).toDynamicValue(() => createNodeUsbMonitor());

  container.bind(TOKENS.windowService).to(WindowService);
  container.bind(TOKENS.deviceConnectionService).to(DeviceConnectionService);
  container.bind(TOKENS.trayService).to(TrayService);
  container.bind(TOKENS.autoUpdateService).to(AutoUpdateService);
  container.bind(TOKENS.transcodeService).to(TranscodeService);
  container.bind(TOKENS.ipcHost).to(IpcHost);
  container.bind(TOKENS.ipcPushBridge).to(IpcPushBridge);
  container.bind(TOKENS.loginItemService).to(LoginItemService);
  container.bind(TOKENS.appOrchestrator).to(AppOrchestrator);

  return container;
}
