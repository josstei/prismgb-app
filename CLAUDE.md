# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

PrismGB is an Electron desktop application for streaming and capturing video from the Mod Retro Chromatic handheld gaming device. It supports live streaming, screenshots, video recording, and cross-platform operation (Windows, macOS, Linux).

## Commands

```bash
npm install           # Install dependencies (requires libusb on Linux/macOS)
npm run dev           # Start Vite dev server with Electron hot reload
npm run build         # Build for current platform
npm run lint          # Check for linting errors
npm run lint:fix      # Auto-fix linting issues
npm run test:run      # Run all tests once
npm run test:unit     # Run unit tests only
npm run test:integration  # Run integration tests only
npm run test:coverage # Run tests with coverage report
npm test              # Run tests in watch mode
```

### Running a Single Test

```bash
npx vitest run tests/unit/path/to/file.test.js
npx vitest run -t "test name pattern"
```

## Documentation

Architecture documentation is available in `docs/`:

| Section | Description |
|---------|-------------|
| `docs/README.md` | Entry point and navigation |
| `docs/architecture/` | System design, processes, DI, events |
| `docs/features/` | Devices, streaming, rendering, capture, settings |
| `docs/ui/` | Component system and patterns |
| `docs/shared/` | Utilities and base classes |

## Architecture

### Electron Process Separation

| Directory | Context | Purpose |
|-----------|---------|---------|
| `src/app/main/` | Node.js (main process) | Window management, system tray, IPC handlers |
| `src/app/renderer/` | Browser (renderer process) | UI, streaming, user interactions |
| `src/app/preload/` | Bridge | Secure IPC channel between main/renderer |

### Application Layer

Application-level orchestration lives in `src/ui/`:

- **AppOrchestrator** - Main coordinator that initializes and wires all sub-orchestrators
- **AppState** - Centralized state management with event-driven updates

### Infrastructure Layer

Shared abstractions and utilities in `src/infrastructure/`:

- **events/** - EventBus for pub/sub communication
- **di/** - ServiceContainer for renderer dependency injection
- **ipc/** - IPC channel definitions
- **logging/** - Logger factories for main/renderer processes
- **browser/** - Browser API abstractions

### Domain-Driven Design

Code is organized by domain in `src/features/`:

- **capture/** - Screenshot and video recording functionality
- **devices/** - Device detection, profiles, adapters, and registry
  - `adapters/` - Device-specific adapters (BaseDeviceAdapter, ChromaticAdapter)
  - `shared/` - DeviceRegistry, detection helpers
  - `main/` - Main process device management
- **streaming/** - Video stream acquisition, rendering, and lifecycle management
  - `acquisition/` - Stream acquisition context and coordination
  - `rendering/` - Canvas, GPU, and worker-based rendering
  - `factories/` - AdapterFactory for creating device adapters
- **settings/** - User preferences and display modes

### Dependency Injection

Uses **Awilix** (main process) and a custom **ServiceContainer** (renderer process) for DI:

- Main: `src/app/main/container.js` - registers services like WindowManager, TrayManager
- Renderer: `src/app/renderer/container.js` - registers domain services and orchestrators

### Service/Orchestrator Pattern

**Services** (`extends BaseService`) encapsulate business logic:
```javascript
import { BaseService } from '@/shared/base/service.js';

export class MyService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'requiredDep'], 'MyService');
  }
}
```

**Orchestrators** (`extends BaseOrchestrator`) coordinate multiple services with lifecycle management:
```javascript
import { BaseOrchestrator } from '@/shared/base/orchestrator.js';

export class MyOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory'], 'MyOrchestrator');
  }

  async onInitialize() {
    this.subscribeWithCleanup({
      'event:name': (data) => this.handleEvent(data)
    });
  }
}
```

### Event-Driven Communication

Cross-service communication uses `EventBus` (pub/sub pattern with eventemitter3):
```javascript
// Publishing
this.eventBus.publish('device:connected', { deviceId });

// Subscribing
this.eventBus.subscribe('device:connected', handler);
```

### IPC Channels

IPC channel names are centralized in `src/infrastructure/ipc/channels.json` to prevent typos.

### Path Aliases

Configured in `vitest.config.js` and Vite:
- `@/` → `src/`

### Key File Locations

| Component | Location |
|-----------|----------|
| Main process bootstrap | `src/app/main/` |
| Renderer process bootstrap | `src/app/renderer/` |
| Application orchestration | `src/ui/app.orchestrator.js` |
| Device adapters | `src/features/devices/adapters/` |
| Adapter factory | `src/features/streaming/factories/` |
| Device registry | `src/features/devices/shared/device-registry.js` |
| Rendering system | `src/features/streaming/rendering/` |
| Base classes | `src/shared/base/` |
| Event system | `src/infrastructure/events/` |

## Testing

- Framework: Vitest with happy-dom environment
- Test locations: `tests/unit/`, `tests/integration/`, or co-located `*.test.js` files
- Coverage thresholds: 80% lines/functions/statements, 75% branches
- Main process code is excluded from coverage (requires Electron APIs)

## Code Style

- 2-space indentation, single quotes, semicolons required
- ESLint enforced via `npm run lint`
- Husky pre-commit hook runs full test suite
- Commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/)

## Platform Dependencies

Linux: `sudo apt-get install libusb-1.0-0-dev libudev-dev`
macOS: `brew install libusb`
