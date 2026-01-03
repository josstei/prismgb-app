# Feature Map

This document maps user-facing features to the codebase for maintenance and onboarding.

## User-Facing Features

- Live streaming from Mod Retro Chromatic with GPU rendering and Canvas2D fallback.
- Render presets: True Color, Vibrant, Hi-Def, Vintage, Pixel, Performance.
- Brightness and volume controls with real-time preview.
- Cinematic mode and fullscreen viewing (optional fullscreen-on-startup).
- Screenshots (PNG) and recordings (WebM).
- Notes panel with search, autosave, and local persistence.
- Status strip with device state, resolution, and FPS.
- Update checks, downloads, and install flow in Settings.
- System tray integration (background device monitoring, show window, refresh, quit).

## Feature Modules and Ownership

| Feature | Primary directories | Notes |
| --- | --- | --- |
| Streaming and rendering | `src/renderer/features/streaming`, `src/shared/streaming` | GPU pipeline, render presets, health checks, audio warmup |
| Capture (screenshots/recording) | `src/renderer/features/capture`, `src/shared/utils/filename-generator.utils.js` | PNG screenshots, WebM recordings |
| Devices and adapters | `src/renderer/features/devices`, `src/main/features/devices`, `src/shared/features/devices` | USB detection, device registry, adapters |
| Settings and display modes | `src/renderer/features/settings`, `src/shared/config/storage-keys.config.js` | Cinematic, fullscreen, performance mode, status strip |
| Notes | `src/renderer/features/notes`, `src/shared/config/storage-keys.config.js` | Notes CRUD and search |
| Updates | `src/main/features/updates`, `src/renderer/features/updates`, `src/preload/index.js` | electron-updater + renderer UI |
| UI shell | `src/renderer/ui`, `src/renderer/assets` | Templates, components, effects |
| App lifecycle and performance | `src/renderer/application`, `src/main/app.orchestrator.js` | Orchestrators and performance state |
| IPC and preload bridge | `src/shared/ipc`, `src/preload/index.js` | Shared channel definitions |

## UI Surface Map (Renderer)

| Surface | Template | Component(s) | Orchestrator/Bridge |
| --- | --- | --- | --- |
| Header + Settings | `src/renderer/ui/templates/header.template.js` | `SettingsMenuComponent`, `UpdateSectionComponent`, `DeviceStatusComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Stream viewer + toolbar | `src/renderer/ui/templates/stream-viewer.template.js` | `StreamingControlsComponent`, `StreamingShaderSelectorComponent` | `UISetupOrchestrator`, `UIEventBridge` |
| Notes panel | `src/renderer/ui/templates/notes-panel.template.js` | `NotesPanelComponent` | `UISetupOrchestrator` |
| Status footer | `src/renderer/ui/templates/status-footer.template.js` | `StatusNotificationComponent`, `DeviceStatusComponent` | `UIEventBridge` |

## UI Flows (Renderer)

UI input is wired in `src/renderer/ui/orchestration/ui-setup.orchestrator.js`. UI updates are applied via `src/renderer/ui/orchestration/ui-event.bridge.js` or `src/renderer/ui/orchestration/capture-ui.bridge.js`.

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
2. `CaptureOrchestrator` starts/stops recording (GPU path via `GpuRecordingService` when active).
3. `CaptureService` emits `capture:recording-started`, `capture:recording-stopped`, and `capture:recording-ready`.
4. `CaptureUIBridge` updates the record button state and triggers download/status messages.

### Shader Presets, Brightness, Volume

1. Shader panel updates settings via `SettingsService.setRenderPreset`, `setGlobalBrightness`, `setVolume`.
2. Settings events emit `settings:render-preset-changed`, `settings:brightness-changed`, `settings:volume-changed`.
3. `StreamingOrchestrator` listens for preset changes and updates the render pipeline.
4. `StreamingShaderSelectorComponent` listens for brightness/volume updates to keep UI in sync.

### Performance Mode

1. Settings toggle calls `SettingsService.setPerformanceMode`.
2. `settings:performance-mode-changed` updates `PerformanceStateOrchestrator`, which emits `performance:render-mode-changed`.
3. `StreamingOrchestrator` switches to Canvas2D rendering when performance mode is enabled.

### Fullscreen and Cinematic Mode

1. Fullscreen button -> `ui:fullscreen-toggle-requested`.
2. `SettingsDisplayModeOrchestrator` toggles `SettingsFullscreenService`.
3. `SettingsFullscreenService` emits `ui:fullscreen-state`.
4. `UIEventBridge` updates fullscreen UI and control auto-hide.
5. Cinematic toggle -> `ui:cinematic-toggle-requested` -> `SettingsCinematicModeService` -> `settings:cinematic-mode-changed`.

### Notes Panel

1. Notes button toggles `NotesPanelComponent`.
2. Create/update/delete actions call `NotesService` methods.
3. Notes events emit `notes:note-created`, `notes:note-updated`, and `notes:note-deleted`.

### Update Check and Install

1. Settings update action button calls `UpdateOrchestrator` (check/download/install).
2. `UpdateService` uses `window.updateAPI` to call IPC and emits `update:*` events.
3. `UpdateUiService` publishes status messages and badge visibility.
4. `UpdateSectionComponent` listens for `update:state-changed` and `update:progress` to refresh UI.

## Data and Storage

- Downloads location: screenshots and recordings go to the OS downloads folder.
- Local storage keys: settings and notes live in localStorage, defined in `src/shared/config/storage-keys.config.js`.
- Stored device IDs: `src/renderer/features/devices/services/device-storage.service.js`.

## Screenshots

Screenshots will not be added to this repository.

## Extension Points

### Add a New Device

1. Register metadata in `src/shared/features/devices/device.registry.js`.
2. Add a profile class in `src/main/features/devices` and register it.
3. Add an adapter in `src/renderer/features/devices` and register it.
4. Update docs and tests if behavior changes.

### Add a Render Preset

1. Update `src/renderer/features/streaming/rendering/presets/streaming-render-presets.config.js`.
2. Ensure UI labels and descriptions read well.
3. Consider performance mode interactions.

### Add a New Setting

1. Add a storage key in `src/shared/config/storage-keys.config.js`.
2. Update `src/renderer/features/settings/services/settings.service.js`.
3. Wire UI in `src/renderer/features/settings/ui`.
