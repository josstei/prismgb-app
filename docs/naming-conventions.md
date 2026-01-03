# Naming Conventions

This document captures the naming and organization conventions used throughout PrismGB.

## File Names

- Use kebab-case for filenames.
- Base pattern: `<name>.<type>.js`.
- Use descriptors between name and type when needed: `<name>-<detail>.<type>.js`.
- Base classes use `<type>.base.js`.
- Entry points are `index.js`, DI containers are `container.js`.

### Common Suffixes

| Suffix | Purpose | Example |
| --- | --- | --- |
| `.service.js` | Business logic and stateful operations | `streaming.service.js` |
| `.orchestrator.js` | Coordination across services | `capture.orchestrator.js` |
| `.component.js` | UI component logic | `notes-panel.component.js` |
| `.adapter.js` | External or platform abstraction | `device-chromatic.adapter.js` |
| `.handler.js` | IPC or event handler | `device-ipc.handler.js` |
| `.bridge.js` | Cross-boundary coordination | `update.bridge.js` |
| `.registry.js` | Collections and registries | `device-profile.registry.js` |
| `.state.js` | State containers | `app.state.js` |
| `.factory.js` | Object construction helpers | `streaming-adapter.factory.js` |
| `.utils.js` | Pure utilities | `filename-generator.utils.js` |
| `.config.js` | Configuration constants | `css-classes.config.js` |
| `.class.js` | Plain classes (no DI) | `streaming-canvas-renderer.class.js` |
| `.interface.js` | Interface definitions | `device-adapter.interface.js` |
| `.worker.js` | Web workers | `streaming-render.worker.js` |
| `.profile.js` | Device profiles | `device-chromatic.profile.js` |
| `.base.js` | Abstract base classes | `service.base.js` |

## Directory Conventions

- `src/main`: Electron main process.
- `src/preload`: Context bridge APIs and IPC wiring.
- `src/renderer`: Renderer process and UI.
- `src/shared`: Process-agnostic utilities and config.
- `src/renderer/features/<feature>`: Feature modules (capture, devices, notes, settings, streaming, updates).
- `src/renderer/ui`: Shared UI components, templates, and orchestration.
- `src/renderer/application`: App-level orchestrators and performance services.
- `src/main/features/<feature>`: Main-process features.
- `tests/unit` and `tests/integration`: Test suites.

## Identifier Naming

- Classes use PascalCase and include role suffixes: `StreamingService`, `SettingsDisplayModeOrchestrator`.
- Services are UI-agnostic and emit events rather than manipulating DOM directly.
- Event channel names follow `domain:action` in kebab-case.
  - Renderer events: `src/renderer/infrastructure/events/event-channels.config.js`.
  - IPC channels: `src/shared/ipc/channels.json`.
- localStorage keys use camelCase values and live in `src/shared/config/storage-keys.config.js`.

## Imports and Aliases

- Use path aliases for cross-module imports:
  - `@` -> `src`
  - `@main` -> `src/main`
  - `@renderer` -> `src/renderer`
  - `@preload` -> `src/preload`
  - `@shared` -> `src/shared`

## Testing Conventions

- Tests are `*.test.js` or `*.spec.js`.
- Unit tests live in `tests/unit`, integration tests in `tests/integration`.
