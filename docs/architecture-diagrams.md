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
    GpuRecordingService[GpuRecordingService]
    CaptureState[CaptureState]
  end

  UIEventBridge --> CaptureOrchestrator
  CaptureOrchestrator --> CaptureService
  CaptureOrchestrator --> GpuRecordingService
  CaptureOrchestrator --> CaptureState

  GpuRecordingService -. cleanup .-> CaptureState
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
    UsbDetection[usb-detection]
    DeviceRegistry[DeviceRegistry]
    ProfileRegistry[ProfileRegistry]
    AutoUpdater[electron-updater]
  end

  MainAppOrchestrator --> IpcHandlers
  MainAppOrchestrator --> TrayManager
  MainAppOrchestrator --> DeviceBridge
  MainAppOrchestrator --> UpdateBridge

  IpcHandlers --> DeviceServiceMain
  IpcHandlers --> UpdateServiceMain
  TrayManager --> DeviceServiceMain

  DeviceServiceMain --> UsbDetection
  DeviceServiceMain --> DeviceRegistry
  DeviceServiceMain --> ProfileRegistry
  UpdateServiceMain --> AutoUpdater
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

## Cross-Process Device and Update Channels

```mermaid
flowchart LR
  subgraph MAIN[Main Process]
    DeviceBridge[DeviceBridgeService]
    UpdateBridge[UpdateBridgeService]
  end

  subgraph RENDERER[Renderer]
    DeviceServiceRenderer["DeviceService (Renderer)"]
    UIService["UIService / UI Components"]
  end

  DeviceBridge -- IPC: device-status --> DeviceServiceRenderer
  UpdateBridge -- IPC: update-status --> UIService
```

## Notes

- Device selection is explicitly shown as a sub-step in `StreamingService` to make filtering and ordering visible during reviews.
- IPC edges are separated into their own diagram so cross-process boundaries are obvious.
- State owners are called out where they influence lifecycle (start/stop, error/retry).
- Process-first layout: renderer code lives under `src/renderer`, main process under `src/main`, preload under `src/preload`, shared utilities under `src/shared`.
