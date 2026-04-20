# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is PrismGB?

PrismGB is an Electron desktop app that streams and captures video from the Mod Retro Chromatic handheld gaming device over USB. It renders the Chromatic's 160x144 display via a GPU-accelerated 4-pass shader pipeline (upscale → unsharp mask → color elevation → CRT/LCD effects), and supports screenshot/recording output in WebM, MP4, and MOV formats.

## Commands

```bash
npm install                # Install dependencies (includes workspace packages)
npm run dev                # Start Vite dev server with Electron hot reload (port 3000)
npm run lint               # ESLint + architecture layer boundary checks
npm run lint:fix           # Auto-fix lint issues + boundary checks
npm run typecheck          # Typecheck app (tsconfig.app.json) + @prismgb/gpu workspace
npm run typecheck:app      # Typecheck app sources only
npm run test:run           # Run all tests once (unit + integration)
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm test                   # Watch mode
npm run test:coverage      # With coverage report (80% lines/functions/statements, 75% branches)
npm run build              # Vite build + electron-builder for current platform
npm run build:vite         # Renderer bundle only (useful for CI smoke checks)
```

Run a single test file:
```bash
npx vitest run tests/unit/app/renderer/container.test.js
```

Run tests matching a pattern:
```bash
npx vitest run -t "StreamingService"
```

## Architecture

### Three-Process Electron Model

| Process | Entry Point | DI Container | DI Library |
|---------|-------------|--------------|------------|
| **Main** | `src/main/index.ts` | `src/main/application/container.ts` | Awilix (proxy injection mode) |
| **Renderer** | `src/renderer/index.ts` → `renderer-app.orchestrator.ts` | `src/renderer/application/container.ts` | Custom `ServiceContainer` (`infrastructure/di/service-container.factory.ts`) |
| **Preload** | `src/preload/index.js` | N/A | N/A — wires contextBridge APIs |

The main and renderer processes each have their own DI container, EventBus, and logger factory. They communicate exclusively through IPC channels defined in `src/shared/ipc/channels.json`, bridged through the preload contextBridge APIs (`window.deviceAPI`, `window.windowAPI`, `window.updateAPI`, `window.transcodeAPI`, `window.shellAPI`, `window.gpuAPI`, `window.loginItemAPI`, `window.performanceAPI`).

### Renderer Layer Architecture (Clean Architecture)

```
src/renderer/
├── application/           # Orchestrators, state, DI container
│   ├── container.ts       # Composition shell (delegates to di/ registration modules)
│   ├── di/                # register-*.ts modules (one per domain)
│   ├── orchestrators/     # Coordinate services, manage state machines
│   └── state/             # App-level state (app-state.ts)
├── infrastructure/        # Services, adapters, factories, rendering
│   ├── services/          # Business logic by domain:
│   │   ├── capture/       #   Screenshot, recording, GPU recording
│   │   ├── devices/       #   Device connection, media, storage
│   │   ├── notes/         #   Notes persistence
│   │   ├── performance/   #   Animation, metrics, state
│   │   ├── settings/      #   Settings, fullscreen, cinematic, presentation mode
│   │   ├── streaming/     #   Streaming, GPU render loop, viewport, health
│   │   ├── transcode/     #   FFmpeg transcoding coordination
│   │   └── updates/       #   Auto-update UI
│   ├── adapters/          # Platform/external abstractions (devices/, streaming/, platform/)
│   ├── factories/         # Streaming adapter/renderer construction
│   ├── rendering/         # Shaders (WebGL2/WebGPU), workers, capability detection
│   ├── events/            # EventBus (eventemitter3), event channel constants
│   └── browser/           # Browser API adapters (storage, media)
└── presentation/          # UI layer
    ├── features/          # Feature modules (fullscreen, notes, settings, streaming, toolbar, etc.)
    ├── shell/             # App shell renderer (HTML templates)
    ├── effects/           # UI effects (auto-hide, capture flash, button feedback)
    ├── bridges/           # Presentation-to-service bridges (capture-ui, transcode-ui, ui-event)
    ├── config/            # UI constants (CSS classes, DOM selectors, storage keys)
    ├── controller/        # UI controller and component registry
    └── primitives/        # Reusable UI building blocks
```

**Layer import rules** (enforced by ESLint + `scripts/check-layer-boundaries.js`):
- `presentation/` cannot import from `infrastructure/` or `@main/*`
- `infrastructure/` cannot import from `presentation/` or `@main/*`
- `application/` cannot import from `@main/*`
- `shared/` cannot import from any process-specific code
- Presentation accesses services only through orchestrators and bridges

### Main Process Structure

```
src/main/
├── application/           # AppOrchestrator, container (Awilix)
├── infrastructure/        # Services by domain:
│   ├── devices/           #   USB detection, device lifecycle, device bridge
│   ├── events/            #   EventBus, event channels
│   ├── logging/           #   Winston logger factory
│   ├── platform/          #   GPU policy, login item service
│   ├── transcode/         #   FFmpeg process management
│   ├── tray/              #   System tray
│   ├── updates/           #   electron-updater, update bridge
│   └── window/            #   BrowserWindow management
└── ipc/                   # IPC handler registry + handlers by domain
```

### Workspace Packages

The project uses npm workspaces (`packages/`). The only active package is:

- **`@prismgb/gpu`** (`packages/prismgb-gpu/`) — GPU rendering primitives: `PresetRegistry`, `buildUniforms`, `detectCapabilities`, shader types. Imported via the `@prismgb/gpu` path alias.

Other package directories (`prismgb-core`, `prismgb-devices`, `prismgb-di`, `prismgb-ipc`, `prismgb-stream-source`) exist as scaffolding for future extraction but are not yet active.

### Key Patterns

**Base classes** (`src/shared/base/`):
- `BaseService` — dependency validation + logger creation. Constructor takes `(dependencies, requiredDeps[], serviceName)`.
- `BaseOrchestrator` — extends BaseService pattern with lifecycle (`initialize`/`cleanup`), template methods (`onInitialize`/`onCleanup`), and `subscribeWithCleanup(eventMap)` for automatic EventBus subscription tracking.

**EventBus** — publish/subscribe using eventemitter3. Channel names follow `domain:action` convention. Source of truth: `src/shared/events/event-channels.ts`. Services publish events; orchestrators subscribe and coordinate.

**IPC contracts** — shared types in `src/shared/ipc/preload-api.contract.ts`. Channel names in `src/shared/ipc/channels.json`. Preload APIs in `src/preload/apis/` with input validation.

**Renderer DI registration** — the container (`application/container.ts`) delegates to modular registration functions in `application/di/register-*.ts` (one per domain: infrastructure, devices, streaming, capture, ui, orchestrators).

## Path Aliases

Configured in `vite.config.js`, `vitest.config.js`, and `tsconfig.app.json`:

| Alias | Path |
|-------|------|
| `@` | `src/` |
| `@main` | `src/main/` |
| `@renderer` | `src/renderer/` |
| `@preload` | `src/preload/` |
| `@shared` | `src/shared/` |
| `@prismgb/gpu` | `packages/prismgb-gpu/src/index.ts` |

## File Naming Conventions

All files use kebab-case with a type suffix: `<name>.<type>.<ext>` (e.g., `streaming.service.ts`, `capture.orchestrator.ts`, `device-chromatic.profile.js`).

Key suffixes: `.service`, `.orchestrator`, `.adapter`, `.handler`, `.bridge`, `.registry`, `.factory`, `.config`, `.utils`, `.component`, `.template`, `.class`, `.interface`, `.base`, `.worker`, `.profile`, `.state`.

Use `.ts` for typed modules, `.js` for runtime-only modules. Base classes use `<type>.base.<ext>` pattern.

## Testing

- **Framework**: Vitest with happy-dom environment, globals enabled
- **Structure**: `tests/unit/` for unit tests, `tests/integration/` for integration tests
- **Setup files**: `tests/setup.js`, `tests/testing-library.setup.js`
- **Test pool**: `forks` with max 2 workers
- **E2E**: Playwright (separate from Vitest; run via `npm run test:e2e`)

## Code Style

- 2-space indentation, single quotes, semicolons required, Unix line endings
- ESLint flat config (`eslint.config.js`) with TypeScript parser for `.ts` files
- No inline comments; use JSDoc for documentation
- TypeScript: strict mode, `noImplicitAny`, `strictNullChecks`

## Commit Convention

Conventional Commits enforced by Husky + commitlint:
```
feat(scope): description
fix(scope): description
refactor(scope): description
```

Pre-commit hook runs `npm test`. Commit-msg hook validates format.

## Documentation (`docs/`)

| Document | What It Covers | When to Consult |
|----------|---------------|-----------------|
| [`docs/feature-map.md`](docs/feature-map.md) | Maps every user-facing feature to its owning directories, UI surface map (template → component → orchestrator/bridge), step-by-step UI flows (streaming, capture, recording, transcoding, settings, notes, updates), data/storage locations, and extension points (adding devices, presets, settings) | Adding/modifying features, tracing event flows, understanding which services own what |
| [`docs/architecture-diagrams.md`](docs/architecture-diagrams.md) | Mermaid diagrams of renderer DI composition, streaming/device selection, capture/GPU recording, transcode flow (cross-process), performance/metrics, main process IPC, UI event flow, and cross-process channels | Understanding service boundaries, IPC flows, and dependency relationships |
| [`docs/architecture-diagrams-onboarding.md`](docs/architecture-diagrams-onboarding.md) | Simplified subset of the architecture diagrams for onboarding — app startup, UI-to-streaming flow, capture, performance, main process IPC, and cross-process channels | Quick orientation for new contributors |
| [`docs/naming-conventions.md`](docs/naming-conventions.md) | Authoritative file naming rules (suffix table), directory conventions, identifier naming (PascalCase classes, `domain:action` events), import alias rules, and testing conventions | Creating new files, naming classes/events, understanding import patterns |
| [`docs/ci-cd-workflows.md`](docs/ci-cd-workflows.md) | GitHub Actions workflows (PR validation, build smoke, release prepare/publish, dependency audit, dependabot automerge), reusable workflows, composite actions, and shared CI scripts | Modifying CI/CD, understanding the release process, debugging build failures |
| `docs/plans/` | Dated design and implementation documents for completed features (e.g., auto-start) | Historical reference for past architectural decisions |

## Architecture Validation

- `npm run lint` runs ESLint + `scripts/check-layer-boundaries.js` (static import analysis enforcing layer dependency rules)
- `npm run architecture:scorecard` generates an architecture conformance report
- `npm run architecture:type-debt:report` tracks TypeScript migration progress

## Platform Refactor — Phase 0 Tooling Foundation

Phase 0 of the platform refactor (spec: `docs/superpowers/specs/2026-04-17-prismgb-platform-refactor-design.md`) has landed. The following tooling is active:

### Monorepo orchestration
- **Turborepo** (`turbo.json`) orchestrates build/test/lint/typecheck tasks across packages with caching.
- Commands: `npx turbo run build`, `npx turbo run test --filter=@prismgb/gpu`, etc.

### Versioning
- **Changesets** (`.changeset/config.json`) manages package versions.
- Tier 1 packages (`@prismgb/core`, `@prismgb/transport`, `@prismgb/runtime`) will be linked together in Phase 1 once those packages exist.
- Other packages will version independently. All packages are `private: true`.
- Add changesets for PRs changing packages: `npx changeset`.

### Dependencies added
- Runtime: `tsyringe`, `reflect-metadata`, `@trpc/server@11`, `@trpc/client@11`, `electron-trpc`, `comlink`, `zod@4`, `mitt`, `pino`, `consola`, `rxjs`.
- Dev: `turbo`, `@changesets/cli`, `license-checker`, `eslint-plugin-import`, `eslint-import-resolver-typescript`, `pixelmatch`, `@swc/core`, `unplugin-swc`.

Old deps (`awilix`, `eventemitter3`, `joi`, `winston`) remain during migration; removed in Phase 6.

### Testing
- Vitest runs in **projects mode** (`vitest.config.ts` with `test.projects`). Existing test commands (`npm test`, `npm run test:unit`, etc.) behave identically. Workspace glob `packages/*` auto-discovers per-package vitest configs.

### Transpilation
- **SWC** (via `unplugin-swc`, configured from shared `scripts/swc.config.js`) replaces esbuild for TypeScript transpilation in Vite and Vitest pipelines.
- Required because esbuild does not emit decorator metadata; `tsyringe` (Phase 1) needs `emitDecoratorMetadata` at runtime.

### License compliance
- CI workflow `.github/workflows/license-check.yml` fails PRs that introduce GPL/AGPL/LGPL/CDDL/EPL/OSL/SSPL licenses in production deps.
- `ffmpeg-static` is excluded from the check because its npm metadata reports GPL (reflecting the bundled binary); the JS wrapper itself is MIT. Binary licensing is handled separately via `electron-builder` `asarUnpack`.
- Local check: `npx license-checker --production --excludePackages "prismgb@$(node -p 'require(\"./package.json\").version'),ffmpeg-static" --failOn "GPL;AGPL;LGPL;CDDL;EPL;OSL;SSPL"`.

### TypeScript
- `tsconfig.base.json` now enables `experimentalDecorators` and `emitDecoratorMetadata` (required for Phase 1's `tsyringe` + `reflect-metadata`).

### Layer boundaries
- `scripts/check-layer-boundaries.js` extended with 6 package-level rules (inert until packages exist in Phase 1). Fixture tests at `tests/fixtures/layer-boundaries/package-*`.
- `eslint-plugin-import` with `import/no-restricted-paths` adds lint-time process boundary enforcement. Resolver configured via `tsconfig.base.json` for alias resolution.
- `npm run lint` now lints both `src/**` and `packages/**`.

### Validation
- `npm run validate:phase-0` runs the full tooling validation chain (lint → typecheck → tests → license → turbo → changeset).

### Empty scaffolding removed
- Eight unused scaffolded package directories (`prismgb-chroma`, `prismgb-core`, `prismgb-devices`, `prismgb-di`, `prismgb-ipc`, `prismgb-shader-compiler`, `prismgb-shader-presets`, `prismgb-stream-source`) have been removed. Only `prismgb-gpu` remains in `packages/`.
