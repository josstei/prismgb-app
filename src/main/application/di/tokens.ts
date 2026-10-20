import type { ServiceIdentifier } from 'inversify';
import type { LoggerFactory } from '@platform/core';
import type { WindowService } from '@main/infrastructure/window/window.service';
import type { DeviceConnectionService } from '@main/infrastructure/devices/device-connection.service';
import type { UsbMonitor } from '@main/infrastructure/devices/usb.monitor';
import type { TrayService } from '@main/infrastructure/tray/tray.service';
import type { IpcHost } from '@main/ipc/ipc.host';
import type { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import type { AutoUpdateService } from '@main/infrastructure/updates/auto-update.service';
import type { TranscodeService } from '@main/infrastructure/transcode/transcode.service';
import type { LoginItemService } from '@main/infrastructure/system/login-item.service';
import type { AppOrchestrator } from '../app.orchestrator';

function token<T>(name: string): ServiceIdentifier<T> {
  return Symbol.for(name) as ServiceIdentifier<T>;
}

export const TOKENS = {
  loggerFactory: token<LoggerFactory>('loggerFactory'),
  windowService: token<WindowService>('windowService'),
  usbMonitor: token<UsbMonitor>('usbMonitor'),
  deviceConnectionService: token<DeviceConnectionService>('deviceConnectionService'),
  trayService: token<TrayService>('trayService'),
  ipcHost: token<IpcHost>('ipcHost'),
  ipcPushBridge: token<IpcPushBridge>('ipcPushBridge'),
  autoUpdateService: token<AutoUpdateService>('autoUpdateService'),
  transcodeService: token<TranscodeService>('transcodeService'),
  loginItemService: token<LoginItemService>('loginItemService'),
  appOrchestrator: token<AppOrchestrator>('appOrchestrator')
} as const;
