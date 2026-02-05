# Renderer Restructure Design (Phases 4-6)

## Overview

Restructure the renderer process from feature-based organization to Clean Architecture with strict layer separation. This eliminates the `features/` directory and organizes all code into three layers: `application/`, `infrastructure/`, and `presentation/`.

### Goals

| Goal | Solution |
|------|----------|
| **Eliminate features/ directory** | Split into application (orchestration) and infrastructure (implementation) |
| **Consistent naming** | Match Clean Architecture conventions across main and renderer |
| **Predictable file locations** | Orchestrators in application/, services in infrastructure/, UI in presentation/ |
| **Absorb shared/ renderer-only code** | Move renderer-only config/utils from shared/ into appropriate layers |

### Phase Summary

| Phase | Scope | Risk | Files Moved |
|-------|-------|------|-------------|
| **Phase 4** | Infrastructure (services, adapters, factories) | Medium | ~45 |
| **Phase 5** | Application (orchestrators, state, container) | Low | ~15 |
| **Phase 6** | Presentation (UI rename + consolidation) | Medium | ~40 |

---

## Phase 4: Infrastructure Layer

Move all service implementations, adapters, factories, and streaming acquisition into `renderer/infrastructure/`.

### Target Structure

```
infrastructure/
├── services/
│   ├── streaming/
│   │   ├── streaming.service.ts
│   │   ├── streaming-view.service.ts
│   │   ├── audio-pipeline.service.ts
│   │   ├── render-pipeline.service.ts
│   │   ├── canvas-renderer.ts
│   │   ├── canvas-lifecycle.service.ts
│   │   ├── viewport.service.ts
│   │   ├── health.service.ts
│   │   ├── gpu-render-loop.service.ts
│   │   ├── gpu-renderer.service.ts
│   │   ├── gpu-frame-buffer.ts
│   │   ├── gpu-worker-manager.ts
│   │   └── index.ts
│   │
│   ├── capture/
│   │   ├── capture.service.ts
│   │   ├── capture-save.service.ts
│   │   ├── gpu-recording.service.ts
│   │   └── index.ts
│   │
│   ├── devices/
│   │   ├── device.service.ts
│   │   ├── device-connection.service.ts
│   │   ├── device-media.service.ts
│   │   ├── device-storage.service.ts
│   │   ├── device-operation-sequencer.service.ts
│   │   └── index.ts
│   │
│   ├── settings/
│   │   ├── settings.service.ts
│   │   ├── fullscreen.service.ts
│   │   ├── cinematic-mode.service.ts
│   │   ├── presentation-mode.service.ts
│   │   └── index.ts
│   │
│   ├── transcode/
│   │   └── transcode.service.ts
│   │
│   ├── updates/
│   │   ├── update.service.ts
│   │   ├── update-ui.service.ts
│   │   └── index.ts
│   │
│   ├── notes/
│   │   └── notes.service.ts
│   │
│   └── performance/
│       ├── performance-animation.service.ts
│       ├── performance-metrics.service.ts
│       ├── performance-state.service.ts
│       └── index.ts
│
├── adapters/
│   ├── devices/
│   │   ├── device-base.adapter.ts
│   │   ├── device-ipc.adapter.ts
│   │   ├── device-ipc-status.adapter.ts
│   │   ├── device-change-debounce.adapter.ts
│   │   ├── chromatic/
│   │   │   └── chromatic.adapter.ts
│   │   └── index.ts
│   │
│   ├── streaming/
│   │   ├── gpu-renderer.adapter.ts
│   │   ├── canvas2d-renderer.adapter.ts
│   │   ├── streaming-renderer.interface.ts
│   │   └── index.ts
│   │
│   ├── browser/
│   │   ├── media.adapter.ts
│   │   └── storage.adapter.ts
│   │
│   └── platform/
│       ├── visibility.adapter.ts
│       ├── reduced-motion.adapter.ts
│       ├── user-activity.adapter.ts
│       ├── metrics.adapter.ts
│       └── index.ts
│
├── streaming/
│   └── acquisition/
│       ├── acquisition-context.ts
│       ├── acquisition.orchestrator.ts
│       ├── constraint-builder.ts
│       ├── fallback-strategy.ts
│       ├── stream-lifecycle.base.ts
│       └── index.ts
│
├── factories/
│   ├── streaming-adapter.factory.ts
│   ├── streaming-renderer.factory.ts
│   └── index.ts
│
├── rendering/
│   ├── presets/
│   │   └── render-presets.config.ts
│   ├── shaders/ (existing WGSL/GLSL files)
│   ├── workers/
│   │   ├── render.worker.ts
│   │   ├── worker-protocol.config.ts
│   │   └── optimization.utils.ts
│   └── capability-detector.utils.ts
│
├── events/ (existing, no changes)
├── di/ (existing, no changes)
└── logging/ (existing, no changes)
```

### File Migration Map

| Current Location | New Location |
|-----------------|--------------|
| `features/streaming/services/streaming.service.js` | `infrastructure/services/streaming/streaming.service.ts` |
| `features/streaming/services/streaming-view.service.js` | `infrastructure/services/streaming/streaming-view.service.ts` |
| `features/streaming/audio/streaming-audio-pipeline.service.js` | `infrastructure/services/streaming/audio-pipeline.service.ts` |
| `features/streaming/rendering/streaming-render-pipeline.service.js` | `infrastructure/services/streaming/render-pipeline.service.ts` |
| `features/streaming/rendering/streaming-canvas-renderer.class.js` | `infrastructure/services/streaming/canvas-renderer.ts` |
| `features/streaming/rendering/streaming-canvas-lifecycle.service.js` | `infrastructure/services/streaming/canvas-lifecycle.service.ts` |
| `features/streaming/rendering/streaming-viewport.service.js` | `infrastructure/services/streaming/viewport.service.ts` |
| `features/streaming/rendering/streaming-health.service.js` | `infrastructure/services/streaming/health.service.ts` |
| `features/streaming/rendering/streaming-gpu-render-loop.service.js` | `infrastructure/services/streaming/gpu-render-loop.service.ts` |
| `features/streaming/rendering/gpu/streaming-gpu-renderer.service.js` | `infrastructure/services/streaming/gpu-renderer.service.ts` |
| `features/streaming/rendering/gpu/managers/gpu-frame-buffer.class.js` | `infrastructure/services/streaming/gpu-frame-buffer.ts` |
| `features/streaming/rendering/gpu/managers/gpu-worker-manager.class.js` | `infrastructure/services/streaming/gpu-worker-manager.ts` |
| `features/capture/services/capture.service.js` | `infrastructure/services/capture/capture.service.ts` |
| `features/capture/services/capture-save.service.js` | `infrastructure/services/capture/capture-save.service.ts` |
| `features/capture/services/capture-gpu-recording.service.js` | `infrastructure/services/capture/gpu-recording.service.ts` |
| `features/devices/services/device.service.js` | `infrastructure/services/devices/device.service.ts` |
| `features/devices/services/device-connection.service.js` | `infrastructure/services/devices/device-connection.service.ts` |
| `features/devices/services/device-media.service.js` | `infrastructure/services/devices/device-media.service.ts` |
| `features/devices/services/device-storage.service.js` | `infrastructure/services/devices/device-storage.service.ts` |
| `features/devices/services/device-operation-sequencer.service.js` | `infrastructure/services/devices/device-operation-sequencer.service.ts` |
| `features/settings/services/settings.service.js` | `infrastructure/services/settings/settings.service.ts` |
| `features/settings/services/settings-fullscreen.service.js` | `infrastructure/services/settings/fullscreen.service.ts` |
| `features/settings/services/settings-cinematic-mode.service.js` | `infrastructure/services/settings/cinematic-mode.service.ts` |
| `features/settings/services/presentation-mode.service.js` | `infrastructure/services/settings/presentation-mode.service.ts` |
| `features/transcode/services/transcode.service.js` | `infrastructure/services/transcode/transcode.service.ts` |
| `features/updates/services/update.service.js` | `infrastructure/services/updates/update.service.ts` |
| `features/updates/services/update-ui.service.js` | `infrastructure/services/updates/update-ui.service.ts` |
| `features/notes/services/notes.service.js` | `infrastructure/services/notes/notes.service.ts` |
| `application/performance/performance-animation.service.js` | `infrastructure/services/performance/performance-animation.service.ts` |
| `application/performance/performance-metrics.service.js` | `infrastructure/services/performance/performance-metrics.service.ts` |
| `application/performance/performance-state.service.js` | `infrastructure/services/performance/performance-state.service.ts` |
| `features/devices/adapters/device-base.adapter.js` | `infrastructure/adapters/devices/device-base.adapter.ts` |
| `features/devices/adapters/device-ipc.adapter.js` | `infrastructure/adapters/devices/device-ipc.adapter.ts` |
| `features/devices/adapters/device-ipc-status.adapter.js` | `infrastructure/adapters/devices/device-ipc-status.adapter.ts` |
| `features/devices/adapters/device-change-debounce.adapter.js` | `infrastructure/adapters/devices/device-change-debounce.adapter.ts` |
| `features/devices/adapters/chromatic/device-chromatic.adapter.js` | `infrastructure/adapters/devices/chromatic/chromatic.adapter.ts` |
| `features/streaming/rendering/adapters/streaming-gpu-renderer.adapter.js` | `infrastructure/adapters/streaming/gpu-renderer.adapter.ts` |
| `features/streaming/rendering/adapters/streaming-canvas2d-renderer.adapter.js` | `infrastructure/adapters/streaming/canvas2d-renderer.adapter.ts` |
| `features/streaming/rendering/interfaces/streaming-renderer.interface.js` | `infrastructure/adapters/streaming/streaming-renderer.interface.ts` |
| `application/adapters/metrics.adapter.js` | `infrastructure/adapters/platform/metrics.adapter.ts` |
| `shared/streaming/acquisition/acquisition-context.class.js` | `infrastructure/streaming/acquisition/acquisition-context.ts` |
| `shared/streaming/acquisition/acquisition.class.js` | `infrastructure/streaming/acquisition/acquisition.orchestrator.ts` |
| `shared/streaming/acquisition/constraint-builder.class.js` | `infrastructure/streaming/acquisition/constraint-builder.ts` |
| `shared/streaming/acquisition/fallback-strategy.class.js` | `infrastructure/streaming/acquisition/fallback-strategy.ts` |
| `shared/streaming/acquisition/stream-lifecycle.base.js` | `infrastructure/streaming/acquisition/stream-lifecycle.base.ts` |
| `features/streaming/factories/streaming-adapter.factory.js` | `infrastructure/factories/streaming-adapter.factory.ts` |
| `features/streaming/factories/streaming-renderer.factory.js` | `infrastructure/factories/streaming-renderer.factory.ts` |
| `features/streaming/rendering/presets/streaming-render-presets.config.js` | `infrastructure/rendering/presets/render-presets.config.ts` |
| `features/streaming/rendering/gpu/streaming-capability-detector.utils.js` | `infrastructure/rendering/capability-detector.utils.ts` |
| `features/streaming/rendering/workers/streaming-render.worker.js` | `infrastructure/rendering/workers/render.worker.ts` |
| `features/streaming/rendering/workers/streaming-worker-protocol.config.js` | `infrastructure/rendering/workers/worker-protocol.config.ts` |
| `features/streaming/rendering/workers/streaming-optimization.utils.js` | `infrastructure/rendering/workers/optimization.utils.ts` |

### Parallelization

**Batch 1** (independent service domains):
- Devices services + Notes service + Transcode service

**Batch 2** (independent service domains):
- Settings services + Updates services + Capture services

**Batch 3** (internal dependencies):
- Streaming services (largest group)

**Batch 4** (after services placed):
- All adapters (devices, streaming, platform)

**Batch 5** (after adapters placed):
- Acquisition + Factories + Rendering internals

**Sequential**: Update container imports, validate all tests

---

## Phase 5: Application Layer

Consolidate all orchestrators into `application/orchestrators/`.

### Target Structure

```
application/
├── orchestrators/
│   ├── app.orchestrator.ts
│   ├── device.orchestrator.ts
│   ├── streaming.orchestrator.ts
│   ├── streaming-audio.orchestrator.ts
│   ├── capture.orchestrator.ts
│   ├── preferences.orchestrator.ts
│   ├── display-mode.orchestrator.ts
│   ├── update.orchestrator.ts
│   ├── ui-setup.orchestrator.ts
│   ├── performance-animation.orchestrator.ts
│   ├── performance-metrics.orchestrator.ts
│   ├── performance-state.orchestrator.ts
│   └── index.ts
│
├── state/
│   └── app-state.ts
│
├── container.ts
│
└── index.ts
```

### File Migration Map

| Current Location | New Location |
|-----------------|--------------|
| `application/app.orchestrator.js` | `application/orchestrators/app.orchestrator.ts` |
| `application/performance/performance-animation.orchestrator.js` | `application/orchestrators/performance-animation.orchestrator.ts` |
| `application/performance/performance-metrics.orchestrator.js` | `application/orchestrators/performance-metrics.orchestrator.ts` |
| `application/performance/performance-state.orchestrator.js` | `application/orchestrators/performance-state.orchestrator.ts` |
| `features/devices/services/device.orchestrator.js` | `application/orchestrators/device.orchestrator.ts` |
| `features/streaming/services/streaming.orchestrator.js` | `application/orchestrators/streaming.orchestrator.ts` |
| `features/streaming/services/streaming-audio.orchestrator.js` | `application/orchestrators/streaming-audio.orchestrator.ts` |
| `features/capture/services/capture.orchestrator.js` | `application/orchestrators/capture.orchestrator.ts` |
| `features/settings/services/settings-preferences.orchestrator.js` | `application/orchestrators/preferences.orchestrator.ts` |
| `features/settings/services/settings-display-mode.orchestrator.js` | `application/orchestrators/display-mode.orchestrator.ts` |
| `features/updates/services/update.orchestrator.js` | `application/orchestrators/update.orchestrator.ts` |
| `ui/orchestration/ui-setup.orchestrator.js` | `application/orchestrators/ui-setup.orchestrator.ts` |
| `application/app-state.class.js` | `application/state/app-state.ts` |
| `container.js` | `application/container.ts` |

### Entry Point Changes

| Current Location | New Location |
|-----------------|--------------|
| `index.js` | `index.ts` |
| `renderer-app.orchestrator.js` | `renderer-app.orchestrator.ts` |

### Cleanup

After Phase 5, delete:
- `renderer/features/` (should be empty)
- `renderer/application/performance/` (emptied)
- `renderer/application/adapters/` (emptied)

---

## Phase 6: Presentation Layer

Rename `ui/` to `presentation/`, consolidate effects, absorb renderer-only shared config.

### Target Structure

```
presentation/
├── components/
│   ├── streaming/
│   │   ├── streaming-controls.component.ts
│   │   └── stream-viewer.template.ts
│   ├── toolbar/
│   │   ├── shader-selector.component.ts
│   │   ├── shader-preset-list.component.ts
│   │   ├── shader-slider-controls.component.ts
│   │   ├── cinematic-toggle.component.ts
│   │   └── toolbar.template.ts
│   ├── settings/
│   │   ├── settings-menu.component.ts
│   │   └── settings-menu.template.ts
│   ├── notes/
│   │   ├── notes-panel.component.ts
│   │   ├── notes-list-view.component.ts
│   │   ├── notes-editor-view.component.ts
│   │   ├── notes-search.component.ts
│   │   ├── notes-resize-handler.component.ts
│   │   ├── notes-panel-layout.component.ts
│   │   ├── game-filter.component.ts
│   │   ├── game-autocomplete.component.ts
│   │   └── notes-panel.template.ts
│   ├── updates/
│   │   └── update-section.component.ts
│   ├── transcode/
│   │   └── transcode-toast.component.ts
│   ├── fullscreen/
│   │   └── fullscreen-controls.template.ts
│   └── shared/
│       ├── device-status.component.ts
│       └── status-notification.component.ts
│
├── effects/
│   ├── ui-effects.ts
│   ├── body-class.manager.ts
│   ├── cursor-auto-hide.effect.ts
│   ├── toolbar-auto-hide.effect.ts
│   ├── controls-auto-hide.effect.ts
│   ├── button-feedback.effect.ts
│   └── capture.effect.ts
│
├── primitives/
│   ├── disclosure.controller.ts
│   ├── listbox-dropdown.controller.ts
│   ├── hide-timer.ts
│   ├── listbox.utils.ts
│   └── dom-bindings.utils.ts
│
├── shell/
│   ├── app-shell.renderer.ts
│   ├── app-shell.template.ts
│   ├── header.template.ts
│   └── status-footer.template.ts
│
├── bridges/
│   ├── ui-event.bridge.ts
│   ├── capture-ui.bridge.ts
│   └── transcode-ui.bridge.ts
│
├── controller/
│   ├── ui.controller.ts
│   └── component.registry.ts
│
├── config/
│   ├── dom-selectors.config.ts
│   ├── css-classes.config.ts
│   ├── constants.config.ts
│   ├── storage-keys.config.ts
│   ├── notes-panel.config.ts
│   └── update-state.config.ts
│
├── icons/
│   └── icon.utils.ts
│
├── styles/
│   └── (CSS files from assets/styles/)
│
└── lib/
    ├── file-download.utils.ts
    ├── brightness.utils.ts
    ├── filename-generator.utils.ts
    └── formatters.utils.ts
```

### Key Moves

| Current Location | New Location | Rationale |
|-----------------|--------------|-----------|
| `ui/` (entire directory) | `presentation/` | Clean Architecture naming |
| `ui/features/streaming/effects/*` | `presentation/effects/` | Consolidate all effects |
| `ui/features/toolbar/effects/*` | `presentation/effects/` | Consolidate all effects |
| `ui/features/fullscreen/effects/*` | `presentation/effects/` | Consolidate all effects |
| `ui/orchestration/*.bridge.js` | `presentation/bridges/` | UISetupOrchestrator moved in Phase 5 |
| `shared/config/dom-selectors.config.js` | `presentation/config/` | Renderer-only config |
| `shared/config/css-classes.config.js` | `presentation/config/` | Renderer-only config |
| `shared/config/constants.config.js` | `presentation/config/` | Renderer-only config |
| `shared/config/storage-keys.config.js` | `presentation/config/` | Renderer-only config |
| `shared/config/notes-panel.config.js` | `presentation/config/` | Renderer-only config |
| `shared/config/update-state.config.js` | `presentation/config/` | Renderer-only config |
| `shared/utils/brightness.utils.js` | `presentation/lib/` | Renderer-only utility |
| `shared/utils/filename-generator.utils.js` | `presentation/lib/` | Renderer-only utility |
| `shared/utils/formatters.utils.js` | `presentation/lib/` | Renderer-only utility |
| `renderer/lib/file-download.utils.js` | `presentation/lib/` | Renderer utility |
| `renderer/assets/styles/` | `presentation/styles/` | CSS belongs with presentation |

---

## Execution Strategy

### Phase Dependencies

```
Phase 4 (Infrastructure) → Phase 5 (Application) → Phase 6 (Presentation)
```

Each phase must pass all tests before the next begins.

### Risk Assessment

| Phase | Risk | Rationale |
|-------|------|-----------|
| Phase 4 | Medium | Most files (~45), but mechanical moves + import updates |
| Phase 5 | Low | Few files (~15), clear dependencies |
| Phase 6 | Medium | Many files (~40), plus shared/ config migration |

### TypeScript Strategy

- Source files: Convert to .ts as they move
- Test files: Stay as .js, update import paths only
- Templates: Stay as .js initially

### Test Update Strategy

- 100+ test files need import path updates
- Use @renderer/ path aliases in vitest.config to minimize changes
- After each phase: `npm run test:run` + `npm run lint`

### Shared/ Cleanup

After Phase 6, shared/ still contains files used by both processes. These can be deleted once both main and renderer fully import from core/ instead. This is a separate cleanup pass.

---

## Complete Directory Structure (Final State)

```
renderer/
├── index.ts
├── renderer-app.orchestrator.ts
│
├── application/
│   ├── orchestrators/           (11 orchestrators)
│   ├── state/                   (AppState)
│   ├── container.ts
│   └── index.ts
│
├── infrastructure/
│   ├── services/                (21 services by domain)
│   ├── adapters/                (all adapters by domain)
│   ├── streaming/acquisition/   (browser-only acquisition)
│   ├── factories/               (adapter + renderer factories)
│   ├── rendering/               (GPU internals, presets, workers)
│   ├── events/                  (EventBus)
│   ├── di/                      (ServiceContainer)
│   └── logging/                 (RendererLogger)
│
└── presentation/
    ├── components/              (UI components by feature)
    ├── effects/                 (all visual effects, consolidated)
    ├── primitives/              (DOM utilities)
    ├── shell/                   (app shell + templates)
    ├── bridges/                 (EventBus ↔ UI)
    ├── controller/              (UIController)
    ├── config/                  (DOM selectors, CSS classes)
    ├── icons/
    ├── styles/                  (all CSS)
    └── lib/                     (renderer utilities)
```
