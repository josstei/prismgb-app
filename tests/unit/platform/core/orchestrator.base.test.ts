import { describe, it, expect, vi } from 'vitest';
import { BaseOrchestrator } from '@platform/core';

function dependencies() {
  const logger = { info: vi.fn(), debug: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return { logger, loggerFactory: { create: vi.fn(() => logger) } };
}

describe('BaseOrchestrator', () => {
  it('uses the class name as its logger context without an explicit name', () => {
    class NamedOrchestrator extends BaseOrchestrator {}
    const deps = dependencies();
    new NamedOrchestrator(deps);
    expect(deps.loggerFactory.create).toHaveBeenCalledWith('NamedOrchestrator');
  });

  it('runs initialization once, reports readiness and logs repeated initialization', async () => {
    const deps = dependencies();
    const initialize = vi.fn(async () => {});
    class StartingOrchestrator extends BaseOrchestrator {
      override onInitialize(): Promise<void> { return initialize(); }
    }
    const orchestrator = new StartingOrchestrator(deps, 'TestOrchestrator');
    expect(orchestrator.isInitialized).toBe(false);
    await orchestrator.initialize();
    expect(orchestrator.isInitialized).toBe(true);
    await orchestrator.initialize();
    expect(initialize).toHaveBeenCalledOnce();
    expect(deps.logger.info).toHaveBeenCalledWith('Initializing TestOrchestrator');
    expect(deps.logger.info).toHaveBeenCalledWith('TestOrchestrator initialized');
    expect(deps.logger.warn).toHaveBeenCalledWith('TestOrchestrator already initialized');
  });

  it('supports default hooks and a missing logger throughout initialization and cleanup', async () => {
    const orchestrator = new BaseOrchestrator({});
    await orchestrator.initialize();
    expect(orchestrator.isInitialized).toBe(true);
    await orchestrator.cleanup();
    expect(orchestrator.isInitialized).toBe(false);
  });

  it('joins concurrent cleanup and dispose calls until the hook finishes', async () => {
    const pending = Promise.withResolvers<void>();
    const hook = vi.fn(() => pending.promise);
    const deps = dependencies();
    class DrainingOrchestrator extends BaseOrchestrator {
      override onCleanup(): Promise<void> { return hook(); }
    }
    const orchestrator = new DrainingOrchestrator(deps, 'TestOrchestrator');
    await orchestrator.initialize();
    const first = orchestrator.cleanup();
    expect(orchestrator.cleanup()).toBe(first);
    expect(orchestrator.dispose()).toBe(first);
    await Promise.resolve();
    expect(hook).toHaveBeenCalledOnce();
    let settled = false;
    void first.then(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);
    pending.resolve();
    await first;
    expect(orchestrator.isInitialized).toBe(false);
    expect(orchestrator.cleanup()).toBe(first);
    expect(deps.logger.info).toHaveBeenCalledWith('Cleaning up TestOrchestrator');
  });

  it('starts fresh cleanup after an awaited restart', async () => {
    const orchestrator = new BaseOrchestrator(dependencies());
    const cleanup = vi.spyOn(orchestrator, 'onCleanup');
    await orchestrator.initialize();
    await orchestrator.cleanup();
    await orchestrator.initialize();
    await orchestrator.dispose();
    expect(cleanup).toHaveBeenCalledTimes(2);
  });
});
