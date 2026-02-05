# Phase 3: Restructure Main Process - Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task with parallel agents where possible.

**Goal:** Restructure the Electron main process to follow Clean Architecture with clear layer separation: `application/` for orchestration, `infrastructure/` for all implementations, and consolidated `ipc/handlers/`.

**Current State:** Main process already uses BaseService/BaseOrchestrator patterns, Awilix DI, and feature-based organization. This restructure consolidates and formalizes the existing patterns.

**Risk Level:** Low - Main process is simpler than renderer, fewer files, clear dependencies.

---

## Overview of Changes

| Current Location | New Location | Rationale |
|-----------------|--------------|-----------|
| `window/window.service.js` | `infrastructure/window/window.service.ts` | All implementations in infrastructure |
| `tray/tray.service.js` | `infrastructure/tray/tray.service.ts` | All implementations in infrastructure |
| `platform/gpu-policy.js` | `infrastructure/platform/gpu-policy.ts` | Platform code is infrastructure |
| `features/devices/*.js` | `infrastructure/devices/*.ts` | Services in infrastructure |
| `features/devices/ipc/` | `ipc/handlers/device.handler.ts` | Consolidated IPC handlers |
| `features/updates/*.js` | `infrastructure/updates/*.ts` | Services in infrastructure |
| `features/updates/ipc/` | `ipc/handlers/update.handler.ts` | Consolidated IPC handlers |
| `features/transcode/*.js` | `infrastructure/transcode/*.ts` | Services in infrastructure |
| `features/transcode/ipc/` | `ipc/handlers/transcode.handler.ts` | Consolidated IPC handlers |
| `features/shell/ipc/` | `ipc/handlers/shell.handler.ts` | Consolidated IPC handlers |
| `features/window/ipc/` | `ipc/handlers/window.handler.ts` | Consolidated IPC handlers |
| `features/performance/ipc/` | `ipc/handlers/performance.handler.ts` | Consolidated IPC handlers |
| `features/gpu/ipc/` | `ipc/handlers/gpu.handler.ts` | Consolidated IPC handlers |
| `app.orchestrator.js` | `application/app.orchestrator.ts` | Application layer |
| `container.js` | `application/container.ts` | Application layer |

---

## Target Directory Structure

```
src/main/
├── index.ts                                    # Entry point (minimal)
│
├── application/
│   ├── app.orchestrator.ts                    # Main process orchestrator
│   └── container.ts                           # DI container setup
│
├── infrastructure/
│   ├── devices/
│   │   ├── device.service.ts                  # USB detection
│   │   ├── device-bridge.service.ts           # Event bridge
│   │   ├── device-lifecycle.service.ts        # Auto-launch
│   │   ├── device-profile.registry.ts         # Profile registry
│   │   └── index.ts                           # Barrel export
│   │
│   ├── transcode/
│   │   ├── transcode.service.ts               # FFmpeg job management
│   │   ├── transcode-process.ts               # Child process wrapper
│   │   ├── ffmpeg-path.utils.ts               # Binary resolution
│   │   ├── transcode-temp.utils.ts            # Temp file management
│   │   └── index.ts                           # Barrel export
│   │
│   ├── updates/
│   │   ├── update.service.ts                  # electron-updater
│   │   ├── update.bridge.ts                   # Update orchestration
│   │   └── index.ts                           # Barrel export
│   │
│   ├── window/
│   │   ├── window.service.ts                  # BrowserWindow management
│   │   └── index.ts                           # Barrel export
│   │
│   ├── tray/
│   │   ├── tray.service.ts                    # System tray
│   │   └── index.ts                           # Barrel export
│   │
│   ├── platform/
│   │   ├── gpu-policy.ts                      # GPU detection
│   │   └── index.ts                           # Barrel export
│   │
│   ├── events/
│   │   ├── event-bus.ts                       # EventEmitter wrapper
│   │   ├── event-channels.config.ts           # Event constants
│   │   └── index.ts                           # Barrel export
│   │
│   └── logging/
│       ├── logger.factory.ts                  # Winston logger
│       └── index.ts                           # Barrel export
│
└── ipc/
    ├── ipc-handler.registry.ts                # Central registration
    └── handlers/
        ├── device.handler.ts                  # Device IPC
        ├── update.handler.ts                  # Update IPC
        ├── transcode.handler.ts               # Transcode IPC
        ├── window.handler.ts                  # Window IPC
        ├── shell.handler.ts                   # Shell IPC
        ├── performance.handler.ts             # Performance IPC
        ├── gpu.handler.ts                     # GPU IPC
        └── index.ts                           # Barrel export
```

---

## Phase 3.0: Setup

### Task 3.0: Create Directory Structure

**Files:**
- Create: `src/main/application/` directory
- Create: `src/main/ipc/handlers/` directory

**Step 1: Create new directories**

```bash
mkdir -p src/main/application
mkdir -p src/main/ipc/handlers
```

**Step 2: Verify structure**

```bash
ls -la src/main/
```

**Step 3: Commit**

```bash
git add src/main/
git commit -m "build(main): create Clean Architecture directory structure"
```

---

## Phase 3.1: Move Infrastructure Services

### Task 3.1: Move Window Service

**Files:**
- Move: `src/main/window/window.service.js` → `src/main/infrastructure/window/window.service.ts`
- Create: `src/main/infrastructure/window/index.ts`
- Delete: `src/main/window/` (after move)

**Step 1: Move and convert to TypeScript**

Move file to new location and add TypeScript types. The service already extends BaseService with proper patterns.

Key changes:
- Add TypeScript types for BrowserWindow, WebContents
- Add interface for WindowServiceConfig
- Export types for consumers

**Step 2: Create barrel export**

```typescript
// src/main/infrastructure/window/index.ts
export { WindowService } from './window.service';
```

**Step 3: Update imports in container.js**

**Step 4: Commit**

```bash
git add src/main/infrastructure/window/ src/main/application/
git rm -r src/main/window/
git commit -m "refactor(main): move WindowService to infrastructure"
```

---

### Task 3.2: Move Tray Service

**Files:**
- Move: `src/main/tray/tray.service.js` → `src/main/infrastructure/tray/tray.service.ts`
- Create: `src/main/infrastructure/tray/index.ts`
- Delete: `src/main/tray/` (after move)

**Step 1: Move and convert to TypeScript**

Key changes:
- Add TypeScript types for Tray, Menu, MenuItemConstructorOptions
- Add interface for TrayServiceDependencies
- Type the menu item callbacks

**Step 2: Create barrel export**

```typescript
// src/main/infrastructure/tray/index.ts
export { TrayService } from './tray.service';
```

**Step 3: Update imports in container.js**

**Step 4: Commit**

```bash
git add src/main/infrastructure/tray/ src/main/application/
git rm -r src/main/tray/
git commit -m "refactor(main): move TrayService to infrastructure"
```

---

### Task 3.3: Move Platform (GPU Policy)

**Files:**
- Move: `src/main/platform/gpu-policy.js` → `src/main/infrastructure/platform/gpu-policy.ts`
- Create: `src/main/infrastructure/platform/index.ts`
- Delete: `src/main/platform/` (after move)

**Step 1: Move and convert to TypeScript**

Key changes:
- Add type for GpuPolicy enum/union
- Add return type annotations
- Add platform detection types

**Step 2: Create barrel export**

```typescript
// src/main/infrastructure/platform/index.ts
export { getGpuPolicy, type GpuPolicy } from './gpu-policy';
```

**Step 3: Update imports in index.js**

**Step 4: Commit**

```bash
git add src/main/infrastructure/platform/
git rm -r src/main/platform/
git commit -m "refactor(main): move GPU policy to infrastructure"
```

---

### Task 3.4: Move Device Services

**Files:**
- Move: `src/main/features/devices/device.service.js` → `src/main/infrastructure/devices/device.service.ts`
- Move: `src/main/features/devices/device-bridge.service.js` → `src/main/infrastructure/devices/device-bridge.service.ts`
- Move: `src/main/features/devices/device-lifecycle.service.js` → `src/main/infrastructure/devices/device-lifecycle.service.ts`
- Move: `src/main/features/devices/device-profile.registry.js` → `src/main/infrastructure/devices/device-profile.registry.ts`
- Create: `src/main/infrastructure/devices/index.ts`

**Step 1: Move and convert each file to TypeScript**

Key changes for device.service.ts:
- Import types from usb-detection
- Add interface for DeviceServiceDependencies
- Type the USB device events and callbacks
- Add mutex/lock types

Key changes for device-bridge.service.ts:
- Add interface for DeviceBridgeServiceDependencies
- Type the event handlers

Key changes for device-lifecycle.service.ts:
- Add interface for DeviceLifecycleServiceDependencies
- Type the lifecycle callbacks

Key changes for device-profile.registry.ts:
- Add generic types for profile registration
- Export profile types

**Step 2: Create barrel export**

```typescript
// src/main/infrastructure/devices/index.ts
export { DeviceService } from './device.service';
export { DeviceBridgeService } from './device-bridge.service';
export { DeviceLifecycleService } from './device-lifecycle.service';
export { DeviceProfileRegistry } from './device-profile.registry';
```

**Step 3: Update imports in container.js**

**Step 4: Commit**

```bash
git add src/main/infrastructure/devices/
git commit -m "refactor(main): move device services to infrastructure"
```

---

### Task 3.5: Move Update Services

**Files:**
- Move: `src/main/features/updates/update.service.js` → `src/main/infrastructure/updates/update.service.ts`
- Move: `src/main/features/updates/update.bridge.js` → `src/main/infrastructure/updates/update.bridge.ts`
- Create: `src/main/infrastructure/updates/index.ts`

**Step 1: Move and convert each file to TypeScript**

Key changes for update.service.ts:
- Import types from electron-updater
- Add interface for UpdateServiceDependencies
- Type the update events (UpdateInfo, ProgressInfo, etc.)

Key changes for update.bridge.ts:
- Add interface for UpdateBridgeDependencies
- Type the scheduling logic

**Step 2: Create barrel export**

```typescript
// src/main/infrastructure/updates/index.ts
export { UpdateService } from './update.service';
export { UpdateBridge } from './update.bridge';
```

**Step 3: Update imports in container.js**

**Step 4: Commit**

```bash
git add src/main/infrastructure/updates/
git commit -m "refactor(main): move update services to infrastructure"
```

---

### Task 3.6: Move Transcode Services

**Files:**
- Move: `src/main/features/transcode/transcode.service.js` → `src/main/infrastructure/transcode/transcode.service.ts`
- Move: `src/main/features/transcode/transcode-process.class.js` → `src/main/infrastructure/transcode/transcode-process.ts`
- Move: `src/main/features/transcode/ffmpeg-path.utils.js` → `src/main/infrastructure/transcode/ffmpeg-path.utils.ts`
- Move: `src/main/features/transcode/transcode-temp.utils.js` → `src/main/infrastructure/transcode/transcode-temp.utils.ts`
- Create: `src/main/infrastructure/transcode/index.ts`

**Step 1: Move and convert each file to TypeScript**

Key changes for transcode.service.ts:
- Add interface for TranscodeServiceDependencies
- Type the transcode job state
- Add TranscodeOptions interface

Key changes for transcode-process.ts:
- Type the FFmpeg process events
- Add interface for process options
- Type the progress parsing

Key changes for ffmpeg-path.utils.ts:
- Type the path resolution functions
- Add platform type handling

Key changes for transcode-temp.utils.ts:
- Type the temp file management
- Add session cleanup types

**Step 2: Create barrel export**

```typescript
// src/main/infrastructure/transcode/index.ts
export { TranscodeService } from './transcode.service';
export { TranscodeProcess } from './transcode-process';
export { getFFmpegPath, getFFprobePath } from './ffmpeg-path.utils';
export { TranscodeTempManager } from './transcode-temp.utils';
```

**Step 3: Update imports in container.js**

**Step 4: Commit**

```bash
git add src/main/infrastructure/transcode/
git commit -m "refactor(main): move transcode services to infrastructure"
```

---

### Task 3.7: Move Events Infrastructure

**Files:**
- Move: `src/main/infrastructure/events/event-bus.class.js` → `src/main/infrastructure/events/event-bus.ts`
- Move: `src/main/infrastructure/events/event-channels.config.js` → `src/main/infrastructure/events/event-channels.config.ts`
- Create: `src/main/infrastructure/events/index.ts`

**Step 1: Convert to TypeScript**

Key changes for event-bus.ts:
- Add generic types for event payloads
- Implement IEventBus interface from core
- Type the subscription handlers

Key changes for event-channels.config.ts:
- Export typed event channel constants
- Add type for EventChannels

**Step 2: Create barrel export**

```typescript
// src/main/infrastructure/events/index.ts
export { EventBus } from './event-bus';
export { MAIN_EVENT_CHANNELS } from './event-channels.config';
```

**Step 3: Commit**

```bash
git add src/main/infrastructure/events/
git commit -m "refactor(main): convert events infrastructure to TypeScript"
```

---

### Task 3.8: Move Logging Infrastructure

**Files:**
- Move: `src/main/infrastructure/logging/main-logger.factory.js` → `src/main/infrastructure/logging/logger.factory.ts`
- Create: `src/main/infrastructure/logging/index.ts`

**Step 1: Convert to TypeScript**

Key changes for logger.factory.ts:
- Implement ILoggerFactory interface from core
- Type the Winston configuration
- Add LogLevel type

**Step 2: Create barrel export**

```typescript
// src/main/infrastructure/logging/index.ts
export { MainLoggerFactory } from './logger.factory';
```

**Step 3: Commit**

```bash
git add src/main/infrastructure/logging/
git commit -m "refactor(main): convert logging infrastructure to TypeScript"
```

---

## Phase 3.2: Consolidate IPC Handlers

### Task 3.9: Consolidate Device IPC Handler

**Files:**
- Move: `src/main/features/devices/ipc/device-ipc.handler.js` → `src/main/ipc/handlers/device.handler.ts`

**Step 1: Move and convert to TypeScript**

Key changes:
- Import types from core IPC contracts
- Type the handler function signatures
- Use typed channel constants

**Step 2: Update imports in ipc-handler.registry.js**

**Step 3: Commit**

```bash
git add src/main/ipc/handlers/device.handler.ts
git commit -m "refactor(main): consolidate device IPC handler"
```

---

### Task 3.10: Consolidate Update IPC Handler

**Files:**
- Move: `src/main/features/updates/ipc/update-ipc.handler.js` → `src/main/ipc/handlers/update.handler.ts`

**Step 1: Move and convert to TypeScript**

Key changes:
- Import types from core IPC contracts (UpdateInfo, UpdateProgress, etc.)
- Type the handler function signatures
- Use typed channel constants

**Step 2: Update imports in ipc-handler.registry.js**

**Step 3: Commit**

```bash
git add src/main/ipc/handlers/update.handler.ts
git commit -m "refactor(main): consolidate update IPC handler"
```

---

### Task 3.11: Consolidate Transcode IPC Handler

**Files:**
- Move: `src/main/features/transcode/ipc/transcode-ipc.handler.js` → `src/main/ipc/handlers/transcode.handler.ts`

**Step 1: Move and convert to TypeScript**

Key changes:
- Import types from core IPC contracts (TranscodeOptions, TranscodeProgress, etc.)
- Type the handler function signatures
- Use typed channel constants

**Step 2: Update imports in ipc-handler.registry.js**

**Step 3: Commit**

```bash
git add src/main/ipc/handlers/transcode.handler.ts
git commit -m "refactor(main): consolidate transcode IPC handler"
```

---

### Task 3.12: Consolidate Window IPC Handler

**Files:**
- Move: `src/main/features/window/ipc/window-ipc.handler.js` → `src/main/ipc/handlers/window.handler.ts`

**Step 1: Move and convert to TypeScript**

Key changes:
- Import types from core IPC contracts
- Type the fullscreen handlers

**Step 2: Update imports in ipc-handler.registry.js**

**Step 3: Commit**

```bash
git add src/main/ipc/handlers/window.handler.ts
git commit -m "refactor(main): consolidate window IPC handler"
```

---

### Task 3.13: Consolidate Shell IPC Handler

**Files:**
- Move: `src/main/features/shell/ipc/shell-ipc.handler.js` → `src/main/ipc/handlers/shell.handler.ts`

**Step 1: Move and convert to TypeScript**

Key changes:
- Type the URL validation
- Type the shell.openExternal call

**Step 2: Update imports in ipc-handler.registry.js**

**Step 3: Commit**

```bash
git add src/main/ipc/handlers/shell.handler.ts
git commit -m "refactor(main): consolidate shell IPC handler"
```

---

### Task 3.14: Consolidate Performance IPC Handler

**Files:**
- Move: `src/main/features/performance/ipc/performance-ipc.handler.js` → `src/main/ipc/handlers/performance.handler.ts`

**Step 1: Move and convert to TypeScript**

Key changes:
- Type the process metrics return value
- Type the memory/CPU usage objects

**Step 2: Update imports in ipc-handler.registry.js**

**Step 3: Commit**

```bash
git add src/main/ipc/handlers/performance.handler.ts
git commit -m "refactor(main): consolidate performance IPC handler"
```

---

### Task 3.15: Consolidate GPU IPC Handler

**Files:**
- Move: `src/main/features/gpu/ipc/gpu-ipc.handler.js` → `src/main/ipc/handlers/gpu.handler.ts`

**Step 1: Move and convert to TypeScript**

Key changes:
- Type the GPU policy return value
- Import GpuPolicy type from platform

**Step 2: Update imports in ipc-handler.registry.js**

**Step 3: Commit**

```bash
git add src/main/ipc/handlers/gpu.handler.ts
git commit -m "refactor(main): consolidate GPU IPC handler"
```

---

### Task 3.16: Create Handlers Barrel Export

**Files:**
- Create: `src/main/ipc/handlers/index.ts`

**Step 1: Create barrel export**

```typescript
// src/main/ipc/handlers/index.ts
export { registerDeviceHandlers } from './device.handler';
export { registerUpdateHandlers } from './update.handler';
export { registerTranscodeHandlers } from './transcode.handler';
export { registerWindowHandlers } from './window.handler';
export { registerShellHandlers } from './shell.handler';
export { registerPerformanceHandlers } from './performance.handler';
export { registerGpuHandlers } from './gpu.handler';
```

**Step 2: Update ipc-handler.registry.ts imports**

**Step 3: Commit**

```bash
git add src/main/ipc/handlers/index.ts
git commit -m "refactor(main): add IPC handlers barrel export"
```

---

### Task 3.17: Convert IPC Handler Registry

**Files:**
- Move: `src/main/ipc/ipc-handler.registry.js` → `src/main/ipc/ipc-handler.registry.ts`

**Step 1: Convert to TypeScript**

Key changes:
- Add interface for IpcHandlerRegistryDependencies
- Type the registerHandler function
- Import all handler registrations from barrel export

**Step 2: Commit**

```bash
git add src/main/ipc/ipc-handler.registry.ts
git commit -m "refactor(main): convert IPC handler registry to TypeScript"
```

---

## Phase 3.3: Move Application Layer

### Task 3.18: Move Container to Application Layer

**Files:**
- Move: `src/main/container.js` → `src/main/application/container.ts`

**Step 1: Move and convert to TypeScript**

Key changes:
- Add typed container configuration
- Import all services from infrastructure barrel exports
- Type the Awilix container
- Add ContainerDependencies interface

**Step 2: Commit**

```bash
git add src/main/application/container.ts
git commit -m "refactor(main): move container to application layer"
```

---

### Task 3.19: Move AppOrchestrator to Application Layer

**Files:**
- Move: `src/main/app.orchestrator.js` → `src/main/application/app.orchestrator.ts`
- Create: `src/main/application/index.ts`

**Step 1: Move and convert to TypeScript**

Key changes:
- Add interface for AppOrchestratorDependencies
- Type the lifecycle methods
- Import services from infrastructure barrel exports
- Type the safeDisposeAll utility

**Step 2: Create barrel export**

```typescript
// src/main/application/index.ts
export { AppOrchestrator } from './app.orchestrator';
export { createContainer } from './container';
```

**Step 3: Commit**

```bash
git add src/main/application/
git commit -m "refactor(main): move AppOrchestrator to application layer"
```

---

### Task 3.20: Convert Entry Point

**Files:**
- Move: `src/main/index.js` → `src/main/index.ts`

**Step 1: Convert to TypeScript**

Key changes:
- Import from application layer
- Type Electron app lifecycle callbacks
- Import GPU policy from infrastructure

**Step 2: Commit**

```bash
git add src/main/index.ts
git commit -m "refactor(main): convert entry point to TypeScript"
```

---

## Phase 3.4: Cleanup and Verification

### Task 3.21: Remove Empty Features Directories

**Files:**
- Delete: `src/main/features/` (should be empty after all moves)

**Step 1: Verify features directory is empty**

```bash
find src/main/features -type f
```

**Step 2: Remove empty directories**

```bash
git rm -r src/main/features/
```

**Step 3: Commit**

```bash
git commit -m "refactor(main): remove empty features directory"
```

---

### Task 3.22: Update Vite Configuration

**Files:**
- Update: `vite.config.js` (if needed for main process TypeScript)

**Step 1: Verify TypeScript compilation for main process**

The main process is compiled by vite-plugin-electron. Verify it handles .ts files correctly.

**Step 2: Update any path aliases if needed**

**Step 3: Commit if changes made**

```bash
git add vite.config.js
git commit -m "build(main): update Vite config for TypeScript main process"
```

---

### Task 3.23: Verify Build and Tests

**Step 1: Run TypeScript check**

```bash
npm run typecheck
```

**Step 2: Run tests**

```bash
npm run test:run
```

**Step 3: Run lint**

```bash
npm run lint
```

**Step 4: Test application launch**

```bash
npm run dev
```

**Step 5: Commit any fixes**

---

### Task 3.24: Create Phase 3 Summary PR

**Step 1: Review all changes**

```bash
git log --oneline main..HEAD
git diff --stat main..HEAD
```

**Step 2: Create PR**

```bash
gh pr create --title "refactor: Phase 3 - Restructure main process to Clean Architecture" --body "$(cat <<'EOF'
## Summary

Phase 3 of the Clean Architecture migration. Restructures the main process with:

### Structure Changes

- **application/** - AppOrchestrator and DI container
- **infrastructure/** - All service implementations organized by domain
- **ipc/handlers/** - All IPC handlers consolidated in single location

### TypeScript Migration

All main process files converted to TypeScript with proper typing for:
- Electron APIs (BrowserWindow, Tray, Menu, IPC)
- electron-updater types
- usb-detection types
- FFmpeg process management

### Files Moved

| From | To |
|------|-----|
| `window/` | `infrastructure/window/` |
| `tray/` | `infrastructure/tray/` |
| `platform/` | `infrastructure/platform/` |
| `features/devices/` | `infrastructure/devices/` |
| `features/updates/` | `infrastructure/updates/` |
| `features/transcode/` | `infrastructure/transcode/` |
| `features/*/ipc/` | `ipc/handlers/` |
| `app.orchestrator.js` | `application/app.orchestrator.ts` |
| `container.js` | `application/container.ts` |

### Testing

- All existing tests pass
- TypeScript compiles cleanly
- Application launches and functions correctly

## Next Steps

- Phase 4: Restructure `renderer/infrastructure/`
EOF
)"
```

---

## Appendix: Dependency Graph

### Before (Current)

```
index.js
  └── app.orchestrator.js
        └── container.js
              ├── window/window.service.js
              ├── tray/tray.service.js
              ├── features/devices/*.js
              ├── features/updates/*.js
              ├── features/transcode/*.js
              └── ipc/ipc-handler.registry.js
                    ├── features/devices/ipc/*.js
                    ├── features/updates/ipc/*.js
                    ├── features/transcode/ipc/*.js
                    ├── features/window/ipc/*.js
                    ├── features/shell/ipc/*.js
                    ├── features/performance/ipc/*.js
                    └── features/gpu/ipc/*.js
```

### After (Target)

```
index.ts
  └── application/
        ├── app.orchestrator.ts
        └── container.ts
              ├── infrastructure/window/
              ├── infrastructure/tray/
              ├── infrastructure/platform/
              ├── infrastructure/devices/
              ├── infrastructure/updates/
              ├── infrastructure/transcode/
              ├── infrastructure/events/
              ├── infrastructure/logging/
              └── ipc/
                    ├── ipc-handler.registry.ts
                    └── handlers/*.ts
```

---

## Appendix: Parallelization Opportunities

The following tasks can be run in parallel:

**Batch 1 (Infrastructure Services - No Dependencies):**
- Task 3.1: Move Window Service
- Task 3.2: Move Tray Service
- Task 3.3: Move Platform

**Batch 2 (Feature Services - No Cross-Dependencies):**
- Task 3.4: Move Device Services
- Task 3.5: Move Update Services
- Task 3.6: Move Transcode Services

**Batch 3 (Existing Infrastructure):**
- Task 3.7: Move Events Infrastructure
- Task 3.8: Move Logging Infrastructure

**Batch 4 (IPC Handlers - No Cross-Dependencies):**
- Task 3.9: Consolidate Device IPC Handler
- Task 3.10: Consolidate Update IPC Handler
- Task 3.11: Consolidate Transcode IPC Handler
- Task 3.12: Consolidate Window IPC Handler
- Task 3.13: Consolidate Shell IPC Handler
- Task 3.14: Consolidate Performance IPC Handler
- Task 3.15: Consolidate GPU IPC Handler

**Sequential (Dependencies on Previous):**
- Task 3.16: Create Handlers Barrel Export (after Batch 4)
- Task 3.17: Convert IPC Handler Registry (after Task 3.16)
- Task 3.18: Move Container (after Batches 1-3)
- Task 3.19: Move AppOrchestrator (after Task 3.18)
- Task 3.20: Convert Entry Point (after Task 3.19)
- Tasks 3.21-3.24: Cleanup and verification (sequential)

---

## Appendix: File Count Summary

| Category | Files Moved | Files Created | Files Deleted |
|----------|-------------|---------------|---------------|
| Infrastructure | 15 | 8 barrel exports | 0 |
| IPC Handlers | 7 | 1 barrel export | 0 |
| Application | 2 | 1 barrel export | 0 |
| Entry Point | 1 | 0 | 0 |
| Cleanup | 0 | 0 | ~10 empty dirs |
| **Total** | **25** | **10** | **~10** |
