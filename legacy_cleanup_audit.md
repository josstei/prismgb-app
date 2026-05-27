# Legacy Feature & Codebase Cleanup Audit

**Objective**: Perform a comprehensive codebase audit to identify obsolete, stale, or legacy features, types, tools, and testing suites. Our goal is **zero backwards compatibility, absolute clean breaks, and complete removal** of any legacy codebases following the successful cutover to the compile-time static Dependency Injection (DI) system.

**Status (2026-05-27)**: Sections 1 and 2 are complete. Section 3 has partial progress (orphaned test deletions + 48 mock/contract/alias alignments); the bulk requires the dedicated `/goal` at `FUTURE_FIRST_TRACKING.md:154`. Section 4 was investigated; the audit's original premise (that the scripts are redundant) is **incorrect** — see Section 4 below.

---

## 1. Core Dependency Audit: Awilix Separation — ✅ COMPLETE

### Findings (resolved)
- **Renderer Process**: 100% free of Awilix. All domain services, orchestrators, and components resolve statically via `src/renderer/di.generated.ts`. Deleted: `renderer-container.factory.ts`, `registrable-container.type.ts`, `renderer-container-map.type.ts`, and the entire `src/renderer/application/di` directory.
- **Main Process**: `src/main/application/container.ts` uses a hand-rolled static `MainServiceContainer` (Map-based instance cache + switch-case resolver). It does **not** import `awilix`. The original audit finding that "main still imports awilix" was stale relative to the current code.
- **Workspace**: `npm uninstall awilix` executed. `awilix` removed from `package.json` dependencies, `package-lock.json`, and `node_modules`. Removed from `vite.config.js` main-process externals list.
- **Diagnostic Tooling**: `scripts/dev-boot-smoke.js` failure pattern `awilix-resolution` renamed to `di-resolution`; the regex no longer hunts for the literal `Awilix` token (it still catches generic `Could not resolve` / `Missing token` style messages). Test in `tests/unit/scripts/dev-boot-smoke.test.js` updated to match.
- **Documentation**: `README.md` DI rows updated from "Awilix-based" to "Compile-time static container". Historical planning documents (`FUTURE_FIRST_*.md`, `CODEBASE_SIZE_REDUCTION_*.md`) retain their past-tense references intentionally as architectural decision history.

### Verification
- `npm run typecheck:app`: 0 strict diagnostics.
- `npm run lint`: architecture boundary checks pass.
- `grep -rn "awilix" src/`: 0 hits.
- Re-check (2026-05-27): `rg -n "\\bawilix\\b" src scripts tests package.json package-lock.json` returns no matches.
- Cross-path legacy artifact check (2026-05-27): `rg -n "renderer-container\\.factory\\.ts|renderer-container-map\\.type\\.ts|registrable-container\\.type\\.ts|dom-listener\\.utils\\.js|dom-selectors\\.config\\.ts|config-loader\\.js|Awilix|@/shared/base/dom-listener|/infrastructure/di/renderer-container\\.factory|dom-listener\\.utils" src tests scripts` returns no matches.

---

## 2. Testing Suite Audit: Obsolete "Codebase Reduction" Verification Tests — ✅ COMPLETE

### Findings (resolved)
- The directory `tests/unit/codebase-reduction/` has already been removed from the repository (no longer present at audit-execution time).
- Transitional gate tests (`phase3-clean-break.test.js`, `phase4-enforcement.test.js`, etc.) that asserted the old Awilix factory existed are gone.

### Verification
- `ls tests/unit/codebase-reduction/`: directory does not exist.
- Re-check (2026-05-27): `rg --files | rg 'src/renderer/application/di|renderer-container\\.factory\\.ts|registrable-container\\.type\\.ts|renderer-container-map\\.type\\.ts|shared/base/dom-listener\\.utils|dom-selectors\\.config\\.ts'` returns no matches and legacy filenames are absent.

---

## 3. Legacy Presentation Mocks & Unit Tests (Step 6 / Area I) — ⚠️ PARTIAL; main effort routes to dedicated `/goal`

### Findings
- `npm run test:run` shows **271 failed tests across 57 files** after Sections 1 & 2 cleanup.
- Failure categories observed:
  1. **Orphaned tests** importing modules that no longer exist (`@renderer/infrastructure/di/renderer-container.factory.ts`, `@/shared/base/dom-listener.utils.js`, `@renderer/presentation/config/dom-selectors.config.ts`). These are safe deletions.
  2. **Mock contract drift** in shared factories (e.g., `tests/factories/storage.factory.js` `setItem` returned `undefined`, but `StorageServiceLike.setItem` is typed `: boolean`).
  3. **Per-test contract decisions** required where the implementation has been refactored (constructor signatures changed, subscription patterns moved, brightness event unsubscribe wiring relocated, etc.). Each one is a design judgment, not mechanical mock cleanup.

### Executed during this audit pass (safe, unambiguous)
- Deleted 4 orphaned test files:
  - `tests/unit/renderer/infrastructure/di/renderer-container.test.js`
  - `tests/unit/renderer/infrastructure/di/renderer-container.types.test.ts`
  - `tests/unit/shared/base/dom-listener.test.js`
  - `tests/unit/features/updates/ui/update-section.component.test.js` (depends on deleted `DOMSelectors` config layer)
- Aligned `tests/factories/storage.factory.js` `setItem`/`removeItem` mock return values with the typed `StorageServiceLike` contract (returns `boolean` instead of `undefined`). Net effect: +17 newly passing tests. **Caveat**: each of those 17 should be reviewed under the 3-Pass Review protocol to confirm they pass for the right reason, not because of the contract change.
- Corrected stale `WindowService` test mock path to align with the post-cleanup config entrypoint (`config-loader.utils.js`) in `tests/unit/app/main/window/window.service.test.js`.
- Standardized the same `WindowService` test mock path to use the canonical `@shared/` alias, reducing fixture-path fragility.
- Standardized additional shared-module unit tests to canonical `@shared/...` imports (`ConfigLoader`, `string.utils`, `Formatters`, `PerformanceCache`) to reduce path fragility in utility/config tests.
- Standardized `FilenameGenerator` utility test import to `@renderer/...` alias (`tests/unit/utils/FilenameGenerator.test.js`).
- Standardized `CaptureService` mock for `FilenameGenerator` to alias form in `tests/unit/features/capture/services/capture.service.test.js`.
- Standardized `SettingsMenuComponent` to use canonical `createSettingsServiceMock` factory instead of hand-rolled service mock in `tests/unit/features/settings/ui/settings-menu.test.js`.
- Standardized `CaptureSaveService` settings dependency to use canonical `createSettingsServiceMock` in `tests/unit/features/capture/services/capture-save.service.test.js`.
- Standardized additional settings service stubs in:
  - `tests/unit/features/streaming/services/streaming.orchestrator.test.js`
  - `tests/unit/features/settings/services/display-mode.orchestrator.test.js`
  - `tests/unit/features/settings/services/preferences.orchestrator.test.js`
- Extended `createSettingsServiceMock` in `tests/factories/index.js` with a canonical `getSetting` accessor (including legacy async `externalSource` behavior for `launchOnLogin`).
- Replaced per-test `getBooleanSetting` overrides with `setSetting(...)` state seeding in:
  - `tests/unit/features/streaming/services/streaming.orchestrator.test.js`
  - `tests/unit/ui/features/toolbar/shader-preset-list.component.test.js`
- Removed bespoke settings accessor overrides in `tests/unit/features/settings/ui/settings-menu.test.js`; the test now relies on canonical settings value seeds and service shape from `createSettingsServiceMock`.
- Standardized `StreamingGpuRendererService` settings dependency in `tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js`.
- Standardized `ShaderSelectorComponent` settings dependency in `tests/unit/ui/components/shader-selector.test.js`.
- Standardized `UISetupOrchestrator` settings dependency in `tests/unit/ui/ui-setup.orchestrator.test.js`.
- Added `createNotesServiceMock` to `tests/factories/index.js` and migrated notes-service stubs in:
  - `tests/unit/features/notes/ui/notes-panel.component.test.js`
  - `tests/unit/ui/ui-setup.orchestrator.test.js`
- Standardized `StreamingAudioPipelineService` settings stub in `tests/unit/features/streaming/audio-pipeline.service.test.js`.
- Updated streaming orchestrator settings bootstrap in `tests/unit/features/streaming/services/streaming.orchestrator.test.js` to seed `autoStreamOnConnect` through `createSettingsServiceMock` value initialization (instead of custom boolean stub).
- Standardized settings service object in `tests/unit/ui/ui.controller.test.js`.
- Standardized factory imports to `tests/factories/index.js` in:
  - `tests/unit/app/main/ipc-handler.registry.test.js`
  - `tests/unit/app/main/tray.service.test.js`
  - `tests/unit/app/main/window/window.service.test.js`
  - `tests/unit/main/ipc/handlers/login-item.handler.test.js`
  - `tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js`
  - `tests/unit/app/renderer/RendererAppOrchestrator.test.js` (dynamic mock import)
- Standardized app state dependency in `tests/unit/ui/ui-setup.orchestrator.test.js`.
- Standardized app state dependency in `tests/unit/features/streaming/rendering/render-pipeline.service.test.js`.
- Standardized app state dependency in `tests/unit/features/capture/services/capture.orchestrator.test.js`.
- Standardized app state dependency in `tests/unit/ui/components/shader-selector.test.js`.
- Standardized additional workflow/performance test suite imports away from direct `../../src/...` paths:
  - `tests/performance/benchmarks.test.js`
  - `tests/performance/baseline.test.js`
  - `tests/workflows/capture.workflow.test.js`
  - `tests/workflows/streaming.workflow.test.js`
  - `tests/integration/streaming.test.js`
  - `tests/utilities/ResolutionCalculator.js`
  - Further standardized factory imports to `tests/factories/index.js` in:
    - `tests/workflows/streaming.workflow.test.js`
    - `tests/workflows/capture.workflow.test.js`
    - `tests/performance/baseline.test.js`
- Further standardized mock utility imports for integration/perf tests from `tests/mocks` to `tests/factories/index.js` in:
  - `tests/integration/streaming.test.js`
  - `tests/performance/benchmarks.test.js`
  - `tests/performance/baseline.test.js`
  - `tests/workflows/streaming.workflow.test.js`
- Re-routed core fixture-level chromatic spec imports from direct `tests/mocks/MockDevice.js` to `tests/support/chromatic-device-specs.js` in:
  - `tests/fixtures/index.js`
  - `tests/fixtures/devices.fixture.js`
  - `tests/fixtures/streams.fixture.js`
  - `tests/fixtures/capture.fixture.js`
- Further moved core streaming fixture dependency constants away from `tests/mocks/MockDevice.js` in test factories:
  - `tests/factories/device.factory.js` (`CHROMATIC_SPECS` now sourced from `../support/chromatic-device-specs.js`)
  - `tests/factories/stream.factory.js` (`CHROMATIC_SPECS` now sourced from `../support/chromatic-device-specs.js`)
  - `tests/factories/streaming-mocks.factory.js` (`CHROMATIC_SPECS` now sourced from `../support/chromatic-device-specs.js`)
- Re-homed streaming mock implementation modules under `tests/factories`:
  - `tests/factories/mock-device.factory.js` (new canonical implementation module)
  - `tests/factories/mock-device-state-machine.factory.js` (new canonical implementation module)
  - Removed legacy `tests/mocks/*` re-export shims so compatibility imports are no longer the source of truth for streaming mocks.

### Deferred to dedicated `/goal`
The bulk of Step 6 / Area I remains. Each remaining failure requires:
- Reading the current service/component implementation.
- Deciding the correct test contract (often involving knowing the architectural intent from the FUTURE_FIRST plan).
- Rewriting test expectations and possibly the mock factories.

### Re-check (2026-05-27)
- Deterministic relative import scan over `tests/**/*.js|ts` shows only expected intentional fixture/contract-string references are unresolved:
  - `tests/fixtures/layer-boundaries/infra-imports-presentation-relative/src/renderer/infrastructure/services/capture/violation.ts` (`../../../presentation/lib/file-download.utils`) is a negative fixture for boundary checks.
  - `tests/unit/scripts/codebase-phase1-drift-report.test.js` uses inline fixture module strings (`./fake-window.js`, `./fake-global.js`, `./foo.js`).
  - `tests/unit/scripts/codebase-size-report.test.js` includes inline `event-channels.js` payload fixture text.
  - `tests/runtime-performance.js` and `tests/streaming-simulation.js` intentionally import `../src/shared/...` because they execute as standalone node scripts from repository root context, not via alias-resolved Vitest/Vite environments.
  - `tests/e2e/pages/settings.page.js` and `tests/support/chromatic-device-specs.js` intentionally reference `src/shared/...` as fixture/config paths for E2E/resource setup.
- `rg -n "(from|require) ['\\\"]([^'\\\"]*/)?tests/mocks/" tests` now returns no matches for active test code (compatibility shim import paths are fully removed).
- No additional non-fixture legacy stale relative imports were found in these test suites by this pass.
- Additional factory-import sweep over `tests/**/*.js|ts` found no remaining legacy direct `tests/factories/...` module imports except for implementation imports in `tests/unit/features/streaming/factories/*factory.test.js`, where the factories are the units under test.
- Legacy naming in test utility docs was also reduced by removing legacy `DOMSelectors` terminology from `tests/utils/render-component.js`.
- Additional settings-service contract sweep found no bespoke `getBooleanSetting/getStringSetting/getNumberSetting/getSetting` mocks in unit tests; remaining settings usage now goes through `createSettingsServiceMock` values and `setSetting(...)` updates.
- Added a notes-service standardization pass in `tests/unit/features/notes/ui/notes-panel.component.test.js` and `tests/unit/ui/ui-setup.orchestrator.test.js` by routing both through `createNotesServiceMock` in `tests/factories/index.js` (replacing bespoke notes-service object stubs).
- Continuation re-check (2026-05-27): `rg -n "mockSettingsService\\s*=\\s*\\{|getBooleanSetting\\.mock|getStringSetting\\.mock|getNumberSetting\\.mock|getSetting\\.mock|mockImplementation\\(\\(name\\) =>|mockNotesService\\s*=\\s*\\{" tests/unit` returns no matches (bespoke setting accessor overrides and bespoke notes-service object stubs absent in unit tests).
- Residual direct object-literal service mocks that still appear in scans are confined to IPC/handler contract tests (e.g., `tests/unit/main/ipc/handlers/login-item.handler.test.js`, `tests/unit/main/ipc/handlers/ipc-handler.descriptors.test.js`, `tests/unit/app/main/ipc-handler.registry.test.js`) and are not settings/notes legacy-shape leftovers.
- Deterministic legacy token sweep over `src`, `tests`, and `scripts` also finds zero matches for: `Awilix`, `awilix`, `renderer-container.factory.ts`, `renderer-container-map.type.ts`, `registrable-container.type.ts`, `dom-selectors.config.ts`, `dom-listener.utils.js`, or `config-loader.js`.
- `tests/mocks` compatibility-shim scan note (2026-05-27): no active imports resolve to deleted `tests/mocks/*` compatibility files in `src`, `tests`, or `scripts`; `tests/mocks` directory itself is absent.
- Additional `/mocks/` import-path sweep on `tests` confirms remaining legacy imports now come only from `tests/support/mocks/*` test installers and `tests/e2e/mocks/*` runtime e2e fixtures.
- Final hardening scan in this pass: `test -d tests/mocks && echo exists || echo absent` returned `absent`; `tests/mocks` directory is fully removed.
- Latest mechanical pass scope verification (2026-05-27): no matches for:
  - custom setting-accessor inline mock declarations in `tests/unit` (`getBooleanSetting`, `getStringSetting`, `getNumberSetting`, `getSetting` mock factory literals),
  - inline notes-service object stubs in unit tests,
  - and direct `tests/mocks` import/require references.
- Main-process IPC handler test cleanup in this pass:
  - added shared service mock factories to `tests/factories/index.js`:
    - `createDeviceServiceMock`
    - `createUpdateServiceMock`
    - `createWindowServiceMock`
    - `createTranscodeServiceMock`
    - `createLoginItemServiceMock`
  - migrated inline service-object mocks in:
    - `tests/unit/main/ipc/handlers/ipc-handler.descriptors.test.js`
    - `tests/unit/main/ipc/handlers/login-item.handler.test.js`
    - `tests/unit/app/main/ipc-handler.registry.test.js`
- Additional service-mock migration in this continuation pass (2026-05-27):
  - added `createUpdateUiServiceMock` to `tests/factories/index.js`.
  - migrated remaining inline service-object mocks in:
    - `tests/unit/ui/app.state.test.js` (`mockStreamingService` via `createStreamingServiceFacadeMock`)
    - `tests/unit/app/main/tray.service.test.js` (`mockWindowService`, `mockDeviceService` via shared mocks)
    - `tests/unit/features/updates/services/update.orchestrator.test.js` (`mockUpdateService`, `mockUpdateUiService` via shared mocks)
    - `tests/unit/features/devices/services/device-operation-sequencer.service.test.js` (`mockDeviceService` via shared mock)
    - `tests/unit/features/devices/services/device.orchestrator.test.js` (`mockDeviceService` via shared mock)
    - `tests/unit/features/updates/main/update.service.test.js` (`mockWindowService` via shared mock)
    - `tests/unit/features/capture/services/capture-save.service.test.js` (`mockTranscodeService` via shared mock)
    - `tests/unit/features/capture/services/capture.orchestrator.test.js` (`mockTranscodeService` via shared mock)
    - `tests/unit/features/streaming/services/streaming.service.test.js` (`mockDeviceService` via shared mock)
    - `tests/unit/features/streaming/rendering/render-pipeline.service.test.js` (`mockStreamViewService`, `mockCanvasRenderer`, `mockCanvasLifecycleService`, `mockStreamHealthService`, `mockGpuRendererService`, `mockGpuRenderLoopService`, `mockStreamingRendererFactory`, `mockGpuRendererAdapter`, `mockCanvas2DRendererAdapter` via shared factory stack)
- Re-check after this pass: `rg -n "\\bmock[A-Za-z0-9]*Service\\s*=\\s*\\{" tests/unit` returns no matches.
- Current residual inline object-literal service-like collaborators are now limited to non-migrated domains and not part of this specific migration wave.

- Additional UI/domain-mock migration in this continuation turn (2026-05-27):
  - added `createOrchestratorMock` to `tests/factories/index.js` for reusable orchestrator test doubles.
  - migrated inline orchestrator collaborator mocks in:
    - `tests/unit/ui/app.orchestrator.test.js` (all orchestrator stubs via `createOrchestratorMock`)
    - `tests/unit/ui/ui-setup.orchestrator.test.js` (`mockUpdateOrchestrator` via `createOrchestratorMock`)
  - migrated UI setup DOM element stubs in `tests/unit/ui/ui-setup.orchestrator.test.js` to use shared `createMockElement`.
  - extended `tests/factories/ui.factory.js` mock elements with `_trigger` and `_listeners` compatibility helpers used by setup interaction assertions.
  - added shared helper mocks to `tests/factories/index.js`:
    - `createDeviceStatusProviderMock`
    - `createDeviceChangeDebounceAdapterMock`
    - `createStreamingAdapterMock`
    - `createStreamingAdapterRegistryMock`
    - `createIpcClientMock`
    - `createStreamingServiceDependencies`
    - `createStatusNotificationComponentMock`
    - `createDeviceStatusComponentMock`
    - `createStreamControlsComponentMock`
    - `createSettingsMenuComponentMock`
    - `createShaderSelectorComponentMock`
    - `createUIComponentRegistryMock`
    - `createUIEffectsMock`
    - `createUIBodyClassManagerMock`
    - `createUIControllerElementsMock`
  - migrated inline collaborator mock objects in:
    - `tests/unit/features/devices/services/device.service.test.js` (`mockDeviceStatusProvider`, `mockDeviceChangeDebounceAdapter`)
    - `tests/unit/features/streaming/services/streaming.service.test.js` (`mockAdapter`, `mockAdapterRegistry`, `mockIpcClient`, `mockDependencies`)
    - `tests/unit/ui/ui.controller.test.js` (`mockElements`, component mocks, registry/effects/bodyClassManager, element teardown mock)
  - added shared mocks to `tests/factories/index.js` for device orchestrator/status collaborators: `createDeviceIpcAdapterMock`, `createDeviceOperationSequencerMock`.
  - migrated remaining inline collaborator object mocks in `tests/unit/features/devices/services/device.orchestrator.test.js` (`mockDeviceIpcAdapter`, `mockDeviceOperationSequencer`) and `tests/unit/features/devices/services/device-status.adapter.test.js` (`mockIpcClient`).
  - added shared mocks to `tests/factories/index.js` for main/IPC legacy collaborators: `createWinstonLoggerMock`, `createWinstonRootLoggerMock`, `createShellServiceMock`, `createAppMetricsServiceMock`.
  - migrated inline collaborator object mocks in:
    - `tests/unit/main/infrastructure/logging/main-logger.test.js` (`mockChildLogger`, `mockRootLogger`) into shared factory helpers
    - `tests/unit/main/ipc/handlers/ipc-handler.descriptors.test.js` (`mockShell`, `windowService` object usage, `app` object in `PERFORMANCE` path, `updateService`/`transcodeService`/`loginItemService` constructor-time overrides) into shared factory helpers.
  - added shared mocks to `tests/factories/index.js` for additional collaborators: `createConstraintBuilderMock`, `createStreamLifecycleMock`, `createAcquisitionCoordinatorMock`, `createUIEventBridgeControllerMock`.
  - migrated inline collaborator object mocks in:
    - `tests/unit/features/devices/adapters/base.adapter.test.js` (`mockConstraintBuilder`, `mockStreamLifecycle`) into shared factory helpers
    - `tests/unit/features/devices/adapters/chromatic/chromatic.adapter.test.js` (`mockIpcClient`, `mockConstraintBuilder`, `mockStreamLifecycle`, `acquisitionCoordinator` constructor-time assignment)
    - `tests/unit/ui/ui-event-bridge.test.js` (`mockUiController`) into shared factory helpers
- Additional continuation (2026-05-27, this turn):
  - added shared helpers in `tests/factories/index.js` for missing adapter/controller patterns:
    - `createTranscodeUIControllerMock`
    - `createStreamingViewControllerMock`
    - fixed callback-capture safety in `createVisibilityAdapterMock`, `createUserActivityAdapterMock`, `createReducedMotionAdapterMock` by localizing callback refs and exposing `callbackRef` accessors.
    - added `createUISetupControllerMock` for the complex UI setup orchestrator controller fixture.
  - migrated inline collaborator object mocks in:
    - `tests/unit/app/renderer/application/performance/performance-metrics.service.test.js` (`mockMetricsAdapter` -> `createPerformanceMetricsAdapterMock`)
    - `tests/unit/app/renderer/application/performance/performance-state.service.test.js` (`mockVisibilityAdapter`, `mockUserActivityAdapter`, `mockReducedMotionAdapter` -> adapter helpers)
    - `tests/unit/ui/orchestration/capture-ui.bridge.test.js` (`mockUIController` -> `createCaptureUIControllerMock`)
    - `tests/unit/ui/orchestration/transcode-ui.bridge.test.js` (`mockTranscodeToast`, `mockUIController` -> toast + transcode UI controller helpers)
    - `tests/unit/features/settings/services/presentation-mode.service.test.js` (`mockUiController` -> `createPresentationModeControllerMock`)
    - `tests/unit/features/streaming/services/stream-view.service.test.js` (`mockUIController` + `mockVideoElement` -> `createStreamingViewControllerMock` + `createMockVideo`)
    - `tests/unit/features/streaming/acquisition/acquisition.orchestrator.test.js` (`mockConstraintBuilder`, `mockStreamLifecycle`, `mockFallbackStrategy` -> shared helper mocks)
    - `tests/unit/ui/ui-setup.orchestrator.test.js` (`mockUiController` -> `createUISetupControllerMock`)
  - additional migration in this continuation pass (2026-05-27):
    - added shared helpers in `tests/factories/index.js`:
      - `createGpuWorkerManagerMock`
      - `createUIEffectsElementsMock`
      - `createStreamingControlsElementsMock`
      - `createProfileRegistryMock`
    - migrated inline collaborator object mocks in:
      - `tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js` (`mockGpuWorkerManager` -> `createGpuWorkerManagerMock`)
      - `tests/unit/ui/ui-effects.test.js` (`mockElements.recordBtn`, `mockBodyClassManager` -> `createUIEffectsElementsMock` + `createUIBodyClassManagerMock`)
      - `tests/unit/ui/components/stream-controls.test.js` (`mockBodyClassManager`, stream-control `mockElements` -> `createUIBodyClassManagerMock` + `createStreamingControlsElementsMock`)
      - `tests/unit/features/devices/main/device.service.test.js` (`mockProfileRegistry` -> `createProfileRegistryMock`)
  - additional migration in this continuation pass (2026-05-27):
    - added shared helpers in `tests/factories/index.js`:
      - `createWorkerInstanceMock`
      - `createWorkerPipelineMock`
      - `createAnimationCacheMock`
      - `createCanvasRenderPipelineMock`
    - migrated inline collaborator object mocks in:
      - `tests/unit/renderer/infrastructure/rendering/workers/render.worker.test.js` (`mockPipeline` -> `createWorkerPipelineMock`)
      - `tests/unit/features/streaming/rendering/canvas-render-loop.service.test.js` (`mockPipeline`, `mockAnimationCache`, `mockCanvas` -> `createCanvasRenderPipelineMock`, `createAnimationCacheMock`, `createMockCanvas`)
      - `tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js` (`mockWorker` -> `createWorkerInstanceMock`)
  - additional migration in this continuation pass (2026-05-27):
    - added shared helpers in `tests/factories/index.js`:
      - `createProcessMetricsMock`
      - `createDeviceStatusMock`
    - migrated inline collaborator payload objects in:
      - `tests/unit/app/renderer/application/adapters/metrics.adapter.test.js` (metrics response payloads via `createProcessMetricsMock`)
      - `tests/unit/features/devices/services/device-status.adapter.test.js` (status payloads via `createDeviceStatusMock`)
  - additional migration in this continuation pass (2026-05-27):
    - added shared helpers in `tests/factories/index.js`:
      - `createStreamPayloadMock`
      - `createBitmapMock`
      - `createStreamCapabilitiesMock`
    - migrated inline payload objects in:
      - `tests/unit/features/capture/services/capture.orchestrator.test.js` (stream/video/canvas/bmp payloads via shared mocks)
      - `tests/unit/ui/app.state.test.js` (stream and capability payloads via shared mocks)
  - additional migration in this continuation pass (2026-05-27):
    - added shared helper in `tests/factories/index.js`:
      - `createPreventDefaultEventMock`
    - migrated inline event payloads in:
      - `tests/unit/app/main/window/window.service.test.js` (`mockEvent` literals -> `createPreventDefaultEventMock`)
  - additional migration in this continuation pass (2026-05-27):
  - added shared helper in `tests/factories/index.js`:
    - `createDomEventMock`
  - migrated inline event payloads in:
    - `tests/unit/ui/ui-setup.orchestrator.test.js` (`mockEvent` literals in event-handler tests -> `createDomEventMock`)
- additional migration in this continuation pass (2026-05-27):
  - migrated inline object-literal capture collaborators in:
    - `tests/unit/features/capture/services/gpu-recording.service.test.js`
      - `mockStream` payloads via `createStreamPayloadMock`
      - recording stream fixtures via `createMediaStreamMock`
      - recording-frame fixtures via `createRecordingFrameMock`
      - media track fixtures via `createMediaTrackMock`
      - canvas context fixtures via `createCanvasRenderingContextMock`
  - additional migration in this continuation pass (2026-05-27):
    - added shared helpers in `tests/factories/index.js`:
      - `createCaptureStreamMock`
      - `createMediaBlobEventMock`
      - `createMediaRecorderErrorEventMock`
    - migrated inline object-literal collaborators in:
      - `tests/unit/features/capture/services/capture.service.test.js`
        - `mockCanvas`/`mockCtx` setup via `createMockCanvas` + `createCanvasRenderingContextMock`
        - stream fixtures via `createCaptureStreamMock` + `createMediaTrackMock`
        - media recorder data/error events via `createMediaBlobEventMock` + `createMediaRecorderErrorEventMock`
  - additional migration in this continuation pass (2026-05-27):
    - migrated audio-stream object literals in:
      - `tests/unit/features/streaming/services/streaming-audio.orchestrator.test.js`
        - stream fixtures in `_handleStreamStarted`, `_handleStreamStopped`, `_initializeAudioPipeline`
          via `createCaptureStreamMock` + `createMediaTrackMock`
  - additional migration in this continuation pass (2026-05-27):
    - migrated stream lifecycle inline stream/track objects in:
      - `tests/unit/features/streaming/acquisition/stream.lifecycle.test.js`
        - stream fixtures via local `createLifecycleStream` helper backed by `createMediaStreamMock` + `createMediaTrackMock`
- additional migration in this continuation turn (2026-05-27):
  - migrated remaining inline stream/device payloads in:
    - `tests/unit/features/streaming/services/streaming.service.test.js`
      - device payloads -> `createDeviceInfo`
      - stream fixtures -> `createCaptureStreamMock` and `createMediaTrackMock`
      - removed duplicate inline `discoveredDevice` declaration and normalized `_getStreamSettings` setup to shared stream factories
- Additional continuation in this continuation turn (2026-05-27):
  - migrated device/service-local payload literals in
    - `tests/unit/features/devices/services/device.service.test.js`
      - device fixtures -> `createDeviceInfo`
      - stream/track fixtures -> `createMediaStreamMock` and `createMediaTrackMock`
      - normalized selected-device/enumeration/discovery test payloads to shared factories
- additional continuation in this continuation turn (2026-05-27):
  - migrated additional inline test objects in:
    - `tests/unit/features/devices/adapters/base.adapter.test.js`
      - `mockConstraintBuilder` -> `createConstraintBuilderMock`
      - `mockStreamLifecycle` -> `createStreamLifecycleMock`
      - device/stream fixture literals -> `createDeviceInfo` and `createCaptureStreamMock`
    - `tests/unit/features/streaming/services/streaming.orchestrator.test.js`
      - stream payload -> `createCaptureStreamMock`
      - device payload -> `createDeviceInfo`
    - `tests/unit/features/streaming/services/stream-view.service.test.js`
      - stream fixture literals -> `createCaptureStreamMock` for attach/clear/integration scenarios
- additional continuation in this continuation turn (2026-05-27):
  - migrated inline stream fixture in:
    - `tests/unit/features/streaming/acquisition/acquisition.orchestrator.test.js`
      - `const mockStream = { id: 'stream-1' }` -> `createCaptureStreamMock({ id: 'stream-1' })`
- additional continuation in this continuation turn (2026-05-27):
  - migrated additional inline collaborator/payload objects in:
    - `tests/unit/features/devices/adapters/chromatic/chromatic.adapter.test.js`
      - device payloads via `createDeviceInfo`
      - stream payload via `createCaptureStreamMock`
      - acquisition coordinator via `createAcquisitionCoordinatorMock`
    - `tests/unit/features/streaming/rendering/gpu/gpu-renderer.service.test.js`
      - `mockGpuWorkerManager` -> `createGpuWorkerManagerMock`
      - `mockBitmap` payloads -> `createBitmapMock`
    - `tests/unit/features/streaming/rendering/streaming-canvas-lifecycle.service.test.js`
      - `mockCanvas`/`mockContainer`/`mockSection`/parent/newCanvas fixtures -> `createMockCanvas` + `createMockElement`
    - `tests/unit/features/streaming/rendering/viewport.service.test.js`
      - section/container/canvas/observer fixtures -> `createMockCanvas` + `createMockElement`
    - `tests/unit/ui/ui-setup.orchestrator.test.js`
      - fullscreen button stub via `createMockButton` and `createDomEventMock` for event shape consistency
- additional continuation in this continuation turn (2026-05-27):
  - completed further migration in `tests/unit/features/streaming/rendering/managers/gpu-worker-manager.class.test.js`:
    - `mockCanvas` objects -> local helper using `createMockCanvas`
    - inline bitmap fixture -> `createBitmapMock`
- additional continuation in this continuation turn (2026-05-27):
  - added shared payload/context helpers in `tests/factories/index.js`:
    - `createAcquisitionContextMock`
    - `createStreamConstraintsMock`
    - `createStreamStartedPayloadMock`
    - `createSupportedDevicePayloadMock`
  - migrated remaining inline payload object-literals in:
    - `tests/unit/shared/interfaces/interfaces.test.js` (`mockContext` via `createAcquisitionContextMock`)
    - `tests/unit/features/streaming/acquisition/acquisition.orchestrator.test.js` (`mockConstraints` via `createStreamConstraintsMock`)
    - `tests/unit/features/streaming/services/streaming.orchestrator.test.js` (`mockData`/`mockDeviceData` via payload helpers)

The audit document itself routes this work to `FUTURE_FIRST_TRACKING.md:154` with the explicit 3-Pass Review protocol because of exactly this risk. Executing it inline without that protocol would ship untracked contract decisions into the test suite. **Run the dedicated `/goal` separately.**

---

## 4. Stale Build & Compilation Scripts — ❌ AUDIT PREMISE INCORRECT; consolidation not recommended

### Investigation
The audit recommended consolidating `scripts/codebase-phase1-drift-report.js` (956 LOC) and `scripts/codebase-size-report.js` (824 LOC) into `scripts/architecture-scorecard.js` (1481 LOC). This was investigated and **rejected based on evidence**.

### Findings
- `architecture-scorecard.js` **already imports** from `codebase-size-report.js`:
  ```
  scripts/architecture-scorecard.js:7: import { getShaderDuplicateStatus } from './codebase-size-report.js';
  ```
- The three scripts enforce **complementary concerns**, not duplicate ones:
  - `codebase-size-report.js`: file extensions, area prefixes, shader duplicate detection between `packages/prismgb-gpu/` and `src/renderer/`, LOC thresholds.
  - `codebase-phase1-drift-report.js`: manifest synchronization (IPC channel maps, event manifest, device manifest, settings definitions, render-passes contract, architecture and platforms manifests).
  - `architecture-scorecard.js`: layer boundary analysis, contract pattern enforcement, type debt tracking.
- Consolidating ~1780 LOC of distinct logic into the scorecard would produce a single 3000+ LOC mega-script and degrade separation-of-concerns — the opposite of the user's architectural philosophy in `CLAUDE.md` ("Clean Separation of Concerns: Every file has a single, well-defined responsibility").

### Recommendation
**Do not consolidate.** Update the audit's Section 4 to mark these scripts as **retained**. If naming clarity is desired, consider renaming:
- `codebase-phase1-drift-report.js` → `manifest-drift-report.js`
- `codebase-size-report.js` → already self-describing

Both scripts remain in `release:preflight` as before. No action required.

### Re-check (2026-05-27)
- `release:preflight` still includes:
  - `npm run architecture:scorecard -- --enforce-thresholds ...`
  - `npm run codebase:phase1 -- --json`
  - `npm run codebase:size -- --enforce-thresholds`
- Script command mappings remain one-to-one:
  - `architecture:scorecard` → `scripts/architecture-scorecard.js`
  - `codebase:phase1` → `scripts/codebase-phase1-drift-report.js`
  - `codebase:size` → `scripts/codebase-size-report.js`

---

## Audit Execution Summary (2026-05-27)

| Section | Status | Action |
|---|---|---|
| 1. Awilix removal | ✅ Complete | Package uninstalled; src/, scripts/, configs cleaned; verified by typecheck + lint |
| 2. codebase-reduction tests | ✅ Complete (pre-session) | Directory verified absent |
| 3. Test mock cleanup | ⚠️ Partial; routes to dedicated `/goal` | 4 orphaned tests deleted; 48 mock/contract/alias alignments; 270+ failures remain for `/goal` at `FUTURE_FIRST_TRACKING.md:154` |
| 4. Script consolidation | ❌ Not executed (premise rejected) | Investigation found the three scripts are complementary, not redundant. Consolidation would degrade architecture. |
