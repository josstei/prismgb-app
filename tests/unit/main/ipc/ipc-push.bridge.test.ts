import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge.js';
import { createInjectableHarness } from '../../../support/di/injectable.harness.js';

describe('IpcPushBridge', () => {
  let bridge: IpcPushBridge;

  beforeEach(() => {
    bridge = createInjectableHarness(IpcPushBridge).subject;
  });

  it('delivers an emitted payload to a registered listener', () => {
    const listener = vi.fn();
    bridge.on('device:connected', listener);

    bridge.emit('device:connected', { vendorId: 1234 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ vendorId: 1234 });
  });

  it('delivers an undefined payload for void channels', () => {
    const listener = vi.fn();
    bridge.on('window:enter-fullscreen', listener);

    bridge.emit('window:enter-fullscreen');

    expect(listener).toHaveBeenCalledWith(undefined);
  });

  it('fans out to multiple listeners on the same channel', () => {
    const a = vi.fn();
    const b = vi.fn();
    bridge.on('transcode:progress', a);
    bridge.on('transcode:progress', b);

    bridge.emit('transcode:progress', { percent: 50 });

    expect(a).toHaveBeenCalledWith({ percent: 50 });
    expect(b).toHaveBeenCalledWith({ percent: 50 });
  });

  it('stops delivering after a listener is removed', () => {
    const listener = vi.fn();
    bridge.on('transcode:completed', listener);
    bridge.off('transcode:completed', listener);

    bridge.emit('transcode:completed', { jobId: 'j' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not cross-deliver between channels', () => {
    const listener = vi.fn();
    bridge.on('device:connected', listener);

    bridge.emit('device:disconnected', null);

    expect(listener).not.toHaveBeenCalled();
  });
});
