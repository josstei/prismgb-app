# Package Extraction Design

**Date:** 2026-02-11
**Branch:** TBD (from `codex/gpu-package-consolidation-v2`)
**Goal:** Extract reusable domains from the application into `@prismgb/*` packages, eliminating `shared/` entirely.

## Overview

The `shared/` directory currently contains 32 runtime modules (37 files including `.d.ts` sidecars). Only 10 are genuinely cross-process; the remaining 22 are single-process consumers misplaced in `shared/`. Rather than cleaning up `shared/` directly, we extract the genuinely reusable domains into standalone packages. The remaining application code naturally returns to its owning process, and `shared/` is deleted.

## Package Architecture

### New Packages

| Package | Purpose | Dependencies | Runtime Deps |
|---------|---------|--------------|-------------|
| `@prismgb/core` | Base classes, lifecycle, type contracts | None | None |
| `@prismgb/di` | ServiceContainer (DI framework) | None | None |
| `@prismgb/ipc` | IPC channel definitions + payload contracts | None | None |
| `@prismgb/devices` | Device registry, profiles, detection | `@prismgb/core`, `@prismgb/ipc` | None |
| `@prismgb/stream-source` | Stream acquisition pipeline | `@prismgb/core`, `@prismgb/devices` | None |

### Dependency Graph

```
@prismgb/di           (standalone)
@prismgb/ipc          (standalone)
@prismgb/core         (standalone)
   ^       ^
   |       |
@prismgb/devices      (depends on core + ipc)
        ^
        |
@prismgb/stream-source (depends on core + devices)

@prismgb/gpu         (standalone, existing, unchanged)
```

### Design Decisions

- **Inter-package dependencies allowed:** `@prismgb/core` is the foundation. `devices` and `stream-source` declare it as a dependency. `devices` also depends on `@prismgb/ipc` for shared payload type contracts. Keeps types DRY.
- **Package-first strategy:** Extract reusable packages first; cleanup falls out naturally as `shared/` empties.
- **Test utils deferred:** Packages use minimal inline mocks for now. A `@prismgb/test-utils` package can be revisited once package boundaries are stable.

### Package Template

All packages follow the pattern established by `@prismgb/gpu`:

- ESM-only (`"type": "module"`)
- Vite library mode build + TypeScript declaration emission
- Source-level alias in `vite.config.js` and `vitest.config.js` (no pre-build needed for dev)
- Zero runtime dependencies (except inter-package deps)
- Barrel `index.ts` as the sole public API
- Own `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`

---

## Package Details

### 1. `@prismgb/core` — Service Framework Foundation

**Extracted from:** `shared/base/`, `shared/interfaces/lifecycle.interface.ts`, `shared/interfaces/infrastructure.types.ts`

**Structure:**

```
packages/prismgb-core/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── base/
    │   ├── service.base.ts
    │   ├── lifecycle-service.base.ts
    │   ├── orchestrator.base.ts
    │   └── validate-deps.ts
    └── interfaces/
        ├── lifecycle.interface.ts
        └── infrastructure.types.ts
```

**Public API:**

```typescript
export { BaseService } from './base/service.base';
export { LifecycleService } from './base/lifecycle-service.base';
export { BaseOrchestrator } from './base/orchestrator.base';
export type { ILifecycle, IEventSubscriber } from './interfaces/lifecycle.interface';
export type { LoggerLike, LoggerFactoryLike, EventBusLike } from './interfaces/infrastructure.types';
```

**Migration:** ~45 import updates across main + renderer. `dom-listener.utils.js` is excluded (renderer-only, DOM-dependent) and relocates to `renderer/presentation/primitives/`.

**Consumers:** 35+ files across both processes.

---

### 2. `@prismgb/di` — Dependency Injection Container

**Extracted from:** `renderer/infrastructure/di/service-container.factory.ts`

**Structure:**

```
packages/prismgb-di/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── index.ts
    └── service-container.ts
```

**Public API:**

```typescript
export { ServiceContainer, asValue } from './service-container';
export type { ValueRegistration } from './service-container';
```

**Why separate from `@prismgb/core`:** The DI container defines *how services are wired* (container, resolution, registration). Core defines *what services are* (base classes, lifecycle contracts). A project could use the base classes with a different DI framework (like the main process already does with Awilix).

**Migration:** 1 import change in `renderer/application/container.ts`. The `renderer/infrastructure/di/` directory is deleted.

---

### 3. `@prismgb/ipc` — IPC Channel Contracts

**Extracted from:** `shared/ipc/`

**Structure:**

```
packages/prismgb-ipc/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── channels.json
    ├── channels.ts
    └── preload-api.contract.ts
```

**Public API:**

```typescript
export { channels } from './channels';
export type {
  DeviceStatusPayload,
  TranscodeStartPayload,
  TranscodeProgressPayload,
  UpdateStatusPayload,
  // ... all payload/response types
} from './preload-api.contract';
```

**Build note:** `channels.config.js` currently uses a Vite `?raw` import to parse the JSON. Inside the package, this is simplified to a standard JSON import with `resolveJsonModule: true` in tsconfig.

**Migration:** ~14 import updates across main, preload, and renderer.

---

### 4. `@prismgb/devices` — Device Registry & Profiles

**Extracted from:** `shared/features/devices/`, `shared/interfaces/device-*`, `shared/interfaces/fallback-strategy*`, `shared/utils/formatters.utils.js`

**Structure:**

```
packages/prismgb-devices/
├── package.json          # depends on @prismgb/core, @prismgb/ipc
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── registry/
    │   ├── device.registry.ts
    │   └── device-profile.base.ts
    ├── detection/
    │   ├── device-detection.ts
    │   └── device-iterator.ts
    ├── profiles/
    │   └── chromatic/
    │       ├── device-chromatic.config.ts
    │       └── device-chromatic.profile.ts
    ├── interfaces/
    │   ├── device-adapter.interface.ts
    │   ├── device-status-provider.interface.ts
    │   └── fallback-strategy.interface.ts
    └── utils/
        └── formatters.ts
```

**Public API:**

```typescript
export { DeviceRegistry } from './registry/device.registry';
export { DeviceProfile } from './registry/device-profile.base';
export { DeviceDetectionHelper } from './detection/device-detection';
export { forEachDeviceWithModule } from './detection/device-iterator';
export { DeviceChromaticProfile } from './profiles/chromatic/device-chromatic.profile';
export { chromaticConfig, mediaConfig, chromaticHelpers } from './profiles/chromatic/device-chromatic.config';
export type { IDeviceAdapter } from './interfaces/device-adapter.interface';
export type { IDeviceStatusProvider } from './interfaces/device-status-provider.interface';
export type { IFallbackStrategy, FallbackConfig } from './interfaces/fallback-strategy.interface';
export { formatDeviceInfo } from './utils/formatters';
```

**Migration:** ~10 import updates across main + renderer.

---

### 5. `@prismgb/stream-source` — Stream Acquisition Pipeline

**Extracted from:** `renderer/infrastructure/streaming/acquisition/`

**Structure:**

```
packages/prismgb-stream-source/
├── package.json          # depends on @prismgb/core, @prismgb/devices
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts
└── src/
    ├── index.ts
    ├── domain/
    │   ├── acquisition-context.ts
    │   ├── acquisition.types.ts
    │   └── acquisition.interface.ts
    ├── application/
    │   └── acquisition.orchestrator.ts
    └── infrastructure/
        ├── constraint-builder.ts
        ├── fallback-strategy.ts
        └── stream-lifecycle.base.ts
```

**Public API:**

```typescript
export { AcquisitionContext } from './domain/acquisition-context';
export type { AcquisitionContextLike, AcquisitionOptions } from './domain/acquisition.types';
export { IStreamLifecycle, IConstraintBuilder } from './domain/acquisition.interface';
export { StreamAcquisitionOrchestrator } from './application/acquisition.orchestrator';
export { ConstraintBuilder } from './infrastructure/constraint-builder';
export { DeviceAwareFallbackStrategy } from './infrastructure/fallback-strategy';
export { BaseStreamLifecycle } from './infrastructure/stream-lifecycle.base';
```

**Browser API note:** Depends on `navigator.mediaDevices.getUserMedia`, `MediaStream`, `MediaStreamConstraints`. The package's `tsconfig.json` includes `"lib": ["DOM"]`.

**Migration:** ~5 import updates in renderer. The `renderer/infrastructure/streaming/acquisition/` directory is deleted.

---

## Application Code Relocation

After package extractions, remaining `shared/` modules are application code that returns to its owning process.

### Renderer-bound (10 modules)

| From | To |
|------|----|
| `shared/base/dom-listener.utils.js` | `renderer/presentation/primitives/dom-listener.utils.ts` |
| `shared/config/timing.config.ts` | `renderer/infrastructure/config/timing.config.ts` |
| `shared/config/storage-keys.config.ts` | `renderer/infrastructure/config/storage-keys.config.ts` |
| `shared/config/update-state.config.ts` | `renderer/infrastructure/config/update-state.config.ts` |
| `shared/events/event-channels.ts` | `renderer/infrastructure/events/event-channels.ts` |
| `shared/lib/errors.utils.js` | `renderer/infrastructure/lib/errors.utils.ts` |
| `shared/lib/file-download.utils.ts` | `renderer/presentation/lib/file-download.utils.ts` |
| `shared/lib/filename-generator.utils.ts` | `renderer/presentation/lib/filename-generator.utils.ts` |
| `shared/utils/performance-cache.utils.js` | `renderer/infrastructure/utils/performance-cache.utils.ts` |
| `shared/utils/string.utils.js` | `renderer/presentation/lib/string.utils.ts` |

### Main-bound (3 modules)

| From | To |
|------|----|
| `shared/config/config-loader.utils.js` | `main/infrastructure/config/config-loader.utils.ts` |
| `shared/features/transcode/transcode.config.js` | `main/infrastructure/transcode/config/transcode.config.ts` |
| `shared/utils/safe-disposer.utils.js` | `main/infrastructure/utils/safe-disposer.utils.ts` |

---

## Final Directory Structure

### Packages

```
packages/
├── prismgb-core/
│   └── src/
│       ├── index.ts
│       ├── base/
│       │   ├── service.base.ts
│       │   ├── lifecycle-service.base.ts
│       │   ├── orchestrator.base.ts
│       │   └── validate-deps.ts
│       └── interfaces/
│           ├── lifecycle.interface.ts
│           └── infrastructure.types.ts
├── prismgb-di/
│   └── src/
│       ├── index.ts
│       └── service-container.ts
├── prismgb-ipc/
│   └── src/
│       ├── index.ts
│       ├── channels.json
│       ├── channels.ts
│       └── preload-api.contract.ts
├── prismgb-devices/
│   └── src/
│       ├── index.ts
│       ├── registry/
│       ├── detection/
│       ├── profiles/chromatic/
│       ├── interfaces/
│       └── utils/
├── prismgb-stream-source/
│   └── src/
│       ├── index.ts
│       ├── domain/
│       ├── application/
│       └── infrastructure/
└── prismgb-gpu/                  # existing, unchanged
```

### Application

```
src/
├── main/
│   ├── application/
│   ├── infrastructure/
│   │   ├── config/               # config-loader from shared/
│   │   ├── devices/
│   │   ├── events/
│   │   ├── logging/
│   │   ├── platform/
│   │   ├── transcode/
│   │   │   └── config/           # transcode.config from shared/
│   │   ├── tray/
│   │   ├── updates/
│   │   ├── utils/                # safe-disposer from shared/
│   │   └── window/
│   ├── ipc/
│   └── index.ts
├── preload/
│   └── index.js
└── renderer/
    ├── application/
    │   ├── di/                   # registration modules only (no container impl)
    │   ├── orchestrators/
    │   ├── state/
    │   └── container.ts
    ├── infrastructure/
    │   ├── adapters/
    │   ├── browser/
    │   ├── config/               # timing, storage-keys, update-state from shared/
    │   ├── events/               # event-channels now canonical here
    │   ├── factories/
    │   ├── lib/                  # errors from shared/
    │   ├── logging/
    │   ├── rendering/
    │   ├── services/
    │   │   └── streaming/        # no more acquisition/ subdirectory
    │   └── utils/                # performance-cache from shared/
    ├── presentation/
    │   ├── lib/                  # file-download, filename-generator, string from shared/
    │   ├── primitives/           # dom-listener from shared/
    │   └── ...
    ├── assets/
    ├── index.ts
    └── renderer-app.orchestrator.ts
```

**Eliminated:** `src/shared/`, `@shared/` alias, `renderer/infrastructure/di/`, `renderer/infrastructure/streaming/acquisition/`

### Import Sources by Process

| Process | Package Imports |
|---------|----------------|
| Main | `@prismgb/core`, `@prismgb/ipc`, `@prismgb/devices` |
| Preload | `@prismgb/ipc` |
| Renderer | `@prismgb/core`, `@prismgb/di`, `@prismgb/ipc`, `@prismgb/devices`, `@prismgb/stream-source`, `@prismgb/gpu` |

---

## Execution Strategy

### Dependency Flow

```
Stage 0 --> Stage 1 --> Stage 2 --> Stage 3 --> Stage 4 --> Stage 5
scaffold    | core |    devices    stream-     | renderer |   finalize
all 5 pkg   | di   |               source     | main     |   delete
+ aliases   | ipc  |                           | relocate |   shared/
            (parallel)                         (parallel)
```

### Stage 0: Scaffolding (sequential)

Create all 5 package directories with standard scaffolding. Add all aliases and workspace deps in one pass. No source code moves yet.

- Create `packages/prismgb-{core,di,ipc,devices,stream-source}/`
- Add `package.json`, `tsconfig.json`, `vite.config.ts`, `vitest.config.ts`, `src/index.ts` to each
- Add 5 aliases to every `vite.config.js` alias block (main, preload, root) and to `vitest.config.js`
- Add 5 workspace deps to root `package.json`
- Add `@prismgb/*` path mappings to `tsconfig.base.json` and `tsconfig.app.json`
- Run `npm install` to link workspaces
- **Commit checkpoint**

### Stage 1: Foundation Extractions (dependency-aware sequencing)

| Agent | Package | Files Moved | Imports Updated | Model | Risk |
|-------|---------|-------------|-----------------|-------|------|
| A | `@prismgb/core` | 6 from `shared/base/` + 2 from `shared/interfaces/` | ~45 across main + renderer | sonnet | HIGH |
| B | `@prismgb/di` | 1 from `renderer/infrastructure/di/` | 1 in `container.ts` | haiku | LOW |
| C | `@prismgb/ipc` | 3 from `shared/ipc/` | ~14 across main + preload + renderer | sonnet | MEDIUM |

**Execution constraints:**
- Agent A (`core`) and Agent C (`ipc`) both touch overlapping consumer files (for example `src/main/ipc/ipc-handler.registry.ts`, `src/main/infrastructure/window/window.service.ts`, `src/renderer/infrastructure/services/updates/update.service.ts`), so they must run sequentially.
- Agent B (`di`) is independent and can run in parallel with either A or C.

**Validation:** `npm run test:run && npm run lint`
**Commit checkpoint**

### Stage 2: `@prismgb/devices` (1 agent, sonnet)

- Move 9 files from `shared/features/devices/`, `shared/interfaces/device-*`, `shared/interfaces/fallback-*`, `shared/utils/formatters*`
- Wire `@prismgb/core` dependency
- Update ~10 imports

**Validation + commit checkpoint**

### Stage 3: `@prismgb/stream-source` (1 agent, sonnet)

- Move 7 files from `renderer/infrastructure/streaming/acquisition/`
- Wire `@prismgb/core` + `@prismgb/devices` dependencies
- Update ~5 imports
- Delete `acquisition/` directory

**Validation + commit checkpoint**

### Stage 4: Application Code Relocation (2 parallel agents)

| Agent | Scope | Files | Imports Updated | Model |
|-------|-------|-------|-----------------|-------|
| D | Renderer-bound | 10 files | ~35 | haiku |
| E | Main-bound | 3 files | ~7 | haiku |

**Validation + commit checkpoint**

### Stage 5: Finalization (sequential)

- Delete `shared/` directory
- Remove `@shared/` alias from all `vite.config.js` alias blocks and from `vitest.config.js`
- Remove shared-specific preload build wiring (`copy-ipc-channels` plugin) if still present
- Remove `@shared/*` path mappings / includes from `tsconfig.base.json` and `tsconfig.app.json`; verify `@prismgb/*` mappings
- Remove `@shared/` boundary rules from `eslint.config.js` and shared-layer handling from `scripts/check-layer-boundaries.js`
- Final validation: package builds + package typechecks + app `npm run typecheck` + `npm run test:run` + `npm run lint`
- **Final commit**

### Summary

| Stage | Agents | Parallelism | Commit |
|-------|--------|-------------|--------|
| 0 - Scaffold | 1 | Sequential | Yes |
| 1 - core, di, ipc | 3 | `core -> ipc` sequential; `di` parallel-safe | Yes |
| 2 - devices | 1 | Sequential | Yes |
| 3 - stream-source | 1 | Sequential | Yes |
| 4 - relocate | 2 | Parallel | Yes |
| 5 - finalize | 1 | Sequential | Yes |

**Total: 6 stages, 6 validation checkpoints, 6 commits.**
