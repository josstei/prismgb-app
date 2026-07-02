# P5 — Standard Base Layer & Foundation Libraries Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the triplicated lifecycle/disposal facade into one core `ManagedLifecycleHost` with keyed scheduling and grouped disposal, and replace four hand-rolled foundations (signals runtime, winston logger, `createDeferred`, generic type utilities) with maintained libraries or ES built-ins — plus the two open P3/P4 follow-ups (`getElectronApp` unit test, `packages/*` residue removal).

**Architecture:** Batch 5A extracts `ManagedLifecycleHost` in `src/platform/core/primitives/` owning the `DisposableBag` facade (timers/frames/track/replace/cancel + keyed `schedule`/`scheduleInterval`/`cancelScheduled` + `replaceManagedGroup`); `BaseService`, `BaseOrchestrator`, and `PresentationComponent` compose it with unchanged public APIs, then the keyed-timer call sites route through the new helpers. Batches 5B/5C are library swaps behind existing seams: `@preact/signals-core` behind `platform/ui-base/reactive`, `electron-log` behind `LoggerFactoryLike`, `Promise.withResolvers` behind the `Deferred<T>` alias, `type-fest` behind `types/type-utils.ts`, plus new core `debounce`/`abortableDelay`/`raceWithTimeout` primitives.

**Tech Stack:** TypeScript 5.9 / Electron 41 / Vitest 3 / `@preact/signals-core` / `electron-log` v5 / `type-fest` / dependency-cruiser + knip gates (P4-era).

## Global Constraints

- Branch: create `northstar/p5` from `refactor/gpu_normalization` at `3f968528` (= tag `northstar-p4`); clean tree required before Task 1.
- Per-task gate ladder (every task, before its commit): `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`.
- `npm run dev:smoke` is MANDATORY additionally for every task marked **[dev:smoke]** (base-class / boot-path change class).
- Commit subjects: conventional commits, **≤ 100 chars** (commitlint enforces locally and in CI). NO AI attribution lines (no "Generated with…", no "Co-Authored-By"). Never `--no-verify`.
- No inline code comments; JSDoc only. When a step rewrites a method that currently has inline comments, the rewrite drops them (fold load-bearing content into JSDoc).
- **Offline sandbox npm must never install packages or regenerate the lockfile from scratch** — it strips `resolved`/`integrity` and breaks CI `npm ci`. New packages are installed ONLY in owner-run online steps (Task 1). The only sanctioned offline lockfile operation is `npm install --package-lock-only` after a `package.json`-only removal (inherits existing metadata), followed by the integrity check below.
- Lockfile integrity check (must print `0` after any lockfile-touching step):
  `node -e "const l=require('./package-lock.json');const bad=Object.entries(l.packages).filter(([k,v])=>k.startsWith('node_modules/')&&!v.link&&(!v.resolved||!v.integrity));console.log(bad.length);process.exitCode=bad.length?1:0"`
- Heredocs are blocked in this environment. `rm -rf` is sandbox-blocked (owner-run only). Use `git rm` for tracked files.
- P4-era gates that bind every task: new core/ui-base exports MUST ship through the registry entrypoints (`src/platform/core/index.ts`, `src/platform/ui-base/reactive/index.ts` — otherwise `app-to-platform-internals`/per-module depcruise rules fire); no new `src/` or `src/platform` top-level entries (structure guards assert exact sets); every dependency must be knip-traceable (staged `ignoreDependencies` waivers are added in Task 1 and MUST all be removed by end of Task 12); `.dependency-cruiser.cjs` is not modified, so `tests/unit/scripts/dependency-boundaries.test.js` `EXPECTED_VIOLATIONS` must not change.
- Single-writer discipline: tasks run sequentially; one implementer on the tree at a time.

---

## Verified premises & scope resolutions (2026-07-02, live tree at `3f968528`)

These were re-verified against the live tree; where the normalization audit (`CODEBASE_NORMALIZATION_ANALYSIS.md`, pre-P3 paths) disagrees with reality, the resolutions below govern.

1. **Paths**: all `packages/prismgb-*` audit paths are now `src/platform/<name>/…` (P3). Base classes: `src/platform/core/primitives/{service.base,orchestrator.base}.ts`; presentation base: `src/platform/ui-base/lifecycle/presentation-component.base.ts`.
2. **UIB-3 disposition — @floating-ui/dom is NOT adopted (decision record).** `calculateAnchoredDisclosureLayout` (`src/platform/ui-base/widgets/disclosure.class.ts:100-172`) is a *pure* rect→layout calculator whose outputs are six CSS custom properties **including min/max width/height bounds**; its sole consumer (`notes-panel-layout.component.ts:66`) and its 3 precise unit tests (`tests/unit/renderer/presentation/primitives/disclosure.test.ts`) drive it with plain numbers. `@floating-ui/dom`'s `computePosition` is async, element-measured (zero-size under happy-dom), and computes x/y only — the `minFittableHeight`/`minDockedVisibleHeight` floors and width-fallback math the north-star says to honor would all become custom middleware, i.e. the 95 LOC survive relocated, plus a dependency, minus the pure tests. The audit's own condition — "retain a thin adapter only if the docked-height floors prove necessary" — is met: the floors are unconditional in the calculation and asserted by tests. **Resolution: keep the pure calculator; `@floating-ui/dom` is dropped from the Task 1 install.** If the owner overrides, add it back as a separate task.
3. **INF-3 true scope**: the audit's proposal names exactly two extractable primitives. `_sleep` (`audio-pipeline.service.ts:480-498`) IS `abortableDelay`; `_waitForCaptureDrain` (`gpu-recording.service.ts:327-343`, NOT the audit's capture/ path) IS `raceWithTimeout` (three outcomes — the site distinguishes `'failed'`). `_waitForTrackUnmute`/`_waitForAudioEnergy` keep their timing-critical domain guards inline per the audit ("the abort/token domain logic remains local"); the optional `settleOnce` helper is NOT built.
4. **CORE-3 true consumer count**: core's `createDeferred` has exactly ONE src consumer (`capture.service.ts:1,289`) and one test block (`tests/unit/platform/core/timing-async.test.ts:26-37`). The audit's "12 consumers" counted the unrelated `_createDeferredComponentDependencies`/`DeferredComponentDependencies` names in orchestrator/controller files and two test-local `createDeferred` helpers (`device-runtime.service.test.ts:50`, `streaming.service.test.ts:23`) — none import core's; all stay untouched.
5. **MAIN-1 test coupling is total, not two tests**: ALL of `tests/unit/main/infrastructure/logging/main-logger.test.js` mocks winston, and `createWinstonLoggerMock`/`createWinstonRootLoggerMock` live in `tests/factories/system.factory.js:120-139` (re-exported at `tests/factories/index.js:113-114`) with no other consumer. The whole test file is rewritten and both factories deleted. Accepted divergences from winston (record, don't replicate): one rotating log file instead of the error.log/combined.log pair (electron-log keeps a single `.old` archive); Error objects pass through to electron-log's native serialization instead of the `{error, stack}` meta shaping.
6. **INF-9/X-5 sites** (all confirmed as keyed `setTimeout`/`setInterval` + `disposables.replace(KEY, clear…)`): `health.service.ts:78-82`, `viewport.service.ts:167-181,213-220` (plus a redundant `_resizeTimeout` mirror field asserted by 3 white-box tests at `viewport.service.test.ts:88,308-314,342-348`), `performance-state.service.ts:199-205`, `update.service.ts:339-354` (+ `stopAutoCheck:362-370`), `transcode.service.ts:324-333` (dynamic per-job key). **`settings-fullscreen.service.ts:30-33` is NOT converted** (decision record): its document listener is keyed deliberately for re-init safety (`initialize()` cancels the key first); converting to plain `subscribe()` would double-register on re-init. It is not a timer; it stays.
7. **UIB-6 sites**: `disclosure.class.ts:331-336`, `listbox-dropdown.class.ts:148-154` (group teardown PLUS an async `disclosure.dispose()` + field-null that must run after the listeners), `activity-auto-hide.controller.ts:79-82`.
8. **Subclass coupling that constrains 5A**: `settings-menu.component.ts:304` reads `this._disposables.size` → `PresentationComponent` keeps `_disposables` (as a getter over the host's bag). 16 files use `this.disposables.…` directly on `BaseService` subclasses → `BaseService.disposables` stays. `BaseService.timeout` becomes self-releasing-on-fire (adopting `PresentationComponent`'s leak-free semantics); disposers stay idempotent so this is caller-invisible.
9. **UIB-2 deltas**: hand-rolled `computed` is eager (`signal.ts:83-88`); preact's is lazy and glitch-free. Direct `./signal.js` importers: `reactive/dom-bindings.ts:1-2`, `reactive/index.ts:1-2`, and the two test files — nothing else. Consumers import only via `@platform/ui-base`(`/reactive`). Preact throws on effects that write signals they read (self-cycle); no consumer does this (old runtime would have infinite-looped).
10. **CORE-3 mechanics**: TS 5.9.3; `tsconfig.base.json:87-91` `lib: ["ES2022", "DOM", "DOM.Iterable"]` — bump to `ES2024` (ships `lib.es2024.promise` / `PromiseWithResolvers`); `tsconfig.app.json`/`tsconfig.json`/`tsconfig.test.json` all extend it (no local `lib`). Electron 41 (Node 22 / Chromium 138) supports `Promise.withResolvers` at runtime.
11. **CORE-4**: `type-fest` ships `ValueOf`/`UnionToIntersection` with compatible signatures; `LeafValues`/`AssertNever` are bespoke and stay. `type-fest` is type-only → devDependency.
12. **knip staging**: knip flags unused (dev)dependencies, so the three new packages are added to `knip.json` `ignoreDependencies` in Task 1 and each waiver is REMOVED in the task that consumes the package (7/11/12). Zero staged waivers may remain at exit. `tests/factories/**` is outside knip's `project` (`src/**`) — deleting the winston factories is hygiene, not gate-driven.
13. **winston removal ordering**: winston stays installed until Task 12 (its import must typecheck through Tasks 2–11). Task 12 removes it from `package.json`, syncs the lockfile offline-safely (`npm install --package-lock-only`), and verifies integrity — no owner touchpoint needed beyond Task 1.
14. **Base-class covering tests**: `tests/unit/shared/base/{service,orchestrator}.test.js` (BaseService/BaseOrchestrator), `tests/unit/platform/ui-base/lifecycle/presentation-component.test.ts`, widget tests under `tests/unit/renderer/presentation/primitives/`. The platform `TranscodeService` has NO dedicated unit test (validated via typecheck + full suite + integration); `update.service` keyed timers are covered by `tests/unit/main/update.service.test.ts:402-510`.

## Execution strategy

| Stage | Tasks | Risk | Executor |
|---|---|---|---|
| Install & staging | 1 | LOW (owner-run online) | Owner + controller |
| 5A base layer | 2, 3, 4, 5 | HIGH (base-class change class) | Sonnet implementers, sequential, dev:smoke each |
| Follow-up test | 6 | LOW | Haiku implementer |
| 5B swaps | 7, 8, 9 | MED | Sonnet implementers |
| 5C swaps | 10, 11, 12 | MED (12 touches boot path) | Sonnet implementers |
| Exit ritual | 13 | — | Controller |

Dependencies: 2 → 3 → 4 → 5 (host before bases before sites); 9 → 10 (both edit `async.utils.ts`); 1 before 7/11/12 (deps installed). Tasks 6, 8 are order-free but run in sequence (single-writer — parallel mutating agents require worktree isolation; not used). Rollback: every task is one commit on `northstar/p5`; `git reset --hard HEAD~1` reverts a failed task. Controller reviews each task diff against the brief and independently re-runs its key claims.

---

### Task 1: Owner-run install, knip staging, residue cleanup

**Files:**
- Modify: `package.json`, `package-lock.json` (owner-run npm), `knip.json`
- Delete (untracked residue): `packages/` (1.8 MB of gitignored `dist`/`node_modules`/`.turbo` from pre-P3)

**Interfaces:**
- Produces: `@preact/signals-core` + `electron-log` in `dependencies`, `type-fest` in `devDependencies` (Tasks 7/12/11 consume); knip waivers `"@preact/signals-core"`, `"electron-log"`, `"type-fest"` in `ignoreDependencies` (removed by Tasks 7/11/12).

- [ ] **Step 1: Preconditions & branch**

```bash
git status --short
git rev-parse HEAD
```
Expected: empty status; `3f968528…`. Then:

```bash
git checkout -b northstar/p5
git add docs/northstar/2026-07-02-p5-implementation-plan.md
git commit -m "docs(northstar): add P5 implementation plan"
```

- [ ] **Step 2 (OWNER-RUN, online, outside the sandbox): install the three libraries**

```bash
npm install @preact/signals-core electron-log
npm install --save-dev type-fest
rm -rf packages
```
Note: `@floating-ui/dom` is deliberately NOT installed (Verified premise 2). `winston` is NOT uninstalled here (premise 13).

- [ ] **Step 3: Verify lockfile integrity**

```bash
node -e "const l=require('./package-lock.json');const bad=Object.entries(l.packages).filter(([k,v])=>k.startsWith('node_modules/')&&!v.link&&(!v.resolved||!v.integrity));console.log(bad.length);process.exitCode=bad.length?1:0"
```
Expected: `0`. Also `git diff package-lock.json | grep -c '^-.*"resolved"'` should be near-zero (no mass metadata deletion).

- [ ] **Step 4: Stage knip waivers**

In `knip.json`, change:

```json
      "ignoreDependencies": ["@electron/notarize"],
```
to:

```json
      "ignoreDependencies": [
        "@electron/notarize",
        "@preact/signals-core",
        "electron-log",
        "type-fest"
      ],
```

- [ ] **Step 5: Gate ladder**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all pass (156 files / 1,951 tests).

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json knip.json
git commit -m "build(deps): add P5 foundation libraries behind staged knip waivers"
```

---

### Task 2: `ManagedLifecycleHost` + `DisposableBag.replaceGroup` (core)

**Files:**
- Create: `src/platform/core/primitives/managed-lifecycle-host.ts`
- Modify: `src/platform/core/primitives/disposable-bag.ts` (add `replaceGroup`), `src/platform/core/index.ts`
- Test: `tests/unit/platform/core/managed-lifecycle-host.test.ts` (create)

**Interfaces:**
- Consumes: `DisposableBag`, `Disposable`, `DisposableFunction`, `DisposableKey`, `EventTargetLike` from `./disposable-bag.js`.
- Produces (Tasks 3/4/5 rely on these exact signatures):
  - `class ManagedLifecycleHost { constructor(disposables?: DisposableBag); get disposables(): DisposableBag; subscribeEvent(target, type, listener, options?): DisposableFunction; timeout<TArgs extends unknown[]>(handler: (...args: TArgs) => void, delay: number, ...args: TArgs): DisposableFunction; interval<TArgs…>(…): DisposableFunction; animationFrame(handler: FrameRequestCallback): DisposableFunction; observe(observer: { disconnect(): void }): DisposableFunction; track(disposable: Disposable): DisposableFunction; replaceManaged(key, disposable): DisposableFunction; cancelManaged(key): void | Promise<void>; schedule<TArgs…>(key: DisposableKey, handler, delay, ...args): DisposableFunction; scheduleInterval<TArgs…>(key, handler, delay, ...args): DisposableFunction; cancelScheduled(key): void | Promise<void>; replaceManagedGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction; dispose(): Promise<void> }`
  - `DisposableBag.replaceGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction` — reverse-order teardown, async members' promises awaited jointly.

- [ ] **Step 1: Write the failing tests**

Create `tests/unit/platform/core/managed-lifecycle-host.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ManagedLifecycleHost } from '../../../../src/platform/core/primitives/managed-lifecycle-host.js';

describe('ManagedLifecycleHost', () => {
  let host: ManagedLifecycleHost;

  beforeEach(() => {
    vi.useFakeTimers();
    host = new ManagedLifecycleHost();
  });

  afterEach(async () => {
    await host.dispose();
    vi.useRealTimers();
  });

  describe('timeout', () => {
    it('fires after the delay and passes arguments through', () => {
      const handler = vi.fn();
      host.timeout(handler, 100, 'payload');
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledWith('payload');
    });

    it('is cancelled by the returned disposer', () => {
      const handler = vi.fn();
      const dispose = host.timeout(handler, 100);
      dispose();
      vi.advanceTimersByTime(100);
      expect(handler).not.toHaveBeenCalled();
    });

    it('releases its bag entry after firing', () => {
      host.timeout(vi.fn(), 100);
      vi.advanceTimersByTime(100);
      expect(host.disposables.size).toBe(0);
    });
  });

  describe('interval', () => {
    it('fires repeatedly and stops on dispose', async () => {
      const handler = vi.fn();
      host.interval(handler, 50);
      vi.advanceTimersByTime(150);
      expect(handler).toHaveBeenCalledTimes(3);
      await host.dispose();
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledTimes(3);
    });
  });

  describe('schedule', () => {
    it('replaces a pending timer registered under the same key', () => {
      const first = vi.fn();
      const second = vi.fn();
      host.schedule('key', first, 100);
      host.schedule('key', second, 100);
      vi.advanceTimersByTime(100);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('cancelScheduled cancels a pending keyed timer', () => {
      const handler = vi.fn();
      host.schedule('key', handler, 100);
      host.cancelScheduled('key');
      vi.advanceTimersByTime(100);
      expect(handler).not.toHaveBeenCalled();
    });

    it('self-releases the key after firing so late cancels are no-ops', () => {
      const handler = vi.fn();
      host.schedule('key', handler, 100);
      vi.advanceTimersByTime(100);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(() => host.cancelScheduled('key')).not.toThrow();
      expect(host.disposables.size).toBe(0);
    });
  });

  describe('scheduleInterval', () => {
    it('replaces a running interval registered under the same key', () => {
      const first = vi.fn();
      const second = vi.fn();
      host.scheduleInterval('key', first, 50);
      host.scheduleInterval('key', second, 50);
      vi.advanceTimersByTime(100);
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(2);
    });
  });

  describe('replaceManagedGroup', () => {
    it('disposes group members in reverse registration order', () => {
      const order: string[] = [];
      host.replaceManagedGroup('group', [
        () => { order.push('first'); },
        () => { order.push('second'); }
      ]);
      host.cancelManaged('group');
      expect(order).toEqual(['second', 'first']);
    });

    it('replaces a previously registered group under the same key', () => {
      const stale = vi.fn();
      const fresh = vi.fn();
      host.replaceManagedGroup('group', [stale]);
      host.replaceManagedGroup('group', [fresh]);
      expect(stale).toHaveBeenCalledTimes(1);
      host.cancelManaged('group');
      expect(fresh).toHaveBeenCalledTimes(1);
    });

    it('supports async members and settles the disposal promise', async () => {
      const settled = vi.fn();
      host.replaceManagedGroup('group', [async () => { settled(); }]);
      await host.cancelManaged('group');
      expect(settled).toHaveBeenCalledTimes(1);
    });
  });

  describe('subscribeEvent', () => {
    it('registers and removes the listener through disposal', () => {
      const target = { addEventListener: vi.fn(), removeEventListener: vi.fn() };
      const listener = vi.fn();
      const dispose = host.subscribeEvent(target, 'change', listener);
      expect(target.addEventListener).toHaveBeenCalledWith('change', listener, undefined);
      dispose();
      expect(target.removeEventListener).toHaveBeenCalledWith('change', listener, undefined);
    });
  });

  describe('observe', () => {
    it('disconnects the observer on disposal', async () => {
      const observer = { disconnect: vi.fn() };
      host.observe(observer);
      await host.dispose();
      expect(observer.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('dispose', () => {
    it('clears tracked and keyed disposables', async () => {
      const tracked = vi.fn();
      const keyed = vi.fn();
      host.track(tracked);
      host.replaceManaged('key', keyed);
      await host.dispose();
      expect(tracked).toHaveBeenCalledTimes(1);
      expect(keyed).toHaveBeenCalledTimes(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/platform/core/managed-lifecycle-host.test.ts`
Expected: FAIL — cannot resolve `managed-lifecycle-host.js`.

- [ ] **Step 3: Add `replaceGroup` to `DisposableBag`**

In `src/platform/core/primitives/disposable-bag.ts`, insert after the `cancel` method (after line 105):

```ts
  replaceGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction {
    const group = disposables
      .map((entry) => toDisposableFunction(entry))
      .filter((entry): entry is DisposableFunction => entry !== null);

    return this.replace(key, () => {
      const pending: Promise<void>[] = [];
      for (const dispose of group.splice(0).reverse()) {
        const result = dispose();
        if (isPromiseLike<void>(result)) {
          pending.push(result);
        }
      }
      if (pending.length > 0) {
        return Promise.all(pending).then(() => undefined);
      }
    });
  }
```

- [ ] **Step 4: Create `src/platform/core/primitives/managed-lifecycle-host.ts`**

```ts
import {
  DisposableBag,
  type Disposable,
  type DisposableFunction,
  type DisposableKey,
  type EventTargetLike
} from './disposable-bag.js';

/**
 * Owns a DisposableBag and exposes the shared lifecycle facade — tracked
 * timers, animation frames, event listeners, observers, keyed scheduling,
 * and grouped disposal — so the layer base classes compose one
 * implementation instead of re-wrapping the bag.
 */
export class ManagedLifecycleHost {
  private readonly _disposables: DisposableBag;

  constructor(disposables: DisposableBag = new DisposableBag()) {
    this._disposables = disposables;
  }

  get disposables(): DisposableBag {
    return this._disposables;
  }

  subscribeEvent(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this._disposables.addEvent(target, type, listener, options);
  }

  timeout<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    let release: DisposableFunction = () => {};
    const handle = setTimeout(() => {
      release();
      handler(...args);
    }, delay);
    release = this._disposables.addTimeout(handle);
    return release;
  }

  interval<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    const handle = setInterval(handler, delay, ...args);
    return this._disposables.addInterval(handle);
  }

  animationFrame(handler: FrameRequestCallback): DisposableFunction {
    const handle = requestAnimationFrame(handler);
    return this._disposables.addAnimationFrame(handle);
  }

  observe(observer: { disconnect(): void }): DisposableFunction {
    return this._disposables.addObserver(observer);
  }

  track(disposable: Disposable): DisposableFunction {
    return this._disposables.add(disposable);
  }

  replaceManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    return this._disposables.replace(key, disposable);
  }

  cancelManaged(key: DisposableKey): void | Promise<void> {
    return this._disposables.cancel(key);
  }

  schedule<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    let release: DisposableFunction = () => {};
    const handle = setTimeout(() => {
      release();
      handler(...args);
    }, delay);
    release = this._disposables.replace(key, () => clearTimeout(handle));
    return release;
  }

  scheduleInterval<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    const handle = setInterval(handler, delay, ...args);
    return this._disposables.replace(key, () => clearInterval(handle));
  }

  cancelScheduled(key: DisposableKey): void | Promise<void> {
    return this._disposables.cancel(key);
  }

  replaceManagedGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction {
    return this._disposables.replaceGroup(key, disposables);
  }

  dispose(): Promise<void> {
    return this._disposables.clear();
  }
}
```

- [ ] **Step 5: Export from the core entrypoint**

In `src/platform/core/index.ts`, after the `DisposableBag` export lines (27-28), add:

```ts
export { ManagedLifecycleHost } from './primitives/managed-lifecycle-host.js';
```

- [ ] **Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/platform/core/managed-lifecycle-host.test.ts`
Expected: PASS (14 tests).

- [ ] **Step 7: Gate ladder, then commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`

```bash
git add src/platform/core tests/unit/platform/core/managed-lifecycle-host.test.ts
git commit -m "feat(core): add ManagedLifecycleHost with keyed scheduling and grouped disposal"
```

---

### Task 3: `BaseService` / `BaseOrchestrator` compose the host **[dev:smoke]**

**Files:**
- Modify: `src/platform/core/primitives/service.base.ts`, `src/platform/core/primitives/orchestrator.base.ts`
- Test: `tests/unit/shared/base/service.test.js` (extend)

**Interfaces:**
- Consumes: `ManagedLifecycleHost` (Task 2 signatures).
- Produces: `BaseService` public API unchanged PLUS new `schedule(key, handler, delay, ...args)`, `scheduleInterval(key, handler, delay, ...args)`, `cancelScheduled(key)` (Task 5 relies on these); `protected readonly lifecycle: ManagedLifecycleHost` and `protected readonly disposables: DisposableBag` (unchanged name, now the host's bag). `BaseOrchestrator` public/protected API unchanged.

- [ ] **Step 1: Write the failing tests**

Append to the top-level `describe` in `tests/unit/shared/base/service.test.js` (inside the existing describe block, after the timer lifecycle tests):

```js
  describe('keyed scheduling', () => {
    it('replaces a pending keyed timeout scheduled under the same key', () => {
      vi.useFakeTimers();
      try {
        const service = new BaseService({ loggerFactory: createLoggerFactory() }, 'KeyedService');
        const first = vi.fn();
        const second = vi.fn();

        service.schedule('job', first, 100);
        service.schedule('job', second, 100);
        vi.advanceTimersByTime(100);

        expect(first).not.toHaveBeenCalled();
        expect(second).toHaveBeenCalledTimes(1);
      } finally {
        vi.useRealTimers();
      }
    });

    it('cancelScheduled stops a keyed interval', () => {
      vi.useFakeTimers();
      try {
        const service = new BaseService({ loggerFactory: createLoggerFactory() }, 'KeyedService');
        const handler = vi.fn();

        service.scheduleInterval('poll', handler, 50);
        vi.advanceTimersByTime(100);
        expect(handler).toHaveBeenCalledTimes(2);

        service.cancelScheduled('poll');
        vi.advanceTimersByTime(100);
        expect(handler).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });
  });
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/shared/base/service.test.js`
Expected: FAIL — `service.schedule is not a function`.

- [ ] **Step 3: Rewrite `service.base.ts`**

Replace the import line 1 and the `BaseService` class (lines 39-111) — interfaces/`isEventBusLike` in between stay verbatim:

```ts
import { ManagedLifecycleHost } from './managed-lifecycle-host.js';
import type { DisposableBag, DisposableFunction, DisposableKey, EventTargetLike } from './disposable-bag.js';
```

```ts
export class BaseService {
  protected logger!: LoggerLike;
  protected readonly lifecycle: ManagedLifecycleHost;
  protected readonly disposables: DisposableBag;
  private readonly _eventBus: EventBusLike | null;
  private readonly _serviceName: string;

  constructor(dependencies: object, serviceName: string | null = null) {
    const name = serviceName || this.constructor.name;
    const dependencyMap = dependencies as Record<string, unknown>;

    Object.assign(this, dependencyMap);

    const loggerFactory = dependencyMap.loggerFactory as LoggerFactoryLike | undefined;
    if (loggerFactory) {
      this.logger = loggerFactory.create(name);
    }

    this.lifecycle = new ManagedLifecycleHost();
    this.disposables = this.lifecycle.disposables;
    this._eventBus = isEventBusLike(dependencyMap.eventBus) ? dependencyMap.eventBus : null;
    this._serviceName = name;
  }

  listen(event: string, handler: (...args: unknown[]) => void | Promise<void>): DisposableFunction {
    if (!this._eventBus) {
      this.logger?.warn(`Cannot subscribe to "${event}" - eventBus not available`);
      return () => {};
    }

    const unsubscribe = this._eventBus.subscribe(event, handler);
    return this.disposables.add(unsubscribe);
  }

  protected listenToDescriptors<TOwner extends this>(descriptors: readonly ServiceEventDescriptor<TOwner>[]): void {
    const owner = this as TOwner;
    descriptors.forEach(([event, handle]) => this.listen(event, (payload) => handle(owner, payload)));
  }

  subscribe(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this.lifecycle.subscribeEvent(target, type, listener, options);
  }

  timeout<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this.lifecycle.timeout(handler, delay, ...args);
  }

  interval<TArgs extends unknown[]>(
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this.lifecycle.interval(handler, delay, ...args);
  }

  animationFrame(handler: FrameRequestCallback): DisposableFunction {
    return this.lifecycle.animationFrame(handler);
  }

  schedule<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this.lifecycle.schedule(key, handler, delay, ...args);
  }

  scheduleInterval<TArgs extends unknown[]>(
    key: DisposableKey,
    handler: (...args: TArgs) => void,
    delay: number,
    ...args: TArgs
  ): DisposableFunction {
    return this.lifecycle.scheduleInterval(key, handler, delay, ...args);
  }

  cancelScheduled(key: DisposableKey): void | Promise<void> {
    return this.lifecycle.cancelScheduled(key);
  }

  dispose(): void | Promise<void> {
    return this.lifecycle.dispose();
  }
}
```

- [ ] **Step 4: Rewrite `orchestrator.base.ts` lifecycle plumbing**

Replace the imports (lines 1-2) with:

```ts
import { ManagedLifecycleHost } from './managed-lifecycle-host.js';
import type { Disposable, DisposableFunction, DisposableKey, EventTargetLike } from './disposable-bag.js';
import type { EventBusLike, LoggerFactoryLike, LoggerLike } from './service.base.js';
```

Then: rename the field `private readonly _disposables: DisposableBag` → `private readonly _lifecycle: ManagedLifecycleHost`; in the constructor `this._disposables = new DisposableBag();` → `this._lifecycle = new ManagedLifecycleHost();`; and replace the four delegating methods and `_cleanupLifecycle`:

```ts
  protected listen(
    target: EventTargetLike,
    type: string,
    listener: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    return this._lifecycle.subscribeEvent(target, type, listener, options);
  }

  protected track(disposable: Disposable): DisposableFunction {
    return this._lifecycle.track(disposable);
  }

  protected replaceManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    return this._lifecycle.replaceManaged(key, disposable);
  }

  protected cancelManaged(key: DisposableKey): void | Promise<void> {
    return this._lifecycle.cancelManaged(key);
  }

  protected async _cleanupLifecycle(): Promise<void> {
    try {
      await this._lifecycle.dispose();
    } catch (error) {
      this.logger?.error(`${this._orchestratorName} lifecycle cleanup failed`, error);
    }
  }
```

Everything else in the class (initialize/cleanup/subscribeWithCleanup/onInitialize/onCleanup) stays verbatim.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/unit/shared/base/service.test.js tests/unit/shared/base/orchestrator.test.js`
Expected: PASS (existing + 2 new).

- [ ] **Step 6: Gate ladder + boot gate, then commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Run: `npm run dev:smoke` — Expected: "Renderer application started successfully", exit 0.

```bash
git add src/platform/core/primitives tests/unit/shared/base/service.test.js
git commit -m "refactor(core): compose service and orchestrator bases over ManagedLifecycleHost"
```

---

### Task 4: `PresentationComponent` composes the host + widget group disposal (UIB-1, UIB-6) **[dev:smoke]**

**Files:**
- Modify: `src/platform/ui-base/lifecycle/presentation-component.base.ts` (rewrite), `src/platform/ui-base/widgets/disclosure.class.ts:331-336`, `src/platform/ui-base/widgets/listbox-dropdown.class.ts:148-154`, `src/platform/ui-base/widgets/activity-auto-hide.controller.ts:79-82`
- Test: `tests/unit/platform/ui-base/lifecycle/presentation-component.test.ts` (extend)

**Interfaces:**
- Consumes: `ManagedLifecycleHost` via `@platform/core` (entrypoint import — depcruise cross-module rule requires it).
- Produces: `PresentationComponent` protected API unchanged (`listen`, `timeout`, `interval`, `animationFrame`, `observe`, `track`, `replaceManaged`, `cancelManaged`, `createLifecycleToken`, `replaceTimeout`, `replaceAnimationFrame`, `trackSubscription`, `onDisposeError`, `dispose`, `_disposables` getter) PLUS new `protected replaceManagedGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction`.

- [ ] **Step 1: Write the failing test**

Append inside the existing describe in `tests/unit/platform/ui-base/lifecycle/presentation-component.test.ts`:

```ts
  it('replaceManagedGroup tears a group down in reverse order and supports replacement', () => {
    class GroupHarness extends PresentationComponent {
      registerGroup(key: symbol, disposers: Array<() => void>) {
        return this.replaceManagedGroup(key, disposers);
      }
    }

    const harness = new GroupHarness();
    const key = Symbol('group');
    const order: string[] = [];

    harness.registerGroup(key, [
      () => { order.push('first'); },
      () => { order.push('second'); }
    ]);
    harness.registerGroup(key, [() => { order.push('fresh'); }]);

    expect(order).toEqual(['second', 'first']);
    void harness.dispose();
    expect(order).toEqual(['second', 'first', 'fresh']);
  });
```
(Match the file's existing import style for `PresentationComponent` — it imports from the source path relative to the test.)

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/platform/ui-base/lifecycle/presentation-component.test.ts`
Expected: FAIL — `replaceManagedGroup is not a function`.

- [ ] **Step 3: Rewrite `presentation-component.base.ts`**

Full new file content:

```ts
import {
  ManagedLifecycleHost,
  type Disposable,
  type DisposableBag,
  type DisposableFunction,
  type DisposableKey,
  type EventTargetLike
} from '@platform/core';


export type PresentationLifecycleToken = {
  isActive(): boolean;
  dispose(): void | Promise<void>;
};

export class PresentationComponent {
  protected readonly lifecycle = new ManagedLifecycleHost();

  protected get _disposables(): DisposableBag {
    return this.lifecycle.disposables;
  }

  protected listen(
    target: EventTargetLike | null,
    type: string,
    handler: EventListenerOrEventListenerObject,
    options?: AddEventListenerOptions | boolean
  ): DisposableFunction {
    if (!target) {
      return () => {};
    }

    if (options === undefined) {
      target.addEventListener(type, handler);
      return this.lifecycle.track(() => target.removeEventListener(type, handler));
    }

    return this.lifecycle.subscribeEvent(target, type, handler, options);
  }

  protected timeout(handler: () => void, delay: number, ...args: unknown[]): DisposableFunction {
    return this.lifecycle.timeout<unknown[]>(handler, delay, ...args);
  }

  protected interval(handler: () => void, delay: number, ...args: unknown[]): DisposableFunction {
    return this.lifecycle.interval<unknown[]>(handler, delay, ...args);
  }

  protected animationFrame(handler: FrameRequestCallback): DisposableFunction {
    return this.lifecycle.animationFrame(handler);
  }

  protected observe(observer: { disconnect(): void }): DisposableFunction {
    return this.lifecycle.observe(observer);
  }

  protected track(disposable: Disposable): DisposableFunction {
    return this.lifecycle.track(disposable);
  }

  protected replaceManaged(key: DisposableKey, disposable: Disposable): DisposableFunction {
    return this.lifecycle.replaceManaged(key, disposable);
  }

  protected cancelManaged(key: DisposableKey): void | Promise<void> {
    return this.lifecycle.cancelManaged(key);
  }

  protected replaceManagedGroup(key: DisposableKey, disposables: readonly Disposable[]): DisposableFunction {
    return this.lifecycle.replaceManagedGroup(key, disposables);
  }

  protected createLifecycleToken(key: DisposableKey): PresentationLifecycleToken {
    let active = true;
    const dispose = this.replaceManaged(key, () => {
      active = false;
    });

    return {
      isActive: () => active,
      dispose
    };
  }

  protected replaceTimeout(
    key: DisposableKey,
    handler: (...args: unknown[]) => void,
    delay: number,
    ...args: unknown[]
  ): DisposableFunction {
    return this.lifecycle.schedule(key, handler, delay, ...args);
  }

  protected replaceAnimationFrame(key: DisposableKey, handler: FrameRequestCallback): DisposableFunction {
    let managedDisposer: DisposableFunction = () => {};
    const handle = requestAnimationFrame((time) => {
      managedDisposer();
      handler(time);
    });

    managedDisposer = this.replaceManaged(key, () => cancelAnimationFrame(handle));
    return managedDisposer;
  }

  protected trackSubscription(
    unsubscribe: (() => void) | null | undefined,
    onError?: (error: unknown) => void
  ): DisposableFunction {
    if (typeof unsubscribe !== 'function') {
      return () => {};
    }

    return this.track(() => {
      try {
        unsubscribe();
      } catch (error) {
        onError?.(error);
      }
    });
  }

  protected onDisposeError(_error: unknown): void {}

  dispose(): void | Promise<void> {
    return this.lifecycle.dispose().catch((error) => this.onDisposeError(error));
  }
}
```

- [ ] **Step 4: Migrate the three widget group sites**

`disclosure.class.ts` — replace lines 331-336 (`if (disposers.length > 0) { this.replaceManaged(…splice…) }`) with:

```ts
    if (disposers.length > 0) {
      this.replaceManagedGroup(DISCLOSURE_LISTENER_LIFECYCLE, disposers);
    }
```

`activity-auto-hide.controller.ts` — replace lines 79-82 (`this.replaceManaged(ACTIVITY_LISTENER_LIFECYCLE, () => listenerDisposers.splice(0)…)`) with:

```ts
    this.replaceManagedGroup(ACTIVITY_LISTENER_LIFECYCLE, listenerDisposers);
```

`listbox-dropdown.class.ts` — replace lines 148-154 (`this.replaceManaged(LISTBOX_DROPDOWN_RUNTIME_LIFECYCLE, async () => {…})`) with (reverse teardown ⇒ listeners dispose first, the async disclosure teardown last — preserving today's order):

```ts
    this.replaceManagedGroup(LISTBOX_DROPDOWN_RUNTIME_LIFECYCLE, [
      async () => {
        await disclosure.dispose();
        if (this._disclosure === disclosure) {
          this._disclosure = null;
        }
      },
      ...listenerDisposers
    ]);
```

- [ ] **Step 5: Run the focused suites**

Run: `npx vitest run tests/unit/platform/ui-base tests/unit/renderer/presentation/primitives`
Expected: PASS (presentation-component + dom-bindings + signal + disclosure + listbox suites).

- [ ] **Step 6: Gate ladder + boot gate, then commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Run: `npm run dev:smoke` — Expected: exit 0.

```bash
git add src/platform/ui-base tests/unit/platform/ui-base
git commit -m "refactor(ui-base): compose PresentationComponent over the core lifecycle host"
```

---

### Task 5: Route keyed timers through the base helpers (INF-9, X-5) **[dev:smoke]**

**Files:**
- Modify: `src/renderer/infrastructure/services/platform/health.service.ts:77-82,167-169`, `src/renderer/infrastructure/services/platform/viewport.service.ts` (`_handleResize`, `forceResize`, `cleanup`, `_resizeTimeout` field), `src/renderer/infrastructure/services/performance/performance-state.service.ts:199-210`, `src/platform/updates/update.service.ts:331-370`, `src/platform/transcode/transcode.service.ts:324-333`
- Test: `tests/unit/renderer/infrastructure/services/viewport.service.test.ts` (3 white-box assertions rewritten)
- Do NOT touch: `settings-fullscreen.service.ts` (Verified premise 6), non-timer `disposables.replace` sites (RVFC/observer/adapter subscriptions).

**Interfaces:**
- Consumes: `BaseService.schedule/scheduleInterval/cancelScheduled` (Task 3).

- [ ] **Step 1: `health.service.ts`**

Replace lines 77-82 with:

```ts
    this.schedule(HEALTH_TIMEOUT_LIFECYCLE, () => this._handleTimeout(), this._timeoutMs);
```

Replace `_clearTimeout` (lines 167-169) body with:

```ts
  _clearTimeout(): void {
    this.cancelScheduled(HEALTH_TIMEOUT_LIFECYCLE);
  }
```

- [ ] **Step 2: `performance-state.service.ts`**

Replace lines 199-205 (`this._clearIdleTimer(); … disposables.replace(IDLE_TIMER_LIFECYCLE, …)`) with:

```ts
    this._clearIdleTimer();
    this._lastIdleReset = performance.now();
    this.schedule(IDLE_TIMER_LIFECYCLE, () => {
      this._updateState({ idle: true });
    }, this._idleDelayMs);
```

Replace `_clearIdleTimer` body (lines 208-210) with:

```ts
  _clearIdleTimer(): void {
    this.cancelScheduled(IDLE_TIMER_LIFECYCLE);
  }
```

- [ ] **Step 3: `viewport.service.ts`**

Delete the `_resizeTimeout` field declaration. Rewrite `_handleResize` (lines 161-181):

```ts
  _handleResize(): void {
    if (this._forceResizePending) {
      return;
    }

    this.schedule(RESIZE_DEBOUNCE_LIFECYCLE, () => {
      if (this._onResizeCallback) {
        this._onResizeCallback();
      }
    }, TIMING.RESIZE_DEBOUNCE_MS);
  }
```

Rewrite `forceResize` (lines 195-221, keep its JSDoc):

```ts
  forceResize(): void {
    this.cancelScheduled(RESIZE_DEBOUNCE_LIFECYCLE);
    this.cancelScheduled(FORCE_RESIZE_LIFECYCLE);

    this._forceResizePending = true;
    this._lastDimensions = null;
    this._cachedStyles = null;

    this.schedule(FORCE_RESIZE_LIFECYCLE, () => {
      this._forceResizePending = false;
      if (this._onResizeCallback) {
        this._onResizeCallback();
      }
    }, 32);
  }
```

In `cleanup()`: change the first two cancels to `this.cancelScheduled(FORCE_RESIZE_LIFECYCLE); this.cancelScheduled(RESIZE_DEBOUNCE_LIFECYCLE);` and DELETE the whole `if (this._resizeTimeout) { … }` block (lines 237-242).

- [ ] **Step 4: Rewrite the three viewport white-box tests**

In `tests/unit/renderer/infrastructure/services/viewport.service.test.ts`: delete the assertion `expect(service._resizeTimeout).toBeNull();` (line 88). Replace the test at lines 308-314 with:

```ts
    it('should cancel a pending debounced resize', () => {
      const onResize = vi.fn();
      service._onResizeCallback = onResize;
      service._handleResize();

      service.forceResize();
      vi.advanceTimersByTime(1000);

      expect(onResize).toHaveBeenCalledTimes(1);
    });
```

Replace the test at lines 342-348 with:

```ts
    it('should cancel a pending debounced resize on cleanup', () => {
      const onResize = vi.fn();
      service._onResizeCallback = onResize;
      service._handleResize();

      service.cleanup();
      vi.advanceTimersByTime(1000);

      expect(onResize).not.toHaveBeenCalled();
    });
```

(Fake timers are already active in these describes; verify and mirror the surrounding setup if the cleanup describe lacks them.)

- [ ] **Step 5: `update.service.ts` (X-5)**

Rewrite `startAutoCheck` body (lines 331-357, keep the JSDoc):

```ts
  startAutoCheck(intervalMs = 60 * 60 * 1000): void {
    if (this._autoCheckRunning) {
      this.logger.warn('Auto-check already running');
      return;
    }

    this._autoCheckRunning = true;

    this.schedule(INITIAL_UPDATE_CHECK_LIFECYCLE, () => {
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Initial update check failed', (error as Error).message);
      });
    }, 10000);

    this.scheduleInterval(PERIODIC_UPDATE_CHECK_LIFECYCLE, () => {
      this.checkForUpdates().catch((error) => {
        this.logger.warn('Periodic update check failed', (error as Error).message);
      });
    }, intervalMs);

    this.logger.info(`Auto-update check started (interval: ${intervalMs / 1000 / 60} minutes)`);
  }
```

Rewrite `stopAutoCheck` (lines 362-370, keep the JSDoc):

```ts
  stopAutoCheck(): void {
    const wasRunning = this._autoCheckRunning;
    this.cancelScheduled(INITIAL_UPDATE_CHECK_LIFECYCLE);
    this.cancelScheduled(PERIODIC_UPDATE_CHECK_LIFECYCLE);
    this._autoCheckRunning = false;
    if (wasRunning) {
      this.logger.info('Auto-update check stopped');
    }
  }
```

- [ ] **Step 6: `transcode.service.ts` (X-5)**

Replace lines 324-333 (`const cleanupLifecycleKey = …; this.disposables.cancel(…); const timeoutHandle = setTimeout(…); this.disposables.replace(…)`) with:

```ts
    const cleanupLifecycleKey = transcodeCleanupLifecycleKey(jobId);
    this.schedule(cleanupLifecycleKey, () => {
      if (this._jobs.has(jobId)) {
        this._jobs.delete(jobId);
        this.logger.debug('Removed stale job record', { jobId });
      }
    }, 5 * 60 * 1000);
```

- [ ] **Step 7: Focused suites, ladder, boot gate, commit**

Run: `npx vitest run tests/unit/renderer/infrastructure/services/health.service.test.ts tests/unit/renderer/infrastructure/services/viewport.service.test.ts tests/unit/renderer/infrastructure/services/performance-state.service.test.ts tests/unit/main/update.service.test.ts`
Expected: PASS.
Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run && npm run dev:smoke`

```bash
git add src/renderer/infrastructure/services src/platform/updates src/platform/transcode tests/unit/renderer/infrastructure/services/viewport.service.test.ts
git commit -m "refactor(services): route keyed timers through base scheduling helpers"
```

---

### Task 6: `getElectronApp` unit test (P3 follow-up)

**Files:**
- Test: `tests/unit/platform/core/electron-app.test.ts` (create)
- No source changes.

- [ ] **Step 1: Write the tests**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest';

type ElectronAppModule = typeof import('../../../../src/platform/core/primitives/electron-app.utils.js');

async function importFreshModule(): Promise<ElectronAppModule> {
  vi.resetModules();
  return import('../../../../src/platform/core/primitives/electron-app.utils.js');
}

describe('getElectronApp', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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
```

- [ ] **Step 2: Run to verify pass** (source already implements both behaviors)

Run: `npx vitest run tests/unit/platform/core/electron-app.test.ts`
Expected: PASS (3 tests). If a spy typing issue surfaces, adjust the casts only — do not change the source.

- [ ] **Step 3: Ladder + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`

```bash
git add tests/unit/platform/core/electron-app.test.ts
git commit -m "test(core): cover getElectronApp memoization and non-electron fallback"
```

---

### Task 7: Adopt `@preact/signals-core` (UIB-2) **[dev:smoke]**

**Files:**
- Modify: `src/platform/ui-base/reactive/index.ts`, `src/platform/ui-base/reactive/dom-bindings.ts:1-2`, `knip.json` (remove the `@preact/signals-core` waiver)
- Delete: `src/platform/ui-base/reactive/signal.ts` (`git rm`)
- Test: `tests/unit/platform/ui-base/reactive/signal.test.ts` (rewrite), `tests/unit/platform/ui-base/reactive/dom-bindings.test.ts:2` (import swap)

**Interfaces:**
- Produces: `@platform/ui-base/reactive` re-exports `signal`, `computed`, `effect` (values) and `Signal`, `ReadonlySignal` (types) from `@preact/signals-core` — consumer imports unchanged.

- [ ] **Step 1: Rewrite the test to library semantics (facade contract test)**

Full new content of `signal.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect } from '../../../../../src/platform/ui-base/reactive/index.js';

describe('reactive facade (@preact/signals-core)', () => {
  it('runs effects immediately and re-runs synchronously on each change', () => {
    const count = signal(0);
    const seen: number[] = [];
    const dispose = effect(() => {
      seen.push(count.value);
    });
    expect(seen).toEqual([0]);
    count.value = 1;
    count.value = 2;
    expect(seen).toEqual([0, 1, 2]);
    dispose();
  });

  it('skips writes of an identical value', () => {
    const s = signal(1);
    const fn = vi.fn(() => s.value);
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('peek() reads without subscribing', () => {
    const s = signal(0);
    const fn = vi.fn(() => {
      s.peek();
    });
    effect(fn);
    s.value = 5;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('computed derives lazily and recomputes when an input changes', () => {
    const a = signal(2);
    const b = signal(3);
    const compute = vi.fn(() => a.value + b.value);
    const sum = computed(compute);
    expect(compute).not.toHaveBeenCalled();
    expect(sum.value).toBe(5);
    a.value = 10;
    expect(sum.value).toBe(13);
  });

  it('diamond: a single source change re-runs a dependent effect once, glitch-free', () => {
    const d = signal(1);
    const b = computed(() => d.value + 1);
    const c = computed(() => d.value * 2);
    const a = computed(() => b.value + c.value);
    const seen: number[] = [];
    effect(() => {
      seen.push(a.value);
    });
    expect(seen).toEqual([4]);
    d.value = 5;
    expect(seen).toEqual([4, 16]);
  });

  it('cleans up stale dependencies (dynamic deps)', () => {
    const useX = signal(true);
    const x = signal('x');
    const y = signal('y');
    const fn = vi.fn(() => (useX.value ? x.value : y.value));
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    useX.value = false;
    expect(fn).toHaveBeenCalledTimes(2);
    x.value = 'x2';
    expect(fn).toHaveBeenCalledTimes(2);
    y.value = 'y2';
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('dispose() stops re-runs and detaches the effect', () => {
    const s = signal(0);
    const fn = vi.fn(() => s.value);
    const dispose = effect(fn);
    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);
    dispose();
    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('allows an effect to write a different signal without cascading', () => {
    const src = signal(0);
    const out = signal(0);
    effect(() => {
      out.value = src.value * 2;
    });
    src.value = 4;
    expect(out.value).toBe(8);
  });
});
```

- [ ] **Step 2: Run to verify failure** (index still re-exports the eager hand-rolled runtime)

Run: `npx vitest run tests/unit/platform/ui-base/reactive/signal.test.ts`
Expected: FAIL on `computed derives lazily` (`compute` already called — eager implementation).

- [ ] **Step 3: Swap the implementation**

`src/platform/ui-base/reactive/index.ts` — full new content:

```ts
export { signal, computed, effect } from '@preact/signals-core';
export type { Signal, ReadonlySignal } from '@preact/signals-core';
export { bindText, bindClass, bindAttr, bindProperty, bindStyleProperty } from './dom-bindings.js';
```

`src/platform/ui-base/reactive/dom-bindings.ts` — replace lines 1-2 with:

```ts
import { effect } from '@preact/signals-core';
import type { ReadonlySignal } from '@preact/signals-core';
```

Delete the runtime and update the sibling test import:

```bash
git rm src/platform/ui-base/reactive/signal.ts
```

In `tests/unit/platform/ui-base/reactive/dom-bindings.test.ts` line 2, change the import to:

```ts
import { signal } from '../../../../../src/platform/ui-base/reactive/index.js';
```

- [ ] **Step 4: Remove the knip waiver**

In `knip.json` `ignoreDependencies`, delete the `"@preact/signals-core"` entry.

- [ ] **Step 5: Run tests to verify pass**

Run: `npx vitest run tests/unit/platform/ui-base/reactive`
Expected: PASS (signal facade + dom-bindings).

- [ ] **Step 6: Ladder + boot gate + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run && npm run dev:smoke`

```bash
git add -A src/platform/ui-base/reactive tests/unit/platform/ui-base/reactive knip.json
git commit -m "refactor(ui-base): adopt @preact/signals-core as the reactive substrate"
```

---

### Task 8: `debounce` core timing util + media-devices port adoption (INF-7)

**Files:**
- Modify: `src/platform/core/primitives/timing.utils.ts`, `src/platform/core/index.ts:35`, `src/renderer/infrastructure/services/devices/device-platform.adapters.ts:112-158`
- Test: `tests/unit/platform/core/timing-async.test.ts` (extend)

**Interfaces:**
- Produces: `debounce<TArgs extends unknown[]>(fn: (...args: TArgs) => void, delayMs: number): DebouncedFunction<TArgs>` with `DebouncedFunction` carrying `cancel(): void`; exported from `@platform/core`.

- [ ] **Step 1: Write the failing tests**

Append to `tests/unit/platform/core/timing-async.test.ts` (extend the import line to include `debounce`):

```ts
describe('debounce', () => {
  it('invokes on the trailing edge with the latest arguments', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced('a');
      debounced('b');
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
      expect(fn).toHaveBeenLastCalledWith('b');
    } finally {
      vi.useRealTimers();
    }
  });

  it('restarts the delay on each call', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced('a');
      vi.advanceTimersByTime(60);
      debounced('b');
      vi.advanceTimersByTime(60);
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(40);
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('cancel() drops the pending invocation', () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const debounced = debounce(fn, 100);
      debounced('a');
      debounced.cancel();
      vi.advanceTimersByTime(100);
      expect(fn).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/platform/core/timing-async.test.ts`
Expected: FAIL — `debounce` is not exported.

- [ ] **Step 3: Implement in `timing.utils.ts`** (append after `throttle`)

```ts
/** A debounced callable that can drop its pending trailing invocation. */
export interface DebouncedFunction<TArgs extends unknown[]> {
  (...args: TArgs): void;
  cancel(): void;
}

/**
 * Trailing-edge debounce: postpones `fn` until `delayMs` has elapsed since
 * the most recent call; `cancel()` drops any pending invocation.
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  delayMs: number
): DebouncedFunction<TArgs> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const debounced = (...args: TArgs): void => {
    if (timer !== null) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, delayMs);
  };

  debounced.cancel = (): void => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  };

  return debounced;
}
```

In `src/platform/core/index.ts` line 35, change to:

```ts
export { throttle, debounce } from './primitives/timing.utils.js';
export type { DebouncedFunction } from './primitives/timing.utils.js';
```

- [ ] **Step 4: Adopt in `BrowserMediaDevicesPort`**

In `device-platform.adapters.ts`: add `debounce` to the existing `@platform/core` import; delete the field `private debounceTimer: ReturnType<typeof setTimeout> | null = null;` (line 116); rewrite `subscribeDeviceChange` (lines 136-158):

```ts
  subscribeDeviceChange(onChange: () => void): () => void {
    const handler = debounce(onChange, this.debounceMs);

    this.browserMediaService.addEventListener('devicechange', handler);
    this.logger?.debug(`Device change listener registered (debounce: ${this.debounceMs}ms)`);

    return () => {
      handler.cancel();
      this.browserMediaService.removeEventListener('devicechange', handler);
    };
  }
```

- [ ] **Step 5: Tests pass, ladder, commit**

Run: `npx vitest run tests/unit/platform/core/timing-async.test.ts` — Expected: PASS.
Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`

```bash
git add src/platform/core src/renderer/infrastructure/services/devices/device-platform.adapters.ts tests/unit/platform/core/timing-async.test.ts
git commit -m "refactor(core): add debounce timing util and adopt it in the media devices port"
```

---

### Task 9: `abortableDelay` / `raceWithTimeout` async primitives (INF-3)

**Files:**
- Modify: `src/platform/core/primitives/async.utils.ts` (append), `src/platform/core/index.ts:36-37` (extend exports), `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts` (delete `_sleep:480-498`, swap call at `:205`, import), `src/renderer/infrastructure/services/gpu/gpu-recording.service.ts` (delete `CaptureDrainResult:27` + `_waitForCaptureDrain:327-343`, swap call at `:152`, import)
- Test: `tests/unit/platform/core/timing-async.test.ts` (extend)

**Interfaces:**
- Produces: `abortableDelay(durationMs: number, signal: AbortSignal): Promise<boolean>`; `type TimedRaceOutcome = 'completed' | 'failed' | 'timed-out'`; `raceWithTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<TimedRaceOutcome>` — exported from `@platform/core`. (Task 10 edits the same file after this.)

- [ ] **Step 1: Write the failing tests** (append to `timing-async.test.ts`, extend imports)

```ts
describe('abortableDelay', () => {
  it('resolves true after the delay', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = abortableDelay(50, controller.signal);
      await vi.advanceTimersByTimeAsync(50);
      await expect(pending).resolves.toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('resolves false immediately when the signal is already aborted', async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(abortableDelay(50, controller.signal)).resolves.toBe(false);
  });

  it('resolves false when aborted mid-delay and clears the timer', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const pending = abortableDelay(50, controller.signal);
      controller.abort();
      await expect(pending).resolves.toBe(false);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('raceWithTimeout', () => {
  it("reports 'completed' when the promise resolves first", async () => {
    await expect(raceWithTimeout(Promise.resolve('ok'), 1000)).resolves.toBe('completed');
  });

  it("reports 'failed' when the promise rejects first", async () => {
    await expect(raceWithTimeout(Promise.reject(new Error('nope')), 1000)).resolves.toBe('failed');
  });

  it("reports 'timed-out' when the timeout elapses first", async () => {
    vi.useFakeTimers();
    try {
      const pending = raceWithTimeout(new Promise(() => {}), 100);
      await vi.advanceTimersByTimeAsync(100);
      await expect(pending).resolves.toBe('timed-out');
    } finally {
      vi.useRealTimers();
    }
  });
});
```

- [ ] **Step 2: Run to verify failure**, then **Step 3: implement** (append to `async.utils.ts`):

```ts
/** Outcome of racing a promise against a timeout. */
export type TimedRaceOutcome = 'completed' | 'failed' | 'timed-out';

/**
 * Resolve `true` after `durationMs`, or `false` immediately when `signal`
 * aborts first; never rejects.
 */
export function abortableDelay(durationMs: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }

    const timeoutId = setTimeout(() => {
      signal.removeEventListener('abort', handleAbort);
      resolve(true);
    }, durationMs);
    const handleAbort = (): void => {
      clearTimeout(timeoutId);
      resolve(false);
    };

    signal.addEventListener('abort', handleAbort, { once: true });
  });
}

/**
 * Race `promise` against a timeout, reporting how the race settled without
 * rethrowing rejections.
 */
export function raceWithTimeout(promise: Promise<unknown>, timeoutMs: number): Promise<TimedRaceOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (outcome: TimedRaceOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeoutId);
      resolve(outcome);
    };
    const timeoutId = setTimeout(() => finish('timed-out'), timeoutMs);
    void promise.then(() => finish('completed'), () => finish('failed'));
  });
}
```

In `src/platform/core/index.ts`, extend the async exports (lines 36-37) to:

```ts
export { createDeferred, abortableDelay, raceWithTimeout } from './primitives/async.utils.js';
export type { Deferred, TimedRaceOutcome } from './primitives/async.utils.js';
```

- [ ] **Step 4: Migrate the two sites**

`audio-pipeline.service.ts`: add `abortableDelay` to its `@platform/core` import; change line 205 `await this._sleep(timings.stabilizeDelayMs, signal)` → `await abortableDelay(timings.stabilizeDelayMs, signal)`; delete the `_sleep` method (lines 480-498). Do NOT touch `_waitForTrackUnmute`/`_waitForAudioEnergy` (Verified premise 3).

`gpu-recording.service.ts`: add `raceWithTimeout` and `type TimedRaceOutcome` to its `@platform/core` import; delete `type CaptureDrainResult = …` (line 27) and replace its two type references with `TimedRaceOutcome` — then delete `_waitForCaptureDrain` (lines 327-343) and change line 152 to:

```ts
      const drainResult = await raceWithTimeout(capturePromise, 500);
```

- [ ] **Step 5: Focused suites, ladder, commit**

Run: `npx vitest run tests/unit/platform/core/timing-async.test.ts tests/unit/renderer/infrastructure/services/audio-pipeline.service.test.ts tests/unit/renderer/infrastructure/services/gpu-recording.service.test.ts`
Expected: PASS.
Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`

```bash
git add src/platform/core src/renderer/infrastructure/services tests/unit/platform/core/timing-async.test.ts
git commit -m "refactor(core): extract abortable delay and timed race async primitives"
```

---

### Task 10: `Promise.withResolvers` replaces `createDeferred` (CORE-3)

**Files:**
- Modify: `tsconfig.base.json:88` (`"ES2022"` → `"ES2024"` in `lib` only — `target` stays ES2022), `src/platform/core/primitives/async.utils.ts` (drop interface + factory, add alias), `src/platform/core/index.ts` (drop `createDeferred`), `src/renderer/infrastructure/services/capture/capture.service.ts:1,289`
- Test: `tests/unit/platform/core/timing-async.test.ts` (remove the `createDeferred` block + import)

**Interfaces:**
- Produces: `export type Deferred<T> = PromiseWithResolvers<T>;` (same shape: `{ promise, resolve, reject }`). `createDeferred` no longer exists anywhere.

- [ ] **Step 1: Bump `lib`**

In `tsconfig.base.json` line 88: `"ES2022",` → `"ES2024",` (inside `lib`; all other tsconfigs extend this file — verified premise 10).

- [ ] **Step 2: Rewrite `async.utils.ts` head**

Replace the `Deferred` interface and `createDeferred` (lines 5-24) with:

```ts
/** A promise paired with its externally-callable resolve/reject handles. */
export type Deferred<T> = PromiseWithResolvers<T>;
```

(The Task 9 additions below it stay.)

- [ ] **Step 3: Update the core entrypoint**

In `src/platform/core/index.ts`, the async export lines become:

```ts
export { abortableDelay, raceWithTimeout } from './primitives/async.utils.js';
export type { Deferred, TimedRaceOutcome } from './primitives/async.utils.js';
```

- [ ] **Step 4: Migrate the single src consumer**

`capture.service.ts` line 1: `import { BaseService, createDeferred } from '@platform/core';` → `import { BaseService } from '@platform/core';`
Line 289: `const deferred = createDeferred<void>();` → `const deferred = Promise.withResolvers<void>();`

- [ ] **Step 5: Remove the dead test block**

In `tests/unit/platform/core/timing-async.test.ts`: remove `createDeferred` from the import and delete the whole `describe('createDeferred', …)` block (the native built-in needs no coverage; `Deferred` is a type alias). The two test-local `createDeferred` helper functions in `device-runtime.service.test.ts` and `streaming.service.test.ts` are unrelated locals — do NOT touch them.

- [ ] **Step 6: Verify, ladder, commit**

Run: `grep -rn "createDeferred" src tests --include="*.ts" | grep -v "function createDeferred\|createDeferred<T>()\|_createDeferred"` — Expected: no core-import hits (only the two test-local helpers and orchestrator `_createDeferredComponentDependencies` names remain).
Run: `npx vitest run tests/unit/platform/core/timing-async.test.ts tests/unit/renderer/infrastructure/services/capture.service.test.ts` — Expected: PASS.
Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`

```bash
git add tsconfig.base.json src/platform/core src/renderer/infrastructure/services/capture/capture.service.ts tests/unit/platform/core/timing-async.test.ts
git commit -m "refactor(core): replace createDeferred with native Promise.withResolvers"
```

---

### Task 11: `type-fest` for the generic type utilities (CORE-4)

**Files:**
- Modify: `src/platform/core/types/type-utils.ts`, `knip.json` (remove the `type-fest` waiver)
- No test changes (type-only; both typecheck legs are the gate).

- [ ] **Step 1: Rewrite `type-utils.ts`**

```ts
/**
 * Domain-agnostic type-level utilities shared across the workspace.
 */

export type { ValueOf, UnionToIntersection } from 'type-fest';

/** Recursively extracts the string leaf values of a nested record type. */
export type LeafValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? LeafValues<T[keyof T]>
    : never;

/** Compile-time exhaustiveness assertion — instantiate with the leftover union. */
export type AssertNever<T extends never> = T;
```

(`src/platform/core/index.ts:16` re-exports from this file and stays unchanged.)

- [ ] **Step 2: Remove the knip waiver**

In `knip.json` `ignoreDependencies`, delete the `"type-fest"` entry.

- [ ] **Step 3: Ladder + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all pass — consumers (`main-event-channels.ts`, `component.registry.ts`, core index) compile against type-fest's signatures.

```bash
git add src/platform/core/types/type-utils.ts knip.json
git commit -m "refactor(core): source ValueOf and UnionToIntersection from type-fest"
```

---

### Task 12: `electron-log` replaces winston (MAIN-1) **[dev:smoke]**

**Files:**
- Modify: `src/main/infrastructure/logging/logger.factory.ts` (rewrite), `tests/factories/system.factory.js:120-139` (delete both winston mocks), `tests/factories/index.js:113-114` (drop the two re-exports), `package.json` (remove `"winston"` from dependencies), `package-lock.json` (offline-safe sync), `knip.json` (remove the `electron-log` waiver)
- Test: `tests/unit/main/infrastructure/logging/main-logger.test.js` (rewrite)

**Interfaces:**
- Consumes: `electron-log/main` default export (`log.scope(context)`, `log.transports.console.level`, `log.transports.file.{level,maxSize,resolvePathFn}`).
- Produces: `MainLogger implements LoggerFactoryLike` with the identical `create(context: string): LoggerLike` contract — DI graph untouched. Env contract preserved: `NODE_ENV`, `LOG_LEVEL`, `LOG_FILE`, `LOG_DIR`. Accepted divergences per Verified premise 5.

- [ ] **Step 1: Rewrite the test file first**

Full new content of `tests/unit/main/infrastructure/logging/main-logger.test.js`:

```js
/**
 * MainLogger Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installProcessEnvMock } from '../../../../support/mocks/runtime-property.installers.js';

const scopedLogger = { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() };

vi.mock('electron-log/main', () => ({
  default: {
    scope: vi.fn(() => scopedLogger),
    transports: {
      console: { level: undefined },
      file: { level: undefined, maxSize: undefined, resolvePathFn: undefined }
    }
  }
}));

import log from 'electron-log/main';
import { MainLogger } from '@main/infrastructure/logging/logger.factory.js';

describe('MainLogger', () => {
  let envMock;

  beforeEach(() => {
    vi.clearAllMocks();
    log.transports.console.level = undefined;
    log.transports.file.level = undefined;
    log.transports.file.resolvePathFn = undefined;
    envMock = installProcessEnvMock({
      NODE_ENV: 'development',
      LOG_LEVEL: undefined,
      LOG_FILE: undefined,
      LOG_DIR: undefined
    });
  });

  afterEach(() => {
    envMock.cleanup();
  });

  describe('transport configuration', () => {
    it('uses debug console level and disables file logging in development', () => {
      new MainLogger();

      expect(log.transports.console.level).toBe('debug');
      expect(log.transports.file.level).toBe(false);
    });

    it('uses info level and enables file logging in production', () => {
      envMock.setEnv({ NODE_ENV: 'production' });

      new MainLogger();

      expect(log.transports.console.level).toBe('info');
      expect(log.transports.file.level).toBe('info');
    });

    it('respects the LOG_LEVEL env var', () => {
      envMock.setEnv({ LOG_LEVEL: 'warn' });

      new MainLogger();

      expect(log.transports.console.level).toBe('warn');
    });

    it('enables file logging in development when LOG_FILE is set', () => {
      envMock.setEnv({ LOG_FILE: 'true' });

      new MainLogger();

      expect(log.transports.file.level).toBe('debug');
    });

    it('routes the log file into LOG_DIR when provided', () => {
      envMock.setEnv({ NODE_ENV: 'production', LOG_DIR: '/custom/log/dir' });

      new MainLogger();

      expect(typeof log.transports.file.resolvePathFn).toBe('function');
      expect(log.transports.file.resolvePathFn()).toMatch(/custom[\\/]log[\\/]dir[\\/]combined\.log$/);
    });

    it('leaves the default log path when LOG_DIR is not set', () => {
      new MainLogger();

      expect(log.transports.file.resolvePathFn).toBeUndefined();
    });
  });

  describe('create', () => {
    it('creates a scoped logger per context', () => {
      const logger = new MainLogger();

      const contextLogger = logger.create('TestContext');

      expect(log.scope).toHaveBeenCalledWith('TestContext');
      expect(typeof contextLogger.debug).toBe('function');
      expect(typeof contextLogger.info).toBe('function');
      expect(typeof contextLogger.warn).toBe('function');
      expect(typeof contextLogger.error).toBe('function');
    });

    it('delegates each level with the given arguments', () => {
      const contextLogger = new MainLogger().create('TestContext');

      contextLogger.debug('debug message', { key: 'value' });
      contextLogger.info('info message', { data: 123 });
      contextLogger.warn('warning message', { severity: 'high' });

      expect(scopedLogger.debug).toHaveBeenCalledWith('debug message', { key: 'value' });
      expect(scopedLogger.info).toHaveBeenCalledWith('info message', { data: 123 });
      expect(scopedLogger.warn).toHaveBeenCalledWith('warning message', { severity: 'high' });
    });

    it('passes Error objects through to electron-log intact', () => {
      const contextLogger = new MainLogger().create('TestContext');
      const error = new Error('test error');

      contextLogger.error('error occurred', error);

      expect(scopedLogger.error).toHaveBeenCalledWith('error occurred', error);
    });

    it('passes plain metadata objects through on error', () => {
      const contextLogger = new MainLogger().create('TestContext');

      contextLogger.error('error occurred', { code: 500 });

      expect(scopedLogger.error).toHaveBeenCalledWith('error occurred', { code: 500 });
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run tests/unit/main/infrastructure/logging/main-logger.test.js`
Expected: FAIL — `logger.factory.js` still imports winston / has no transport configuration matching the assertions.

- [ ] **Step 3: Rewrite `logger.factory.ts`**

Full new content:

```ts
import log from 'electron-log/main';
import path from 'path';
import type { LoggerLike, LoggerFactoryLike, LogLevel } from '@platform/core';

/**
 * electron-log-backed logger factory for the main process. Configures the
 * shared console/file transports once from the environment (NODE_ENV,
 * LOG_LEVEL, LOG_FILE, LOG_DIR) and hands out scoped loggers per DI context.
 */
export class MainLogger implements LoggerFactoryLike {
  constructor() {
    this._configureTransports();
  }

  private _configureTransports(): void {
    const isDevelopment = process.env.NODE_ENV !== 'production';
    const logLevel = (process.env.LOG_LEVEL as LogLevel) || (isDevelopment ? 'debug' : 'info');

    log.transports.console.level = logLevel;
    log.transports.file.level = !isDevelopment || process.env.LOG_FILE ? logLevel : false;
    log.transports.file.maxSize = 5242880;

    const logDir = process.env.LOG_DIR;
    if (logDir) {
      log.transports.file.resolvePathFn = () => path.join(logDir, 'combined.log');
    }
  }

  create(context: string): LoggerLike {
    const scoped = log.scope(context);

    return {
      debug: (...args: unknown[]): void => { scoped.debug(...args); },
      info: (...args: unknown[]): void => { scoped.info(...args); },
      warn: (...args: unknown[]): void => { scoped.warn(...args); },
      error: (...args: unknown[]): void => { scoped.error(...args); }
    };
  }
}
```

- [ ] **Step 4: Delete the winston mock factories**

In `tests/factories/system.factory.js`: delete `createWinstonLoggerMock` and `createWinstonRootLoggerMock` (lines 120-139). In `tests/factories/index.js`: delete the two re-export lines (113-114).

- [ ] **Step 5: Remove winston + the knip waiver**

In `package.json`, delete the `"winston": "^3.19.0",` dependency line. In `knip.json` `ignoreDependencies`, delete the `"electron-log"` entry. Then sync the lockfile offline-safely and verify:

```bash
npm install --package-lock-only
node -e "const l=require('./package-lock.json');const bad=Object.entries(l.packages).filter(([k,v])=>k.startsWith('node_modules/')&&!v.link&&(!v.resolved||!v.integrity));console.log(bad.length);process.exitCode=bad.length?1:0"
grep -rn "winston" src tests package.json
```
Expected: integrity prints `0`; the grep prints NOTHING.

- [ ] **Step 6: Tests pass, ladder, boot gate, commit**

Run: `npx vitest run tests/unit/main/infrastructure/logging/main-logger.test.js` — Expected: PASS (10 tests).
Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run && npm run dev:smoke`

```bash
git add src/main/infrastructure/logging tests/unit/main/infrastructure/logging tests/factories package.json package-lock.json knip.json
git commit -m "refactor(main): replace winston logging with electron-log"
```

---

### Task 13: Controller exit ritual

Controller-run; no implementer subagent.

- [ ] **Step 1: Full gate ladder with per-gate exit codes** (redirect each gate's output to the scratchpad and check `$?` directly — `${PIPESTATUS[0]}` is a bash-ism that fails under zsh)

```bash
npm run lint
npm run lint:dead-code
npm run typecheck
npm run test:run
npm run test:integration
npm run build:vite
npm run dev:smoke
npm run test:e2e
```
Expected: all exit 0; e2e 86/86 (re-run `streaming-smoke.spec.js` in isolation before treating a chained-ladder flake as regression). Also verify zero staged knip waivers remain: `grep -n "signals-core\|electron-log\|type-fest" knip.json` → nothing.

- [ ] **Step 2: Record the phase**

Append a P5 section to `docs/northstar/PHASE_LOG.md` following the P4 format: metrics table (test files/tests, prod LOC, test LOC, code delta excluding lockfile+docs) + notes (a)–(n) covering the UIB-3 disposition, the settings-fullscreen keyed-listener decision, the INF-3 scope, the CORE-3 true consumer count, the winston divergences, and the staged-knip-waiver mechanism. Commit:

```bash
git add docs/northstar/PHASE_LOG.md
git commit -m "docs(northstar): record P5 exit metrics"
```

- [ ] **Step 3: Merge, tag, clean up**

```bash
git checkout refactor/gpu_normalization
git merge --ff-only northstar/p5
git tag northstar-p5
git branch -d northstar/p5
git status --short
```
Expected: clean tree; `git log --oneline -1` shows the PHASE_LOG commit; tag `northstar-p5` present.
