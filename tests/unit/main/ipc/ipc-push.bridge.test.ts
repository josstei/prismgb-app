import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IpcPushBridge } from '@main/ipc/ipc-push.bridge';
import { createLoggerFactory } from '../../../factories/index.js';

describe('IpcPushBridge', () => {
  let loggerFactory: ReturnType<typeof createLoggerFactory>;
  let bridge: IpcPushBridge;

  beforeEach(() => {
    loggerFactory = createLoggerFactory();
    bridge = new IpcPushBridge(loggerFactory);
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

  it('isolates a throwing listener and still delivers to the others', () => {
    const after = vi.fn();
    bridge.on('update:error', () => {
      throw new Error('renderer gone');
    });
    bridge.on('update:error', after);

    expect(() => bridge.emit('update:error', { message: 'boom' })).not.toThrow();

    expect(after).toHaveBeenCalledWith({ message: 'boom' });
    expect(loggerFactory._getLogger('IpcPushBridge').warn).toHaveBeenCalledWith(
      'Failed to deliver push',
      { channel: 'update:error', error: 'renderer gone' }
    );
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
