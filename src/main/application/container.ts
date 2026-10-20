import { Container } from 'inversify';
import pkg from '../../../package.json' assert { type: 'json' };
import { DeviceConnectionService } from '@platform/devices/runtime';
import { UpdateService } from '@platform/updates';
import { TranscodeService } from '@platform/transcode/service';
import type { MainLogger } from '@main/infrastructure/logging/logger.factory';
import { WindowService } from '@main/infrastructure/window/window.service';
import { TrayService } from '@main/infrastructure/tray/tray.service';
import { LoginItemService } from '@main/infrastructure/window/login-item.service';
import { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service';
import { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import { MainProcessTestControl } from '@main/ipc/test-control.port';
import { AppOrchestrator } from './app.orchestrator';
import { TOKENS } from './di/tokens';

export function createMainContainer(loggerFactory: MainLogger): Container {
  const container = new Container({ defaultScope: 'Singleton' });

  container.bind(TOKENS.config).toConstantValue({
    isDevelopment: process.env.NODE_ENV === 'development',
    appName: 'PrismGB',
    version: pkg.version
  });
  container.bind(TOKENS.loggerFactory).toConstantValue(loggerFactory);

  container.bind(TOKENS.deviceConnectionService).toDynamicValue((ctx) => new DeviceConnectionService({
    loggerFactory: ctx.get(TOKENS.loggerFactory)
  }));
  container.bind(TOKENS.updateService).toDynamicValue((ctx) => new UpdateService({
    windowService: ctx.get(TOKENS.windowService),
    loggerFactory: ctx.get(TOKENS.loggerFactory),
    config: ctx.get(TOKENS.config)
  }));
  container.bind(TOKENS.transcodeService).toDynamicValue((ctx) => new TranscodeService({
    windowService: ctx.get(TOKENS.windowService),
    loggerFactory: ctx.get(TOKENS.loggerFactory)
  }));
  container.bind(TOKENS.mainProcessTestControl).toDynamicValue((ctx) => new MainProcessTestControl({
    enabled: process.env.PRISMGB_E2E_TEST_CONTROL === '1',
    ipcPushBridge: ctx.get(TOKENS.ipcPushBridge)
  }));

  container.bind(TOKENS.windowService).to(WindowService);
  container.bind(TOKENS.trayService).to(TrayService);
  container.bind(TOKENS.ipcHandlerRegistry).to(IpcHandlerRegistry);
  container.bind(TOKENS.ipcPushBridge).to(IpcPushBridge);
  container.bind(TOKENS.deviceIntegrationService).to(DeviceIntegrationService);
  container.bind(TOKENS.loginItemService).to(LoginItemService);
  container.bind(TOKENS.appOrchestrator).to(AppOrchestrator);

  return container;
}
