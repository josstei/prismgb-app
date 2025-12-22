---
name: performance-system-refactor
description: Unify performance state and render pipeline, with dev-only metrics
---

# Plan

Unify performance state, telemetry, and render‑pipeline control under a single performance system so there is one source of truth for performance mode, visibility, idle, and renderer switching, while keeping metrics dev‑only and removing dead code. Deliver in phased refactors to reduce risk.

## Requirements
- Centralize performance signals (mode, weak GPU, visibility, idle, reduced motion) into one coordinator.
- Metrics are dev‑only with periodic snapshots in dev; no metrics in production builds.
- Use a single metrics implementation; remove unused performance code paths and test-only utilities.
- Streaming orchestrator consumes unified performance state (no direct DOM listeners) and remains the render pipeline owner for now.

## Scope
- In: renderer performance state, visibility handling, metrics collection (dev only), render pipeline orchestration.
- Out: UI/UX changes, new telemetry backend, device adapter changes.

## Files and entry points
- src/app/renderer/application/performance/performance-state.coordinator.js
- src/app/renderer/application/performance/animation-performance.orchestrator.js
- src/app/renderer/application/performance/performance-metrics.orchestrator.js
- src/app/renderer/application/performance/performance-metrics.service.js
- src/app/main/IpcHandlers.js
- src/app/preload/index.js
- src/features/streaming/services/streaming.orchestrator.js
- src/features/streaming/rendering/render-pipeline.service.js
- src/features/streaming/rendering/stream-health.monitor.js
- src/features/streaming/rendering/workers/optimization-utils.js
- src/infrastructure/events/event-channels.js
- src/infrastructure/ipc/channels.json

## Data model / API changes
- Add a unified performance state event (e.g., PERFORMANCE.STATE_CHANGED) with { enabled, weakGpuDetected, hidden, idle, reducedMotion }.
- Replace direct DOM listeners with event subscriptions.
- Metrics IPC stays snapshot‑based; dev‑only periodic scheduling in renderer.

## Action items
[x] Create a PerformanceStateCoordinator that owns visibility/idle/reduced‑motion listeners and emits a single state event.
[x] Refactor animation-performance.orchestrator to consume the unified state instead of direct listeners.
[x] Replace visibility.handler usage with the unified state (or have it publish the state and deprecate direct use).
[x] Consolidate metrics: remove ProcessMemoryMonitor so PerformanceMetricsService is the single implementation, dev‑only periodic snapshots.
[x] Extract a RenderPipelineService from streaming.orchestrator to own GPU/Canvas2D switching, health checks, and rendering start/stop.
[x] Remove dead code in optimization-utils.js (unused PerformanceMetrics class) and update benchmark coverage accordingly.
[x] Update tests for the new coordinator and state-driven animation/streaming orchestration.

## Testing and validation
- npm test
- Targeted: app.orchestrator tests, streaming orchestrator tests, new coordinator/service tests.
- Manual smoke: start/stop stream, toggle performance mode, minimize/restore window, verify rendering resumes.

## Risks and edge cases
- Event ordering regressions (performance state applied before stream init).
- Renderer switching during stream could race with GPU worker init/teardown.
- Metrics IPC availability during early app boot in dev.

## Open questions
- None.
