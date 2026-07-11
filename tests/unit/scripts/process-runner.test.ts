import { exec } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  createProcessIdentityTracker,
  headlessElectronEnv,
  terminateProcessTree,
  waitForProcessClose
} from '../../../scripts/lib/process-runner.js';

class FakeChildProcess extends EventEmitter {
  pid = 4242;
  kill = vi.fn((signal?: string) => {
    setImmediate(() => this.emit('close', null, signal ?? 'SIGTERM'));
    return true;
  });
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

describe('createProcessIdentityTracker', () => {
  it('tracks adapter-resolved launch ownership across entry and exit boundaries', async () => {
    const identities = [
      [{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }],
      [
        { pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' },
        { pid: 43, creationTime: 11, ownershipIdentity: 'renderer-child' }
      ],
      []
    ];
    const enumerateLaunchOwnedIdentities = vi.fn(async () => identities.shift());
    const tracker = createProcessIdentityTracker({
      enumerateLaunchOwnedIdentities,
      clock: vi.fn(() => enumerateLaunchOwnedIdentities.mock.calls.length)
    });

    await expect(tracker.observe()).resolves.toMatchObject({
      sequence: 1,
      entered: [{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }],
      exited: []
    });
    await expect(tracker.observe()).resolves.toMatchObject({
      sequence: 2,
      entered: [{ pid: 43, creationTime: 11, ownershipIdentity: 'renderer-child' }],
      exited: []
    });
    await expect(tracker.observe()).resolves.toMatchObject({
      sequence: 3,
      live: [],
      entered: [],
      exited: [
        { pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' },
        { pid: 43, creationTime: 11, ownershipIdentity: 'renderer-child' }
      ]
    });
    expect(enumerateLaunchOwnedIdentities).toHaveBeenNthCalledWith(1, { sequence: 1 });
    expect(enumerateLaunchOwnedIdentities).toHaveBeenNthCalledWith(2, { sequence: 2 });
    expect(tracker.getLiveIdentities()).toEqual([]);
  });

  it('treats PID reuse as an exit and a new identity', async () => {
    const identities = [
      [{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }],
      [{ pid: 42, creationTime: 20, ownershipIdentity: 'browser-root' }]
    ];
    const tracker = createProcessIdentityTracker({
      enumerateLaunchOwnedIdentities: async () => identities.shift(),
      clock: vi.fn(() => 1)
    });

    await tracker.observe();
    await expect(tracker.observe()).resolves.toMatchObject({
      entered: [{ pid: 42, creationTime: 20, ownershipIdentity: 'browser-root' }],
      exited: [{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }]
    });
  });

  it('rejects duplicate identities and ownership changes for an existing process', async () => {
    const duplicateTracker = createProcessIdentityTracker({
      enumerateLaunchOwnedIdentities: async () => [
        { pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' },
        { pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }
      ]
    });
    await expect(duplicateTracker.observe()).rejects.toThrow(/duplicate process identity/);

    const ownershipTracker = createProcessIdentityTracker({
      enumerateLaunchOwnedIdentities: vi.fn()
        .mockResolvedValueOnce([{ pid: 42, creationTime: 10, ownershipIdentity: 'browser-root' }])
        .mockResolvedValueOnce([{ pid: 42, creationTime: 10, ownershipIdentity: 'renderer-child' }])
    });
    await ownershipTracker.observe();
    await expect(ownershipTracker.observe()).rejects.toThrow(/ownership identity changed/);
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
    const signalGroup = vi.fn((pid: number, signal: string): true => {
      setImmediate(() => child.emit('close', null, 'SIGTERM'));
      return true;
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
      return child as unknown as ReturnType<typeof exec>;
    }) as unknown as typeof exec;
    await terminateProcessTree(child, { gracefulMs: 100, platform: 'win32', execCommand });
    expect(execCommand).toHaveBeenCalledWith('taskkill /pid 4242 /t /f');
    expect(child.kill).not.toHaveBeenCalled();
  });
});
