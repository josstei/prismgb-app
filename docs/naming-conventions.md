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
| `.config.<ext>` | Configuration constants | `timing.config.ts` |
| `.class.<ext>` | Plain classes (no DI) | `event-bus.class.js` |
| `.interface.<ext>` | Interface definitions | `logger.interface.ts` |
| `.worker.<ext>` | Web workers | `render.worker.ts` |
| `.profile.<ext>` | Device profiles | `device-chromatic.profile.js` |
| `.base.<ext>` | Abstract base classes | `service.base.js` |

## Directory Conventions

- `src/main`: Electron main process.
- `src/preload`: Context bridge APIs and IPC wiring.
- `src/renderer`: Renderer process and UI.
- `src/shared`: Process-agnostic utilities and config.
- `src/renderer/application/di`: Renderer DI registration modules (`register-*.ts`).
- `src/renderer/infrastructure/services/<domain>`: Renderer services by domain (capture, devices, notes, performance, settings, streaming, transcode, updates).
- `src/renderer/presentation`: UI layer (features, bridges, effects, shell, config).
- `src/renderer/presentation/features/<feature>`: Feature-specific UI components and templates.
- `src/renderer/application`: App-level orchestrators and state.
- `src/main/infrastructure/<domain>`: Main-process services by domain (devices, transcode, updates, window, tray, etc.).
- `tests/unit` and `tests/integration`: Test suites.

## Identifier Naming

- Classes use PascalCase and include role suffixes: `StreamingService`, `SettingsDisplayModeOrchestrator`.
- Services are UI-agnostic and emit events rather than manipulating DOM directly.
- Event channel names follow `domain:action` in kebab-case.
  - Shared event contract: `src/shared/events/event-channels.ts`.
  - Compatibility re-export: `src/renderer/infrastructure/events/event-channels.config.js`.
  - IPC channels: `src/shared/ipc/channels.json`.
- localStorage keys use camelCase values and live in `src/shared/config/storage-keys.config.ts`.

## Imports and Aliases

- Use path aliases for cross-module imports:
  - `@` -> `src`
  - `@main` -> `src/main`
  - `@renderer` -> `src/renderer`
  - `@preload` -> `src/preload`
  - `@prismgb/gpu` -> `packages/prismgb-gpu/src/index.ts`
  - `@prismgb/core` -> `packages/prismgb-core/src/index.ts`
  - `@prismgb/di` -> `packages/prismgb-di/src/index.ts`
  - `@prismgb/ipc` -> `packages/prismgb-ipc/src/index.ts`
  - `@prismgb/devices` -> `packages/prismgb-devices/src/index.ts`
  - `@prismgb/stream-source` -> `packages/prismgb-stream-source/src/index.ts`
- `src/core` and `src/shared` have been retired and removed; the `@core` and `@shared` aliases are not configured, so those imports will fail at build time.
- Prefer extensionless TS imports (avoid `.ts` suffix in TS/JS import specifiers).

## Testing Conventions

- Tests are `*.test.js` or `*.spec.js`.
- Unit tests live in `tests/unit`, integration tests in `tests/integration`.
