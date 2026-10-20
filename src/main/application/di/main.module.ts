import { ContainerModule } from 'inversify';
import { DeviceConnectionService } from '@platform/devices/runtime';
import { UpdateService } from '@platform/updates';
import { TranscodeService } from '@platform/transcode/service';
import { WindowService } from '@main/infrastructure/window/window.service';
import { TrayService } from '@main/infrastructure/tray/tray.service';
import { IpcHandlerRegistry } from '@main/ipc/ipc-handler.registry';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import { MainProcessTestControl } from '@main/ipc/test-control.port';
import { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service';
import { LoginItemService } from '@main/infrastructure/window/login-item.service';
import { AppOrchestrator } from '../app.orchestrator';
import { TOKENS } from './tokens';

function isE2eTestControlEnabled(): boolean {
  return process.env.PRISMGB_E2E_TEST_CONTROL === '1';
}

/**
 * Binding module for every main-process token: main-owned decorated services
 * bind straight to their class; platform-owned classes (which must stay
 * inversify-free) and the env-flag-driven {@link MainProcessTestControl} bind
 * through factories that assemble their dependency objects explicitly.
 */
export const mainModule = new ContainerModule(({ bind }) => {
  bind(TOKENS.deviceConnectionService).toDynamicValue((ctx) => new DeviceConnectionService({
    loggerFactory: ctx.get(TOKENS.loggerFactory)
  })).inSingletonScope();

  bind(TOKENS.updateService).toDynamicValue((ctx) => new UpdateService({
    windowService: ctx.get(TOKENS.windowService),
    loggerFactory: ctx.get(TOKENS.loggerFactory),
    config: ctx.get(TOKENS.config)
  })).inSingletonScope();

  bind(TOKENS.transcodeService).toDynamicValue((ctx) => new TranscodeService({
    windowService: ctx.get(TOKENS.windowService),
    loggerFactory: ctx.get(TOKENS.loggerFactory)
  })).inSingletonScope();

  bind(TOKENS.mainProcessTestControl).toDynamicValue((ctx) => new MainProcessTestControl({
    enabled: isE2eTestControlEnabled(),
    ipcPushBridge: ctx.get(TOKENS.ipcPushBridge)
  })).inSingletonScope();

  bind(TOKENS.windowService).to(WindowService).inSingletonScope();
  bind(TOKENS.trayService).to(TrayService).inSingletonScope();
  bind(TOKENS.ipcHandlerRegistry).to(IpcHandlerRegistry).inSingletonScope();
  bind(TOKENS.ipcPushBridge).to(IpcPushBridge).inSingletonScope();
  bind(TOKENS.deviceIntegrationService).to(DeviceIntegrationService).inSingletonScope();
  bind(TOKENS.loginItemService).to(LoginItemService).inSingletonScope();
  bind(TOKENS.appOrchestrator).to(AppOrchestrator).inSingletonScope();
});
