import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { App } from 'electron';
import { configureChromium } from '@main/infrastructure/gpu/gpu-policy';
import { installTargetProperty } from '../../../../support/mocks/runtime-property.installers.js';

const WEBGPU_OFF_SWITCHES = [
  ['disable-features', 'Vulkan'],
  ['use-gl', 'desktop']
];
const HEAP_SWITCH = ['js-flags', '--max-old-space-size=128'];

describe('configureChromium', () => {
  let app: { disableHardwareAcceleration: ReturnType<typeof vi.fn>; commandLine: { appendSwitch: ReturnType<typeof vi.fn> } };
  let cleanups: Array<{ cleanup(): void }>;
  let consoleLog: ReturnType<typeof vi.spyOn>;

  function runOn(platform: NodeJS.Platform, arch: NodeJS.Architecture) {
    cleanups.push(installTargetProperty(process, 'platform', platform), installTargetProperty(process, 'arch', arch));
    configureChromium(app as unknown as App);
    return app.commandLine.appendSwitch.mock.calls;
  }

  beforeEach(() => {
    cleanups = [];
    app = { disableHardwareAcceleration: vi.fn(), commandLine: { appendSwitch: vi.fn() } };
    consoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.stubEnv('PRISMGB_DISABLE_GPU', '');
    vi.stubEnv('PRISMGB_DISABLE_WEBGPU', '');
    vi.stubEnv('PRISMGB_FORCE_WEBGPU', '');
  });

  afterEach(() => {
    cleanups.forEach((handle) => handle.cleanup());
    consoleLog.mockRestore();
    vi.unstubAllEnvs();
  });

  it('only limits the main heap by default', () => {
    expect(runOn('linux', 'x64')).toEqual([HEAP_SWITCH]);
    expect(app.disableHardwareAcceleration).not.toHaveBeenCalled();
    expect(consoleLog).not.toHaveBeenCalled();
  });

  it('disables hardware acceleration with PRISMGB_DISABLE_GPU=1', () => {
    vi.stubEnv('PRISMGB_DISABLE_GPU', '1');

    runOn('win32', 'x64');

    expect(app.disableHardwareAcceleration).toHaveBeenCalledTimes(1);
  });

  it('turns WebGPU off with PRISMGB_DISABLE_WEBGPU=1', () => {
    vi.stubEnv('PRISMGB_DISABLE_WEBGPU', '1');

    expect(runOn('darwin', 'arm64')).toEqual([...WEBGPU_OFF_SWITCHES, HEAP_SWITCH]);
    expect(consoleLog).toHaveBeenCalledWith('[GPU Policy] WebGPU disabled: PRISMGB_DISABLE_WEBGPU environment variable');
  });

  it('turns WebGPU off on ARM Linux', () => {
    expect(runOn('linux', 'arm64')).toEqual([...WEBGPU_OFF_SWITCHES, HEAP_SWITCH]);
    expect(consoleLog).toHaveBeenCalledWith('[GPU Policy] WebGPU disabled: ARM Linux: Vulkan drivers typically lack WebGPU support');
  });

  it('keeps WebGPU with PRISMGB_FORCE_WEBGPU=1 even where it would be disabled', () => {
    vi.stubEnv('PRISMGB_FORCE_WEBGPU', '1');
    vi.stubEnv('PRISMGB_DISABLE_WEBGPU', '1');

    expect(runOn('linux', 'arm')).toEqual([HEAP_SWITCH]);
    expect(consoleLog).not.toHaveBeenCalled();
  });
});
