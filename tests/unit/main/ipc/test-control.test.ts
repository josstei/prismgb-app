import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return { ipcMain: new EventEmitter() };
});

import { ipcMain } from 'electron';
import { installTestControl, TEST_CONTROL_CHANNELS } from '@main/ipc/test-control';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import { createLoggerFactory } from '../../../factories/index.js';
import { createChromaticDeviceStatusPayload } from '../../../devices/media.testkit';

describe('installTestControl', () => {
  let bridge: IpcPushBridge;

  beforeEach(() => {
    bridge = new IpcPushBridge(createLoggerFactory());
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    ipcMain.removeAllListeners();
  });

  it('keeps the channel strings the E2E device helper emits on', () => {
    expect(TEST_CONTROL_CHANNELS).toEqual({
      SET_DEVICE_STATUS: 'prismgb:test-control:set-device-status',
      CLEAR_DEVICE_STATUS: 'prismgb:test-control:clear-device-status',
      EMIT_PUSH: 'prismgb:test-control:emit-push'
    });
  });

  it('installs nothing unless PRISMGB_E2E_TEST_CONTROL is 1', () => {
    vi.stubEnv('PRISMGB_E2E_TEST_CONTROL', '');

    expect(installTestControl(bridge)).toBeNull();
    for (const channel of Object.values(TEST_CONTROL_CHANNELS)) {
      expect(ipcMain.listenerCount(channel)).toBe(0);
    }
  });

  describe('when enabled', () => {
    beforeEach(() => {
      vi.stubEnv('PRISMGB_E2E_TEST_CONTROL', '1');
    });

    it('stores and clears the device status override', () => {
      const testControl = installTestControl(bridge)!;
      const status = createChromaticDeviceStatusPayload(true);

      expect(testControl.deviceStatusOverride).toBeNull();
      ipcMain.emit(TEST_CONTROL_CHANNELS.SET_DEVICE_STATUS, {}, status);
      expect(testControl.deviceStatusOverride).toBe(status);
      ipcMain.emit(TEST_CONTROL_CHANNELS.CLEAR_DEVICE_STATUS, {});
      expect(testControl.deviceStatusOverride).toBeNull();
    });

    it('forwards EMIT_PUSH to the push bridge', () => {
      installTestControl(bridge);
      const listener = vi.fn();
      bridge.on('device:connected', listener);

      ipcMain.emit(TEST_CONTROL_CHANNELS.EMIT_PUSH, {}, { channel: 'device:connected', data: { id: 'chromatic' } });

      expect(listener).toHaveBeenCalledWith({ id: 'chromatic' });
    });

    it('removes its listeners on dispose', () => {
      const testControl = installTestControl(bridge)!;
      for (const channel of Object.values(TEST_CONTROL_CHANNELS)) {
        expect(ipcMain.listenerCount(channel)).toBe(1);
      }

      testControl.dispose();

      for (const channel of Object.values(TEST_CONTROL_CHANNELS)) {
        expect(ipcMain.listenerCount(channel)).toBe(0);
      }
    });
  });
});
