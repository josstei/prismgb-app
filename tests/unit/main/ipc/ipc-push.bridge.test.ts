import { describe, it, expect, vi } from 'vitest';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge.js';

describe('IpcPushBridge', () => {
  it('delivers an emitted payload to a registered listener', () => {
    const bridge = new IpcPushBridge();
    const listener = vi.fn();
    bridge.on('device:connected', listener);

    bridge.emit('device:connected', { vendorId: 1234 });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({ vendorId: 1234 });
  });

  it('delivers an undefined payload for void channels', () => {
    const bridge = new IpcPushBridge();
    const listener = vi.fn();
    bridge.on('window:enter-fullscreen', listener);

    bridge.emit('window:enter-fullscreen');

    expect(listener).toHaveBeenCalledWith(undefined);
  });

  it('fans out to multiple listeners on the same channel', () => {
    const bridge = new IpcPushBridge();
    const a = vi.fn();
    const b = vi.fn();
    bridge.on('transcode:progress', a);
    bridge.on('transcode:progress', b);

    bridge.emit('transcode:progress', { percent: 50 });

    expect(a).toHaveBeenCalledWith({ percent: 50 });
    expect(b).toHaveBeenCalledWith({ percent: 50 });
  });

  it('stops delivering after a listener is removed', () => {
    const bridge = new IpcPushBridge();
    const listener = vi.fn();
    bridge.on('transcode:completed', listener);
    bridge.off('transcode:completed', listener);

    bridge.emit('transcode:completed', { jobId: 'j' });

    expect(listener).not.toHaveBeenCalled();
  });

  it('does not cross-deliver between channels', () => {
    const bridge = new IpcPushBridge();
    const listener = vi.fn();
    bridge.on('device:connected', listener);

    bridge.emit('device:disconnected', null);

    expect(listener).not.toHaveBeenCalled();
  });
});
