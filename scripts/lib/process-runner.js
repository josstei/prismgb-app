/**
 * Shared child-process lifecycle helpers for gate scripts: headless electron
 * environment, close-awaiting, and platform-aware process-tree termination.
 */
import { exec } from 'node:child_process';

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

  // exitCode alone only proves exit: inherited pipes can keep close pending.
  if ((child.exitCode != null || child.signalCode != null)
    && (child.stdio ?? []).every((stream) => !stream || stream.destroyed)) {
    return { closed: true, code: child.exitCode ?? null, signal: child.signalCode ?? null };
  }

  return new Promise((resolve) => {
    const finish = (result) => {
      clearTimeout(timer);
      child.removeListener('close', onClose);
      resolve(result);
    };
    const onClose = (code, signal) => finish({ closed: true, code, signal });
    const timer = setTimeout(() => finish({ closed: false, code: null, signal: 'timeout' }), timeoutMs);
    child.once('close', onClose);
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
      if (platform !== 'win32' && killProcessGroup) signalGroup(child.pid, 'SIGKILL');
      else child.kill('SIGKILL');
    } catch {
      try { child.kill('SIGKILL'); } catch { return; }
    }
    await waitForProcessClose(child, Math.min(1000, gracefulMs));
  }
}
