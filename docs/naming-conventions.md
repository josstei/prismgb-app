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
  - Main event channels: `src/main/infrastructure/events/event-channels.config.ts`.
  - IPC channels: `src/shared/ipc/ipc.manifest.json`, consumed through `src/shared/ipc/ipc.manifest.ts`.
- localStorage keys use camelCase values. Settings keys live in `src/shared/features/settings/settings.definitions.json`; shared protected and notes keys live in `src/shared/config/storage-keys.config.ts`.

## Imports and Aliases

- Use path aliases for cross-module imports:
  - `@` -> `src`
  - `@main` -> `src/main`
  - `@renderer` -> `src/renderer`
  - `@preload` -> `src/preload`
  - `@shared` -> `src/shared`
  - `@core` -> `src/core` (Holds pure, environment-agnostic generic primitives)
  - `@prismgb/gpu` -> `packages/prismgb-gpu/src/index.ts`

## 🏛️ Modern Core & Interface Conventions

All foundational files inside `src/core/` follow 100% of modern industry standards:
1. **Interface Naming (Pure Nouns):** Interfaces representing abstract capabilities use PascalCase pure nouns (e.g. `Logger`, `EventBus`, `Storage`, `Adapter`) without legacy Hungarian prefixes (`I...`) or defensive suffixes (`...Like`, `...Interface`).
2. **File Naming (Scope of Concerns & kebab-case):** logical files and interfaces use lowercase kebab-case (e.g. `logger-factory.ts`, `event-bus.ts`) to ensure visual separation and 100% cross-platform path-resolution safety across macOS, Windows, and Linux CI/CD environments. Each interface concern has its own dedicated file.
- Prefer extensionless TS imports (avoid `.ts` suffix in TS/JS import specifiers).

## Testing Conventions

- Tests are `*.test.js` or `*.spec.js`.
- Unit tests live in `tests/unit`, integration tests in `tests/integration`.
