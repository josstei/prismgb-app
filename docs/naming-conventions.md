# Naming Conventions

<!-- Source: src/platform/ipc/ipc-channels.ts, src/platform/ipc/ipc-payloads.contract.ts, src/platform/events/event-channels.ts, src/renderer/application/di/*.module.ts -->

This document captures the naming and organization conventions used throughout PrismGB.

## File Names

- Use kebab-case for filenames.
- Base pattern: `<name>.<type>.<ext>`.
- Use descriptors between name and type when needed: `<name>-<detail>.<type>.<ext>`.
- Base classes use `<type>.base.<ext>`.
- Entry points are `index.<ext>`; DI registration modules are `<layer>.module.ts`.
- All source is `.ts`; nothing under `src/` ships as plain `.js`.

### Common Suffixes

A file's suffix is a DI-truthfulness signal, not decoration: `.service`, `.orchestrator`, `.adapter`, `.bridge`, `.store`, and `.module` files are commonly `@injectable()` and container-bound. `.controller.<ext>` is deliberately not on that list — the `ui-base` widget controllers (`disclosure`, `listbox-dropdown`, `combobox-listbox`, `activity-auto-hide`) are plain `new`'d behaviors with no DI relationship at all. There is no "plain class, no DI" suffix — a class that isn't DI-bound still takes a role-accurate suffix (e.g. a widget behavior class is `.controller.<ext>`, not `.class.<ext>`).

| Suffix | Purpose | Example |
| --- | --- | --- |
| `.service.<ext>` | Business logic and stateful operations | `streaming.service.ts` |
| `.orchestrator.<ext>` | Coordination across services | `capture.orchestrator.ts` |
| `.controller.<ext>` | Interaction/behavior controllers (widgets, UI composition) | `disclosure.controller.ts` |
| `.component.<ext>` | UI component logic | `notes-panel.component.ts` |
| `.adapter.<ext>` | External or platform abstraction | `browser-media.adapter.ts` |
| `.driver.<ext>` | Low-level hardware/backend drivers | `canvas.driver.ts` |
| `.monitor.<ext>` | Long-running observation loops | `usb.monitor.ts` |
| `.bridge.<ext>` | Cross-boundary coordination | `ipc-push.bridge.ts` |
| `.port.<ext>` | External-dependency seam (testing/replacement boundary) | `test-control.port.ts` |
| `.host.<ext>` | Composition root for a set of components/instances | `ui-component.host.ts` |
| `.registry.<ext>` | Shared keyed collections | `ipc-handler.registry.ts` |
| `.store.<ext>` | Reactive state containers | `stream-info.store.ts` |
| `.module.<ext>` | DI registration modules | `infrastructure.module.ts` |
| `.factory.<ext>` | Object construction helpers | `trpc-event-bridge.factory.ts` |
| `.template.<ext>` | Declarative DOM templates | `app-shell.template.ts` |
| `.effect.<ext>` | Presentation side-effects | `capture.effect.ts` |
| `.contract.<ext>` | Public payload and API shapes | `ipc-payloads.contract.ts` |
| `.schemas.<ext>` | Runtime (Zod) validation schemas | `transcode.schemas.ts` |
| `.manifest.<ext>` | Declarative single-source-of-truth registries | `event.manifest.ts` |
| `.definitions.<ext>` | Declarative data/config definitions | `settings.definitions.ts` |
| `.config.<ext>` | Configuration constants | `storage-keys.config.ts` (shared); `timing.config.ts` (in `@platform/config`) |
| `.utils.<ext>` | Pure utilities | `filename-generator.utils.ts` |
| `.base.<ext>` | Abstract base classes | `service.base.ts` |
| `.worker.<ext>` / `.browser.<ext>` / `.renderer.<ext>` | Environment-specific split of one concern | `capabilities.worker.ts` / `capabilities.browser.ts` |
| `.testkit.<ext>` | Shared test fixtures and doubles | `media.testkit.ts` |

Device hardware behavior belongs in `src/platform/devices/domain/catalog.json`, `DeviceCatalog`, and the device connection/runtime services. Do not add hardware-specific adapter or runtime classes.

## Directory Conventions

- `src/main`: Electron main process.
- `src/preload`: Electron tRPC context bridge.
- `src/renderer`: Renderer process and UI.
- `src/renderer/application/di`: Renderer DI registration modules (`application.module.ts`, `infrastructure.module.ts`, `presentation.module.ts`, `tokens.ts`).
- `src/renderer/infrastructure/services/<domain>`: Renderer services grouped by domain (capture, devices, gpu, performance, settings, streaming, transcode, updates, platform).
- `src/renderer/presentation`: UI layer (features, bridges, effects, shell, config, controller, state, primitives).
- `src/renderer/presentation/features/<feature>`: Feature-specific UI components and templates.
- `src/renderer/application`: App-level orchestrators and state.
- `src/main/infrastructure/<domain>`: Main-process services grouped by domain (devices, gpu, tray, window, logging).
- `src/main/application/di`: Main-process DI registration (`main.module.ts`, `tokens.ts`).
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
  - `@main` -> `src/main`
  - `@renderer` -> `src/renderer`
  - `@platform/config` -> `src/platform/config/index.ts`
  - `@platform/core` -> `src/platform/core/index.ts`
  - `@platform/devices` -> `src/platform/devices/index.ts`
  - `@platform/devices/runtime` -> `src/platform/devices/runtime.ts`
  - `@platform/devices/testkit` -> `src/platform/devices/testkit.ts`
  - `@platform/events` -> `src/platform/events/index.ts`
  - `@platform/gpu` -> `src/platform/gpu/index.ts`
  - `@platform/gpu/runtime` -> `src/platform/gpu/runtime.ts`
  - `@platform/gpu/testkit` -> `src/platform/gpu/testkit.ts`
  - `@platform/ipc` -> `src/platform/ipc/index.ts`
  - `@platform/notes` -> `src/platform/notes/index.ts`
  - `@platform/transcode` -> `src/platform/transcode/index.ts`
  - `@platform/transcode/runtime` -> `src/platform/transcode/runtime.ts`
  - `@platform/ui-base` -> `src/platform/ui-base/index.ts`
  - `@platform/ui-base/reactive` -> `src/platform/ui-base/reactive/index.ts`
  - `@platform/updates` -> `src/platform/updates/index.ts`

## Core Primitive Conventions (`@platform/core`)

Pure, environment-agnostic primitives live in the `@platform/core` package. Interfaces representing abstract capabilities use PascalCase pure nouns (`Logger`, `EventBus`, `Storage`) — no `I...` prefixes or `...Like`/`...Interface` suffixes. Files use lowercase kebab-case; each interface concern gets its own file. Prefer extensionless TS imports.

## Testing Conventions

- Tests are `*.test.<ext>` or `*.spec.<ext>`.
- Shared testkits use `.testkit.ts`.
- Unit tests live in `tests/unit`, integration tests in `tests/integration`, E2E tests in `tests/e2e`, and shared device fixtures in `tests/devices`.
