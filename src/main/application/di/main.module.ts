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
  }));

  bind(TOKENS.updateService).toDynamicValue((ctx) => new UpdateService({
    windowService: ctx.get(TOKENS.windowService),
    loggerFactory: ctx.get(TOKENS.loggerFactory),
    config: ctx.get(TOKENS.config)
  }));

  bind(TOKENS.transcodeService).toDynamicValue((ctx) => new TranscodeService({
    windowService: ctx.get(TOKENS.windowService),
    loggerFactory: ctx.get(TOKENS.loggerFactory)
  }));

  bind(TOKENS.mainProcessTestControl).toDynamicValue((ctx) => new MainProcessTestControl({
    enabled: isE2eTestControlEnabled(),
    ipcPushBridge: ctx.get(TOKENS.ipcPushBridge)
  }));

  bind(TOKENS.windowService).to(WindowService);
  bind(TOKENS.trayService).to(TrayService);
  bind(TOKENS.ipcHandlerRegistry).to(IpcHandlerRegistry);
  bind(TOKENS.ipcPushBridge).to(IpcPushBridge);
  bind(TOKENS.deviceIntegrationService).to(DeviceIntegrationService);
  bind(TOKENS.loginItemService).to(LoginItemService);
  bind(TOKENS.appOrchestrator).to(AppOrchestrator);
});
