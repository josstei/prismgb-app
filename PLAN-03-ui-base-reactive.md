# Plan 03 — Option B: `@prismgb/ui-base` Reactive Migration

> Status: authored 2026-06-29, revised 2026-06-29 (adversarial-audit pass). Base branch: `refactor/codebase_reduction`. Executor: autonomous coding agent (Codex). This document is self-contained and unambiguous; execute top to bottom. Re-verify every count/path with the commands inline before acting — the repo moves and stale literals are a known hazard.

---

## 0. Goal & End State

Stand up a new browser-UI package `@prismgb/ui-base`, adopt a **hand-rolled, zero-dependency** signal/effect/computed reactive primitive (Phase 1.2), build DOM binding helpers (`bindText`/`bindClass`/`bindAttr`/`bindVisible`/`bindProperty`) wired through `@prismgb/core`'s `DisposableBag`, convert state-bearing presentation components from imperative DOM-write methods to signal bindings, and delete the state→DOM glue (bridge handlers, controller methods, redundant template machinery) as each is fully unconsumed.

"Done" concretely:

1. `packages/prismgb-ui-base/` exists, mirrors the existing package conventions (parity with `@prismgb/core`/`@prismgb/events`), depends only on `@prismgb/core` (the reactive primitive is hand-rolled — no external reactivity dep), **builds to `dist` and is consumed by the app from `dist`** (the Plan-02 model — no vite alias), and is src-aliased on the fast paths only (vitest `sharedAlias` + `tsconfig.app.json` + `tsconfig.base.json`).
2. A single reactive seam file re-exports `signal`/`computed`/`effect`/`batch` — the **one-line philosophy-fork** the owner can flip to a hand-rolled signal without touching any consumer.
3. DOM binding helpers exist with their own happy-dom unit tests proving synchronous signal→DOM updates.
4. The accessible-widget toolkit (`PresentationComponent` anchor + `Disclosure`/`Listbox`/`Combobox`/`ActivityAutoHide` controllers + generic `template-ref` helpers) lives in `@prismgb/ui-base`; the 29 subclass import sites point at the package.
5. `AppState` fields are dual-exposed: the existing value getters still return primitives (orchestrators/services unchanged) AND backing signals are exposed for bindings. For **stored** fields the value getter reads `.value`; for **derived** fields (`isStreaming`/`deviceConnected`) the value getter keeps deriving live from the service and a *parallel* event-fed signal is added for bindings (see F5 / Phase 3 — this is intentional, the gate must not be re-pointed).
6. The state-bearing components are converted feature-group by feature-group; at every commit, converted components coexist at runtime with the still-imperative ones (validated by `dev:smoke` + e2e).
7. Glue files/methods are deleted only when grep proves zero remaining consumers; the existing CSS, the ARIA widget primitives, and the `@prismgb/events` bus are untouched.
8. Every commit independently passes the full gate set (§5). No commit uses `--no-verify`.

Non-goal for "done": this plan does **not** retire the `@prismgb/*→src` vite aliasing, does **not** build packages to `dist` via turbo, and does **not** convert the activity-driven effects, the gated presentation-mode coordination side-effects, or ARIA widgets to naive single-signal toggles (they stay imperative or, where converted, preserve their exact gating/timing). See §8.

---

## 1. Preconditions

Run these before starting; all must hold.

```bash
cd /Users/josstei/Development/prismgb-workspace/prismgb-app
git branch --show-current          # expect: refactor/codebase_reduction
git status --short                 # expect: empty (clean tree) — SEE NOTE BELOW re: this plan doc
node -v                            # workspaces hoist target
ls packages/                       # expect: config core devices events gpu ipc notes transcode updates (NO ui-base yet)
git grep -rl "@preact" -- packages 2>/dev/null || echo "no @preact anywhere — reactive primitive is hand-rolled"
```

> **Clean-tree precondition vs. this plan document.** This file (`docs/plan-03-ui-base-reactive-migration.md`, and any sibling `docs/plan-04-*.md`) is currently **untracked** (`git status --short` shows `?? docs/plan-03-ui-base-reactive-migration.md`). An untracked file violates the clean-tree gate the AGY launcher enforces. Before launching: **commit this plan document (and any sibling plan docs) to the base branch** `refactor/codebase_reduction` (e.g. `docs(plan): add plan-03 ui-base reactive migration`) so the tree is genuinely clean, OR stash/move them out of the worktree. Do this FIRST; the rest of the precondition block assumes a clean tree.

Prior plans landed: this plan assumes the Wave-1 core promotions are present (`TypedRegistryFactory`, type-utils, guards, `throttle`/`createDeferred`, `ConsoleLoggerFactory` all exported from `@prismgb/core` — verify `git grep -n "DisposableBag\|TypedRegistryFactory" packages/prismgb-core/src/index.ts`). The `@prismgb/ui-base` package does **not** exist yet (`ls packages/prismgb-ui-base` must fail).

Create the working branch off the base:

```bash
git checkout refactor/codebase_reduction
git pull --ff-only        # if a remote is configured; otherwise skip
git checkout -b refactor/p03-ui-base-reactive
```

Record the test baseline before any change (the safety net for the whole plan):

```bash
npm run test:run 2>&1 | tail -5     # record "Test Files N passed / Tests M passed"
```

Verified presentation ground truth at authoring time (re-verify, do not trust blindly):

```bash
# presentation source size
find src/renderer/presentation -name '*.ts' | wc -l            # 56 TS files
find src/renderer/presentation -name '*.ts' -print0 | xargs -0 wc -l | tail -1   # ~8016 LOC
find src/renderer/presentation -name '*.css' -print0 | xargs -0 wc -l | tail -1  # ~5271 LOC
# manual DOM-write sites
git grep -oE "\.textContent|\.classList\.|\.setAttribute|\.innerHTML|\.style\." -- 'src/renderer/presentation/**/*.ts' | wc -l   # 247 sites
git grep -lE "\.textContent|\.classList\.|\.setAttribute|\.innerHTML|\.style\." -- 'src/renderer/presentation/**/*.ts' | wc -l   # 27 files
# subclasses
git grep -l 'extends PresentationComponent' -- src | wc -l     # 29
# presentation tests
find tests -path '*presentation*' -name '*.ts' -print0 | xargs -0 wc -l | tail -1   # ~9070 LOC across 33 files
```

---

## 2. Locked Decisions (restated — do not re-open)

| # | Decision | How this plan encodes it |
|---|----------|--------------------------|
| L1 | Base branch is `refactor/codebase_reduction`; this plan runs on its own branch, gated, then squash-merged. | Branch `refactor/p03-ui-base-reactive` per §1. |
| L2 | `@prismgb/core` stays dependency-free, standalone-buildable, no `window`/DOM/Node imports. | ui-base depends on core (one-directional, acyclic); **nothing** is added to core. Bindings/widgets live in ui-base. |
| L3 | UI direction = Option B (in-house reactive toolkit), NOT React/PrimeReact. | No JSX, no React. Vanilla DOM + signals + bindings. |
| L4 | Reactive primitive = **HAND-ROLLED, zero-dependency** signal/effect/computed/batch, located in `@prismgb/ui-base` (NOT core — it has no core-level consumer). | Phase 1.2 reactive seam (`reactive/signal.ts`). Owner chose in-house over a lib for primitives-over-frameworks purity. |
| L5 | The reactive engine is isolated to ONE file (`reactive/signal.ts`); every consumer imports it via the relative `./signal.js`. | Keeps the engine swappable: it can be replaced (e.g. with a lib later) by editing that one file and nothing else. The Phase-1.3 correctness suite is the safety net for the hand-rolled impl. |
| L6 | Build-model end-state = packages build to `dist` via turbo, app consumes built artifacts, turbo in CI, retire `@prismgb/*→src` aliasing. | **By scope:** ui-base conforms to the **current** `@prismgb/*→src` aliasing now (parity with the existing packages; `dev:smoke` is the runtime gate). The dist/turbo/CI/alias-retirement migration is cross-cutting (all packages) and is delivered by the **separate build-model plan**, not here. Repeated in §8. |
| L7 | Device manifest/registry seam = KEEP (intentional extension point). | Untouched by this plan. |
| L8 | Signals replace state→DOM only, NOT event→state. The `@prismgb/events` bus still feeds `AppState`/presentation stores; fields become signals; bindings react. Bus untouched. | Every conversion keeps the bus subscription as the event→state writer; only the imperative state→DOM path is replaced by a binding. |

---

## 3. Current-State Facts (re-verify before acting)

**F1 — `PresentationComponent` base** (`src/renderer/presentation/primitives/presentation-component.base.ts`): a browser disposable-component lifecycle base over a `DisposableBag` (`_disposables`). Protected lifecycle: `listen`/`timeout`/`interval`/`animationFrame`/`observe`/`track`/`replaceManaged`/`replaceManagedAsync`/`cancelManaged`/`createLifecycleToken`/`replaceTimeout`/`replaceAnimationFrame`/`trackSubscription`. Imports only `@prismgb/core` (`DisposableBag`, `Disposable`, `DisposableFunction`, `DisposableKey`). It is the cleanest ui-base member. **No direct unit test today** (add one in Phase 2.1). 29 subclasses (F2).

**F2 — 29 `extends PresentationComponent` sites** (verified `git grep -l 'extends PresentationComponent' -- src` → 29; group counts sum 7+4+8+4+2+2+2 = 29):
- **Effects (7):** `effects/{body-class.class, button-feedback.effect, capture.effect, controls-auto-hide.effect, cursor-auto-hide.effect, toolbar-auto-hide.effect, ui-effects.class}.ts` (verified the `effects/` dir holds exactly 7 subclasses; the prior "(8)" label was a documentation defect).
- **ARIA widgets / activity (4):** `primitives/{activity-auto-hide.controller, combobox-listbox.class, disclosure.class, listbox-dropdown.class}.ts`
- **Notes (8):** `features/notes/{game-autocomplete, game-filter, notes-editor-view, notes-list-view, notes-panel-layout, notes-panel, notes-resize-handler, notes-search}.component.ts`
- **Toolbar (4):** `features/toolbar/{cinematic-toggle, shader-preset-list, shader-selector, shader-slider-controls}.component.ts`
- **Settings/updates (2):** `features/settings/settings-menu.component.ts`, `features/updates/update-section.component.ts`
- **Streaming/transcode (2):** `features/streaming/streaming-controls.component.ts`, `features/transcode/transcode-toast.component.ts`
- **Shared (2):** `shared/{device-status, status-notification}.component.ts`

**F3 — 247 manual DOM-write sites / 27 files** (re-verify count command in §1). Top files: `update-section`(34), `streaming-controls`(23), `device-status`(21), `combobox-listbox`(20), `transcode-toast`(15), `notes-list-view`(14), `notes-resize-handler`(13), `body-class`(12).

**F4 — State→DOM glue layer:**
- 3 bridges (`presentation/bridges/`): `capture-ui.bridge.ts` (106 LOC), `transcode-ui.bridge.ts` (89), `ui-event.bridge.ts` (224). All extend `BaseService`, subscribe to domain `EventChannels.*`, and call into `UIController` via `*Like` structural interfaces. The bridges translate **events→events** and **events→imperative-controller-calls**; the controller then calls `registry.get(component).method()`. The glue to delete *per conversion* is the **specific bridge handler + the `*Like` interface member + the `UIController` method + the component's imperative method** — but only for the methods that are pure state→DOM display. Presentation-*mode* coordination (see F12) is NOT pure display and is exempt.
- 7 effects (`presentation/effects/`): `body-class.class.ts`, `button-feedback.effect.ts`, `capture.effect.ts`, `controls-auto-hide.effect.ts`, `cursor-auto-hide.effect.ts`, `toolbar-auto-hide.effect.ts`, `ui-effects.class.ts`. `body-class.class.ts` is the body-class sink (it owns `streaming-mode`, `cinematic-active`, `fullscreen-active`, `minimalist-fullscreen` (with a transition-timing side-effect), plus the activity classes `app-idle`/`app-hidden`/`app-animations-off`). The auto-hide/button-feedback/capture effects are **activity/transient-animation driven**, not state→DOM, and stay imperative (§8).
- Template machinery (`presentation/primitives/`): `template-ref.utils.ts` (158 LOC — generic `data-ref`/`data-action` helpers **plus** a domain `UIAction*` block that imports `@prismgb/events`+`template-dom.contract` and must be split before the generic part moves; see F11/Phase 2.3), `dom-bindings.utils.ts` (100 — app-specific DOM identity, KEEP), `template-dom.contract.ts` (19 dense lines — app DOM manifest, KEEP). The generic `data-ref`/`data-action` engine is the promotable part.

**F5 — `AppState`** (`src/renderer/application/state/app-state.ts`, 102 LOC): event-bus-driven holder.
- Stored fields: `isCinematicModeEnabled` (bool, assigned `true` in the constructor, default), `_streamCache`/`_capabilitiesCache` (set by `EventChannels.STREAM.STARTED/STOPPED` subscriptions in `_setupEventSubscriptions`), `_subscriptions: Array<()=>void>` (hand-rolled, not `DisposableBag`; iterated + cleared in `dispose()`).
- Derived getters (NOT stored, NO signal/event feed today): `isStreaming` → `this.streamingService?.isStreaming ?? false`; `deviceConnected` → `this.deviceService?.isConnected ?? false`. **`StreamingOrchestrator.start()` gates streaming on `this.appState.deviceConnected` (`streaming.orchestrator.ts:119`).** Therefore these getters MUST keep deriving live from the service — converting them to read a stored signal would risk a false-initial or missed-event value that incorrectly blocks streaming. Dual-exposure for these two means: **keep the live getter unchanged; add a separate event-fed `*Signal` initialized from the current service value, for bindings only** (Phase 3). The gate reads the live getter; bindings read the signal. They are intentionally dual-sourced — a future reader must NOT "consolidate" them.
- Cache getters: `currentStream` → `_streamCache ?? streamingService?.getStream?.() ?? null`; `currentCapabilities` → `_capabilitiesCache ?? streamingService?.currentCapabilities ?? null`. These are stored-with-fallback; converting `_streamCache`/`_capabilitiesCache` to signals keeps the fallback in the getter.
- Registered in DI at `src/renderer/application/di/service-registrations.ts` (`appState: (cradle) => new AppState(cradle)`). Value consumers (must keep working): `capture.orchestrator`, `streaming.orchestrator`, `streaming-audio.orchestrator`, `ui-setup.orchestrator`, `settings-cinematic-mode.service`, `settings-presentation-mode.service`, `render-pipeline.service`, the streaming renderer adapters (~8 read-as-primitive sites — `git grep -n "appState\." -- src` to enumerate).

**F6 — Boundary checker requires NO change** (evidence: `scripts/check-layer-boundaries.js:258-298`). `resolveAliasTarget` handles only `@/`, `@main/`, `@renderer/`, `@shared/`, `@preload/`, `@core/`; a `@prismgb/...` specifier matches none, then `resolveTargetLayer` returns `null` for any non-`.`-relative specifier (`:292-293`), so the import is skipped. This is exactly how existing `@prismgb/core`/`@prismgb/events` imports already pass. `analyzeLayerBoundaries` walks only `src/` (`:319`), so package files are never analyzed as sources. **Therefore `@prismgb/ui-base` imports (from any `src/` layer) produce zero violations with no checker change.** Do not modify `check-layer-boundaries.js`; do not extend it to police `main→ui-base` (that gap is pre-existing and out of scope). The notion "the boundary checker must learn `@prismgb/ui-base`" is **incorrect** and is intentionally not actioned — recorded here so a reviewer sees the reasoned omission.

**F7 — Alias surfaces are THREE under the Plan-02 dist model** (RE-VERIFY — Plan 02 retired the vite `@prismgb/*` src-aliases; confirm with `git grep -n "@prismgb/core" -- vite.config.js`, expected EMPTY):
- `vite.config.js` — **NO `@prismgb/*` aliases anymore** (the app consumes packages from `dist`). Do NOT add a ui-base vite alias.
- `vitest.config.js` — `sharedAlias` (currently contains `@prismgb/{gpu,core,events,config,ipc,devices/service,devices,transcode/service,transcode,updates,notes}` — re-verify the live list). ADD ui-base here.
- `tsconfig.app.json` — `paths`. ADD ui-base here.
- `tsconfig.base.json` — `paths` (its own block; the `@prismgb/*` + `@prismgb/*/*` pattern pairs). ADD ui-base here.
The app resolves `@prismgb/ui-base` at build/runtime from its built `dist` (via the workspace `node_modules` symlink), NOT an alias — so the package MUST build to dist with correct `exports` (Phase 1.1). Subpath precedent: `@prismgb/devices/service` is aliased separately (vitest/tsconfig) AND exposed via `dist` `exports` `./service`; mirror both for `@prismgb/ui-base/reactive`.

**F8 — Package wiring facts (verified against `package.json` + `vitest.config.js`):**
- Root `typecheck` = `typecheck:app && typecheck:tests && typecheck:gpu && typecheck:core` — it runs only the `gpu` and `core` workspaces (each standalone-typecheckable). It deliberately does **not** run `events`/`ipc`/`devices`/`transcode`/`notes`, because those import `@prismgb/core` and `tsc --noEmit` would otherwise resolve `@prismgb/core` through the workspace `package.json` `types: ./dist/index.d.ts` — and `dist/` is **gitignored** (`.gitignore:6` = `dist/`), so on a clean tree there is no `.d.ts`. **Consequence (F11):** to add `typecheck:ui-base` to the chain, the ui-base `tsconfig.json` MUST map `@prismgb/core` to source.
- `vitest.config.js` has **5 projects**: `shared-node`, `renderer-happy-dom`, `main-preload`, `gpu-package`, `core-package`. `core-package` runs `packages/prismgb-core/tests/unit/**`. MEMORY's "test:run does not run packages/*/tests" is **STALE**. The new `ui-base-package` project (happy-dom) is added in Phase 1.1. **Test-path corollary (F9b):** vitest collects ONLY paths matching a project `include`. A package test placed under `tests/unit/lifecycle/**` (repo-root tree) matches **no** project and is silently never collected — every package test MUST live under `packages/prismgb-ui-base/tests/unit/**`.
- Root `lint` = `eslint "src/**/*.{js,ts}" && node scripts/check-layer-boundaries.js` — it lints only the `src/` app tree; **package source is NOT linted by root lint**, and there is no `lint:packages`. Each package owns its `lint` script (core: `eslint src/`). ui-base gets its own `lint` script AND a root `lint:ui-base` wrapper that the gates run (F10c) — otherwise package lint never runs in any gate.
- There is NO external reactivity dependency. The signal/effect/computed/batch engine is hand-rolled in `packages/prismgb-ui-base/src/reactive/signal.ts` (Phase 1.2) and locked by a dedicated correctness suite (Phase 1.3). `@prismgb/ui-base` deps on `@prismgb/core` only.

**F9 — `effect()` semantics** (the HAND-ROLLED primitive, Phase 1.2): `effect(fn)` runs `fn` synchronously once on creation (eager), re-runs synchronously on any read dependency's `.value` write (unless inside `batch()`, which defers each subscriber to a single flush at batch exit), and returns a `dispose` function that detaches it from all dependencies. No async flush. This synchronous behavior is what makes happy-dom binding tests deterministic; Phase 1.3 locks it AND the full correctness suite (diamonds, dynamic-dep cleanup, batch coalescing, dispose-mid-propagation) before anything builds on it. `computed(fn)` is an eager derived `ReadonlySignal` that recomputes + pushes when an input changes and is itself a tracked dependency — used in Phase 5 for the gated body-class composites. NOTE: effects may re-run more than minimally on diamond graphs; bindings are idempotent so this is a no-op (see the 1.2 semantics contract).

**F10 — `UIController` construction & `eventBus` wiring path** (verified `app-bootstrap.ts` + `ui.controller.ts` + `ui-component.catalog.ts`):
- `UIController` is **NOT** DI-registered as a class. It is hand-constructed in `RendererBootstrap._initializeUI()` (`app-bootstrap.ts:129-134`) with exactly `{ uiComponentRegistry, uiEffects, bodyClassManager, loggerFactory }`, then attached as a value via `container.registerValue('uiController', ...)` (`app-bootstrap.ts:144`). **Any instruction to "wire `eventBus` into `UIController` via `service-registrations.ts`" is WRONG** — that file registers other services, not `UIController`. The correct path (F10a–c):
  - **(F10a)** Add `eventBus` to `UIControllerDependencies` (`ui.controller.ts:76-81`) and to the constructor destructure/assignment (`ui.controller.ts:91-99`), storing it on the controller.
  - **(F10b)** In `app-bootstrap.ts:121-134` resolve `eventBus` from the container (`container.resolve<EventBusLike>('eventBus')` — the `eventBus` token already exists and is resolvable; it is consumed by other components) and pass it into `new UIController({ ..., eventBus })`.
  - **(F10c)** `UIController.initializeComponents()` (`ui.controller.ts:107-116`) calls `this.registry.initialize(coreElements, { bodyClassManager: this.bodyClassManager })` — the second arg is the **shared core-component dependency object**. Thread `eventBus` into it: `{ bodyClassManager: this.bodyClassManager, eventBus: this.eventBus }`. (Core components already have heterogeneous deps — `streamControlsComponent` declares `{ bodyClassManager }` — so the registry already merges per-component deps; check `component.registry.ts`'s `initialize` signature when you widen the core-deps type.)
- The catalog's `requireDependency(componentId, dependencies, key)` helper (`ui-component.catalog.ts:133-143`) throws `"<id>: missing UI component dependency \"<key>\""` if the dep is absent. So if F10a–c is skipped, the Phase-1.4 `statusNotificationComponent` `create` that calls `requireDependency('statusNotificationComponent', dependencies, 'eventBus')` will **throw at boot** (caught by `dev:smoke`, but the misleading "wire it in service-registrations" instruction would send the executor to the wrong file). Follow F10a–c exactly.

**F11 — `template-ref.utils.ts` generic/domain split** (verified file contents):
- **Generic engine (→ `@prismgb/ui-base`):** `TEMPLATE_REF_ATTRIBUTE`, `TEMPLATE_ACTION_ATTRIBUTE`, `escapeAttributeSelectorValue` (private helper — move it, keep private), `createTemplateRefSelector`, `createTemplateActionSelector`, `getTemplateAction`, `getTemplateActionTarget`, `bindTemplateRefs`, and the types `TemplateRefList`, `TemplateRefLegacyIdMap`, `TemplateRefBindingOptions`. (`createTemplateRefSelector`/`findLegacyId`/`bindTemplateRefs` depend on the private `escapeAttributeSelectorValue` — move it with them.)
- **Domain block (STAYS in presentation):** `UIActionIds`, `UIActionId`/`UIActionEvent`/`UIActionControllerCommand`/`UIActionPublishChannel`/`UIActionCommand`/`UIActionCondition` types, `UIActionDescriptor`/`UIActionTargetDescriptor` interfaces, `UIActionEvents`, `UIActionDescriptors`, `UIActionTargets`, `isUIActionId` — these import `EventChannels` from `@prismgb/events` and `TemplateActionTargets` from `template-dom.contract.js`. Keep them in a presentation file (e.g. leave them in `template-ref.utils.ts` re-importing the generic engine from `@prismgb/ui-base`, or split into `ui-action.descriptors.ts`).
- **Consumer to update:** `ui-setup.orchestrator.ts:1-12` imports BOTH generic (`createTemplateRefSelector`, `getTemplateAction`, `getTemplateActionTarget`) AND domain (`UIActionDescriptors`, `UIActionEvents`, `UIActionTargets`, `isUIActionId`, `UIActionControllerCommand`) symbols from `template-ref.utils.ts`. After the split it imports generic from `@prismgb/ui-base` and domain from the presentation file. `git grep -n "template-ref" -- src` to find all consumers before the sweep.

**F12 — Presentation-mode body classes are GATED COMPOSITES with side-effects** (verified `settings-presentation-mode.service.ts` + `ui.controller.ts` + `body-class.class.ts`). These are **NOT** pure single-signal state→DOM toggles. `PresentationModeService` holds private inputs `_cinematicEnabled`, `_minimalistEnabled`, `_isFullscreenActive`, `_isStreamingActive` and computes:
- `cinematic-active` body class = `_cinematicEnabled && streamingActive` (`_updateCinematicVisual`, line 82) → `uiController.updateCinematicMode` → `effects.setCinematicMode` → `bodyClassManager.setCinematicMode`.
- `minimalist-fullscreen` body class = `_minimalistEnabled && _isFullscreenActive && _isStreamingActive` (`_updateMinimalistVisual`, line 87) → `uiController.updateMinimalistFullscreen` → `effects.setMinimalistFullscreen` → `bodyClassManager.setMinimalistFullscreen`, which ALSO runs a **transition-timing side-effect** (`_setMinimalistTransitionActive`: adds `MINIMALIST_TRANSITION` then `replaceTimeout`-removes it after `TIMING.MINIMALIST_TRANSITION_MS`; `body-class.class.ts:38-57`).
- `streaming-mode` body class = pushed by `uiController.setStreamingMode(enabled)` (`ui.controller.ts:163-173`), which ALSO enables/disables cursor + toolbar auto-hide and hides the shader selector — i.e. it is **mode coordination coupled to activity effects**, called by `PresentationModeService.handleStreamingMode` (`settings-presentation-mode.service.ts:52`).
- `fullscreen-active` body class = `uiController.updateFullscreenMode(active)` → `effects.setFullscreenMode` → `bodyClassManager.setFullscreenMode` — a **clean single-input pass-through** of fullscreen state (the only clean toggle).
- Activity classes `app-idle`/`app-hidden`/`app-animations-off` (`body-class.class.ts:14-24`) are driven by the auto-hide effects — stay imperative.

Implication (drives Phase 5): a naive `bindClass(document.body, CINEMATIC_ACTIVE, cinematicModeSignal)` would **silently drop the `&& streaming` gate**; a naive minimalist binding would drop both the 3-input gate and the transition timing. Phase 5 must use `computed` composites that reproduce the predicates exactly, an `effect()` for minimalist that preserves the transition, and must **retain** the imperative `streaming-mode`/auto-hide coordination.

---

## 4. Phased Implementation

Each numbered sub-step is its own commit with its own gate. Commit messages: conventional, scope in {`ui-base`,`presentation`,`build`,`state`}, subject ≤100 chars, NO AI/tool attribution. Never `--no-verify` (husky runs full `test:run` on commit).

### Phase 1 — Prove the pattern end-to-end (foundation + one component)

This phase proves Risk A (the binding mechanism) with a self-contained local store; it deliberately does NOT touch `AppState` (that cross-layer path is Risk B, proved in Phase 1.5).

#### 1.1 — Scaffold the package (mirror `@prismgb/core`/`@prismgb/events`)

Create files:

**`packages/prismgb-ui-base/package.json`**
```json
{
  "name": "@prismgb/ui-base",
  "version": "0.1.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": { "import": "./dist/index.js", "types": "./dist/index.d.ts" },
    "./reactive": { "import": "./dist/reactive/index.js", "types": "./dist/reactive/index.d.ts" }
  },
  "files": ["dist"],
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build && tsc --emitDeclarationOnly",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:run": "vitest run",
    "lint": "eslint src/"
  },
  "dependencies": {
    "@prismgb/core": "*"
  },
  "devDependencies": {
    "typescript": "^5.9.3",
    "vite": "^7.3.3",
    "vitest": "^4.0.0",
    "happy-dom": "^20.9.0"
  }
}
```
> The reactive primitive is hand-rolled (Phase 1.2) — there is NO external reactivity dependency to install or pin. `@prismgb/ui-base` deps on `@prismgb/core` only.

**`packages/prismgb-ui-base/tsconfig.json`** — start from `packages/prismgb-events/tsconfig.json` (no decorators in ui-base, so the events tsconfig — which omits `experimentalDecorators` — is the correct template, NOT core's). It sets `strict`, `rootDir: src`, `outDir: dist`, `types: ["vite/client"]`, and `paths: { "@/*": ["./src/*"] }`. **You MUST extend its `paths` to map `@prismgb/core` to source (F8/F11 — `dist/` is gitignored, so standalone `tsc --noEmit` cannot resolve the workspace package on a clean tree):**
```json
"paths": {
  "@/*": ["./src/*"],
  "@prismgb/core": ["../../packages/prismgb-core/src/index.ts"],
  "@prismgb/core/*": ["../../packages/prismgb-core/src/*"]
}
```
> This mirrors the app's `@prismgb/*→src` aliasing model (L6) for typecheck-only resolution; `tsc --noEmit` permits path targets outside `rootDir`. If any ui-base **source** file later imports another workspace package (`@prismgb/events`, etc.), add that package's `src` path mapping too, same pattern — otherwise `typecheck:ui-base` breaks on a clean CI tree. (The package's `build` script — `tsc --emitDeclarationOnly` — is out of scope per L6 and would consume built core types under the dist/turbo model; the gates here run only `tsc --noEmit`.)

**`packages/prismgb-ui-base/vite.config.ts`** — copy `packages/prismgb-core/vite.config.ts`, change `lib.name` to `'PrismGBUiBase'`, and add the second entry so the `./reactive` subpath builds:
```ts
import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        'reactive/index': resolve(__dirname, 'src/reactive/index.ts')
      },
      name: 'PrismGBUiBase',
      formats: ['es']
    },
    rollupOptions: {
      external: ['@prismgb/core'],
      output: { preserveModules: false }
    },
    sourcemap: true,
    minify: false
  },
  resolve: { alias: { '@': resolve(__dirname, 'src') } }
});
```

**`packages/prismgb-ui-base/vitest.config.ts`** — mirror `packages/prismgb-core/vitest.config.ts` but set `test.environment: 'happy-dom'` (bindings touch the DOM). (This config governs the package's own `npm test`; the root suite collects ui-base tests via the `ui-base-package` project below.)

**`packages/prismgb-ui-base/src/vite-env.d.ts`** — copy `packages/prismgb-core/src/vite-env.d.ts`.

**`packages/prismgb-ui-base/src/index.ts`** (barrel; grows over phases)
```ts
export * from './reactive/index.js';
```

Wire the package per the **dist-consumption build model that Plan 02 established** (RE-VERIFY against the current repo before acting — Plan 02 may have changed the surfaces): the app's vite build/dev now consumes every `@prismgb/*` from its built `dist` (the vite `@prismgb/*` src-aliases were RETIRED), and `predev`/`prebuild:vite` run `turbo run build` to rebuild all package dists first. `@prismgb/ui-base` is just another dist-built package, so:

- **NO vite alias for ui-base.** Do NOT re-add `@prismgb/*` aliases to `vite.config.js` (that would reintroduce the retired shim for one package). The app resolves `@prismgb/ui-base` and `@prismgb/ui-base/reactive` from `dist` via the workspace `node_modules` symlink — IF the package builds to dist with correct `exports` (below).
- **src-aliases ONLY on the fast test/typecheck paths** (vitest `sharedAlias` + both tsconfigs), placed adjacent to the other `@prismgb/*` entries, `/reactive` BEFORE the bare entry (longest-prefix-first):
  - vitest `sharedAlias` (the SAME object the `ui-base-package` project references):
    ```js
    '@prismgb/ui-base/reactive': path.resolve(__dirname, 'packages/prismgb-ui-base/src/reactive/index.ts'),
    '@prismgb/ui-base': path.resolve(__dirname, 'packages/prismgb-ui-base/src/index.ts'),
    ```
  - `tsconfig.app.json` and `tsconfig.base.json` `paths`:
    ```json
    "@prismgb/ui-base": ["./packages/prismgb-ui-base/src"],
    "@prismgb/ui-base/reactive": ["./packages/prismgb-ui-base/src/reactive/index"],
    "@prismgb/ui-base/*": ["./packages/prismgb-ui-base/src/*"]
    ```
- **Dist build + exports (the app's runtime/build path):** the package's `vite.config.ts` MUST emit both entries (`index` + `reactive/index`) to `dist` (already specified in the scaffold above), and its `package.json` MUST declare the `exports` map with BOTH the `.` and `./reactive` subpaths pointing at `dist` (mirror how `@prismgb/devices` exposes `./service`), plus `main`/`types`. `turbo run build` auto-includes any workspace package with a `build` script, so the `predev`/`prebuild:vite` hooks will rebuild ui-base's dist before the app vite build — verify with a cold `rm -rf packages/prismgb-ui-base/dist && npm run dev:smoke` once a consumer imports it (Phase 1.4). Add `@prismgb/ui-base` to `scripts/check-package-exports.js`'s package list (it enumerates packages; the new `./reactive` target must be asserted on disk).

Add the root scripts (`package.json`):
- `"typecheck:ui-base": "npm run typecheck --workspace=@prismgb/ui-base"` and extend the `typecheck` script to `... && npm run typecheck:gpu && npm run typecheck:core && npm run typecheck:ui-base`.
- `"lint:ui-base": "npm run lint --workspace=@prismgb/ui-base"` (F8/F10c — root `lint` does NOT lint package source; the gates run `lint:ui-base` separately). Verify the package's `eslint src/` resolves the repo's ESLint config (flat config searches cwd upward and will find the root config); if it does not pick up the root rules, add a thin `packages/prismgb-ui-base/eslint.config.js` re-exporting the root config rather than letting the package lint with default rules.

Add the `ui-base-package` vitest project to `vitest.config.js` `projects: [...]` (after `core-package`). It **must** use `sharedAlias` (NOT an isolated `{ '@': ... }` block like `gpu-package` — the ui-base tests resolve `@prismgb/core`/`@prismgb/ui-base` through `sharedAlias`, which now carries both):
```js
{
  test: {
    alias: sharedAlias,
    name: 'ui-base-package',
    globals: true,
    environment: 'happy-dom',
    include: ['packages/prismgb-ui-base/tests/unit/**/*.{test,spec}.ts']
  }
}
```

No external dependency to install — the reactive primitive is hand-rolled (1.2). After adding the package + alias surfaces, run `npm install` only to register the new workspace package in the root lockfile/node_modules symlink:
```bash
npm install                  # registers the @prismgb/ui-base workspace; no external dep hoisted
ls -la node_modules/@prismgb/ui-base && echo LINKED
```

**Gate (1.1):** `npm run typecheck && npm run typecheck:ui-base && npm run lint && npm run lint:ui-base`. (Phase 1.1 and 1.2 are committed together — 1.1's `index.ts` imports `./reactive/index.js`, which 1.2 creates. Author both before running the gate.)

**Commit:** `build(ui-base): scaffold @prismgb/ui-base package with reactive subpath + aliases`

#### 1.2 — Reactive seam (hand-rolled signal primitive — OWNER DECISION)

The reactive primitive is **HAND-ROLLED, zero-dependency** (owner chose in-house over `@preact/signals-core` for primitives-over-frameworks purity). It lives ONLY in `reactive/signal.ts`; every other file imports it via the relative `./signal.js`, so the engine stays swappable behind that one file.

**Semantics contract (these are what the Phase-1.3 correctness suite locks):**
- **Push-based, synchronous-by-default.** `signal.value` getter auto-tracks the currently-running effect as a subscriber; the setter, on a `!Object.is` change, synchronously re-runs every active subscribing effect.
- **Effects always read CURRENT values** (never stale). An effect re-runs more often than strictly minimal on diamond graphs (A←B,C←D may run A twice on one D-change) — this is acceptable because **every DOM binding is idempotent** (writing the same value twice is a no-op); `batch()` coalesces multiple synchronous writes into a single flush per effect to eliminate the redundancy where it matters. Correctness = never-stale + always-torn-down; minimal-fire is NOT a correctness requirement.
- **Dynamic dependency cleanup:** an effect clears and re-collects its dependency set on every run, so deps that are no longer read are unsubscribed (no leak, no over-fire from stale subs).
- **`dispose()`** marks the effect inactive and detaches it from every dependency set it subscribed to.
- **`computed(fn)`** is an eager derived signal (recomputes + pushes when an input changes); it reads as a normal tracked `ReadonlySignal`.

**`packages/prismgb-ui-base/src/reactive/signal.ts`** — implement EXACTLY this (transcribe; do not "improve" without re-running the 1.3 suite):
```ts
type EffectRunner = {
  run(): void;
  deps: Set<Set<EffectRunner>>;
  active: boolean;
};

let activeEffect: EffectRunner | null = null;
let batchDepth = 0;
const pendingEffects = new Set<EffectRunner>();

function track(subscribers: Set<EffectRunner>): void {
  if (activeEffect) {
    subscribers.add(activeEffect);
    activeEffect.deps.add(subscribers);
  }
}

function trigger(subscribers: Set<EffectRunner>): void {
  for (const runner of [...subscribers]) {
    if (!runner.active) continue;
    if (batchDepth > 0) pendingEffects.add(runner);
    else runner.run();
  }
}

function detach(runner: EffectRunner): void {
  for (const dep of runner.deps) dep.delete(runner);
  runner.deps.clear();
}

export interface ReadonlySignal<T> {
  readonly value: T;
  peek(): T;
}

export interface Signal<T> extends ReadonlySignal<T> {
  value: T;
}

export function signal<T>(initial: T): Signal<T> {
  let current = initial;
  const subscribers = new Set<EffectRunner>();
  return {
    get value(): T {
      track(subscribers);
      return current;
    },
    set value(next: T) {
      if (Object.is(current, next)) return;
      current = next;
      trigger(subscribers);
    },
    peek(): T {
      return current;
    }
  };
}

export function effect(fn: () => void): () => void {
  const runner: EffectRunner = {
    deps: new Set(),
    active: true,
    run(): void {
      if (!runner.active) return;
      detach(runner);
      const previous = activeEffect;
      activeEffect = runner;
      try {
        fn();
      } finally {
        activeEffect = previous;
      }
    }
  };
  runner.run();
  return () => {
    if (!runner.active) return;
    runner.active = false;
    detach(runner);
  };
}

export function computed<T>(fn: () => T): ReadonlySignal<T> {
  const derived = signal<T>(undefined as T);
  effect(() => {
    derived.value = fn();
  });
  return {
    get value(): T {
      return derived.value;
    },
    peek(): T {
      return derived.peek();
    }
  };
}

export function batch(fn: () => void): void {
  batchDepth += 1;
  try {
    fn();
  } finally {
    batchDepth -= 1;
    if (batchDepth === 0) {
      const queued = [...pendingEffects];
      pendingEffects.clear();
      for (const runner of queued) {
        if (runner.active) runner.run();
      }
    }
  }
}

export function untracked<T>(fn: () => T): T {
  const previous = activeEffect;
  activeEffect = null;
  try {
    return fn();
  } finally {
    activeEffect = previous;
  }
}
```

**`packages/prismgb-ui-base/src/reactive/index.ts`** (public surface for the `./reactive` subpath — application/presentation/services import this):
```ts
export { signal, computed, effect, batch, untracked } from './signal.js';
export type { Signal, ReadonlySignal } from './signal.js';
```

Every other ui-base file imports reactivity via the **relative** `./signal.js` (or `../reactive/signal.js`), never the `@prismgb/ui-base/reactive` alias (no self-aliasing inside the package), and there is NO external reactivity dependency anywhere.

**Gate (1.2, folded into 1.1's commit):** `npm run typecheck:ui-base`.

#### 1.2b — Lock the hand-rolled primitive (correctness suite — DO THIS BEFORE ANY CONSUMER)

The hand-rolled engine is the single highest-risk artifact in this plan. Lock it with a dedicated correctness suite that targets the cases self-authored signal code gets wrong. This MUST pass before the binding helpers (1.3) build on it.

**`packages/prismgb-ui-base/tests/unit/reactive/signal.test.ts`:**
```ts
import { describe, it, expect, vi } from 'vitest';
import { signal, computed, effect, batch, untracked } from '../../../src/reactive/signal.js';

describe('signal primitive', () => {
  it('runs effects eagerly and re-runs synchronously on each change', () => {
    const count = signal(0);
    const seen: number[] = [];
    const dispose = effect(() => seen.push(count.value));
    expect(seen).toEqual([0]);
    count.value = 1;
    count.value = 2;
    expect(seen).toEqual([0, 1, 2]);
    dispose();
  });

  it('skips no-op (Object.is) writes', () => {
    const s = signal(1);
    const fn = vi.fn(() => s.value);
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('peek() and untracked() read without subscribing', () => {
    const s = signal(0);
    const fn = vi.fn(() => { s.peek(); untracked(() => s.value); });
    effect(fn);
    s.value = 5;
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('computed derives and recomputes when an input changes', () => {
    const a = signal(2);
    const b = signal(3);
    const sum = computed(() => a.value + b.value);
    expect(sum.value).toBe(5);
    a.value = 10;
    expect(sum.value).toBe(13);
  });

  it('diamond: a single source change yields the correct derived value', () => {
    const d = signal(1);
    const b = computed(() => d.value + 1);
    const c = computed(() => d.value * 2);
    const a = computed(() => b.value + c.value);
    expect(a.value).toBe(4);
    d.value = 5;
    expect(a.value).toBe(16);
  });

  it('cleans up stale dependencies (dynamic deps)', () => {
    const useX = signal(true);
    const x = signal('x');
    const y = signal('y');
    const fn = vi.fn(() => (useX.value ? x.value : y.value));
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    useX.value = false;
    expect(fn).toHaveBeenCalledTimes(2);
    x.value = 'x2';
    expect(fn).toHaveBeenCalledTimes(2);
    y.value = 'y2';
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('batch() coalesces multiple writes into one flush per effect', () => {
    const a = signal(0);
    const b = signal(0);
    const fn = vi.fn(() => a.value + b.value);
    effect(fn);
    expect(fn).toHaveBeenCalledTimes(1);
    batch(() => { a.value = 1; b.value = 2; });
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('dispose() stops re-runs and detaches the effect', () => {
    const s = signal(0);
    const fn = vi.fn(() => s.value);
    const dispose = effect(fn);
    s.value = 1;
    expect(fn).toHaveBeenCalledTimes(2);
    dispose();
    s.value = 2;
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('does not infinitely cascade when an effect writes a different signal', () => {
    const src = signal(0);
    const out = signal(0);
    effect(() => { out.value = src.value * 2; });
    src.value = 4;
    expect(out.value).toBe(8);
  });
});
```

**Gate (1.2b):** `npm run typecheck:ui-base && npm run test:run`. ALL nine cases must pass before Phase 1.3. If `diamond` or `dynamic deps` fails, the engine is wrong — fix `reactive/signal.ts` against the failing case (do not weaken the test). **Commit:** `feat(ui-base): hand-rolled reactive signal primitive + correctness suite`.

#### 1.3 — DOM binding helpers + tests (lock `effect()` semantics)

**`packages/prismgb-ui-base/src/reactive/dom-bindings.ts`**
```ts
import { effect } from './signal.js';
import type { ReadonlySignal } from './signal.js';
import type { DisposableFunction } from '@prismgb/core';

interface TextSink { textContent: string | null; }
interface ClassListSink { classList: { toggle(token: string, force?: boolean): boolean | void }; }
interface AttrSink { setAttribute(name: string, value: string): void; removeAttribute(name: string): void; }

const NOOP: DisposableFunction = () => {};

/** Bind a signal to an element's textContent. Returns the effect disposer. */
export function bindText(
  element: TextSink | null,
  source: ReadonlySignal<unknown>,
  format: (value: unknown) => string = (value) => (value == null ? '' : String(value))
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => { element.textContent = format(source.value); });
}

/** Toggle a single class token from a boolean signal. */
export function bindClass(
  element: ClassListSink | null,
  token: string,
  source: ReadonlySignal<boolean>
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => { element.classList.toggle(token, source.value); });
}

/** Toggle a "hidden" class inversely to a visibility signal. */
export function bindVisible(
  element: ClassListSink | null,
  source: ReadonlySignal<boolean>,
  hiddenToken = 'hidden'
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => { element.classList.toggle(hiddenToken, !source.value); });
}

/** Set/remove an attribute from a nullable string signal. */
export function bindAttr(
  element: AttrSink | null,
  name: string,
  source: ReadonlySignal<string | null | undefined>
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => {
    const value = source.value;
    if (value == null) element.removeAttribute(name);
    else element.setAttribute(name, value);
  });
}

/** Assign a DOM property (e.g. dataset.type, disabled) from a signal. */
export function bindProperty<TElement extends object, TKey extends keyof TElement>(
  element: TElement | null,
  key: TKey,
  source: ReadonlySignal<TElement[TKey]>
): DisposableFunction {
  if (!element) return NOOP;
  return effect(() => { element[key] = source.value; });
}
```

**`packages/prismgb-ui-base/src/reactive/signal-binder.ts`** — ergonomic facade that auto-registers disposers on any tracker (`PresentationComponent.track`, `DisposableBag.add`):
```ts
import type { DisposableFunction } from '@prismgb/core';
import type { ReadonlySignal } from './signal.js';
import { bindText, bindClass, bindVisible, bindAttr, bindProperty } from './dom-bindings.js';

type Tracker = (disposer: DisposableFunction) => unknown;

/** Fluent binder that registers every binding's teardown on a tracker (DisposableBag/component). */
export class SignalBinder {
  constructor(private readonly track: Tracker) {}

  text(element: Parameters<typeof bindText>[0], source: ReadonlySignal<unknown>, format?: Parameters<typeof bindText>[2]): this {
    this.track(bindText(element, source, format)); return this;
  }
  class(element: Parameters<typeof bindClass>[0], token: string, source: ReadonlySignal<boolean>): this {
    this.track(bindClass(element, token, source)); return this;
  }
  visible(element: Parameters<typeof bindVisible>[0], source: ReadonlySignal<boolean>, hiddenToken?: string): this {
    this.track(bindVisible(element, source, hiddenToken)); return this;
  }
  attr(element: Parameters<typeof bindAttr>[0], name: string, source: ReadonlySignal<string | null | undefined>): this {
    this.track(bindAttr(element, name, source)); return this;
  }
  property<TElement extends object, TKey extends keyof TElement>(element: TElement | null, key: TKey, source: ReadonlySignal<TElement[TKey]>): this {
    this.track(bindProperty(element, key, source)); return this;
  }
}
```

Update **`packages/prismgb-ui-base/src/reactive/index.ts`** to also export the bindings + binder:
```ts
export { signal, computed, effect, batch, untracked } from './signal.js';
export type { Signal, ReadonlySignal } from './signal.js';
export { bindText, bindClass, bindVisible, bindAttr, bindProperty } from './dom-bindings.js';
export { SignalBinder } from './signal-binder.js';
```

> If the build-model plan later splits Node-only from DOM-only consumers strictly, `dom-bindings`/`signal-binder` can move to the bare `@prismgb/ui-base` entry and leave `./reactive` as pure signal. For now both ship from `./reactive` for one-import ergonomics; no current Node consumer references the bind* names.

**`packages/prismgb-ui-base/tests/unit/reactive/dom-bindings.test.ts`** — lock F9 semantics. Use real happy-dom elements:
```ts
import { describe, it, expect } from 'vitest';
import { signal } from '../../../src/reactive/signal.js';
import { bindText, bindClass, bindVisible, bindAttr } from '../../../src/reactive/dom-bindings.js';

describe('dom-bindings', () => {
  it('bindText updates textContent synchronously on signal write', () => {
    const el = document.createElement('span');
    const s = signal('a');
    const dispose = bindText(el, s);
    expect(el.textContent).toBe('a');     // eager run
    s.value = 'b';
    expect(el.textContent).toBe('b');     // synchronous, no flush
    dispose();
    s.value = 'c';
    expect(el.textContent).toBe('b');     // torn down
  });

  it('bindClass / bindVisible toggle correctly', () => {
    const el = document.createElement('div');
    const on = signal(false);
    bindClass(el, 'active', on);
    expect(el.classList.contains('active')).toBe(false);
    on.value = true;
    expect(el.classList.contains('active')).toBe(true);

    const visible = signal(true);
    bindVisible(el, visible, 'hidden');
    expect(el.classList.contains('hidden')).toBe(false);
    visible.value = false;
    expect(el.classList.contains('hidden')).toBe(true);
  });

  it('bindAttr sets and removes', () => {
    const el = document.createElement('div');
    const v = signal<string | null>('x');
    bindAttr(el, 'data-k', v);
    expect(el.getAttribute('data-k')).toBe('x');
    v.value = null;
    expect(el.hasAttribute('data-k')).toBe(false);
  });

  it('null element is a no-op', () => {
    const dispose = bindText(null, signal('a'));
    expect(typeof dispose).toBe('function');
    dispose();
  });
});
```

**Gate (1.3):** `npm run typecheck && npm run typecheck:ui-base && npm run test:run && npm run lint && npm run lint:ui-base`. (`test:run` now includes the `ui-base-package` project, which collects `packages/prismgb-ui-base/tests/unit/**`.)

**Commit:** `feat(ui-base): add signal-backed DOM binding helpers + SignalBinder with tests`

#### 1.4 — Convert the proof component: `status-notification`

Chosen because it is the smallest, most isolated state-bearing component (single `textContent` + `dataset.type` write; `StatusNotificationComponent` is ~31 LOC, test ~75 LOC). Its data source is the `UI.STATUS_MESSAGE` bus channel. **Publisher scope (corrected):** `UI.STATUS_MESSAGE` has **many** publishers, not two — at least `app.orchestrator`, `capture.orchestrator`, `streaming.orchestrator`, `capture-save.service`, `settings-fullscreen.service`, `update-ui.service`, `update-section.component`, and `capture-ui.bridge` (`git grep -n "STATUS_MESSAGE" -- src`). This is *favorable* to the store approach: the store subscribes to the single channel and handles every publisher uniformly; it changes nothing about the conversion, but validation must confirm messages from these varied sources still render (covered by the e2e specs in the gate, which exercise capture/streaming/settings/update toasts). **Documented alternative if this proves intractable:** `device-status` (its test asserts `classList.add` spies and its source is a deeper bridge chain — strictly harder; do not switch without cause).

Steps:

1. Create the presentation-local signal store (event→state writer; bus untouched per L8):
   **`src/renderer/presentation/state/status-notification.store.ts`** (new `state/` dir under presentation)
   ```ts
   import { signal, type ReadonlySignal } from '@prismgb/ui-base/reactive';
   import { EventChannels } from '@prismgb/events';
   import type { EventBusLike, DisposableFunction } from '@prismgb/core';

   const VALID_TYPES = ['info', 'success', 'warning', 'error'] as const;
   export type StatusNotificationType = (typeof VALID_TYPES)[number];

   export interface StatusNotificationStoreDependencies {
     eventBus: EventBusLike;
   }

   /** Owns status-message reactive state; subscribes the bus → signal (event→state). */
   export class StatusNotificationStore {
     private readonly _message = signal('');
     private readonly _type = signal<StatusNotificationType>('info');
     private _unsubscribe: DisposableFunction = () => {};

     constructor(private readonly dependencies: StatusNotificationStoreDependencies) {
       this._unsubscribe = this.dependencies.eventBus.subscribe(
         EventChannels.UI.STATUS_MESSAGE,
         (...args: unknown[]) => this.apply(args[0])
       );
     }

     get message(): ReadonlySignal<string> { return this._message; }
     get type(): ReadonlySignal<StatusNotificationType> { return this._type; }

     private apply(payload: unknown): void {
       const data = typeof payload === 'object' && payload !== null ? payload as { message?: unknown; type?: unknown } : {};
       this._message.value = typeof data.message === 'string' ? data.message : '';
       this._type.value = VALID_TYPES.includes(data.type as StatusNotificationType) ? (data.type as StatusNotificationType) : 'info';
     }

     dispose(): void { this._unsubscribe(); this._unsubscribe = () => {}; }
   }
   ```

2. Convert the component to bind the store's signals (replace `show()` with bindings):
   **`src/renderer/presentation/shared/status-notification.component.ts`** — extends the (still presentation-local in Phase 1) `PresentationComponent`; constructor takes `{ elements, store }`; binds in constructor; deletes `show()` and `validTypes`; adds `this.track(store)` so the store's bus subscription is torn down on component disposal:
   ```ts
   import { PresentationComponent } from '@renderer/presentation/primitives/presentation-component.base';
   import { bindText, bindProperty } from '@prismgb/ui-base/reactive';
   import type { StatusNotificationStore } from '@renderer/presentation/state/status-notification.store.js';

   interface StatusMessageElementLike { textContent: string | null; dataset: Record<string, string | undefined>; }
   export interface StatusNotificationElements { statusMessage?: StatusMessageElementLike | null; }

   export interface StatusNotificationComponentOptions {
     elements: StatusNotificationElements;
     store: StatusNotificationStore;
   }

   class StatusNotificationComponent extends PresentationComponent {
     constructor({ elements, store }: StatusNotificationComponentOptions) {
       super();
       this.track(store);   // DisposableBag accepts an object with dispose(); releases the bus subscription
       const el = elements.statusMessage ?? null;
       this.track(bindText(el, store.message));
       this.track(bindProperty(el?.dataset ?? null, 'type', store.type));
     }
   }
   export { StatusNotificationComponent };
   ```
   > `bindProperty(el.dataset, 'type', store.type)` writes `dataset.type` — equivalent to the old `dataset.type = validType`. Validation moved into the store (single source of truth for the event→state mapping).

3. Wire `eventBus` to the component via the **F10** path (NOT `service-registrations.ts`):
   - In `ui-component.catalog.ts`: change `statusNotificationComponent`'s catalog contract dependency from `NoComponentDependencies` to `{ eventBus: EventBusLike }` (mirror how `shaderSelectorComponent` declares `eventBus`; import `EventBusLike` from `@prismgb/core`).
   - Change its `create` (currently `({ elements = {} }) => new StatusNotificationComponent(elements)`) to construct the store and pass both: `create: ({ elements = {}, dependencies = {} }) => new StatusNotificationComponent({ elements, store: new StatusNotificationStore({ eventBus: requireDependency('statusNotificationComponent', dependencies, 'eventBus') }) })`.
   - **F10a:** add `eventBus?: EventBusLike | null` to `UIControllerDependencies`; store it on the controller in the constructor.
   - **F10b:** in `app-bootstrap.ts:121-134` `_initializeUI`, resolve `const eventBus = container.resolve<EventBusLike>('eventBus')` and pass `eventBus` into `new UIController({ uiComponentRegistry, uiEffects, bodyClassManager, loggerFactory, eventBus })`.
   - **F10c:** in `UIController.initializeComponents()` thread it into the shared core-deps object: `this.registry.initialize(createTemplateCoreComponentRegistryElements(this.dom), { bodyClassManager: this.bodyClassManager, eventBus: this.eventBus })`. Widen the core-deps type in `component.registry.ts`/the catalog as needed so the `eventBus` key typechecks for `statusNotificationComponent`.
   - Re-verify `ui.controller.ts:76-116` and `app-bootstrap.ts:121-145` before editing; confirm the `eventBus` token resolves (it is already consumed by other components).

4. Delete the glue slice (discipline per §5 checklist — grep first):
   - `git grep -n "updateStatusMessage" -- src tests` → callers: `UIEventBridge._handleStatusMessage` (`ui-event.bridge.ts:88-95`, descriptor at `:51`), `UIEventBridge._handleCinematicMode` (a **second, independent** direct call at `ui-event.bridge.ts:199`), `UIController.updateStatusMessage` (`ui.controller.ts:142-144` → `statusNotificationComponent.show(...)`), the `updateStatusMessage` member of the `UiControllerLike` interface (`ui-event.bridge.ts:10`), plus tests/mocks.
   - Redirect `_handleCinematicMode`'s status toast (line 199): replace `this.uiController.updateStatusMessage(\`Cinematic mode ${enabled ? 'enabled' : 'disabled'}\`)` with `this.eventBus.publish(EventChannels.UI.STATUS_MESSAGE, { message: \`Cinematic mode ${enabled ? 'enabled' : 'disabled'}\` })` (the bridge already holds `this.eventBus: TypedEventBusLike`; the store now receives it). Leave the `presentationModeService.handleCinematicModeChanged(enabled)` call on line 198 untouched.
   - Delete `UIEventBridge._handleStatusMessage` and its descriptor entry (`[EventChannels.UI.STATUS_MESSAGE, ...]` at `:51`) — the bus message is now consumed by the store, not the bridge.
   - Delete `UIController.updateStatusMessage` and the `updateStatusMessage(message, type?)` member from the `UiControllerLike` interface (`ui-event.bridge.ts:10`). Delete the component's `show()` method (now unused).
   - Update affected tests/mocks: `git grep -ln "updateStatusMessage\|StatusNotificationComponent\|\.show(" -- tests` and adapt (the `UiControllerLike` mocks in the bridge test drop the `updateStatusMessage` member).

5. Rewrite the component test to the binding world (real DOM + store):
   **`tests/unit/renderer/presentation/components/status-notification.test.ts`** (this path is under the `renderer-happy-dom` project's `tests/unit/renderer/**` include — verify it collects):
   ```ts
   import { describe, it, expect, beforeEach } from 'vitest';
   import { StatusNotificationComponent } from '@renderer/presentation/shared/status-notification.component.js';
   import { StatusNotificationStore } from '@renderer/presentation/state/status-notification.store.js';
   // Re-verify the renderer test's preferred bus factory before finalizing:
   //   git grep -n "new .*EventBus\|SharedEventBus" tests/unit/renderer/presentation/bridges
   import { SharedEventBus } from '@prismgb/events';

   describe('StatusNotificationComponent (signal bindings)', () => {
     let el: HTMLElement; let bus: any; let store: StatusNotificationStore;
     beforeEach(() => {
       el = document.createElement('div');
       bus = new SharedEventBus();
       store = new StatusNotificationStore({ eventBus: bus });
       new StatusNotificationComponent({ elements: { statusMessage: el as any }, store });
     });
     it('renders message + type from a published event', () => {
       bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'Saved', type: 'success' });
       expect(el.textContent).toBe('Saved');
       expect(el.dataset.type).toBe('success');
     });
     it('falls back to info for unknown type', () => {
       bus.publish(EventChannels.UI.STATUS_MESSAGE, { message: 'X', type: 'nope' });
       expect(el.dataset.type).toBe('info');
     });
   });
   ```
   > Re-verify the exact `EventChannels.UI.STATUS_MESSAGE` literal and the renderer test's bus construction pattern (`git grep -n "STATUS_MESSAGE" packages/prismgb-events/src` + an existing bridge test) before finalizing. Import `EventChannels` from `@prismgb/events`.

6. Add a store unit test `tests/unit/renderer/presentation/state/status-notification.store.test.ts` (event→signal mapping for each valid/invalid type + `dispose()` unsubscribes so post-dispose publishes do not mutate the signals).

**Gate (1.4) — full set, incl. coexistence proof:** `npm run typecheck && npm run typecheck:ui-base && npm run test:run && npm run lint && npm run lint:ui-base && npm run dev:smoke && npm run test:e2e`. `dev:smoke` is mandatory here — it is the first time the app imports `@prismgb/ui-base` at runtime (package resolution + the F10 `eventBus` wiring; a missed F10 step throws via `requireDependency`). The e2e specs `streaming-smoke`, `device-streaming`, `settings` exercise status messages from multiple publishers; they prove the 1 converted + 28 imperative components coexist.

**Commit:** `feat(presentation): bind status-notification to a signal store, drop imperative show glue`

> **Phase-1 STOP/checkpoint.** Do not proceed until 1.4's full gate is green. This is the proof gate; the pattern (store→signal→binding→DOM, glue deleted, tests adapted, coexistence at runtime) is now established and reused verbatim below.

### Phase 1.5 — Prove the cross-layer `AppState`-signal path (Risk B)

The local-store proof does not exercise an application-layer signal feeding a presentation binding. De-risk it on the smallest real stored field before the bulk.

1. Convert **one** `AppState` field — `isCinematicModeEnabled` (real stored boolean) — to a signal with dual exposure (keep the value getter; add a signal accessor). **Remove the constructor assignment** `this.isCinematicModeEnabled = true` (`app-state.ts:35`) — with `isCinematicModeEnabled` now a getter, that line becomes a write to a read-only property (TS2540). Use the field initializer instead:
   **`src/renderer/application/state/app-state.ts`**
   ```ts
   import { signal, type ReadonlySignal } from '@prismgb/ui-base/reactive';
   // ...
   private readonly _isCinematicModeEnabled = signal(true);              // replaces the bool field + ctor assignment
   get isCinematicModeEnabled(): boolean { return this._isCinematicModeEnabled.value; }  // value consumers unchanged
   get cinematicModeSignal(): ReadonlySignal<boolean> { return this._isCinematicModeEnabled; }  // binding consumers
   setCinematicMode(enabled: boolean): void { this._isCinematicModeEnabled.value = enabled; }   // replaces `this.isCinematicModeEnabled = enabled`
   ```
   Leave all other fields as-is for now. Confirm `application → @prismgb/ui-base/reactive` produces zero boundary violations (F6).

2. Bind `cinematic-toggle.component` (`features/toolbar/cinematic-toggle.component.ts`, ~89 LOC) pill text/active class to `appState.cinematicModeSignal` via bindings, replacing its imperative writes; keep its existing click→`setCinematicMode` path. The cinematic **toggle button reflects the setting state** (shown regardless of streaming) — this is the clean single-signal case (distinct from the gated `cinematic-active` *body class* in F12/Phase 5, which is `cinematicEnabled && streaming`). Read the component first; it already references `CinematicToggleAppState`.
   - **`CinematicToggleAppState` has two consumers** (`git grep -n "CinematicToggleAppState" -- src`): it is exported from `cinematic-toggle.component.ts:7` AND imported by `shader-selector.component.ts:4` (used at `:33`,`:44`). Extend the interface with `cinematicModeSignal: ReadonlySignal<boolean>` and **check both files** typecheck after the change; if `shader-selector` does not need the new accessor, ensure the widened interface still satisfies its usage (typecheck gate catches a break).

3. Glue discipline: grep `setCinematicMode`/`updateCinematicMode` consumers; `settings-cinematic-mode.service`/`UIEventBridge._handleCinematicMode` set the state, the binding now reflects it. Delete only the imperative DOM-write path on the toggle that the binding replaces; keep the state setters. **Do NOT** touch the gated `cinematic-active` body-class path here — that is Phase 5.

4. Adapt tests:
   - `cinematic-toggle` component test (spy → real-DOM/binding asserts).
   - **`tests/unit/renderer/application/state/app-state.test.ts`** — line ~89 does `state.isCinematicModeEnabled = false` (a direct field write). After step 1 that is a read-only-property error; change it to `state.setCinematicMode(false)`. Grep the file for any other direct writes (`git grep -n "isCinematicModeEnabled =" tests`).
   - The AppState test factory (`tests/factories/app-state.factory.js`, if present) may need a `cinematicModeSignal` accessor on its stub — re-verify and add if a binding consumer reads it under test.

**Gate (1.5):** full set incl. `dev:smoke` + e2e (`fullscreen`, `settings`).

**Commit:** `feat(state): expose AppState.isCinematicModeEnabled as a signal, bind cinematic-toggle`

### Phase 2 — Promote the accessible-widget toolkit into ui-base

Fold the toolkit into the package (anchor + widgets + generic template helpers). Pure relocation + import sweep + CSS-class decoupling; no behavior change. Each move is its own commit.

2.1 **`PresentationComponent` → `packages/prismgb-ui-base/src/lifecycle/presentation-component.base.ts`** (anchor). `git mv` the file, fix its internal import (already `@prismgb/core`), export from `src/index.ts`. Add the **missing** focused unit test at **`packages/prismgb-ui-base/tests/unit/lifecycle/presentation-component.test.ts`** (NOT `tests/unit/lifecycle/...` at the repo root — that path matches no vitest project and is silently never collected, F8/F9b; the package path is collected by the `ui-base-package` project). Cover `listen`/`track`/`replaceManaged`/`dispose`. Import sweep across the 29 subclass files: replace `@renderer/presentation/primitives/presentation-component.base` → `@prismgb/ui-base` (`git grep -l "presentation-component.base" -- src tests`). No re-export shim (owner: delete shims).
   - Gate: `npm run typecheck && npm run typecheck:ui-base && npm run test:run && npm run lint && npm run lint:ui-base && npm run dev:smoke`. Commit: `refactor(ui-base): promote PresentationComponent anchor + import sweep across 29 subclasses`.

2.2 **ARIA widgets → `packages/prismgb-ui-base/src/widgets/`**: `disclosure.class.ts`, `listbox-dropdown.class.ts`, `combobox-listbox.class.ts`, `activity-auto-hide.controller.ts`, `listbox.utils.ts`, and `calculateAnchoredDisclosureLayout` (extracted from `disclosure.class.ts`). **Before moving, decouple the app `CSSClasses` config from all three widgets** (a package file must not import `@renderer/presentation/config/css-classes.config`). All three currently import it AND hard-code class-name constants:
   - `disclosure.class.ts`: import at `:8`; default `visibleClass = CSSClasses.VISIBLE` at `:196`.
   - `combobox-listbox.class.ts`: import at `:1`; default `visibleClass = CSSClasses.VISIBLE` at `:70`.
   - `listbox-dropdown.class.ts`: import at `:1`; default `activeClass = CSSClasses.ACTIVE` at `:61`; **AND an inline `visibleClass: CSSClasses.VISIBLE` passed when constructing `DisclosureController` at `:105`** (this second site is easy to miss — without fixing it the moved file still imports the app config).
   Replace each with a string-literal default (`'visible'` / `'active'`) — these option fields are already injectable (constructor options), so callers that pass the concrete `CSSClasses.*` continue to work; only the *default* changes. Drop the `css-classes.config` import from each widget. Import sweep for consumers.
   - **Update the affected widget test files** (they instantiate the widgets and may assert on the default class names): `tests/unit/renderer/presentation/primitives/listbox-dropdown.test.ts` (covers `ListboxDropdownController` AND `ComboboxListboxController` — the `ComboboxListboxController` describe block already exists at `:209`, so DO NOT "add a missing test"; instead update it + the listbox-dropdown cases for the literal defaults / injected config), plus the `disclosure` and any `combobox` test files. Pass an explicit config or assert against the new literal defaults.
   - Keep the concrete domain config (`css-classes.config`) in presentation; concrete class names are injected at the call sites.
   - Gate: full set. Commit: `refactor(ui-base): promote ARIA widget controllers, decouple CSS-class defaults`.

2.3 **Generic template-ref engine → `packages/prismgb-ui-base/src/template/template-ref.helpers.ts`** per the F11 split. Move the generic exports (`TEMPLATE_REF_ATTRIBUTE`, `TEMPLATE_ACTION_ATTRIBUTE`, `createTemplateRefSelector`, `createTemplateActionSelector`, `getTemplateAction`, `getTemplateActionTarget`, `bindTemplateRefs`, the private `escapeAttributeSelectorValue`, and types `TemplateRefList`/`TemplateRefLegacyIdMap`/`TemplateRefBindingOptions`) → ui-base. Leave the domain `UIAction*` block (`UIActionIds`/`UIActionDescriptors`/`UIActionTargets`/`isUIActionId`/all `UIAction*` types — they import `@prismgb/events` + `template-dom.contract`) in presentation, re-importing the generic engine from `@prismgb/ui-base`. Import sweep: `ui-setup.orchestrator.ts:1-12` (and any other consumer from `git grep -n "template-ref" -- src`) now imports generic symbols from `@prismgb/ui-base` and domain symbols from the presentation file. Keep `dom-bindings.utils.ts`/`template-dom.contract.ts` (app DOM manifest) in presentation.
   - Gate: full set. Commit: `refactor(ui-base): promote generic template-ref engine, keep UIAction descriptors in presentation`.

> Browser-API adapters (`BrowserStorageAdapter`, `BrowserMediaAdapter`, `Visibility`/`ReducedMotion`/`UserActivity` adapters, `downloadFile`) are **deferred to §8 / a follow-up** — independent relocations with no bearing on the signals migration. If executed, each is its own `refactor(ui-base): relocate <adapter>` commit with `dev:smoke`.

### Phase 3 — `AppState` → signals (remaining fields, dual-exposed)

Apply the Phase-1.5 dual-exposure recipe to the rest of `AppState`, per the table. Keep every value getter's observable behavior identical (F5 value consumers unchanged); add a `*Signal` accessor for each.

| Field | Today | Conversion | Notes |
|-------|-------|-----------|-------|
| `isCinematicModeEnabled` | stored bool | done in 1.5 | value getter reads `.value`. |
| `_streamCache` / `currentStream` | cache set by `STREAM.STARTED/STOPPED` | `_streamCache = signal<MediaStream\|null>(null)`; getter `this._streamCache.value ?? this.streamingService?.getStream?.() ?? null`; add `streamSignal` accessor | stored-with-fallback; already event-fed. |
| `_capabilitiesCache` / `currentCapabilities` | cache set by STREAM events | `_capabilitiesCache = signal<unknown>(null)`; getter keeps the `?? service` fallback; add `capabilitiesSignal` | stored-with-fallback; already event-fed. |
| `isStreaming` | **derived** from `streamingService.isStreaming` (NOT stored) | **Keep `get isStreaming()` deriving live from the service — DO NOT re-point it.** Add a *parallel* `_isStreamingSignal = signal(this.streamingService?.isStreaming ?? false)` (initialized from current service state), set `true` on `STREAM.STARTED` / `false` on `STREAM.STOPPED`; expose `isStreamingSignal` for bindings only. | Intentionally dual-sourced (F5). The live getter is what consumers read; the signal is a binding mirror. |
| `deviceConnected` | **derived** from `deviceService.isConnected` (NO AppState event feed) | **Keep `get deviceConnected()` deriving live from the service — DO NOT re-point it** (`StreamingOrchestrator.start()` gates on it at `streaming.orchestrator.ts:119`; a false-initial or missed-event stored signal would wrongly block streaming). Add a *parallel* `_deviceConnectedSignal = signal(this.deviceService?.isConnected ?? false)`, fed by a **new** subscription to the device-status event feed (re-verify the channel: `git grep -n "DEVICE_STATUS\|DEVICE\." packages/prismgb-events/src`); expose `deviceConnectedSignal` for bindings only. | This field's conversion ADDS a new bus subscription. The gate keeps reading the live service value. |

> **Dual-sourcing is deliberate, not an oversight.** For `isStreaming`/`deviceConnected` the value getter (read by the streaming gate and other consumers) derives live from the service, while the `*Signal` (read by bindings) is event-fed and initialized from the current service value. A future reader must NOT "consolidate" the two — doing so re-introduces the gate hazard the audit flagged.

Replace `AppState`'s hand-rolled `_subscriptions: Array<()=>void>` with a `DisposableBag` from `@prismgb/core`. Concretely (`app-state.ts:27,38,45-58,86-98`): declare `private readonly _bag = new DisposableBag()`; in `_setupEventSubscriptions` push each `eventBus.subscribe(...)` disposer into the bag (`this._bag.add(...)` — re-verify the exact `DisposableBag` add API) instead of `this._subscriptions.push(...)`; and in `dispose()` **replace the `_subscriptions.forEach(...)` loop with `this._bag.dispose()`** (keep the `_streamCache`/`_capabilitiesCache` reset). Behavior is identical (all subscriptions torn down once). Update any `app-state` test that asserts on `_subscriptions` directly.

- Gate per field-cluster commit: `npm run typecheck && npm run typecheck:ui-base && npm run test:run && npm run lint && npm run lint:ui-base && npm run dev:smoke`. e2e on the streaming/device specs for the streaming/device clusters.
- Commits: `feat(state): back AppState stream/capabilities cache with signals`; `feat(state): add event-fed isStreaming/deviceConnected binding signals (live getters unchanged)`; `refactor(state): replace AppState subscription array with core DisposableBag`.

### Phases 4–8 — Component-by-component conversion (grouped by feature)

Apply the **Phase-1 recipe** to each component, one gated commit each, in this order. For every component: (a) introduce/extend a presentation `state/` store OR bind directly to an `AppState` signal; (b) replace the component's imperative DOM-write methods with bindings in its constructor/`initialize`; (c) grep-delete the glue slice (bridge handler + `*Like` interface member + `UIController` method) **only for pure state→DOM display methods** — mode-coordination/auto-hide methods are exempt; (d) adapt the component's test from spy-asserts to real-DOM/binding asserts; (e) run the gate. Re-verify each glue mapping by grep before deleting — the tables are authoring-time guidance, not a substitute for the grep.

**Phase 4 — Group A: status/streaming display**
| Component | File | Glue slice to remove (grep to confirm) | Source signal | e2e |
|-----------|------|----------------------------------------|---------------|-----|
| status-notification | done in 1.4 | — | local store | — |
| device-status | `shared/device-status.component.ts` (21 writes) | `UIEventBridge._handleDeviceStatus/_handleOverlayMessage/_handleOverlayVisible/_handleOverlayError`; `UIController.updateDeviceStatus/updateOverlayMessage/showErrorOverlay/get deviceStatus`; matching `UiControllerLike` members | `appState.deviceConnectedSignal` + a device-status store for name/overlay | device-connection, device-streaming |
| streaming-controls | `features/streaming/streaming-controls.component.ts` (23 writes) | **ONLY** `UIController.updateStreamInfo` (`ui.controller.ts:175-193`) + `UIEventBridge._handleStreamInfo` (`ui-event.bridge.ts:141-147`) + the `updateStreamInfo` `UiControllerLike` member (`:14`). **DO NOT remove `UIController.setStreamingMode`, `UIEventBridge._handleStreamingMode`, or `PresentationModeService.handleStreamingMode`** — see note below. | `appState.isStreamingSignal` is NOT bound here; bind the **stream-info display** (resolution/fps via a stream-info store fed by `STREAM_INFO`). | device-streaming, streaming-smoke |
| transcode-toast | `features/transcode/transcode-toast.component.ts` (15 writes) | `TranscodeUIBridge._toast.show/updateProgress/showSuccess/showError/hide` calls; the `_toast` getter | a transcode-progress store fed by `TRANSCODE.*` | streaming-smoke |

> **streaming-controls scope (corrected — was a wrong-deletion defect).** `UIController.setStreamingMode` (`ui.controller.ts:163-173`) is **presentation-mode coordination**, NOT stream-info display: it calls `streamControlsComponent.setStreamingMode(isStreaming)` (which toggles the `streaming-mode` body class via `bodyClassManager.setStreamingMode`) AND enables/disables cursor + toolbar auto-hide AND hides the shader selector. It is invoked by `PresentationModeService.handleStreamingMode` (`settings-presentation-mode.service.ts:52`), which is driven by `UIEventBridge._handleStreamingMode` → `presentationModeService.handleStreamingMode(enabled)` (`ui-event.bridge.ts:132-139`). **Retain this entire chain** (`_handleStreamingMode` → `handleStreamingMode` → `setStreamingMode` → component `setStreamingMode`). In Phase 4 convert ONLY the stream-info display (`updateStreamInfo`/`_handleStreamInfo`, resolution/fps). The component's own `setStreamingMode` method (with its transition timer) stays imperative.

> device-status test rewrite: replace `classList.add` spy assertions with real-DOM `classList.contains` assertions (bindings use `classList.toggle`, which yields the same end-state classes — assert the resulting class set, not the call).

**Phase 5 — Group B: presentation-mode / body classes (GATED COMPOSITES — read F12 first)**

These body classes are NOT pure single-signal toggles (F12). A naive `bindClass(document.body, CINEMATIC_ACTIVE, cinematicModeSignal)` would silently drop the `&& streaming` gate; a naive minimalist binding would drop both the 3-input gate and the `MINIMALIST_TRANSITION` timing. Convert as follows, **re-verifying the exact predicates at `settings-presentation-mode.service.ts:80-89` before binding**:

1. Add the two missing reactive inputs as event-fed signals (presentation-layer, mirroring the private fields `PresentationModeService` keeps today):
   - `fullscreenActive` — fed by `UI.FULLSCREEN_STATE` (the same source `handleFullscreenState` consumes), initialized from `Boolean(document.fullscreenElement)`.
   - `minimalistEnabled` — fed by `SETTINGS.MINIMALIST_FULLSCREEN_CHANGED` (same source `handleMinimalistFullscreenChanged` consumes), initialized `false`.
   For streaming-active and cinematic-enabled reuse the existing signals to avoid divergence: cinematic-enabled = `appState.cinematicModeSignal` (Phase 1.5). For streaming-active, **subscribe to `UI.STREAMING_MODE`** (the exact source `handleStreamingMode` uses — do NOT substitute `appState.isStreamingSignal`, which is fed by `STREAM.STARTED/STOPPED` and may differ in timing; preserving the original event source preserves behavior).
   Put these in a new **`src/renderer/presentation/state/presentation-mode.store.ts`** that owns the four inputs and exposes the composites:
   - `cinematicActive = computed(() => cinematicEnabled.value && streamingActive.value)` (reproduces line 82).
   - `minimalistActive = computed(() => minimalistEnabled.value && fullscreenActive.value && streamingActive.value)` (reproduces line 87).
   - `fullscreenActive` (the single-input signal, reproduces the `updateFullscreenMode` pass-through).
2. Bind in `body-class.class.ts` (or a small binding-setup that the effect owns), preserving every side-effect:
   - `cinematic-active`: `bindClass(document.body, CSSClasses.CINEMATIC_ACTIVE, store.cinematicActive)` — clean (composite signal, no extra side-effect).
   - `fullscreen-active`: `bindClass(document.body, CSSClasses.FULLSCREEN_ACTIVE, store.fullscreenActive)` — clean.
   - `minimalist-fullscreen`: **NOT a plain `bindClass`.** Use an `effect(() => { ... })` that replicates `BodyClassManager.setMinimalistFullscreen` semantics: read `store.minimalistActive.value`, and only when the target state changes, run the `MINIMALIST_TRANSITION` timing (`_setMinimalistTransitionActive`: add `MINIMALIST_TRANSITION`, `replaceTimeout`-remove after `TIMING.MINIMALIST_TRANSITION_MS`) before toggling `MINIMALIST_FULLSCREEN`. Keep the `dispose()` cleanup that removes `MINIMALIST_TRANSITION` (`body-class.class.ts:59-63`).
3. **Retain imperative (do NOT convert in this phase):**
   - `streaming-mode` body class + the cursor/toolbar auto-hide enable/disable + shader-selector hide — these are mode coordination coupled to activity effects, owned by the `setStreamingMode` chain (F12; kept per Phase 4). The `streaming-mode` body class continues to be pushed by `streamControlsComponent.setStreamingMode` via `bodyClassManager`.
   - the activity classes `app-idle`/`app-hidden`/`app-animations-off` (auto-hide effects, §8).
4. Delete glue ONLY after parity is proven (e2e `fullscreen`, `settings`, `streaming-smoke` green): once the store-driven bindings reproduce the body classes, delete the now-redundant `PresentationModeService._updateCinematicVisual`/`_updateMinimalistVisual` → `uiController.updateCinematicMode`/`updateMinimalistFullscreen` → `effects.setCinematicMode`/`setMinimalistFullscreen` → `bodyClassManager.setCinematicMode`/`setMinimalistFullscreen` chain, and the `updateFullscreenMode` body-class push (keep `updateFullscreenButton` + the controls-auto-hide calls in `handleFullscreenState`). Grep-confirm each method has zero remaining callers before deletion. **Keep** `setStreamingMode` and the auto-hide methods.
   - Gate per commit: full set incl. `dev:smoke` + e2e (`fullscreen`, `settings`, `streaming-smoke`).
   - Commits (split as needed): `feat(presentation): add presentation-mode store with gated cinematic/minimalist/fullscreen composites`; `feat(presentation): bind body classes to presentation-mode composites, preserve minimalist transition`; `refactor(presentation): drop redundant presentation-mode visual pass-throughs (streaming-mode/auto-hide retained)`.

**Phase 6 — Group C: settings & toolbar**
Order: `shader-slider-controls` → `shader-preset-list` → `shader-selector` → `update-section` → `settings-menu`. Each: bind its selection/preset/brightness/toggle/update-status/progress state to a feature store or settings signals; remove imperative writes; delete glue. `update-section` (34 writes — largest single file) and `settings-menu` (~397 LOC) are the heaviest; split each into multiple commits if a single diff exceeds ~400 changed LOC. Keep the `Disclosure`/`Listbox`/`Combobox` widget usage (now from ui-base) imperative. e2e: settings.

**Phase 7 — Group D: notes (8 components)**
Order leaf-first: `game-filter` → `game-autocomplete` → `notes-search` → `notes-resize-handler` → `notes-list-view` → `notes-editor-view` → `notes-panel-layout` → `notes-panel`. Notes state (search query, filter, list, editor title/content, panel open) → a notes presentation store backed by signals; bind list/editor/empty-state DOM. This is the largest group; one component per commit, full gate each. Keep `@prismgb/notes` service + bus untouched (L8).

**Phase 8 — Group E: residual capture/transcode + final glue sweep**
- Re-grep the 247-site baseline: `git grep -oE "\.textContent|\.classList\.|\.setAttribute|\.innerHTML|\.style\." -- 'src/renderer/presentation/**/*.ts' | wc -l` — convert any remaining state→DOM writes; the residual count should be the intentionally-imperative set only (auto-hide cursor positioning, button-feedback animation, the `streaming-mode`/auto-hide mode coordination, the minimalist transition timing, ARIA `setAttribute` inside widgets).
- Delete now-orphaned glue: once a bridge has zero remaining handlers, delete the bridge file + its DI registration + tests (grep `git grep -ln "CaptureUIBridge\|TranscodeUIBridge\|UIEventBridge" -- src tests`). If a bridge still has a live handler (e.g. `UIEventBridge` retains `_handleStreamingMode`/`_handleCinematicMode`/`_handleFullscreenState`/the record-button + button-feedback handlers; `CaptureUIBridge` button-feedback/download), **keep the bridge** and drop only the converted handlers. Delete `UIController` methods with zero callers. Delete unused `*Like` interface members.
- Gate each deletion commit: full set incl. `dev:smoke` + the touched e2e specs.

### Phase 9 — Close-out

- Re-run all gates from a clean tree (§5 matrix).
- Update `docs/` if a migration log is maintained; record the final residual DOM-write count and the converted-component list.
- Squash-merge `refactor/p03-ui-base-reactive` → `refactor/codebase_reduction` via PR (`gh pr create`), conventional title, no AI attribution.

---

## 5. Gates & Verification

| Gate | Command | Catches | Per-phase requirement |
|------|---------|---------|----------------------|
| Typecheck (app+tests+gpu+core) | `npm run typecheck` | type errors across app+tests+gpu+core | every commit |
| Typecheck (ui-base) | `npm run typecheck:ui-base` | type errors in the package on a clean-tree-equivalent (src-mapped `@prismgb/core`, F8/F11) | every commit (also chained into `npm run typecheck`) |
| Unit/integration | `npm run test:run` | behavioral regressions; runs all vitest projects incl. `ui-base-package` + the ~9k presentation tests (the safety net) | every commit (husky runs it anyway) |
| Lint + boundaries (app) | `npm run lint` | eslint `src/**` + `check-layer-boundaries.js` | every commit |
| Lint (ui-base) | `npm run lint:ui-base` | eslint the package source (root lint does NOT — F8) | every commit that touches `packages/prismgb-ui-base/**` |
| Runtime boot | `npm run dev:smoke` | DI/boot/package-resolution + F10 `eventBus` wiring regressions — the ONLY gate that catches these (typecheck/test use src aliasing) | every commit that touches package source, DI wiring, or first imports ui-base; mandatory from 1.4 on |
| E2E | `npm run test:e2e` (86 Playwright) | renderer UI regressions; coexistence of converted + imperative components; gated body-class composites | every commit touching renderer UI / DI / IPC; minimally the spec(s) named per phase |

Interpretation:
- `typecheck:ui-base` fail with "cannot find module '@prismgb/core'" or a `.d.ts` error → the ui-base `tsconfig.json` `paths` is missing the `@prismgb/core → ../../packages/prismgb-core/src` mapping (F11), or a ui-base source file imports another workspace package without a src mapping. Add the mapping; do NOT build `dist`.
- `dev:smoke` fail after adding ui-base → ui-base `dist` not built (the `predev` hook must `turbo run build` it; check `ls packages/prismgb-ui-base/dist/index.js`), or its `package.json` `exports` map is wrong so the app can't resolve it from `dist` (F7), or the workspace package not linked (`ls node_modules/@prismgb/ui-base`; re-run `npm install`), or (Phase 1.4+) the F10 `eventBus` wiring missed (`requireDependency` throws "missing UI component dependency \"eventBus\"" — fix in `app-bootstrap.ts`/`ui.controller.ts`, NOT `service-registrations.ts`).
- `test:run` "passes" but your new package test never ran → the test is outside `packages/prismgb-ui-base/tests/unit/**` (F8/F9b). Move it under the package tree.
- e2e fail on a status/device/stream/fullscreen spec after a conversion → the event→signal write isn't firing (store subscription wrong channel), the binding element ref is null (template `data-ref` mismatch), or a gated composite dropped a predicate input (F12 — re-check the `computed`). Reproduce with `dev:smoke` + DevTools before guessing.
- Boundary checker should never flag `@prismgb/ui-base` (F6). If it does, a `src/` file used a relative `../../packages/...` path instead of the alias — fix the import, do not edit the checker.

---

## 6. Risks, Mitigations & Rollback

| Risk | Likelihood | Blast radius | Mitigation | Rollback |
|------|-----------|--------------|-----------|----------|
| R1 Binding mechanism subtly wrong (effects leak / don't tear down) | Med | All conversions | Phase 1.3 tests lock `effect()` sync + teardown semantics BEFORE any consumer; every binding registered on the component's `DisposableBag` | Revert the conversion commit; package + bindings stay (independent commits) |
| R2 Cross-layer `AppState`-signal path unsound | Med | Streaming/device components | Phase 1.5 proves it on one stored field first; F6 confirms no boundary violation | Revert 1.5; value getters still serve all consumers |
| R3 Glue deletion breaks a still-live caller | Med | Runtime crash / silent no-op | §5 discipline: grep ALL refs (src+tests), update the bridge `*Like` interface + mocks, THEN delete; `dev:smoke` + e2e per commit | Per-commit revert; glue deleted only after grep proves zero consumers |
| R4 Test rewrites mask a real regression (spy→DOM) | Med | False-green | Assert resulting DOM **state** (`classList.contains`, `textContent`), not call patterns; keep e2e as the behavior oracle | Revert; e2e specs are unchanged behavior contracts |
| R5 Hand-rolled signal primitive subtly wrong (stale reads, leaked subs, missed/over-fire, infinite cascade) | Med | All bindings | Phase 1.3 correctness suite locks the hard cases (diamond update, dynamic-dep cleanup, batch coalescing, dispose-mid-propagation, no self-cascade loop) BEFORE any consumer; bindings are idempotent so over-fire is a no-op; the seam is one file so the engine is swappable | Fix `reactive/signal.ts` against the failing suite case; if intractable, swap the seam to a vetted lib behind the same API (one-file change) |
| R6 Src-alias surface missed (vitest or a tsconfig) OR dist/exports wrong | Med | Typecheck/test OR runtime resolution | F7 enumerates the 3 src-alias surfaces + the dist `exports` requirement; gates run `typecheck` (tsconfig), `test:run` (vitest), and `dev:smoke` (dist resolution) — each fails on a different missing surface | Add the missing alias or fix the `exports`; no revert needed |
| R7 `typecheck:ui-base` red on clean CI tree | Med | CI break (locally green if dist exists) | F8/F11: ui-base tsconfig maps `@prismgb/core`→src; gate runs `typecheck:ui-base` explicitly | Add the path mapping |
| R8 Wrong-deletion of mode coordination (`setStreamingMode`) or a dropped gate/timing in Phase 5 | Med | Lost streaming-mode/cinematic/minimalist behavior, **green local gates** | F12 + Phase 4/5 corrections: retain `setStreamingMode`/auto-hide; bind gated `computed` composites; preserve minimalist transition; parity proven by e2e (`fullscreen`/`settings`/`streaming-smoke`) before any deletion | Per-commit revert; deletions are gated behind proven e2e parity |
| R9 `eventBus` wired in the wrong file (`service-registrations.ts`) → `undefined` at runtime | Med | Boot throw / silent undefined | F10 path is explicit (app-bootstrap.ts + UIControllerDependencies + initializeComponents); `dev:smoke` catches via `requireDependency` throw | Apply F10a–c; revert the partial edit |
| R10 `PresentationComponent` sweep (29 files) misses a site | Low | Typecheck error (caught) | `git grep -l "presentation-component.base"` must return zero `src/` hits post-sweep; typecheck gate | Revert 2.1 (single mechanical commit) |
| R11 Package test silently never collected (wrong path) | Med | False-green "all tests pass" | F8/F9b: package tests MUST live under `packages/prismgb-ui-base/tests/unit/**`; confirm the test actually ran in the `ui-base-package` project output | Move the test file |
| R12 Scope creep into out-of-scope items | Med | Plan never finishes | §8 hard boundary; build-model/adapters explicitly deferred | N/A — refuse the work |

Rollback unit = the commit. Every sub-step is an independently revertible, gated commit, so any single conversion can be reverted without disturbing the package foundation or other converted components.

---

## 7. Done Criteria

- [ ] `packages/prismgb-ui-base/` exists, mirrors package conventions, deps = `@prismgb/core` ONLY (no external reactivity dep); its `tsconfig.json` maps `@prismgb/core`→src; `npm run typecheck:ui-base` and `npm run lint:ui-base` pass and the `ui-base-package` vitest project runs (package tests collected from `packages/prismgb-ui-base/tests/unit/**`).
- [ ] `@prismgb/ui-base` + `@prismgb/ui-base/reactive` src-aliased on the 3 fast paths (vitest `sharedAlias` + 2 tsconfig), build to `dist` with correct `exports`, are in the turbo build + `predev`/`prebuild:vite` rebuild, and resolve from `dist` at app build/runtime (NO vite alias); `npm run dev:smoke` green.
- [ ] Reactive seam is a single hand-rolled file (`reactive/signal.ts`); no external reactivity dep anywhere (`git grep -rl "@preact" -- src packages` returns empty) and no consumer imports the engine except via the relative `./signal.js` seam.
- [ ] The hand-rolled signal correctness suite (`packages/prismgb-ui-base/tests/unit/reactive/signal.test.ts`) passes and covers: diamond-update, dynamic-dep cleanup, batch coalescing, computed recompute, dispose-mid-propagation, and no-self-cascade-loop (Phase 1.3).
- [ ] `bindText/bindClass/bindVisible/bindAttr/bindProperty` + `SignalBinder` shipped with happy-dom tests; F9 semantics locked.
- [ ] `PresentationComponent` + ARIA widgets (CSS-config-decoupled) + generic template-ref engine live in ui-base; the 29 subclass imports point at the package; `git grep -l "presentation-component.base" -- src` returns zero; no package file imports `@renderer/...`.
- [ ] `AppState` stored fields dual-exposed (value getter + `*Signal`); `isStreaming`/`deviceConnected` getters STILL derive live from the service with parallel event-fed binding signals (streaming gate unchanged); subscription array replaced by `DisposableBag`.
- [ ] `eventBus` reaches `UIController` via `app-bootstrap.ts` (NOT `service-registrations.ts`); `requireDependency` never throws at boot.
- [ ] Group A–E components converted; Phase 5 body classes bound via gated `computed` composites with the minimalist transition preserved and `streaming-mode`/auto-hide retained imperative; residual DOM-write count equals only the intentionally-imperative set (record the number).
- [ ] Orphaned glue (fully-unconsumed bridge handlers, `UIController` methods, `*Like` members) deleted; `setStreamingMode`/auto-hide/mode coordination retained; `@prismgb/events` bus, CSS, and ARIA widget behavior unchanged.
- [ ] Full gate matrix (§5) green from a clean tree; 86 e2e pass; test count ≥ baseline recorded in §1.
- [ ] No commit used `--no-verify`; all subjects ≤100 chars, no AI attribution.

---

## 8. Out of Scope (do NOT do)

1. **Build-model migration (L6).** Do NOT build packages to `dist`, wire turbo into CI, or retire the `@prismgb/*→src` vite/vitest aliasing. ui-base conforms to the current src-aliasing (parity with the existing packages); the dist/turbo/CI/alias-retirement end-state is delivered by the separate cross-cutting build-model plan. (The ui-base `tsconfig.json` `@prismgb/core`→src mapping is a typecheck-only conformance to this same src-aliasing model, F11 — not a dist build.)
2. **Boundary-checker changes (F6).** Do NOT modify `scripts/check-layer-boundaries.js`. `@prismgb/ui-base` imports already resolve to `null` and are skipped. Do NOT add `main→ui-base` policing (pre-existing gap, separate concern).
3. **React/PrimeReact (L3).** No JSX, no virtual DOM, no component framework. Vanilla DOM + signals only.
4. **Converting activity-driven effects to signals.** `cursor-auto-hide`, `toolbar-auto-hide`, `controls-auto-hide`, `activity-auto-hide`, `button-feedback`, `capture` effects stay imperative — they respond to user-activity/timers/transient animations, not state→DOM. Touched only by the `PresentationComponent` import sweep (Phase 2.1).
5. **Converting ARIA widgets to signals.** `Disclosure`/`Listbox`/`Combobox` controllers move to ui-base unchanged (imperative ARIA state machines); keep their `setAttribute`/`classList` writes. Phase 2.2 changes ONLY the default CSS-class source (decouple the app config), not behavior.
6. **Mode-coordination / activity-coupled body state.** The `streaming-mode` body class + cursor/toolbar auto-hide enable-disable + shader-selector hide (the `setStreamingMode` chain) and the `app-idle`/`app-hidden`/`app-animations-off` activity classes stay imperative. Phase 5 converts ONLY the pure-display gated composites (`cinematic-active`, `fullscreen-active`, `minimalist-fullscreen`) and preserves their predicates + transition timing.
7. **Browser-API adapter relocation** (`BrowserStorageAdapter`, `BrowserMediaAdapter`, `Visibility`/`ReducedMotion`/`UserActivity`, `downloadFile`) — independent of the signals migration; deferred to a follow-up (each its own `dev:smoke`-gated commit) or the build-model plan.
8. **Device manifest/registry seam (L7).** Untouched.
9. **The `@prismgb/events` bus and event→state flow (L8).** Bus, channels, payloads, and the event→state writers stay; only the imperative state→DOM path is replaced.
10. **CSS.** The ~5271 LOC of presentation CSS is preserved as-is; bindings toggle the same class tokens.