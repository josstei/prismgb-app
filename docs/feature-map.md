# Feature Map

This document maps user-facing features to the codebase for maintenance and onboarding.

## User-Facing Features

- Live streaming from Mod Retro Chromatic with GPU rendering and Canvas2D fallback.
- Render presets: True Color, Vibrant, Hi-Def, Vintage, Pixel, Performance.
- Brightness and volume controls with real-time preview.
- Cinematic mode and fullscreen viewing (optional fullscreen-on-startup).
- Screenshots (PNG) and recordings (WebM, MP4, or MOV with ffmpeg transcoding).
- Notes panel with search, autosave, and local persistence.
- Status strip with device state, resolution, and FPS.
- Update checks, downloads, and install flow in Settings.
- System tray integration (background device monitoring, show window, refresh, quit).

## Feature Modules and Ownership

| Feature | Primary directories | Notes |
| --- | --- | --- |
| Streaming and rendering | `src/renderer/infrastructure/services/streaming`, `src/renderer/infrastructure/rendering` | GPU pipeline, render presets, health checks, audio warmup |
| Capture (screenshots/recording) | `src/renderer/infrastructure/services/capture` | PNG screenshots, recordings with format selection |
| Transcode | `src/main/infrastructure/transcode`, `src/renderer/infrastructure/services/transcode`, `src/shared/features/transcode` | FFmpeg-based transcoding for MP4/MOV output |
| Devices and adapters | `src/renderer/infrastructure/services/devices`, `src/renderer/infrastructure/adapters/devices`, `src/main/infrastructure/devices`, `src/shared/features/devices` | USB detection, device registry, adapters |
| Settings and display modes | `src/renderer/infrastructure/services/settings`, `src/shared/config/storage-keys.config.ts` | Cinematic, fullscreen, performance mode, status strip |
| Notes | `src/renderer/infrastructure/services/notes`, `src/shared/config/storage-keys.config.ts` | Notes CRUD and search |
| Updates | `src/main/infrastructure/updates`, `src/renderer/infrastructure/services/updates`, `src/preload/index.js` | electron-updater + renderer UI |
| UI shell | `src/renderer/presentation`, `src/renderer/assets` | Templates, components, effects |
| App lifecycle and performance | `src/renderer/application`, `src/renderer/application/di`, `src/main/application` | Orchestrators, DI registration modules, performance state |
| IPC and preload bridge | `src/shared/ipc`, `src/preload/index.js` | Shared channel definitions |

## UI Surface Map (Renderer)

| Surface | Template | Component(s) | Orchestrator/Bridge |
| --- | --- | --- | --- |
| Header + Settings | `src/renderer/presentation/shell/header.template.js` | `SettingsMenuComponent`, `UpdateSectionComponent`, `DeviceStatusComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Stream viewer + toolbar | `src/renderer/presentation/features/streaming/stream-viewer.template.js` | `StreamingControlsComponent`, `ShaderSelectorComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Notes panel | `src/renderer/presentation/features/notes/notes-panel.template.js` | `NotesPanelComponent` | `UISetupOrchestrator` |
| Status footer | `src/renderer/presentation/shell/status-footer.template.js` | `StatusNotificationComponent`, `DeviceStatusComponent` | `UIEventBridge` |
| Transcode toast | `src/renderer/presentation/features/streaming/stream-viewer.template.js` | `TranscodeToastComponent` | `TranscodeUIBridge` |

## UI Flows (Renderer)

UI input is wired in `src/renderer/application/orchestrators/ui-setup.orchestrator.ts`. UI updates are applied via `src/renderer/presentation/bridges/ui-event.bridge.ts`, `src/renderer/presentation/bridges/capture-ui.bridge.ts`, `src/renderer/presentation/bridges/transcode-ui.bridge.ts`, or `src/renderer/presentation/bridges/update-ui.bridge.ts`.

### Start Streaming

1. User clicks the overlay -> `ui:stream-start-requested`.
2. `StreamingOrchestrator` calls `StreamingService.start`.
3. `StreamingService` emits `stream:started`.
4. `StreamingOrchestrator` starts the render pipeline and publishes `ui:streaming-mode`, `ui:stream-info`, and `ui:status-message`.
5. `UIEventBridge` updates controls, overlay, and stream info.

### Stop Streaming

1. User clicks the stream view -> `ui:stream-stop-requested`.
2. `StreamingOrchestrator` calls `StreamingService.stop`.
3. `StreamingService` emits `stream:stopped`.
4. `StreamingOrchestrator` stops the render pipeline and publishes `ui:streaming-mode` (false) and `ui:overlay-message`.

### Screenshot Capture

1. User clicks the screenshot button -> `ui:screenshot-requested`.
2. `CaptureOrchestrator` publishes `ui:shutter-flash` and `capture:screenshot-triggered`, then calls `CaptureService.takeScreenshot`.
3. `CaptureService` emits `capture:screenshot-ready`.
4. `CaptureUIBridge` triggers the download and publishes `ui:status-message`.

### Recording Start/Stop

1. User clicks the record button -> `ui:recording-toggle-requested`.
2. `CaptureOrchestrator` starts/stops recording (GPU path via `CaptureGpuRecordingService` when active).
3. `CaptureService` emits `capture:recording-started`, `capture:recording-stopped`, and `capture:recording-ready`.
4. `CaptureOrchestrator` calls `CaptureSaveService.saveRecording`, which checks the user's format preference:
   - If WebM: direct download via `CaptureSaveService._directSave`.
   - If MP4/MOV: sends blob to `TranscodeService` (main process) for ffmpeg conversion.
5. During transcoding, `TranscodeUIBridge` shows progress toast and updates the record button with percentage.
6. On completion, `CaptureOrchestrator` publishes `ui:status-message` for direct saves; `TranscodeUIBridge` handles status for transcoded saves.

### Recording Format Selection

1. User selects format in Settings dropdown -> `SettingsService.setRecordingFormat`.
2. `settings:recording-format-changed` event updates UI.
3. Format preference is persisted to localStorage and used when saving recordings.

### Shader Presets, Brightness, Volume

1. Shader panel updates settings via `SettingsService.setRenderPreset`, `setGlobalBrightness`, `setVolume`.
2. Settings events emit `settings:render-preset-changed`, `settings:brightness-changed`, `settings:volume-changed`.
3. `StreamingOrchestrator` listens for preset changes and updates the render pipeline.
4. `ShaderSliderControlsComponent` listens for brightness/volume updates to keep UI in sync.

### Performance Mode

1. Settings toggle calls `SettingsService.setPerformanceMode`.
2. `settings:performance-mode-changed` updates `PerformanceOrchestrator`, which emits `performance:render-mode-changed`.
3. `StreamingOrchestrator` switches to Canvas2D rendering when performance mode is enabled.

### Fullscreen and Cinematic Mode

1. Fullscreen button -> `ui:fullscreen-toggle-requested`.
2. `SettingsDisplayModeOrchestrator` toggles `SettingsFullscreenService`.
3. `SettingsFullscreenService` emits `ui:fullscreen-state`.
4. `UIEventBridge` updates fullscreen UI and control auto-hide.
5. Cinematic toggle -> `ui:cinematic-toggle-requested` -> `PresentationModeService` -> `settings:cinematic-mode-changed`.

### Notes Panel

1. Notes button toggles `NotesPanelComponent`.
2. Create/update/delete actions call `NotesService` methods.
3. Notes events emit `notes:note-created`, `notes:note-updated`, and `notes:note-deleted`.

### Update Check and Install

1. Settings update action button calls `UpdateService` (check/download/install).
2. `UpdateService` uses `window.updateAPI` to call IPC and emits `update:*` events.
3. `UpdateUIBridge` publishes status messages and badge visibility.
4. `UpdateSectionComponent` listens for `update:state-changed` and `update:progress` to refresh UI.

## Data and Storage

- Downloads location: screenshots and recordings go to the OS downloads folder.
- Local storage keys: settings and notes live in localStorage, defined in `src/shared/config/storage-keys.config.ts`.
- Stored device IDs: `src/renderer/infrastructure/services/devices/device-storage.service.ts`.
- Transcode temp files: during MP4/MOV conversion, temporary files are created in the system temp directory and cleaned up after completion or cancellation.

## Screenshots

Screenshots will not be added to this repository.

## Extension Points

### Add a New Device

1. Register metadata in `src/shared/features/devices/device.registry.js`.
2. Add a profile class in `src/shared/features/devices/profiles/` and register it in `src/main/infrastructure/devices/device-profile.registry.ts`.
3. Add an adapter in `src/renderer/infrastructure/adapters/devices/<device-name>/` and register it.
4. Update docs and tests if behavior changes.

### Add a Render Preset

1. Add a new preset file in `packages/prismgb-gpu/src/domain/presets/presets/` implementing the `IPreset` interface.
2. Register it with `PresetRegistry.register()` and import it in `packages/prismgb-gpu/src/index.ts`.
3. Ensure UI labels and descriptions read well (`PresetRegistry.getForUI()` provides the list).
4. Consider performance mode interactions.

### Add a New Setting

1. Add a storage key in `src/shared/config/storage-keys.config.ts`.
2. Update `src/renderer/infrastructure/services/settings/settings.service.ts`.
3. Wire UI in `src/renderer/presentation/features/settings`.

## Architecture Guardrails

- Renderer infrastructure timing values come from `src/shared/config/timing.config.ts`.
- IPC handlers import channels through `src/shared/ipc/channels.config.js`.
- Active runtime paths do not use `@core` imports.
