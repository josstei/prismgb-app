import type { App } from 'electron';

/** Applies the Chromium switches that must be set before `app.whenReady()`. */
export function configureChromium(app: App): void {
  // Opt-out for users with GPU driver issues.
  if (process.env.PRISMGB_DISABLE_GPU === '1') {
    app.disableHardwareAcceleration();
  }

  // ARM Linux Vulkan drivers typically lack WebGPU support, so WebGPU probing is disabled there.
  if (process.env.PRISMGB_FORCE_WEBGPU !== '1') {
    const disableWebGPU = process.env.PRISMGB_DISABLE_WEBGPU === '1';
    const isLinuxArm = process.platform === 'linux' && (process.arch === 'arm' || process.arch === 'arm64');
    if (disableWebGPU || isLinuxArm) {
      app.commandLine.appendSwitch('disable-features', 'Vulkan');
      app.commandLine.appendSwitch('use-gl', 'desktop');
      const reason = disableWebGPU
        ? 'PRISMGB_DISABLE_WEBGPU environment variable'
        : 'ARM Linux: Vulkan drivers typically lack WebGPU support';
      console.log(`[GPU Policy] WebGPU disabled: ${reason}`);
    }
  }

  // The main process does little work, so its V8 heap stays small.
  app.commandLine.appendSwitch('js-flags', '--max-old-space-size=128');
}
