# Comprehensive Naming & Organizational Standardization Plan

## Directory Structure: Before → After

### MAIN PROCESS

```
BEFORE                                      AFTER
─────────────────────────────────────────   ─────────────────────────────────────────
src/main/                                   src/main/
├── index.js                                ├── index.js
├── container.js                            ├── container.js
├── main-app.orchestrator.js      ✗ DEL     ├── app.orchestrator.js           ★ NEW
├── window-manager.js             ✗ DEL     │
├── tray-manager.js               ✗ DEL     ├── window/                        ★ NEW DIR
├── ipc-handlers.js               ✗ DEL     │   └── window.service.js          ★ NEW
│                                           │
├── ipc/                          ✗ DEL     ├── tray/                          ★ NEW DIR
│   ├── device-ipc.handlers.js    ✗ DEL     │   └── tray.service.js            ★ NEW
│   ├── update-ipc.handlers.js    ✗ DEL     │
│   ├── shell-ipc.handlers.js     ✗ DEL     ├── ipc/                           ★ NEW DIR
│   └── performance-ipc.handlers.js ✗ DEL   │   └── ipc-handler.registry.js    ★ NEW
│                                           │
├── services/                     ✗ DEL     ├── infrastructure/                ★ NEW DIR
│   ├── device-bridge.service.js  ✗ DEL     │   └── events/
│   └── update-bridge.service.js  ✗ DEL     │       ├── event-bus.js           ★ NEW
│                                           │       └── event-channels.js      ★ NEW
│                                           │
└── features/                               └── features/
    ├── devices/                                ├── devices/
    │   ├── device.service.main.js ✗ DEL        │   ├── device.service.js       ★ NEW
    │   ├── device-lifecycle.coordinator.js ✗   │   ├── device-lifecycle.service.js ★ NEW
    │   └── profile.registry.js                 │   ├── device.bridge.js        ★ MOVED
    │                                           │   ├── profile.registry.js
    │                                           │   └── ipc/                    ★ NEW DIR
    │                                           │       └── device-ipc.handler.js ★ MOVED
    │                                           │
    └── updates/                                ├── updates/
        └── update.service.main.js ✗ DEL        │   ├── update.service.js       ★ NEW
                                                │   ├── update.bridge.js        ★ MOVED
                                                │   └── ipc/                    ★ NEW DIR
                                                │       └── update-ipc.handler.js ★ MOVED
                                                │
                                                ├── performance/               ★ NEW DIR
                                                │   └── ipc/
                                                │       └── performance-ipc.handler.js ★ MOVED
                                                │
                                                └── shell/                     ★ NEW DIR
                                                    └── ipc/
                                                        └── shell-ipc.handler.js ★ MOVED
```

### RENDERER PROCESS (Changes Only)

```
BEFORE                                      AFTER
─────────────────────────────────────────   ─────────────────────────────────────────
src/renderer/
├── ui/
│   ├── components/
│   │   ├── device-status.js      ✗ DEL     │   │   ├── device-status.component.js    ★ NEW
│   │   └── status-notification.js ✗ DEL    │   │   └── status-notification.component.js ★ NEW
│   │
│   └── orchestration/
│       └── ui-event-bridge.js    ✗ DEL         └── orchestration/
│                                                   └── ui-event.bridge.js     ★ NEW
│
├── features/
│   ├── devices/
│   │   ├── services/
│   │   │   └── device-status.adapter.js ✗ DEL
│   │   └── adapters/
│   │       └── device-status.adapter.js        ★ MOVED
│   │
│   ├── streaming/
│   │   └── ui/
│   │       ├── stream-controls.js ✗ DEL            ├── stream-controls.component.js ★ NEW
│   │       └── shader-selector.js ✗ DEL            └── shader-selector.component.js ★ NEW
│   │
│   ├── settings/
│   │   └── ui/
│   │       └── settings-menu.js  ✗ DEL                 └── settings-menu.component.js ★ NEW
│   │
│   └── updates/
│       └── ui/
│           └── update-ui.service.js              └── update-ui.service.js    ★ MODIFIED (extends BaseService)
```

### INFRASTRUCTURE (Changes Only)

```
BEFORE                                      AFTER
─────────────────────────────────────────   ─────────────────────────────────────────
src/infrastructure/
└── events/
    └── event-bus.js (default export)       └── event-bus.js (named export)  ★ MODIFIED
```

### SHARED (No Changes)

```
src/shared/                                 src/shared/
├── base/                                   ├── base/
│   ├── service.js               ✓ OK       │   ├── service.js
│   ├── orchestrator.js          ✓ OK       │   ├── orchestrator.js
│   ├── validate-deps.js         ✓ OK       │   ├── validate-deps.js
│   └── dom-listener.js          ✓ OK       │   └── dom-listener.js
├── config/                      ✓ OK       ├── config/
├── interfaces/                  ✓ OK       ├── interfaces/
├── utils/                       ✓ OK       ├── utils/
├── features/devices/            ✓ OK       ├── features/devices/
├── streaming/acquisition/       ✓ OK       ├── streaming/acquisition/
└── lib/                         ✓ OK       └── lib/
```

### PRELOAD (Optional Change)

```
BEFORE                                      AFTER
─────────────────────────────────────────   ─────────────────────────────────────────
src/preload/
└── index.js (mixed require/import)         └── index.js (ES modules only)   ★ OPTIONAL
```

---

## Summary of Directory Changes

| Type | Count | Details |
|------|-------|---------|
| **New directories** | 10 | window/, tray/, ipc/, infrastructure/events/, devices/ipc/, updates/ipc/, performance/, performance/ipc/, shell/, shell/ipc/ |
| **Deleted directories** | 2 | main/services/, main/ipc/ |
| **Files moved** | 7 | 2 bridges + 4 IPC handlers + 1 adapter |
| **Files renamed** | 11 | 6 main + 5 renderer components |
| **Files modified** | 8 | Base class extensions + export changes |
| **New files** | 2 | main/infrastructure/events/* |

---

## Audit Summary

| Process | Total Files | Files with Issues | Issues |
|---------|-------------|-------------------|--------|
| Main | 16 | 7 | Base class, naming, exports |
| Renderer | 61 | 8 | Component suffix, base class, naming |
| Shared | 27 | 1 | Export pattern |
| Infrastructure | 8 | 1 | Export pattern |
| Preload | 1 | 1 | Import syntax |
| **Total** | **113** | **18** | |

---

## Standards to Enforce

### File Naming
- **Format**: `kebab-case` with `.type.js` suffix
- **Suffixes**: `.service.js`, `.orchestrator.js`, `.adapter.js`, `.registry.js`, `.bridge.js`, `.handler.js`, `.component.js`, `.factory.js`, `.renderer.js`, `.monitor.js`, `.manager.js` (utility only), `.state.js`, `.worker.js`, `.protocol.js`, `.presets.js`, `.config.js`, `.context.js`, `.utils.js`, `.controller.js`

### Class Naming
- **PascalCase** for all classes
- **I-prefix** for interfaces (e.g., `IDeviceAdapter`)
- **No process suffix** (use directory for disambiguation, not `ServiceMain`)

### Export Pattern
- **Named exports** for all classes/functions
- **No default exports** (convert existing)

### Base Class Rules
| Type | Must Extend |
|------|-------------|
| Business logic services | `BaseService` |
| Orchestrators/Coordinators | `BaseOrchestrator` |
| Bridges | `BaseService` |
| Adapters | Interface or nothing |
| Utilities/Managers | Nothing |
| Components | Nothing |

---

## Documented Exceptions

### Bootstrap Orchestrators
`AppOrchestrator` (main), `RendererAppOrchestrator`, and `AppOrchestrator` (renderer) do NOT extend `BaseOrchestrator`. These are bootstrap-level orchestrators that initialize the DI container and wire up dependencies before the base class infrastructure is available.

### Main Process Infrastructure
The main process has its own copy of EventBus infrastructure at `src/main/infrastructure/events/`. This duplication is intentional because:
1. Main process has different Node.js vs browser runtime requirements
2. Allows independent evolution of main vs renderer event systems
3. Avoids complex shared-module bundling between Electron processes

### UI-Facing Services
Services that coordinate UI updates (like `update-ui.service.js` and `stream-view.service.js`) belong in `services/` subdirectories, not `ui/` directories. The `ui/` directory is reserved for components only. This follows the principle that all services belong in `services/` regardless of whether they interact with UI components.

---

## Complete File Inventory

### MAIN PROCESS (16 files)

#### Root Level (6 files)

```
FILE: src/main/index.js
Status: ✓ OK
Pattern: Entry point, procedural
Changes: None

FILE: src/main/container.js
Status: ✓ OK
Pattern: Factory function, named export
Changes: Update imports after renames

FILE: src/main/main-app.orchestrator.js
Status: ⚠ NEEDS CHANGES
Pattern: PascalCase class, default export, NO base class
Issues:
  - Should extend BaseOrchestrator
  - Uses default export
  - Named "MainAppOrchestrator" (verbose)
Changes:
  - Rename file: main-app.orchestrator.js → app.orchestrator.js
  - Rename class: MainAppOrchestrator → AppOrchestrator
  - Extend BaseOrchestrator
  - Convert initialize() → onInitialize()
  - Convert cleanup() → onCleanup()
  - Convert to named export

FILE: src/main/window-manager.js
Status: ⚠ NEEDS CHANGES
Pattern: PascalCase class, default export, NO base class
Issues:
  - Should extend BaseService
  - Uses default export
  - Named *Manager instead of *Service
Changes:
  - Rename file: window-manager.js → window/window.service.js
  - Rename class: WindowManager → WindowService
  - Extend BaseService
  - Convert to named export

FILE: src/main/tray-manager.js
Status: ⚠ NEEDS CHANGES
Pattern: PascalCase class, default export, NO base class
Issues:
  - Should extend BaseService
  - Uses default export
  - Named *Manager instead of *Service
Changes:
  - Rename file: tray-manager.js → tray/tray.service.js
  - Rename class: TrayManager → TrayService
  - Extend BaseService
  - Convert to named export

FILE: src/main/ipc-handlers.js
Status: ⚠ NEEDS CHANGES
Pattern: PascalCase class, default export, NO base class
Issues:
  - Should extend BaseService
  - Uses default export
  - Class coordinates handlers but named "Handlers"
Changes:
  - Rename file: ipc-handlers.js → ipc/ipc-handler.registry.js
  - Rename class: IpcHandlers → IpcHandlerRegistry
  - Extend BaseService
  - Convert to named export
```

#### Features/Devices (3 files)

```
FILE: src/main/features/devices/device.service.main.js
Status: ⚠ NEEDS CHANGES
Pattern: PascalCase class, default export, extends EventEmitter
Issues:
  - Should extend BaseService (not EventEmitter)
  - Uses default export
  - ".service.main.js" suffix is non-standard
  - Class named DeviceServiceMain (process suffix)
Changes:
  - Rename file: device.service.main.js → device.service.js
  - Rename class: DeviceServiceMain → DeviceService
  - Extend BaseService instead of EventEmitter
  - Replace this.emit() → this.eventBus.publish()
  - Convert to named export

FILE: src/main/features/devices/device-lifecycle.coordinator.js
Status: ✓ OK (minor rename)
Pattern: PascalCase class, named export, extends BaseService
Issues:
  - ".coordinator.js" suffix could be ".service.js" for consistency
Changes:
  - Rename file: device-lifecycle.coordinator.js → device-lifecycle.service.js
  - Rename class: DeviceLifecycleCoordinator → DeviceLifecycleService

FILE: src/main/features/devices/profile.registry.js
Status: ⚠ NEEDS CHANGES
Pattern: PascalCase class, default export, NO base class
Issues:
  - Uses default export
Changes:
  - Convert to named export
  - (Keep no base class - registry pattern is correct)
```

#### Features/Updates (1 file)

```
FILE: src/main/features/updates/update.service.main.js
Status: ⚠ NEEDS CHANGES
Pattern: PascalCase class, default export, extends EventEmitter
Issues:
  - Should extend BaseService (not EventEmitter)
  - Uses default export
  - ".service.main.js" suffix is non-standard
  - Class named UpdateServiceMain (process suffix)
  - Exports UpdateState enum alongside class
Changes:
  - Rename file: update.service.main.js → update.service.js
  - Rename class: UpdateServiceMain → UpdateService
  - Extend BaseService instead of EventEmitter
  - Replace this.emit() → this.eventBus.publish()
  - Convert to named export
  - Keep UpdateState as separate named export
```

#### Services (2 files) - TO BE MOVED

```
FILE: src/main/services/device-bridge.service.js
Status: ✓ OK (needs move)
Pattern: PascalCase class, named export, extends BaseService
Issues:
  - Misplaced: should be in features/devices/
Changes:
  - Move to: src/main/features/devices/device.bridge.js

FILE: src/main/services/update-bridge.service.js
Status: ✓ OK (needs move)
Pattern: PascalCase class, named export, extends BaseService
Issues:
  - Misplaced: should be in features/updates/
Changes:
  - Move to: src/main/features/updates/update.bridge.js
```

#### IPC Handlers (4 files) - TO BE MOVED

```
FILE: src/main/ipc/device-ipc.handlers.js
Status: ✓ OK (needs move)
Pattern: camelCase function, named export
Issues:
  - Misplaced: should be colocated with feature
Changes:
  - Move to: src/main/features/devices/ipc/device-ipc.handler.js
  - Consider converting to service class for consistency

FILE: src/main/ipc/update-ipc.handlers.js
Status: ✓ OK (needs move)
Pattern: camelCase function, named export
Changes:
  - Move to: src/main/features/updates/ipc/update-ipc.handler.js

FILE: src/main/ipc/shell-ipc.handlers.js
Status: ✓ OK (needs move)
Pattern: camelCase function, named export
Changes:
  - Move to: src/main/features/shell/ipc/shell-ipc.handler.js

FILE: src/main/ipc/performance-ipc.handlers.js
Status: ✓ OK (needs move)
Pattern: camelCase function, named export
Changes:
  - Move to: src/main/features/performance/ipc/performance-ipc.handler.js
```

---

### RENDERER PROCESS (61 files)

#### Root Level (3 files)

```
FILE: src/renderer/index.js
Status: ✓ OK
Changes: None

FILE: src/renderer/index.html
Status: ✓ OK
Changes: None

FILE: src/renderer/container.js
Status: ✓ OK
Changes: Update imports after renames

FILE: src/renderer/renderer-app.orchestrator.js
Status: ✓ OK
Pattern: PascalCase class, extends nothing (root orchestrator)
Changes: None
```

#### Application Layer (8 files)

```
FILE: src/renderer/application/app.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/application/app.state.js
Status: ✓ OK
Changes: None

FILE: src/renderer/application/adapters/metrics.adapter.js
Status: ✓ OK
Changes: None

FILE: src/renderer/application/performance/animation-performance.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/application/performance/animation-performance.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/application/performance/performance-metrics.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/application/performance/performance-metrics.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/application/performance/performance-state.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/application/performance/performance-state.service.js
Status: ✓ OK - extends BaseService
Changes: None
```

#### Features/Capture (3 files)

```
FILE: src/renderer/features/capture/services/capture.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/features/capture/services/capture.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/capture/services/gpu-recording.service.js
Status: ✓ OK - extends BaseService
Changes: None
```

#### Features/Devices (10 files)

```
FILE: src/renderer/features/devices/services/device.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/features/devices/services/device.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/devices/services/device-connection.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/devices/services/device-media.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/devices/services/device-storage.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/devices/services/device-status.adapter.js
Status: ⚠ NEEDS MOVE
Issues: Adapter in services/ directory
Changes:
  - Move to: src/renderer/features/devices/adapters/device-status.adapter.js

FILE: src/renderer/features/devices/adapters/base.adapter.js
Status: ✓ OK - extends IDeviceAdapter
Changes: None

FILE: src/renderer/features/devices/adapters/device-ipc.adapter.js
Status: ✓ OK
Changes: None

FILE: src/renderer/features/devices/adapters/chromatic/chromatic.adapter.js
Status: ✓ OK - extends BaseDeviceAdapter
Changes: None
```

#### Features/Settings (6 files)

```
FILE: src/renderer/features/settings/services/display-mode.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/features/settings/services/preferences.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/features/settings/services/settings.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/settings/services/fullscreen.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/settings/services/cinematic-mode.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/settings/ui/settings-menu.js
Status: ⚠ NEEDS RENAME
Issues: Missing .component.js suffix
Changes:
  - Rename: settings-menu.js → settings-menu.component.js
```

#### Features/Streaming (18 files)

```
FILE: src/renderer/features/streaming/services/streaming.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/features/streaming/services/streaming.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/streaming/audio/audio-warmup.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/streaming/factories/adapter.factory.js
Status: ✓ OK
Changes: None

FILE: src/renderer/features/streaming/rendering/render-pipeline.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/streaming/rendering/canvas-lifecycle.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/streaming/rendering/gpu-render-loop.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/streaming/rendering/canvas.renderer.js
Status: ✓ OK (utility, no base class)
Changes: None

FILE: src/renderer/features/streaming/rendering/viewport.manager.js
Status: ✓ OK (utility, no base class)
Changes: None

FILE: src/renderer/features/streaming/rendering/stream-health.monitor.js
Status: ✓ OK (utility, no base class)
Changes: None

FILE: src/renderer/features/streaming/rendering/presets/render.presets.js
Status: ✓ OK
Changes: None

FILE: src/renderer/features/streaming/rendering/gpu/gpu.renderer.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/streaming/rendering/gpu/capability.detector.js
Status: ✓ OK
Changes: None

FILE: src/renderer/features/streaming/rendering/workers/render.worker.js
Status: ✓ OK
Changes: None

FILE: src/renderer/features/streaming/rendering/workers/worker.protocol.js
Status: ✓ OK
Changes: None

FILE: src/renderer/features/streaming/rendering/workers/optimization-utils.js
Status: ✓ OK
Changes: None

FILE: src/renderer/features/streaming/ui/stream-view.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/streaming/ui/stream-controls.js
Status: ⚠ NEEDS RENAME
Issues: Missing .component.js suffix
Changes:
  - Rename: stream-controls.js → stream-controls.component.js

FILE: src/renderer/features/streaming/ui/shader-selector.js
Status: ⚠ NEEDS RENAME
Issues: Missing .component.js suffix
Changes:
  - Rename: shader-selector.js → shader-selector.component.js
```

#### Features/Updates (4 files)

```
FILE: src/renderer/features/updates/services/update.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/features/updates/services/update.service.js
Status: ✓ OK - extends BaseService
Changes: None

FILE: src/renderer/features/updates/ui/update-ui.service.js
Status: ⚠ NEEDS CHANGES
Issues: Should extend BaseService
Changes:
  - Extend BaseService
  - Add constructor dependency validation

FILE: src/renderer/features/updates/ui/update-section.component.js
Status: ✓ OK
Changes: None
```

#### Infrastructure/Adapters (3 files)

```
FILE: src/renderer/infrastructure/adapters/visibility.adapter.js
Status: ✓ OK
Changes: None

FILE: src/renderer/infrastructure/adapters/user-activity.adapter.js
Status: ✓ OK
Changes: None

FILE: src/renderer/infrastructure/adapters/reduced-motion.adapter.js
Status: ✓ OK
Changes: None
```

#### UI Layer (9 files)

```
FILE: src/renderer/ui/components/device-status.js
Status: ⚠ NEEDS RENAME
Issues: Missing .component.js suffix
Changes:
  - Rename: device-status.js → device-status.component.js

FILE: src/renderer/ui/components/status-notification.js
Status: ⚠ NEEDS RENAME
Issues: Missing .component.js suffix
Changes:
  - Rename: status-notification.js → status-notification.component.js

FILE: src/renderer/ui/controller/ui.controller.js
Status: ✓ OK (renamed from controller.js)
Changes: None

FILE: src/renderer/ui/controller/component.factory.js
Status: ✓ OK
Changes: None

FILE: src/renderer/ui/controller/component.registry.js
Status: ✓ OK
Changes: None

FILE: src/renderer/ui/effects/ui-effects.service.js
Status: ✓ OK (renamed from ui-effects.js)
Changes: None

FILE: src/renderer/ui/effects/body-class.manager.js
Status: ✓ OK
Changes: None

FILE: src/renderer/ui/orchestration/ui-setup.orchestrator.js
Status: ✓ OK - extends BaseOrchestrator
Changes: None

FILE: src/renderer/ui/orchestration/capture-ui.bridge.js
Status: ✓ OK
Changes: None

FILE: src/renderer/ui/orchestration/ui-event-bridge.js
Status: ⚠ NEEDS RENAME
Issues: Extends BaseService but named as bridge without .bridge.js suffix
Changes:
  - Rename: ui-event-bridge.js → ui-event.bridge.js
```

#### Lib (1 file)

```
FILE: src/renderer/lib/file-download.utils.js
Status: ✓ OK (renamed from file-download.js)
Changes: None
```

---

### SHARED (27 files)

#### Base Classes (4 files)

```
FILE: src/shared/base/service.js
Status: ✓ OK
Changes: None

FILE: src/shared/base/orchestrator.js
Status: ✓ OK
Changes: None

FILE: src/shared/base/validate-deps.js
Status: ✓ OK
Changes: None

FILE: src/shared/base/dom-listener.js
Status: ✓ OK
Changes: None
```

#### Config (4 files)

```
FILE: src/shared/config/config-loader.js
Status: ✓ OK
Changes: None

FILE: src/shared/config/constants.js
Status: ✓ OK
Changes: None

FILE: src/shared/config/dom-selectors.js
Status: ✓ OK
Changes: None

FILE: src/shared/config/css-classes.js
Status: ✓ OK
Changes: None
```

#### Interfaces (3 files)

```
FILE: src/shared/interfaces/device-adapter.interface.js
Status: ✓ OK - I-prefix
Changes: None

FILE: src/shared/interfaces/device-status-provider.interface.js
Status: ✓ OK - I-prefix
Changes: None

FILE: src/shared/interfaces/fallback-strategy.interface.js
Status: ✓ OK - I-prefix
Changes: None
```

#### Utils (3 files)

```
FILE: src/shared/utils/filename-generator.js
Status: ✓ OK
Changes: None

FILE: src/shared/utils/formatters.js
Status: ✓ OK
Changes: None

FILE: src/shared/utils/performance-cache.js
Status: ✓ OK
Changes: None
```

#### Features/Devices (6 files)

```
FILE: src/shared/features/devices/device-detection.js
Status: ✓ OK
Changes: None

FILE: src/shared/features/devices/device-iterator.js
Status: ✓ OK
Changes: None

FILE: src/shared/features/devices/device-profile.js
Status: ✓ OK
Changes: None

FILE: src/shared/features/devices/device-registry.js
Status: ✓ OK
Changes: None

FILE: src/shared/features/devices/profiles/chromatic/chromatic.config.js
Status: ✓ OK
Changes: None

FILE: src/shared/features/devices/profiles/chromatic/chromatic.profile.js
Status: ✓ OK
Changes: None
```

#### Streaming/Acquisition (6 files)

```
FILE: src/shared/streaming/acquisition/acquisition.context.js
Status: ✓ OK
Changes: None

FILE: src/shared/streaming/acquisition/acquisition.coordinator.js
Status: ✓ OK
Changes: None

FILE: src/shared/streaming/acquisition/constraint.builder.js
Status: ✓ OK
Changes: None

FILE: src/shared/streaming/acquisition/fallback.strategy.js
Status: ✓ OK
Changes: None

FILE: src/shared/streaming/acquisition/interfaces.js
Status: ✓ OK
Changes: None

FILE: src/shared/streaming/acquisition/stream.lifecycle.js
Status: ✓ OK
Changes: None
```

#### Lib (1 file)

```
FILE: src/shared/lib/errors.js
Status: ✓ OK
Changes: None
```

---

### INFRASTRUCTURE (8 files)

```
FILE: src/infrastructure/di/service-container.js
Status: ✓ OK
Changes: None

FILE: src/infrastructure/events/event-bus.js
Status: ⚠ NEEDS CHANGES
Issues: Uses default export
Changes:
  - Convert to named export

FILE: src/infrastructure/events/event-channels.js
Status: ✓ OK
Changes: None

FILE: src/infrastructure/ipc/channels.js
Status: ✓ OK
Changes: None

FILE: src/infrastructure/ipc/channels.json
Status: ✓ OK
Changes: None

FILE: src/infrastructure/logging/logger.js
Status: ✓ OK
Changes: None

FILE: src/infrastructure/logging/main-logger.js
Status: ✓ OK
Changes: None

FILE: src/infrastructure/browser/browser-media.service.js
Status: ✓ OK
Changes: None

FILE: src/infrastructure/browser/storage.service.js
Status: ✓ OK
Changes: None
```

---

### PRELOAD (1 file)

```
FILE: src/preload/index.js
Status: ⚠ MINOR
Issues: Mixes require() and import() syntax
Changes:
  - Standardize to ES modules (replace require with import)
```

---

## Implementation Plan

### Phase 1: Infrastructure Setup
**Create EventBus for main process + new directories**

| Action | Path |
|--------|------|
| Create | `src/main/infrastructure/events/event-bus.js` (copy from renderer) |
| Create | `src/main/infrastructure/events/event-channels.js` |
| Create dir | `src/main/window/` |
| Create dir | `src/main/tray/` |
| Create dir | `src/main/features/devices/ipc/` |
| Create dir | `src/main/features/updates/ipc/` |
| Create dir | `src/main/features/performance/ipc/` |
| Create dir | `src/main/features/shell/ipc/` |

### Phase 2: Renderer Component Renames (5 files)
**Low risk - simple renames**

| Current | New |
|---------|-----|
| `src/renderer/ui/components/device-status.js` | `device-status.component.js` |
| `src/renderer/ui/components/status-notification.js` | `status-notification.component.js` |
| `src/renderer/features/streaming/ui/stream-controls.js` | `stream-controls.component.js` |
| `src/renderer/features/streaming/ui/shader-selector.js` | `shader-selector.component.js` |
| `src/renderer/features/settings/ui/settings-menu.js` | `settings-menu.component.js` |

### Phase 3: Renderer Fixes (3 files)
**Move adapter + fix base class + rename bridge**

| Current | Action |
|---------|--------|
| `src/renderer/features/devices/services/device-status.adapter.js` | Move to `adapters/` |
| `src/renderer/features/updates/ui/update-ui.service.js` | Extend BaseService |
| `src/renderer/ui/orchestration/ui-event-bridge.js` | Rename to `ui-event.bridge.js` |

### Phase 4: Infrastructure Export Fix (1 file)
**Convert EventBus to named export**

| File | Change |
|------|--------|
| `src/infrastructure/events/event-bus.js` | `export default` → `export { EventBus }` |

### Phase 5: Main IPC Handler Migration (4 files)
**Move IPC handlers to feature directories**

| Current | New |
|---------|-----|
| `src/main/ipc/device-ipc.handlers.js` | `src/main/features/devices/ipc/device-ipc.handler.js` |
| `src/main/ipc/update-ipc.handlers.js` | `src/main/features/updates/ipc/update-ipc.handler.js` |
| `src/main/ipc/performance-ipc.handlers.js` | `src/main/features/performance/ipc/performance-ipc.handler.js` |
| `src/main/ipc/shell-ipc.handlers.js` | `src/main/features/shell/ipc/shell-ipc.handler.js` |

### Phase 6: Main Bridge Service Migration (2 files)
**Move bridge services to feature directories**

| Current | New |
|---------|-----|
| `src/main/services/device-bridge.service.js` | `src/main/features/devices/device.bridge.js` |
| `src/main/services/update-bridge.service.js` | `src/main/features/updates/update.bridge.js` |

### Phase 7: Main Core Services (4 files)
**Rename + extend BaseService + convert exports**

| File | Changes |
|------|---------|
| `device.service.main.js` | Rename to `device.service.js`, class to `DeviceService`, extend BaseService, use EventBus |
| `update.service.main.js` | Rename to `update.service.js`, class to `UpdateService`, extend BaseService, use EventBus |
| `device-lifecycle.coordinator.js` | Rename to `device-lifecycle.service.js`, class to `DeviceLifecycleService` |
| `profile.registry.js` | Convert to named export |

### Phase 8: Main Managers → Services (3 files)
**Rename managers + extend BaseService**

| Current | New |
|---------|-----|
| `window-manager.js` | `window/window.service.js` (WindowService) |
| `tray-manager.js` | `tray/tray.service.js` (TrayService) |
| `ipc-handlers.js` | `ipc/ipc-handler.registry.js` (IpcHandlerRegistry) |

### Phase 9: Main Orchestrator (1 file)
**Standardize main orchestrator**

| Current | New |
|---------|-----|
| `main-app.orchestrator.js` | `app.orchestrator.js` (AppOrchestrator extends BaseOrchestrator) |

### Phase 10: Container Updates (2 files)
**Update all imports**

| File | Changes |
|------|---------|
| `src/main/container.js` | Update all imports to new paths |
| `src/renderer/container.js` | Update imports for moved/renamed files |

### Phase 11: Cleanup
**Delete empty directories**

| Delete |
|--------|
| `src/main/services/` |
| `src/main/ipc/` |

### Phase 12: Preload (Optional)
**Standardize import syntax**

| File | Change |
|------|--------|
| `src/preload/index.js` | Replace `require()` with `import` |

---

## Summary of All Changes

### Files to Rename (15)
1. `src/main/main-app.orchestrator.js` → `app.orchestrator.js`
2. `src/main/window-manager.js` → `window/window.service.js`
3. `src/main/tray-manager.js` → `tray/tray.service.js`
4. `src/main/ipc-handlers.js` → `ipc/ipc-handler.registry.js`
5. `src/main/features/devices/device.service.main.js` → `device.service.js`
6. `src/main/features/devices/device-lifecycle.coordinator.js` → `device-lifecycle.service.js`
7. `src/main/features/updates/update.service.main.js` → `update.service.js`
8. `src/renderer/ui/components/device-status.js` → `device-status.component.js`
9. `src/renderer/ui/components/status-notification.js` → `status-notification.component.js`
10. `src/renderer/features/streaming/ui/stream-controls.js` → `stream-controls.component.js`
11. `src/renderer/features/streaming/ui/shader-selector.js` → `shader-selector.component.js`
12. `src/renderer/features/settings/ui/settings-menu.js` → `settings-menu.component.js`
13. `src/renderer/ui/orchestration/ui-event-bridge.js` → `ui-event.bridge.js`
14. `src/main/ipc/*.handlers.js` → `features/*/ipc/*-ipc.handler.js` (4 files)

### Files to Move (3)
1. `src/main/services/device-bridge.service.js` → `features/devices/device.bridge.js`
2. `src/main/services/update-bridge.service.js` → `features/updates/update.bridge.js`
3. `src/renderer/features/devices/services/device-status.adapter.js` → `adapters/`

### Classes to Extend BaseService (5)
1. `WindowManager` → `WindowService extends BaseService`
2. `TrayManager` → `TrayService extends BaseService`
3. `IpcHandlers` → `IpcHandlerRegistry extends BaseService`
4. `DeviceServiceMain` → `DeviceService extends BaseService`
5. `UpdateServiceMain` → `UpdateService extends BaseService`

### Classes to Extend BaseOrchestrator (1)
1. `MainAppOrchestrator` → `AppOrchestrator extends BaseOrchestrator`

### Export Pattern Fixes (8)
All default exports → named exports in main process

### New Infrastructure (2 files)
1. `src/main/infrastructure/events/event-bus.js`
2. `src/main/infrastructure/events/event-channels.js`

### Directories to Create (6)
1. `src/main/window/`
2. `src/main/tray/`
3. `src/main/features/devices/ipc/`
4. `src/main/features/updates/ipc/`
5. `src/main/features/performance/ipc/`
6. `src/main/features/shell/ipc/`

### Directories to Delete (2)
1. `src/main/services/`
2. `src/main/ipc/`

---

## Validation

After each phase:
- [ ] `npm run lint` passes
- [ ] `npm run test:run` passes
- [ ] `npm run dev` starts
- [ ] Device detection works
- [ ] IPC communication works
- [ ] Tray menu functions
