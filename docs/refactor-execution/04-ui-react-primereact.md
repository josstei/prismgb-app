# Phase 4 — UI wholesale → React 19 + PrimeReact

> Spine: `docs/refactor-execution/00-overview.md`. Catalogue: `docs/refactor-aggressive-reduction-options.md` Part V (and Part IV, the fallback). This doc inherits its scope and its honest caveats from the overview **verbatim** — it does not re-scope or soften the tags.
>
> **This is the largest phase in the program.** It is given internal leaf→composite staging (Stages 0-4) precisely so it is an executable plan and not a plan in name only. Read the staging (§5) as the contract; the LOC table (§3) is the destination.

---

## 1. Inherited status & caveats

**Catalogue verdict (overview §"Parts IV/V — UI"):** Part V `React + PrimeReact` **wholesale → P4 (this phase)**. Alternates in the *same* phase, owner picks at Spike-C: `React + MUI` (ecosystem-first), `Vue + PrimeVue` (if the team prefers Vue — identical component surface). **Fallback:** Part IV `Solid + Zag` light-DOM headless (the constrained answer that keeps the 5,271-line CSS) — taken only if the wholesale rewrite is rejected at Spike-C.

**Readiness (overview phase table):** **✅ Spike-C PASSED (2026-06-28) — cleared for execution.** The gate (*a PrimeReact island mounts + boots in the Electron renderer under the current vite/CSP config*, `index.html:6` → `script-src 'self'`) was met on all four criteria: `build:vite` clean (React 19.2.7 + PrimeReact 10.9.8 under Vite 7), the vertical `Slider` island mounts via `createRoot` and `dev:smoke` boots with Fast Refresh under `script-src 'self'` producing **zero** CSP violations (no `fastRefresh:false`/relaxed-dev-CSP accommodation needed), and the RTL `Dialog`-portal harness passes under happy-dom (**no jsdom switch**). **One required deps pin: `@vitejs/plugin-react@^5`** — v6 peers `vite@^8` and rejects the project's Vite 7 (add to §3 deps). Full evidence in the session scratchpad `SPIKE-C-VERDICT.md`. The spike de-risks BOOT + test-harness only; the rewrite labor (§1 trade) remains. **No fallback to Solid+Zag.**

**Load-bearing trade (overview §"⚠️ Load-bearing trades", item 3 — carried forward unlaundered):** The UI rewrite is a **ground-up replacement of 8,052 TS + 5,271 CSS + a rewrite of the ~9,064-LOC presentation test suite**. It is **months of work; the largest single line item** in the entire program. It is the owner's **explicit choice under "nothing is off limits; I don't care about the test suite."** This is not a routine task — do not frame it as one. The catalogue's own Part V framing stands: the team writes *essentially zero markup, zero from-scratch styling, and zero behavior for any standard widget*, in exchange for that rewrite cost.

**Two component-level honest tags carried forward (do not soften):**
- **`notes-resize-handler` → PrimeReact `Splitter` is the one "verify-before-you-believe-the-number" claim.** Part V lists `notes-resize-handler` 250 LOC → ~15. Part IV explicitly counters that a splitter is *"the wrong shape (between-panes)"* for this file's **dual-purpose drag+collapse + rAF `--notes-list-width` write + cursor-snapshot** behavior (`notes-resize-handler.component.ts:1-40` — six `Symbol`-keyed drag lifecycles, `BodyStyleSnapshot`). **Treat 250→15 as unproven until a spike confirms `Splitter` models collapse-toggle + width-persistence.** Flagged **may-retain-bespoke** in §5 Stage 3.
- **`effects/` (918) and `bridges/` (434) are NOT a clean delete to ~0.** Part IV keeps effects hand-rolled ("no state machine models hide-cursor-after-Nms-idle"); Part V reduces effects→~100 via `react-idle-timer` and bridges→~30 via the two hooks. The reduction is real but the residual is *irreducible glue*, not zero.

---

## 2. Spike gate (Spike-C) — REQUIRED before any Stage-1 work

The overview marks Phase 4 conditional. Run Spike-C in an **isolated git worktree** so the clean branch's `package.json`/lockfile/`node_modules` are untouched. **INTERLOCK (from the project's AGY/worktree rules): one executor per tree — never run a second mutating agent against the shared working tree.** Agent threads reset `cwd` between calls; run each block as one compound command or use absolute paths.

### Setup
```
git worktree add /Users/josstei/Development/prismgb-workspace/prismgb-spike-c -b spike/primereact-c refactor/codebase_reduction
cd /Users/josstei/Development/prismgb-workspace/prismgb-spike-c \
  && npm i react@^19.2 react-dom@^19.2 primereact primeicons \
  && npm i -D @vitejs/plugin-react @testing-library/react @testing-library/user-event
```

### Spike content (two probes — boot AND test; the spike de-risks BOOT, not the test harness)
1. **Boot probe.** Add `@vitejs/plugin-react` to the renderer `plugins` in `vite.config.js` (the top-level `plugins`/`build` block, lines ~152-163). In `src/renderer/app-bootstrap.ts`, behind a temporary flag, mount ONE PrimeReact island into a spare container with `createRoot(el).render(<Slider orientation="vertical" .../>)` — leave the legacy `renderAppShell`/`UIController` path (`app-bootstrap.ts:52-63`) intact so the success marker still fires.
2. **Portal/test-harness probe.** Add one Vitest test under `tests/unit/renderer/react/` that renders a PrimeReact **portal** widget (`Toast` or `OverlayPanel`) with `@testing-library/react` in the existing `renderer-happy-dom` project (env `happy-dom`, `tests/testing-library.setup.js` already present) and asserts the portal content is queryable.

### Run + pass/fail
```
cd /Users/josstei/Development/prismgb-workspace/prismgb-spike-c \
  && npm run build:vite \
  && npm run dev:smoke \
  && npx vitest run tests/unit/renderer/react
```

**PASS (all four must hold):**
- `build:vite` succeeds — no eval/CSP/Node-polyfill error (production bundle has **no** Fast Refresh, so this isolates the bundler-only path).
- `dev:smoke` prints **`Renderer application started successfully`** (`app-bootstrap.ts:90`). This runs `npm run dev`, which **does** load `@vitejs/plugin-react` Fast Refresh — so it is the *only* probe that exercises the `script-src 'self'` no-eval risk in the dev preamble. **This is the deciding line of the spike.**
- The island renders visibly with **no CSP violation** in the Electron console (`style-src` already allows `'unsafe-inline'` per `index.html:6`, covering PrimeReact's dynamic overlay positioning; `script-src 'self'` must not be tripped by eval).
- The happy-dom portal probe passes (RTL can host + query a PrimeReact portal under happy-dom).

**FAIL handling (graduated — do NOT jump straight to the Solid fallback):**
- `build:vite` passes but `dev:smoke` fails on a CSP/eval error → **Fast Refresh is the culprit, not React/PrimeReact.** Re-run with Fast Refresh disabled (`react({ fastRefresh: false })`) or a dev-only relaxed CSP. If `dev:smoke` then passes → proceed; document the dev-CSP/Fast-Refresh decision in the Stage-0 commit. **Only if it still fails →** Fallback (§10).
- `build:vite` itself fails on the bundle, or the island will not render under the **production** CSP → **Fallback (§10)** — the wholesale-React bet does not hold.
- Portal probe fails under happy-dom only → **not a phase blocker**: switch the portal-component tests to `jsdom` or vitest browser-mode (add `jsdom` to dev-deps). Record it as a Stage-0 harness decision; boot is unaffected.

### Teardown
```
git worktree remove /Users/josstei/Development/prismgb-workspace/prismgb-spike-c --force \
  && git branch -D spike/primereact-c
```

---

## 3. Scope

### Executes
Part V `React + PrimeReact` wholesale (overview scope-resolution → **→P4**), plus the catalogue items the overview marks **⊘P4 (dropped, superseded by this rewrite)** — they are *not* executed as seams because this phase deletes the code they would touch: `elements-whitelist-spread`, `update-state-descriptor-table`, `vertical-slider-control-primitive`, `panel-hidden-visibility-method`, `disclosure-host-base-component`, `presentation-dispose-template-method`, `managed-element-binding-seam`, `listbox-option-navigation-primitive`, `managed-child-component-set`, `notes-subscription-keyed-helper`, all presentation/CSS seams, `import-canonical-core-contracts`/`shared-presentation-dom-contracts` (presentation type-shims deleted with the layer).

### Deletes (LOC verified by `wc -l` on `refactor/codebase_reduction`, 2026-06-28)
| Bucket | Files | LOC | Fate |
|--------|-------|----:|------|
| **ARIA primitives** | `primitives/disclosure.class.ts` 367 · `listbox-dropdown.class.ts` 310 · `combobox-listbox.class.ts` 244 · `listbox.utils.ts` 60 | **981** | → PrimeReact widgets (built-in WAI-ARIA, focus, keyboard, type-ahead) |
| **Binding/registry/controller substrate** | `primitives/presentation-component.base.ts` 148 · `template-ref.utils.ts` 158 + `dom-bindings.utils.ts` 100 + `template-dom.contract.ts` 19 (=277) · `controller/ui.controller.ts` 281 · `controller/component.registry.ts` 211 · `controller/ui-component.catalog.ts` 214 | **1,131** | → JSX tree + `useService` context + framework refs |
| **bridges/** | `ui-event.bridge.ts` 229 · `capture-ui.bridge.ts` 111 · `transcode-ui.bridge.ts` 94 | **434 → ~30** | the 17-entry imperative `eventBus→uiController` descriptor table (`ui-event.bridge.ts:55-74`) collapses into `useEventBus`/`useEventValue` |
| **effects/** | 7 files (`ui-effects.class.ts` 232 · `toolbar-auto-hide.effect.ts` 236 · `controls-auto-hide.effect.ts` 148 · `cursor-auto-hide.effect.ts` 99 · `button-feedback.effect.ts` 81 · `body-class.class.ts` 69 · `capture.effect.ts` 53) + `primitives/activity-auto-hide.controller.ts` 166 | **1,084 → ~100** | idle/auto-hide → `react-idle-timer`; shutter/body-class/button-feedback → hook + transient state + CSS transition |
| **Feature components** | `features/**` 4,026 + `shared/device-status.component.ts` 97 + `shared/status-notification.component.ts` 31 (29 `extends PresentationComponent` subclasses confirmed) | **4,154 → ~1,400-1,800** | thin JSX: app logic + event-bus glue kept; all markup/ARIA/class-toggling/lifecycle deleted |
| **Shell / config / lib / icons** | `shell/` 123 · `config/` 90 · `lib/` 17 · `icons/icon.utils.ts` 38 | **268 → ~150** | shell → root JSX; CSS-class/dom-selector config evaporates with the imperative DOM |
| **CSS** | `styles/` (11 files, 1,840) + `features/**/styles/**` (3,431) | **5,271 → ~250-400** | one PrimeReact theme preset + a thin bespoke-effects sheet (~100-400) for chromatic-aberration / rainbow-border / glass-blur / retro-standby flourishes the canvas needs |
| **Presentation test suite** | `tests/**` presentation specs | **~9,064 (rewritten, not deleted)** | re-authored in `@testing-library/react` |

**Presentation TS: 8,052 → ~1,900-2,250 (~72-76%).** **CSS: 5,271 → ~250-400 (~92-95%).** Combined 13,323 → ~2,150-2,650.

### Adds
**Runtime deps:** `react@^19.2`, `react-dom@^19.2`, `primereact` (^10.9.x, peer allows React 19 — overview §spike-results), `primeicons`, `react-idle-timer`. *(`notistack` + `react-resizable-panels` only if the **MUI** alternate is chosen at Spike-C; PrimeReact covers toast-stacking + splitter natively so they are NOT added on the PrimeReact path.)*

**Dev deps:** **`@vitejs/plugin-react@^5`** (Spike-C: v6 peers `vite@^8` and rejects the project's Vite 7 — pin to v5, peer `vite ^4||^5||^6||^7`), `@testing-library/react`, `@testing-library/user-event`. *(`jsdom` NOT needed — Spike-C confirmed happy-dom hosts PrimeReact portals; the RTL `Dialog`-portal probe passes under happy-dom.)* `@testing-library/dom` + `happy-dom` are already installed.

**New source files:**
- `src/renderer/presentation/react/services-provider.tsx` — `ServicesProvider` React context wrapping the existing Awilix-style cradle (`container.resolve(token)`); `useService(token)` hook.
- `src/renderer/presentation/react/hooks/use-event-value.ts` — `useEventValue(channel, initial)` via `useSyncExternalStore` over `@prismgb/events`.
- `src/renderer/presentation/react/hooks/use-event-bus.ts` — `useEventBus(channel, handler)` fire-and-handle variant (replaces `trackSubscription`/`DisposableBag` wiring).
- `src/renderer/presentation/react/app.tsx` — the root component (Stage-3 flip target).
- `src/renderer/presentation/theme/prismgb-preset.ts` — PrimeReact `definePreset()` token set derived from `styles/tokens.css` (magenta-on-dark + JetBrains Mono).
- `src/renderer/presentation/styles/bespoke-effects.css` — the surviving ~100-400-line brand-flourish sheet.
- Per-component `*.tsx` files under `features/**` and `shared/**` (replacing the deleted `*.component.ts`).

### Hard boundary (physics, not a hedge — overview §"The hard boundary")
The **GPU/WebGPU/canvas/worker/OffscreenCanvas rendering pipeline (`infrastructure/rendering/` + `infrastructure/services/gpu` + `…/streaming`) is UNTOUCHED.** Grounded: the pipeline takes its elements **as parameters** — `gpu-worker-manager.ts:90` `initialize(canvasElement: HTMLCanvasElement, …)` (`:113` `transferControlToOffscreen()`), `gpu-render-loop.service.ts:18,44` `start({ videoElement: HTMLVideoElement, … })`. The presentation→pipeline handoff today enters through `streamingViewService.setCanvas()` (`streaming-view.service.ts:122`); the pipeline separately reads that element via `gpuWorkerManager.initialize` (`gpu-renderer.service.ts:246`). So presentation's entire touchpoint is **a `ref` callback handing the `<canvas>`/`<video>` element to the rendering service via the streaming orchestrator (~5-10 LOC)** — see Stage 2, the guarded sub-task. Today that element is `<video id="streamVideo" data-ref="streamVideo">` (`features/streaming/stream-viewer.template.ts:51`).

---

## 4. Current → target state

**Current flow (imperative, hand-rolled):**
```
index.html#appContainer
  → renderAppShell() writes innerHTML string templates        (shell/app-shell.renderer.ts:5)
  → UIController god-object queries the DOM, builds elements   (controller/ui.controller.ts)
  → ComponentRegistry constructs 7 catalog roots              (controller/component.registry.ts, ui-component.catalog.ts)
  → 29 PresentationComponent subclasses do data-ref binding,
    DisposableBag listener wiring, manual class-toggling
  → UIEventBridge imperatively PUSHES bus events into the
    uiController (17-entry descriptor table)                  (bridges/ui-event.bridge.ts:55-74)
  → effects/ hand-roll idle auto-hide, shutter, body-class
```
Boot lives in `app-bootstrap.ts`: `renderAppShell` (52-56) → `initializeContainer` (58) → `_initializeUI` (121) → `_registerUIComponents` (141) → `_initializeUIEventBridge` (149) → `orchestrator.start()` logs the success marker (90).

**Target flow (declarative, library-owned):**
```
index.html#appContainer
  → createRoot(appContainer).render(
       <ServicesProvider container={cradle}>      // useService(token) = container.resolve(token)
         <App/>                                    // PrimeReact widget tree, themed via definePreset
       </ServicesProvider>)
  → components subscribe to the bus via useEventValue/useEventBus and render from state
    (the bridge/uiController/registry/catalog intermediary stack is gone)
  → react-idle-timer owns auto-hide; CSS transitions own shutter/feedback
  → a ref hands <canvas>/<video> to the (untouched) rendering service
  → orchestrator.start() STILL logs "Renderer application started successfully"
```
The services, container, `@prismgb/events`, `@prismgb/core`, and the entire rendering pipeline are **framework-agnostic and stay exactly as-is** (overview §real-inter-phase-dependencies: P4 consumes services through the bus/context, **not** the container internals, so it does **not** require P2/Awilix). **Two orchestrators are the exception — they reach into the presentation substrate this phase deletes and do NOT stay as-is:**
- `application/orchestrators/ui-setup.orchestrator.ts` (token `uiSetupOrchestrator`, dep `uiController`, ~233 LOC) imports `ui.controller`/`ui-component.catalog`/`template-dom.contract`/`template-ref.utils`/`config/css-classes` and carries real action-routing — `data-action` delegation into `UIController.toggle{SettingsMenu,ShaderSelector,NotesPanel}` (`:200-212`). Its routing migrates into the React `App` (Stage 3.5); the orchestrator + the `uiController` token drop in Stage 4.
- `application/orchestrators/performance/performance-animation.orchestrator.ts` (dep `bodyClassManager`) drives `BodyClassManager` from `effects/body-class.class` — a file this phase deletes (`:59-62`). Its body-class writes re-home onto the hook/CSS replacement, or the orchestrator is dropped, and the `bodyClassManager` token goes with it (Stage 4).

**Token-drop honesty (the two tokens are asymmetric).** `bodyClassManager`'s only non-presentation consumer is `performance-animation.orchestrator` — once that is re-homed/dropped and the presentation substrate is gone, it drops to zero (grep-clean). `uiController` does **not**: beyond `ui-setup.orchestrator`, it is consumed by **two untouched `infrastructure/services` this phase does not rewrite** — `streaming/streaming-view.service.ts` (`uiController.elements.streamVideo`/`streamCanvas`, `setStreamCanvas` — `:40,90,127`) and `settings/settings-presentation-mode.service.ts` (`setStreamingMode`/`updateFullscreen*`/`updateCinematicMode`/`updateMinimalistFullscreen`/`enable|disableControlsAutoHide` — `:57-93`). So **dropping the `uiController` token is GATED** on re-homing those two services off it onto the React canvas-ref/state path (the canvas ref covers `streamCanvas`/`streamVideo`; the presentation-mode toggles do **not**) — or a thin retained shim. Carried as a caveat, never silently claimed grep-clean.

---

## 5. Ordered task breakdown — leaf→composite staging (mandatory)

**The coexistence contract (the thing that makes "leaf-first" physically real):** a React root cannot own `#appContainer` and also be "a leaf" — so during Stages 0-2 we use the **light-DOM island model** (Part IV §"DI-into-components is a non-problem"): a React root + `ServicesProvider` mounts each ported component as an **island** into the *existing* shell container, while the legacy `renderAppShell`/`UIController`/bridge path keeps running for everything not yet ported. Each ported component **replaces** its legacy counterpart **and deletes the old `*.component.ts` + its `ui-component.catalog.ts` entry in the SAME commit**. Only at Stage 3, once enough of the tree is React, do we flip to a single React-owned root. Stage 4 deletes the now-orphaned substrate.

**Every stage commits its component tests in the same commit as the component** (the coverage ratchet measures `src/renderer` as a whole and fires on every run — see §6; deferring tests dips the aggregate and hard-fails `coverage:ratchet`). **Every stage runs `dev:smoke`** (the only gate that catches a CSP/boot regression; `test:run` is blind in happy-dom).

Agent allocation per the project Execution Planning Methodology is annotated per stage. The 7 `ui-component.catalog.ts` roots are the natural unit boundaries: `statusNotificationComponent`, `deviceStatusComponent`, `streamControlsComponent`, `transcodeToastComponent` (atoms) and `settingsMenuComponent`, `shaderSelectorComponent`, `notesPanelComponent` (composites).

### Stage 0 — Harness (MED · sequential, by ME — sets the contract every later stage depends on)
| # | File(s) | Change | Validate |
|--:|---------|--------|----------|
| 0.1 | `package.json`, lockfile | Add the runtime + dev deps (§3) | `npm i` clean |
| 0.2 | `vite.config.js` (~152-163) | Add `@vitejs/plugin-react` to renderer `plugins`; encode the Spike-C Fast-Refresh/CSP decision | `build:vite` |
| 0.3 | `src/renderer/presentation/react/services-provider.tsx` + `react/use-service.ts` | Context wrapping the cradle; `useService<T>(token)` → `container.resolve<T>(token)` | unit test (resolve a known token) |
| 0.4 | `react/hooks/use-event-value.ts` + `use-event-bus.ts` | `useSyncExternalStore` over `@prismgb/events` `subscribe`/`publish` | unit tests (subscribe→emit→state) |
| 0.5 | `src/renderer/presentation/theme/prismgb-preset.ts` | PrimeReact `definePreset()` from `styles/tokens.css` (`--color-primary:#ff0080`, bg `#0f0f1e`, JetBrains Mono); import `primereact/resources` + preset in `index.ts` | visual + `build:vite` |
| 0.6 | `app-bootstrap.ts` | Stand up ONE React root mounting a single PrimeReact island into a spare shell container; **keep `renderAppShell`/`UIController` path intact**; success marker at `:90` must still fire | **`dev:smoke`** (boot+CSP) |
| 0.7 | `tests/unit/renderer/react/portal-harness.test.tsx` | Render a PrimeReact portal widget under RTL+happy-dom; assert queryable (Stage-0 **gate**, not assumption) | `test:run` |

**Stage 0 gate:** `dev:smoke` green (boot under dev Fast-Refresh CSP) **and** the portal probe green. If either fails, resolve per §2 FAIL handling before any Stage-1 work.

### Stage 1 — Leaf atoms (LOW-MED · parallelizable, Coder/sonnet, max 3-4 agents, non-overlapping files)
Prove the island pattern on stateless/near-stateless atoms. Each: port to `.tsx`, mount as island, delete legacy `.component.ts` + catalog entry + bridge wiring, land tests — all one commit.
| # | Legacy file | LOC | → PrimeReact | Notes |
|--:|-------------|----:|--------------|-------|
| 1.1 | `features/toolbar/cinematic-toggle.component.ts` | 89 | `InputSwitch` | publishes `UI.CINEMATIC_TOGGLE_REQUESTED`, subscribes `SETTINGS.CINEMATIC_MODE_CHANGED` (`cinematic-toggle.component.ts:53-62`) → `useEventBus` + `useEventValue` |
| 1.2 | `shared/device-status.component.ts` | 97 | `Badge`/`Tag` | subscribes `UI.DEVICE_STATUS`/`OVERLAY_VISIBLE`; catalog root `deviceStatusComponent` |
| 1.3 | `shared/status-notification.component.ts` | 31 | `role="status"` live region (NOT `Toast` — keep the live-region UX per Part IV §two-honest-gaps) | catalog root `statusNotificationComponent` |
| 1.4 | `features/transcode/transcode-toast.component.ts` | 129 | `Toast` | catalog root `transcodeToastComponent`; retire `bridges/transcode-ui.bridge.ts` (94) here, replaced by `useEventBus(TRANSCODE.*)` |

**After Stage 1:** delete the **3** catalog entries that map to Stage-1 atoms — `statusNotificationComponent`, `deviceStatusComponent`, `transcodeToastComponent` — and delete **both** blocks of each: the type-contract `RendererUiComponentCatalog` interface (`ui-component.catalog.ts:55-74`) **and** the factory `rendererUiComponentDefinitionInputsById` (`:152-166`). (`cinematic-toggle` (1.1) has **no** catalog entry; `streamControlsComponent` — `:65-69`/`:158-163` — is a **Stage-2.6** item, so leave it.) Plus `transcode-ui.bridge.ts`. Validate each: `typecheck` · `lint` · `test:run` · **`dev:smoke`** · `coverage:ratchet`.

### Stage 2 — Single-behavior atoms (MED · parallelizable in 2 batches, Coder/sonnet) + the GPU ref boundary
| # | Legacy file | LOC | → PrimeReact | Notes |
|--:|-------------|----:|--------------|-------|
| 2.1 | `features/toolbar/shader-slider-controls.component.ts` | 267 | `Slider orientation="vertical"` ×2 | the byte-identical brightness/volume twin blocks (`:200-214`≡`:235-249`) collapse to two `<Slider>`; the `--fill-percent` thumb-center math is app CSS — re-express in the bespoke sheet or drop if PrimeReact's fill suffices |
| 2.2 | `features/toolbar/shader-preset-list.component.ts` | 183 | `ListBox` | replaces `listbox-dropdown.class` consumer |
| 2.3 | `features/notes/game-autocomplete.component.ts` | 175 | `AutoComplete` | replaces `combobox-listbox.class` consumer |
| 2.4 | `features/notes/game-filter.component.ts` | 191 | `Dropdown`/`MultiSelect` | replaces `listbox-dropdown`/`listbox.utils` consumer |
| 2.5 | `features/toolbar/shader-selector.component.ts` | 156 | `Menu`/`Select` | catalog root `shaderSelectorComponent` shell (its children 2.1-2.2 land first) |
| **2.6** | **GPU ref boundary (guarded)** | ~5-10 | `<canvas ref>` / `<video ref>` | the `streamControlsComponent` / `stream-viewer` port: a ref hands the element to `streamingViewService.setCanvas()` (`streaming-view.service.ts:122`); the pipeline consumes it via `gpuWorkerManager.initialize(canvasElement, …)` (`gpu-worker-manager.ts:90`) / `gpuRenderLoop.start({videoElement})`, all behind the streaming orchestrator. **`infrastructure/rendering` is NOT edited.** dev:smoke must still show a rendered stream. |

**After Stage 2:** the ARIA-primitive consumers are gone (`grep` confirmed exactly 5: settings-menu, shader-selector, game-filter, notes-panel-layout, game-autocomplete) — but do **not** delete the primitives yet (settings-menu/notes-panel still consume them until Stage 3). Validate as Stage 1.

### Stage 3 — Composites LAST (HIGH · sequential, by ME — behavioral, many dependents)
| # | Legacy file(s) | LOC | → PrimeReact | Notes |
|--:|----------------|----:|--------------|-------|
| 3.1 | `features/settings/settings-menu.component.ts` (+`.template.ts`) | 397+155 | `OverlayPanel` (non-modal anchored popover — NOT `Dialog`, per Part IV §two-honest-gaps) + `Select`×N + `Checkbox` | catalog root `settingsMenuComponent`; embeds 3.2 |
| 3.2 | `features/updates/update-section.component.ts` | 410 | `Panel` + `ProgressBar` | the 6-site `UpdateState` dispatch (`update-state-descriptor-table` ⊘P4) becomes state→JSX |
| 3.3 | `features/notes/notes-panel.component.ts` (+layout/list-view/editor/search) | 470 (+135+229+269+92) | `Splitter`+`SplitterPanel` + `VirtualScroller` | catalog root `notesPanelComponent`; the `notes-list-view` `innerHTML.map().join('')` repeater → `VirtualScroller` |
| 3.4 | `features/notes/notes-resize-handler.component.ts` | 250 | `Splitter` — **MAY-RETAIN-BESPOKE** | **verify `Splitter` models collapse-toggle + width-persist (`--notes-list-width` rAF) before claiming 250→15.** If it cannot, keep a thin bespoke drag (Part IV: splitter is "wrong shape"). Spike this sub-task in a scratch branch first. |
| 3.5 | `application/orchestrators/ui-setup.orchestrator.ts` | 233 | — (logic → React `App`) | Migrate the `data-action` delegation + `UIController.toggle{SettingsMenu,ShaderSelector,NotesPanel}` routing (`:99-212`) into the React `App`'s open/close state + toolbar `onClick` handlers (the composites 3.1-3.3 now own their own visibility). After this the orchestrator has no live consumer — it (and its `uiController` token) is dropped in Stage 4. |
| 3.6 | `app-bootstrap.ts`, `shell/`, `react/app.tsx` | — | **Flip to a single React-owned root.** Replace `renderAppShell` + `_initializeUI`/`_registerUIComponents`/`_initializeUIEventBridge` (`:52-63,121-167`) with `createRoot(appContainer).render(<ServicesProvider><App/></ServicesProvider>)`. **Preserve the `orchestrator.start()` success-marker log at `:90`.** | **`dev:smoke`** is decisive here |

**After Stage 3:** every component is React; the legacy mount path is gone. Validate `typecheck` · `lint` · `test:run` · `build:vite` · **`dev:smoke`** · `coverage:ratchet`.

### Stage 4 — Delete the dead substrate (LOW-MED · sequential, by ME — verify zero consumers first)
With no consumers remaining (`grep -rl` each before deletion):
- ARIA primitives: `disclosure.class.ts`, `listbox-dropdown.class.ts`, `combobox-listbox.class.ts`, `listbox.utils.ts` (981).
- Substrate: `presentation-component.base.ts`, `template-ref.utils.ts`, `dom-bindings.utils.ts`, `template-dom.contract.ts`, `ui.controller.ts`, `component.registry.ts`, `ui-component.catalog.ts` (1,131).
- `bridges/ui-event.bridge.ts` + `capture-ui.bridge.ts` (residual); `effects/` 7 files + `activity-auto-hide.controller.ts` (replaced by `react-idle-timer` + hooks).
- `config/` (css-classes/dom-selectors), `icons/icon.utils.ts`, dead `lib/`, the per-feature `styles/**` CSS replaced by the theme preset.
- **Drop `application/orchestrators/ui-setup.orchestrator.ts`** (dead after Stage 3.5's routing migration) and remove the `uiController` registration. **Order-aware (P2 coordination):** if P2 has **not** landed, remove the `uiController` external token (`external-tokens.ts:6`) + the `asValue('uiController')` registration (`app-bootstrap.ts:144-146`); **if P2 has landed**, `external-tokens.ts` is deleted but `uiController` is still registered at runtime via `register({ uiController: asValue(...) })` in `app-bootstrap.ts:145` (it is bootstrap-created, not in `registry.ts`) — remove **that** registration. **GATED (carried caveat):** `uiController` is still consumed by two **untouched** `infrastructure/services` — `streaming/streaming-view.service.ts` (`:40,90,127`) and `settings/settings-presentation-mode.service.ts` (`:57-93`); the token cannot be removed until those delegations are re-homed onto the React canvas-ref/state path (or a thin retained shim). Before the drop, `grep -rn uiController src/` must show **no substrate consumers** and the two infra consumers **explicitly accounted for** — not a blind grep-clean claim.
- **Re-home or drop `application/orchestrators/performance/performance-animation.orchestrator.ts`** alongside the `effects/body-class.class` deletion: its body-class writes move onto the hook/CSS replacement, or the orchestrator is dropped. Remove the `bodyClassManager` DI token — **order-aware (P2):** if P2 has **not** landed it is a `@Service` token (deleting `body-class.class.ts` + regenerating `di.generated.ts` removes it); **if P2 has landed** it is an awilix entry in `registry.ts` — remove it there. (This applies to **every** presentation DI token this stage removes — see the overview's general P2↔P4 coordination rule.) Its only non-presentation consumer was this orchestrator, so it drops to zero (grep-clean).
- **Drop the dead `data-ref`/`data-action` template attributes** (e.g. `stream-viewer.template.ts:51`) only after confirming the rendering pipeline reads elements via the React ref, not the attribute.

**After Stage 4:** the rebaseline + waiver (§6/§8). Validate the full gate set.

---

## 6. Gates checklist

Run the full set before pushing each stage (the pre-commit husky hook runs only `test:run`; **the rest are manual** — overview §cross-cutting-conventions):

- [ ] `npm run typecheck` — strict, no-`any`; catches a dropped field/contract.
- [ ] `npm run lint` (eslint **+ `node scripts/check-layer-boundaries.js`**) — the new `react/`, `theme/` files live in `presentation/` (same layer; boundary-clean). **Gotcha (carried from MEMORY layer-boundary note):** a *renamed/moved* file can silently lose its boundary classification — verify the new `.tsx` files are classified, not exempted.
- [ ] `npm run test:run` — the 4-project Vitest run; the rewritten presentation specs land in the `renderer-happy-dom` project (`vitest.config.js:127-145`).
- [ ] `npm run build:vite` — production bundle (no Fast Refresh; isolates bundler CSP path).
- [ ] `npm run dev:smoke` — **the load-bearing gate every stage.** Boots `npm run dev`, waits for `Renderer application started successfully`, fails on renderer/CSP/DI errors. The ONLY automated catch for the `script-src 'self'` no-eval / Fast-Refresh risk.
- [ ] codegen-drift — `pretest` regenerates `di.generated.ts`/`validators.generated.ts`. **Still relevant in P4** unless P2/P3 already landed and deleted the codegen (overview: codegen deletion is a P2+P3 consequence). If P4 runs before P2/P3, keep the codegen green; the `uiController` token removal (Stage 4) must be reflected without a drift error.
- [ ] `npm run coverage:ratchet` — **fires every stage, hard `process.exit(1)`.** `renderer-happy-dom` scope `src/renderer` minimums **85/85/85/72** (`scripts/coverage-thresholds.json:25-37`). During coexistence `src/renderer` GROWS (old+new), so **component tests must land in the same commit as the component** or the aggregate dips. The end-of-phase rebaseline (denominator reshaped 8,052→~2,000 TS) goes through **`scripts/coverage-waivers.json`** (time-boxed, ADR-0001) + an ADR note — **never a silent minimum edit**; `coverage:ratchet --check-monotonic --previous <prior thresholds>` hard-fails an ungoverned drop (`coverage-ratchet.js:529-574`) and a lapsed waiver also hard-fails (`:587-592`).

---

## 7. Rollback

- **Branch per phase** off `refactor/codebase_reduction` (or `main` per the AGY launcher), one PR, squash-merged after gates. Pre-merge, the whole phase reverts by dropping the branch.
- **Staged commits are the rollback granularity.** Each stage is its own commit(s) and is independently green (gates pass). To roll back, `git revert` the offending stage's commit or `git reset --hard` to the last green stage tag. Because Stages 0-2 keep the legacy path alive, reverting a single ported atom restores its `*.component.ts` + catalog entry from git with no orphan.
- **Tag before Stage 3** (the React-root flip) — the highest-risk, least-reversible step. If the flip regresses `dev:smoke`, reset to the tag; the island model still works.
- **Config/data to restore on revert:** `package.json` + lockfile (remove the React/PrimeReact deps), `vite.config.js` (remove `@vitejs/plugin-react` + any dev-CSP change), `scripts/coverage-thresholds.json` + `scripts/coverage-waivers.json` (restore prior minimums/waivers), `index.ts` (restore the legacy CSS imports if the theme preset replaced them).
- **The rendering pipeline never changed** (hard boundary), so a UI rollback cannot regress GPU/stream behavior.

---

## 8. Test plan

- **Deleted:** the ~9,064-LOC presentation suite is **re-authored, not net-deleted** — each ported component's legacy spec is replaced by an `@testing-library/react` spec in the **same commit** (coexistence forbids deferral — §6). Tests for deleted substrate (registry/controller/bridge/primitive specs) are removed in Stage 4 alongside their source.
- **Added/changed:** `react/` provider+hook unit tests (Stage 0); per-component RTL specs (Stages 1-3) using `@testing-library/react` + `user-event`, querying by role/ARIA (PrimeReact emits real ARIA, so the existing `testIdAttribute`+semantic-query convention in `tests/testing-library.setup.js` carries over). Portal widgets (`Toast`/`OverlayPanel`/`Splitter`) need the Stage-0 portal-harness decision (happy-dom, or jsdom/browser-mode if the probe fails).
- **Coverage-scope impact:** the `renderer-happy-dom` denominator (`src/renderer`) is reshaped — ~6,000 presentation TS lines removed, ~2,000 JSX added; infra/application coverage (untouched) dominates the aggregate but the presentation slice changes character (JSX vs imperative DOM). **Rebaseline once at end-of-phase** via `coverage-waivers.json` + ADR; intermediate stages must hold ≥ current minimums (land tests in-commit). This is the **ADR-style ratchet rebaseline the overview mandates for P4** (overview §coverage).
- **dev:smoke expectation:** unchanged marker `Renderer application started successfully` (`app-bootstrap.ts:90`) at every stage; Stage 2.6 additionally requires a visibly rendered stream (the GPU ref handoff works); Stage 3.6 (root flip) is the decisive dev:smoke run.
- **Not in scope:** `tests/e2e/**` (Playwright, separate) and the GPU/rendering/streaming unit suites (untouched boundary) — they must stay green as a regression guard, not be rewritten.

---

## 9. Definition of done

1. Spike-C passed (or its graduated mitigation applied) and recorded in the Stage-0 commit.
2. All 29 `PresentationComponent` subclasses + the 7 catalog roots are ported to React/PrimeReact; the imperative `renderAppShell`/`UIController`/`ComponentRegistry`/`UIEventBridge`/`effects` substrate is deleted with zero remaining consumers (`grep` clean). `ui-setup.orchestrator.ts`'s action-routing is migrated into the React `App` and the orchestrator dropped; `performance-animation.orchestrator.ts`'s `bodyClassManager` dep is re-homed or dropped and the `bodyClassManager` token removed (grep clean). The `uiController` token is removed **only after** its two out-of-phase consumers (`streaming-view.service`, `settings-presentation-mode.service`) are re-homed off it — otherwise that drop is explicitly deferred with the carried caveat (§4 / Stage 4), **never** silently claimed grep-clean.
3. Presentation TS is ~1,900-2,250 (~72-76% reduction); CSS is the theme preset + bespoke-effects sheet (~250-400, ~92-95% reduction).
4. The GPU/WebGPU/canvas/worker rendering pipeline is byte-unchanged; its presentation touchpoint is a ref (~5-10 LOC); the stream renders under `dev:smoke`.
5. Full gate set green: `typecheck` · `lint`+`check-layer-boundaries` · `test:run` · `build:vite` · `dev:smoke` · codegen-drift (if codegen still present) · `coverage:ratchet` (rebaselined via an ADR-0001 time-boxed waiver, monotonic check passing).
6. `notes-resize-handler` resolved one way or the other — `Splitter` if it models collapse+persist, else a documented thin bespoke retainer (no silent 250→15 claim).
7. Commits conventional, subject ≤100 chars, **no AI/tool attribution**, no `--no-verify`.

---

## 10. Fallback (if Spike-C fails — overview-named)

**Part IV: Solid + Ark UI/Zag.js + Floating UI, light-DOM headless.** Taken only if the wholesale React bet does not boot under the production CSP (or dev Fast-Refresh cannot be made CSP-safe). It is the *constrained* answer: a signals+JSX framework deletes the binding/lifecycle substrate and a **headless** state-machine library deletes the hand-rolled ARIA, while **rendering into your own markup with your own classes — so all 5,271 CSS lines survive untouched** and the test-suite blast is smaller.

- **Deletes the same ~981 ARIA LOC** (disclosure/listbox/combobox/listbox.utils → Ark/Zag + Floating UI) and the ~425-LOC binding slice (`presentation-component.base`/`template-ref`/`dom-bindings`/`template-dom`), but **keeps the CSS** and re-authors the 29 components at **−40-60%** rather than −72-76%.
- **Same island/DI model** (light-DOM islands, DI via context) — so Stages 0-4 above transpose directly; only the library calls change (`InputSwitch`→Ark Switch, `Slider`→Ark Slider, `Toast`→Ark Toast, `Splitter`→keep bespoke since Zag Splitter is the wrong shape).
- Net: ~−1,500-2,200 of 8,052 TS, CSS untouched, +9,064-LOC test rework (smaller than the React path's full rewrite).
- The MUI and Vue+PrimeVue **alternates** (overview §Parts IV/V) are *not* fallbacks — they are same-phase owner choices at Spike-C; only Solid+Zag is the fallback for a failed wholesale bet.
