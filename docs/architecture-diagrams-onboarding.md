# Architecture Diagrams (Onboarding)

This document is a simplified view of the core flows. It favors readability over completeness.

Legend
- Solid edges: delegation or control flow.
- Dashed edges: error/cleanup or retry path.
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
  UIEventBridge[UIEventBridge]
  UISetupOrchestrator[UISetupOrchestrator]
  StreamingOrchestrator[StreamingOrchestrator]
  StreamingService[StreamingService]
  DeviceServiceRenderer[DeviceService (Renderer)]

  UIEventBridge --> UISetupOrchestrator
  UIEventBridge --> StreamingOrchestrator
  UISetupOrchestrator --> StreamingOrchestrator
  StreamingOrchestrator --> StreamingService
  StreamingService --> DeviceServiceRenderer
  StreamingService -. cleanup/retry .-> StreamingOrchestrator
```

## 3) Capture and GPU Recording

```mermaid
flowchart LR
  UIEventBridge[UIEventBridge]
  CaptureOrchestrator[CaptureOrchestrator]
  CaptureService[CaptureService]
  GpuRecordingService[GpuRecordingService]

  UIEventBridge --> CaptureOrchestrator
  CaptureOrchestrator --> CaptureService
  CaptureOrchestrator --> GpuRecordingService
  GpuRecordingService -. cleanup .-> CaptureOrchestrator
```

## 4) Performance and Metrics

```mermaid
flowchart LR
  AppOrchestrator[AppOrchestrator]
  AnimationPerformanceOrchestrator[AnimationPerformanceOrchestrator]
  PerformanceStateCoordinator[PerformanceStateCoordinator]
  AnimationPerformanceService[AnimationPerformanceService]
  PerformanceMetricsService[PerformanceMetricsService]

  AppOrchestrator --> AnimationPerformanceOrchestrator
  AppOrchestrator --> PerformanceStateCoordinator
  AnimationPerformanceOrchestrator --> AnimationPerformanceService
  AnimationPerformanceService --> PerformanceMetricsService
```

## 5) Main Process IPC and Services

```mermaid
flowchart LR
  MainAppOrchestrator[MainAppOrchestrator]
  IpcHandlers[IpcHandlers]
  TrayManager[TrayManager]
  DeviceBridge[DeviceBridgeService]
  UpdateBridge[UpdateBridgeService]
  DeviceServiceMain[DeviceServiceMain]
  UpdateServiceMain[UpdateServiceMain]
  UsbDetection[usb-detection]
  AutoUpdater[electron-updater]

  MainAppOrchestrator --> IpcHandlers
  MainAppOrchestrator --> TrayManager
  MainAppOrchestrator --> DeviceBridge
  MainAppOrchestrator --> UpdateBridge

  IpcHandlers --> DeviceServiceMain
  IpcHandlers --> UpdateServiceMain
  TrayManager --> DeviceServiceMain
  DeviceServiceMain --> UsbDetection
  UpdateServiceMain --> AutoUpdater
```

## 6) Cross-Process Channels

```mermaid
flowchart LR
  DeviceBridge[DeviceBridgeService]
  UpdateBridge[UpdateBridgeService]
  DeviceServiceRenderer[DeviceService (Renderer)]
  UIService[UIService / UI Components]

  DeviceBridge -- IPC: device-status --> DeviceServiceRenderer
  UpdateBridge -- IPC: update-status --> UIService
```

## What to Look for in Code

- Orchestrators should be thin: they wire flows and delegate to services.
- Services should be single-responsibility and own the actual work.
- Managers/handlers are main-process only and interface with OS or device APIs.
- Bridges are main-process IPC entry points to the renderer.
