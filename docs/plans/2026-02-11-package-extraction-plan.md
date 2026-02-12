# Package Extraction Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Extract 5 new `@prismgb/*` packages from `shared/` and renderer infrastructure, eliminating the `shared/` directory entirely.

**Architecture:** Package-first extraction following the `@prismgb/gpu` template. Packages are ESM-only with Vite library builds, source-level aliases for dev, and barrel `index.ts` public APIs. Inter-package dependencies allowed (`@prismgb/core` as foundation).

**Tech Stack:** TypeScript, Vite 7.x, Vitest 4.x, npm workspaces

**Worktree:** Current working tree on branch `codex/gpu-package-consolidation-v2` (do not use a separate worktree for this plan)

**Design doc:** `docs/plans/2026-02-11-package-extraction-design.md`

---

## Stage 0: Scaffolding

### Task 0.1: Add package aliases to vite.config.js and vitest.config.js

**Files:**
- Modify: `vite.config.js` (three alias blocks: main, preload, root resolve)
- Modify: `vitest.config.js` (root alias block)

**Step 1: Add 5 new aliases to root `resolve.alias` in `vite.config.js`**

In `vite.config.js`, find the root `resolve.alias` block and add:

```javascript
'@prismgb/core': path.resolve(__dirname, 'packages/prismgb-core/src/index.ts'),
'@prismgb/di': path.resolve(__dirname, 'packages/prismgb-di/src/index.ts'),
'@prismgb/ipc': path.resolve(__dirname, 'packages/prismgb-ipc/src/index.ts'),
'@prismgb/devices': path.resolve(__dirname, 'packages/prismgb-devices/src/index.ts'),
'@prismgb/stream-source': path.resolve(__dirname, 'packages/prismgb-stream-source/src/index.ts'),
```

Place them after the `@prismgb/gpu` line and before the `url` line.

**Step 2: Add the same 5 aliases to the two nested alias blocks in `vite.config.js`**

`vite.config.js` has separate alias maps for:
- main process plugin (`electron[...] -> vite.resolve.alias`)
- preload plugin (`electron[...] -> vite.resolve.alias`)

Add the same package aliases to both maps so main/preload builds resolve package imports.

**Step 3: Add the same 5 aliases to `vitest.config.js`**

In `vitest.config.js`, find the resolve.alias block (~line 15) and add the same 5 aliases after `@prismgb/gpu`.

**Step 4: Verify no syntax errors**

Run:
- `node -e "import('./vite.config.js').catch((e) => { console.error(e); process.exit(1); })"`
- `node -e "import('./vitest.config.js').catch((e) => { console.error(e); process.exit(1); })"`

Both should succeed.

---

### Task 0.2: Add workspace dependencies and TypeScript path mappings

**Files:**
- Modify: `package.json` (dependencies section, ~line 57)
- Modify: `tsconfig.base.json` (paths)
- Modify: `tsconfig.app.json` (paths + include)

**Step 1: Add 5 new workspace dependencies**

In the `"dependencies"` block, add after `"@prismgb/gpu": "*"`:

```json
"@prismgb/core": "*",
"@prismgb/di": "*",
"@prismgb/ipc": "*",
"@prismgb/devices": "*",
"@prismgb/stream-source": "*",
```

**Step 2: Add package path mappings to `tsconfig.base.json`**

Add `@prismgb/{core,di,ipc,devices,stream-source}` and wildcard mappings to package `src/` directories (same pattern already used for `@prismgb/gpu`).

**Step 3: Add package path mappings to `tsconfig.app.json`**

Add `@prismgb/{core,di,ipc,devices,stream-source}` and wildcard mappings to package `dist/` directories (same pattern already used for `@prismgb/gpu`) so app strict typecheck resolves emitted declarations.

---

### Task 0.3: Create @prismgb/core package scaffolding

**Files:**
- Create: `packages/prismgb-core/package.json`
- Create: `packages/prismgb-core/tsconfig.json`
- Create: `packages/prismgb-core/vite.config.ts`
- Create: `packages/prismgb-core/vitest.config.ts`
- Create: `packages/prismgb-core/src/index.ts` (empty placeholder)

**Step 1: Create package.json**

```json
{
  "name": "@prismgb/core",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build && tsc --emitDeclarationOnly",
    "test": "vitest",
    "test:run": "vitest run",
    "typecheck": "tsc --noEmit",
    "lint": "eslint src/"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "vite": "^7.0.0",
    "vitest": "^4.0.0",
    "happy-dom": "^20.6.0"
  }
}
```

**Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "rootDir": "src",
    "outDir": "dist",
    "declaration": true,
    "declarationDir": "dist",
    "baseUrl": ".",
    "paths": {
      "@/*": ["src/*"]
    }
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

**Step 3: Create vite.config.ts**

```typescript
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PrismGBCore',
      fileName: 'index',
      formats: ['es']
    },
    rollupOptions: {
      external: [],
      output: {
        preserveModules: false
      }
    },
    sourcemap: true,
    minify: false
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
```

**Step 4: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.interface.ts',
        'src/**/*.types.ts'
      ]
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src')
    }
  }
});
```

**Step 5: Create src/index.ts (empty placeholder)**

```typescript
// @prismgb/core - Service framework foundation
// Populated in Stage 1
```

---

### Task 0.4: Create @prismgb/di package scaffolding

**Files:**
- Create: `packages/prismgb-di/package.json`
- Create: `packages/prismgb-di/tsconfig.json`
- Create: `packages/prismgb-di/vite.config.ts`
- Create: `packages/prismgb-di/vitest.config.ts`
- Create: `packages/prismgb-di/src/index.ts` (empty placeholder)

Same pattern as Task 0.3, with these differences:

**package.json** `name`: `"@prismgb/di"`

**vite.config.ts** `name`: `'PrismGBDI'`

**src/index.ts placeholder:**

```typescript
// @prismgb/di - Dependency injection container
// Populated in Stage 1
```

---

### Task 0.5: Create @prismgb/ipc package scaffolding

**Files:**
- Create: `packages/prismgb-ipc/package.json`
- Create: `packages/prismgb-ipc/tsconfig.json`
- Create: `packages/prismgb-ipc/vite.config.ts`
- Create: `packages/prismgb-ipc/vitest.config.ts`
- Create: `packages/prismgb-ipc/src/index.ts` (empty placeholder)

Same pattern as Task 0.3, with these differences:

**package.json** `name`: `"@prismgb/ipc"`

**tsconfig.json** add `"resolveJsonModule": true` to compilerOptions (for channels.json import).

**vite.config.ts** `name`: `'PrismGBIPC'`

**src/index.ts placeholder:**

```typescript
// @prismgb/ipc - IPC channel contracts
// Populated in Stage 1
```

---

### Task 0.6: Create @prismgb/devices package scaffolding

**Files:**
- Create: `packages/prismgb-devices/package.json`
- Create: `packages/prismgb-devices/tsconfig.json`
- Create: `packages/prismgb-devices/vite.config.ts`
- Create: `packages/prismgb-devices/vitest.config.ts`
- Create: `packages/prismgb-devices/src/index.ts` (empty placeholder)

Same pattern as Task 0.3, with these differences:

**package.json**:
- `name`: `"@prismgb/devices"`
- Add to dependencies: `"@prismgb/core": "*"`, `"@prismgb/ipc": "*"`

**vite.config.ts**:
- `name`: `'PrismGBDevices'`
- Add `@prismgb/core` and `@prismgb/ipc` to rollupOptions.external: `external: ['@prismgb/core', '@prismgb/ipc']`

**src/index.ts placeholder:**

```typescript
// @prismgb/devices - Device registry, profiles, and detection
// Populated in Stage 2
```

---

### Task 0.7: Create @prismgb/stream-source package scaffolding

**Files:**
- Create: `packages/prismgb-stream-source/package.json`
- Create: `packages/prismgb-stream-source/tsconfig.json`
- Create: `packages/prismgb-stream-source/vite.config.ts`
- Create: `packages/prismgb-stream-source/vitest.config.ts`
- Create: `packages/prismgb-stream-source/src/index.ts` (empty placeholder)

Same pattern as Task 0.3, with these differences:

**package.json**:
- `name`: `"@prismgb/stream-source"`
- Add to dependencies: `"@prismgb/core": "*"`, `"@prismgb/devices": "*"`

**tsconfig.json** add `"lib": ["ES2022", "DOM"]` to compilerOptions (for WebRTC types).

**vite.config.ts**:
- `name`: `'PrismGBStreamSource'`
- Add to rollupOptions.external: `external: ['@prismgb/core', '@prismgb/devices']`

**src/index.ts placeholder:**

```typescript
// @prismgb/stream-source - Stream acquisition pipeline
// Populated in Stage 3
```

---

### Task 0.8: Install and verify scaffolding

**Step 1: Run npm install to link workspaces**

Run: `npm install`

**Step 2: Build all new package shells once to generate declaration outputs**

Run:
`npm run build --workspace=@prismgb/core --workspace=@prismgb/di --workspace=@prismgb/ipc --workspace=@prismgb/devices --workspace=@prismgb/stream-source`

**Step 3: Verify all packages are linked**

Run: `npm ls @prismgb/core @prismgb/di @prismgb/ipc @prismgb/devices @prismgb/stream-source`

Expected: All 5 packages listed as linked workspace dependencies.

**Step 4: Commit checkpoint**

```bash
git add -A
git commit -m "chore: scaffold 5 new @prismgb/* packages

Create package scaffolding for @prismgb/core, @prismgb/di,
@prismgb/ipc, @prismgb/devices, @prismgb/stream-source.
Add aliases to vite.config.js and vitest.config.js.
Add workspace dependencies to root package.json."
```

---

## Stage 1: Foundation Package Extractions (overlap-aware sequencing)

Stage 1 extracts 3 packages with dependency-aware sequencing:
- `Task 1.1` (`@prismgb/core`) and `Task 1.3` (`@prismgb/ipc`) must run sequentially because they update overlapping consumer files.
- `Task 1.2` (`@prismgb/di`) is independent and can run in parallel with either `1.1` or `1.3`.

### Task 1.1: Extract @prismgb/core

**Files to move (source → destination):**
- `src/shared/base/validate-deps.utils.js` → `packages/prismgb-core/src/base/validate-deps.ts`
- `src/shared/base/service.base.js` → `packages/prismgb-core/src/base/service.base.ts`
- `src/shared/base/service.base.d.ts` → (delete after merging into .ts)
- `src/shared/base/lifecycle-service.base.ts` → `packages/prismgb-core/src/base/lifecycle-service.base.ts`
- `src/shared/base/orchestrator.base.js` → `packages/prismgb-core/src/base/orchestrator.base.ts`
- `src/shared/base/orchestrator.base.d.ts` → (delete after merging into .ts)
- `src/shared/interfaces/lifecycle.interface.ts` → `packages/prismgb-core/src/interfaces/lifecycle.interface.ts`
- `src/shared/interfaces/infrastructure.types.ts` → `packages/prismgb-core/src/interfaces/infrastructure.types.ts`

**Files to modify (update imports from `@shared/base/*` and `@shared/interfaces/{lifecycle,infrastructure}` → `@prismgb/core`):**

Replace `import { BaseService } from '@shared/base/service.base.js'` with `import { BaseService } from '@prismgb/core'` in these 30 files:
1. `src/main/infrastructure/devices/device-bridge.service.ts`
2. `src/main/infrastructure/devices/device-lifecycle.service.ts`
3. `src/main/infrastructure/devices/device.service.ts`
4. `src/main/infrastructure/updates/update.bridge.ts`
5. `src/main/infrastructure/updates/update.service.ts`
6. `src/main/infrastructure/tray/tray.service.ts`
7. `src/main/infrastructure/window/window.service.ts`
8. `src/main/infrastructure/transcode/transcode.service.ts`
9. `src/main/ipc/ipc-handler.registry.ts`
10. `src/renderer/infrastructure/services/devices/device-media.service.ts`
11. `src/renderer/infrastructure/services/devices/device-storage.service.ts`
12. `src/renderer/infrastructure/services/devices/device-operation-sequencer.service.ts`
13. `src/renderer/infrastructure/services/notes/notes.service.ts`
14. `src/renderer/infrastructure/services/settings/settings.service.ts`
15. `src/renderer/infrastructure/services/settings/presentation-mode.service.ts`
16. `src/renderer/infrastructure/services/streaming/streaming.service.ts`
17. `src/renderer/infrastructure/services/streaming/viewport.service.ts`
18. `src/renderer/infrastructure/services/streaming/render-pipeline.service.ts`
19. `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts`
20. `src/renderer/infrastructure/services/streaming/gpu-render-loop.service.ts`
21. `src/renderer/infrastructure/services/streaming/streaming-view.service.ts`
22. `src/renderer/infrastructure/services/streaming/health.service.ts`
23. `src/renderer/infrastructure/services/streaming/canvas-lifecycle.service.ts`
24. `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`
25. `src/renderer/infrastructure/services/performance/performance-animation.service.ts`
26. `src/renderer/infrastructure/services/performance/performance-metrics.service.ts`
27. `src/renderer/infrastructure/services/performance/performance-state.service.ts`
28. `src/renderer/infrastructure/services/capture/gpu-recording.service.ts`
29. `src/renderer/infrastructure/services/capture/capture-save.service.ts`
30. `src/renderer/infrastructure/services/capture/capture.service.ts`

Replace `import { LifecycleService } from '@shared/base/lifecycle-service.base'` with `import { LifecycleService } from '@prismgb/core'` in these 7 files:
1. `src/renderer/presentation/bridges/transcode-ui.bridge.ts`
2. `src/renderer/presentation/bridges/capture-ui.bridge.ts`
3. `src/renderer/presentation/bridges/ui-event.bridge.ts`
4. `src/renderer/presentation/bridges/update-ui.bridge.ts`
5. `src/renderer/infrastructure/services/transcode/transcode.service.ts`
6. `src/renderer/infrastructure/services/settings/fullscreen.service.ts`
7. `src/renderer/infrastructure/services/updates/update.service.ts`

Replace `import { BaseOrchestrator } from '@shared/base/orchestrator.base.js'` with `import { BaseOrchestrator } from '@prismgb/core'` in these 10 files:
1. `src/main/application/app.orchestrator.ts`
2. `src/renderer/application/orchestrators/preferences.orchestrator.ts`
3. `src/renderer/application/orchestrators/performance.orchestrator.ts`
4. `src/renderer/application/orchestrators/app.orchestrator.ts`
5. `src/renderer/application/orchestrators/display-mode.orchestrator.ts`
6. `src/renderer/application/orchestrators/ui-setup.orchestrator.ts`
7. `src/renderer/application/orchestrators/device.orchestrator.ts`
8. `src/renderer/application/orchestrators/streaming-audio.orchestrator.ts`
9. `src/renderer/application/orchestrators/streaming.orchestrator.ts`
10. `src/renderer/application/orchestrators/capture.orchestrator.ts`

Replace `import type { ... } from '@shared/interfaces/infrastructure.types.js'` with `import type { ... } from '@prismgb/core'` in these 12 files:
1. `src/renderer/application/state/app-state.ts` (`EventBusLike`)
2. `src/renderer/infrastructure/adapters/devices/device-base.adapter.ts` (`LoggerLike`, `EventBusLike`)
3. `src/renderer/infrastructure/factories/streaming-adapter.factory.ts` (`LoggerLike`, `LoggerFactoryLike`, `EventBusLike`)
4. `src/renderer/infrastructure/factories/streaming-renderer.factory.ts` (`LoggerLike`, `LoggerFactoryLike`, `EventBusLike`)
5. `src/renderer/infrastructure/adapters/streaming/canvas2d-renderer.adapter.ts` (`LoggerLike`)
6. `src/renderer/infrastructure/adapters/streaming/gpu-renderer.adapter.ts` (`LoggerLike`)
7. `src/renderer/infrastructure/streaming/acquisition/stream-lifecycle.base.ts` (`LoggerLike`)
8. `src/renderer/infrastructure/streaming/acquisition/acquisition.orchestrator.ts` (`LoggerLike`)
9. `src/renderer/infrastructure/streaming/acquisition/constraint-builder.ts` (`LoggerLike`)
10. `src/renderer/infrastructure/services/streaming/gpu-frame-buffer.ts` (`LoggerLike`)
11. `src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts` (`LoggerLike`, `EventBusLike`)
12. `src/renderer/infrastructure/services/streaming/canvas-renderer.ts` (`LoggerLike`)

Replace `import type { LoggerLike } from '@shared/base/service.base.js'` with `import type { LoggerLike } from '@prismgb/core'` in:
1. `src/renderer/renderer-app.orchestrator.ts`

**Write the barrel export — `packages/prismgb-core/src/index.ts`:**

```typescript
export { BaseService } from './base/service.base';
export { LifecycleService } from './base/lifecycle-service.base';
export { BaseOrchestrator } from './base/orchestrator.base';
export { validateDependencies } from './base/validate-deps';

export type { ILifecycle, IEventSubscriber } from './interfaces/lifecycle.interface';
export type { LoggerLike, LoggerFactoryLike, EventBusLike } from './interfaces/infrastructure.types';
```

**Update internal imports within the moved files:**
- `service.base.ts`: Change `import { validateDependencies } from './validate-deps.utils.js'` → `'./validate-deps'`
- `lifecycle-service.base.ts`: Change `import { BaseService } from './service.base.js'` → `'./service.base'`
- `orchestrator.base.ts`: Change `import { LifecycleService } from './lifecycle-service.base.ts'` → `'./lifecycle-service.base'`

**Preserve type contracts from `.d.ts` sidecars when converting JS → TS:**
- `service.base.ts` must carry forward:
  - `LoggerLike` interface
  - `ServiceDependencies` type alias
  - generic `BaseService<TDependencies extends ServiceDependencies = ServiceDependencies>`
  - declaration-merging behavior that exposes dependency properties on service instances
- `orchestrator.base.ts` must carry forward:
  - generic `BaseOrchestrator<TDependencies extends ServiceDependencies = ServiceDependencies>`
  - declaration-merging behavior that exposes dependency properties on orchestrator instances

**Delete originals:** Remove the 8 source files from `src/shared/base/` and `src/shared/interfaces/` that were moved. Keep `dom-listener.utils.js` in `shared/base/` (it moves later in Stage 4).

**Validation:** `npm run test:run && npm run lint`

---

### Task 1.2: Extract @prismgb/di

**Files to move:**
- `src/renderer/infrastructure/di/service-container.factory.ts` → `packages/prismgb-di/src/service-container.ts`

**Files to modify (1 file):**

Replace `import { ServiceContainer, asValue } from '@renderer/infrastructure/di/service-container.factory.js'` with `import { ServiceContainer, asValue } from '@prismgb/di'` in:
1. `src/renderer/application/container.ts`

**Write the barrel export — `packages/prismgb-di/src/index.ts`:**

```typescript
export { ServiceContainer, asValue } from './service-container';
export type { ValueRegistration } from './service-container';
```

**Delete originals:** Remove `src/renderer/infrastructure/di/service-container.factory.ts`. If the `di/` directory is now empty, delete it.

**Validation:** `npm run test:run && npm run lint`

---

### Task 1.3: Extract @prismgb/ipc

**Files to move:**
- `src/shared/ipc/channels.json` → `packages/prismgb-ipc/src/channels.json`
- `src/shared/ipc/channels.config.js` → `packages/prismgb-ipc/src/channels.ts` (rewrite to use standard JSON import)
- `src/shared/ipc/preload-api.contract.ts` → `packages/prismgb-ipc/src/preload-api.contract.ts`

**Rewrite `channels.ts`** (the old `channels.config.js` used a Vite `?raw` import — simplify to standard JSON import):

```typescript
import channelsJson from './channels.json';

export const channels = channelsJson;
```

Ensure `tsconfig.json` has `"resolveJsonModule": true` (done in Task 0.5).

**Files to modify — `@shared/ipc/channels.config` consumers (10 files):**

Replace `import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js'` with `import { channels as IPC_CHANNELS } from '@prismgb/ipc'` in:
1. `src/main/infrastructure/devices/device-bridge.service.ts`
2. `src/main/infrastructure/transcode/transcode.service.ts`
3. `src/main/infrastructure/updates/update.service.ts`
4. `src/main/ipc/handlers/transcode.handler.ts`
5. `src/main/ipc/handlers/window.handler.ts`
6. `src/main/ipc/handlers/device.handler.ts`
7. `src/main/ipc/handlers/gpu.handler.ts`
8. `src/main/ipc/handlers/performance.handler.ts`
9. `src/main/ipc/handlers/update.handler.ts`
10. `src/main/ipc/handlers/shell.handler.ts`

**Files to modify — `@shared/ipc/channels.json` direct consumers (2 files):**

Replace `import IPC_CHANNELS from '@shared/ipc/channels.json'` with `import { channels as IPC_CHANNELS } from '@prismgb/ipc'` in:
1. `src/preload/index.js` (remove import assertion if present)
2. `src/main/infrastructure/window/window.service.ts` (remove `with { type: 'json' }` assertion)

**Files to modify — preload build config cleanup (1 file):**

`vite.config.js` currently has a `copy-ipc-channels` preload plugin that copies `src/shared/ipc/channels.json` to `dist/shared/ipc`.
After moving IPC channels into `@prismgb/ipc`, remove that plugin (and remove `fs` import from `vite.config.js` if it becomes unused).

**Files to modify — `@shared/ipc/preload-api.contract` consumers (14 files):**

Replace `import type { ... } from '@shared/ipc/preload-api.contract.js'` with `import type { ... } from '@prismgb/ipc'` in:
1. `src/types/preload-api.d.ts`
2. `src/shared/interfaces/device-status-provider.interface.d.ts` (NOTE: this file moves to @prismgb/devices in Stage 2 — update for now, will move later)
3. `src/main/ipc/ipc-handler.registry.ts`
4. `src/main/ipc/handlers/transcode.handler.ts`
5. `src/main/ipc/handlers/window.handler.ts`
6. `src/main/ipc/handlers/device.handler.ts`
7. `src/main/ipc/handlers/gpu.handler.ts`
8. `src/main/ipc/handlers/performance.handler.ts`
9. `src/main/ipc/handlers/update.handler.ts`
10. `src/main/ipc/handlers/shell.handler.ts`
11. `src/renderer/infrastructure/services/transcode/transcode.service.ts`
12. `src/renderer/infrastructure/adapters/devices/device-ipc-status.adapter.ts`
13. `src/renderer/infrastructure/adapters/platform/metrics.adapter.ts`
14. `src/renderer/infrastructure/services/updates/update.service.ts`

**Write the barrel export — `packages/prismgb-ipc/src/index.ts`:**

```typescript
export { channels } from './channels';
export type {
  DeviceInfoPayload,
  DeviceStatusPayload,
  GpuPolicyPayload,
  GpuPolicyResponse,
  ProcessMetricsResponse,
  ShellOpenExternalResponse,
  TranscodeCancelledPayload,
  TranscodeCompletedPayload,
  TranscodeErrorPayload,
  TranscodeFormat,
  TranscodeJobPayload,
  TranscodeProgressPayload,
  TranscodeStartOptions,
  TranscodeStartResponse,
  TranscodeStatusResponse,
  TranscodeCancelResponse,
  UpdateCheckResponse,
  UpdateDownloadResponse,
  UpdateErrorPayload,
  UpdateGetStatusResponse,
  UpdateInfoPayload,
  UpdateInstallResponse,
  UpdateProgressPayload,
  UpdateStateValue,
  UpdateStatusPayload,
  WindowIsFullscreenResponse,
  WindowSetFullscreenResponse,
} from './preload-api.contract';
```

NOTE: Verify the exact type names by reading `preload-api.contract.ts` — export every public type.

**Delete originals:** Remove `src/shared/ipc/` directory entirely.

**Validation:** `npm run build --workspace=@prismgb/ipc && npm run typecheck --workspace=@prismgb/ipc`

---

### Task 1.4: Stage 1 validation and commit

**Step 1: Build touched packages and emit declarations**

Run: `npm run build --workspace=@prismgb/core --workspace=@prismgb/di --workspace=@prismgb/ipc`

**Step 2: Typecheck touched packages**

Run: `npm run typecheck --workspace=@prismgb/core --workspace=@prismgb/di --workspace=@prismgb/ipc`

**Step 3: Run app-level strict typecheck**

Run: `npm run typecheck`

**Step 4: Run full test suite**

Run: `npm run test:run`
Expected: all existing tests pass.

**Step 5: Run linter**

Run: `npm run lint`
Expected: No errors.

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(core): extract @prismgb/core, @prismgb/di, @prismgb/ipc packages

Extract base service framework into @prismgb/core (BaseService,
LifecycleService, BaseOrchestrator, type contracts).
Extract ServiceContainer into @prismgb/di.
Extract IPC channel definitions and payload contracts into @prismgb/ipc.

~60 import updates across main and renderer processes."
```

---

## Stage 2: Extract @prismgb/devices

### Task 2.1: Move device source files into package

**Files to move (source → destination):**
- `src/shared/features/devices/device.registry.js` → `packages/prismgb-devices/src/registry/device.registry.ts`
- `src/shared/features/devices/device-profile.base.js` → `packages/prismgb-devices/src/registry/device-profile.base.ts`
- `src/shared/features/devices/device-detection.utils.js` → `packages/prismgb-devices/src/detection/device-detection.ts`
- `src/shared/features/devices/device-iterator.utils.js` → `packages/prismgb-devices/src/detection/device-iterator.ts`
- `src/shared/features/devices/profiles/chromatic/device-chromatic.config.js` → `packages/prismgb-devices/src/profiles/chromatic/device-chromatic.config.ts`
- `src/shared/features/devices/profiles/chromatic/device-chromatic.profile.js` → `packages/prismgb-devices/src/profiles/chromatic/device-chromatic.profile.ts`
- `src/shared/interfaces/device-adapter.interface.js` + `.d.ts` → `packages/prismgb-devices/src/interfaces/device-adapter.interface.ts`
- `src/shared/interfaces/device-status-provider.interface.js` + `.d.ts` → `packages/prismgb-devices/src/interfaces/device-status-provider.interface.ts`
- `src/shared/interfaces/fallback-strategy.interface.js` + `.d.ts` → `packages/prismgb-devices/src/interfaces/fallback-strategy.interface.ts`
- `src/shared/utils/formatters.utils.js` → `packages/prismgb-devices/src/utils/formatters.ts`

**Update internal imports within moved files:**
- `device-detection.ts`: `import { DeviceRegistry }` → update relative path to `'../registry/device.registry'`
- `device-iterator.ts`: `import { DeviceRegistry }` → update relative path to `'../registry/device.registry'`
- `device-chromatic.profile.ts`: `import { DeviceProfile }` → update relative path to `'../../registry/device-profile.base'`; `import { chromaticConfig, ... }` → `'./device-chromatic.config'`
- `device-status-provider.interface.ts`: `import type { DeviceStatusPayload }` → change from `@shared/ipc/preload-api.contract.js` to `@prismgb/ipc`

**Write the barrel export — `packages/prismgb-devices/src/index.ts`:**

```typescript
export { DeviceRegistry } from './registry/device.registry';
export { DeviceProfile } from './registry/device-profile.base';

export { DeviceDetectionHelper } from './detection/device-detection';
export { forEachDeviceWithModule } from './detection/device-iterator';

export { DeviceChromaticProfile } from './profiles/chromatic/device-chromatic.profile';
export { chromaticConfig, mediaConfig, chromaticHelpers } from './profiles/chromatic/device-chromatic.config';

export { IDeviceAdapter } from './interfaces/device-adapter.interface';
export { IDeviceStatusProvider } from './interfaces/device-status-provider.interface';
export { IFallbackStrategy } from './interfaces/fallback-strategy.interface';
export type { FallbackConfig } from './interfaces/fallback-strategy.interface';

export { formatDeviceInfo } from './utils/formatters';
```

---

### Task 2.2: Update consumer imports to @prismgb/devices

**Replace `@shared/features/devices/*` imports (~12 files):**

| File | Old Import | New Import |
|------|-----------|-----------|
| `src/main/infrastructure/devices/device.service.ts` | `@shared/features/devices/device.registry.js`, `@shared/features/devices/device-iterator.utils.js`, `@shared/features/devices/device-profile.base.js` | `import { DeviceRegistry, forEachDeviceWithModule } from '@prismgb/devices'; import type { DeviceProfile } from '@prismgb/devices';` |
| `src/main/infrastructure/devices/device-profile.registry.ts` | `@shared/features/devices/device-profile.base.js` | `import type { DeviceProfile } from '@prismgb/devices';` |
| `src/main/application/container.ts` | `@shared/features/devices/profiles/chromatic/device-chromatic.profile.js` | `import { DeviceChromaticProfile } from '@prismgb/devices';` |
| `src/renderer/infrastructure/services/devices/device-storage.service.ts` | `@shared/features/devices/device.registry.js` | `import { DeviceRegistry } from '@prismgb/devices';` |
| `src/renderer/infrastructure/services/devices/device-media.service.ts` | `@shared/features/devices/device-detection.utils.js` | `import { DeviceDetectionHelper } from '@prismgb/devices';` |
| `src/renderer/infrastructure/services/streaming/streaming.service.ts` | `@shared/features/devices/device-detection.utils.js` | `import { DeviceDetectionHelper } from '@prismgb/devices';` |
| `src/renderer/infrastructure/factories/streaming-adapter.factory.ts` | `@shared/features/devices/device.registry.js`, `@shared/features/devices/device-detection.utils.js`, `@shared/features/devices/device-iterator.utils.js` | `import { DeviceRegistry, DeviceDetectionHelper, forEachDeviceWithModule } from '@prismgb/devices';` |
| `src/renderer/infrastructure/adapters/devices/chromatic/chromatic.adapter.ts` | `@shared/features/devices/profiles/chromatic/device-chromatic.config.js` | `import { chromaticConfig, chromaticHelpers, mediaConfig } from '@prismgb/devices';` |

**Replace `@shared/interfaces/device-*` and `@shared/interfaces/fallback-*` imports:**

| File | Old Import | New Import |
|------|-----------|-----------|
| `src/renderer/infrastructure/adapters/devices/device-base.adapter.ts` | `@shared/interfaces/device-adapter.interface.js` | `import { IDeviceAdapter } from '@prismgb/devices';` |
| `src/renderer/infrastructure/adapters/devices/device-ipc-status.adapter.ts` | `@shared/interfaces/device-status-provider.interface.js` | `import { IDeviceStatusProvider } from '@prismgb/devices';` |
| `src/renderer/infrastructure/streaming/acquisition/fallback-strategy.ts` | `@shared/interfaces/fallback-strategy.interface.js` | `import { IFallbackStrategy } from '@prismgb/devices'; import type { FallbackConfig } from '@prismgb/devices';` |

**Replace `@shared/utils/formatters.utils` imports:**

| File | Old Import | New Import |
|------|-----------|-----------|
| `src/main/infrastructure/devices/device-profile.registry.ts` | `@shared/utils/formatters.utils.js` | `import { formatDeviceInfo } from '@prismgb/devices';` |
| `src/main/infrastructure/devices/device.service.ts` | `@shared/utils/formatters.utils.js` | `import { formatDeviceInfo } from '@prismgb/devices';` |

**Delete originals:** Remove `src/shared/features/devices/` directory entirely. Remove `src/shared/interfaces/device-adapter.interface.*`, `src/shared/interfaces/device-status-provider.interface.*`, `src/shared/interfaces/fallback-strategy.interface.*`. Remove `src/shared/utils/formatters.utils.js`.

---

### Task 2.3: Stage 2 validation and commit

**Step 1:** Run: `npm run build --workspace=@prismgb/devices`
**Step 2:** Run: `npm run typecheck --workspace=@prismgb/devices`
**Step 3:** Run: `npm run typecheck`
**Step 4:** Run: `npm run test:run` — Expected: all existing tests pass.
**Step 5:** Run: `npm run lint` — Expected: No errors.
**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(devices): extract @prismgb/devices package

Extract device registry, profiles, detection utilities, device
interfaces, and formatters into @prismgb/devices. Depends on
@prismgb/core and @prismgb/ipc for type contracts."
```

---

## Stage 3: Extract @prismgb/stream-source

### Task 3.1: Move acquisition source files into package

**Files to move:**
- `src/renderer/infrastructure/streaming/acquisition/acquisition-context.ts` → `packages/prismgb-stream-source/src/domain/acquisition-context.ts`
- `src/renderer/infrastructure/streaming/acquisition/acquisition.types.ts` → `packages/prismgb-stream-source/src/domain/acquisition.types.ts`
- `src/renderer/infrastructure/streaming/acquisition/acquisition.interface.ts` → `packages/prismgb-stream-source/src/domain/acquisition.interface.ts`
- `src/renderer/infrastructure/streaming/acquisition/constraint-builder.ts` → `packages/prismgb-stream-source/src/infrastructure/constraint-builder.ts`
- `src/renderer/infrastructure/streaming/acquisition/fallback-strategy.ts` → `packages/prismgb-stream-source/src/infrastructure/fallback-strategy.ts`
- `src/renderer/infrastructure/streaming/acquisition/stream-lifecycle.base.ts` → `packages/prismgb-stream-source/src/infrastructure/stream-lifecycle.base.ts`
- `src/renderer/infrastructure/streaming/acquisition/acquisition.orchestrator.ts` → `packages/prismgb-stream-source/src/application/acquisition.orchestrator.ts`

**Update internal imports within moved files:**
- All internal `./` references update to new relative paths within package structure
- `fallback-strategy.ts`: Change `@shared/interfaces/fallback-strategy.interface.js` → `@prismgb/devices` (for `IFallbackStrategy`, `FallbackConfig`)
- `stream-lifecycle.base.ts`: Change `@shared/interfaces/infrastructure.types.js` → `@prismgb/core` (for `LoggerLike`)
- `acquisition.orchestrator.ts`: Change `@shared/interfaces/infrastructure.types.js` → `@prismgb/core`; change `@shared/lib/errors.utils.js` → inline the `formatErrorLabel` function (1 consumer, ~5 lines)
- `constraint-builder.ts`: Change `@shared/interfaces/infrastructure.types.js` → `@prismgb/core`

**Write the barrel export — `packages/prismgb-stream-source/src/index.ts`:**

```typescript
export { AcquisitionContext } from './domain/acquisition-context';
export type { AcquisitionContextLike, AcquisitionOptions } from './domain/acquisition.types';
export { IStreamLifecycle, IConstraintBuilder } from './domain/acquisition.interface';

export { StreamAcquisitionOrchestrator } from './application/acquisition.orchestrator';

export { ConstraintBuilder } from './infrastructure/constraint-builder';
export { DeviceAwareFallbackStrategy } from './infrastructure/fallback-strategy';
export { BaseStreamLifecycle } from './infrastructure/stream-lifecycle.base';
```

---

### Task 3.2: Update consumer imports to @prismgb/stream-source

**Replace `@renderer/infrastructure/streaming/acquisition/*` imports (3 files, 6 import lines):**

| File | Old Imports | New Imports |
|------|-----------|-----------|
| `src/renderer/infrastructure/factories/streaming-adapter.factory.ts` | `@renderer/infrastructure/streaming/acquisition/constraint-builder`, `@renderer/infrastructure/streaming/acquisition/stream-lifecycle.base` | `import { ConstraintBuilder, BaseStreamLifecycle } from '@prismgb/stream-source';` |
| `src/renderer/infrastructure/adapters/devices/device-base.adapter.ts` | `@renderer/infrastructure/streaming/acquisition/acquisition-context` | `import { AcquisitionContext } from '@prismgb/stream-source';` |
| `src/renderer/infrastructure/adapters/devices/chromatic/chromatic.adapter.ts` | `@renderer/infrastructure/streaming/acquisition/acquisition.orchestrator`, `@renderer/infrastructure/streaming/acquisition/fallback-strategy`, `@renderer/infrastructure/streaming/acquisition/acquisition-context` | `import { StreamAcquisitionOrchestrator, DeviceAwareFallbackStrategy, AcquisitionContext } from '@prismgb/stream-source';` |

**Delete originals:** Remove `src/renderer/infrastructure/streaming/acquisition/` directory entirely. If a barrel `src/renderer/infrastructure/streaming/index.ts` re-exported acquisition modules, update it.

---

### Task 3.3: Stage 3 validation and commit

**Step 1:** Run: `npm run build --workspace=@prismgb/stream-source`
**Step 2:** Run: `npm run typecheck --workspace=@prismgb/stream-source`
**Step 3:** Run: `npm run typecheck`
**Step 4:** Run: `npm run test:run` — Expected: all existing tests pass.
**Step 5:** Run: `npm run lint` — Expected: No errors.
**Step 6: Commit**

```bash
git add -A
git commit -m "refactor(streaming): extract @prismgb/stream-source package

Extract stream acquisition pipeline (context, constraints,
fallback strategy, lifecycle, orchestrator) into
@prismgb/stream-source. Depends on @prismgb/core and
@prismgb/devices."
```

---

## Stage 4: Relocate Remaining shared/ Modules

### Task 4.0: Create destination directories and keep barrel exports coherent

Create destination directories before moving files (some do not exist yet):
- `src/renderer/infrastructure/config/`
- `src/renderer/infrastructure/lib/`
- `src/renderer/infrastructure/utils/`
- `src/main/infrastructure/config/`
- `src/main/infrastructure/transcode/config/`
- `src/main/infrastructure/utils/`

If any moved module should be re-exported from an existing `index.ts` barrel, update that barrel in the same commit.

### Task 4.1: Relocate renderer-bound modules

**File moves and import updates:**

**4.1a: `dom-listener.utils.js` → `renderer/presentation/primitives/`**

Move: `src/shared/base/dom-listener.utils.js` → `src/renderer/presentation/primitives/dom-listener.utils.js`

Update 17 imports from `@shared/base/dom-listener.utils.js` → `@renderer/presentation/primitives/dom-listener.utils.js`:
1. `src/renderer/presentation/effects/auto-hide.base.ts`
2. `src/renderer/presentation/features/notes/notes-panel.component.js`
3. `src/renderer/presentation/features/notes/components/notes-list-view.component.js`
4. `src/renderer/presentation/features/notes/components/notes-editor-view.component.js`
5. `src/renderer/presentation/features/notes/components/game-filter.component.js`
6. `src/renderer/presentation/features/notes/components/notes-resize-handler.component.js`
7. `src/renderer/presentation/features/notes/components/notes-panel-layout.component.js`
8. `src/renderer/presentation/features/notes/components/notes-search.component.js`
9. `src/renderer/presentation/features/notes/components/game-autocomplete.component.js`
10. `src/renderer/presentation/primitives/disclosure.class.js`
11. `src/renderer/presentation/primitives/listbox-dropdown.class.js`
12. `src/renderer/presentation/controller/ui.controller.js`
13. `src/renderer/presentation/features/toolbar/components/shader-slider-controls.component.js`
14. `src/renderer/presentation/features/toolbar/components/cinematic-toggle.component.js`
15. `src/renderer/presentation/features/toolbar/components/shader-preset-list.component.js`
16. `src/renderer/presentation/features/settings/settings-menu.component.js`
17. `src/renderer/application/orchestrators/ui-setup.orchestrator.ts`

**4.1b: `timing.config.ts` → `renderer/infrastructure/config/`**

Move: `src/shared/config/timing.config.ts` → `src/renderer/infrastructure/config/timing.config.ts`

Update 8 imports from `@shared/config/timing.config` → `@renderer/infrastructure/config/timing.config`:
1. `src/renderer/presentation/effects/body-class.class.ts`
2. `src/renderer/presentation/effects/controls-auto-hide.effect.ts`
3. `src/renderer/presentation/effects/button-feedback.effect.ts`
4. `src/renderer/presentation/bridges/capture-ui.bridge.ts`
5. `src/renderer/presentation/primitives/hide-timer.class.js`
6. `src/renderer/infrastructure/adapters/devices/device-change-debounce.adapter.ts`
7. `src/renderer/infrastructure/services/devices/device-media.service.ts`
8. `src/renderer/infrastructure/services/streaming/viewport.service.ts`

**4.1c: `storage-keys.config.ts` → `renderer/infrastructure/config/`**

Move: `src/shared/config/storage-keys.config.ts` → `src/renderer/infrastructure/config/storage-keys.config.ts`

Update 3 imports from `@shared/config/storage-keys.config` → `@renderer/infrastructure/config/storage-keys.config`:
1. `src/renderer/application/di/register-infrastructure.ts`
2. `src/renderer/infrastructure/services/settings/settings.service.ts`
3. `src/renderer/infrastructure/services/notes/notes.service.ts`

**4.1d: `update-state.config.ts` → `renderer/infrastructure/config/`**

Move: `src/shared/config/update-state.config.ts` → `src/renderer/infrastructure/config/update-state.config.ts`

Update 2 imports from `@shared/config/update-state.config` → `@renderer/infrastructure/config/update-state.config`:
1. `src/renderer/presentation/features/updates/update-section.component.js`
2. `src/renderer/infrastructure/services/updates/update.service.ts`

**4.1e: `event-channels.ts` → `renderer/infrastructure/events/`**

Move: `src/shared/events/event-channels.ts` → `src/renderer/infrastructure/events/event-channels.ts`

Keep compatibility shim `src/renderer/infrastructure/events/event-channels.config.js`, but rewrite it to re-export from the new local canonical file (`./event-channels` or `@renderer/infrastructure/events/event-channels`) instead of `@shared`.

Update 20 imports from `@shared/events/event-channels.js` → `@renderer/infrastructure/events/event-channels`:
1. `src/renderer/presentation/features/notes/notes-panel.component.js`
2. `src/renderer/application/orchestrators/preferences.orchestrator.ts`
3. `src/renderer/application/orchestrators/performance.orchestrator.ts`
4. `src/renderer/presentation/features/updates/update-section.component.js`
5. `src/renderer/application/orchestrators/app.orchestrator.ts`
6. `src/renderer/application/orchestrators/display-mode.orchestrator.ts`
7. `src/renderer/application/orchestrators/ui-setup.orchestrator.ts`
8. `src/renderer/presentation/bridges/transcode-ui.bridge.ts`
9. `src/renderer/application/orchestrators/device.orchestrator.ts`
10. `src/renderer/presentation/bridges/ui-event.bridge.ts`
11. `src/renderer/presentation/bridges/update-ui.bridge.ts`
12. `src/renderer/application/orchestrators/streaming-audio.orchestrator.ts`
13. `src/renderer/presentation/bridges/capture-ui.bridge.ts`
14. `src/renderer/application/orchestrators/capture.orchestrator.ts`
15. `src/renderer/application/orchestrators/streaming.orchestrator.ts`
16. `src/renderer/presentation/features/toolbar/components/shader-slider-controls.component.js`
17. `src/renderer/application/state/app-state.ts`
18. `src/renderer/presentation/features/toolbar/components/cinematic-toggle.component.js`
19. `src/renderer/presentation/features/toolbar/components/shader-preset-list.component.js`
20. `src/renderer/infrastructure/events/event-bus.class.js` (was importing via re-export shim — now use direct import)

Optional cleanup: migrate `@renderer/infrastructure/events/event-channels.config.js` consumers to `@renderer/infrastructure/events/event-channels` incrementally; not required for correctness in this extraction.

**4.1f: `errors.utils.js` → `renderer/infrastructure/lib/`**

Move: `src/shared/lib/errors.utils.js` → `src/renderer/infrastructure/lib/errors.utils.ts`

Update 1 import: The only consumer was `acquisition.orchestrator.ts` which is now in `@prismgb/stream-source`. If the `formatErrorLabel` was inlined in Task 3.1, this file may have no consumers in the app. If still imported, update the import path.

**4.1g: `file-download.utils.ts` → `renderer/presentation/lib/`**

Move: `src/shared/lib/file-download.utils.ts` → `src/renderer/presentation/lib/file-download.utils.ts`

Update 2 imports from `@shared/lib/file-download.utils` → `@renderer/presentation/lib/file-download.utils`:
1. `src/renderer/infrastructure/services/capture/capture-save.service.ts`
2. `src/renderer/presentation/controller/ui.controller.js`

**4.1h: `filename-generator.utils.ts` → `renderer/presentation/lib/`**

Move: `src/shared/lib/filename-generator.utils.ts` → `src/renderer/presentation/lib/filename-generator.utils.ts`

Update 1 import from `@shared/lib/filename-generator.utils` → `@renderer/presentation/lib/filename-generator.utils`:
1. `src/renderer/infrastructure/services/capture/capture.service.ts`

**4.1i: `performance-cache.utils.js` → `renderer/infrastructure/utils/`**

Move: `src/shared/utils/performance-cache.utils.js` → `src/renderer/infrastructure/utils/performance-cache.utils.ts`

Update 2 imports from `@shared/utils/performance-cache.utils.js` → `@renderer/infrastructure/utils/performance-cache.utils`:
1. `src/renderer/application/di/renderer-container-map.type.ts`
2. `src/renderer/application/di/register-infrastructure.ts`

**4.1j: `string.utils.js` → `renderer/presentation/lib/`**

Move: `src/shared/utils/string.utils.js` → `src/renderer/presentation/lib/string.utils.ts`

Update 3 imports from `@shared/utils/string.utils.js` → `@renderer/presentation/lib/string.utils`:
1. `src/renderer/presentation/features/notes/components/notes-list-view.component.js`
2. `src/renderer/presentation/features/notes/components/game-autocomplete.component.js`
3. `src/renderer/infrastructure/services/notes/notes.service.ts`

---

### Task 4.2: Relocate main-bound modules

**4.2a: `config-loader.utils.js` → `main/infrastructure/config/`**

Move: `src/shared/config/config-loader.utils.js` → `src/main/infrastructure/config/config-loader.utils.ts`

Update 3 imports from `@shared/config/config-loader.utils.js` → `@main/infrastructure/config/config-loader.utils`:
1. `src/main/infrastructure/devices/device-lifecycle.service.ts`
2. `src/main/infrastructure/devices/device.service.ts`
3. `src/main/infrastructure/window/window.service.ts`

**4.2b: `transcode.config.js` → `main/infrastructure/transcode/config/`**

Move: `src/shared/features/transcode/transcode.config.js` → `src/main/infrastructure/transcode/config/transcode.config.ts`

Update 3 imports from `@shared/features/transcode/transcode.config.js` → `@main/infrastructure/transcode/config/transcode.config`:
1. `src/main/infrastructure/transcode/transcode-process.ts`
2. `src/main/infrastructure/transcode/transcode-temp.utils.ts`
3. `src/main/infrastructure/transcode/transcode.service.ts`

**4.2c: `safe-disposer.utils.js` → `main/infrastructure/utils/`**

Move: `src/shared/utils/safe-disposer.utils.js` → `src/main/infrastructure/utils/safe-disposer.utils.ts`

Update 1 import from `@shared/utils/safe-disposer.utils.js` → `@main/infrastructure/utils/safe-disposer.utils`:
1. `src/main/application/app.orchestrator.ts`

---

### Task 4.3: Stage 4 validation and commit

**Step 1:** Run: `npm run typecheck`
**Step 2:** Run: `npm run test:run` — Expected: all existing tests pass.
**Step 3:** Run: `npm run lint` — Expected: No errors.
**Step 4: Commit**

```bash
git add -A
git commit -m "refactor: relocate remaining shared/ modules to owning processes

Move 10 renderer-only modules to renderer/ (dom-listener,
timing, storage-keys, update-state, event-channels, errors,
file-download, filename-generator, performance-cache, string).
Move 3 main-only modules to main/ (config-loader, transcode
config, safe-disposer)."
```

---

## Stage 5: Finalization

### Task 5.1: Delete shared/ and clean up configuration/tooling

**Step 1: Remove `@shared` aliases everywhere**

- Remove `@shared` from all three alias blocks in `vite.config.js` (main plugin alias, preload plugin alias, root alias).
- Remove `@shared` from `vitest.config.js`.

**Step 2: Remove shared-specific build wiring**

- Ensure the preload `copy-ipc-channels` plugin is removed from `vite.config.js` (if not already removed in Stage 1.3).
- Remove any now-unused imports (for example `fs`) from `vite.config.js`.

**Step 3: Update TypeScript path mappings and includes**

- Remove `@shared/*` mappings from `tsconfig.base.json` and `tsconfig.app.json`.
- Verify `@prismgb/{core,di,ipc,devices,stream-source}` mappings exist in both files.
- Remove `src/shared/**/*.ts` from `tsconfig.app.json` `include`.

**Step 4: Update architecture/lint rules that hard-code shared**

- Remove the `src/shared/**/*.{js,ts}` rule block in `eslint.config.js`.
- Update `scripts/check-layer-boundaries.js` to remove `shared`-layer special handling (`LayerIds.SHARED`, layer sequence entry, forbidden-layer map entry, and `@shared/` alias resolution).
- Update boundary-script fixtures/tests accordingly so architecture tests continue to validate intended constraints.

**Step 5: Update tests, mocks, and scripts that reference shared paths**

Search and fix all remaining references for:
- `@shared/`
- `@/shared/`
- relative `src/shared/...` imports in tests/scripts

Use:
`rg -n "@shared/|@/shared/|src/shared/" src tests scripts vite.config.js vitest.config.js eslint.config.js tsconfig.base.json tsconfig.app.json package.json --glob '!tests/coverage/**'`

Key test files to check:
- `tests/unit/shared/base/service.test.js` → may need to import from `@prismgb/core`
- `tests/unit/shared/base/orchestrator.test.js` → may need to import from `@prismgb/core`
- `tests/unit/shared/base/lifecycle-service.base.test.ts` → may need to import from `@prismgb/core`
- `tests/unit/shared/base/dom-listener.test.js` → update to new renderer path
- `tests/unit/shared/events/event-channels.contract.test.ts` → update import path
- `tests/unit/shared/interfaces/interfaces.test.js` → may split between `@prismgb/core` and `@prismgb/devices`
- `tests/unit/shared/interfaces/device-adapter.interface.test.js` → import from `@prismgb/devices`
- `tests/unit/shared/ipc/channels.test.js` → import from `@prismgb/ipc`
- `tests/unit/shared/ipc/channels.contract.test.js` → import from `@prismgb/ipc`
- `tests/unit/shared/lib/errors.test.js` → update to new renderer path
- `tests/unit/renderer/infrastructure/di/service-container.test.js` → import from `@prismgb/di`
- `tests/unit/features/devices/shared/device-profile.test.js` → import from `@prismgb/devices`
- `tests/unit/features/devices/shared/device-registry.test.js` → import from `@prismgb/devices`
- `tests/unit/features/devices/shared/device-detection.test.js` → import from `@prismgb/devices`
- `tests/unit/features/devices/shared/device-iterator.test.js` → update if referencing @shared
- `tests/unit/features/streaming/acquisition/*` → update if referencing @renderer/infrastructure/streaming/acquisition
- `tests/unit/preload/preload-api.contract.test.js` → import types from `@prismgb/ipc`

Also update:
- all `vi.mock('@shared/...')` calls
- script/data references such as `scripts/type-debt-allowlist.json` entries that still point to `src/shared/*`
- comments/docs that claim canonical files live in `src/shared/*` (for example preload/e2e fixture notes)

**Step 6: Update src/types/preload-api.d.ts**

This file was updated in Task 1.3 to import from `@prismgb/ipc`. Verify it's correct.

**Step 7: Delete `src/shared/` once all references are removed**

Run: `rm -rf src/shared/`

**Step 8: Verify no shared references remain**

Run:
`rg -n "@shared/|@/shared/|src/shared/" src tests scripts vite.config.js vitest.config.js eslint.config.js tsconfig.base.json tsconfig.app.json package.json --glob '!tests/coverage/**'`

Expected: zero matches.

---

### Task 5.2: Final validation and commit

**Step 1: Build and typecheck all extracted packages**

Run:
`npm run build --workspace=@prismgb/core --workspace=@prismgb/di --workspace=@prismgb/ipc --workspace=@prismgb/devices --workspace=@prismgb/stream-source`

Run:
`npm run typecheck --workspace=@prismgb/core --workspace=@prismgb/di --workspace=@prismgb/ipc --workspace=@prismgb/devices --workspace=@prismgb/stream-source`

**Step 2: App strict typecheck**

Run: `npm run typecheck`

**Step 3: Full test suite**

Run: `npm run test:run`
Expected: all existing tests pass.

**Step 4: Lint**

Run: `npm run lint`
Expected: No errors.

**Step 5: Verify no shared references remain**

Run:
`rg -n "@shared/|@/shared/|src/shared/" src tests scripts vite.config.js vitest.config.js eslint.config.js tsconfig.base.json tsconfig.app.json package.json --glob '!tests/coverage/**'`
Expected: zero matches.

**Step 6: Commit**

```bash
git add -A
git commit -m "refactor: eliminate shared/ directory

Remove src/shared/ entirely. All cross-process contracts now
live in @prismgb/* packages. All single-process code relocated
to its owning process directory. Remove @shared/ alias from
vite, vitest, and eslint configs. Update all test imports."
```

---

## Execution Summary

| Stage | Tasks | Description | Parallelizable |
|-------|-------|-------------|----------------|
| 0 | 0.1-0.8 | Scaffolding + aliases + deps | Sequential |
| 1 | 1.1-1.4 | Extract core, di, ipc | `1.1 -> 1.3` sequential; `1.2` parallel-safe |
| 2 | 2.1-2.3 | Extract devices | Sequential |
| 3 | 3.1-3.3 | Extract stream-source | Sequential |
| 4 | 4.0-4.3 | Relocate remaining modules | `4.0` sequential setup; tasks 4.1/4.2 parallel |
| 5 | 5.1-5.2 | Delete shared/, clean config | Sequential |

**Total import updates:** ~130 across 90+ files
**Test baseline:** use the current main-branch baseline at execution time (do not hardcode counts)
**Validation checkpoints:** 6 (one per stage)
