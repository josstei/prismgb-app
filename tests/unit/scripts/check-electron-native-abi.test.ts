import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { checkElectronNativeAbi } from '../../../scripts/check-electron-native-abi.js';

const tempRoots: string[] = [];

function writeLockfile(root: string, electronVersion: string): void {
  fs.writeFileSync(
    path.join(root, 'package-lock.json'),
    JSON.stringify(
      {
        packages: {
          '': {
            devDependencies: {
              electron: `^${electronVersion}`,
              'electron-builder': '^26.8.1'
            },
            dependencies: {
              usb: '^2.16.0'
            }
          },
          'node_modules/electron': {
            version: electronVersion
          },
          'node_modules/electron-builder': {
            version: '26.8.1'
          },
          'node_modules/@electron/rebuild': {
            version: '4.0.3'
          },
          'node_modules/@electron/rebuild/node_modules/node-abi': {
            version: '4.26.0'
          }
        }
      },
      null,
      2
    )
  );
}

function createTempRoot(electronVersion: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-electron-abi-'));
  tempRoots.push(root);
  writeLockfile(root, electronVersion);
  return root;
}

afterEach(() => {
  while (tempRoots.length > 0) {
    fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
  }
});

describe('checkElectronNativeAbi', () => {
  it('passes when @electron/rebuild node-abi can resolve the locked Electron version', () => {
    const projectRoot = createTempRoot('41.6.1');
    const result = checkElectronNativeAbi({
      projectRoot,
      nodeAbi: {
        getAbi(version, runtime) {
          expect(version).toBe('41.6.1');
          expect(runtime).toBe('electron');
          return '145';
        }
      }
    });

    expect(result.passed).toBe(true);
    expect(result.abi).toBe('145');
    expect(result.message).toContain('Electron native module ABI check passed');
  });

  it('fails with actionable dependency context when the locked Electron ABI is unsupported', () => {
    const projectRoot = createTempRoot('42.2.0');
    const result = checkElectronNativeAbi({
      projectRoot,
      nodeAbi: {
        getAbi() {
          throw new Error('Could not detect abi for version 42.2.0 and runtime electron');
        }
      }
    });

    expect(result.passed).toBe(false);
    expect(result.message).toContain('Electron native module ABI check failed');
    expect(result.message).toContain('electron lockfile version: 42.2.0');
    expect(result.message).toContain('electron-builder lockfile version: 26.8.1');
    expect(result.message).toContain('node-abi lockfile version: 4.26.0');
    expect(result.message).toContain('keep Electron on a builder-supported major');
  });
});
