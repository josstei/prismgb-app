# Codebase Consolidation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce ~820-870 lines and ~12 files through unified lifecycle hierarchy, DI auto-wiring, domain consolidations, bridge standardization, and dead code removal -- while retaining 100% functionality (baseline: all tests/lint pass).

**Architecture:** Introduce `LifecycleService` between `BaseService` and `BaseOrchestrator` to unify lifecycle management. Add `autoRegister()` to `ServiceContainer` to eliminate DI boilerplate. Consolidate thin orchestrators/facades/services into their natural owners.

**Tech Stack:** TypeScript, Vitest, EventBus (eventemitter3), custom ServiceContainer DI

**Baseline Validation (2026-02-11):**
- `npm run test:run` -> 132 files, 2881 tests passing
- `npm run lint` -> passing (including architecture boundary checks)

---

## Phase 1: Foundation

> Must complete before all other phases. Creates `LifecycleService`, refactors `BaseOrchestrator`, adds `autoRegister()`.

### Task 1.1: Create ILifecycle Interface

**Files:**
- Create: `src/shared/interfaces/lifecycle.interface.ts`

**Step 1: Create the interface file**

```typescript
import type { EventBusLike } from './infrastructure.types';

export interface ILifecycle {
  initialize(): Promise<void>;
  dispose(): Promise<void>;
}

export interface IEventSubscriber {
  subscribeWithCleanup(eventMap: Record<string, (...args: unknown[]) => void>): void;
}
```

**Step 2: Run tests to verify no regressions**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass (no behavioral changes, just a new file)

**Step 3: Commit**

```bash
git add src/shared/interfaces/lifecycle.interface.ts
git commit -m "feat(shared): add ILifecycle and IEventSubscriber interfaces"
```

---

### Task 1.2: Create LifecycleService Base Class

**Files:**
- Create: `src/shared/base/lifecycle-service.base.ts`

**Step 1: Create the LifecycleService class**

```typescript
import { BaseService } from './service.base.js';
import type { ILifecycle, IEventSubscriber } from '../interfaces/lifecycle.interface';
import type { EventBusLike, LoggerLike } from '../interfaces/infrastructure.types';

export abstract class LifecycleService extends BaseService implements ILifecycle, IEventSubscriber {
  protected _subscriptions: (() => void)[] = [];
  private _isInitialized = false;
  private _isDisposed = false;

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  get isDisposed(): boolean {
    return this._isDisposed;
  }

  async initialize(): Promise<void> {
    if (this._isInitialized) {
      (this as unknown as { logger?: LoggerLike }).logger?.warn(
        `${this._serviceName} already initialized`
      );
      return;
    }

    (this as unknown as { logger?: LoggerLike }).logger?.info(
      `Initializing ${this._serviceName}`
    );

    try {
      await this.onInitialize();
      this._isInitialized = true;
      this._isDisposed = false;
      (this as unknown as { logger?: LoggerLike }).logger?.info(
        `${this._serviceName} initialized`
      );
    } catch (error) {
      (this as unknown as { logger?: LoggerLike }).logger?.error(
        `${this._serviceName} initialization failed`, error
      );
      throw error;
    }
  }

  async dispose(): Promise<void> {
    if (this._isDisposed) {
      (this as unknown as { logger?: LoggerLike }).logger?.debug(
        `${this._serviceName} already disposed`
      );
      return;
    }

    (this as unknown as { logger?: LoggerLike }).logger?.info(
      `Disposing ${this._serviceName}`
    );

    this._cleanupSubscriptions();

    try {
      await this.onDispose();
    } catch (error) {
      (this as unknown as { logger?: LoggerLike }).logger?.error(
        `${this._serviceName} dispose failed`, error
      );
    }

    this._isInitialized = false;
    this._isDisposed = true;
  }

  subscribeWithCleanup(eventMap: Record<string, (...args: unknown[]) => void>): void {
    const eventBus = (this as unknown as { eventBus?: EventBusLike }).eventBus;
    if (!eventBus) {
      (this as unknown as { logger?: LoggerLike }).logger?.warn(
        'Cannot subscribe - eventBus not available'
      );
      return;
    }

    for (const [event, handler] of Object.entries(eventMap)) {
      const unsubscribe = eventBus.subscribe(event, handler);
      this._subscriptions.push(unsubscribe);
    }
  }

  protected async onInitialize(): Promise<void> {
    // Override in subclasses
  }

  protected async onDispose(): Promise<void> {
    // Override in subclasses
  }

  private _cleanupSubscriptions(): void {
    for (const unsubscribe of this._subscriptions) {
      if (typeof unsubscribe === 'function') {
        unsubscribe();
      }
    }
    this._subscriptions = [];
  }
}
```

**Step 2: Run tests**

Run: `npx vitest run --reporter=verbose 2>&1 | tail -5`
Expected: All tests pass

**Step 3: Commit**

```bash
git add src/shared/base/lifecycle-service.base.ts
git commit -m "feat(shared): add LifecycleService base class with lifecycle template and subscription management"
```

---

### Task 1.3: Refactor BaseOrchestrator to Extend LifecycleService

**Files:**
- Modify: `src/shared/base/orchestrator.base.js`

The current `BaseOrchestrator` duplicates `BaseService` constructor logic (27 lines). Refactor it to extend `LifecycleService` instead, mapping its existing `cleanup()`/`onCleanup()` pattern to `dispose()`/`onDispose()`.

**Step 1: Rewrite BaseOrchestrator**

Replace the entire file contents with:

```javascript
import { LifecycleService } from './lifecycle-service.base.ts';

export class BaseOrchestrator extends LifecycleService {
  constructor(dependencies, requiredDeps, name) {
    super(dependencies, requiredDeps, name);
    this._orchestratorName = name || this.constructor.name;
  }

  async cleanup() {
    await this.dispose();
  }

  async onCleanup() {
    // Override in subclasses
  }

  async onDispose() {
    await this.onCleanup();
  }
}
```

**Key behavioral contracts preserved:**
- `initialize()` / `onInitialize()` - inherited from `LifecycleService`
- `cleanup()` delegates to `dispose()` (backward compatibility)
- `onCleanup()` - subclass override point (called via `onDispose()`)
- `subscribeWithCleanup()` - inherited from `LifecycleService`
- `isInitialized` - inherited from `LifecycleService` (getter, was plain property)
- `_subscriptions` - inherited from `LifecycleService`

**Step 2: Run ALL tests**

Run: `npm run test:run`
Expected: All baseline tests pass (currently 2881). If any orchestrator tests fail, the issue will be:
- `isInitialized` is now a getter (not a plain boolean property) -- tests that set it directly need updating
- `_isCleanedUp` is removed -- replaced by `isDisposed` getter

**Step 3: Fix any test failures**

If tests directly assign `orchestrator.isInitialized = true`, they need to call `orchestrator.initialize()` instead, or mock the internal state. Check for:
- Direct writes to `isInitialized`
- References to `_isCleanedUp`

**Step 4: Run tests again to confirm all pass**

Run: `npm run test:run`
Expected: All tests pass

**Step 5: Commit**

```bash
git add src/shared/base/orchestrator.base.js
git commit -m "refactor(shared): BaseOrchestrator extends LifecycleService, removes duplicated constructor logic"
```

---

### Task 1.4: Add autoRegister() to ServiceContainer

**Files:**
- Modify: `src/renderer/infrastructure/di/service-container.factory.ts`
- Modify: `src/renderer/application/di/registrable-container.type.ts`

**Step 1: Add autoRegister method to ServiceContainer**

In `src/renderer/infrastructure/di/service-container.factory.ts`, add this method to the `ServiceContainer` class after the `register()` method (after line 83):

```typescript
  autoRegister<TKey extends string, TService>(
    name: TKey,
    ServiceClass: { readonly dependencies: readonly string[]; new (deps: Record<string, unknown>): TService }
  ): ServiceContainer<TServices & Record<TKey, TService>> {
    const deps = [...ServiceClass.dependencies];
    this.registerSingleton(
      name,
      function (...resolvedDeps: unknown[]) {
        const depsObj: Record<string, unknown> = {};
        for (let i = 0; i < deps.length; i++) {
          depsObj[deps[i]] = resolvedDeps[i];
        }
        return new ServiceClass(depsObj);
      } as unknown as ServiceFactory<TService>,
      deps
    );
    return this as unknown as ServiceContainer<TServices & Record<TKey, TService>>;
  }
```

**Step 2: Update RegistrableContainer type**

Replace `src/renderer/application/di/registrable-container.type.ts` with:

```typescript
export type ContainerKey<TMap extends object> = Extract<keyof TMap, string>;

export type RegistrableContainer<TMap extends object> = {
  registerSingleton<TKey extends ContainerKey<TMap>>(
    name: TKey,
    factory: (...args: any[]) => TMap[TKey],
    deps: string[]
  ): void;

  autoRegister<TKey extends ContainerKey<TMap>>(
    name: TKey,
    ServiceClass: { readonly dependencies: readonly string[]; new (deps: Record<string, unknown>): TMap[TKey] }
  ): void;
};
```

**Step 3: Run tests**

Run: `npm run test:run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add src/renderer/infrastructure/di/service-container.factory.ts src/renderer/application/di/registrable-container.type.ts
git commit -m "feat(di): add autoRegister() method to ServiceContainer for static-dependency-driven registration"
```

---

### Task 1.5: Write LifecycleService Unit Tests

**Files:**
- Create: `tests/unit/shared/base/lifecycle-service.base.test.ts`

**Step 1: Write comprehensive tests**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LifecycleService } from '@shared/base/lifecycle-service.base.ts';

class TestService extends LifecycleService {
  static readonly dependencies = ['eventBus', 'loggerFactory'] as const;
  initCalled = false;
  disposeCalled = false;

  constructor(deps) {
    super(deps, [...TestService.dependencies], 'TestService');
  }

  async onInitialize() {
    this.initCalled = true;
  }

  async onDispose() {
    this.disposeCalled = true;
  }
}

function createMockDeps() {
  return {
    eventBus: {
      subscribe: vi.fn(() => vi.fn()),
      publish: vi.fn()
    },
    loggerFactory: {
      create: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      })
    }
  };
}

describe('LifecycleService', () => {
  let service;
  let deps;

  beforeEach(() => {
    deps = createMockDeps();
    service = new TestService(deps);
  });

  describe('initialize', () => {
    it('should call onInitialize and set isInitialized', async () => {
      await service.initialize();
      expect(service.initCalled).toBe(true);
      expect(service.isInitialized).toBe(true);
      expect(service.isDisposed).toBe(false);
    });

    it('should skip if already initialized', async () => {
      await service.initialize();
      service.initCalled = false;
      await service.initialize();
      expect(service.initCalled).toBe(false);
    });

    it('should propagate initialization errors', async () => {
      const error = new Error('init failed');
      service.onInitialize = async () => { throw error; };
      await expect(service.initialize()).rejects.toThrow('init failed');
      expect(service.isInitialized).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should call onDispose and set isDisposed', async () => {
      await service.initialize();
      await service.dispose();
      expect(service.disposeCalled).toBe(true);
      expect(service.isInitialized).toBe(false);
      expect(service.isDisposed).toBe(true);
    });

    it('should skip if already disposed', async () => {
      await service.initialize();
      await service.dispose();
      service.disposeCalled = false;
      await service.dispose();
      expect(service.disposeCalled).toBe(false);
    });

    it('should cleanup subscriptions on dispose', async () => {
      const unsub1 = vi.fn();
      const unsub2 = vi.fn();
      deps.eventBus.subscribe.mockReturnValueOnce(unsub1).mockReturnValueOnce(unsub2);

      service.subscribeWithCleanup({
        'event:a': vi.fn(),
        'event:b': vi.fn()
      });

      await service.initialize();
      await service.dispose();

      expect(unsub1).toHaveBeenCalled();
      expect(unsub2).toHaveBeenCalled();
    });

    it('should continue dispose even if onDispose throws', async () => {
      service.onDispose = async () => { throw new Error('dispose failed'); };
      await service.initialize();
      await service.dispose();
      expect(service.isDisposed).toBe(true);
    });
  });

  describe('subscribeWithCleanup', () => {
    it('should subscribe to all events in the map', () => {
      const handlers = { 'event:a': vi.fn(), 'event:b': vi.fn() };
      service.subscribeWithCleanup(handlers);
      expect(deps.eventBus.subscribe).toHaveBeenCalledTimes(2);
      expect(deps.eventBus.subscribe).toHaveBeenCalledWith('event:a', handlers['event:a']);
      expect(deps.eventBus.subscribe).toHaveBeenCalledWith('event:b', handlers['event:b']);
    });

    it('should warn if eventBus is not available', () => {
      const noBusDeps = { loggerFactory: deps.loggerFactory };
      const noBusService = new TestService({ ...noBusDeps, eventBus: undefined });
      // Should not throw
      expect(() => noBusService.subscribeWithCleanup({ 'x': vi.fn() })).not.toThrow();
    });
  });
});
```

**Step 2: Run the new tests**

Run: `npx vitest run tests/unit/shared/base/lifecycle-service.base.test.ts --reporter=verbose`
Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/unit/shared/base/lifecycle-service.base.test.ts
git commit -m "test(shared): add LifecycleService unit tests"
```

---

### Task 1.6: Write autoRegister() Unit Test

**Files:**
- Create: `tests/unit/renderer/infrastructure/di/auto-register.test.ts`

**Step 1: Write test**

```typescript
import { describe, it, expect } from 'vitest';
import { ServiceContainer } from '@renderer/infrastructure/di/service-container.factory';

class MockService {
  static readonly dependencies = ['depA', 'depB'] as const;
  depA: unknown;
  depB: unknown;

  constructor(deps: Record<string, unknown>) {
    this.depA = deps.depA;
    this.depB = deps.depB;
  }
}

describe('ServiceContainer.autoRegister', () => {
  it('should register and resolve a service using static dependencies', () => {
    const container = new ServiceContainer();
    container.register({ depA: { __asValue: true, value: 'valueA' } as any });
    container.register({ depB: { __asValue: true, value: 'valueB' } as any });

    container.autoRegister('mockService', MockService);

    const instance = container.resolve('mockService') as MockService;
    expect(instance).toBeInstanceOf(MockService);
    expect(instance.depA).toBe('valueA');
    expect(instance.depB).toBe('valueB');
  });

  it('should return singleton instance on subsequent resolves', () => {
    const container = new ServiceContainer();
    container.register({ depA: { __asValue: true, value: 'a' } as any });
    container.register({ depB: { __asValue: true, value: 'b' } as any });

    container.autoRegister('mockService', MockService);

    const first = container.resolve('mockService');
    const second = container.resolve('mockService');
    expect(first).toBe(second);
  });
});
```

**Step 2: Run the test**

Run: `npx vitest run tests/unit/renderer/infrastructure/di/auto-register.test.ts --reporter=verbose`
Expected: All tests pass

**Step 3: Commit**

```bash
git add tests/unit/renderer/infrastructure/di/auto-register.test.ts
git commit -m "test(di): add autoRegister() unit tests"
```

---

### Task 1.7: Phase 1 Validation

**Step 1: Run full test suite**

Run: `npm run test:run`
Expected: All baseline tests pass (currently 2881+)

**Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

---

## Phase 2: Domain Consolidations

> All sub-phases are independent. Recommended order: 2b (simplest) -> 2a -> 2c -> 2d (most complex).

### Task 2.1: Settings Domain - Absorb CinematicModeService

**Files:**
- Delete: `src/renderer/infrastructure/services/settings/cinematic-mode.service.ts`
- Modify: `src/renderer/application/orchestrators/display-mode.orchestrator.ts`
- Modify: `src/renderer/application/di/register-orchestrators.ts`
- Modify: `src/renderer/application/di/renderer-container-map.type.ts`

**Step 1: Modify DisplayModeOrchestrator to inline cinematic toggle**

In `src/renderer/application/orchestrators/display-mode.orchestrator.ts`:
- Add `appState` to the dependency list
- Remove `cinematicModeService` from the dependency list
- Replace `this.cinematicModeService.toggleCinematicMode()` with inlined logic

The updated file should have this constructor and toggleCinematicMode:

```typescript
constructor(dependencies) {
  super(
    dependencies,
    ['fullscreenService', 'appState', 'settingsService', 'eventBus', 'loggerFactory'],
    'SettingsDisplayModeOrchestrator'
  );
}
```

And replace the `toggleCinematicMode()` method:

```typescript
toggleCinematicMode() {
  const newMode = !this.appState.isCinematicModeEnabled;
  this.appState.setCinematicMode(newMode);
  this.eventBus.publish(EventChannels.SETTINGS.CINEMATIC_MODE_CHANGED, { enabled: newMode });
}
```

**Step 2: Update DI registration**

In `src/renderer/application/di/register-orchestrators.ts`:
- Remove the `import { SettingsCinematicModeService }` line
- Remove the `cinematicModeService` registration block (lines 107-113)
- Update the `displayModeOrchestrator` registration to replace `cinematicModeService` with `appState` in both the factory function params and the dependency array

**Step 3: Update container type map**

In `src/renderer/application/di/renderer-container-map.type.ts`:
- Remove the `cinematicModeService: unknown;` line

**Step 4: Delete CinematicModeService**

Delete: `src/renderer/infrastructure/services/settings/cinematic-mode.service.ts`

**Step 5: Delete CinematicModeService test**

Delete: `tests/unit/features/settings/services/cinematic-mode.service.test.js` (if it exists)

Also update affected tests:
- `tests/unit/features/settings/services/display-mode.orchestrator.test.js` (replace `cinematicModeService` mock with `appState` + `eventBus` assertions)
- `tests/unit/app/renderer/container.test.js` (remove `cinematicModeService` mocks/key assertions)

**Step 6: Run tests**

Run: `npm run test:run`
Expected: All tests pass (minus the deleted test file)

**Step 7: Commit**

```bash
git add -A
git commit -m "refactor(settings): absorb CinematicModeService into DisplayModeOrchestrator"
```

---

### Task 2.2: Update Domain - Eliminate Orchestrator, Bridge-ify UI Service

**Files:**
- Delete: `src/renderer/application/orchestrators/update.orchestrator.ts`
- Move+Rename: `src/renderer/infrastructure/services/updates/update-ui.service.ts` -> `src/renderer/presentation/bridges/update-ui.bridge.ts`
- Modify: `src/renderer/application/orchestrators/app.orchestrator.ts`
- Modify: `src/renderer/application/orchestrators/ui-setup.orchestrator.ts`
- Modify: `src/renderer/presentation/features/updates/update-section.component.js`
- Modify: `src/renderer/renderer-app.orchestrator.ts`
- Modify: `src/renderer/application/di/register-orchestrators.ts`
- Modify: `src/renderer/application/di/register-ui.ts`
- Modify: `src/renderer/application/di/renderer-container-map.type.ts`

**Step 1: Move and rename UpdateUiService to UpdateUIBridge**

Move `src/renderer/infrastructure/services/updates/update-ui.service.ts` to `src/renderer/presentation/bridges/update-ui.bridge.ts`.

Rename the class from `UpdateUiService` to `UpdateUIBridge`. Update the export. Keep behavior equivalent, but update imports to presentation-legal/shared aliases (do not keep infrastructure-layer alias imports in presentation).

**Step 2: Delete UpdateOrchestrator**

Delete `src/renderer/application/orchestrators/update.orchestrator.ts`.

**Step 3: Update AppOrchestrator**

In `src/renderer/application/orchestrators/app.orchestrator.ts`:
- Replace `updateOrchestrator` with `updateService` in the constructor deps list
- In `onInitialize()`: replace `await this.updateOrchestrator.initialize()` with:
  ```typescript
  await this.updateService.initialize();
  ```
- In `onCleanup()`: replace the `updateOrchestrator` cleanup entry with:
  ```typescript
  ['updateService', this.updateService],
  ```
  Note: `updateService` uses `dispose()`, not `cleanup()`. Update cleanup loop logic to call `cleanup()` when present, otherwise `dispose()`.
  Do not initialize `updateUiBridge` here (bridge ownership stays in `RendererAppOrchestrator`).

**Step 4: Update UISetupOrchestrator**

In `src/renderer/application/orchestrators/ui-setup.orchestrator.ts`:
- Replace `updateOrchestrator` with `updateService` in the dependency list
- Update `initializeSettingsMenu()` to pass `updateService` instead of `updateOrchestrator`

**Step 5: Update UpdateSectionComponent**

In `src/renderer/presentation/features/updates/update-section.component.js`:
- Replace all references from `updateOrchestrator` to `updateService` (constructor param name, property assignments)

**Step 6: Update RendererAppOrchestrator**

In `src/renderer/renderer-app.orchestrator.ts`:
- Add `UpdateUIBridge` type import
- In `_initializeUIEventBridge()`: add resolution and initialization of `updateUiBridge`:
  ```typescript
  const updateUiBridge = container.resolve('updateUiBridge');
  updateUiBridge.initialize();
  this._updateUiBridge = updateUiBridge;
  ```
- Add `_updateUiBridge` field declaration and cleanup in `cleanup()`

**Step 7: Update DI registrations**

In `register-orchestrators.ts`:
- Remove `UpdateOrchestrator` import
- Remove `updateOrchestrator` registration block
- Remove `updateOrchestrator` from `appOrchestrator` factory params and dependency array
- Add `updateService` to `appOrchestrator` dependency array and factory params

In `register-ui.ts`:
- Add import for `UpdateUIBridge` from `@renderer/presentation/bridges/update-ui.bridge`
- Add registration for `updateUiBridge` with dependencies `['eventBus', 'loggerFactory']`
- In `settingsMenuComponent` composition factory, replace `dependencies.updateOrchestrator` usage with `dependencies.updateService`

**Step 8: Update container type map**

In `renderer-container-map.type.ts`:
- Remove `updateOrchestrator: unknown;`
- Replace `updateUiService: unknown;` with `updateUiBridge: unknown;`
- Add `updateService` to `appOrchestrator` deps if referenced

**Step 9: Delete UpdateOrchestrator test**

Delete: `tests/unit/features/updates/services/update.orchestrator.test.js` (if it exists)

**Step 10: Update remaining tests**

Update any test that mocks `updateOrchestrator` to mock `updateService` instead:
- `tests/unit/features/updates/ui/update-section.component.test.js`
- `tests/unit/ui/ui-setup.orchestrator.test.js`
- `tests/unit/ui/app.orchestrator.test.js`
- `tests/unit/app/renderer/container.test.js`

**Step 11: Run tests**

Run: `npm run test:run`
Expected: All tests pass

**Step 12: Commit**

```bash
git add -A
git commit -m "refactor(updates): eliminate UpdateOrchestrator, move UpdateUiService to UpdateUIBridge"
```

---

### Task 2.3: Performance Domain - Merge 3 Orchestrators into 1

**Files:**
- Delete: `src/renderer/application/orchestrators/performance-state.orchestrator.ts`
- Delete: `src/renderer/application/orchestrators/performance-animation.orchestrator.ts`
- Delete: `src/renderer/application/orchestrators/performance-metrics.orchestrator.ts`
- Create: `src/renderer/application/orchestrators/performance.orchestrator.ts`
- Modify: `src/renderer/application/orchestrators/app.orchestrator.ts`
- Modify: `src/renderer/application/di/register-orchestrators.ts`
- Modify: `src/renderer/application/di/renderer-container-map.type.ts`

**Step 1: Create merged PerformanceOrchestrator**

Create `src/renderer/application/orchestrators/performance.orchestrator.ts`:

```typescript
import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
import { EventChannels } from '@shared/events/event-channels.js';

export class PerformanceOrchestrator extends BaseOrchestrator {

  constructor(dependencies) {
    super(
      dependencies,
      [
        'eventBus', 'loggerFactory',
        'performanceStateService', 'animationPerformanceService',
        'performanceMetricsService', 'bodyClassManager'
      ],
      'PerformanceOrchestrator'
    );
    this._lastUiMode = null;
  }

  async onInitialize() {
    // Phase 1: State service MUST initialize first (emits initial state)
    this.performanceStateService.initialize({
      onStateChange: (state) => this._handleStateChanged(state)
    });

    // Phase 2: Subscribe to all events
    this.subscribeWithCleanup({
      [EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED]: (enabled) =>
        this._handlePerformanceModeChanged(Boolean(enabled)),
      [EventChannels.RENDER.CAPABILITY_DETECTED]: (capabilities) =>
        this.performanceStateService.setCapabilities(capabilities),
      [EventChannels.STREAM.STARTED]: () => this._handleStreamStarted(),
      [EventChannels.STREAM.STOPPED]: () => this._handleStreamStopped(),
      [EventChannels.PERFORMANCE.STATE_CHANGED]: (state) =>
        this._handlePerformanceStateForAnimation(state),
      [EventChannels.PERFORMANCE.MEMORY_SNAPSHOT_REQUESTED]: (payload) =>
        this.performanceMetricsService.requestSnapshot(payload)
    });

    // Phase 3: Start periodic snapshots in DEV
    if (import.meta.env.DEV) {
      this.performanceMetricsService.startPeriodicSnapshots();
    }
  }

  _handlePerformanceModeChanged(enabled) {
    const changed = this.performanceStateService.setPerformanceModeEnabled(enabled);
    if (changed) {
      this.eventBus.publish(EventChannels.PERFORMANCE.RENDER_MODE_CHANGED, enabled);
    }
  }

  _handleStateChanged(state) {
    this.eventBus.publish(EventChannels.PERFORMANCE.STATE_CHANGED, { ...state });

    const uiMode = {
      enabled: Boolean(state.performanceModeEnabled),
      weakGpuDetected: Boolean(state.weakGpuDetected)
    };

    if (!this._lastUiMode ||
        this._lastUiMode.enabled !== uiMode.enabled ||
        this._lastUiMode.weakGpuDetected !== uiMode.weakGpuDetected) {
      this.eventBus.publish(EventChannels.PERFORMANCE.UI_MODE_CHANGED, uiMode);
      this._lastUiMode = uiMode;
    }
  }

  _handleStreamStarted() {
    this.performanceStateService.setStreaming(true);
    const animState = this.animationPerformanceService.setStreaming(true);
    this._applyBodyClasses(animState);
  }

  _handleStreamStopped() {
    this.performanceStateService.setStreaming(false);
    const animState = this.animationPerformanceService.setStreaming(false);
    this._applyBodyClasses(animState);
  }

  _handlePerformanceStateForAnimation(performanceState) {
    const state = this.animationPerformanceService.setPerformanceState(performanceState);
    this._applyBodyClasses(state);
  }

  _applyBodyClasses(state) {
    this.bodyClassManager.setStreaming(state.streaming);
    this.bodyClassManager.setIdle(state.idle);
    this.bodyClassManager.setHidden(state.hidden);
    this.bodyClassManager.setAnimationsOff(state.animationsOff);
  }

  async onCleanup() {
    this.performanceStateService.dispose();
    this.performanceMetricsService.stopPeriodicSnapshots();
    this.performanceMetricsService.clearPendingRequests();
  }
}
```

**Step 2: Update AppOrchestrator**

In `src/renderer/application/orchestrators/app.orchestrator.ts`:
- Replace `performanceStateOrchestrator`, `animationPerformanceOrchestrator`, `performanceMetricsOrchestrator` with single `performanceOrchestrator` in deps
- In `onInitialize()`: replace the 3 performance init lines with:
  ```typescript
  await this.performanceOrchestrator.initialize();
  ```
- In `onCleanup()`: replace the 3 performance cleanup entries with:
  ```typescript
  ['performanceOrchestrator', this.performanceOrchestrator],
  ```

**Step 3: Update DI registration**

In `register-orchestrators.ts`:
- Remove imports for the 3 old orchestrators
- Add import for `PerformanceOrchestrator`
- Remove the 3 old orchestrator registrations
- Add single `performanceOrchestrator` registration
- Update `appOrchestrator` registration to use `performanceOrchestrator` instead of the 3 separate ones

**Step 4: Update container type map**

Remove `performanceStateOrchestrator`, `animationPerformanceOrchestrator`, `performanceMetricsOrchestrator`. Add `performanceOrchestrator`.

**Step 5: Delete the 3 old orchestrators**

Delete the 3 files listed above.

**Step 6: Delete old orchestrator tests, create new test**

Delete the old test files. Create `tests/unit/app/renderer/application/performance/performance.orchestrator.test.js` that covers:
- Initialization order (state service init before event subscriptions)
- Combined STREAM.STARTED/STOPPED handlers call both services
- STATE_CHANGED handling with UI mode dedup
- DEV-only periodic snapshots
- Cleanup calls all 3 service cleanup methods

**Step 7: Run tests**

Run: `npm run test:run`
Expected: All tests pass

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor(performance): merge 3 performance orchestrators into unified PerformanceOrchestrator"
```

---

### Task 2.4: Device Domain - Remove Facade, Absorb Connection

**Files:**
- Delete: `src/renderer/infrastructure/services/devices/device.service.ts`
- Delete: `src/renderer/infrastructure/services/devices/device-connection.service.ts`
- Modify: `src/renderer/infrastructure/services/devices/device-media.service.ts`
- Modify: `src/renderer/application/orchestrators/device.orchestrator.ts`
- Modify: `src/renderer/infrastructure/services/devices/device-operation-sequencer.service.ts`
- Modify: `src/renderer/infrastructure/services/streaming/streaming.service.ts`
- Modify: `src/renderer/application/state/app-state.ts`
- Modify: `src/renderer/application/di/register-devices.ts`
- Modify: `src/renderer/application/di/register-streaming.ts`
- Modify: `src/renderer/application/di/register-ui.ts`
- Modify: `src/renderer/application/di/register-orchestrators.ts`
- Modify: `src/renderer/application/di/renderer-container-map.type.ts`

> **Risk: HIGH** - 5 consumers of the facade need rewiring. Execute carefully with per-file validation.

**Step 1: Absorb connection tracking into DeviceMediaService**

Read `device-connection.service.ts` and `device-media.service.ts` first to understand the exact connection tracking logic.

Add to `DeviceMediaService`:
- A `_isConnected` boolean field
- A `get isConnected()` getter
- A `updateConnectionStatus()` method that:
  1. Calls `this.deviceStatusProvider.getDeviceStatus()`
  2. Updates `this._isConnected`
  3. If changed, calls `this.invalidateEnumerationCache()` and publishes `DEVICE.STATUS_CHANGED`
  4. Returns `{ status, changed }`

Remove the `deviceConnectionService` dependency from `DeviceMediaService` and replace its internal calls with the new methods.
Add `deviceStatusProvider` to `DeviceMediaService` dependencies.

**Step 2: Update DeviceOrchestrator**

- Replace `deviceService` dependency with `deviceMediaService`
- Replace `this.deviceService.setupDeviceChangeListener()` with:
  ```typescript
  this.deviceMediaService.setupDeviceChangeListener(async () => {
    await this.deviceOperationSequencer.queueRefresh();
  });
  ```
- Replace `this.deviceService.isDeviceConnected()` with `this.deviceMediaService.isConnected`
- Remove the dead `isDeviceConnected()` method
- Replace `this.deviceService.dispose()` with `this.deviceMediaService.dispose()`

**Step 3: Update DeviceOperationSequencerService**

- Replace `deviceService` dependency with `deviceMediaService`
- Replace `this.deviceService.updateDeviceStatus()` with `this.deviceMediaService.updateConnectionStatus()`
- Replace `this.deviceService.enumerateDevices()` with `this.deviceMediaService.enumerateDevices()`

**Step 4: Update StreamingService**

- Replace `deviceService` dependency with `deviceMediaService` and `deviceStorageService`
- Replace `this.deviceService.enumerateDevices()` with `this.deviceMediaService.enumerateDevices()`
- Replace `this.deviceService.registerSupportedDevice()` with `this.deviceMediaService.registerSupportedDevice()`
- Replace `this.deviceService.discoverSupportedDevice()` with `this.deviceMediaService.discoverSupportedDevice()`
- Replace `this.deviceService.getRegisteredStoredDeviceIds()` with `this.deviceStorageService.getRegisteredStoredDeviceIds()`

**Step 5: Update AppState**

- Replace `deviceService` dependency with `deviceMediaService`
- Replace `this.deviceService.isConnected` with `this.deviceMediaService.isConnected`

**Step 6: Update all DI registration files**

- `register-devices.ts`: Remove `deviceService` and `deviceConnectionService` registrations. Remove `deviceConnectionService` from `deviceMediaService` deps. Add `deviceStatusProvider` to `deviceMediaService` deps.
- `register-streaming.ts`: Update `streamingService` deps from `deviceService` to `deviceMediaService` + `deviceStorageService`
- `register-ui.ts`: Update `appState` deps from `deviceService` to `deviceMediaService`
- `register-orchestrators.ts`: Update `deviceOrchestrator` deps from `deviceService` to `deviceMediaService`

**Step 7: Update container type map**

Remove `deviceService` and `deviceConnectionService` entries.

**Step 8: Delete the 2 old files**

Delete `device.service.ts` and `device-connection.service.ts`.

**Step 9: Update tests**

- Delete `tests/unit/features/devices/services/device.service.test.js`
- Delete or merge `tests/unit/features/devices/services/device-connection.service.test.js` into device-media tests
- Update mock dependencies in:
  - `device.orchestrator.test.js`
  - `device-operation-sequencer.service.test.js`
  - `tests/unit/features/streaming/services/streaming.service.test.js`
  - `tests/unit/ui/app.state.test.js`
  - `tests/unit/app/renderer/container.test.js`

**Step 10: Run tests**

Run: `npm run test:run`
Expected: All tests pass

**Step 11: Commit**

```bash
git add -A
git commit -m "refactor(devices): remove DeviceService facade, absorb DeviceConnectionService into DeviceMediaService"
```

---

## Phase 3: Auto-Wiring Migration

> Convert registration files to use `autoRegister()`. Each file is independent. Add `static dependencies` to each class being auto-wired.

### Task 3.1: Add Static Dependencies to All Eligible Classes

For each class that will be auto-wired, add a `static readonly dependencies` array and update the constructor to use it:

```typescript
class StreamingOrchestrator extends BaseOrchestrator {
  static readonly dependencies = [
    'streamingService', 'appState', 'streamViewService',
    'renderPipelineService', 'gpuRecordingService', 'settingsService',
    'eventBus', 'loggerFactory'
  ] as const;

  constructor(deps) {
    super(deps, [...StreamingOrchestrator.dependencies], 'StreamingOrchestrator');
  }
}
```

This must be done for all eligible classes referenced by registration files targeted in this phase.

**Approach:** Process registration files one at a time. For each file, add `static dependencies` to all its eligible classes, then convert the registrations to `autoRegister()`, then test.

---

### Task 3.2: Convert register-orchestrators.ts (all eligible registrations; recalculate exact count after Phase 2)

**Files:**
- Modify: `src/renderer/application/di/register-orchestrators.ts`
- Modify: All orchestrator class files (add `static dependencies`)

**Step 1: Add static dependencies to each orchestrator class**

For each orchestrator, add the `static readonly dependencies` array matching the current constructor's `requiredDeps` array. Update the constructor to reference it:
```typescript
constructor(deps) {
  super(deps, [...ClassName.dependencies], 'ClassName');
}
```

Do this for all orchestrators referenced in `register-orchestrators.ts`:
- `DeviceOrchestrator`
- `StreamingAudioOrchestrator`
- `StreamingOrchestrator`
- `CaptureOrchestrator`
- `SettingsPreferencesOrchestrator`
- `SettingsFullscreenService`
- `SettingsDisplayModeOrchestrator`
- `PerformanceOrchestrator` (already has it from Task 2.3)
- `PerformanceMetricsService`
- `PerformanceStateService`
- `PerformanceAnimationService`
- `UISetupOrchestrator`
- `AppOrchestrator`

**Step 2: Convert register-orchestrators.ts**

Replace all `registerSingleton()` blocks with `autoRegister()` calls:

```typescript
import { ... } from '...';

export function registerOrchestrators(container: RegistrableContainer<RendererContainerMap>): void {
  // Services (misplaced, will move in future cleanup)
  container.autoRegister('fullscreenService', SettingsFullscreenService);
  container.autoRegister('performanceMetricsService', PerformanceMetricsService);
  container.autoRegister('performanceStateService', PerformanceStateService);
  container.autoRegister('animationPerformanceService', PerformanceAnimationService);

  // Orchestrators
  container.autoRegister('deviceOrchestrator', DeviceOrchestrator);
  container.autoRegister('streamingAudioOrchestrator', StreamingAudioOrchestrator);
  container.autoRegister('streamingOrchestrator', StreamingOrchestrator);
  container.autoRegister('captureOrchestrator', CaptureOrchestrator);
  container.autoRegister('preferencesOrchestrator', SettingsPreferencesOrchestrator);
  container.autoRegister('displayModeOrchestrator', SettingsDisplayModeOrchestrator);
  container.autoRegister('performanceOrchestrator', PerformanceOrchestrator);
  container.autoRegister('uiSetupOrchestrator', UISetupOrchestrator);
  container.autoRegister('appOrchestrator', AppOrchestrator);
}
```

**Step 3: Run tests**

Run: `npm run test:run`
Expected: All tests pass

**Step 4: Commit**

```bash
git add -A
git commit -m "refactor(di): convert register-orchestrators.ts to autoRegister"
```

---

### Task 3.3: Convert register-capture.ts (all eligible registrations)

Add `static dependencies` to `CaptureService`, `CaptureGpuRecordingService`, `CaptureSaveService`, `TranscodeService` (check if eligible -- TranscodeService may be in register-infrastructure).

Convert all 4 registrations to `autoRegister()`.

Run: `npm run test:run`

Commit: `refactor(di): convert register-capture.ts to autoRegister`

---

### Task 3.4: Convert register-streaming.ts (all eligible registrations)

Add `static dependencies` to the streaming registration's class.

Convert to `autoRegister()`.

Run: `npm run test:run`

Commit: `refactor(di): convert register-streaming.ts to autoRegister`

---

### Task 3.5: Convert register-devices.ts (all eligible registrations)

Add `static dependencies` to eligible device classes. Keep `adapterFactory` as custom factory (it has positional args and calls `initialize()`).

Convert all eligible registrations to `autoRegister()` (keep `adapterFactory` as custom factory).

Run: `npm run test:run`

Commit: `refactor(di): convert register-devices.ts to autoRegister`

---

### Task 3.6: Convert register-ui.ts (all eligible registrations)

Add `static dependencies` to eligible UI classes. Keep `uiComponentRegistry` and `uiEffects` as custom factories.

Convert all eligible registrations to `autoRegister()` (keep explicit custom factories as needed).

Run: `npm run test:run`

Commit: `refactor(di): convert register-ui.ts to autoRegister`

---

### Task 3.7: Convert register-infrastructure.ts (all eligible registrations)

Add `static dependencies` to eligible infrastructure classes. Keep all 8 custom factories:
- `storageService` (config object)
- `deviceIpcAdapter` (pre-creates logger)
- `deviceChangeDebounceAdapter` (pre-creates logger)
- `canvasRenderer` (positional args)
- `streamingRendererFactory` (positional args + Map + init)
- `ipcClient` (external global)
- `deviceStatusProvider` (positional args)
- `animationCache` (no deps, just `new`)

Convert all eligible registrations to `autoRegister()`.

Run: `npm run test:run`

Commit: `refactor(di): convert register-infrastructure.ts to autoRegister`

---

### Task 3.8: Update Container Tests

**Files:**
- Modify: `tests/unit/app/renderer/container.test.js`

Remove per-registration verification tests for auto-wired services. Update the key-set completeness test to account for both `registerSingleton` and `autoRegister` mock calls. Keep tests for remaining custom factory registrations.

Run: `npm run test:run`

Commit: `refactor(test): update container tests for autoRegister migration`

---

### Task 3.9: Phase 3 Validation

Run: `npm run test:run && npm run lint`
Expected: All tests pass, no lint errors

---

## Phase 4: Bridge + Service LifecycleService Migration

> Convert bridges and Tier-1 services to extend LifecycleService.

### Task 4.1: Migrate UIEventBridge to LifecycleService

**Files:**
- Modify: `src/renderer/presentation/bridges/ui-event.bridge.ts`

Replace `extends BaseService` with `extends LifecycleService`. Remove hand-rolled `_subscriptions`, `initialize()`, and `dispose()`. Use `onInitialize()` with `subscribeWithCleanup()`.

```typescript
import { LifecycleService } from '@shared/base/lifecycle-service.base.ts';
import { EventChannels } from '@shared/events/event-channels.js';

export class UIEventBridge extends LifecycleService {

  constructor(dependencies) {
    super(dependencies, ['eventBus', 'uiController', 'presentationModeService', 'loggerFactory'], 'UIEventBridge');
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.UI.STATUS_MESSAGE]: (data) => this._handleStatusMessage(data),
      [EventChannels.UI.DEVICE_STATUS]: (data) => this._handleDeviceStatus(data),
      // ... all other event handlers (keep existing handler methods unchanged)
    });
  }

  // Keep all _handle* methods exactly as they are
  // Remove the old _subscribeToEvents(), initialize(), and dispose() methods
}
```

Run: `npm run test:run`

Commit: `refactor(bridges): migrate UIEventBridge to LifecycleService`

---

### Task 4.2: Migrate CaptureUIBridge to LifecycleService

Same pattern as Task 4.1. Replace BaseService with LifecycleService, use `onInitialize()` + `subscribeWithCleanup()`, remove hand-rolled dispose.

Run: `npm run test:run`

Commit: `refactor(bridges): migrate CaptureUIBridge to LifecycleService`

---

### Task 4.3: Migrate TranscodeUIBridge to LifecycleService

Same pattern. Note: TranscodeUIBridge has extra dispose logic (`this._toast?.dispose()`) -- put that in `onDispose()` override.

Run: `npm run test:run`

Commit: `refactor(bridges): migrate TranscodeUIBridge to LifecycleService`

---

### Task 4.4: Migrate UpdateUIBridge to LifecycleService

The new `UpdateUIBridge` (moved in Task 2.2) also needs to extend LifecycleService with the same pattern.

Run: `npm run test:run`

Commit: `refactor(bridges): migrate UpdateUIBridge to LifecycleService`

---

### Task 4.5: Migrate UpdateService to LifecycleService

Replace `extends BaseService` with `extends LifecycleService`. Move IPC listener setup into `onInitialize()`. Move cleanup into `onDispose()`. Remove hand-rolled `_initialized` flag and `_cleanupFns` array.

The `_cleanupFns` pattern maps to `_subscriptions` from LifecycleService. Push the IPC cleanup functions into `this._subscriptions` directly.

Run: `npm run test:run`

Commit: `refactor(updates): migrate UpdateService to LifecycleService`

---

### Task 4.6: Migrate TranscodeService to LifecycleService

Same pattern as UpdateService. Replace `_initialized` and `_cleanupFns` with LifecycleService equivalents.

Run: `npm run test:run`

Commit: `refactor(transcode): migrate TranscodeService to LifecycleService`

---

### Task 4.7: Migrate FullscreenService to LifecycleService

Replace `extends BaseService` with `extends LifecycleService`. Move DOM listener and IPC listener setup into `onInitialize()`. Push cleanup functions into `_subscriptions`. Move DOM listener removal into `onDispose()`.

Run: `npm run test:run`

Commit: `refactor(settings): migrate FullscreenService to LifecycleService`

---

### Task 4.8: Phase 4 Validation

Run: `npm run test:run`
Expected: All tests pass

---

## Phase 5: Dead Code Cleanup

### Task 5.1: Delete Dead Files

**Files:**
- Delete: `src/renderer/presentation/config/storage-keys.config.ts` (0 consumers)
- Delete: `src/renderer/presentation/lib/filename-generator.utils.ts` (0 runtime consumers)

Run: `npm run test:run`

Commit: `chore: remove dead code files (storage-keys re-export, filename-generator re-export)`

---

### Task 5.2: Remove Re-Export Config Files and Update Imports

**Files:**
- Delete: `src/renderer/presentation/config/constants.config.ts`
- Delete: `src/renderer/presentation/config/update-state.config.ts`
- Delete: `src/renderer/presentation/lib/file-download.utils.ts`
- Modify: source files that imported from re-exports (update to import from `@shared/` directly)

Update these imports:
1. `body-class.class.ts`: `@renderer/presentation/config/constants.config` -> `@shared/config/timing.config`
2. `button-feedback.effect.ts`: same change
3. `controls-auto-hide.effect.ts`: same change
4. `capture-ui.bridge.ts`: same change
5. `hide-timer.class.js`: same change
6. `update-section.component.js`: `@renderer/presentation/config/update-state.config` -> `@shared/config/update-state.config`
7. `ui.controller.js`: `@renderer/presentation/lib/file-download.utils` -> `@shared/lib/file-download.utils`

Also update affected tests that import renderer re-export paths:
- `tests/unit/ui/effects.test.js`
- `tests/unit/features/updates/ui/update-section.component.test.js`
- `tests/unit/renderer/lib/file-download.utils.test.js`
- `tests/unit/utils/FilenameGenerator.test.js`

Run: `npm run test:run && npm run lint`

Commit: `chore: remove re-export config/lib files, update source/test import paths to source`

---

### Task 5.3: Remove Dead Method

**Files:**
- Modify: `src/renderer/application/orchestrators/device.orchestrator.ts`

Remove the `isDeviceConnected()` method (dead code, never called externally). This was identified as dead code in the domain deep-dive.

Run: `npm run test:run`

Commit: `chore: remove dead DeviceOrchestrator.isDeviceConnected() method`

---

### Task 5.4: Final Validation

**Step 1: Run full test suite**

Run: `npm run test:run`
Expected: All tests pass

**Step 2: Run linter**

Run: `npm run lint`
Expected: No errors

**Step 3: Verify line reduction**

Run: `find src -name '*.ts' -o -name '*.js' | xargs wc -l | tail -1`
Compare with baseline to confirm ~820-870 net line reduction.

---

## Phase 6: Core Cleanup Follow-Up (Post-Consolidation)

> Execute only after Phase 5 Final Validation passes. This phase targets maintainability, type safety, and structural cleanup while preserving behavior.

**Phase 6 Entry Gate (required before Task 6.1):**
- `npm run test:run`
- `npm run lint`
- `npm run architecture:type-debt:check`
- `node scripts/architecture-scorecard.js`

### Task 6.1: Baseline Lock + Scope Guard

**Goal:** Freeze behavior and architecture baseline before follow-up refactors.

**Step 1: Capture baseline metrics**

Run:
- `npm run test:run`
- `npm run lint`
- `npm run architecture:type-debt:report`
- `node scripts/architecture-scorecard.js`

Record:
- test count/pass status
- lint status
- type-debt diagnostics and top files
- architecture scorecard summary

**Step 2: Commit baseline report updates (if any artifacts/docs changed)**

```bash
git add artifacts docs
git commit -m "chore(plan): capture pre-phase-6 quality baseline"
```

---

### Task 6.2: Presentation Subscription + Dispose Cleanup

**Goal:** Remove repeated EventBus unsubscribe boilerplate and unnecessary dispose nulling across presentation components.

**Files:**
- Create: `src/renderer/presentation/lib/event-subscriptions.utils.ts`
- Modify:
  - `src/renderer/presentation/features/updates/update-section.component.js`
  - `src/renderer/presentation/features/notes/notes-panel.component.js`
  - `src/renderer/presentation/features/toolbar/components/shader-preset-list.component.js`
  - `src/renderer/presentation/features/toolbar/components/shader-slider-controls.component.js`
  - `src/renderer/presentation/features/toolbar/components/cinematic-toggle.component.js`

**Step 1: Add shared cleanup helper**
- Add utility functions to safely dispose/unsubscribe arrays of callbacks.
- Preserve current error-tolerant behavior (`notes-panel` currently catches unsubscribe errors).

**Step 2: Refactor target components**
- Replace inline `forEach(unsubscribe => ...)` blocks with helper calls.
- Remove explicit `= null` assignments that are not required for correctness.
- Keep all lifecycle ordering and side effects unchanged.

**Step 3: Run focused tests**

Run:
- `npx vitest run tests/unit/features/updates/ui/update-section.component.test.js`
- `npx vitest run tests/unit/features/notes/ui/notes-panel.component.test.js`
- `npx vitest run tests/unit/ui/features/toolbar/shader-preset-list.component.test.js`
- `npx vitest run tests/unit/ui/features/toolbar/shader-slider-controls.component.test.js`
- `npx vitest run tests/unit/ui/features/toolbar/cinematic-toggle.component.test.js`

**Step 4: Run full validation**

Run: `npm run test:run && npm run lint`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(presentation): extract subscription cleanup utility and trim dispose boilerplate"
```

---

### Task 6.3: Auto-Hide Effect Consolidation

**Goal:** Consolidate shared behavior across cursor/toolbar/controls auto-hide effects and standardize listener lifecycle.

**Files:**
- Create: `src/renderer/presentation/effects/auto-hide.base.ts` (or equivalent shared helper)
- Modify:
  - `src/renderer/presentation/effects/cursor-auto-hide.effect.ts`
  - `src/renderer/presentation/effects/toolbar-auto-hide.effect.ts`
  - `src/renderer/presentation/effects/controls-auto-hide.effect.ts`

**Step 1: Extract common behavior**
- Shared enabled/disabled lifecycle guard.
- Shared requestAnimationFrame throttling pattern.
- Shared listener registration/removal pattern (prefer `createDomListenerManager` where practical).

**Step 2: Keep feature-specific behavior in each effect**
- Preserve `MutationObserver` panel logic in `ToolbarAutoHide`.
- Preserve fullscreen-specific callbacks/timer flow in `ControlsAutoHide`.
- Preserve cursor CSS class behavior in `CursorAutoHide`.

**Step 3: Run focused tests**

Run:
- `npx vitest run tests/unit/ui/features/streaming/effects/cursor-auto-hide.test.js`
- `npx vitest run tests/unit/ui/features/toolbar/effects/toolbar-auto-hide.test.js`
- `npx vitest run tests/unit/ui/features/fullscreen/effects/controls-auto-hide.test.js`

**Step 4: Run full validation**

Run: `npm run test:run && npm run lint`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(presentation): consolidate auto-hide effects around shared lifecycle patterns"
```

---

### Task 6.4: DI Typing Hardening + Container API Clarity

**Goal:** Improve compile-time safety and make class-vs-factory registration explicit.

**Files:**
- Modify:
  - `src/renderer/infrastructure/di/service-container.factory.ts`
  - `src/renderer/application/di/registrable-container.type.ts`
  - `src/renderer/application/di/renderer-container-map.type.ts`
  - DI registration files under `src/renderer/application/di/`
  - `tests/unit/renderer/infrastructure/di/service-container.test.js`
  - `tests/unit/renderer/infrastructure/di/service-container.types.test.ts`
  - `tests/unit/app/renderer/container.test.js`

**Step 1: Clarify registration APIs**
- Add explicit class/factory pathways (or equivalent) to eliminate ambiguity where all functions are treated as constructors.
- Preserve backward compatibility where needed, but migrate internal registrations to explicit APIs.

**Step 2: Strengthen RendererContainerMap types**
- Replace `unknown` entries with concrete types for highest-use services first.
- Keep key-safety contracts intact for registration/resolve operations.

**Step 3: Update tests**
- Expand container tests for new API behavior.
- Update type tests for stricter map typing.

**Step 4: Run validation**

Run:
- `npx vitest run tests/unit/renderer/infrastructure/di/service-container.test.js`
- `npx vitest run tests/unit/renderer/infrastructure/di/service-container.types.test.ts`
- `npx vitest run tests/unit/app/renderer/container.test.js`
- `npm run test:run && npm run lint`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(di): clarify registration APIs and harden renderer container typing"
```

---

### Task 6.5: Settings + IPC Boilerplate Reduction

**Goal:** Reduce repetitive setter/getter and IPC handler error wrapper boilerplate without changing behavior.

**Files:**
- Modify:
  - `src/renderer/infrastructure/services/settings/settings.service.ts`
  - `src/main/ipc/handlers/update.handler.ts`
  - `src/main/ipc/handlers/transcode.handler.ts`
  - `src/main/ipc/handlers/device.handler.ts`
  - `src/main/ipc/handlers/performance.handler.ts`
  - `src/main/ipc/handlers/shell.handler.ts`
  - `src/main/ipc/handlers/window.handler.ts`
  - `src/main/ipc/handlers/gpu.handler.ts`
- Create (if needed): shared IPC handler utility in `src/main/ipc/` or `src/shared/`

**Step 1: Refactor SettingsService**
- Use declarative metadata (keys/defaults/emit channels/clamp rules) to centralize repetitive logic.
- Preserve public API method names currently used by UI/orchestrators.

**Step 2: Add IPC handler wrapper utility**
- Wrap common `try/catch/log/typed-error-response` flow.
- Keep per-handler payload validation and business logic local.

**Step 3: Update tests**
- Run settings service tests.
- Run main IPC registry tests and any handler-specific coverage.

**Step 4: Run validation**

Run:
- `npx vitest run tests/unit/features/settings/services/settings.service.test.js`
- `npx vitest run tests/unit/app/main/ipc-handler.registry.test.js`
- `npm run test:run && npm run lint`

**Step 5: Commit**

```bash
git add -A
git commit -m "refactor(core): reduce settings and IPC handler boilerplate with shared patterns"
```

---

### Task 6.6: Type-Debt Tranche (Worker + Hotspots)

**Goal:** Reduce strict type debt with low-risk, high-impact fixes.

**Primary target files:**
- `src/renderer/infrastructure/rendering/workers/render.worker.ts`
- Top diagnostic hotspots from latest `architecture:type-debt:report`

**Step 1: Remove `any` from render worker message handlers**
- Introduce concrete message payload typing tied to worker protocol.
- Replace ad-hoc casts with validated narrow types.

**Step 2: Address highest-volume debt buckets**
- Prioritize `TS2571`, `TS7006`, `TS2339` in top 3-5 files by count.
- Avoid broad signature changes that risk behavior regressions.

**Step 3: Validate debt reduction**

Run:
- `npm run architecture:type-debt:report`
- `npm run architecture:type-debt:check`

Expected:
- Reduced diagnostics count and/or reduced allowlist pressure.
- No new boundary or lint regressions.

**Step 4: Full validation**

Run: `npm run test:run && npm run lint`

**Step 5: Commit**

```bash
git add -A
git commit -m "chore(types): reduce strict type debt in render worker and top hotspot files"
```

---

### Task 6.7: Phase 6 Final Validation

**Step 1: Run full quality gate**

Run:
- `npm run test:run`
- `npm run lint`
- `npm run architecture:type-debt:check`
- `node scripts/architecture-scorecard.js`

**Step 2: Compare metrics with Task 6.1 baseline**
- Confirm functionality parity (tests/lint/architecture boundaries).
- Document net line change and net type debt change.

**Step 3: Final commit (if metrics/docs updated)**

```bash
git add -A
git commit -m "chore(plan): complete phase 6 core cleanup validation and metrics"
```

---

## Appendix: Execution Strategy

### Agent Allocation

| Stage | Tasks | Execution | Agent | Model |
|-------|-------|-----------|-------|-------|
| Phase 1 | 1.1-1.6 | Sequential by ME | - | - |
| Phase 2b | 2.1 | Subagent | Coder | sonnet |
| Phase 2a | 2.2 | Subagent | Coder | sonnet |
| Phase 2c | 2.3 | Sequential by ME | - | - |
| Phase 2d | 2.4 | Sequential by ME | - | - |
| Phase 3 | 3.1-3.8 | Subagents (per file) | Coder | sonnet |
| Phase 4 | 4.1-4.7 | Subagents (parallel) | Coder | haiku |
| Phase 5 | 5.1-5.3 | Subagent | Coder | haiku |
| Phase 6 | 6.1-6.7 | Sequential by ME (targeted subagents for focused refactors) | Coder | sonnet |

### Risk Matrix

| Phase | Risk | Key Concern | Mitigation |
|-------|------|-------------|------------|
| 1 | LOW | `isInitialized` becomes getter | Test fixes identified |
| 2b | LOW | Single consumer, trivial logic | Event channel unchanged |
| 2a | LOW | Identical API on UpdateService | Just renaming references |
| 2c | MEDIUM | Initialization order | Explicit phased init in code |
| 2d | HIGH | 5 consumers to rewire | Execute last, extra validation |
| 3 | MEDIUM | Test mock patterns change | Update container test |
| 4 | MEDIUM | Lifecycle contract change | Each bridge tested independently |
| 5 | LOW | Dead code removal | Zero consumers verified |
| 6 | MEDIUM | Broad maintainability refactors touching presentation/DI/main IPC/type system | Execute in isolated tasks with strict per-task validation gates |

### Rollback Strategy

- Git commit after each task
- If any phase fails validation, revert to last passing commit
- Phase 2 sub-tasks are independent -- one failing doesn't block others
