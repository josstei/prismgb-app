# Feature Map

This document maps user-facing features to the codebase for maintenance and onboarding.

## User-Facing Features

Primary surfaces: live Mod Retro Chromatic streaming with GPU rendering and Canvas2D fallback; True Color, Vibrant, Hi-Def, Vintage, Pixel, and Performance render presets; brightness and volume controls; cinematic/fullscreen viewing; PNG screenshots; WebM, MP4, and MOV recording with ffmpeg transcoding; searchable autosaved notes; device/resolution/FPS status; Settings update flow; and system tray device monitoring.

## Generated Manifest Map

This section is generated from architecture, device, and settings manifests. Keep narrative details outside the markers.

<!-- CODEBASE_PHASE1_MANIFESTS:START -->
| Surface | Count |
| --- | ---: |
| IPC namespaces | 8 |
| IPC channels | 29 |
| Renderer events | 75 |
| Main events | 3 |
| Device profiles | 1 |
| Settings definitions | 10 |
| Render passes | 4 |
| Architecture aliases | 6 |
| Platform targets | 5 |
<!-- CODEBASE_PHASE1_MANIFESTS:END -->

<!-- CODEBASE_FEATURE_MAP:START -->
| Manifest surface | Generated facts |
| --- | --- |
| Architecture paths | aliases: `@`, `@main`, `@renderer`, `@preload`, `@prismgb/gpu`, `url`; layers: `main/entry`, `main/application`, `main/infrastructure`, `main/ipc`, `renderer/entry`, `renderer/application`, `renderer/infrastructure`, `renderer/presentation`, `preload`; retired: `@core`, `@shared`, `shared` |
| Devices | Mod Retro Chromatic (`0x374e:0x0101`, 160x144, fixture `Chromatic`) |
| Settings UI | `launchOnLogin` -> `settingLaunchOnLogin`, `statusStripVisible` -> `settingStatusStrip`, `fullscreenOnStartup` -> `settingFullscreenOnStartup`, `autoStreamOnConnect` -> `settingAutoStreamOnConnect`, `minimalistFullscreen` -> `settingMinimalistFullscreen`, `performanceMode` -> `settingAnimationSaver`, `recordingFormat` -> `settingRecordingFormat` |
| Startup preferences | `gameVolume`, `statusStripVisible`, `performanceMode`, `minimalistFullscreen` |
<!-- CODEBASE_FEATURE_MAP:END -->

## UI Surface Map (Renderer)

| Surface | Template | Component(s) | Orchestrator/Bridge |
| --- | --- | --- | --- |
| Header + Settings | `src/renderer/presentation/shell/header.template.ts` | `SettingsMenuComponent`, `UpdateSectionComponent`, `DeviceStatusComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Stream viewer + toolbar | `src/renderer/presentation/features/streaming/stream-viewer.template.ts` | `StreamingControlsComponent`, `ShaderSelectorComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Notes panel | `src/renderer/presentation/features/notes/notes-panel.template.ts` | `NotesPanelComponent` | `UISetupOrchestrator` |
| Status footer | `src/renderer/presentation/shell/status-footer.template.ts` | `StatusNotificationComponent`, `DeviceStatusComponent` | `UIEventBridge` |
| Transcode toast | `src/renderer/presentation/features/streaming/stream-viewer.template.ts` | `TranscodeToastComponent` | `TranscodeUIBridge` |

## UI Flows (Renderer)

UI input is wired in `src/renderer/application/orchestrators/ui-setup.orchestrator.ts` from template action descriptors, and deferred component startup follows the generated component ID list in `src/renderer/presentation/primitives/template-dom.contract.ts`. UI updates are applied via `src/renderer/presentation/bridges/ui-event.bridge.ts`, `src/renderer/presentation/bridges/capture-ui.bridge.ts`, or `src/renderer/presentation/bridges/transcode-ui.bridge.ts`.

| Flow | Event path |
| --- | --- |
| Start streaming | overlay -> `ui:stream-start-requested` -> `StreamingService.start` -> `stream:started` -> render pipeline publishes `ui:streaming-mode`, `ui:stream-info`, and `ui:status-message` -> `UIEventBridge` updates controls |
| Stop streaming | stream view -> `ui:stream-stop-requested` -> `StreamingService.stop` -> `stream:stopped` -> render pipeline stops and publishes `ui:streaming-mode` false plus `ui:overlay-message` |
| Screenshot | screenshot button -> `ui:screenshot-requested` -> `CaptureOrchestrator` publishes `ui:shutter-flash` and `capture:screenshot-triggered` -> `capture:screenshot-ready` -> `CaptureUIBridge` downloads |
| Recording | record button -> `ui:recording-toggle-requested` -> `CaptureOrchestrator` starts/stops capture -> `capture:recording-*`; saves use direct WebM download or MP4/MOV `TranscodeService` conversion surfaced by `TranscodeUIBridge` |
| Recording format | Settings format dropdown -> `SettingsService.setSetting('recordingFormat', value)` -> `settings:recording-format-changed` persists and drives later saves |
| Shader/brightness/volume | shader panel settings -> `settings:render-preset-changed`, `settings:brightness-changed`, and `settings:volume-changed` -> render pipeline and slider UI sync |
| Performance mode | Settings toggle -> `settings:performance-mode-changed` -> `performance:render-mode-changed` -> `StreamingOrchestrator` switches to Canvas2D when enabled |
| Device connect/disconnect | `window.deviceAPI` preload subscriptions -> manifest-backed `device:connected` / `device:disconnected` EventBus events -> `DeviceOrchestrator` queues sequenced connect/disconnect handling |
| Fullscreen/cinematic | fullscreen button -> `ui:fullscreen-toggle-requested` -> `ui:fullscreen-state`; cinematic toggle -> `ui:cinematic-toggle-requested` -> `settings:cinematic-mode-changed` |
| Notes | notes button toggles `NotesPanelComponent`; create/update/delete actions call `NotesService` and emit `notes:note-*` |
| Updates | Settings update action -> `UpdateOrchestrator` check/download/install -> `window.updateAPI` IPC -> `update:*` events -> `UpdateSectionComponent` refreshes progress and state |

## Data and Storage

Screenshots and recordings download to the OS downloads folder. Settings keys live in `src/renderer/lib/settings.definitions.json`, shared protected and notes keys live in `src/renderer/lib/storage-keys.config.ts`, stored device IDs live in `src/renderer/infrastructure/services/device-storage.service.ts`, and MP4/MOV transcode temp files are created in the system temp directory and cleaned up after completion or cancellation.

## Screenshots

Screenshots will not be added to this repository.

## Extension Points

### Add a New Device

1. Register manifest metadata in `packages/prismgb-devices/src/device.manifest.json`.
2. Add a profile class in `packages/prismgb-devices/src/profiles/` and register it in `src/main/infrastructure/devices/device-profile.registry.ts`.
3. Add an adapter in `src/renderer/infrastructure/adapters/devices/<device-name>/` and register it.
4. Update docs and tests if behavior changes.

### Add a Render Preset

1. Define the `IPreset` in `packages/prismgb-gpu/src/domain/presets/preset-definitions.ts`.
2. Add the preset to `BUILT_IN_PRESETS` with any needed metadata such as `isDefault` or `visibleInUI`.
3. Update `PRESET_POLICY` only when changing the package default, renderer default, or performance-mode preset id.
4. Let `packages/prismgb-gpu/src/index.ts` bulk-register `BUILT_IN_PRESETS` through `PresetRegistry.registerMany()`; avoid per-preset imports or one-off registry calls.
5. Ensure UI labels and descriptions read well (`PresetRegistry.getForUI()` provides the visible list) and consider performance mode interactions.

### Add a New Setting

1. Add the setting definition, storage key, default, type, and event in `src/renderer/lib/settings.definitions.json`.
2. Update UI wiring in `src/renderer/presentation/features/settings`.

## Architecture Guardrails

- Renderer infrastructure timing values come from `packages/prismgb-config/src/timing.config.ts` (imported via `@prismgb/config`).
- IPC handlers import manifest-derived channels from `packages/prismgb-ipc/src/ipc.manifest.ts` (imported via `@prismgb/ipc`).
- Preload API and method descriptors are marker-generated from `packages/prismgb-ipc/src/ipc.manifest.json`.
- Active runtime paths do not use `@core` imports.
