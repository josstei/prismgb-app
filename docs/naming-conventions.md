# Naming Conventions

<!-- Source: src/platform/ipc/ipc-channels.ts, src/platform/ipc/preload-api.contract.ts, src/platform/events/event-channels.ts, src/renderer/application/di/service-registrations.ts -->

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
| `.adapter.<ext>` | External or platform abstraction | `browser-media.adapter.ts` |
| `.handler.<ext>` | IPC or event handler | `window.handler.ts` |
| `.bridge.<ext>` | Cross-boundary coordination | `update.bridge.ts` |
| `.registry.<ext>` | Shared keyed collections | `component.registry.ts` |
| `.state.<ext>` | State containers | `app-state.ts` |
| `.factory.<ext>` | Object construction helpers | `subscription.factory.ts` |
| `.utils.<ext>` | Pure utilities | `filename-generator.utils.ts` |
| `.config.<ext>` | Configuration constants | `storage-keys.config.ts` (shared); `timing.config.ts` (in `@platform/config`) |
| `.class.<ext>` | Plain classes (no DI) | `event-bus.class.js` |
| `.interface.<ext>` | Interface definitions | `logger.interface.ts` |
| `.worker.<ext>` | Worker environment helpers | `capabilities.worker.ts` |
| `.contract.<ext>` | Public payload and API shapes | `preload-api.contract.ts` |
| `.testkit.<ext>` | Shared test fixtures and doubles | `media.testkit.ts` |
| `.base.<ext>` | Abstract base classes | `service.base.js` |

Device hardware behavior belongs in `src/platform/devices/domain/catalog.json`, `DeviceCatalog`, and the device connection/runtime services. Do not add hardware-specific adapter or runtime classes.

## Directory Conventions

- `src/main`: Electron main process.
- `src/preload`: Electron tRPC context bridge.
- `src/renderer`: Renderer process and UI.
- `src/renderer/application/di`: Renderer DI registration modules (`service-registrations.ts`, `manual-providers.ts`).
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
  - Shared event contract: `src/platform/events/event-channels.ts` (via `@platform/events`).
  - Main event channels: `src/platform/events/main-event-channels.ts`.
  - IPC channels: `src/platform/ipc/ipc-channels.ts`, consumed through `@platform/ipc`.
- localStorage keys use camelCase values. Settings keys live in `src/renderer/lib/settings.definitions.json`; shared protected and notes keys live in `src/renderer/lib/storage-keys.config.ts`.

## Imports and Aliases

- Use path aliases for cross-module imports:
  - `@` -> `src`
  - `@main` -> `src/main`
  - `@renderer` -> `src/renderer`
  - `@preload` -> `src/preload`
  - `@platform/config` -> `src/platform/config/index.ts`
  - `@platform/core` -> `src/platform/core/index.ts`
  - `@platform/devices` -> `src/platform/devices/index.ts`
  - `@platform/devices/runtime` -> `src/platform/devices/runtime.ts`
  - `@platform/devices/testkit` -> `src/platform/devices/testkit.ts`
  - `@platform/events` -> `src/platform/events/index.ts`
  - `@platform/gpu` -> `src/platform/gpu/index.ts`
  - `@platform/gpu/runtime` -> `src/platform/gpu/runtime.ts`
  - `@platform/ipc` -> `src/platform/ipc/index.ts`
  - `@platform/notes` -> `src/platform/notes/index.ts`
  - `@platform/transcode` -> `src/platform/transcode/index.ts`
  - `@platform/transcode/service` -> `src/platform/transcode/service.ts`
  - `@platform/ui-base` -> `src/platform/ui-base/index.ts`
  - `@platform/ui-base/reactive` -> `src/platform/ui-base/reactive/index.ts`
  - `@platform/updates` -> `src/platform/updates/index.ts`

## Core Primitive Conventions (`@platform/core`)

Pure, environment-agnostic primitives live in the `@platform/core` package. Interfaces representing abstract capabilities use PascalCase pure nouns (`Logger`, `EventBus`, `Storage`) — no `I...` prefixes or `...Like`/`...Interface` suffixes. Files use lowercase kebab-case; each interface concern gets its own file. Prefer extensionless TS imports.

## Testing Conventions

- Tests are `*.test.<ext>` or `*.spec.<ext>`.
- Shared testkits use `.testkit.ts`.
- Unit tests live in `tests/unit`, integration tests in `tests/integration`, E2E tests in `tests/e2e`, and shared device fixtures in `tests/devices`.
