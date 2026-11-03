# Feature Map

<!-- Source: src/platform/devices/domain/catalog.json, src/platform/devices/domain/catalog.ts, src/main/infrastructure/devices/device-integration.service.ts, src/renderer/infrastructure/services/devices/device-runtime.service.ts, src/renderer/infrastructure/services/streaming/device-media-acquirer.service.ts, tests/devices/media.testkit.ts -->

This document maps user-facing features to the codebase for maintenance and onboarding.

## User-Facing Features

Primary surfaces: live Mod Retro Chromatic streaming with GPU rendering and Canvas2D fallback; True Color, Vibrant, Hi-Def, Vintage, Pixel, and Performance render presets; brightness and volume controls; cinematic/fullscreen viewing; PNG screenshots; WebM, MP4, and MOV recording with ffmpeg transcoding; searchable autosaved notes; device/resolution/FPS status; Settings update flow; and system tray device monitoring.

## Manifest Map

The tables below map manifest owners to application behavior. Counts are intentionally omitted so adding a definition does not require a parallel documentation edit.

| Manifest surface | Defined behavior |
| --- | --- |
| Architecture paths | `scripts/lib/workspace-aliases.mjs` declares process and platform entrypoints; TypeScript paths are generated from it |
| Devices | Mod Retro Chromatic (`0x374e:0x0101`, 160x144, fixture `Chromatic`) |
| Settings UI | `launchOnLogin` -> `settingLaunchOnLogin`, `statusStripVisible` -> `settingStatusStrip`, `fullscreenOnStartup` -> `settingFullscreenOnStartup`, `autoStreamOnConnect` -> `settingAutoStreamOnConnect`, `minimalistFullscreen` -> `settingMinimalistFullscreen`, `performanceMode` -> `settingAnimationSaver`, `recordingFormat` -> `settingRecordingFormat` |
| Startup preferences | `gameVolume`, `statusStripVisible`, `performanceMode`, `minimalistFullscreen` |

## UI Surface Map (Renderer)

| Surface | Template | Component(s) | Orchestrator/Bridge |
| --- | --- | --- | --- |
| Header + Settings | `src/renderer/presentation/shell/header.template.ts` | `SettingsMenuComponent`, `UpdateSectionComponent`, `DeviceStatusComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Stream viewer + toolbar | `src/renderer/presentation/features/streaming/stream-viewer.template.ts` | `StreamingControlsComponent`, `ShaderSelectorComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Notes panel | `src/renderer/presentation/features/notes/notes-panel.template.ts` | `NotesPanelComponent` | `UISetupOrchestrator` |
| Status footer | `src/renderer/presentation/shell/status-footer.template.ts` | `StatusNotificationComponent`, `DeviceStatusComponent` | `UIEventBridge` |
| Transcode toast | `src/renderer/presentation/features/streaming/stream-viewer.template.ts` | `TranscodeToastComponent` | `TranscodeUIBridge` |

## UI Flows (Renderer)

UI input is wired in `src/renderer/application/orchestrators/ui-setup.orchestrator.ts` from template action descriptors, and deferred component startup follows the derived component ID list in `src/renderer/presentation/primitives/template-dom.contract.ts`. UI updates are applied via `src/renderer/presentation/bridges/ui-event.bridge.ts`, `src/renderer/presentation/bridges/capture-ui.bridge.ts`, or `src/renderer/presentation/bridges/transcode-ui.bridge.ts`.

| Flow | Event path |
| --- | --- |
| Start streaming | overlay -> `ui:stream-start-requested` -> `StreamingService.start` -> `stream:started` -> render pipeline publishes `ui:streaming-mode`, `ui:stream-info`, and `ui:status-message` -> `UIEventBridge` updates controls |
| Stop streaming | stream view -> `ui:stream-stop-requested` -> `StreamingService.stop` -> `stream:stopped` -> render pipeline stops and publishes `ui:streaming-mode` false plus `ui:overlay-message` |
| Screenshot | screenshot button -> `ui:screenshot-requested` -> `CaptureOrchestrator` publishes `ui:shutter-flash` and `capture:screenshot-triggered` -> `capture:screenshot-ready` -> `CaptureUIBridge` downloads |
| Recording | record button -> `ui:recording-toggle-requested` -> `CaptureOrchestrator` starts/stops capture -> `capture:recording-*`; saves use direct WebM download or MP4/MOV `TranscodeService` conversion surfaced by `TranscodeUIBridge` |
| Recording format | Settings format dropdown -> `SettingsService.setSetting('recordingFormat', value)` -> `settings:recording-format-changed` persists and drives later saves |
| Shader/brightness/volume | shader panel settings -> `settings:render-preset-changed`, `settings:brightness-changed`, and `settings:volume-changed` -> render pipeline and slider UI sync |
| Performance mode | Settings toggle -> `settings:performance-mode-changed` -> `performance:render-mode-changed` -> `StreamingOrchestrator` switches to Canvas2D when enabled |
| Device connect/disconnect | `DeviceConnectionService` reconciles USB status -> `DeviceIntegrationService` updates tray/window state and emits directly to `IpcPushBridge` -> `appRouter` device subscriptions relay through `TrpcDeviceStatusPort` -> `RendererDeviceRuntime` refreshes renderer device events and UI state |
| Fullscreen/cinematic | fullscreen button -> `ui:fullscreen-toggle-requested` -> `ui:fullscreen-state`; cinematic toggle -> `ui:cinematic-toggle-requested` -> `settings:cinematic-mode-changed` |
| Notes | notes button toggles `NotesPanelComponent`; create/update/delete actions call `NotesService` and emit `notes:note-*` |
| Updates | Settings update action -> `UpdateService` check/download/install -> `trpcClient.update.*` procedures and subscriptions -> `update:*` events -> `UpdateSectionComponent` refreshes progress and state |

## Data and Storage

Screenshots and recordings download to the OS downloads folder. Settings keys live in `src/renderer/lib/settings.definitions.ts`, shared protected and notes keys live in `src/renderer/lib/storage-keys.config.ts`, stored media-device IDs are managed by `StorageDevicePreferenceStore` in `src/renderer/infrastructure/services/devices/storage-device-preference.store.ts`, and MP4/MOV transcode temp files are created in the system temp directory and cleaned up after completion or cancellation.

## Screenshots

Screenshots will not be added to this repository.

## Extension Points

### Add a New Device

1. Register device metadata in `src/platform/devices/domain/catalog.json`.
2. Extend `src/platform/devices/domain/types.ts` and `src/platform/devices/domain/catalog.ts` only if the catalog schema needs a new field.
3. Use the shared `DeviceCatalog` and payload helpers from `@platform/devices`; individual hardware models should not get their own runtime classes.
4. Update `tests/devices/*` so fixtures, media doubles, and E2E helpers read from `@platform/devices/testkit`.
5. Update docs and tests if behavior changes.

Device test entry points:
- `tests/devices/media.testkit.ts`: catalog-backed descriptor constants, USB/media specs, payload builders, frame data, and browser media doubles.

Do not hand-write device fixture classes or duplicate catalog constants in individual tests.

### Add a Render Preset

1. Define the `RenderPreset` in `src/platform/gpu/domain/presets.ts`.
2. Add the preset to `BUILT_IN_PRESETS` with any needed metadata such as `visibleInUI`.
3. Update `PRESET_POLICY` only when changing the package default, renderer default, or performance-mode preset id.
4. Use `BUILT_IN_PRESET_CATALOG` in `src/platform/gpu/domain/presets.ts` as the default catalog, and `getUiPresets`, `resolvePreset`, `PRESET_POLICY` from `@platform/gpu`; do not add mutable preset registries or import-time registration.
5. Ensure UI labels and descriptions read well and consider performance-mode interactions.

### Add a New Setting

1. Add a typed definition with its storage key, default, validation, optional event, and control metadata in `src/renderer/lib/settings.definitions.ts`.
2. Use the inferred setting type through `SettingsService.getSetting`/`setSetting`; controls and E2E metadata derive from the same definitions.
3. Preserve existing keys, defaults, and serialized values. OS-owned preferences such as login-item state remain backed by their platform API.

## Architecture Guardrails

- Renderer infrastructure timing values come from `src/platform/config/timing.config.ts` (imported via `@platform/config`).
- Requests derive from the tRPC router. `IPC_CHANNELS` and `IpcPushPublisher` describe only typed main-to-renderer push events.
- Main IPC behavior is implemented in `src/main/ipc/router.ts` with schema validation in `src/main/ipc/schemas`.
- `createMainRuntime` and `createRendererRuntime` construct process dependencies and own startup rollback and ordered disposal.
- `StreamingRenderService` owns render-session replacement and cancellation; pass specifications derive uniform layouts and shader declarations.
- Notes use one `NotesService.updateNote` mutation path; search selects matching notes while the list inserts highlighted text safely.
