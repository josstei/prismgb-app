import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service.js';
import { createChromaticDeviceInfoPayload } from '../../../../devices/media.testkit';
import { createLoggerFactory } from '../../../../factories/index.js';
import type { DeviceConnectionService } from '@platform/devices/runtime';
type DeviceStatusListener = Parameters<DeviceConnectionService['onStatusChanged']>[0];
import type { TrayService } from '@main/infrastructure/tray/tray.service';
import type { WindowService } from '@main/infrastructure/window/window.service';

describe('DeviceIntegrationService', () => {
  let statusListener: DeviceStatusListener;
  const unsubscribe = vi.fn();
  const trayService = { updateTrayMenu: vi.fn() };
  const windowService = { showWindow: vi.fn() };
  const pushPublisher = { emit: vi.fn() };
  const onStatusChanged = vi.fn((listener: DeviceStatusListener) => { statusListener = listener; return unsubscribe; });
  let service: DeviceIntegrationService;

  beforeEach(() => {
    vi.useFakeTimers();
    service = new DeviceIntegrationService({
      deviceConnectionService: { onStatusChanged } as unknown as DeviceConnectionService,
      trayService: trayService as unknown as TrayService,
      windowService: windowService as unknown as WindowService,
      pushPublisher,
      loggerFactory: createLoggerFactory()
    });
  });
  afterEach(async () => { await service.dispose(); vi.useRealTimers(); });

  it('subscribes once and releases its subscription', async () => {
    service.initialize();
    service.initialize();
    expect(onStatusChanged).toHaveBeenCalledTimes(1);
    await service.dispose();
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('updates the tray and publishes a connected device before delayed window launch', () => {
    service.initialize();
    const device = createChromaticDeviceInfoPayload();
    statusListener({ state: 'connected', connected: true, device }, 'startup');
    expect(trayService.updateTrayMenu).toHaveBeenCalledOnce();
    expect(pushPublisher.emit).toHaveBeenCalledWith('device:connected', device);
    expect(windowService.showWindow).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(windowService.showWindow).toHaveBeenCalledOnce();
  });

  it('cancels the pending window launch on disconnect and publishes the transition', () => {
    service.initialize();
    statusListener({ state: 'connected', connected: true, device: createChromaticDeviceInfoPayload() }, 'hotplug-add');
    statusListener({ state: 'disconnected', connected: false, device: null }, 'hotplug-remove');
    expect(trayService.updateTrayMenu).toHaveBeenCalledTimes(2);
    expect(pushPublisher.emit).toHaveBeenLastCalledWith('device:disconnected');
    vi.runAllTimers();
    expect(windowService.showWindow).not.toHaveBeenCalled();
  });
});
