# Architecture Diagrams (Onboarding)

This document is a simplified view of the core flows. It favors readability over completeness.

Related docs:
- `docs/feature-map.md`
- `docs/naming-conventions.md`

Legend
- Solid edges: direct dependency (constructor injection).
- Dashed labeled edges: indirect communication via EventBus.
- Dashed unlabeled edges: error/cleanup or retry path.
- IPC edges are labeled.

## 1) App Startup (Renderer)

```mermaid
flowchart LR
  RendererAppOrchestrator[RendererAppOrchestrator]
  UIEventBridge[UIEventBridge]
  AppOrchestrator[AppOrchestrator]

  RendererAppOrchestrator --> UIEventBridge
  RendererAppOrchestrator --> AppOrchestrator
```

## 2) UI Events to Streaming

```mermaid
flowchart LR
  UISetupOrchestrator[UISetupOrchestrator]
  StreamingOrchestrator[StreamingOrchestrator]
  StreamingService[StreamingService]
  DeviceOrchestrator[DeviceOrchestrator]
  DeviceMediaService[DeviceMediaService]
  DeviceStorageService[DeviceStorageService]
  DeviceOperationSequencerService[DeviceOperationSequencerService]
  DeviceIpcAdapter[DeviceIpcAdapter]
  UIEventBridge[UIEventBridge]

  UISetupOrchestrator -. "ui:stream-start/stop-requested" .-> StreamingOrchestrator
  StreamingOrchestrator --> StreamingService
  StreamingOrchestrator -. "ui:streaming-mode, ui:stream-info" .-> UIEventBridge
  DeviceOrchestrator --> DeviceMediaService
  DeviceOrchestrator --> DeviceStorageService
  DeviceOrchestrator --> DeviceOperationSequencerService
  DeviceOrchestrator --> DeviceIpcAdapter
  StreamingService --> DeviceMediaService
```

## 3) Capture and GPU Recording

```mermaid
flowchart LR
  CaptureOrchestrator[CaptureOrchestrator]
  CaptureService[CaptureService]
  CaptureSaveService[CaptureSaveService]
  CaptureGpuRecordingService[CaptureGpuRecordingService]

  CaptureOrchestrator --> CaptureService
  CaptureOrchestrator --> CaptureSaveService
  CaptureOrchestrator --> CaptureGpuRecordingService
```

Note: `CaptureSaveService` handles format selection (WebM direct download, or MP4/MOV via ffmpeg transcode in main process). See `docs/architecture-diagrams.md` for the full transcode flow.

## 4) Performance and Metrics

```mermaid
flowchart LR
  AppOrchestrator[AppOrchestrator]
  PerformanceOrchestrator[PerformanceOrchestrator]
  PerformanceAnimationService[PerformanceAnimationService]
  PerformanceStateService[PerformanceStateService]
  PerformanceMetricsService[PerformanceMetricsService]

  AppOrchestrator --> PerformanceOrchestrator
  PerformanceOrchestrator --> PerformanceAnimationService
  PerformanceOrchestrator --> PerformanceStateService
  PerformanceOrchestrator --> PerformanceMetricsService
```

## 5) Main Process IPC and Services

```mermaid
flowchart LR
  AppOrchestrator["AppOrchestrator (Main)"]
  IpcHandlerRegistry[IpcHandlerRegistry]
  TrayService[TrayService]
  DeviceBridge[DeviceBridgeService]
  UpdateBridge[UpdateBridge]
  DeviceServiceMain[DeviceServiceMain]
  UpdateServiceMain[UpdateServiceMain]
  TranscodeServiceMain[TranscodeServiceMain]
  UsbDetection[usb-detection]
  AutoUpdater[electron-updater]
  FFmpeg[ffmpeg-static]

  AppOrchestrator --> IpcHandlerRegistry
  AppOrchestrator --> TrayService
  AppOrchestrator --> DeviceBridge
  AppOrchestrator --> UpdateBridge

  IpcHandlerRegistry --> DeviceServiceMain
  IpcHandlerRegistry --> UpdateServiceMain
  IpcHandlerRegistry --> TranscodeServiceMain
  TrayService --> DeviceServiceMain
  DeviceServiceMain --> UsbDetection
  UpdateServiceMain --> AutoUpdater
  TranscodeServiceMain --> FFmpeg
```

## 6) Cross-Process Channels

```mermaid
flowchart LR
  DeviceBridge[DeviceBridgeService]
  UpdateBridge[UpdateBridge]
  TranscodeService[TranscodeService]
  DeviceIpcAdapter[DeviceIpcAdapter]
  UpdateService[UpdateService]
  UpdateUIBridge[UpdateUIBridge]
  TranscodeServiceRenderer["TranscodeService (Renderer)"]

  DeviceBridge -- IPC: device-status --> DeviceIpcAdapter
  UpdateBridge -- IPC: update-status --> UpdateService
  UpdateService --> UpdateUIBridge
  TranscodeServiceRenderer -- IPC: transcode --> TranscodeService
```

## What to Look for in Code

- Orchestrators should be thin: they wire flows and delegate to services.
- Services should be single-responsibility and own the actual work.
- Managers/handlers are main-process only and interface with OS or device APIs.
- Bridges are main-process IPC entry points to the renderer.
- Process-first layout: renderer code lives under `src/renderer`, main process under `src/main`, preload under `src/preload`, shared utilities under `src/shared`.
