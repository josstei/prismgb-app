import { describe, it, expect, vi } from 'vitest';
const { initialize, dispose, createRuntime } = vi.hoisted(() => {
  const initialize = vi.fn().mockResolvedValue(undefined);
  const dispose = vi.fn().mockResolvedValue(undefined);
  return { initialize, dispose, createRuntime: vi.fn(() => ({ initialize, dispose })) };
});
vi.mock('@main/application/container.js', () => ({ createMainRuntime: createRuntime }));
import { MainBootstrap } from '@main/app-bootstrap.js';

describe('MainBootstrap shutdown', () => {
  it('releases its runtime once and constructs a fresh runtime on restart', async () => {
    const bootstrap = new MainBootstrap();
    await bootstrap.initialize();
    await bootstrap.cleanup();
    await bootstrap.cleanup();
    expect(initialize).toHaveBeenCalledOnce();
    expect(dispose).toHaveBeenCalledOnce();
    await bootstrap.initialize();
    expect(createRuntime).toHaveBeenCalledTimes(2);
    await bootstrap.cleanup();
  });
});
