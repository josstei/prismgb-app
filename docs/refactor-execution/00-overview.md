# Refactor Execution Plan — Overview, Scope Resolution & Spike Gates

> **This is the spine.** It resolves the options catalogue (`docs/refactor-aggressive-reduction-options.md`, audited clean over 4 rounds) into a coherent, non-self-contradictory execution program: which option lands in which phase, which are dropped because a framework phase supersedes them, and which are rejected. Every later phase doc inherits its scope and its honest caveats from here.

## The end-state this program executes

The owner chose the **maximal** end-state, repeatedly and with full information: framework adoption + the device collapse + the wholesale UI rewrite. So "all scope" = the maximal recommended path, **not** "execute every option." That distinction is load-bearing because the catalogue contains **mutually-exclusive options** and **seams in code that a framework phase deletes**. Executing both a seam and the rewrite that deletes its subsystem is wasted work; the resolution below does each piece exactly once.

**Target end-state:** Awilix DI · electron-trpc + Zod IPC · React 19 + PrimeReact UI · collapsed single-device domain · the codegen pipeline deleted as a consequence · surviving-code seams applied only where the code survives.

## ⚠️ Load-bearing trades — named once, here, for confirmation before execution

These are the honest caveats the options doc earned through its audit. The execution format must not launder them into unqualified confidence. **Confirm these are acceptable before starting the gated phases:**

1. **Awilix (Phase 2) discards the Increment-A codegen-drift guarantee.** The `@Service` array is today the single source of truth for DI deps, and `generate-di.js` **hard-errors at build** on an undeclared/circular dep — a correctness mechanism the team *deliberately built and this session audited*. Awilix moves that validation to runtime (`resolve-all` test + `dev:smoke`), and the un-constructable GPU/worker token slice loses static dep-validation entirely. This is a deliberate trade of a just-built guarantee for ~−600 LOC, not a free win.
2. **⚠️ RESOLVED BY SPIKE-B (2026-06-28): electron-trpc is viable ONLY pinned to tRPC 10.** Trade (c) below ("electron-trpc is stale") was the deciding risk. Spike-B found electron-trpc 0.7.1 **cannot route to a `@trpc 11` router** (its `te()` checks tRPC-10's `_def['subscription']` boolean; tRPC 11 moved this to `_def.type` → every procedure NOT_FOUND), plus 4 lesser ESM/bundling/transformer breaks — but on its **native `@trpc 10.45.4`** pairing it **works end-to-end** (retest: subscriptions delivered with just the 2 build shims). So the wholesale swap is **achievable but only by pinning the whole IPC boundary to tRPC 10 + electron-trpc 0.7.1 + a patch-package shim** — a *frozen-major, unmaintained-package* trade for ~−1,300-1,500 LOC. **Owner decides (A) take it, or (B) §10 keep-and-simplify (~−58 LOC, zero risk).** The `1.0-alpha`/`@egoist/tipc` `@trpc 11` fallbacks are likewise stale. The trades a–e below apply to path (A). **electron-trpc (Phase 3) carries several load-bearing trades** (03 §1 enumerates five, **a–e**; (d) is the decision to **keep `worker-protocol.config.ts` guards as-is, not Zod** — carried in the scope-resolution table). The ones to confirm before execution: (a) it **weakens the `eventChannels`→`@prismgb/events` parity guard** — the manifest cross-validates that mapping today; tRPC does not model it, so it becomes hand-maintained. (b) **`.output(z)` is NOT automatic** — tRPC validates *inputs* by default but not *outputs*; every subscription (and the gpu/loginItem queries) must carry an explicit `.output(z…)` or the payload defense-in-depth guard is silently dropped. (c) **`electron-trpc` was last published 2024-12-07 (~18 months stale)** with only a `1.0.0-alpha` ahead of `0.7.1` — a maintenance risk on the app's entire renderer↔main boundary; verify it works against `@trpc 11` before committing. (Plus the narrower trade (e) in 03: deleting `inline.preload-api.ts` drops the gpu/loginItem graceful-fallback, which must be re-established via `.output(z)` + a consumer failure→fallback map.)
3. **The UI rewrite (Phase 4) is a ground-up replacement of 8,052 TS + 5,271 CSS + a rewrite of the ~9,064-LOC presentation test suite.** Months of work; the largest single line item. It is the owner's explicit choice under "nothing is off limits."

## Phase classification — readiness is NOT uniform

Per the options doc's own tags, only Phase 1 is unconditionally ready. Phases 2-4 are `needs-spike` *by definition* — their plan body assumes the spike passes, and each carries a **real fallback**.

| Phase | Doc | Readiness | Gate before execution |
|------:|-----|-----------|------------------------|
| **1 — Device collapse** | `01-device.md` | **UNCONDITIONAL — execute now** | none (read-only dry-run done) |
| **2 — DI → Awilix** | `02-di-awilix.md` | **✅ Spike-A PASSED (2026-06-28) — fully cleared** | Bundling sub-gate passed (prior session) + runtime sub-gate now passed: a PROXY-mode awilix cradle resolved an `asFunction→asClass→asClass+asValue` chain at runtime in the Electron renderer (`[SPIKE-A-OK]`), `dev:smoke` booted clean, no DI-resolution error. |
| **3 — IPC → electron-trpc + Zod** | `03-ipc-trpc-zod.md` | **⚠️ Spike-B (2026-06-28): owner choice — (A) tRPC-10-pinned swap OR (B) keep-and-simplify** | electron-trpc 0.7.1 is **✗ on `@trpc 11`** (5 breaks; fatal `_def` routing) but **✅ on `@trpc 10.45.4`** (its native pairing — retest delivered subscriptions end-to-end with 2 build shims). So the full **~−1,300-1,500 LOC** swap is achievable **(A)** only by pinning the entire IPC boundary to **tRPC 10 (frozen major) + electron-trpc 0.7.1 (unmaintained) + a patch-package shim** — a stale-deps-for-reduction trade matching "nothing off limits". **(B)** keep-and-simplify = **~−58 LOC**, zero risk. tRPC-11-via-maintained-layer = not available off-the-shelf. |
| **4 — UI → React + PrimeReact** | `04-ui-react-primereact.md` | **✅ Spike-C PASSED (2026-06-28) — cleared for execution** | PrimeReact island mounts + boots under `script-src 'self'` (Fast Refresh, **zero** CSP violations — no accommodation needed); RTL portal harness works under happy-dom (no jsdom switch). Pin `@vitejs/plugin-react@^5` (v6 needs Vite 8). |
| **5 — Surviving seams + cleanup** | `05-surviving-seams-cleanup.md` | **Mostly unconditional** (some items depend on P2/P3 landing) | none for the independent seams; the codegen-cleanup items depend on P2+P3 |

## Spike results (run this session) + the gate spikes (run in a worktree before each gated phase)

**Cleared (cheap, no-install, run now):**
- **Spike-A bundling sub-gate — PASSED EMPIRICALLY (this session).** awilix 13.0.5 exposes `exports["."].browser.import = "./lib/awilix.browser.mjs"` (the build *without* the Node `fs`/`glob` `loadModules`). An isolated Vite build under the renderer's `browser` resolve conditions bundled the **exact PROXY-mode pattern the app hand-rolled** — `createContainer({injectionMode: PROXY})` + `asClass`/`asFunction`/`asValue` + `c.cradle.deviceService` — **clean in 39 ms, no Node-polyfill error** (24 kB / 6 kB gz). The deciding "does awilix bundle in the Vite renderer?" risk is **cleared with evidence**, not inference. The residual runtime `dev:smoke` boot of the wired app has **now also passed** (2026-06-28) — see the Spike-A gate entry below.
- **Framework versions compatible:** React 19.2 + PrimeReact 10.9.8 (peer allows React 19) ✓; `@trpc 11.18` needs TS ≥5.7.2 and the project is on **TS 5.9.3** ✓; Electron **41.6.1** > electron-trpc's peer `>19` ✓; zod 4.4 available.
- **Device YAGNI confirmed:** exactly **1** `DeviceProfile` subclass (`DeviceChromaticProfile`) and **1** manifest entry (`chromatic-mod-retro`). Phase 1 needs no spike.
- **`infer-service-deps` (Dim 2) spike is MOOT** — it is dropped-as-superseded by Awilix (which removes `@Service` entirely).

**Gate spikes (precisely specified — run each in an isolated git worktree so the clean branch's `package.json`/lockfile/`node_modules` are untouched):**
- **Spike-A (Awilix / Phase 2) — RUN 2026-06-28: ✅ PASSED (both sub-gates).** Bundling sub-gate cleared earlier (awilix 13.0.5 browser build, 39 ms). **Residual runtime sub-gate now run:** in a worktree (`npm i awilix`), a PROXY-mode `createContainer` registered `asClass`(logger, serviceA)/`asValue`(config)/`asFunction`(serviceB) and resolved the full chain via `container.cradle.spikeServiceB.status()` at renderer boot. `build:vite` clean (no fs/glob/Node-polyfill); `dev:smoke` exit 0 with `[SPIKE-A-OK] awilix PROXY cradle resolved at runtime: spikeB -> SpikeServiceA(awilix-ok)` then "Renderer application started successfully". **→ Phase 2's deciding gate is fully cleared; the `codegen-emitted-deplist-base-pull` fallback is not needed.**
- **Spike-B (electron-trpc / Phase 3) — RUN 2026-06-28: ✗ on tRPC 11 / ✅ on tRPC 10 (→ owner choice).** Installed `@trpc/server`/`@trpc/client` **11.18.0** + `electron-trpc` **0.7.1** + `zod` **4.4.3** in a worktree; wired `transcode.onProgress` as a tRPC `observable` subscription (main `createIPCHandler` + inline preload bridge + renderer `ipcLink`) under `sandbox:true`. **Gate-0 (peer-range) PASSED but MISLEADING** (`@trpc/* >10.0.0` admits 11, but the runtime is hard-bound to tRPC-10 internals). **build:vite PASSED**; **dev:smoke boots only after 2 source shims**; **transport FAILED.** Five confirmed `electron-trpc@0.7.1 ✗ @trpc 11` breaks: (1) no `./preload` export — `exposeElectronTRPC` is in `/main`; (2) `main.mjs` `import {ipcMain,contextBridge,ipcRenderer} from 'electron'` breaks ESM Electron main; (3) the same module is unbundlable into the IIFE preload (emits a raw `import`); (4) `ipcLink` reads `runtime.transformer.serialize` — removed in `@trpc/client 11`; (5) **FATAL/unpatchable-without-fork:** the main `te()` resolver routes via tRPC-10's boolean `procedure._def['subscription']` (now `undefined`; tRPC 11 uses `_def.type==='subscription'`) → **every** procedure returns NOT_FOUND. Verified directly: `proc._def.type==="subscription"`, `proc._def['subscription']===undefined`. **The two `@trpc 11` fallbacks are also stale:** `electron-trpc@1.0.0-alpha.0` = same-day publish (2024-12-07), same peers → not a tRPC-11 fix; `@egoist/tipc@0.3.2` last touched 2024-07-18, `@tanstack/react-query` peer. **★ RETEST on the NATIVE pairing — `@trpc/* 10.45.4` + `electron-trpc 0.7.1` + `zod 3` (worktree spike-b2): ✅ WORKS END-TO-END.** Breaks #4/#5 are tRPC-10-isms that vanish on tRPC 10; only the 2 version-independent build shims were needed (#2 main.mjs namespace `import`, #3 inline preload bridge — NOT the transformer/routing patches). The main observable subscribed (`[SPIKE-B2-MAIN-SUB]`) and the renderer received `{"percent":50,"tick":1..}` repeatedly under `sandbox:true` + `script-src 'self'`, 0 errors/CSP. **→ Phase 3 = owner choice:** **(A)** the full **~−1,300-1,500 LOC** swap pinned to **tRPC 10** (frozen major; electron-trpc 0.7.1 unmaintained; #2 needs `patch-package`) — the maximal-reduction-with-accepted-stale-deps path; **(B)** §10 keep-and-simplify (~−58 LOC, zero risk); **(C)** tRPC-11-via-maintained-layer = needs a future spike (none off-the-shelf today).
- **Spike-C (PrimeReact / Phase 4) — RUN 2026-06-28: ✅ PASSED (all four criteria).** Installed `react`/`react-dom` **19.2.7** + `primereact` **10.9.8** + `primeicons`; dev `@vitejs/plugin-react@5` + `@testing-library/react` + `user-event`; added `react()` to the renderer vite plugins, mounted a PrimeReact vertical `Slider` island via `createRoot` (flag ON, legacy shell intact), added an RTL `Dialog`-portal test. **build:vite PASS** (renderer JS 654→890 kB, CSS 83→265 kB; no eval/CSP/polyfill). **dev:smoke PASS — the deciding line:** the island mounts + boots under `script-src 'self'` with **Fast Refresh**, **zero** CSP violations (the anticipated `fastRefresh:false`/relaxed-dev-CSP accommodation was **not needed**). **Portal harness PASS** under happy-dom (RTL queries the portal content; **no jsdom switch needed**). One trivial Phase-4 note: **pin `@vitejs/plugin-react@^5`** — v6 peers `vite@^8` and rejects the project's Vite 7. **→ Phase 4 cleared (boot/harness de-risked; the rewrite labor remains the owner's choice). No fallback to Solid+Zag.**

## Scope-resolution table — every option in the catalogue, assigned exactly once

Legend: **→Pn** = executed in Phase n · **⊘Pn** = dropped, superseded by Phase n (the framework rewrite deletes/replaces this code, so doing the seam first is throwaway) · **✗** = rejected in the options doc (not executed).

### Part I/II — in-architecture seams
| Option | Resolution | Why |
|--------|-----------|-----|
| device Tier-1 (`dual-registry-merge`, `registry-roundtrip-elimination`, `detection-path-unification`, `profile-base-deadcode`, `config-triple-wrap-flatten`) | **→P1** | survives all framework phases |
| device Tier-2 (`profile-framework-to-manifest-descriptor`) | **→P1** | owner chose maximal; collapse the 1-device framework |
| `ipc-error-envelope-mapper-factory` / `ipc-failure-envelope-seam` | **⊘P3** | tRPC rewrites all handlers; the envelope folds into the router |
| `dead-ipc-payload-aliases` | **→P3** | a clean delete done as part of the IPC package rewrite |
| `registry-interface-dedup` / `dedupe-main-service-structural-contracts` (b) | **⊘P3** | the handler interfaces are replaced by tRPC procedure types |
| `ipc-result-envelope-engine` / `activate-dormant-responsemode-success-envelope` | **⊘P3** | the responseMode machinery is deleted with the manifest |
| `container-engine-primitive` | **⊘P2** | Awilix *is* the container engine |
| `validators-library-extraction` | **⊘P3** | `validators.generated.ts` is deleted (Zod replaces it) |
| `single-flight-primitive` | **→P5** | the 4 consumer *sites* (across 3 services — `device-media` holds two) survive |
| `disposablebag-keyed-timeout` | **→P5** | `DisposableBag` survives (core primitive) |
| `disposable-host-base` | **→P5**, sequenced after **P2** | touches the base classes Awilix also edits |
| `recording-transient-state`, `gpu` mining basket (`cleanup-dispose-dedup`, `release-and-clear-seam`, `transition-template`, `recreate-canvas-template`, `gpu-renderer-factory`, `message-bag-consolidation`, etc.) | **→P5** | GPU/rendering services survive (physics, not UI) |
| `elements-whitelist-spread`, `update-state-descriptor-table`, `vertical-slider-control-primitive`, `panel-hidden-visibility-method`, `disclosure-host-base-component`, `presentation-dispose-template-method`, `managed-element-binding-seam`, `listbox-option-navigation-primitive`, `managed-child-component-set`, `notes-subscription-keyed-helper`, all presentation/CSS seams | **⊘P4** | the entire presentation layer is replaced |
| `import-canonical-core-contracts`, `shared-presentation-dom-contracts` | **⊘P4** | presentation type-shims deleted with the layer |
| `core-minimal-contract-consolidation` | **→P5**, sequenced after **P2** | `service.base.ts` survives (its DI part changes under Awilix) |
| `transcode-format-set-single-source` | **→P3** | the ipc↔transcode type leg is part of the IPC rewrite |
| `cache-into-performancecache` | **→P5** | core primitives survive |
| `delete-all-unused-primitives` | **✗ (conflicting)** | future-first; 0 coverage-src; not executed (kept as deliberate seams) — but note the **6** unadopted primitives `Pipeline`/`Store`/`Validator`/`Bus`/`Factory`/`Registry` stay unconsumed (`Cache` is the one adopted, in P5) |

> **⚠️ Spike-B ripple (2026-06-28) — the four `⊘P3` IPC rows above are CONDITIONAL on the Phase-3 path:** `ipc-error-envelope-mapper-factory`/`ipc-failure-envelope-seam`, `registry-interface-dedup`/`dedupe-main-service-structural-contracts (b)`, `ipc-result-envelope-engine`/`activate-dormant-responsemode-success-envelope`, and `validators-library-extraction` are superseded **only if Phase 3 takes path (A) the tRPC swap** (the rewrite deletes the code they touch). **If Phase 3 takes path (B) keep-and-simplify, they REVERT to available in-architecture seams** — and `ipc-error-envelope-mapper-factory` (~−50) is in fact one of the wins path (B) explicitly harvests (§10). Resolve their final tag when the owner picks the Phase-3 path.

### Part I DI field-mirroring mechanisms (mutually exclusive — Awilix wins)
| Option | Resolution |
|--------|-----------|
| `codegen-emitted-deplist-base-pull` | **Phase 2 FALLBACK** (if Spike-A fails) |
| `typed-dependency-base-seam`, `narrow-object-construction-codegen`, `declaration-merged-generated-interface`, `service-decorator-runtime-deps-attach`, `declare-only-naive-codemod`, `declare-injection-seam` | **⊘P2 / ✗** — Awilix removes the cradle + base `Object.assign` + `@Service` entirely, mooting all of them; the rejected ones stay rejected |
| `infer-service-deps-from-constructor-type` (Dim 2) | **⊘P2** — Awilix removes `@Service`, so there is no dependency array to infer |

### Part III framework swaps
| Option | Resolution |
|--------|-----------|
| `awilix-di` (Dim 14) | **→P2** |
| `tsyringe-di`, `inversify-di` | **✗ (rejected)** |
| `ipc-trpc` (Dim 15) | **→P3 option (A), but ONLY pinned to `@trpc 10`.** Spike-B (2026-06-28): electron-trpc 0.7.1 is ✗ on `@trpc 11` (fatal `_def` routing break) yet ✅ on `@trpc 10.45.4` (native pairing, retest delivered end-to-end). Full ~−1,300-1,500 LOC, **cost = frozen tRPC-10 + unmaintained electron-trpc + patch-package shim**. |
| `ipc-tipc` | **Stale (last pub 2024-07-18, react-query-coupled) — would need its own spike; not a clean `@trpc 11` substitute** |
| `ipc-keep-simplify` | **→P3 option (B) — the conservative floor.** Retain manifest/cradle; harvest only the in-arch wins (`dead-ipc-payload-aliases` −8, `transcode-format-set-single-source`, `ipc-error-envelope-mapper-factory` ~−50). ~−58 LOC, zero new deps. Chosen if the owner rejects the tRPC-10 staleness. |
| Validation→Zod (Dim 17) | **→P3** (rides the IPC swap; the `.input/.output(z)` IPC schemas + the `config-loader` joi→Zod fold). **settings-coercion→Zod is optional/deferred** — the options doc tags it lean-keep (the `SettingsDefinitions` registry is more philosophy-aligned than static schemas); it is **not** an executed P3 task. |
| `worker-protocol.config.ts` guards | **→P5 (keep, not Zod)** — the doc's `keep` verdict (transferables, precise typing); only extract shared predicate helpers |
| State store / XState (Dim 17) | **✗ (rejected)** except `streaming.service` FSM = **deferred needs-spike**, not in this program |
| device-domain (Dim 18) | **→P1** |
| `meta-codegen-elimination` (Dim 19) | **→P2+P3 consequence** — `generate-di.js`+`di.generated.ts` deleted in **P2**; `generate-contracts.js`+`validators.generated.ts`+`preload-api.d.ts` deleted in **P3** (each phase removes its own generator + its `pretest` reference; **P2 also removes its two explicit `knip.json` entries — `di.generated.ts`/`external-tokens.ts`, lines 10-11; P3 has no explicit knip entry, its generated files match knip's `**/*.generated.ts` glob**). **P5 only *verifies*** the codegen is fully gone (no `pretest`/`knip`/vite stragglers) and drops the dangling `generate:contracts` npm alias (`:54`) + vestigial turbo — it is a sweep, not a primary deleter |
| `reactivity-rxjs-signals` (Dim 19) | **deferred — owner toggle, NOT executed in P5** — if taken it becomes its own spike-gated phase (see 05 Stage F), not a P5 sweep; warranted only if it goes codebase-wide, else flagged conflicting-with-consistency |
| `build-turbo-nx` (Dim 19) | **→P5** — the only move is *dropping* vestigial turbo |

### Parts IV/V — UI
| Option | Resolution |
|--------|-----------|
| Part V `React + PrimeReact` wholesale | **→P4** |
| Part V `React + MUI` | **P4 alternate** (ecosystem-first; same phase, owner picks at Spike-C) |
| Part V `Vue + PrimeVue` | **P4 alternate** (if the team prefers Vue) |
| Part IV `Solid + Zag` (light-DOM headless) | **P4 FALLBACK** (the constrained answer — if the wholesale rewrite is rejected at Spike-C) |
| Part IV/V Shoelace/Material/etc. | **✗ (rejected)** |

## Real inter-phase dependencies (only the true ones — do NOT invent constraints)

The event bus (`@prismgb/events`) and the services/orchestrators are **framework-agnostic TypeScript**. Therefore:
- **P1 (device)** is fully independent — execute any time, first recommended.
- **P2 (DI), P3 (IPC), P4 (UI) are mutually independent** — none blocks another; they can run in parallel or any order. (P4's UI consumes services via DI, but through the bus/context, not the container internals, so it does not require P2.) **Shared-wiring coordination points** (handled by order-aware caveats inside the phase docs, not hard blockers): **(a) P2↔P4 DI-token relocation (general rule).** Every presentation DI token P4 removes is a P2-coordination point — *pre-P2* it is a `@Service` decorator (its deletion + the `di.generated.ts` regeneration removes it), or the `external-tokens.ts`/runtime-`register` `uiController`; *post-P2* it is an awilix entry in `registry.ts` (or the runtime `register` at `app-bootstrap.ts:145` for `uiController`). **P4 removes each token from whichever shape currently exists.** Named instances: `uiController` (runtime register at `app-bootstrap.ts:145` stays under P2, and its drop is gated on two infra consumers — 04 Stage 4), `bodyClassManager`, `uiComponentRegistry`/`uiEffects`/the bridges, and the 29 presentation component tokens. **(b) `ipcPushBridge` registration** — P3 adds it to the main container's resolve-switch *or*, if P2 landed, to `di-registry.ts` (03 Stage 1 caveat). Each later editor reads the current shape, not a pristine one.
- **P5 dependencies are item-local:** `disposable-host-base` + `core-minimal-contract-consolidation` touch `service.base.ts`/base classes that **P2 also edits** → sequence after P2. The **codegen-script deletion** depends on **P2 (generate-di gone) + P3 (generate-contracts gone)**. The GPU/device/SingleFlight seams are independent.

**Recommended execution order** (by readiness + risk, not forced dependency): **P1 → Spike-A → P2 → Spike-B → P3 → Spike-C → P4 → P5**. P2/P3/P4 may be reordered or parallelized per team capacity since they are independent.

## Cross-cutting conventions (inherited by every phase doc)

- **Branch per phase** off `refactor/codebase_reduction` (or off `main` per the owner's AGY launcher convention); one PR per phase, squash-merged after gates pass.
- **The gate set** every phase must pass before merge: `npm run typecheck` · `npm run lint` (+ `check-layer-boundaries.js`) · `npm run test:run` · `npm run build:vite` · `npm run dev:smoke` · codegen-drift (until the codegen is deleted in P2/P3) · `coverage:ratchet` (monotonic, src/** by scope). The pre-commit husky hook runs only `test:run`; **the other gates must be run manually before pushing.**
- **Commit hygiene:** conventional commits, subject ≤100 chars, **no AI/tool attribution** (no "Generated with…", no "Co-Authored-By"). No `--no-verify`.
- **Coverage:** the ratchet measures `src/**` by scope. Deletions that move covered lines out of `src/**` (into `packages/` or by removing generated files) are largely ratchet-neutral but must be checked per phase; the UI rewrite (P4) materially reshapes the renderer denominator and needs an ADR-style ratchet rebaseline.
- **Each phase doc structure:** Inherited status & caveats · Spike gate (if conditional) · Scope (what this phase does / what it deletes / what it adds) · Current → target state · Ordered task breakdown (file-by-file, risk-tiered, agent allocation per the project methodology) · Gates checklist · Rollback · Test plan · Definition of done · Fallback (for gated phases).
