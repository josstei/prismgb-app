# North Star P2 — Contract Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute Phase P2 of `NORTH_STAR_DESIGN_PLAN.md` — replace every locally re-declared contract with its canonical `@prismgb/core`/`@prismgb/events` import, promote duplicated helpers to core, add schema drift guards, and fix test-name drift (~−250 net LOC), ending with tag `northstar-p2`.

**Architecture:** Three sequential batches. 2A (Tasks 1–7): one canonical home per contract — core's own rival logger contract is deleted, then packages/main/renderer/ui-base swap local re-declarations for imports. 2B (Tasks 8–14): canonical helpers (`getErrorMessage`, `getElectronApp`, `deepFreeze`/`pruneUndefined`, `isPromiseLike`), `satisfies` drift guards, presentation config cleanup, and the event-bus reformat. 2C (Task 15): mechanical `git mv` renames. Task 16 is the exit gate.

**Tech Stack:** TypeScript 5.9 strict (`exactOptionalPropertyTypes: true`), zod 3.25, vitest 4, npm workspaces. Pre-commit is fast (lint-staged); full suite runs on pre-push and at the exit gate.

**Spec:** `NORTH_STAR_DESIGN_PLAN.md` §3 P2 + §2 scope map. **Evidence:** `CODEBASE_NORMALIZATION_ANALYSIS.md` (X-1, MAIN-7, APP-6, UIB-4, INF-8, UPD-2, EVT-3, PRES-8, PRES-9, CORE-5, X-4/MAIN-4, DEV-1, DEV-2, X-2, APP-7, NORM-2, TEST-5).

## Global Constraints

- **Commits:** conventional, subject ≤ 100 chars, one commit per task with EXACTLY the message given. **No AI attribution. Never `--no-verify`.**
- **Branch:** work on `northstar/phase-2` (created from `refactor/gpu_normalization`). No merge, no push, no PR; STOP at the checkpoint.
- **Comments:** never ADD inline comments; JSDoc only where shown. Editing/removing existing comments only where a step says so.
- **Gates:** per-task validations as written; `npm run dev:smoke` is MANDATORY on Tasks 9 and 13 (DI/boot-adjacent). Exit ladder in Task 16.
- **Scope:** touch ONLY the files each task lists. Do not relitigate `NORTH_STAR_DESIGN_PLAN.md` §1.5 rejections.

## Plan-time verification notes (2026-07-01, tree at `ae229529` / post-P1)

1. **X-1 caveat resolved:** core `StorageServiceLike` requires `removeItem(key): void`; the injected renderer impl (`browser-storage.adapter.ts:72`) provides it. Widening notes' contract is safe.
2. **Core carries a rival logger contract:** `interfaces/logger.ts` (`ILogger`/`ILoggerFactory`/`LogLevel`) duplicates `LoggerLike`/`LoggerFactoryLike` from `service.base.ts`. Three consumers (`app-bootstrap.ts`, notes, updates). P2 deletes it (addition beyond the audit, same defect class as X-1); `LogLevel` moves to `service.base.ts` (one consumer: main `logger.factory.ts`).
3. **X-4 `satisfies z.ZodType<DeviceInfoPayload>` compiles clean** under `exactOptionalPropertyTypes` — probed empirically against `tsconfig.app.json`.
4. **UIB-4 widening is safe:** core `EventTargetLike` is byte-identical to both local copies; widget tests pass full loggers (`tests/factories/logger.factory.js` `createLogger()`).
5. **X-2 `getElectronApp` in core is bundle-safe:** `vite-plugin-electron-renderer` is wired for the renderer graph; gated by `dev:smoke` + `build:vite` anyway. Members needed: `isPackaged`, `isQuitting` (writable), `getPath(name)`.
6. **Deviations (recorded, owner-visible):**
   - `update.bridge.ts` X-1 swap SKIPPED — UPD-1 deletes the whole file in P8.
   - `transcode-temp.utils.ts` local `Logger` SKIPPED — TRC-3 deletes it in P12.
   - eventBus `TypedEventBusLike` unification (APP-7 sub-item) DEFERRED to P6 — Inversify rewrites every constructor there.
   - TEST-5 `.test.js`→`.test.ts` extension conversion DEFERRED to P13 — `typecheck:tests` makes it non-mechanical.
   - `isErrorLike` export KEPT (consumer: `tests/unit/shared/lib/errors/error-guards.test.js`); CORE-5 is relocation only.

---

# Batch 2A — canonical contract imports

### Task 1: Promote `isPromiseLike` to core guards (EVT-3, core+renderer half)

**Files:**
- Modify: `packages/prismgb-core/src/primitives/guards.utils.ts`, `packages/prismgb-core/src/primitives/disposable-bag.ts`, `packages/prismgb-core/src/index.ts`, `src/renderer/infrastructure/services/settings/settings.service.ts`

**Interfaces:**
- Produces: `isPromiseLike<T = unknown>(value: unknown): value is Promise<T>` exported from `@prismgb/core`. (The `@prismgb/events` copy migrates in Task 14.)

- [ ] **Step 1:** Append to `packages/prismgb-core/src/primitives/guards.utils.ts`:

```ts
/** Narrows to a thenable. */
export function isPromiseLike<T = unknown>(value: unknown): value is Promise<T> {
  return typeof value === 'object' && value !== null && typeof (value as { then?: unknown }).then === 'function';
}
```

- [ ] **Step 2:** In `packages/prismgb-core/src/index.ts` change:

```ts
export { isRecord, isNumber, isString } from './primitives/guards.utils.js';
```
to:
```ts
export { isRecord, isNumber, isString, isPromiseLike } from './primitives/guards.utils.js';
```

- [ ] **Step 3:** In `packages/prismgb-core/src/primitives/disposable-bag.ts` delete the local guard:

```ts
function isPromiseLike(value: unknown): value is Promise<void> {
```
(the whole function, lines 20–23) and add to the top of the file:
```ts
import { isPromiseLike } from './guards.utils.js';
```
Then make the two call sites explicit: change `isPromiseLike(cancelled)` (line ~82) to `isPromiseLike<void>(cancelled)` and `isPromiseLike(result)` (line ~146) to `isPromiseLike<void>(result)`.

- [ ] **Step 4:** In `src/renderer/infrastructure/services/settings/settings.service.ts`: add `isPromiseLike` to the file's existing `@prismgb/core` import; change the call site at line ~101 from `this._isPromiseLike(value)` to `isPromiseLike<SettingValue>(value)`; delete the private `_isPromiseLike` method (line ~235) entirely.

- [ ] **Step 5:** Validate

Run: `npm run typecheck && npx vitest related --run packages/prismgb-core/src/primitives/disposable-bag.ts src/renderer/infrastructure/services/settings/settings.service.ts`
Expected: PASS.

- [ ] **Step 6:** Commit

```bash
git add -A
git commit -m "refactor(core): promote isPromiseLike to shared guards"
```

### Task 2: Delete core's rival logger contract (`interfaces/logger.ts`)

**Files:**
- Delete: `packages/prismgb-core/src/interfaces/logger.ts`
- Modify: `packages/prismgb-core/src/primitives/service.base.ts`, `packages/prismgb-core/src/index.ts`, `src/renderer/app-bootstrap.ts`, `packages/prismgb-notes/src/notes.service.ts`, `packages/prismgb-updates/src/update.service.ts`

**Interfaces:**
- Produces: `LogLevel` exported from `service.base.ts`; `ILogger`/`ILoggerFactory` gone — `LoggerLike`/`LoggerFactoryLike` are the only logger contracts.

- [ ] **Step 1:** Add to `packages/prismgb-core/src/primitives/service.base.ts`, directly above `export interface LoggerLike {`:

```ts
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
```

- [ ] **Step 2:** Delete `packages/prismgb-core/src/interfaces/logger.ts`:

```bash
git rm packages/prismgb-core/src/interfaces/logger.ts
```

- [ ] **Step 3:** In `packages/prismgb-core/src/index.ts` delete:

```ts
export type { Logger as ILogger, LoggerFactory as ILoggerFactory, LogLevel } from './interfaces/logger.js';
```
and extend the service.base export line — change:
```ts
export { BaseService, type LoggerLike, type EventBusLike, type LoggerFactoryLike, type StorageServiceLike, type ServiceEventDescriptor } from './primitives/service.base.js';
```
to:
```ts
export { BaseService, type LoggerLike, type EventBusLike, type LoggerFactoryLike, type StorageServiceLike, type ServiceEventDescriptor, type LogLevel } from './primitives/service.base.js';
```
(If the "Core Interfaces" section comment block above the deleted line becomes empty, delete the comment block too.)

- [ ] **Step 4:** Migrate the three consumers:
  - `src/renderer/app-bootstrap.ts:6`: change `import type { LoggerLike, ILoggerFactory as LoggerFactoryLike, EventBusLike } from '@prismgb/core';` to `import type { LoggerLike, LoggerFactoryLike, EventBusLike } from '@prismgb/core';`
  - `packages/prismgb-notes/src/notes.service.ts:2`: change `import type { ILoggerFactory as LoggerFactoryLike } from '@prismgb/core';` to `import type { LoggerFactoryLike } from '@prismgb/core';`
  - `packages/prismgb-updates/src/update.service.ts:6`: change `import type { ILoggerFactory as LoggerFactory } from '@prismgb/core';` to `import type { LoggerFactoryLike as LoggerFactory } from '@prismgb/core';`

- [ ] **Step 5:** Validate

Run: `npm run typecheck`
Expected: PASS (main `logger.factory.ts` already imports `LogLevel` from the barrel — unchanged).

Run: `grep -rn "ILoggerFactory\|ILogger\b" src packages tests`
Expected: no matches.

- [ ] **Step 6:** Commit

```bash
git add -A
git commit -m "refactor(core): unify logger contracts onto LoggerFactoryLike"
```

### Task 3: Relocate error helpers out of the core barrel (CORE-5)

**Files:**
- Create: `packages/prismgb-core/src/primitives/error.utils.ts`
- Modify: `packages/prismgb-core/src/index.ts`

- [ ] **Step 1:** Create `packages/prismgb-core/src/primitives/error.utils.ts` with exactly the runtime block currently in `index.ts` (lines 8–35):

```ts
export interface ErrorLike {
  message: string;
}

export function isErrorLike(value: unknown): value is ErrorLike {
  return (
    typeof value === 'object' &&
    value !== null &&
    'message' in value &&
    typeof value.message === 'string'
  );
}

export function getErrorMessage(value: unknown, fallback = 'Unknown error'): string {
  if (isErrorLike(value)) {
    return value.message || fallback;
  }

  if (typeof value === 'string' && value.length > 0) {
    return value;
  }

  return fallback;
}
```

- [ ] **Step 2:** In `packages/prismgb-core/src/index.ts` delete that whole block (the `ErrorLike` interface through `getErrorMessage`, including the "Error helpers" comment banner) and add in its place:

```ts
export { isErrorLike, getErrorMessage } from './primitives/error.utils.js';
export type { ErrorLike } from './primitives/error.utils.js';
```

- [ ] **Step 3:** Validate

Run: `npm run typecheck && npx vitest run tests/unit/shared/lib/errors/error-guards.test.js`
Expected: PASS (the barrel surface is unchanged; only the definition moved).

- [ ] **Step 4:** Commit

```bash
git add -A
git commit -m "refactor(core): relocate error helpers into primitives module"
```

### Task 4: Canonical contracts in notes, updates, transcode (X-1 + UPD-2)

**Files:**
- Modify: `packages/prismgb-notes/src/notes.service.ts`, `packages/prismgb-updates/src/update.service.ts`, `packages/prismgb-transcode/src/transcode.service.ts`

- [ ] **Step 1 (notes):** in `notes.service.ts` delete the local interface:

```ts
interface StorageServiceLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): boolean;
}
```
and change line 2's import (post-Task-2 form) to include it:
```ts
import type { LoggerFactoryLike, StorageServiceLike } from '@prismgb/core';
```

- [ ] **Step 2 (updates):** in `packages/prismgb-updates/src/update.service.ts`:
  - delete the local interface:
```ts
interface EventBus {
  publish(event: string, data: unknown): void;
}
```
  - add `EventBusLike` to the core import: `import type { LoggerFactoryLike as LoggerFactory, EventBusLike } from '@prismgb/core';`
  - in `UpdateServiceDependencies` change `eventBus: EventBus;` to `eventBus: EventBusLike;`
  - delete the local channel literal:
```ts
const MainEventChannels = {
  UPDATE: {
    STATE_CHANGED: 'update:state-changed' as const
  }
};
```
  and add the canonical import: `import { MainEventChannels } from '@prismgb/events';`
  (The local `WindowService` and `Config` port interfaces STAY — deliberate interface segregation.)

- [ ] **Step 3 (transcode):** in `packages/prismgb-transcode/src/transcode.service.ts` replace the inline shapes in `TranscodeServiceDependencies`:

```ts
interface TranscodeServiceDependencies {
  windowService: {
    send: (channel: string, data: unknown) => void;
  };
  eventBus: unknown;
  loggerFactory: {
    create: (name: string) => {
      info: (message: string, meta?: Record<string, unknown>) => void;
      debug: (message: string, meta?: Record<string, unknown>) => void;
      warn: (message: string, meta?: Record<string, unknown>) => void;
      error: (message: string, meta?: Record<string, unknown>) => void;
    };
  };
}
```
with:
```ts
interface TranscodeServiceDependencies {
  windowService: {
    send: (channel: string, data: unknown) => void;
  };
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
}
```
adding to the file's imports: `import type { EventBusLike, LoggerFactoryLike } from '@prismgb/core';` (merge with any existing `@prismgb/core` import).

- [ ] **Step 4:** Validate

Run: `npm run typecheck && npx vitest related --run packages/prismgb-notes/src/notes.service.ts packages/prismgb-updates/src/update.service.ts packages/prismgb-transcode/src/transcode.service.ts`
Expected: PASS.

Run: `grep -rn "update:state-changed" packages/prismgb-updates/src`
Expected: no matches (only the `@prismgb/events` constant is used).

- [ ] **Step 5:** Commit

```bash
git add -A
git commit -m "refactor(packages): adopt canonical core contracts in notes, updates, transcode"
```

### Task 5: `LoggerFactoryLike` in main services (MAIN-7)

**Files:**
- Modify: `src/main/infrastructure/window/window.service.ts`, `src/main/infrastructure/tray/tray.service.ts`, `src/main/infrastructure/window/login-item.service.ts`

- [ ] **Step 1:** In each of the three files, replace the inline shape inside the `*Dependencies` interface:

```ts
  loggerFactory: {
    create: (name: string) => {
      info: (message: string) => void;
      debug: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    };
  };
```
with:
```ts
  loggerFactory: LoggerFactoryLike;
```
(tray's variant lists the methods in a different order — same replacement) and add to each file's imports: `import type { LoggerFactoryLike } from '@prismgb/core';` (merge with the existing `@prismgb/core` import where one exists, e.g. login-item's `import { BaseService } from '@prismgb/core';`).

- [ ] **Step 2:** Validate

Run: `npm run typecheck && npx vitest run tests/unit/main`
Expected: PASS.

- [ ] **Step 3:** Commit

```bash
git add -A
git commit -m "refactor(main): adopt LoggerFactoryLike in window, tray, login-item services"
```

### Task 6: Drop local `LoggerFactoryLike` aliases in orchestrators (APP-6)

**Files:**
- Modify: `src/renderer/application/orchestrators/capture.orchestrator.ts`, `src/renderer/application/orchestrators/streaming.orchestrator.ts`

- [ ] **Step 1:** In each file delete the local alias:

```ts
type LoggerFactoryLike = {
  create(name: string): LoggerLike;
};
```
and add `LoggerFactoryLike` to the file's existing `@prismgb/core` type import (both already import `LoggerLike` from core).

- [ ] **Step 2:** Validate

Run: `npm run typecheck && npx vitest related --run src/renderer/application/orchestrators/capture.orchestrator.ts src/renderer/application/orchestrators/streaming.orchestrator.ts`
Expected: PASS.

- [ ] **Step 3:** Commit

```bash
git add -A
git commit -m "refactor(renderer): drop local logger factory aliases in orchestrators"
```

### Task 7: Core `EventTargetLike` + `LoggerLike` in ui-base (UIB-4)

**Files:**
- Modify: `packages/prismgb-core/src/index.ts`, `packages/prismgb-ui-base/src/lifecycle/presentation-component.base.ts`, `packages/prismgb-ui-base/src/widgets/activity-auto-hide.controller.ts`, `packages/prismgb-ui-base/src/widgets/disclosure.class.ts`, `packages/prismgb-ui-base/src/widgets/listbox-dropdown.class.ts`, `packages/prismgb-ui-base/src/widgets/combobox-listbox.class.ts`

- [ ] **Step 1:** In `packages/prismgb-core/src/index.ts` change:

```ts
export type { Disposable, DisposableFunction, DisposableKey } from './primitives/disposable-bag.js';
```
to:
```ts
export type { Disposable, DisposableFunction, DisposableKey, EventTargetLike } from './primitives/disposable-bag.js';
```

- [ ] **Step 2:** In `presentation-component.base.ts` and `activity-auto-hide.controller.ts`, delete the local `type EventTargetLike = { ... };` block (byte-identical to core's) and import it instead: add `EventTargetLike` to presentation-component's existing `@prismgb/core` type import; in activity-auto-hide add `import type { EventTargetLike } from '@prismgb/core';`.

- [ ] **Step 3:** In each of `disclosure.class.ts`, `listbox-dropdown.class.ts`, `combobox-listbox.class.ts`, delete the local:

```ts
type PresentationPrimitiveLogger = {
  warn(message: string, ...args: unknown[]): void;
};
```
add `import type { LoggerLike } from '@prismgb/core';`, and replace every `PresentationPrimitiveLogger` reference in the file with `LoggerLike` (options field, `declare logger:` field, and any parameter types).

- [ ] **Step 4:** Validate

Run: `npm run typecheck && npx vitest run --project ui-base-package tests/unit/renderer/presentation/primitives`
Expected: PASS (widget tests pass full `createLogger()` mocks — compatible with `LoggerLike`).

- [ ] **Step 5:** Commit

```bash
git add -A
git commit -m "refactor(ui-base): adopt core EventTargetLike and LoggerLike contracts"
```

# Batch 2B — canonical helpers & guards

### Task 8: Normalize error extraction onto `getErrorMessage` (INF-8)

**Files:**
- Modify: `src/renderer/infrastructure/adapters/platform-metrics.adapter.ts`, `src/renderer/infrastructure/services/capture/capture-save.service.ts`, `src/renderer/infrastructure/services/updates/update.service.ts`, `src/renderer/infrastructure/services/transcode/transcode.service.ts`, `src/renderer/infrastructure/browser/browser-storage.adapter.ts`

- [ ] **Step 1:** Replace all eight inline ternaries. In `platform-metrics.adapter.ts:20`, `capture-save.service.ts:83,116`, `updates/update.service.ts:194,216,238`:

```ts
error instanceof Error ? error.message : String(error)
```
becomes:
```ts
getErrorMessage(error)
```
and in `transcode/transcode.service.ts:96,114`:
```ts
        error: error instanceof Error ? error.message : String(error)
```
becomes:
```ts
        error: getErrorMessage(error)
```
In each file add `getErrorMessage` to the existing `@prismgb/core` import; `platform-metrics.adapter.ts` has no core import — add `import { getErrorMessage } from '@prismgb/core';`.

- [ ] **Step 2:** In `browser-storage.adapter.ts` delete the bespoke variant:

```ts
function getThrownMessage(error: unknown): unknown {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    return (error as { message?: unknown }).message;
  }

  return undefined;
}
```
replace its three call sites (lines ~44, ~67, ~76) `getThrownMessage(error)` with `getErrorMessage(error)`, and add `getErrorMessage` to the file's `@prismgb/core` import (line 1 currently imports types only — make it `import { getErrorMessage, type LoggerLike, type StorageServiceLike } from '@prismgb/core';`).

- [ ] **Step 3:** Validate

Run: `npm run typecheck && npx vitest run tests/unit/renderer/infrastructure/browser/browser-services.test.js && npx vitest related --run src/renderer/infrastructure/services/capture/capture-save.service.ts src/renderer/infrastructure/services/updates/update.service.ts src/renderer/infrastructure/services/transcode/transcode.service.ts src/renderer/infrastructure/adapters/platform-metrics.adapter.ts`
Expected: PASS (the storage tests assert message strings like `'Storage access denied'` — `getErrorMessage` yields the same values).

Run: `grep -rn "instanceof Error ? error.message : String(error)\|getThrownMessage" src packages`
Expected: no matches.

- [ ] **Step 4:** Commit

```bash
git add -A
git commit -m "refactor(renderer): normalize error extraction onto getErrorMessage"
```

### Task 9: Core `getElectronApp` accessor (X-2) — dev:smoke gated

**Files:**
- Create: `packages/prismgb-core/src/primitives/electron-app.utils.ts`
- Modify: `packages/prismgb-core/src/index.ts`, `packages/prismgb-updates/src/update.service.ts`, `packages/prismgb-transcode/src/ffmpeg-path.utils.ts`, `packages/prismgb-transcode/src/transcode-temp.utils.ts`, `packages/prismgb-transcode/src/transcode.service.ts`

**Interfaces:**
- Produces: `getElectronApp(): ElectronAppLike | null` from `@prismgb/core`; `ElectronAppLike = { isPackaged: boolean; isQuitting?: boolean; getPath(name: string): string }`.

- [ ] **Step 1:** Create `packages/prismgb-core/src/primitives/electron-app.utils.ts`:

```ts
import { createRequire } from 'node:module';

/**
 * Structural view of the Electron `app` API surface shared code relies on,
 * kept dependency-free so core needs no electron type import.
 */
export interface ElectronAppLike {
  isPackaged: boolean;
  isQuitting?: boolean;
  getPath(name: string): string;
}

let cachedElectronApp: ElectronAppLike | null | undefined;

/**
 * Resolves the Electron `app` instance when running in the main process,
 * or null outside Electron (plain Node, renderer, tests). Memoized.
 */
export function getElectronApp(): ElectronAppLike | null {
  if (cachedElectronApp === undefined) {
    try {
      const require = createRequire(import.meta.url);
      cachedElectronApp = (require('electron') as { app?: ElectronAppLike }).app ?? null;
    } catch {
      cachedElectronApp = null;
    }
  }
  return cachedElectronApp;
}
```

- [ ] **Step 2:** Add to `packages/prismgb-core/src/index.ts` (with the other primitives exports):

```ts
export { getElectronApp } from './primitives/electron-app.utils.js';
export type { ElectronAppLike } from './primitives/electron-app.utils.js';
```

- [ ] **Step 3 (updates):** in `update.service.ts` delete the local accessor (the `let electronApp: any = null;` line and the whole `function getApp() { ... }` block, including its `createRequire` usage), add `getElectronApp` to the file's `@prismgb/core` import, and change the single call site (~line 340) from `const electronApp = getApp();` to `const electronApp = getElectronApp();`. Remove the now-unused `import { createRequire } from 'module';` if nothing else in the file uses it.

- [ ] **Step 4 (ffmpeg-path):** in `ffmpeg-path.utils.ts` replace the body of `checkIsPackaged` — change:

```ts
  try {
    const { app } = require('electron');
    isPackagedVal = app.isPackaged;
  } catch {
    isPackagedVal = false;
  }
  return isPackagedVal ?? false;
```
to:
```ts
  isPackagedVal = getElectronApp()?.isPackaged ?? false;
  return isPackagedVal;
```
adding `import { getElectronApp } from '@prismgb/core';`. The file-level `createRequire` stays (still used for `ffmpeg-static`/`ffprobe-static` resolution).

- [ ] **Step 5 (transcode-temp):** in `transcode-temp.utils.ts` change `getTempBaseDir`:

```ts
  let tempDir: string;
  try {
    const { app } = require('electron');
    tempDir = app.getPath('temp');
  } catch {
    const os = require('node:os');
    tempDir = os.tmpdir();
  }
  return path.join(tempDir, 'prismgb-transcode');
```
to:
```ts
  const tempDir = getElectronApp()?.getPath('temp') ?? os.tmpdir();
  return path.join(tempDir, 'prismgb-transcode');
```
adding `import { getElectronApp } from '@prismgb/core';` and `import os from 'node:os';`; delete the file's `createRequire` import + `const require = ...` if now unused.

- [ ] **Step 6 (transcode.service):** replace the inline downloads block:

```ts
      const require = (await import('node:module')).createRequire(import.meta.url);
      let downloadsDir: string;
      try {
        const { app } = require('electron');
        downloadsDir = app.getPath('downloads');
      } catch {
        const os = require('node:os');
        downloadsDir = path.join(os.homedir(), 'Downloads');
      }
```
with:
```ts
      const downloadsDir = getElectronApp()?.getPath('downloads') ?? path.join(os.homedir(), 'Downloads');
```
adding `getElectronApp` to the `@prismgb/core` import and `import os from 'node:os';` if not present. Keep the existing comment line above the block intact.

- [ ] **Step 7:** Validate (bundle-safety class — full ladder)

Run: `npm run typecheck && npx vitest related --run packages/prismgb-updates/src/update.service.ts packages/prismgb-transcode/src/ffmpeg-path.utils.ts packages/prismgb-transcode/src/transcode-temp.utils.ts packages/prismgb-transcode/src/transcode.service.ts && npm run dev:smoke && npm run build:vite`
Expected: ALL PASS (`dev:smoke` prints "Renderer application started successfully").

Run: `grep -rn "require('electron')" packages src | grep -v electron-app.utils`
Expected: no matches.

- [ ] **Step 8:** Commit

```bash
git add -A
git commit -m "refactor(core): add getElectronApp accessor and dedupe electron lookups"
```

### Task 10: `deepFreeze` + `pruneUndefined` onto core (DEV-1 + DEV-2)

**Files:**
- Create: `packages/prismgb-core/src/primitives/object.utils.ts`
- Modify: `packages/prismgb-core/src/index.ts`, `packages/prismgb-devices/src/domain/catalog.ts`, `packages/prismgb-devices/src/testkit/fixtures.ts`, `packages/prismgb-devices/src/domain/payloads.ts`, `packages/prismgb-devices/src/application/connection.service.ts`

**Interfaces:**
- Produces: `deepFreeze<T>(value: T): T` and `pruneUndefined<T extends object>(record: { [K in keyof T]: T[K] | undefined }): T` from `@prismgb/core`.

- [ ] **Step 1:** Create `packages/prismgb-core/src/primitives/object.utils.ts`:

```ts
/**
 * Recursively freezes an object graph in place. Already-frozen nodes and
 * primitives are returned untouched.
 */
export function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value;
  }

  for (const nestedValue of Object.values(value as Record<string, unknown>)) {
    deepFreeze(nestedValue);
  }

  return Object.freeze(value);
}

/**
 * Returns a copy of the record with every undefined-valued key removed,
 * typed for exactOptionalPropertyTypes construction sites.
 */
export function pruneUndefined<T extends object>(record: { [K in keyof T]: T[K] | undefined }): T {
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined)
  ) as T;
}
```

- [ ] **Step 2:** Add to `packages/prismgb-core/src/index.ts`:

```ts
export { deepFreeze, pruneUndefined } from './primitives/object.utils.js';
```

- [ ] **Step 3 (catalog):** in `packages/prismgb-devices/src/domain/catalog.ts` delete the local `function deepFreeze<T>(value: T): T { ... }` and `function compactRecord(record: Record<string, unknown>): DeviceConstraintMap { ... }`; add `import { deepFreeze, pruneUndefined } from '@prismgb/core';`. `compactRecord` has exactly one call site (`getSimpleVideoConstraints`, line ~245) — it becomes:

```ts
function getSimpleVideoConstraints(descriptor: DeviceDescriptor): DeviceConstraintMap {
  return pruneUndefined<DeviceConstraintMap>({
    width: getConstraintValue(descriptor.media.video.width),
    height: getConstraintValue(descriptor.media.video.height),
    frameRate: getConstraintValue(descriptor.media.video.frameRate)
  });
}
```
(`DeviceConstraintMap = Record<string, unknown>`, so the widened input type is satisfied.) `cloneJson`/`cloneAndFreeze` stay local.

- [ ] **Step 4 (fixtures):** in `packages/prismgb-devices/src/testkit/fixtures.ts` delete the byte-identical local `deepFreeze` and add `import { deepFreeze } from '@prismgb/core';`.

- [ ] **Step 5 (payloads):** in `packages/prismgb-devices/src/domain/payloads.ts`:
  - `toDeviceInfoPayload` becomes the spread identity (types are field-identical):
```ts
export function toDeviceInfoPayload(info: DeviceInfo): DeviceInfoPayload {
  return { ...info };
}
```
  - `toDeviceInfo` collapses onto `pruneUndefined`:
```ts
export function toDeviceInfo(descriptor: DeviceDescriptor, observed: ObservedUsbDevice): DeviceInfo {
  return pruneUndefined<DeviceInfo>({
    id: descriptor.id,
    name: descriptor.name,
    manufacturer: descriptor.manufacturer,
    vendorId: observed.vendorId,
    productId: observed.productId,
    locationId: observed.locationId,
    deviceAddress: observed.deviceAddress,
    serialNumber: observed.serialNumber
  });
}
```
  - `toDeviceStatusPayload` likewise:
```ts
export function toDeviceStatusPayload(status: DeviceStatus): DeviceStatusPayload {
  return pruneUndefined<DeviceStatusPayload>({
    state: status.state,
    connected: status.connected,
    device: status.device ? toDeviceInfoPayload(status.device) : null,
    error: status.error
  });
}
```
  - add `import { pruneUndefined } from '@prismgb/core';`.

- [ ] **Step 6 (connection.service):** replace the 35-line `toObservedUsbDevice` if-cascade with:

```ts
function toObservedUsbDevice(device: UsbDevice): ObservedUsbDevice {
  return pruneUndefined<ObservedUsbDevice>({
    vendorId: device.vendorId,
    productId: device.productId,
    locationId: device.locationId,
    deviceAddress: device.deviceAddress,
    deviceName: device.deviceName,
    manufacturer: device.manufacturer,
    serialNumber: device.serialNumber,
    deviceClass: device.deviceClass,
    busNumber: device.busNumber
  });
}
```
adding `pruneUndefined` to the file's `@prismgb/core` import.

- [ ] **Step 7:** Validate

Run: `npm run typecheck && npx vitest run tests/unit/packages tests/unit/main`
Expected: PASS (device payload/parity tests use `toEqual`-style shape assertions — runtime key pruning is preserved by `pruneUndefined`).

- [ ] **Step 8:** Commit

```bash
git add -A
git commit -m "refactor(devices): dedupe deepFreeze and optional-field pruning onto core helpers"
```

### Task 11: `satisfies` drift guards on device schemas (X-4/MAIN-4 cheap form)

**Files:**
- Modify: `src/main/ipc/schemas/device.schemas.ts`

- [ ] **Step 1:** Add the type import and guards (form empirically verified against `tsconfig.app.json`):

```ts
import type { DeviceInfoPayload, DeviceStatusPayload } from '@prismgb/devices';
```
change the `deviceInfoSchema` declaration's closing from:
```ts
  .strict();
```
to:
```ts
  .strict() satisfies z.ZodType<DeviceInfoPayload>;
```
and `deviceStatusPayloadSchema`'s closing from:
```ts
  .strict();
```
to:
```ts
  .strict() satisfies z.ZodType<DeviceStatusPayload>;
```

- [ ] **Step 2:** Validate (including the negative test — the guard must actually guard)

Run: `npm run typecheck:app`
Expected: PASS.

Temporarily change `vendorId: z.number(),` to `vendorId: z.string(),` in `deviceInfoSchema`, run `npm run typecheck:app`, expect FAIL with a satisfies/assignability error, then revert the probe edit and re-run to PASS.

- [ ] **Step 3:** Commit

```bash
git add src/main/ipc/schemas/device.schemas.ts
git commit -m "refactor(ipc): add satisfies drift guards to device schemas"
```

### Task 12: Presentation config cleanup (PRES-8 + PRES-9)

**Files:**
- Delete: `src/renderer/presentation/config/constants.config.ts`
- Modify: `src/renderer/presentation/config/css-classes.config.ts`, `src/renderer/presentation/effects/body-class.class.ts`, `src/renderer/presentation/bridges/capture-ui.bridge.ts`, `src/renderer/presentation/effects/button-feedback.effect.ts`, `src/renderer/presentation/effects/ui-effects.class.ts`, `src/renderer/presentation/effects/controls-auto-hide.effect.ts`

- [ ] **Step 1 (PRES-8):** in each of the five consumer files, change the import specifier from `@renderer/presentation/config/constants.config` to `@prismgb/config` (imported name `TIMING` unchanged; body-class's is at line 1). Then:

```bash
git rm src/renderer/presentation/config/constants.config.ts
```

- [ ] **Step 2 (PRES-9):** in `css-classes.config.ts`, under the existing `// Body state` comment next to `BODY_READY`, add:

```ts
  APP_IDLE: 'app-idle',
  APP_HIDDEN: 'app-hidden',
```

- [ ] **Step 3:** in `body-class.class.ts` delete:

```ts
const APP_CSS_CLASSES = Object.freeze({
  IDLE: 'app-idle',
  HIDDEN: 'app-hidden',
  ANIMATIONS_OFF: 'app-animations-off'
});
```
and replace the four references: `APP_CSS_CLASSES.IDLE` → `CSSClasses.APP_IDLE`, `APP_CSS_CLASSES.HIDDEN` → `CSSClasses.APP_HIDDEN`, `APP_CSS_CLASSES.ANIMATIONS_OFF` → `CSSClasses.APP_ANIMATIONS_OFF` (two sites: `setAnimationsOff`, `areAnimationsOff`).

- [ ] **Step 4:** Validate

Run: `npm run typecheck && npx vitest run tests/unit/renderer/presentation`
Expected: PASS.

Run: `grep -rn "constants.config\|APP_CSS_CLASSES" src tests`
Expected: no matches.

- [ ] **Step 5:** Commit

```bash
git add -A
git commit -m "refactor(presentation): drop TIMING shim and merge body css class tokens"
```

### Task 13: Orchestrator dependency types + PresentationModeStore into DI (APP-7) — dev:smoke gated

**Files:**
- Modify: `src/renderer/application/orchestrators/performance/performance-metrics.orchestrator.ts`, `.../performance/performance-animation.orchestrator.ts`, `.../performance/performance-state.orchestrator.ts`, `src/renderer/application/di/manual-providers.ts`, `src/renderer/app-bootstrap.ts`, `tests/unit/renderer/application/container.test.ts`, `tests/unit/renderer/application/di/manual-providers.test.ts`

- [ ] **Step 1:** In each performance orchestrator, hoist the inline constructor dependency type to a named interface directly above the class, following the convention of the six non-performance orchestrators. Example (`performance-metrics.orchestrator.ts`):

```ts
interface PerformanceMetricsOrchestratorDependencies {
  eventBus: EventBusLike;
  loggerFactory: LoggerFactoryLike;
  performanceMetricsService: PerformanceMetricsService;
}
```
with the constructor becoming `constructor(dependencies: PerformanceMetricsOrchestratorDependencies) {`. Repeat for `PerformanceAnimationOrchestratorDependencies` (`eventBus`, `animationPerformanceService`, `bodyClassManager`, `loggerFactory`) and `PerformanceStateOrchestratorDependencies` (`eventBus`, `performanceStateService`, `loggerFactory`) with their exact current members.

- [ ] **Step 2:** Register `PresentationModeStore` as a manual provider. In `src/renderer/application/di/manual-providers.ts` add these imports (the file already imports presentation modules — `UIComponentRegistry` — so the layer direction is established):

```ts
import type { EventBusLike } from '@prismgb/core';
import type { ReadonlySignal } from '@prismgb/ui-base/reactive';
import { PresentationModeStore } from '../../presentation/state/presentation-mode.store';
```
(merge `EventBusLike` into the existing `@prismgb/core` type import) and add this entry to the `manualProviders` record, after `devicePreferenceStore`:

```ts
  presentationModeStore: (resolve) =>
    new PresentationModeStore({
      eventBus: resolve<EventBusLike>('eventBus'),
      cinematicEnabled: resolve<{ cinematicModeSignal: ReadonlySignal<boolean> }>('appState').cinematicModeSignal
    }),
```
(`PresentationModeStoreDependencies` requires exactly `{ eventBus: EventBusLike; cinematicEnabled: ReadonlySignal<boolean> }` — verified against `presentation-mode.store.ts`.)

- [ ] **Step 3:** In `src/renderer/app-bootstrap.ts` `_initializeUI`, replace:

```ts
    const presentationModeStore = new PresentationModeStore({
      eventBus,
      cinematicEnabled: appState.cinematicModeSignal
    });
```
with:
```ts
    const presentationModeStore = container.resolve<PresentationModeStore>('presentationModeStore');
```
and change the `PresentationModeStore` import to type-only (`import type { PresentationModeStore } from './presentation/state/presentation-mode.store.js';`).

- [ ] **Step 4:** Update the DI tests: in `container.test.ts` add `'presentationModeStore',` to the expected-token array (alphabetical/grouped consistent with neighbors) and add `expect(() => container.resolve('presentationModeStore')).not.toThrow();` beside the other manual-provider resolution checks. In `manual-providers.test.ts` update the token-list test: title `'exposes exactly the five non-standard-construction tokens'` → `'exposes exactly the six non-standard-construction tokens'` and add `'presentationModeStore'` to the expected array.

- [ ] **Step 5:** Validate

Run: `npm run typecheck && npx vitest run tests/unit/renderer/application && npm run dev:smoke`
Expected: PASS; smoke prints "Renderer application started successfully".

- [ ] **Step 6:** Commit

```bash
git add -A
git commit -m "refactor(application): name orchestrator deps, register presentation store in DI"
```

### Task 14: Reformat `event-bus.ts` + adopt core `isPromiseLike` (NORM-2 + EVT-3 events half)

**Files:**
- Modify: `packages/prismgb-events/src/event-bus.ts` (full rewrite, zero behavior change)

- [ ] **Step 1:** Replace the file's entire content with the conventionally-formatted equivalent (semantics identical; the only substantive change is importing `isPromiseLike` from core and the explicit `<void>` at the `invokeHandler` narrow):

```ts
import EventEmitter from 'eventemitter3';
import { isPromiseLike } from '@prismgb/core';

export type EventHandler<T = unknown> = (data: T) => void | Promise<void>;
export type UnsubscribeFn = () => void;

interface EventBusLogger {
  error(message: string, error: Error): void;
}

interface EventBusDependencies {
  loggerFactory?: {
    create(name: string): EventBusLogger;
  };
  loggerName?: string;
  handlerErrorEvent?: string;
  createHandlerErrorPayload?: (eventName: string, error: Error) => unknown;
}

export interface IEventBus {
  publish<T = unknown>(event: string, data?: T): void;
  publishAsync<T = unknown>(event: string, data?: T): Promise<void>;
  subscribe<T = unknown>(event: string, handler: EventHandler<T>): UnsubscribeFn;
  unsubscribe<T = unknown>(event: string, handler: EventHandler<T>): void;
}

export class SharedEventBus implements IEventBus {
  readonly emitter: EventEmitter<string, unknown>;
  private readonly listeners = new Map<string, Map<EventHandler<unknown>, Set<EventHandler<unknown>>>>();
  private readonly logger: EventBusLogger | undefined;
  private readonly handlerErrorEvent: string | undefined;
  private readonly createHandlerErrorPayload: ((eventName: string, error: Error) => unknown) | undefined;

  constructor({ loggerFactory, loggerName = 'EventBus', handlerErrorEvent, createHandlerErrorPayload }: EventBusDependencies = {}) {
    this.emitter = new EventEmitter();
    this.logger = loggerFactory?.create(loggerName);
    this.handlerErrorEvent = handlerErrorEvent;
    this.createHandlerErrorPayload = createHandlerErrorPayload;
  }

  publish<T = unknown>(event: string, data?: T): void {
    try {
      this.emitter.emit(event, data);
    } catch (error) {
      const handlerError = this.normalizeError(error);
      this.logger?.error(`Error in event handler for "${event}":`, handlerError);
      this.emitHandlerError(event, handlerError);
    }
  }

  async publishAsync<T = unknown>(event: string, data?: T): Promise<void> {
    await Promise.all(
      this.emitter
        .listeners(event)
        .map((handler) => this.invokeHandler(event, handler as EventHandler<unknown>, data))
        .filter(isPromiseLike)
    );
  }

  subscribe<T = unknown>(event: string, handler: EventHandler<T>): UnsubscribeFn {
    if (typeof handler !== 'function') {
      throw new TypeError('Handler must be a function');
    }

    const sourceHandler = handler as EventHandler<unknown>;
    const wrappedHandler = ((data: unknown) => this.invokeHandler(event, sourceHandler, data)) as EventHandler<unknown>;
    const eventListeners = this.listeners.get(event) ?? new Map<EventHandler<unknown>, Set<EventHandler<unknown>>>();
    const handlerListeners = eventListeners.get(sourceHandler) ?? new Set<EventHandler<unknown>>();

    if (!this.listeners.has(event)) {
      this.listeners.set(event, eventListeners);
    }

    if (!eventListeners.has(sourceHandler)) {
      eventListeners.set(sourceHandler, handlerListeners);
    }

    handlerListeners.add(wrappedHandler);
    this.emitter.on(event, wrappedHandler);

    return () => this.removeSubscription(event, sourceHandler, wrappedHandler);
  }

  unsubscribe<T = unknown>(event: string, handler: EventHandler<T>): void {
    const sourceHandler = handler as EventHandler<unknown>;
    const wrappedHandler = this.listeners.get(event)?.get(sourceHandler)?.values().next().value;

    if (wrappedHandler) {
      this.removeSubscription(event, sourceHandler, wrappedHandler);
    }
  }

  private removeSubscription(event: string, sourceHandler: EventHandler<unknown>, wrappedHandler: EventHandler<unknown>): void {
    this.emitter.off(event, wrappedHandler);

    const eventListeners = this.listeners.get(event);
    const handlerListeners = eventListeners?.get(sourceHandler);
    handlerListeners?.delete(wrappedHandler);

    if (handlerListeners?.size === 0) {
      eventListeners?.delete(sourceHandler);
    }

    if (eventListeners?.size === 0) {
      this.listeners.delete(event);
    }
  }

  private emitHandlerError(event: string, error: Error): void {
    if (!this.handlerErrorEvent || event === this.handlerErrorEvent) {
      return;
    }

    this.publish(this.handlerErrorEvent, this.createHandlerErrorPayload?.(event, error) ?? { eventName: event, error });
  }

  private invokeHandler(event: string, handler: EventHandler<unknown>, data: unknown): void | Promise<void> {
    try {
      const result = handler(data);
      if (isPromiseLike<void>(result)) {
        return result.catch((error) => this.handleHandlerError(event, error));
      }
    } catch (error) {
      this.handleHandlerError(event, error);
    }
  }

  private handleHandlerError(event: string, error: unknown): void {
    const handlerError = this.normalizeError(error);
    this.logger?.error(`Error in event handler for "${event}":`, handlerError);
    this.emitHandlerError(event, handlerError);
  }

  private normalizeError(error: unknown): Error {
    return error instanceof Error ? error : new Error(String(error));
  }
}
```

- [ ] **Step 2:** Validate

Run: `npm run typecheck && npm run lint && npx vitest run tests/unit/shared tests/unit/renderer/infrastructure/events`
Expected: PASS.

Run: `grep -rn "function isPromiseLike" packages src`
Expected: only `packages/prismgb-core/src/primitives/guards.utils.ts` (EVT-3 fully consolidated).

- [ ] **Step 3:** Commit

```bash
git add packages/prismgb-events/src/event-bus.ts
git commit -m "style(events): reformat event-bus to workspace conventions"
```

# Batch 2C — mechanical renames

### Task 15: Rename drifted test files to match subjects (TEST-5)

**Files:** five `git mv` renames (extensions unchanged; `.js`→`.ts` conversion deferred to P13 per plan-time note 6).

- [ ] **Step 1:**

```bash
git mv tests/unit/renderer/application/orchestrators/settings-display-mode.orchestrator.test.ts tests/unit/renderer/application/orchestrators/display-mode.orchestrator.test.ts
git mv tests/unit/renderer/application/orchestrators/settings-preferences.orchestrator.test.ts tests/unit/renderer/application/orchestrators/preferences.orchestrator.test.ts
git mv tests/unit/renderer/application/orchestrators/animation-performance.orchestrator.test.ts tests/unit/renderer/application/orchestrators/performance-animation.orchestrator.test.ts
git mv tests/unit/renderer/infrastructure/services/animation-performance.service.test.ts tests/unit/renderer/infrastructure/services/performance-animation.service.test.ts
git mv tests/unit/renderer/infrastructure/services/stream-health.service.test.ts tests/unit/renderer/infrastructure/services/health.service.test.ts
```

- [ ] **Step 2:** Validate

Run: `npx vitest run tests/unit/renderer/application/orchestrators tests/unit/renderer/infrastructure/services`
Expected: PASS with the same test counts (pure renames).

- [ ] **Step 3:** Commit

```bash
git add -A
git commit -m "test: rename drifted test files to match their subjects"
```

### Task 16: P2 exit — gates, sweep, metrics

- [ ] **Step 1:** Full gate ladder

```bash
npm run test:run && npm run typecheck && npm run lint && npm run dev:smoke && npm run build:vite && npm run check:gpu-boundaries
```
Expected: ALL pass.

- [ ] **Step 2:** Canonical-form sweep (each must return nothing):

```bash
grep -rn "ILoggerFactory\|ILogger\b\|PresentationPrimitiveLogger\|getThrownMessage\|APP_CSS_CLASSES\|constants.config\|require('electron')" src packages tests | grep -v electron-app.utils
grep -rn "interface StorageServiceLike\|type LoggerFactoryLike = \|interface EventBus {\|type EventTargetLike = " src packages | grep -v "service.base.ts\|disposable-bag.ts"
```

- [ ] **Step 3:** Record P2 exit metrics in `docs/northstar/PHASE_LOG.md` (new section "P2 — Exit metrics": test files/tests, prod/test LOC via the P0 commands, deltas vs P1, plus the five deviation notes from this plan's header).

```bash
git add docs/northstar/PHASE_LOG.md
git commit -m "docs(northstar): record P2 exit metrics"
```

- [ ] **Step 4:** **STOP — checkpoint.** No tag (the orchestrator tags `northstar-p2` after independent verification), no merge, no push, no P3.
