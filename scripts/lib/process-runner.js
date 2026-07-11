/**
 * Shared child-process lifecycle helpers for gate scripts: headless electron
 * environment, close-awaiting, and platform-aware process-tree termination.
 */
import { exec } from 'node:child_process';
import { performance } from 'node:perf_hooks';

function failProcessIdentity(message) {
  throw new TypeError(`Process identity tracker failed: ${message}`);
}

function compareProcessIdentities(left, right) {
  if (left.pid !== right.pid) return left.pid - right.pid;
  if (left.creationTime !== right.creationTime) return left.creationTime - right.creationTime;
  if (left.ownershipIdentity === right.ownershipIdentity) return 0;
  return left.ownershipIdentity < right.ownershipIdentity ? -1 : 1;
}

function normalizeProcessIdentity(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failProcessIdentity(`${label} must be an object`);
  }
  const keys = Object.keys(value).sort();
  if (keys.join('\u0000') !== ['creationTime', 'ownershipIdentity', 'pid'].join('\u0000')) {
    failProcessIdentity(`${label} must contain only pid, creationTime, and ownershipIdentity`);
  }
  if (!Number.isSafeInteger(value.pid) || value.pid <= 0) {
    failProcessIdentity(`${label}.pid must be a positive safe integer`);
  }
  if (!Number.isFinite(value.creationTime) || value.creationTime < 0) {
    failProcessIdentity(`${label}.creationTime must be a nonnegative finite number`);
  }
  if (typeof value.ownershipIdentity !== 'string' || value.ownershipIdentity.length === 0) {
    failProcessIdentity(`${label}.ownershipIdentity must be a nonempty string`);
  }
  return Object.freeze({
    pid: value.pid,
    creationTime: value.creationTime,
    ownershipIdentity: value.ownershipIdentity
  });
}

function identityKey(identity) {
  return JSON.stringify([identity.pid, identity.creationTime, identity.ownershipIdentity]);
}

function processCreationKey(identity) {
  return JSON.stringify([identity.pid, identity.creationTime]);
}

function freezeIdentityList(identities) {
  return Object.freeze(identities
    .slice()
    .sort(compareProcessIdentities)
    .map((identity) => Object.freeze({ ...identity })));
}

/**
 * Tracks only adapter-resolved, launch-owned process identities. A PID is never
 * treated as stable on its own: a changed creation time records an exit plus a
 * new entry, while changed ownership for an unchanged process is rejected.
 *
 * @param {{
 *   enumerateLaunchOwnedIdentities: (context: Readonly<{ sequence: number }>) =>
 *     Promise<Array<{ pid: number, creationTime: number, ownershipIdentity: string }>> |
 *     Array<{ pid: number, creationTime: number, ownershipIdentity: string }>,
 *   clock?: () => number
 * }} options
 */
export function createProcessIdentityTracker({
  enumerateLaunchOwnedIdentities,
  clock = () => performance.now()
} = {}) {
  if (typeof enumerateLaunchOwnedIdentities !== 'function') {
    failProcessIdentity('enumerateLaunchOwnedIdentities must be a function');
  }
  if (typeof clock !== 'function') failProcessIdentity('clock must be a function');

  let sequence = 0;
  let lastObservedAt = -Infinity;
  let liveByIdentity = new Map();

  return Object.freeze({
    async observe() {
      const nextSequence = sequence + 1;
      const rawIdentities = await enumerateLaunchOwnedIdentities(Object.freeze({ sequence: nextSequence }));
      if (!Array.isArray(rawIdentities)) failProcessIdentity('adapter must return an array of launch-owned identities');

      const currentByIdentity = new Map();
      const currentByPid = new Map();
      const currentByProcessCreation = new Map();
      rawIdentities.forEach((value, index) => {
        const identity = normalizeProcessIdentity(value, `adapter identity ${index}`);
        const key = identityKey(identity);
        if (currentByIdentity.has(key)) failProcessIdentity('adapter returned a duplicate process identity');
        if (currentByPid.has(identity.pid)) failProcessIdentity('adapter returned multiple live identities for one PID');
        const creationKey = processCreationKey(identity);
        const existing = currentByProcessCreation.get(creationKey);
        if (existing && existing.ownershipIdentity !== identity.ownershipIdentity) {
          failProcessIdentity('adapter changed ownership identity for one live process');
        }
        currentByIdentity.set(key, identity);
        currentByPid.set(identity.pid, identity);
        currentByProcessCreation.set(creationKey, identity);
      });

      const observedAt = clock();
      if (!Number.isFinite(observedAt) || observedAt < 0) failProcessIdentity('clock must return a nonnegative finite number');
      if (observedAt < lastObservedAt) failProcessIdentity('clock regressed between process observations');

      const priorByProcessCreation = new Map([...liveByIdentity.values()].map((identity) => [processCreationKey(identity), identity]));
      for (const identity of currentByIdentity.values()) {
        const prior = priorByProcessCreation.get(processCreationKey(identity));
        if (prior && prior.ownershipIdentity !== identity.ownershipIdentity) {
          failProcessIdentity('ownership identity changed for an existing PID and creation time');
        }
      }

      const entered = [];
      const exited = [];
      for (const [key, identity] of currentByIdentity) {
        if (!liveByIdentity.has(key)) entered.push(identity);
      }
      for (const [key, identity] of liveByIdentity) {
        if (!currentByIdentity.has(key)) exited.push(identity);
      }

      sequence = nextSequence;
      lastObservedAt = observedAt;
      liveByIdentity = currentByIdentity;
      return Object.freeze({
        sequence,
        observedAt,
        live: freezeIdentityList([...liveByIdentity.values()]),
        entered: freezeIdentityList(entered),
        exited: freezeIdentityList(exited)
      });
    },

    getLiveIdentities() {
      return freezeIdentityList([...liveByIdentity.values()]);
    }
  });
}

export function headlessElectronEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    ELECTRON_DISABLE_GPU: '1',
    ELECTRON_NO_ATTACH_CONSOLE: '1'
  };
}

export async function waitForProcessClose(child, timeoutMs) {
  if (!child) {
    return { closed: false, code: null, signal: null };
  }

  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ closed: false, code: null, signal: 'timeout' });
      }
    }, timeoutMs);

    child.once('close', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ closed: true, code, signal });
      }
    });
  });
}

export async function terminateProcessTree(child, {
  gracefulMs = 5000,
  killProcessGroup = false,
  platform = process.platform,
  execCommand = exec,
  signalGroup = (pid, signal) => process.kill(-pid, signal)
} = {}) {
  if (!child || typeof child.pid !== 'number') {
    return;
  }

  try {
    if (platform === 'win32') {
      execCommand(`taskkill /pid ${child.pid} /t /f`);
    } else if (killProcessGroup) {
      signalGroup(child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      return;
    }
  }

  const closeResult = await waitForProcessClose(child, gracefulMs);
  if (!closeResult.closed) {
    try {
      child.kill('SIGKILL');
    } catch {
      return;
    }
    await waitForProcessClose(child, Math.min(1000, gracefulMs));
  }
}
