import { describe, it, expect } from 'vitest';
import type { IDisposable } from '../../../../src/core/base/disposable.interface';

describe('IDisposable', () => {
  it('should define dispose method signature', () => {
    const disposable: IDisposable = {
      dispose: () => {}
    };

    expect(typeof disposable.dispose).toBe('function');
  });

  it('should allow async dispose', async () => {
    const disposable: IDisposable = {
      dispose: async () => {
        await Promise.resolve();
      }
    };

    await expect(disposable.dispose()).resolves.toBeUndefined();
  });
});
