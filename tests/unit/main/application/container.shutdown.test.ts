/**
 * Main shutdown regression test.
 *
 * Guards MainBootstrap's teardown path in its post-Inversify-cutover form: the
 * DI container no longer cascades a `dispose()` call (decision record 7 —
 * every disposable token is already explicitly torn down by
 * AppOrchestrator.onCleanup()'s safeDisposeAll), so the only remaining
 * re-entrancy hazard is MainBootstrap itself re-invoking the orchestrator's
 * cleanup on a repeated `cleanup()` call. This test proves that stays
 * idempotent — the new structural form of the historical orchestrator↔container
 * self-disposal OOM-loop bug class.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const orchestratorInitialize = vi.fn();
const orchestratorCleanup = vi.fn();

vi.mock('@main/application/container.js', () => ({
  createAppContainer: vi.fn(async () => ({
    get: vi.fn(() => ({
      initialize: orchestratorInitialize,
      cleanup: orchestratorCleanup
    }))
  }))
}));

import { MainBootstrap } from '@main/app-bootstrap.js';

describe('MainBootstrap shutdown', () => {
  it('does not re-enter orchestrator.cleanup on a repeated cleanup call', async () => {
    const bootstrap = new MainBootstrap();

    await bootstrap.initialize();
    await bootstrap.cleanup();
    await bootstrap.cleanup();

    expect(orchestratorInitialize).toHaveBeenCalledTimes(1);
    expect(orchestratorCleanup).toHaveBeenCalledTimes(1);
  });
});
