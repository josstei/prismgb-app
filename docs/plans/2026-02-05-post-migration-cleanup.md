# Post-Migration Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix all remaining stale references, broken paths, and outdated documentation left over from the architecture migration (Phases 0-6).

**Architecture:** Pure cleanup — no behavioral changes. Fix two broken worker import paths (build blocker), update coverage exclusions in vitest config, update CLAUDE.md and feature-map.md to reflect the current directory structure, and create barrel index files for infrastructure subdirectories.

**Tech Stack:** TypeScript, Vite, Vitest, Markdown

---

## Task 1: Fix broken worker import paths

The production build fails because two service files reference the old worker location. The worker file was moved during the renderer restructure but these two `new URL(...)` references were not updated.

**Files:**
- Modify: `src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts:102`
- Modify: `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts:247`

**Step 1: Fix gpu-worker-manager.ts**

The file is at `src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts`.
The worker is at `src/renderer/infrastructure/rendering/workers/render.worker.ts`.
Relative path from the service to the worker: `../../rendering/workers/render.worker.ts`.

Change line 102 from:
```typescript
new URL('../../workers/streaming-render.worker.js', import.meta.url),
```
to:
```typescript
new URL('../../rendering/workers/render.worker.ts', import.meta.url),
```

**Step 2: Fix gpu-renderer.service.ts**

The file is at `src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts`.
Same worker target. Relative path: `../../rendering/workers/render.worker.ts`.

Change line 247 from:
```typescript
new URL('../workers/streaming-render.worker.js', import.meta.url),
```
to:
```typescript
new URL('../../rendering/workers/render.worker.ts', import.meta.url),
```

**Step 3: Verify build succeeds**

Run: `npm run build 2>&1 | tail -10`
Expected: Build succeeds with no "Could not resolve entry module" error.

**Step 4: Run tests**

Run: `npx vitest run --config vitest.config.js 2>&1 | tail -5`
Expected: 129 test files, 2836 tests passed.

**Step 5: Verify dev server**

Run: `npm run dev` (let it start, check for errors in first ~20 lines of output, then kill)
Expected: No errors. Renderer connects and initializes.

**Step 6: Commit**

```bash
git add src/renderer/infrastructure/services/streaming/gpu-worker-manager.ts src/renderer/infrastructure/services/streaming/gpu-renderer.service.ts
git commit -m "fix(renderer): update worker import paths for infrastructure restructure"
```

---

## Task 2: Update vitest.config.js coverage exclusions

Three coverage exclusion paths reference old locations that no longer exist. The exclusions still technically work (glob patterns), but they're misleading and won't match if the old directories are gone.

**Files:**
- Modify: `vitest.config.js:50,60-61`

**Step 1: Update stale paths**

In `vitest.config.js`, in the `coverage.exclude` array, make these changes:

Line 50 — change:
```javascript
'src/renderer/features/updates/**',
```
to:
```javascript
'src/renderer/infrastructure/services/updates/**',
```

Line 60 — change:
```javascript
'src/renderer/ui/templates/*.js',
```
to:
```javascript
'src/renderer/presentation/shell/*.js',
```

Line 61 — change:
```javascript
'src/renderer/ui/icons/*.js',
```
to:
```javascript
'src/renderer/presentation/icons/*.js',
```

**Step 2: Run tests with coverage**

Run: `npx vitest run --config vitest.config.js --coverage 2>&1 | tail -10`
Expected: Tests pass, coverage thresholds met (80% lines/functions/statements, 75% branches).

**Step 3: Commit**

```bash
git add vitest.config.js
git commit -m "fix(config): update vitest coverage exclusion paths for restructured directories"
```

---

## Task 3: Update CLAUDE.md source structure and tables

The `CLAUDE.md` file is the primary onboarding document. Its source structure tree and service/orchestrator tables still reference the pre-migration layout. This task updates them to match the current architecture.

**Files:**
- Modify: `CLAUDE.md:55-107` (source structure tree)
- Modify: `CLAUDE.md:114-146` (orchestrator and service location tables)
- Modify: `CLAUDE.md:163-167` (rendering pipeline section references)

**Step 1: Replace the source structure tree**

Replace `CLAUDE.md` lines 55-107 (the `src/` tree inside the "Source Structure" section) with the current structure:

```
src/
├── main/                    # Electron main process
│   ├── application/         # App orchestrator, lifecycle
│   ├── infrastructure/      # Main process infrastructure
│   │   ├── devices/         # USB device detection (usb-detection)
│   │   ├── events/          # EventBus (Node.js EventEmitter)
│   │   ├── logging/         # Winston-based logging
│   │   ├── platform/        # GPU policy, shell service
│   │   ├── transcode/       # FFmpeg transcoding
│   │   ├── tray/            # System tray service
│   │   ├── updates/         # Auto-updates (electron-updater)
│   │   └── window/          # Window management
│   ├── ipc/                 # IPC handler registry
│   │   └── handlers/        # Individual IPC handlers
│   └── index.ts             # Main entry point
├── preload/                 # Electron preload scripts
│   └── index.js             # Exposes deviceAPI, shellAPI, windowAPI, updateAPI, metricsAPI, transcodeAPI
├── renderer/                # Browser renderer process
│   ├── application/         # App orchestrator, state, container, DI wiring
│   │   ├── orchestrators/   # All renderer orchestrators
│   │   └── state/           # AppState
│   ├── infrastructure/      # Renderer infrastructure
│   │   ├── adapters/        # Device adapters, streaming adapters, platform adapters
│   │   │   ├── devices/     # Device adapters (Chromatic, IPC, debounce)
│   │   │   ├── streaming/   # StreamingAdapterFactory
│   │   │   └── platform/    # VisibilityAdapter, ReducedMotionAdapter, UserActivityAdapter
│   │   ├── browser/         # BrowserMediaAdapter, BrowserStorageAdapter
│   │   ├── di/              # ServiceContainer (custom DI)
│   │   ├── events/          # EventBus (eventemitter3)
│   │   ├── factories/       # StreamingRendererFactory
│   │   ├── logging/         # Console-based RendererLogger
│   │   ├── rendering/       # GPU rendering internals
│   │   │   ├── presets/     # Render preset configurations
│   │   │   ├── shaders/     # WebGL2 and WebGPU shaders
│   │   │   └── workers/     # Render worker (off-main-thread GPU)
│   │   ├── services/        # All renderer services (by domain)
│   │   │   ├── capture/     # Screenshot/recording services
│   │   │   ├── devices/     # Device connection, media, storage services
│   │   │   ├── notes/       # Notes CRUD service
│   │   │   ├── performance/ # Performance metrics/state services
│   │   │   ├── settings/    # Settings, fullscreen, cinematic services
│   │   │   ├── streaming/   # Streaming, audio, render pipeline services
│   │   │   ├── transcode/   # Transcode bridge service
│   │   │   └── updates/     # Update state and UI services
│   │   └── streaming/       # Stream acquisition
│   │       └── acquisition/ # AcquisitionContext, ConstraintBuilder, FallbackStrategy
│   ├── presentation/        # UI layer
│   │   ├── bridges/         # UIEventBridge, CaptureUIBridge, TranscodeUIBridge
│   │   ├── config/          # CSS classes, DOM selectors, storage keys
│   │   ├── controller/      # UIController, UIComponentRegistry
│   │   ├── effects/         # UIEffects, BodyClassManager
│   │   ├── features/        # Feature-specific UI components
│   │   │   ├── fullscreen/  # Fullscreen controls and effects
│   │   │   ├── notes/       # Notes panel components
│   │   │   ├── settings/    # Settings menu component
│   │   │   ├── streaming/   # Streaming controls
│   │   │   ├── toolbar/     # Toolbar components (shader selector, sliders)
│   │   │   ├── transcode/   # Transcode toast component
│   │   │   └── updates/     # Update section component
│   │   ├── icons/           # SVG icon utilities
│   │   ├── lib/             # Presentation utilities (brightness, filename generator)
│   │   ├── primitives/      # DOM utilities, DisclosureController, HideTimer
│   │   ├── shared/          # Shared UI components (StatusNotification, DeviceStatus)
│   │   ├── shell/           # App shell templates
│   │   └── styles/          # Global CSS styles and tokens
│   ├── assets/              # Fonts and static assets
│   ├── index.ts             # Renderer entry point
│   └── renderer-app.orchestrator.ts  # RendererAppOrchestrator
└── shared/                  # Cross-process shared code
    ├── base/                # BaseService, BaseOrchestrator
    ├── config/              # config-loader utility
    ├── features/            # Shared device profiles, transcode config
    │   ├── devices/         # DeviceRegistry, DeviceProfile, ChromaticProfile
    │   └── transcode/       # Transcode state and format config
    ├── interfaces/          # IDeviceAdapter, IDeviceStatusProvider, IFallbackStrategy
    ├── ipc/                 # IPC channel definitions (channels.json)
    ├── lib/                 # Error utilities
    └── utils/               # Utility functions (formatters, safe-disposer, etc.)
```

**Step 2: Update the orchestrator location table**

Replace the "Renderer Orchestrators" table (lines ~114-123) with:

| Orchestrator | Location | Responsibilities |
|-------------|----------|------------------|
| `AppOrchestrator` | `renderer/application/orchestrators/` | Main coordinator, initializes all other orchestrators |
| `StreamingOrchestrator` | `renderer/application/orchestrators/` | Stream lifecycle, renderer selection, viewport management |
| `StreamingAudioOrchestrator` | `renderer/application/orchestrators/` | Audio pipeline warmup and fade-in |
| `CaptureOrchestrator` | `renderer/application/orchestrators/` | Screenshot and video recording coordination |
| `DeviceOrchestrator` | `renderer/application/orchestrators/` | Device detection, status management |
| `SettingsPreferencesOrchestrator` | `renderer/application/orchestrators/` | Preferences loading and state management |
| `SettingsDisplayModeOrchestrator` | `renderer/application/orchestrators/` | Fullscreen and cinematic mode coordination |
| `UpdateOrchestrator` | `renderer/application/orchestrators/` | Auto-update coordination |
| `UISetupOrchestrator` | `renderer/application/orchestrators/` | UI component initialization |
| `PerformanceMetricsOrchestrator` | `renderer/application/orchestrators/` | Performance metrics collection |
| `PerformanceStateOrchestrator` | `renderer/application/orchestrators/` | Performance state management |
| `PerformanceAnimationOrchestrator` | `renderer/application/orchestrators/` | Animation performance management |

**Step 3: Update the services location table**

Replace the "Renderer Services" table (lines ~127-146) with:

| Service | Location | Responsibilities |
|---------|----------|------------------|
| `StreamingService` | `renderer/infrastructure/services/streaming/` | Media stream acquisition with state machine |
| `StreamingAudioPipelineService` | `renderer/infrastructure/services/streaming/` | Web Audio API pipeline with warmup and fade-in |
| `StreamingRenderPipelineService` | `renderer/infrastructure/services/streaming/` | Renderer strategy selection (GPU/Canvas2D) |
| `CaptureService` | `renderer/infrastructure/services/capture/` | Screenshot/recording via MediaRecorder |
| `CaptureSaveService` | `renderer/infrastructure/services/capture/` | Save with optional transcoding |
| `CaptureGpuRecordingService` | `renderer/infrastructure/services/capture/` | GPU-based recording pipeline |
| `DeviceService` | `renderer/infrastructure/services/devices/` | Facade for connection, storage, media services |
| `DeviceConnectionService` | `renderer/infrastructure/services/devices/` | USB connection status from main process |
| `DeviceMediaService` | `renderer/infrastructure/services/devices/` | Media device enumeration with caching |
| `DeviceStorageService` | `renderer/infrastructure/services/devices/` | Device ID persistence |
| `SettingsService` | `renderer/infrastructure/services/settings/` | LocalStorage-backed preferences |
| `SettingsFullscreenService` | `renderer/infrastructure/services/settings/` | Fullscreen event handling |
| `SettingsCinematicModeService` | `renderer/infrastructure/services/settings/` | Cinematic mode state |
| `PresentationModeService` | `renderer/infrastructure/services/settings/` | Visual state coordination |
| `TranscodeService` | `renderer/infrastructure/services/transcode/` | Renderer-side transcode bridge |
| `UpdateService` | `renderer/infrastructure/services/updates/` | Update state and IPC bridge |
| `UpdateUiService` | `renderer/infrastructure/services/updates/` | Update notifications and badge |
| `NotesService` | `renderer/infrastructure/services/notes/` | Notes CRUD with localStorage |

**Step 4: Update the main process services table**

Replace the "Main Process Services" table (lines ~150-157) with:

| Service | Location | Responsibilities |
|---------|----------|------------------|
| `DeviceService` | `main/infrastructure/devices/` | USB monitoring via usb-detection |
| `DeviceBridgeService` | `main/infrastructure/devices/` | Bridges device events to tray and renderer |
| `DeviceLifecycleService` | `main/infrastructure/devices/` | Auto-launch on device connect |
| `DeviceProfileRegistry` | `main/infrastructure/devices/` | Device profile registration |
| `UpdateService` | `main/infrastructure/updates/` | electron-updater integration |
| `UpdateBridge` | `main/infrastructure/updates/` | Update scheduling |
| `TranscodeService` | `main/infrastructure/transcode/` | FFmpeg process management |

**Step 5: Update the rendering pipeline section**

In the "Rendering Pipeline" section (~lines 163-170), update paths:

1. GPU Renderer: change `streaming/rendering/gpu/streaming-gpu-renderer.service.js` to `infrastructure/services/streaming/gpu-renderer.service.ts`
2. Shaders: change `streaming/rendering/shaders/` to `infrastructure/rendering/shaders/`
3. Render presets: change `streaming/rendering/presets/streaming-render-presets.config.js` to `infrastructure/rendering/presets/streaming-render-presets.config.js`
4. Canvas2D Renderer: change `streaming/rendering/adapters/streaming-canvas2d-renderer.adapter.js` to `infrastructure/services/streaming/canvas-renderer.ts`
5. Strategy selection: change `StreamingRendererFactory` location reference to `infrastructure/factories/`

**Step 6: Update the UI architecture section**

In the "UI Architecture" section, update the Key UI Components table paths:

| Component | Location | Purpose |
|-----------|----------|---------|
| `UIController` | `presentation/controller/` | Thin facade delegating to managers |
| `UIComponentRegistry` | `presentation/controller/` | Component lifecycle management |
| `UIEffects` | `presentation/effects/` | Visual effects coordination |
| `BodyClassManager` | `presentation/effects/` | Body CSS class management |
| `SettingsMenuComponent` | `presentation/features/settings/` | Settings panel |
| `ShaderSelectorComponent` | `presentation/features/toolbar/` | Shader preset selection |
| `NotesPanelComponent` | `presentation/features/notes/` | Notes CRUD UI |
| `StreamingControlsComponent` | `presentation/features/streaming/` | Streaming state UI |
| `TranscodeToastComponent` | `presentation/features/transcode/` | Transcode progress overlay |

Update the UI Bridges section:

| Bridge | Location | Purpose |
|--------|----------|---------|
| `UIEventBridge` | `presentation/bridges/` | General UI state updates |
| `CaptureUIBridge` | `presentation/bridges/` | Capture feedback (shutter flash, button states) |
| `TranscodeUIBridge` | `presentation/bridges/` | Transcode progress UI |

**Step 7: Run tests**

Run: `npx vitest run --config vitest.config.js 2>&1 | tail -5`
Expected: 129 test files, 2836 tests passed (no behavioral changes).

**Step 8: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md for post-migration directory structure"
```

---

## Task 4: Update docs/feature-map.md

The feature map has stale paths throughout. Update all references to match the current architecture.

**Files:**
- Modify: `docs/feature-map.md`

**Step 1: Update Feature Modules table (lines 19-30)**

Replace the table with:

| Feature | Primary directories | Notes |
| --- | --- | --- |
| Streaming and rendering | `src/renderer/infrastructure/services/streaming`, `src/renderer/infrastructure/rendering` | GPU pipeline, render presets, health checks, audio warmup |
| Capture (screenshots/recording) | `src/renderer/infrastructure/services/capture` | PNG screenshots, recordings with format selection |
| Transcode | `src/main/infrastructure/transcode`, `src/renderer/infrastructure/services/transcode`, `src/shared/features/transcode` | FFmpeg-based transcoding for MP4/MOV output |
| Devices and adapters | `src/renderer/infrastructure/services/devices`, `src/renderer/infrastructure/adapters/devices`, `src/main/infrastructure/devices`, `src/shared/features/devices` | USB detection, device registry, adapters |
| Settings and display modes | `src/renderer/infrastructure/services/settings`, `src/renderer/presentation/config/storage-keys.config.js` | Cinematic, fullscreen, performance mode, status strip |
| Notes | `src/renderer/infrastructure/services/notes`, `src/renderer/presentation/config/storage-keys.config.js` | Notes CRUD and search |
| Updates | `src/main/infrastructure/updates`, `src/renderer/infrastructure/services/updates`, `src/preload/index.js` | electron-updater + renderer UI |
| UI shell | `src/renderer/presentation`, `src/renderer/assets` | Templates, components, effects |
| App lifecycle and performance | `src/renderer/application`, `src/main/application` | Orchestrators and performance state |
| IPC and preload bridge | `src/shared/ipc`, `src/preload/index.js` | Shared channel definitions |

**Step 2: Update UI Surface Map table (lines 34-40)**

Replace the table with:

| Surface | Template | Component(s) | Orchestrator/Bridge |
| --- | --- | --- | --- |
| Header + Settings | `src/renderer/presentation/shell/header.template.js` | `SettingsMenuComponent`, `UpdateSectionComponent`, `DeviceStatusComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Stream viewer + toolbar | `src/renderer/presentation/shell/stream-viewer.template.js` | `StreamingControlsComponent`, `StreamingShaderSelectorComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Notes panel | `src/renderer/presentation/shell/notes-panel.template.js` | `NotesPanelComponent` | `UISetupOrchestrator` |
| Status footer | `src/renderer/presentation/shell/status-footer.template.js` | `StatusNotificationComponent`, `DeviceStatusComponent` | `UIEventBridge` |
| Transcode toast | `src/renderer/presentation/shell/stream-viewer.template.js` | `TranscodeToastComponent` | `TranscodeUIBridge` |

**Step 3: Update UI Flows section (line 44)**

Replace line 44 with:
```
UI input is wired in `src/renderer/application/orchestrators/ui-setup.orchestrator.ts`. UI updates are applied via `src/renderer/presentation/bridges/ui-event.bridge.js`, `src/renderer/presentation/bridges/capture-ui.bridge.js`, or `src/renderer/presentation/bridges/transcode-ui.bridge.js`.
```

**Step 4: Update Data and Storage section (lines 119-124)**

Line 122: change `src/shared/config/storage-keys.config.js` to `src/renderer/presentation/config/storage-keys.config.js`.
Line 123: change `src/renderer/features/devices/services/device-storage.service.js` to `src/renderer/infrastructure/services/devices/device-storage.service.ts`.

**Step 5: Update Extension Points section (lines 130-149)**

Line 134: change `src/shared/features/devices/device.registry.js` to `src/shared/features/devices/device.registry.js` (unchanged — still in shared).
Line 135-136: change `src/main/features/devices` to `src/main/infrastructure/devices` and `src/renderer/features/devices` to `src/renderer/infrastructure/adapters/devices`.
Line 141: change `src/renderer/features/streaming/rendering/presets/streaming-render-presets.config.js` to `src/renderer/infrastructure/rendering/presets/streaming-render-presets.config.js`.
Line 147: change `src/shared/config/storage-keys.config.js` to `src/renderer/presentation/config/storage-keys.config.js`.
Line 148: change `src/renderer/features/settings/services/settings.service.js` to `src/renderer/infrastructure/services/settings/settings.service.ts`.
Line 149: change `src/renderer/features/settings/ui` to `src/renderer/presentation/features/settings`.

**Step 6: Commit**

```bash
git add docs/feature-map.md
git commit -m "docs: update feature-map.md for post-migration directory structure"
```

---

## Task 5: Create barrel index files for infrastructure subdirectories

Create barrel `index.ts` files for each infrastructure subdirectory to provide clean import paths. These are re-exports only — no new logic.

**Files:**
- Create: `src/renderer/infrastructure/services/capture/index.ts`
- Create: `src/renderer/infrastructure/services/devices/index.ts`
- Create: `src/renderer/infrastructure/services/notes/index.ts`
- Create: `src/renderer/infrastructure/services/performance/index.ts`
- Create: `src/renderer/infrastructure/services/settings/index.ts`
- Create: `src/renderer/infrastructure/services/streaming/index.ts`
- Create: `src/renderer/infrastructure/services/transcode/index.ts`
- Create: `src/renderer/infrastructure/services/updates/index.ts`
- Create: `src/renderer/infrastructure/adapters/devices/index.ts`
- Create: `src/renderer/infrastructure/adapters/streaming/index.ts`
- Create: `src/renderer/infrastructure/adapters/platform/index.ts`

**Step 1: Create barrel files**

For each directory, create an `index.ts` that re-exports all public modules. To determine what to export, list the `.ts`/`.js` files in each directory (excluding any existing `index.ts` and subdirectories).

Pattern for each barrel file:
```typescript
export { ClassName } from './filename';
```

Use the default export name from each file. Each file exports a single class (service or adapter).

Important: Only export the primary class from each file. Do not export internal types or helper functions unless they are already used by the container or other modules.

To determine the correct class names, read the import statements in `src/renderer/application/container.ts` — it imports every service and adapter by name.

**Step 2: Run tests**

Run: `npx vitest run --config vitest.config.js 2>&1 | tail -5`
Expected: 129 test files, 2836 tests passed. Barrel files are additive — no existing imports break.

**Step 3: Run TypeScript check**

Run: `npx tsc --noEmit`
Expected: Clean — no errors.

**Step 4: Commit**

```bash
git add src/renderer/infrastructure/services/*/index.ts src/renderer/infrastructure/adapters/*/index.ts
git commit -m "refactor(renderer): add barrel index files for infrastructure subdirectories"
```

---

## Appendix: Verification Checklist

After all tasks are complete, run this final verification:

```bash
npm run build                    # Production build succeeds
npm run dev                      # Dev server starts without errors
npx vitest run --config vitest.config.js  # All 2836 tests pass
npx tsc --noEmit                 # TypeScript compiles clean
npm run lint                     # Linting passes
```

All stale references should be eliminated. The codebase documentation should accurately reflect the current architecture.
