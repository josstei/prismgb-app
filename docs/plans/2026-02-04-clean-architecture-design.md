# Clean Architecture Restructure Design

## Overview

This document outlines a comprehensive restructuring of the PrismGB Electron application to follow Clean Architecture principles with strict separation of concerns, interface-driven contracts, and TypeScript throughout.

### Goals

| Goal | Solution |
|------|----------|
| **Finding code** | Predictable locations: orchestrators in `application/`, implementations in `infrastructure/`, UI in `presentation/` |
| **Understanding relationships** | Unidirectional dependency flow; interfaces define contracts |
| **Process consistency** | Main and renderer follow identical layer structure |
| **Strict contracts** | All cross-boundary communication through interfaces in `core/` |
| **Reduced boilerplate** | Shared base classes, consistent patterns, DI wiring |
| **GPU isolation** | Separate package with clean public API; internals hidden |
| **Long-term extensibility** | New features plug into existing layers; swap implementations without touching consumers |

### Key Decisions

- **Full restructure** (not incremental adoption)
- **GPU rendering extracted as separate package** (`@prismgb/gpu`)
- **TypeScript migration during restructure**
- **Layer-by-layer migration** approach

---

## Monorepo Structure

```
prismgb-workspace/
├── package.json                             # Workspace root
├── pnpm-workspace.yaml                      # (or npm workspaces)
├── tsconfig.base.json                       # Shared TS config
│
├── prismgb-app/
│   ├── package.json                         # depends on @prismgb/gpu
│   ├── tsconfig.json                        # extends ../tsconfig.base.json
│   ├── vite.config.ts
│   ├── vitest.config.ts
│   └── src/
│       ├── core/
│       ├── main/
│       ├── renderer/
│       └── preload/
│
├── prismgb-gpu/
│   ├── package.json                         # @prismgb/gpu
│   ├── tsconfig.json                        # extends ../tsconfig.base.json
│   ├── vitest.config.ts
│   └── src/
│       ├── domain/
│       ├── application/
│       ├── infrastructure/
│       └── index.ts
│
└── prismgb-site/
    └── (existing marketing site)
```

### Dependency Flow

```
┌─────────────────┐          ┌─────────────────┐
│  @prismgb/gpu   │          │     core/       │
│  (standalone)   │          │  (interfaces)   │
│  defines its    │          │  app contracts  │
│  own contracts  │          │                 │
└────────┬────────┘          └────────┬────────┘
         │                            │
         │ imports                    │ imports
         │                            │
         └──────────┬─────────────────┘
                    │
                    ▼
         ┌─────────────────────┐
         │ renderer/application │
         │                     │
         │ uses GPU public API │
         │ uses core interfaces│
         └─────────────────────┘
```

| Package | Imports From | Knows Nothing About |
|---------|--------------|---------------------|
| `@prismgb/gpu` | Nothing (standalone) | core/, main/, renderer/ |
| `core/` | Nothing (innermost) | @prismgb/gpu, main/, renderer/ |
| `renderer/` | `core/`, `@prismgb/gpu` | main/ |
| `main/` | `core/` | @prismgb/gpu, renderer/ |

---

## Core Package (`prismgb-app/src/core/`)

Process-agnostic contracts and domain entities that both main and renderer depend on.

```
core/
├── domain/
│   ├── devices/
│   │   ├── device-profile.interface.ts      # IDeviceProfile contract
│   │   ├── device-profile.base.ts           # Base implementation
│   │   ├── device-registry.ts               # Registry singleton
│   │   └── profiles/
│   │       └── chromatic.profile.ts         # Chromatic-specific profile
│   │
│   └── transcode/
│       ├── transcode-format.interface.ts    # ITranscodeFormat
│       ├── transcode-state.enum.ts          # State enumeration
│       └── formats/                         # Format implementations
│           ├── webm.format.ts
│           ├── mp4.format.ts
│           └── mov.format.ts
│
├── interfaces/
│   ├── adapters/
│   │   ├── device-adapter.interface.ts      # IDeviceAdapter
│   │   ├── storage-adapter.interface.ts     # IStorageAdapter
│   │   └── media-adapter.interface.ts       # IMediaAdapter
│   │
│   ├── services/
│   │   ├── device-service.interface.ts      # IDeviceService
│   │   ├── capture-service.interface.ts     # ICaptureService
│   │   ├── settings-service.interface.ts    # ISettingsService
│   │   └── transcode-service.interface.ts   # ITranscodeService
│   │
│   └── infrastructure/
│       ├── event-bus.interface.ts           # IEventBus
│       ├── logger.interface.ts              # ILogger, ILoggerFactory
│       └── service-container.interface.ts   # IServiceContainer
│
├── ipc/
│   ├── channels.ts                          # Channel constants (from JSON)
│   └── contracts/
│       ├── device-ipc.contract.ts           # Device IPC request/response types
│       ├── window-ipc.contract.ts           # Window IPC types
│       ├── transcode-ipc.contract.ts        # Transcode IPC types
│       └── update-ipc.contract.ts           # Update IPC types
│
├── errors/
│   ├── app-error.ts                         # Base AppError class
│   └── error-codes.enum.ts                  # Typed error codes
│
└── base/
    ├── service.base.ts                      # BaseService
    ├── orchestrator.base.ts                 # BaseOrchestrator
    └── disposable.interface.ts              # IDisposable
```

### Key Principles

- **Interfaces drive contracts**: All service interfaces defined here, implementations elsewhere
- **No process-specific code**: Zero DOM, zero Node.js APIs, zero Electron APIs
- **IPC contracts are typed**: Request/response types for each IPC channel
- **Domain is pure**: Device profiles and transcode formats have no infrastructure dependencies

### What Moves OUT of Core (vs Current `shared/`)

- DOM selectors → `renderer/presentation/`
- CSS classes → `renderer/presentation/`
- Storage keys → `renderer/infrastructure/`
- Streaming acquisition → `renderer/infrastructure/`
- Browser-specific utils → `renderer/`

---

## Main Process (`prismgb-app/src/main/`)

Handles Node.js/Electron concerns: USB detection, window management, transcoding, updates.

```
main/
├── application/
│   ├── app.orchestrator.ts                  # Main process entry orchestrator
│   └── container.ts                         # DI container setup (Awilix)
│
├── infrastructure/
│   ├── devices/
│   │   ├── usb-device.service.ts            # usb-detection implementation
│   │   ├── device-bridge.service.ts         # Event bridge to renderer
│   │   └── device-lifecycle.service.ts      # Auto-launch behavior
│   │
│   ├── transcode/
│   │   ├── transcode.service.ts             # ITranscodeService implementation
│   │   ├── ffmpeg-process.ts                # FFmpeg process wrapper
│   │   └── ffmpeg-path.resolver.ts          # Binary path resolution
│   │
│   ├── updates/
│   │   ├── update.service.ts                # electron-updater wrapper
│   │   └── update-scheduler.ts              # Update timing logic
│   │
│   ├── window/
│   │   ├── window.service.ts                # BrowserWindow management
│   │   └── window-state.ts                  # Window position/size persistence
│   │
│   ├── tray/
│   │   └── tray.service.ts                  # System tray management
│   │
│   ├── platform/
│   │   └── gpu-policy.ts                    # Platform-specific GPU settings
│   │
│   ├── events/
│   │   ├── event-bus.ts                     # IEventBus implementation (Node EventEmitter)
│   │   └── event-channels.config.ts         # Main process event definitions
│   │
│   └── logging/
│       └── logger.factory.ts                # ILoggerFactory implementation (Winston)
│
├── ipc/
│   ├── ipc-handler.registry.ts              # Centralized handler registration
│   └── handlers/
│       ├── device.handler.ts                # Device IPC handlers
│       ├── window.handler.ts                # Window IPC handlers
│       ├── transcode.handler.ts             # Transcode IPC handlers
│       ├── update.handler.ts                # Update IPC handlers
│       ├── performance.handler.ts           # Metrics IPC handlers
│       └── shell.handler.ts                 # External URL handlers
│
└── index.ts                                 # Entry point
```

### Key Changes from Current

| Current | Proposed | Rationale |
|---------|----------|-----------|
| `window/` and `tray/` at root | Under `infrastructure/` | All implementations live in infrastructure |
| Services flat in feature folders | Grouped by domain in `infrastructure/` | Consistent pattern |
| IPC handlers scattered in `features/*/ipc/` | Consolidated in `ipc/handlers/` | Single location for all IPC |
| `platform/` at root | Under `infrastructure/` | Platform code is infrastructure |
| No `application/` layer | Added | Clear orchestration layer |

---

## Renderer Process (`prismgb-app/src/renderer/`)

The most complex process, separated into clear Clean Architecture layers.

```
renderer/
├── application/
│   ├── orchestrators/
│   │   ├── app.orchestrator.ts              # Root orchestrator
│   │   ├── streaming.orchestrator.ts        # Stream lifecycle
│   │   ├── capture.orchestrator.ts          # Screenshot/recording coordination
│   │   ├── device.orchestrator.ts           # Device detection/selection
│   │   ├── settings.orchestrator.ts         # Preferences coordination
│   │   ├── display-mode.orchestrator.ts     # Fullscreen/cinematic
│   │   ├── update.orchestrator.ts           # Auto-update flow
│   │   └── notes.orchestrator.ts            # Notes feature
│   │
│   ├── state/
│   │   └── app-state.ts                     # Global application state
│   │
│   └── container.ts                         # DI container setup
│
├── infrastructure/
│   ├── services/
│   │   ├── streaming/
│   │   │   ├── streaming.service.ts         # IStreamingService implementation
│   │   │   ├── audio-pipeline.service.ts    # Web Audio pipeline
│   │   │   └── stream-health.service.ts     # Health monitoring
│   │   │
│   │   ├── capture/
│   │   │   ├── capture.service.ts           # ICaptureService implementation
│   │   │   ├── capture-save.service.ts      # File saving with transcode
│   │   │   └── gpu-recording.service.ts     # GPU-based recording
│   │   │
│   │   ├── devices/
│   │   │   ├── device.service.ts            # IDeviceService implementation
│   │   │   ├── device-connection.service.ts # USB status from main
│   │   │   ├── device-media.service.ts      # Media enumeration
│   │   │   └── device-storage.service.ts    # Device ID persistence
│   │   │
│   │   ├── settings/
│   │   │   ├── settings.service.ts          # ISettingsService implementation
│   │   │   ├── fullscreen.service.ts        # Fullscreen handling
│   │   │   └── cinematic-mode.service.ts    # Cinematic state
│   │   │
│   │   ├── transcode/
│   │   │   └── transcode.service.ts         # Renderer-side transcode bridge
│   │   │
│   │   ├── updates/
│   │   │   ├── update.service.ts            # Update state management
│   │   │   └── update-ui.service.ts         # Update notifications
│   │   │
│   │   └── notes/
│   │       └── notes.service.ts             # Notes CRUD
│   │
│   ├── adapters/
│   │   ├── devices/
│   │   │   ├── device-ipc-status.adapter.ts # IDeviceStatusProvider impl
│   │   │   └── chromatic/
│   │   │       └── chromatic.adapter.ts     # IDeviceAdapter impl
│   │   │
│   │   ├── browser/
│   │   │   ├── media.adapter.ts             # Browser media APIs
│   │   │   └── storage.adapter.ts           # LocalStorage wrapper
│   │   │
│   │   └── platform/
│   │       ├── visibility.adapter.ts        # Page visibility API
│   │       ├── reduced-motion.adapter.ts    # Prefers-reduced-motion
│   │       └── user-activity.adapter.ts     # Mouse/keyboard activity
│   │
│   ├── streaming/
│   │   └── acquisition/
│   │       ├── acquisition-context.ts       # Immutable device context
│   │       ├── acquisition.orchestrator.ts  # Stream acquisition flow
│   │       ├── constraint-builder.ts        # MediaStreamConstraints
│   │       └── fallback-strategy.ts         # Acquisition fallback chain
│   │
│   ├── events/
│   │   ├── event-bus.ts                     # IEventBus impl (eventemitter3)
│   │   └── event-channels.config.ts         # Renderer event definitions
│   │
│   └── logging/
│       └── logger.factory.ts                # ILoggerFactory impl (console)
│
├── presentation/
│   ├── components/
│   │   ├── streaming/
│   │   │   ├── stream-viewer.component.ts
│   │   │   ├── stream-viewer.template.ts
│   │   │   └── streaming-controls.component.ts
│   │   │
│   │   ├── toolbar/
│   │   │   ├── toolbar.component.ts
│   │   │   ├── toolbar.template.ts
│   │   │   ├── shader-selector.component.ts
│   │   │   ├── shader-preset-list.component.ts
│   │   │   ├── shader-slider-controls.component.ts
│   │   │   └── cinematic-toggle.component.ts
│   │   │
│   │   ├── settings/
│   │   │   ├── settings-menu.component.ts
│   │   │   └── settings-menu.template.ts
│   │   │
│   │   ├── notes/
│   │   │   ├── notes-panel.component.ts
│   │   │   ├── notes-panel.template.ts
│   │   │   ├── notes-list.component.ts
│   │   │   ├── notes-editor.component.ts
│   │   │   ├── notes-search.component.ts
│   │   │   ├── notes-resize.component.ts
│   │   │   ├── game-filter.component.ts
│   │   │   └── game-autocomplete.component.ts
│   │   │
│   │   ├── updates/
│   │   │   └── update-section.component.ts
│   │   │
│   │   ├── transcode/
│   │   │   └── transcode-toast.component.ts
│   │   │
│   │   └── shared/
│   │       ├── device-status.component.ts
│   │       └── status-notification.component.ts
│   │
│   ├── effects/
│   │   ├── ui-effects.ts                    # Facade for all effects
│   │   ├── body-class.manager.ts            # Body CSS class toggling
│   │   ├── cursor-auto-hide.effect.ts
│   │   ├── toolbar-auto-hide.effect.ts
│   │   ├── controls-auto-hide.effect.ts
│   │   ├── button-feedback.effect.ts
│   │   └── capture.effect.ts                # Shutter flash, etc.
│   │
│   ├── primitives/
│   │   ├── disclosure.controller.ts         # Panel show/hide
│   │   ├── listbox-dropdown.controller.ts   # Dropdown behavior
│   │   ├── hide-timer.ts                    # Auto-hide timing
│   │   └── listbox.utils.ts
│   │
│   ├── shell/
│   │   ├── app-shell.ts                     # Shell renderer
│   │   ├── app-shell.template.ts
│   │   ├── header.template.ts
│   │   └── status-footer.template.ts
│   │
│   ├── bridges/
│   │   ├── ui-event.bridge.ts               # General UI ↔ EventBus
│   │   ├── capture-ui.bridge.ts             # Capture feedback
│   │   └── transcode-ui.bridge.ts           # Transcode progress
│   │
│   ├── controller/
│   │   ├── ui.controller.ts                 # Thin facade
│   │   └── component.registry.ts            # Lifecycle management
│   │
│   ├── config/
│   │   ├── dom-selectors.config.ts          # All DOM element IDs
│   │   ├── css-classes.config.ts            # All CSS class names
│   │   └── dom-bindings.ts                  # Centralized DOM lookups
│   │
│   ├── styles/
│   │   ├── index.css                        # Entry point
│   │   ├── base/                            # Reset, variables, typography
│   │   ├── components/                      # Component-specific styles
│   │   │   ├── streaming.css
│   │   │   ├── toolbar.css
│   │   │   ├── settings.css
│   │   │   ├── notes.css
│   │   │   ├── updates.css
│   │   │   └── transcode.css
│   │   └── effects/                         # Effect-related styles
│   │       ├── fullscreen.css
│   │       └── capture-effects.css
│   │
│   └── icons/
│       └── icon.utils.ts
│
└── index.ts                                 # Entry point
```

### Key Changes from Current

| Current | Proposed | Rationale |
|---------|----------|-----------|
| Orchestrators in 5+ locations | All in `application/orchestrators/` | Single location |
| Services in `features/*/services/` | All in `infrastructure/services/` | Clear layer separation |
| Adapters scattered | Grouped in `infrastructure/adapters/` | Consistent pattern |
| `streaming/acquisition/` in shared | Moved to `infrastructure/streaming/` | Browser-only code |
| `features/` directory | Eliminated | Split into application (orchestration) and infrastructure (implementation) |
| Effects split between locations | All in `presentation/effects/` | Single location |
| CSS scattered in feature directories | Consolidated in `presentation/styles/` | Predictable style location |

### Layer Responsibilities

| Layer | Responsibility | Imports From |
|-------|---------------|--------------|
| `application/` | Coordination, workflow, state | `core/interfaces/`, `@prismgb/gpu`, never concrete implementations |
| `infrastructure/` | All implementations | `core/`, wired to application via DI |
| `presentation/` | UI components, effects, styles | `core/interfaces/` for types, receives implementations via DI |

---

## GPU Package (`prismgb-gpu/`)

GPU rendering as a separate bounded context package.

```
prismgb-gpu/
├── package.json                             # @prismgb/gpu
├── tsconfig.json
├── vitest.config.ts
│
└── src/
    ├── domain/
    │   ├── pipeline/
    │   │   ├── pipeline-config.interface.ts # Pipeline configuration contract
    │   │   ├── pipeline-capabilities.ts     # Capability detection results
    │   │   └── pipeline-stats.ts            # Frame timing, FPS stats
    │   │
    │   ├── presets/
    │   │   ├── render-preset.interface.ts   # IPreset contract
    │   │   ├── render-preset.registry.ts    # Preset registration
    │   │   └── presets/
    │   │       ├── default.preset.ts
    │   │       ├── crt.preset.ts
    │   │       ├── lcd.preset.ts
    │   │       └── ... (other presets)
    │   │
    │   ├── shaders/
    │   │   ├── shader.interface.ts          # IShader contract
    │   │   ├── shader-uniform.types.ts      # Uniform type definitions
    │   │   └── shader.registry.ts           # Shader registration
    │   │
    │   └── frame/
    │       ├── frame-buffer.interface.ts    # IFrameBuffer contract
    │       └── frame-source.interface.ts    # IFrameSource (video element, etc.)
    │
    ├── application/
    │   ├── pipeline.orchestrator.ts         # Coordinates rendering flow
    │   ├── capability-detector.ts           # WebGPU/WebGL2 detection
    │   └── preset-manager.ts                # Preset switching logic
    │
    ├── infrastructure/
    │   ├── webgpu/
    │   │   ├── webgpu-pipeline.ts           # IPipeline implementation
    │   │   ├── webgpu-frame-buffer.ts       # IFrameBuffer implementation
    │   │   ├── webgpu-shader-compiler.ts    # WGSL compilation
    │   │   └── shaders/                     # WGSL shader source files
    │   │       ├── vertex.wgsl
    │   │       ├── fragment-default.wgsl
    │   │       ├── fragment-crt.wgsl
    │   │       └── ...
    │   │
    │   ├── webgl2/
    │   │   ├── webgl2-pipeline.ts           # IPipeline implementation
    │   │   ├── webgl2-frame-buffer.ts       # IFrameBuffer implementation
    │   │   ├── webgl2-shader-compiler.ts    # GLSL compilation
    │   │   └── shaders/                     # GLSL shader source files
    │   │       ├── vertex.glsl
    │   │       ├── fragment-default.glsl
    │   │       ├── fragment-crt.glsl
    │   │       └── ...
    │   │
    │   ├── canvas2d/
    │   │   └── canvas2d-pipeline.ts         # Fallback implementation
    │   │
    │   └── workers/
    │       ├── render.worker.ts             # Off-main-thread rendering
    │       └── worker-pipeline.ts           # Worker communication
    │
    ├── factories/
    │   ├── pipeline.factory.ts              # Creates appropriate pipeline
    │   └── renderer.factory.ts              # High-level factory
    │
    └── index.ts                             # PUBLIC API ONLY
```

### Public API

```typescript
// ONLY these exports are visible to consumers
export {
  // Interfaces (for typing)
  type IPipeline,
  type IPreset,
  type IPipelineConfig,
  type IPipelineCapabilities,
  type IPipelineStats,
  type IFrameSource,

  // Factory (main entry point)
  createPipeline,

  // Preset registry (for UI to list available presets)
  PresetRegistry,

  // Capability detection (for UI to show GPU status)
  detectCapabilities,
} from './internal';
```

### Consumer Usage

```typescript
import { createPipeline, PresetRegistry, detectCapabilities } from '@prismgb/gpu';

// Detect what's available
const capabilities = await detectCapabilities();

// Create pipeline (factory chooses WebGPU/WebGL2/Canvas2D)
const pipeline = await createPipeline({
  canvas: canvasElement,
  frameSource: videoElement,
  preset: PresetRegistry.get('crt'),
});

// Render loop
pipeline.render();

// Switch preset
pipeline.setPreset(PresetRegistry.get('lcd'));

// Cleanup
pipeline.dispose();
```

### Key Principles

| Principle | Implementation |
|-----------|----------------|
| **Encapsulation** | Internal structure hidden; only `index.ts` exports are accessible |
| **Interface-driven** | `IPipeline` contract - implementations swappable |
| **Dependency inversion** | Consumer depends on abstractions, not WebGPU/WebGL2 details |
| **Independent testing** | Package has its own test suite, mocks frame sources |
| **Standalone** | No dependencies on prismgb-app's core/ |

---

## Preload (`prismgb-app/src/preload/`)

Secure bridge between main and renderer.

```
preload/
├── index.ts                                 # Entry point, contextBridge exposure
│
├── apis/
│   ├── device.api.ts                        # window.deviceAPI
│   ├── window.api.ts                        # window.windowAPI
│   ├── shell.api.ts                         # window.shellAPI
│   ├── update.api.ts                        # window.updateAPI
│   ├── transcode.api.ts                     # window.transcodeAPI
│   ├── metrics.api.ts                       # window.metricsAPI
│   └── gpu.api.ts                           # window.gpuAPI (if needed)
│
└── types/
    └── window.d.ts                          # Global window type augmentation
```

### API Pattern

```typescript
// apis/device.api.ts
import { ipcRenderer } from 'electron';
import { IPC_CHANNELS } from '@core/ipc/channels';
import type { DeviceStatus } from '@core/ipc/contracts/device-ipc.contract';

export const deviceAPI = {
  getDeviceStatus: (): Promise<DeviceStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.DEVICE.GET_STATUS),

  onDeviceConnected: (callback: (status: DeviceStatus) => void) => {
    const handler = (_: unknown, status: DeviceStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.DEVICE.CONNECTED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.DEVICE.CONNECTED, handler);
  },
};
```

### Type Augmentation

```typescript
// types/window.d.ts
import type { deviceAPI } from '../apis/device.api';
import type { windowAPI } from '../apis/window.api';

declare global {
  interface Window {
    deviceAPI: typeof deviceAPI;
    windowAPI: typeof windowAPI;
    shellAPI: typeof shellAPI;
    updateAPI: typeof updateAPI;
    transcodeAPI: typeof transcodeAPI;
    metricsAPI: typeof metricsAPI;
  }
}
```

---

## Dependency Injection & Wiring

### Container Setup Pattern

```typescript
// renderer/application/container.ts
import { IServiceContainer } from '@core/interfaces/infrastructure';
import { IDeviceService, ICaptureService } from '@core/interfaces/services';
import { IEventBus, ILoggerFactory } from '@core/interfaces/infrastructure';

// Infrastructure implementations
import { EventBus } from '../infrastructure/events/event-bus';
import { LoggerFactory } from '../infrastructure/logging/logger.factory';
import { DeviceService } from '../infrastructure/services/devices/device.service';

export function createContainer(): IServiceContainer {
  const container = new ServiceContainer();

  // Infrastructure (no dependencies)
  container.registerSingleton<IEventBus>('eventBus', EventBus);
  container.registerSingleton<ILoggerFactory>('loggerFactory', LoggerFactory);

  // Services (depend on infrastructure)
  container.registerSingleton<IDeviceService>('deviceService', DeviceService, [
    'eventBus',
    'loggerFactory'
  ]);

  // Orchestrators (depend on services via interfaces)
  container.registerSingleton('streamingOrchestrator', StreamingOrchestrator, [
    'eventBus',
    'loggerFactory',
    'deviceService',
    'settingsService',
    'pipelineFactory'
  ]);

  return container;
}
```

### GPU Package Integration

```typescript
import { createPipeline, detectCapabilities } from '@prismgb/gpu';

export async function createContainer(): Promise<IServiceContainer> {
  const container = new ServiceContainer();

  // Detect GPU capabilities early
  const gpuCapabilities = await detectCapabilities();
  container.registerValue('gpuCapabilities', gpuCapabilities);

  // Pipeline factory (lazy - created when streaming starts)
  container.registerFactory('pipelineFactory', (deps) => {
    return (canvas: HTMLCanvasElement, frameSource: HTMLVideoElement) =>
      createPipeline({
        canvas,
        frameSource,
        capabilities: deps.gpuCapabilities,
      });
  });

  return container;
}
```

### Layer Boundary Enforcement

```
application/           → imports from: core/interfaces/, @prismgb/gpu (public API only)
                       → NEVER imports from: infrastructure/

infrastructure/        → imports from: core/
                       → implements: core/interfaces/

presentation/          → imports from: core/interfaces/ (for types)
                       → receives: implementations via DI
                       → NEVER imports from: infrastructure/ directly
```

### TypeScript Path Aliases

```json
{
  "compilerOptions": {
    "paths": {
      "@core/*": ["src/core/*"],
      "@main/*": ["src/main/*"],
      "@renderer/*": ["src/renderer/*"],
      "@preload/*": ["src/preload/*"],
      "@prismgb/gpu": ["../prismgb-gpu/src"]
    }
  }
}
```

---

## TypeScript Configuration

### Shared Base Config (`tsconfig.base.json`)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "exactOptionalPropertyTypes": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  }
}
```

### Migration Strategy

| Phase | TypeScript Approach |
|-------|---------------------|
| **Phase 1: `core/`** | All new files in TS. Interfaces are naturally TypeScript. |
| **Phase 2: `@prismgb/gpu`** | Fresh package, 100% TypeScript from start. |
| **Phase 3-6: main/renderer** | Convert files as they move. Old location = JS, new location = TS. |

---

## Migration Plan

### Approach: Layer by Layer

Each phase is a separate PR with passing tests before and after.

| Phase | Scope | Risk | Rationale |
|-------|-------|------|-----------|
| **Phase 1** | Extract `core/` | Low | Foundation - interfaces, domain entities, IPC contracts |
| **Phase 2** | Extract `@prismgb/gpu` | Medium | Isolate GPU rendering as separate package |
| **Phase 3** | Restructure `main/` | Low | Simpler process, fewer files |
| **Phase 4** | Restructure `renderer/infrastructure/` | Medium | Services and adapters |
| **Phase 5** | Restructure `renderer/application/` | Medium | Orchestrators consolidated |
| **Phase 6** | Restructure `renderer/presentation/` | Medium | UI layer cleanup |

### Build Order

```
1. prismgb-gpu (no dependencies on other workspace packages)
      ↓
2. prismgb-app (depends on @prismgb/gpu)
      ↓
3. prismgb-site (independent)
```

---

## Complete Directory Structure

```
prismgb-workspace/
├── prismgb-app/
│   └── src/
│       ├── core/                            # Contracts & domain (shared)
│       │   ├── domain/                      # Entities (devices, transcode)
│       │   ├── interfaces/                  # All service/adapter contracts
│       │   ├── ipc/                         # IPC channels & typed contracts
│       │   ├── errors/                      # Error types
│       │   └── base/                        # BaseService, BaseOrchestrator
│       │
│       ├── main/                            # Main process
│       │   ├── application/                 # Orchestrator + container
│       │   ├── infrastructure/              # All implementations
│       │   │   ├── devices/
│       │   │   ├── transcode/
│       │   │   ├── updates/
│       │   │   ├── window/
│       │   │   ├── tray/
│       │   │   ├── platform/
│       │   │   ├── events/
│       │   │   └── logging/
│       │   └── ipc/                         # IPC handlers
│       │
│       ├── renderer/                        # Renderer process
│       │   ├── application/                 # Orchestrators + state + container
│       │   ├── infrastructure/              # All implementations
│       │   │   ├── services/                # Service implementations by domain
│       │   │   ├── adapters/                # Adapter implementations
│       │   │   ├── streaming/               # Acquisition logic
│       │   │   ├── events/
│       │   │   └── logging/
│       │   └── presentation/                # UI layer
│       │       ├── components/              # UI components by feature
│       │       ├── effects/                 # Visual effects
│       │       ├── primitives/              # Reusable UI behaviors
│       │       ├── shell/                   # App shell
│       │       ├── bridges/                 # EventBus ↔ UI
│       │       ├── controller/              # UIController
│       │       ├── config/                  # DOM selectors, CSS classes
│       │       └── styles/                  # All CSS
│       │
│       └── preload/                         # IPC bridge
│           ├── apis/                        # Typed API modules
│           └── types/                       # Window augmentation
│
└── prismgb-gpu/                             # GPU bounded context
    └── src/
        ├── domain/                          # Pipeline, presets, shaders, frames
        ├── application/                     # Pipeline orchestration
        ├── infrastructure/                  # WebGPU, WebGL2, Canvas2D, workers
        ├── factories/                       # Pipeline creation
        └── index.ts                         # Public API
```

---

## Next Steps

1. Review and approve this design
2. Create detailed implementation plan with file-level migration mapping
3. Set up workspace configuration (package.json, tsconfig)
4. Begin Phase 1: Extract `core/`
