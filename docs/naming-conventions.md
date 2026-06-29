# Naming Conventions

This document captures the naming and organization conventions used throughout PrismGB.

## File Names

- Use kebab-case for filenames.
- Base pattern: `<name>.<type>.<ext>`.
- Use descriptors between name and type when needed: `<name>-<detail>.<type>.<ext>`.
- Base classes use `<type>.base.<ext>`.
- Entry points are `index.<ext>`, DI containers are `container.ts`.
- Use `.ts` for typed modules and `.js` for runtime-only modules.

### Common Suffixes

| Suffix | Purpose | Example |
| --- | --- | --- |
| `.service.<ext>` | Business logic and stateful operations | `streaming.service.ts` |
| `.orchestrator.<ext>` | Coordination across services | `capture.orchestrator.ts` |
| `.component.<ext>` | UI component logic | `notes-panel.component.js` |
| `.adapter.<ext>` | External or platform abstraction | `chromatic.adapter.ts` |
| `.handler.<ext>` | IPC or event handler | `window.handler.ts` |
| `.bridge.<ext>` | Cross-boundary coordination | `update.bridge.ts` |
| `.registry.<ext>` | Collections and registries | `device-profile.registry.ts` |
| `.state.<ext>` | State containers | `app-state.ts` |
| `.factory.<ext>` | Object construction helpers | `streaming-adapter.factory.ts` |
| `.utils.<ext>` | Pure utilities | `filename-generator.utils.ts` |
| `.config.<ext>` | Configuration constants | `storage-keys.config.ts` (shared); `timing.config.ts` (in `@prismgb/config`) |
| `.class.<ext>` | Plain classes (no DI) | `event-bus.class.js` |
| `.interface.<ext>` | Interface definitions | `logger.interface.ts` |
| `.worker.<ext>` | Web workers | `render.worker.ts` |
| `.profile.<ext>` | Device profiles | `device-chromatic.profile.js` |
| `.base.<ext>` | Abstract base classes | `service.base.js` |

## Directory Conventions

- `src/main`: Electron main process.
- `src/preload`: Context bridge APIs and IPC wiring.
- `src/renderer`: Renderer process and UI.
- `src/renderer/application/di`: Renderer DI registration modules (`register-*.ts`).
- `src/renderer/infrastructure/services/<domain>`: Renderer services grouped by domain (capture, devices, gpu, performance, settings, streaming, transcode, updates, platform).
- `src/renderer/presentation`: UI layer (features, bridges, effects, shell, config).
- `src/renderer/presentation/features/<feature>`: Feature-specific UI components and templates.
- `src/renderer/application`: App-level orchestrators and state.
- `src/main/infrastructure/<domain>`: Main-process services grouped by domain (devices, transcode, window, tray, logging, events).
- `tests/unit` and `tests/integration`: Test suites.

## Identifier Naming

- Classes use PascalCase and include role suffixes: `StreamingService`, `SettingsDisplayModeOrchestrator`.
- Services are UI-agnostic and emit events rather than manipulating DOM directly.
- Event channel names follow `domain:action` in kebab-case.
  - Shared event contract: `packages/prismgb-events/src/event-channels.ts` (via `@prismgb/events`).
  - Main event channels: `src/main/infrastructure/event-channels.config.ts`.
  - IPC channels: `packages/prismgb-ipc/src/ipc.manifest.json`, consumed through `packages/prismgb-ipc/src/ipc.manifest.ts` (via `@prismgb/ipc`).
- localStorage keys use camelCase values. Settings keys live in `src/renderer/lib/settings.definitions.json`; shared protected and notes keys live in `src/renderer/lib/storage-keys.config.ts`.

## Imports and Aliases

- Use path aliases for cross-module imports:
  - `@` -> `src`
  - `@main` -> `src/main`
  - `@renderer` -> `src/renderer`
  - `@preload` -> `src/preload`
  - `@prismgb/gpu` -> `packages/prismgb-gpu/src/index.ts`

## Core Primitive Conventions (`@prismgb/core`)

Pure, environment-agnostic primitives live in the `@prismgb/core` package. Interfaces representing abstract capabilities use PascalCase pure nouns (`Logger`, `EventBus`, `Storage`) — no `I...` prefixes or `...Like`/`...Interface` suffixes. Files use lowercase kebab-case; each interface concern gets its own file. Prefer extensionless TS imports.

## Testing Conventions

- Tests are `*.test.js` or `*.spec.js`.
- Unit tests live in `tests/unit`, integration tests in `tests/integration`.
