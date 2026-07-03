import type { App } from 'electron';


export interface GpuPolicy {
  reason: string | null;
  chromiumFlags: Array<[string, string]>;
}

export const GPU_ENV_VARS = {
  FORCE_WEBGL: 'PRISMGB_FORCE_WEBGL',
  FORCE_WEBGPU: 'PRISMGB_FORCE_WEBGPU'
} as const;

function isLinuxArmPlatform(): boolean {
  return process.platform === 'linux' && (process.arch === 'arm' || process.arch === 'arm64');
}

export function getGpuPolicy(): GpuPolicy {
  const forceWebGPU = process.env[GPU_ENV_VARS.FORCE_WEBGPU] === '1';
  const forceWebGL = process.env[GPU_ENV_VARS.FORCE_WEBGL] === '1';

  if (forceWebGPU) {
    return { reason: null, chromiumFlags: [] };
  }

  if (forceWebGL || isLinuxArmPlatform()) {
    return {
      reason: forceWebGL
        ? 'PRISMGB_FORCE_WEBGL environment variable'
        : 'ARM Linux: Vulkan drivers typically lack WebGPU support',
      chromiumFlags: [
        ['disable-features', 'Vulkan'],
        ['use-gl', 'desktop']
      ]
    };
  }

  return { reason: null, chromiumFlags: [] };
}

export function applyChromiumFlags(app: App, policy: GpuPolicy): void {
  for (const [flag, value] of policy.chromiumFlags) {
    app.commandLine.appendSwitch(flag, value);
  }
}
