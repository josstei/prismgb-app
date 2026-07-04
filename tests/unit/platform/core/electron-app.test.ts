import { afterEach, describe, expect, it, vi } from 'vitest';

type ElectronAppModule = typeof import('../../../../src/platform/core/primitives/electron-app.utils.js');

async function importFreshModule(): Promise<ElectronAppModule> {
  vi.resetModules();
  return import('../../../../src/platform/core/primitives/electron-app.utils.js');
}

describe('getElectronApp', () => {
  it('returns null when the node module system is unavailable', async () => {
    const { getElectronApp } = await importFreshModule();
    const getBuiltinModule = vi
      .spyOn(process, 'getBuiltinModule')
      .mockReturnValue(undefined as never);

    expect(getElectronApp()).toBeNull();
    expect(getBuiltinModule).toHaveBeenCalledWith('node:module');
  });

  it('memoizes resolution across calls', async () => {
    const { getElectronApp } = await importFreshModule();
    const getBuiltinModule = vi
      .spyOn(process, 'getBuiltinModule')
      .mockReturnValue(undefined as never);

    getElectronApp();
    getElectronApp();

    expect(getBuiltinModule).toHaveBeenCalledTimes(1);
  });

  it('resolves the electron app instance when require provides one', async () => {
    const { getElectronApp } = await importFreshModule();
    const electronApp = { isPackaged: false, getPath: () => '/tmp' };
    const requireMock = vi.fn(() => ({ app: electronApp }));
    vi.spyOn(process, 'getBuiltinModule').mockReturnValue({
      createRequire: () => requireMock
    } as never);

    expect(getElectronApp()).toBe(electronApp);
    expect(requireMock).toHaveBeenCalledWith('electron');
  });
});
