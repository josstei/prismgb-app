import { describe, expect, it, vi } from 'vitest';
import type { ElectronOptions } from 'vite-plugin-electron';

const electronPlugin = vi.hoisted(() => vi.fn<
  (options: ElectronOptions | ElectronOptions[]) => []
>(() => []));

vi.mock('vite-plugin-electron', () => ({ default: electronPlugin }));

// Capture the actual main-process options without starting Electron or a build.
import '../../../vite.config.js';

const electronOptions = electronPlugin.mock.calls[0]?.[0];

function mainExternal(id: string, resolved = false): boolean {
  const main = (Array.isArray(electronOptions) ? electronOptions : [electronOptions])
    .find((entry) => entry?.entry === 'src/main/index.ts');
  const external = main?.vite?.build?.rollupOptions?.external;
  if (typeof external !== 'function') throw new Error('Main build must provide an external matcher');
  return external(id, undefined, resolved) === true;
}

describe('main build dependency externalization', () => {
  it.each(['electron', 'usb', 'eventemitter3', 'electron-updater', 'electron-log', 'electron-trpc'])(
    'keeps %s external before resolution so packaged imports stay portable', (dependency) => {
      expect(mainExternal(dependency)).toBe(true);
      expect(mainExternal(`${dependency}/subpath`)).toBe(true);
      expect(mainExternal(`/build/node_modules/${dependency}/index.js`, true)).toBe(true);
    }
  );

  it.each(['electron-unrelated', 'usb-unrelated', 'eventemitter3-unrelated'])(
    'does not mistake %s for an external package', (dependency) => {
      expect(mainExternal(dependency)).toBe(false);
      expect(mainExternal(`${dependency}/subpath`)).toBe(false);
      expect(mainExternal(`/build/node_modules/${dependency}/index.js`, true)).toBe(false);
    }
  );
});
