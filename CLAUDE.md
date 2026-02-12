# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PrismGB is an Electron desktop application for streaming and capturing video from the Mod Retro Chromatic handheld gaming device. It supports Windows, macOS, and Linux with features like live streaming, screenshots, video recording, render presets (GPU shaders), and fullscreen modes.

**Version**: 1.2.1
**Electron**: 28.x
**Build Tool**: Vite 7.x
**Test Framework**: Vitest 4.x (unit/integration), Playwright 1.58.x (E2E)

## Commands

```bash
npm install              # Install dependencies
npm run dev              # Start Vite dev server with Electron hot reload
npm run build            # Build for current platform
npm run build:win        # Build for Windows
npm run build:mac        # Build for macOS
npm run build:linux      # Build for Linux
npm run lint             # Check for linting errors
npm run lint:fix         # Auto-fix linting issues
npm test                 # Run tests in watch mode
npm run test:run         # Run all tests once
npm run test:unit        # Run unit tests only
npm run test:integration # Run integration tests only
npm run test:coverage    # Run tests with coverage report
npm run test:e2e         # Run E2E tests (requires built app)
```

### Running a Single Test

```bash
npx vitest run tests/unit/features/streaming  # Run tests in a directory
npx vitest run path/to/file.test.js           # Run specific test file
npx vitest run -t "test name pattern"         # Run tests matching pattern
```

## Architecture

### Electron Process Model

The app follows the standard Electron architecture with three processes:

- **Main Process** (`src/main/`): Node.js process handling USB device detection via `usb-detection`, system tray, auto-updates via `electron-updater`, window management, and IPC
- **Preload** (`src/preload/`): Bridge exposing APIs to renderer via `contextBridge` with type-safe IPC channel mappings
- **Renderer** (`src/renderer/`): Browser-based UI with clean architecture (application/infrastructure/presentation layers)

### Source Structure

```
src/
├── main/                    # Electron main process
│   ├── application/         # App orchestrator, lifecycle
│   ├── infrastructure/      # Main process infrastructure
│   │   ├── devices/         # USB device detection (usb-detection)
│   │   ├── events/          # EventBus (Node.js EventEmitter)
│   │   ├── logging/         # Winston-based logging
│   │   ├── platform/        # GPU policy, shell service
│   │   ├── transcode/       # FFmpeg transcoding
│   │   ├── tray/            # System tray service
│   │   ├── updates/         # Auto-updates (electron-updater)
│   │   └── window/          # Window management
│   ├── ipc/                 # IPC handler registry
│   │   └── handlers/        # Individual IPC handlers
│   └── index.ts             # Main entry point
├── preload/                 # Electron preload scripts
│   └── index.js             # Exposes deviceAPI, shellAPI, windowAPI, updateAPI, metricsAPI, transcodeAPI
├── renderer/                # Browser renderer process
│   ├── application/         # App orchestrator, state, container, DI wiring
│   │   ├── di/              # DI registration modules (register-*.ts)
│   │   ├── orchestrators/   # All renderer orchestrators
│   │   └── state/           # AppState
│   ├── infrastructure/      # Renderer infrastructure
│   │   ├── adapters/        # Device adapters, streaming adapters, platform adapters
│   │   │   ├── devices/     # Device adapters (Chromatic, IPC, debounce)
│   │   │   ├── streaming/   # StreamingAdapterFactory
│   │   │   └── platform/    # VisibilityAdapter, ReducedMotionAdapter, UserActivityAdapter
│   │   ├── browser/         # BrowserMediaAdapter, BrowserStorageAdapter
│   │   ├── di/              # ServiceContainer (custom DI)
│   │   ├── events/          # EventBus (eventemitter3)
│   │   ├── factories/       # StreamingRendererFactory
│   │   ├── logging/         # Console-based RendererLogger
│   │   ├── rendering/       # GPU rendering internals (presets/shaders now in @prismgb/gpu)
│   │   │   └── workers/     # Render worker (off-main-thread GPU)
│   │   ├── services/        # All renderer services (by domain)
│   │   │   ├── capture/     # Screenshot/recording services
│   │   │   ├── devices/     # Device connection, media, storage services
│   │   │   ├── notes/       # Notes CRUD service
│   │   │   ├── performance/ # Performance metrics/state services
│   │   │   ├── settings/    # Settings, fullscreen, presentation mode services
│   │   │   ├── streaming/   # Streaming, audio, render pipeline services
│   │   │   ├── transcode/   # Transcode bridge service
│   │   │   └── updates/     # Update state service
│   │   └── streaming/       # Stream acquisition
│   │       └── acquisition/ # AcquisitionContext, ConstraintBuilder, FallbackStrategy
│   ├── presentation/        # UI layer
│   │   ├── bridges/         # UIEventBridge, CaptureUIBridge, TranscodeUIBridge, UpdateUIBridge
│   │   ├── config/          # CSS classes, DOM selectors, storage keys
│   │   ├── controller/      # UIController, UIComponentRegistry
│   │   ├── effects/         # UIEffects, BodyClassManager
│   │   ├── features/        # Feature-specific UI components
│   │   │   ├── fullscreen/  # Fullscreen controls and effects
│   │   │   ├── notes/       # Notes panel components
│   │   │   ├── settings/    # Settings menu component
│   │   │   ├── streaming/   # Streaming controls
│   │   │   ├── toolbar/     # Toolbar components (shader selector, sliders)
│   │   │   ├── transcode/   # Transcode toast component
│   │   │   └── updates/     # Update section component
│   │   ├── icons/           # SVG icon utilities
│   │   ├── lib/             # Presentation utilities (brightness, filename generator)
│   │   ├── primitives/      # DOM utilities, DisclosureController, HideTimer
│   │   ├── shared/          # Shared UI components (StatusNotification, DeviceStatus)
│   │   ├── shell/           # App shell templates
│   │   └── styles/          # Global CSS styles and tokens
│   ├── assets/              # Fonts and static assets
│   ├── index.ts             # Renderer entry point
│   └── renderer-app.orchestrator.ts  # RendererAppOrchestrator
└── shared/                  # Cross-process shared code
    ├── base/                # BaseService, LifecycleService, BaseOrchestrator
    ├── config/              # config-loader utility
    ├── features/            # Shared device profiles, transcode config
    │   ├── devices/         # DeviceRegistry, DeviceProfile, ChromaticProfile
    │   └── transcode/       # Transcode state and format config
    ├── interfaces/          # IDeviceAdapter, IDeviceStatusProvider, IFallbackStrategy
    ├── ipc/                 # IPC channel definitions (channels.json)
    ├── lib/                 # Error utilities
    └── utils/               # Utility functions (formatters, safe-disposer, etc.)
```

### Key Services and Orchestrators

#### Renderer Orchestrators (extend BaseOrchestrator)

| Orchestrator | Location | Responsibilities |
|-------------|----------|------------------|
| `AppOrchestrator` | `renderer/application/orchestrators/` | Main coordinator, initializes all other orchestrators |
| `StreamingOrchestrator` | `renderer/application/orchestrators/` | Stream lifecycle, renderer selection, viewport management |
| `StreamingAudioOrchestrator` | `renderer/application/orchestrators/` | Audio pipeline warmup and fade-in |
| `CaptureOrchestrator` | `renderer/application/orchestrators/` | Screenshot and video recording coordination |
| `DeviceOrchestrator` | `renderer/application/orchestrators/` | Device detection, status management |
| `SettingsPreferencesOrchestrator` | `renderer/application/orchestrators/` | Preferences loading and state management |
| `SettingsDisplayModeOrchestrator` | `renderer/application/orchestrators/` | Fullscreen and cinematic mode coordination |
| `UISetupOrchestrator` | `renderer/application/orchestrators/` | UI component initialization |
| `PerformanceOrchestrator` | `renderer/application/orchestrators/` | Performance metrics, state, and animation management |

#### Renderer Services (extend BaseService or LifecycleService)

| Service | Location | Responsibilities |
|---------|----------|------------------|
| `StreamingService` | `renderer/infrastructure/services/streaming/` | Media stream acquisition with state machine |
| `StreamingAudioPipelineService` | `renderer/infrastructure/services/streaming/` | Web Audio API pipeline with warmup and fade-in |
| `StreamingRenderPipelineService` | `renderer/infrastructure/services/streaming/` | Renderer strategy selection (GPU/Canvas2D) |
| `CaptureService` | `renderer/infrastructure/services/capture/` | Screenshot/recording via MediaRecorder |
| `CaptureSaveService` | `renderer/infrastructure/services/capture/` | Save with optional transcoding |
| `CaptureGpuRecordingService` | `renderer/infrastructure/services/capture/` | GPU-based recording pipeline |
| `DeviceMediaService` | `renderer/infrastructure/services/devices/` | Media device enumeration with caching |
| `DeviceStorageService` | `renderer/infrastructure/services/devices/` | Device ID persistence |
| `DeviceOperationSequencerService` | `renderer/infrastructure/services/devices/` | Sequenced device operations |
| `SettingsService` | `renderer/infrastructure/services/settings/` | LocalStorage-backed preferences |
| `SettingsFullscreenService` | `renderer/infrastructure/services/settings/` | Fullscreen event handling |
| `PresentationModeService` | `renderer/infrastructure/services/settings/` | Visual state coordination (cinematic, minimalist) |
| `TranscodeService` | `renderer/infrastructure/services/transcode/` | Renderer-side transcode bridge |
| `UpdateService` | `renderer/infrastructure/services/updates/` | Update state and IPC bridge |
| `NotesService` | `renderer/infrastructure/services/notes/` | Notes CRUD with localStorage |
| `PerformanceAnimationService` | `renderer/infrastructure/services/performance/` | Animation frame management |
| `PerformanceStateService` | `renderer/infrastructure/services/performance/` | Performance state tracking |
| `PerformanceMetricsService` | `renderer/infrastructure/services/performance/` | Performance metrics collection |

#### Main Process Services

| Service | Location | Responsibilities |
|---------|----------|------------------|
| `DeviceService` | `main/infrastructure/devices/` | USB monitoring via usb-detection |
| `DeviceBridgeService` | `main/infrastructure/devices/` | Bridges device events to tray and renderer |
| `DeviceLifecycleService` | `main/infrastructure/devices/` | Auto-launch on device connect |
| `DeviceProfileRegistry` | `main/infrastructure/devices/` | Device profile registration |
| `UpdateService` | `main/infrastructure/updates/` | electron-updater integration |
| `UpdateBridge` | `main/infrastructure/updates/` | Update scheduling |
| `TranscodeService` | `main/infrastructure/transcode/` | FFmpeg process management |

### Dependency Injection

Uses a custom `ServiceContainer` (`renderer/infrastructure/di/service-container.factory.ts`) for constructor injection:

```javascript
container.registerSingleton('serviceName', ServiceClass, ['dep1', 'dep2']);
const instance = container.resolve('serviceName');
```

The renderer container (`renderer/application/container.ts`) is a thin composition shell that delegates to DI registration modules in `renderer/application/di/`. Services receive dependencies as an object:

```javascript
new MyService({ eventBus, loggerFactory, otherDep });
```

**Registration Patterns:**
- `registerSingleton(name, ClassOrValue, dependencies)` - Single instance, cached
- `register({ name: asValue(value) })` - Plain values
- No transient or scoped registration (singletons only)

### Base Classes

Services and orchestrators extend base classes from `shared/base/`:

#### BaseService (`shared/base/service.base.js`)

```javascript
constructor(dependencies, requiredDeps = [], serviceName = null)
```

- Validates required dependencies (throws if missing)
- Assigns only required dependencies to `this`
- Creates `this.logger` if `loggerFactory` provided

#### LifecycleService (`shared/base/lifecycle-service.base.ts`)

- Extends BaseService
- Adds lifecycle state management: `initialize()` / `teardown()` (template methods)
- Tracks `isInitialized` and `_isCleanedUp` flags
- Override `onInitialize()` and `onCleanup()` for custom logic

#### BaseOrchestrator (`shared/base/orchestrator.base.js`)

```javascript
constructor(dependencies, requiredDeps, name)
```

- Extends LifecycleService (inherits lifecycle management)
- `subscribeWithCleanup(eventMap)` - Auto-tracks EventBus subscriptions for cleanup

### Event-Driven Communication

#### Renderer EventBus (`renderer/infrastructure/events/event-bus.class.js`)

Uses `eventemitter3` for cross-service communication:

```javascript
eventBus.publish('stream:started', { streamId });
const unsubscribe = eventBus.subscribe('device:connected', handler);
```

#### Main Process EventBus (`main/infrastructure/events/event-bus.class.js`)

Uses Node.js built-in `events` module.

#### Event Channels

**Renderer** (source of truth: `shared/events/event-channels.ts`, re-exported via `renderer/infrastructure/events/event-channels.config.js`):

| Domain | Events |
|--------|--------|
| SYSTEM | `HANDLER_ERROR` |
| DEVICE | `STATUS_CHANGED`, `SUPPORTED_DEVICE_AVAILABLE`, `ENUMERATION_FAILED`, `DISCONNECTED_DURING_SESSION` |
| STREAM | `STARTED`, `STOPPED`, `ERROR`, `HEALTH_OK`, `HEALTH_TIMEOUT` |
| CAPTURE | `SCREENSHOT_TRIGGERED`, `SCREENSHOT_READY`, `RECORDING_STARTED`, `RECORDING_STOPPED`, `RECORDING_READY`, `RECORDING_ERROR`, `RECORDING_DEGRADED` |
| SETTINGS | `VOLUME_CHANGED`, `RENDER_PRESET_CHANGED`, `BRIGHTNESS_CHANGED`, `PERFORMANCE_MODE_CHANGED`, `CINEMATIC_MODE_CHANGED`, `MINIMALIST_FULLSCREEN_CHANGED`, `PREFERENCES_LOADED`, `RECORDING_FORMAT_CHANGED` |
| PERFORMANCE | `STATE_CHANGED`, `UI_MODE_CHANGED`, `RENDER_MODE_CHANGED`, `MEMORY_SNAPSHOT_REQUESTED` |
| RENDER | `CAPABILITY_DETECTED`, `PIPELINE_READY`, `PIPELINE_ERROR`, `STATS_UPDATE`, `CANVAS_EXPIRED`, `CANVAS_RECREATED` |
| UI | `STATUS_MESSAGE`, `DEVICE_STATUS`, `OVERLAY_MESSAGE`, `OVERLAY_VISIBLE`, `OVERLAY_ERROR`, `STREAMING_MODE`, `STREAM_INFO`, `SHUTTER_FLASH`, `RECORD_BUTTON_POP`, `RECORD_BUTTON_PRESS`, `BUTTON_FEEDBACK`, `RECORDING_STATE`, `RECORD_BUTTON_DISABLED`, `RECORD_BUTTON_ENABLED`, `FULLSCREEN_STATE`, `WINDOW_RESIZED`, `SCREENSHOT_REQUESTED`, `RECORDING_TOGGLE_REQUESTED`, `FULLSCREEN_TOGGLE_REQUESTED`, `CINEMATIC_TOGGLE_REQUESTED`, `STREAM_START_REQUESTED`, `STREAM_STOP_REQUESTED` |
| UPDATE | `AVAILABLE`, `NOT_AVAILABLE`, `PROGRESS`, `DOWNLOADED`, `ERROR`, `STATE_CHANGED`, `BADGE_SHOW`, `BADGE_HIDE` |
| NOTES | `NOTE_CREATED`, `NOTE_UPDATED`, `NOTE_DELETED` |
| TRANSCODE | `STARTED`, `PROGRESS`, `COMPLETED`, `ERROR`, `CANCELLED` |

**Main Process** (`main/infrastructure/events/event-channels.config.js`):

| Domain | Events |
|--------|--------|
| DEVICE | `CONNECTION_CHANGED`, `CHECK_ERROR` |
| UPDATE | `STATE_CHANGED` |

### IPC Channels

Defined in `shared/ipc/channels.json`, exposed via preload:

| API | Methods |
|-----|---------|
| `window.deviceAPI` | `getDeviceStatus`, `onDeviceConnected`, `onDeviceDisconnected`, `removeDeviceListeners` |
| `window.shellAPI` | `openExternal` |
| `window.windowAPI` | `onEnterFullscreen`, `onLeaveFullscreen`, `onResized`, `setFullScreen`, `isFullScreen`, `removeListeners` |
| `window.updateAPI` | `getStatus`, `checkForUpdates`, `downloadUpdate`, `installUpdate`, `onAvailable`, `onNotAvailable`, `onProgress`, `onDownloaded`, `onError`, `removeListeners` |
| `window.metricsAPI` | `getProcessMetrics` |
| `window.transcodeAPI` | `start`, `cancel`, `getStatus`, `onProgress`, `onCompleted`, `onError`, `onCancelled`, `removeListeners` |

### Path Aliases

Configured in both `vite.config.js` and `vitest.config.js`:

| Alias | Path |
|-------|------|
| `@/` | `src/` |
| `@main/` | `src/main/` |
| `@renderer/` | `src/renderer/` |
| `@preload/` | `src/preload/` |
| `@shared/` | `src/shared/` |
| `@prismgb/gpu` | `packages/prismgb-gpu/src/index.ts` |

### Rendering Pipeline

The streaming feature supports multiple rendering strategies:

1. **GPU Renderer** (`infrastructure/services/streaming/gpu-renderer.service.ts`)
   - WebGPU (preferred) or WebGL2 fallback
   - Shaders and render presets provided by `@prismgb/gpu` package

2. **Canvas2D Renderer** (`infrastructure/services/streaming/canvas-renderer.ts`)
   - Fallback for performance mode or unsupported GPU

Strategy selection via `StreamingRendererFactory` (`infrastructure/factories/`) based on capabilities and settings.

### Device Profiles

Device-specific configurations in `shared/features/devices/`:

- `DeviceProfile` base class with USB identifiers, display config, media constraints
- `DeviceChromaticProfile` for Mod Retro Chromatic (160x144 native, VID: 0x374e, PID: 0x0101)
- `DeviceRegistry` for device registration and lookup

### Stream Acquisition

Located in `renderer/infrastructure/streaming/acquisition/`:

- `AcquisitionContext` - Immutable context with device/group IDs and profile
- `ConstraintBuilder` - Builds MediaStreamConstraints at 'full', 'simple', or 'minimal' detail levels
- `FallbackStrategy` - Fallback chain for stream acquisition failures
- `StreamAcquisitionOrchestrator` - Coordinates acquisition with automatic fallback

## Testing

### Test Structure

```
tests/
├── e2e/                 # Playwright E2E tests (*.spec.js)
│   ├── fixtures/        # Electron test fixtures
│   ├── helpers/         # E2E utilities
│   └── mocks/           # E2E device simulation
├── integration/         # Integration tests
├── mocks/               # Shared mock factories
│   ├── index.js         # Central exports
│   └── MockDevice.js    # Full device simulation
├── performance/         # Benchmark tests
├── unit/                # Unit tests (mirrors src/ structure)
├── setup.js             # Global test setup
└── testing-library.setup.js
```

### Test Environment

- **Framework**: Vitest with happy-dom
- **E2E**: Playwright with custom Electron fixtures
- **Globals**: `describe`, `it`, `expect`, `vi` available globally

### Coverage

**Thresholds**: 80% lines/functions/statements, 75% branches

**Excluded from coverage** (runtime requirements):
- `src/main/**` - Electron APIs
- `src/**/workers/*.js` - Worker context
- `src/**/rendering/gpu/*.js` - WebGPU/WebGL APIs
- `src/**/audio/*.js` - Web Audio API
- `src/**/canvas-lifecycle.service.js` - DOM/Canvas interactions
- `src/renderer/presentation/shell/*.js` - Vite `?raw` imports
- `src/shared/interfaces/*.interface.js` - Abstract base classes

### Mock Factories

```javascript
import {
  createMockEventBus,
  createMockLoggerFactory,
  createMockAppState,
  createMockDependencies,
  MockDevice,
  MockDeviceManager,
  CHROMATIC_SPECS
} from '../mocks/index.js';

const deps = createMockDependencies({ customService: mockService });
const service = new MyService(deps);
```

### Test Mocking Pattern

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('MyService', () => {
  let service;
  let mockEventBus;
  let mockLoggerFactory;

  beforeEach(() => {
    mockEventBus = {
      publish: vi.fn(),
      subscribe: vi.fn(() => vi.fn())
    };
    mockLoggerFactory = {
      create: () => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })
    };

    service = new MyService({ eventBus: mockEventBus, loggerFactory: mockLoggerFactory });
  });
});
```

## UI Architecture

### Component Pattern

UI components are plain JavaScript classes (no framework):

- Constructor receives dependencies (services, eventBus, logger)
- `initialize(elements)` receives DOM elements and sets up handlers
- CSS class toggling for state management
- `dispose()` for cleanup

### Key UI Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `UIController` | `presentation/controller/` | Thin facade delegating to managers |
| `UIComponentRegistry` | `presentation/controller/` | Component lifecycle management |
| `UIEffects` | `presentation/effects/` | Visual effects coordination |
| `BodyClassManager` | `presentation/effects/` | Body CSS class management |
| `SettingsMenuComponent` | `presentation/features/settings/` | Settings panel |
| `ShaderSelectorComponent` | `presentation/features/toolbar/` | Shader preset selection |
| `NotesPanelComponent` | `presentation/features/notes/` | Notes CRUD UI |
| `StreamingControlsComponent` | `presentation/features/streaming/` | Streaming state UI |
| `TranscodeToastComponent` | `presentation/features/transcode/` | Transcode progress overlay |

### UI Bridges

Bridges translate EventBus events into UIController calls:

- `UIEventBridge` (`presentation/bridges/`) - General UI state updates
- `CaptureUIBridge` (`presentation/bridges/`) - Capture feedback (shutter flash, button states)
- `TranscodeUIBridge` (`presentation/bridges/`) - Transcode progress UI
- `UpdateUIBridge` (`presentation/bridges/`) - Update notifications and badge visibility

## Code Style

- 2-space indentation
- Single quotes, semicolons required
- Unix line endings (LF)
- ESLint flat config in `eslint.config.js`
- ES2025 syntax allowed

## Commit Convention

Uses [Conventional Commits](https://www.conventionalcommits.org/) enforced by Husky + Commitlint:

```
feat(streaming): add support for custom resolutions
fix(devices): resolve USB detection on Linux
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`, `revert`

## Git Remotes

- **origin** (`josstei/prismgb-app`) - Public repository
- **private** (`josstei/prismgb-dev`) - Private development repository

Use `git fetch private` to fetch branches from the private remote.

## Build Configuration

### Electron Builder

- **App ID**: `com.prismgb`
- **Output**: `release/` directory
- **Publish**: GitHub releases (draft)
- **Platforms**: macOS (dmg, zip), Linux (AppImage, deb, tar.gz), Windows (nsis, portable)
- **ASAR Unpacked**: `ffmpeg-static`, `ffprobe-static`
- **macOS**: Hardened runtime, notarization enabled, USB/camera/audio entitlements

### Build Hooks

- `afterPack.js`: Prunes locales, strips Linux binaries, bundles libz, signs FFmpeg
- `patch-appimage-runtime.js`: Fixes libz dependency for non-x64 AppImage

## Prerequisites

- Node.js v22 LTS or higher
- Platform-specific USB libraries:
  - **Linux:** `sudo apt-get install libusb-1.0-0-dev libudev-dev`
  - **macOS:** `brew install libusb`
  - **Windows:** No additional dependencies

## Key Dependencies

| Package | Purpose |
|---------|---------|
| `awilix` | DI container (main process alternative) |
| `eventemitter3` | EventBus (renderer) |
| `electron-updater` | Auto-updates |
| `usb-detection` | USB device monitoring |
| `winston` | Logging (main process) |
| `joi` | Schema validation |
| `ffmpeg-static` / `ffprobe-static` | Video transcoding |
