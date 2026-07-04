import type { App } from 'electron';


export interface GpuPolicy {
  reason: string | null;
  chromiumFlags: Array<[string, string]>;
}

export const GPU_ENV_VARS = {
  DISABLE_WEBGPU: 'PRISMGB_DISABLE_WEBGPU',
  FORCE_WEBGPU: 'PRISMGB_FORCE_WEBGPU',
  DISABLE_GPU: 'PRISMGB_DISABLE_GPU'
} as const;

function isLinuxArmPlatform(): boolean {
  return process.platform === 'linux' && (process.arch === 'arm' || process.arch === 'arm64');
}

export function getGpuPolicy(): GpuPolicy {
  const forceWebGPU = process.env[GPU_ENV_VARS.FORCE_WEBGPU] === '1';
  const disableWebGPU = process.env[GPU_ENV_VARS.DISABLE_WEBGPU] === '1';

  if (forceWebGPU) {
    return { reason: null, chromiumFlags: [] };
  }

  if (disableWebGPU || isLinuxArmPlatform()) {
    return {
      reason: disableWebGPU
        ? 'PRISMGB_DISABLE_WEBGPU environment variable'
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
