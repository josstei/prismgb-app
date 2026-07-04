import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  headlessElectronEnv,
  terminateProcessTree,
  waitForProcessClose
} from '../../../scripts/lib/process-runner.js';

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.pid = 4242;
    this.kill = vi.fn(() => {
      setImmediate(() => this.emit('close', null, 'SIGTERM'));
      return true;
    });
  }
}

describe('headlessElectronEnv', () => {
  it('overlays the headless electron flags on the base environment', () => {
    expect(headlessElectronEnv({ PATH: '/usr/bin' })).toEqual({
      PATH: '/usr/bin',
      ELECTRON_DISABLE_GPU: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1'
    });
  });
});

describe('waitForProcessClose', () => {
  it('resolves with the close code and signal', async () => {
    const child = new FakeChildProcess();
    const pending = waitForProcessClose(child, 1000);
    child.emit('close', 0, null);
    await expect(pending).resolves.toEqual({ closed: true, code: 0, signal: null });
  });

  it('resolves with a timeout marker when the process stays open', async () => {
    const child = new FakeChildProcess();
    await expect(waitForProcessClose(child, 10)).resolves.toEqual({
      closed: false,
      code: null,
      signal: 'timeout'
    });
  });
});

describe('terminateProcessTree', () => {
  it('signals the process group when configured', async () => {
    const child = new FakeChildProcess();
    const signalGroup = vi.fn(() => {
      setImmediate(() => child.emit('close', null, 'SIGTERM'));
    });
    await terminateProcessTree(child, { gracefulMs: 100, killProcessGroup: true, platform: 'linux', signalGroup });
    expect(signalGroup).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('terminates the child directly by default', async () => {
    const child = new FakeChildProcess();
    await terminateProcessTree(child, { gracefulMs: 100, platform: 'linux' });
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('uses taskkill on windows', async () => {
    const child = new FakeChildProcess();
    const execCommand = vi.fn(() => {
      setImmediate(() => child.emit('close', null, null));
    });
    await terminateProcessTree(child, { gracefulMs: 100, platform: 'win32', execCommand });
    expect(execCommand).toHaveBeenCalledWith('taskkill /pid 4242 /t /f');
    expect(child.kill).not.toHaveBeenCalled();
  });
});
