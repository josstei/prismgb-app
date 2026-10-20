import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service';
import { createChromaticDeviceInfoPayload } from '../../../../devices/media.testkit';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('DeviceIntegrationService', () => {
  let statusListener: ((status: unknown, reason: unknown) => void) | null;
  let deviceConnectionService: {
    onStatusChanged: ReturnType<typeof vi.fn>;
  };
  let trayService: { updateTrayMenu: ReturnType<typeof vi.fn> };
  let windowService: {
    send: ReturnType<typeof vi.fn>;
    showWindow: ReturnType<typeof vi.fn>;
  };
  let service: DeviceIntegrationService;

  beforeEach(() => {
    statusListener = null;

    const h = createInjectableHarness(DeviceIntegrationService, {
      overrides: {
        deviceConnectionService: {
          onStatusChanged: vi.fn((listener) => {
            statusListener = listener;
            return vi.fn();
          })
        },
        trayService: { updateTrayMenu: vi.fn() },
        windowService: { send: vi.fn(), showWindow: vi.fn() }
      }
    });
    service = h.subject;
    ({ deviceConnectionService, trayService, windowService } = h.deps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to runtime status events once', () => {
    service.initialize();
    service.initialize();

    expect(deviceConnectionService.onStatusChanged).toHaveBeenCalledTimes(1);
  });

  it('maps connected runtime status to tray, IPC push, and delayed window launch', () => {
    vi.useFakeTimers();
    service.initialize();

    statusListener?.({
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload(),
      updatedAt: 1
    }, 'startup');

    expect(trayService.updateTrayMenu).toHaveBeenCalledTimes(1);
    expect(windowService.send).toHaveBeenCalledWith(
      'device:connected',
      expect.objectContaining({
        id: createChromaticDeviceInfoPayload().id,
        name: createChromaticDeviceInfoPayload().name
      })
    );

    vi.advanceTimersByTime(500);
    expect(windowService.showWindow).toHaveBeenCalledTimes(1);
  });

  it('maps disconnected runtime status to tray and disconnected IPC push', () => {
    service.initialize();

    statusListener?.({
      state: 'disconnected',
      connected: false,
      device: null,
      updatedAt: 1
    }, 'hotplug-remove');

    expect(trayService.updateTrayMenu).toHaveBeenCalledTimes(1);
    expect(windowService.send).toHaveBeenCalledWith('device:disconnected');
  });
});
