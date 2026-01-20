/**
 * GPU Policy
 * Platform-aware GPU configuration for Chromium flags and WebGPU policy.
 *
 * Addresses ARM64 Linux Vulkan driver issues by:
 * 1. Detecting platform at startup
 * 2. Applying Chromium flags before app.whenReady()
 * 3. Exposing policy to renderer via IPC for capability detection
 */

const GPU_ENV_VARS = {
  DISABLE_GPU: 'PRISMGB_DISABLE_GPU',
  FORCE_WEBGL: 'PRISMGB_FORCE_WEBGL',
  FORCE_WEBGPU: 'PRISMGB_FORCE_WEBGPU',
  FORCE_SOFTWARE: 'PRISMGB_FORCE_SOFTWARE'
};

function detectPlatform() {
  return {
    isLinux: process.platform === 'linux',
    isMac: process.platform === 'darwin',
    isWindows: process.platform === 'win32',
    isArm64: process.arch === 'arm64',
    isArm: process.arch === 'arm' || process.arch === 'arm64',
    isLinuxArm: process.platform === 'linux' &&
      (process.arch === 'arm' || process.arch === 'arm64')
  };
}

function getGpuPolicy() {
  const platform = detectPlatform();
  const forceWebGPU = process.env[GPU_ENV_VARS.FORCE_WEBGPU] === '1';
  const forceWebGL = process.env[GPU_ENV_VARS.FORCE_WEBGL] === '1';

  if (forceWebGPU) {
    return { skipWebGPU: false, reason: null, chromiumFlags: [] };
  }

  if (forceWebGL || platform.isLinuxArm) {
    return {
      skipWebGPU: true,
      reason: forceWebGL
        ? 'PRISMGB_FORCE_WEBGL environment variable'
        : 'ARM Linux: Vulkan drivers typically lack WebGPU support',
      chromiumFlags: [
        ['disable-features', 'Vulkan'],
        ['use-gl', 'desktop']
      ]
    };
  }

  return { skipWebGPU: false, reason: null, chromiumFlags: [] };
}

function applyChromiumFlags(app, policy) {
  for (const [flag, value] of policy.chromiumFlags) {
    app.commandLine.appendSwitch(flag, value);
  }
}

export { detectPlatform, getGpuPolicy, applyChromiumFlags, GPU_ENV_VARS };
