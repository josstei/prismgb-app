import type { ServiceIdentifier } from 'inversify';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory';
import type { WindowService } from '@main/infrastructure/window/window.service';
import type { DeviceConnectionService } from '@main/infrastructure/devices/device-connection.service';
import type { UsbMonitor } from '@main/infrastructure/devices/usb.monitor';
import type { TrayService } from '@main/infrastructure/tray/tray.service';
import type { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry';
import type { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import type { MainProcessTestControl } from '@main/ipc/test-control.port';
import type { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service';
import type { AutoUpdateService } from '@main/infrastructure/updates/auto-update.service';
import type { TranscodeService } from '@main/infrastructure/transcode/transcode.service';
import type { LoginItemService } from '@main/infrastructure/system/login-item.service';
import type { AppOrchestrator } from '../app.orchestrator';

function token<T>(name: string): ServiceIdentifier<T> {
  return Symbol.for(name) as ServiceIdentifier<T>;
}

export const TOKENS = {
  loggerFactory: token<MainLogger>('loggerFactory'),
  windowService: token<WindowService>('windowService'),
  usbMonitor: token<UsbMonitor>('usbMonitor'),
  deviceConnectionService: token<DeviceConnectionService>('deviceConnectionService'),
  trayService: token<TrayService>('trayService'),
  ipcHandlerRegistry: token<IpcHandlerRegistry>('ipcHandlerRegistry'),
  ipcPushBridge: token<IpcPushBridge>('ipcPushBridge'),
  mainProcessTestControl: token<MainProcessTestControl>('mainProcessTestControl'),
  deviceIntegrationService: token<DeviceIntegrationService>('deviceIntegrationService'),
  autoUpdateService: token<AutoUpdateService>('autoUpdateService'),
  transcodeService: token<TranscodeService>('transcodeService'),
  loginItemService: token<LoginItemService>('loginItemService'),
  appOrchestrator: token<AppOrchestrator>('appOrchestrator')
} as const;
