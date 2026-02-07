# Architecture Diagrams

These diagrams provide focused, review-friendly views of the application's core orchestration and service boundaries.

Related docs:
- `docs/feature-map.md`
- `docs/naming-conventions.md`

Legend
- Solid edges: control flow or delegation.
- Dashed edges: error/cleanup or retry flow.
- Nodes labeled "State" are the primary owners of state transitions.
- IPC edges are labeled explicitly.

## Renderer DI Composition

```mermaid
flowchart LR
  Container["container.ts (composition shell)"]
  Infra["register-infrastructure.ts"]
  Devices["register-devices.ts"]
  Streaming["register-streaming.ts"]
  Capture["register-capture.ts"]
  UI["register-ui.ts"]
  Orchestrators["register-orchestrators.ts"]

  Container --> Infra
  Container --> Devices
  Container --> Streaming
  Container --> Capture
  Container --> UI
  Container --> Orchestrators
```

## Streaming and Device Selection

```mermaid
flowchart LR
  subgraph RENDERER[Renderer]
    UIEventBridge[UIEventBridge]
    UISetupOrchestrator[UISetupOrchestrator]
    StreamingOrchestrator[StreamingOrchestrator]
    StreamingService[StreamingService]
    DeviceOrchestrator[DeviceOrchestrator]
    DeviceService[DeviceService]
    MediaDeviceService[MediaDeviceService]
    DeviceConnectionService[DeviceConnectionService]
    StreamingState[StreamingState]
  end

  UIEventBridge --> UISetupOrchestrator
  UIEventBridge --> StreamingOrchestrator
  UISetupOrchestrator --> StreamingOrchestrator
  StreamingOrchestrator --> StreamingService
  StreamingOrchestrator --> DeviceOrchestrator
  DeviceOrchestrator --> DeviceService
  StreamingOrchestrator --> StreamingState
  StreamingService --> DeviceService
  DeviceService --> MediaDeviceService
  DeviceService --> DeviceConnectionService

  StreamingService -. cleanup/retry .-> StreamingState
```

## Capture and GPU Recording

```mermaid
flowchart LR
  subgraph RENDERER[Renderer]
    UIEventBridge[UIEventBridge]
    CaptureOrchestrator[CaptureOrchestrator]
    CaptureService[CaptureService]
    CaptureSaveService[CaptureSaveService]
    GpuRecordingService[GpuRecordingService]
    CaptureState[CaptureState]
  end

  UIEventBridge --> CaptureOrchestrator
  CaptureOrchestrator --> CaptureService
  CaptureOrchestrator --> CaptureSaveService
  CaptureOrchestrator --> GpuRecordingService
  CaptureOrchestrator --> CaptureState

  GpuRecordingService -. cleanup .-> CaptureState
```

## Recording Transcode Flow

```mermaid
flowchart LR
  subgraph RENDERER[Renderer]
    CaptureSaveService[CaptureSaveService]
    TranscodeServiceRenderer["TranscodeService (Renderer)"]
    TranscodeUIBridge[TranscodeUIBridge]
    TranscodeToast[TranscodeToastComponent]
    CaptureUIBridge[CaptureUIBridge]
  end

  subgraph MAIN[Main Process]
    TranscodeIpcHandler[TranscodeIpcHandler]
    TranscodeServiceMain["TranscodeService (Main)"]
    FFmpeg[ffmpeg/ffprobe]
  end

  CaptureSaveService --> TranscodeServiceRenderer
  TranscodeServiceRenderer -- IPC: transcode-start --> TranscodeIpcHandler
  TranscodeIpcHandler --> TranscodeServiceMain
  TranscodeServiceMain --> FFmpeg
  TranscodeServiceMain -- IPC: transcode-progress --> TranscodeServiceRenderer
  TranscodeServiceMain -- IPC: transcode-complete --> TranscodeServiceRenderer
  TranscodeServiceRenderer --> TranscodeUIBridge
  TranscodeUIBridge --> TranscodeToast
  TranscodeUIBridge --> CaptureUIBridge
```

## Performance and Metrics

```mermaid
flowchart LR
  subgraph RENDERER[Renderer]
    AppOrchestrator[AppOrchestrator]
    AnimationPerformanceOrchestrator[AnimationPerformanceOrchestrator]
    PerformanceStateOrchestrator[PerformanceStateOrchestrator]
    PerformanceMetricsOrchestrator[PerformanceMetricsOrchestrator]
    AnimationPerformanceService[AnimationPerformanceService]
    PerformanceStateService[PerformanceStateService]
    PerformanceMetricsService[PerformanceMetricsService]
    PerformanceState[PerformanceState]
  end

  AppOrchestrator --> AnimationPerformanceOrchestrator
  AppOrchestrator --> PerformanceStateOrchestrator
  AppOrchestrator --> PerformanceMetricsOrchestrator
  AnimationPerformanceOrchestrator --> AnimationPerformanceService
  AnimationPerformanceService --> PerformanceMetricsService
  PerformanceStateOrchestrator --> PerformanceStateService
  PerformanceStateService --> PerformanceState
  PerformanceMetricsOrchestrator --> PerformanceMetricsService

  AnimationPerformanceService -. cleanup .-> PerformanceState
```

## Main Process IPC and Core Services

```mermaid
flowchart LR
  subgraph MAIN[Main Process]
    MainAppOrchestrator[MainAppOrchestrator]
    IpcHandlers[IpcHandlers]
    TrayManager[TrayManager]
    DeviceBridge[DeviceBridgeService]
    UpdateBridge[UpdateBridgeService]
    DeviceServiceMain[DeviceServiceMain]
    UpdateServiceMain[UpdateServiceMain]
    TranscodeServiceMain[TranscodeServiceMain]
    UsbDetection[usb-detection]
    DeviceRegistry[DeviceRegistry]
    ProfileRegistry[ProfileRegistry]
    AutoUpdater[electron-updater]
    FFmpeg[ffmpeg-static]
  end

  MainAppOrchestrator --> IpcHandlers
  MainAppOrchestrator --> TrayManager
  MainAppOrchestrator --> DeviceBridge
  MainAppOrchestrator --> UpdateBridge

  IpcHandlers --> DeviceServiceMain
  IpcHandlers --> UpdateServiceMain
  IpcHandlers --> TranscodeServiceMain
  TrayManager --> DeviceServiceMain

  DeviceServiceMain --> UsbDetection
  DeviceServiceMain --> DeviceRegistry
  DeviceServiceMain --> ProfileRegistry
  UpdateServiceMain --> AutoUpdater
  TranscodeServiceMain --> FFmpeg
```

## UI Event Flow

```mermaid
flowchart LR
  subgraph RENDERER[Renderer]
    UIEventBridge[UIEventBridge]
    UISetupOrchestrator[UISetupOrchestrator]
    StreamingOrchestrator[StreamingOrchestrator]
    CaptureOrchestrator[CaptureOrchestrator]
  end

  UIEventBridge --> UISetupOrchestrator
  UIEventBridge --> StreamingOrchestrator
  UIEventBridge --> CaptureOrchestrator
```

## Cross-Process Device, Update, and Transcode Channels

```mermaid
flowchart LR
  subgraph MAIN[Main Process]
    DeviceBridge[DeviceBridgeService]
    UpdateBridge[UpdateBridgeService]
    TranscodeService[TranscodeService]
  end

  subgraph RENDERER[Renderer]
    DeviceServiceRenderer["DeviceService (Renderer)"]
    UIService["UIService / UI Components"]
    TranscodeServiceRenderer["TranscodeService (Renderer)"]
  end

  DeviceBridge -- IPC: device-status --> DeviceServiceRenderer
  UpdateBridge -- IPC: update-status --> UIService
  TranscodeServiceRenderer -- IPC: transcode-start --> TranscodeService
  TranscodeService -- IPC: transcode-progress/complete --> TranscodeServiceRenderer
```

## Notes

- Device selection is explicitly shown as a sub-step in `StreamingService` to make filtering and ordering visible during reviews.
- IPC edges are separated into their own diagram so cross-process boundaries are obvious.
- State owners are called out where they influence lifecycle (start/stop, error/retry).
- Process-first layout: renderer code lives under `src/renderer`, main process under `src/main`, preload under `src/preload`, shared utilities under `src/shared`.
- Shared timing constants live in `src/shared/config/timing.config.ts`; infrastructure code should not pull timing values from presentation config.
- `src/core` has been retired and removed; the boundary checker prevents reintroduction via `@core/` imports.
