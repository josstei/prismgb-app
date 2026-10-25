# Naming Conventions

<!-- Source: src/platform/ipc/ipc-channels.ts, src/platform/ipc/ipc-payloads.contract.ts, src/platform/events/event-channels.ts, src/renderer/application/container.ts -->

This document captures the naming and organization conventions used throughout PrismGB.

## File Names

- Use kebab-case for filenames.
- Base pattern: `<name>.<type>.<ext>`.
- Use descriptors between name and type when needed: `<name>-<detail>.<type>.<ext>`.
- Base classes use `<type>.base.<ext>`.
- Entry points are `index.<ext>`; process composition roots retain `application/container.ts` and export typed runtime factories.
- All source is `.ts`; nothing under `src/` ships as plain `.js`.

### Common Suffixes

Suffixes describe responsibilities, not construction mechanisms. Services, orchestrators, adapters, stores, and widget controllers are ordinary classes. Their owners construct them with typed dependency objects; no injection decorators or registration modules are required.

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
- `src/renderer/application/container.ts`: Renderer runtime construction, deferred component factories, and lifecycle ownership.
- `src/renderer/infrastructure/services/<domain>`: Renderer services grouped by domain (capture, devices, gpu, performance, settings, streaming, transcode, updates, platform).
- `src/renderer/presentation`: UI layer (features, bridges, effects, shell, config, controller, state, primitives).
- `src/renderer/presentation/features/<feature>`: Feature-specific UI components and templates.
- `src/renderer/application`: App-level orchestrators and state.
- `src/main/infrastructure/<domain>`: Main-process services grouped by domain (devices, gpu, tray, window, logging).
- `src/main/application/container.ts`: Main runtime construction, Electron capabilities, and lifecycle ownership.
- `tests/unit` and `tests/integration`: Test suites.

## Identifier Naming

- Classes use PascalCase and include role suffixes: `StreamingService`, `SettingsDisplayModeOrchestrator`.
- Services are UI-agnostic and emit events rather than manipulating DOM directly.
- Event channel names follow `domain:action` in kebab-case.
  - Renderer channel/payload declarations: `src/platform/events/event.manifest.ts` (via `@platform/events`).
  - Main-to-renderer push channels: `src/platform/ipc/ipc-channels.ts`, consumed through `@platform/ipc`.
  - Requests: typed tRPC procedures in `src/main/ipc/router.ts`; do not add parallel request-channel constants.
- localStorage keys use camelCase values. Settings keys live in `src/renderer/lib/settings.definitions.ts`; shared protected and notes keys live in `src/renderer/lib/storage-keys.config.ts`.

## Imports and Aliases

- Use `@main` and `@renderer` for process-local cross-module imports.
- Import platform modules through public entrypoints declared in `scripts/lib/workspace-aliases.mjs`; deep platform imports are rejected by dependency rules.
- Keep browser-safe roots separate from Node/Electron runtime and testkit entrypoints.
- Vite, Vitest, dependency checks, and Knip consume the registry. TypeScript consumes `tsconfig.paths.generated.json`; regenerate it with `npm run generate:paths` and verify with `npm run check:generated`.

## Core Primitive Conventions (`@platform/core`)

Pure, environment-agnostic primitives live in the `@platform/core` package. Use narrow capability interfaces and typed dependency objects, following existing names such as `LoggerFactoryLike` and `StorageServiceLike`. Keep definitions near their owner unless multiple modules need the same contract. Lifecycle helpers provide shared initialization, rollback, and ordered teardown; business services retain ownership of their resources.

## Testing Conventions

- Tests are `*.test.<ext>` or `*.spec.<ext>`.
- Shared testkits use `.testkit.ts`.
- Unit tests live in `tests/unit`, integration tests in `tests/integration`, E2E tests in `tests/e2e`, and shared device fixtures in `tests/devices`.
