import type { App } from 'electron';

export interface PlatformInfo {
  isLinux: boolean;
  isMac: boolean;
  isWindows: boolean;
  isArm64: boolean;
  isArm: boolean;
  isLinuxArm: boolean;
}

export interface GpuPolicy {
  skipWebGPU: boolean;
  reason: string | null;
  chromiumFlags: Array<[string, string]>;
}

export const GPU_ENV_VARS = {
  DISABLE_GPU: 'PRISMGB_DISABLE_GPU',
  FORCE_WEBGL: 'PRISMGB_FORCE_WEBGL',
  FORCE_WEBGPU: 'PRISMGB_FORCE_WEBGPU',
  FORCE_SOFTWARE: 'PRISMGB_FORCE_SOFTWARE'
} as const;

export function detectPlatform(): PlatformInfo {
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

export function getGpuPolicy(): GpuPolicy {
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

export function applyChromiumFlags(app: App, policy: GpuPolicy): void {
  for (const [flag, value] of policy.chromiumFlags) {
    app.commandLine.appendSwitch(flag, value);
  }
}
