import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { DeviceIntegrationService } from '@main/infrastructure/devices/device-integration.service.js';
import { createEventBus } from '../../../../factories/index.js';
import { createChromaticDeviceInfoPayload } from '../../../../devices/media.testkit';
import { createInjectableHarness } from '../../../../support/di/injectable.harness.js';

describe('DeviceIntegrationService', () => {
  let statusListener: ((status: unknown, reason: unknown) => void) | null;
  let checkErrorListener: ((error: unknown) => void) | null;
  let deviceConnectionService: {
    onStatusChanged: ReturnType<typeof vi.fn>;
    onCheckError: ReturnType<typeof vi.fn>;
  };
  let trayService: { updateTrayMenu: ReturnType<typeof vi.fn> };
  let windowService: {
    send: ReturnType<typeof vi.fn>;
    showWindow: ReturnType<typeof vi.fn>;
  };
  let eventBus: ReturnType<typeof createEventBus>;
  let service: DeviceIntegrationService;

  beforeEach(() => {
    statusListener = null;
    checkErrorListener = null;

    const h = createInjectableHarness(DeviceIntegrationService, {
      overrides: {
        deviceConnectionService: {
          onStatusChanged: vi.fn((listener) => {
            statusListener = listener;
            return vi.fn();
          }),
          onCheckError: vi.fn((listener) => {
            checkErrorListener = listener;
            return vi.fn();
          })
        },
        trayService: { updateTrayMenu: vi.fn() },
        windowService: { send: vi.fn(), showWindow: vi.fn() }
      }
    });
    service = h.subject;
    ({ deviceConnectionService, trayService, windowService, eventBus } = h.deps);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('subscribes to runtime status and check-error events once', () => {
    service.initialize();
    service.initialize();

    expect(deviceConnectionService.onStatusChanged).toHaveBeenCalledTimes(1);
    expect(deviceConnectionService.onCheckError).toHaveBeenCalledTimes(1);
  });

  it('maps connected runtime status to tray, event bus, IPC push, and delayed window launch', () => {
    vi.useFakeTimers();
    const publish = vi.spyOn(eventBus, 'publish');
    service.initialize();

    statusListener?.({
      state: 'connected',
      connected: true,
      device: createChromaticDeviceInfoPayload(),
      updatedAt: 1
    }, 'startup');

    expect(publish).toHaveBeenCalledWith('device:connection-changed', expect.objectContaining({ connected: true }));
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

  it('maps disconnected runtime status to tray, event bus, and disconnected IPC push', () => {
    const publish = vi.spyOn(eventBus, 'publish');
    service.initialize();

    statusListener?.({
      state: 'disconnected',
      connected: false,
      device: null,
      updatedAt: 1
    }, 'hotplug-remove');

    expect(publish).toHaveBeenCalledWith('device:connection-changed', expect.objectContaining({ connected: false }));
    expect(trayService.updateTrayMenu).toHaveBeenCalledTimes(1);
    expect(windowService.send).toHaveBeenCalledWith('device:disconnected');
  });

  it('forwards runtime check errors through the main event bus', () => {
    const publish = vi.spyOn(eventBus, 'publish');
    service.initialize();

    checkErrorListener?.({ reason: 'tray-refresh', error: 'scan failed' });

    expect(publish).toHaveBeenCalledWith('device:check-error', {
      reason: 'tray-refresh',
      error: 'scan failed'
    });
  });
});
