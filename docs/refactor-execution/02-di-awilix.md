# Phase 2 — DI → Awilix

> Executes options-doc **Dimension 14 (`awilix-di`)**. Replaces the hand-rolled Awilix-clone DI (Proxy `cradle` + the `generate-di.js` codegen + `@Service`) with the real **awilix** library. Inherits scope from `00-overview.md` (§ scope-resolution: `awilix-di → P2`; all Part-I DI field-mirroring options + `infer-service-deps` are **⊘P2 — moot**, because Awilix removes the cradle, the base `Object.assign`, and `@Service` entirely).

## 1. Inherited status & caveats

- **Verdict:** needs-spike → **recommend** once Spike-A passes.
- **⚠️ LOAD-BEARING TRADE — carried forward verbatim, not softened:** Awilix **discards the Increment-A codegen-drift guarantee.** Today the `@Service({ dependencies: [...] })` array is the single source of truth for DI deps and `scripts/generate-di.js` (via `topologicalSort`, `generate-di.js:212-220`) **hard-errors at *build time*** on an undeclared or circular dep — a correctness mechanism the team deliberately built (Increment A) and this session audited. Awilix resolves at runtime, so that validation moves to **a resolve-all test + `dev:smoke`**. Crucially, the un-constructable GPU/worker token slice (already in the coverage-exclude list — `gpuRendererService`, `gpuRenderLoopService`, `gpuFrameBuffer`, `gpuWorkerManager`, the canvas adapters) **cannot be force-resolved in jsdom**, so for that slice the static guarantee is **lost, not merely relocated** — it degrades to real-boot/`dev:smoke` only. This is a deliberate trade of a just-built guarantee for ~−600 LOC. Accept it explicitly before executing.
- **Net:** ~−600 LOC repo-wide; ~−228 coverage-src (`di.generated.ts` 368 → ~140-line registration module). `generate-di.js` (387) is `scripts/` (ratchet-neutral); `di.generated.ts` is a generated artifact (no hand-maintenance lost).

## 2. Spike gate (Spike-A)

**Bundling sub-gate — already PASSED empirically (this session):** awilix `13.0.5` exposes `exports["."].browser.import = "./lib/awilix.browser.mjs"` (the build *without* the Node `fs`/`glob` `loadModules`). An isolated Vite build under the renderer's `browser` resolve conditions bundled the exact PROXY-mode pattern (`createContainer({injectionMode: PROXY})` + `asClass`/`asFunction`/`asValue` + `container.cradle.x`) **clean in 39 ms, no Node-polyfill error** (24 kB / 6 kB gz). The "does awilix bundle in the Vite renderer?" risk is cleared with evidence.

**Remaining runtime sub-gate — run in an isolated git worktree before merging Phase 2:**
```
git worktree add ../prismgb-spikeA HEAD && cd ../prismgb-spikeA
npm i awilix
# wire ONE renderer service (e.g. settingsService) through an Awilix container in a throwaway branch
npm run build:vite && npm run dev:smoke
```
- **PASS:** `build:vite` succeeds and `dev:smoke` prints `Renderer application started successfully` with no DI-resolution error.
- **FAIL → §10 Fallback** (`codegen-emitted-deplist-base-pull`, the in-architecture ~−38 mechanism).
- Clean up: `git worktree remove ../prismgb-spikeA`.

## 3. Scope

**Executes:** the renderer + main DI container swap to awilix.

**DELETES** (verify with `wc -l`):
- `scripts/generate-di.js` (387) — the AST scan + topo-sort + emitter.
- `src/renderer/application/di/di.generated.ts` (368) — the emitted `GeneratedContainer` Proxy-cradle clone.
- `src/renderer/application/di/external-tokens.ts` (6) — `externallyRegisteredTokens` (an `asValue`/runtime `register` of `uiController` in Awilix instead).
- `src/renderer/application/di/manual-providers.ts` (95) — the 9 non-standard providers fold into the awilix registration module as `asFunction((cradle) => …)`; the source module is deleted (not just copied) and its test `tests/unit/renderer/application/di/manual-providers.test.ts` is deleted or folded into the resolve-all test.
- `packages/prismgb-core/src/di/decorators.ts` (23) — the `@Service` marker — and the **56 `@Service(...)` applications** (line-anchored count; the raw `grep '@Service('`=58 double-counts the decorator's own JSDoc `@example` + the `dist/` copy). The 2 real package sites are `performance-cache.utils.ts:145` and `notes.service.ts:32`.
- The `pretest` `generate-di.js` invocation (`package.json:56`) and any codegen-drift assertion; the `diGeneratorPlugin` in `vite.config.js`; the `di.generated` **and** `external-tokens.ts` `knip.json` entries (lines 10-11).
- The dead `Object.assign(this, dependencyMap)` in `service.base.ts:47` and `orchestrator.base.ts:17` (the no-op against the empty-`ownKeys` cradle — see the options-doc headline; safe to remove because nothing populated via it).
- The main `resolve()` switch in `src/main/application/container.ts` (the hand-written cradle Proxy + dispatch).

**ADDS:**
- `awilix` (root dependency).
- `src/renderer/application/di/registry.ts` (~140) — the hand-written renderer registration module (`asClass`/`asFunction`/`asValue`).
- `src/main/application/di-registry.ts` (~40-50) — the main registration module.
- `tests/unit/renderer/application/resolve-all.test.ts` — the resolve-all validation test (the runtime replacement for the deleted build-time guard).

**Does NOT change** (the consumer surface is Awilix-native): `container.resolve<T>(token)`, `container.cradle`, `container.dispose()`, `container.register({ token: asValue(x) })`, and `initializeContainer/getContainer` (`src/renderer/application/container.ts`, `src/main/app-bootstrap.ts`) — all map 1:1 to awilix. **The single exception** is `resetContainer()` at `src/renderer/application/container.ts:50` (`activeContainer.cache.get('appOrchestrator')?.value` → `appOrchestrator.cleanup()`). Do **not** rewrite this to `cradle.appOrchestrator` — `cradle` access *force-constructs* the singleton, so on a teardown where it was never resolved you would build a fresh `AppOrchestrator` just to dispose it (a real test-teardown hazard). Instead, **register `appOrchestrator` with `.disposer(o => o.cleanup?.())`** and let awilix's `container.dispose()` invoke that disposer for the *already-resolved* singleton only — so `resetContainer()` collapses to `await activeContainer.dispose()` and the manual `.cache` fetch is deleted entirely (this also removes the dependency on awilix's internal cache shape, which is not asserted here). `app.orchestrator.ts:49` `super(container.cradle, …)` + the `container.resolve('token')` calls (main `app.orchestrator.ts:51-71`, `main/index.ts:125/160`, renderer `app-bootstrap.ts:65/124-158`) are unchanged — awilix `resolve`/`cradle` provide them.

## 4. Current → target

- **Now:** `@Service`-decorated classes → `generate-di.js` AST-scans them → emits `di.generated.ts` (`GeneratedContainer` with a `cradle` Proxy whose `ownKeys:()=>[]`, a `resolve()` switch of 56 `new X(this.cradle)` cases, a `dispose()` loop). Main: a parallel hand-written `MainServiceContainer` (same cradle Proxy + a 13-case switch). 9 renderer non-standard constructions live in `manual-providers.ts`.
- **Target:** one `awilix` container per process, built by a hand-written registration module: `asClass(X, { lifetime: SINGLETON }).disposer(x => x.dispose?.() ?? x.cleanup?.())` per former `@Service` class (the `disposal: 'dispose'|'cleanup'|'none'` option → the disposer choice), `asFunction(cradle => …)` for the 9 former `manual-providers`, `asValue` for the external `uiController`. Injection stays **PROXY mode** (`new X({ ...deps })` via named cradle destructuring) — identical to today's service constructors, so **zero service-constructor changes**.

## 5. Ordered task breakdown

**Stage 0 — Spike-A runtime sub-gate (HIGH, gating).** Run §2's worktree boot. Proceed only on PASS.

**Stage 1 — Build the registration modules (LOW/MED; additive, nothing deleted yet).**
1. `npm i awilix` (root). Confirm `vite.config.js` renderer resolve picks the browser build (the alias block already maps `@prismgb/*`→src; no change needed — awilix resolves via its own `browser` export).
2. Author `src/renderer/application/di/registry.ts`: a `buildRendererContainer(overrides = {})` that `createContainer({ injectionMode: InjectionMode.PROXY })`, then `.register({ … })` with one entry per current token. Source the token list from the current `di.generated.ts` registrations (the 56 scanned tokens + the 9 manual-providers + `uiController`). Map: scanned `@Service` class → `asClass(Class, { lifetime: Lifetime.SINGLETON }).disposer(…)`; manual-provider → `asFunction((cradle) => <the manual-providers.ts body, cradle in place of resolve>)` — **inline the 9 provider bodies here, then delete the source `manual-providers.ts` (Stage 4)**; `appOrchestrator` → `asClass(...).disposer(o => o.cleanup?.())` (so `dispose()` runs its cleanup — see §3 resetContainer); `uiController` → late runtime `register({ uiController: asValue(...) })` in `app-bootstrap.ts:145` (unchanged from today). Keep a typed `Cradle` interface (replaces the `cradle: any` — *more* typed than today).
3. Author `src/main/application/di-registry.ts`: the **15** main tokens — the 9 standard `new X(this.cradle)` → `asClass`; the 4 non-standard (`eventBus`, `deviceService` with its `profileClasses` Map, `profileRegistry`, `appOrchestrator(this)`) → `asFunction`; **plus the two that are NOT in the 13-case switch and would otherwise be missing — `loggerFactory` (the runtime constructor param, the main analog of renderer `uiController`) → runtime `register({ loggerFactory: asValue(...) })` at `createAppContainer`, and `config` (the inline config object) → `asValue`.** Omitting these two makes every logger-dependent main service fail to resolve → `dev:smoke` fails. **Order-aware (P1 coordination):** this enumeration is the **pre-P1** shape. If P1 has landed, `profileRegistry` is **removed entirely** (not merely collapsed) and `deviceService` becomes `new DeviceService({ eventBus, loggerFactory })` with **no `profileClasses` Map** → register that post-P1 shape (one fewer non-standard token, **14** total); see §6.
- *Validate:* `npm run typecheck` (the modules compile against the real classes).

**Stage 2 — Swap the container shells to awilix (MED; behavioral).**
4. Rewrite `src/renderer/application/container.ts`: `createRendererContainer()` → `buildRendererContainer()`; **rewrite `resetContainer()` to `await activeContainer.dispose()`** — delete the `activeContainer.cache.get('appOrchestrator')?.value` fetch and the manual `isCleanable`/`cleanup()` call; awilix `dispose()` invokes the `appOrchestrator` `.disposer(o => o.cleanup?.())` for the already-resolved singleton only (no force-construction on teardown). Keep `initializeContainer/getContainer/asValue` exports (re-export awilix `asValue` or keep the local one).
5. Rewrite `src/main/application/container.ts` to build the awilix container from `di-registry.ts`; keep the `MainServiceContainer` type alias pointing at the awilix `AwilixContainer<Cradle>` so `app-bootstrap.ts`/`app.orchestrator.ts` type-check unchanged.
- *Validate:* `npm run typecheck && npm run build:vite`.

**Stage 3 — Remove `@Service` + the dead base `Object.assign` (LOW, mechanical, but wide — 59 files).**
6. Delete the `@Service(...)` decorator + its `import { Service }` from all **56 sites** (renderer + the 2 package services `performance-cache.utils.ts`/`notes.service.ts`). Mechanical; the dependency arrays are now dead (the registration module is the source of truth).
7. Delete `packages/prismgb-core/src/di/decorators.ts` and its `@prismgb/core` barrel export.
8. Remove `Object.assign(this, dependencyMap)` from `service.base.ts:47` and `orchestrator.base.ts:17` (it was the no-op; awilix PROXY-injection passes a real object so this is no longer needed — and leaving it would now eagerly enumerate). Keep the explicit `this.logger = loggerFactory.create(name)` lines.
- *Validate:* `npm run typecheck && npm run build:vite && npm run dev:smoke` (dev:smoke is the real check that every field is populated).

**Stage 4 — Delete the codegen (LOW; depends on Stages 1-3 green).**
9. Delete `scripts/generate-di.js`, `src/renderer/application/di/di.generated.ts`, `src/renderer/application/di/external-tokens.ts`, and `src/renderer/application/di/manual-providers.ts` (its 9 bodies were inlined into `registry.ts` in Stage 1; `uiController` keeps its runtime `register(...)` in `app-bootstrap.ts:145`, unchanged).
10. Remove the **`generate-di.js` invocation** from `pretest` (`package.json:56`), whatever its current form — **order-aware:** if it is still the pristine `node scripts/generate-di.js && node scripts/generate-contracts.js`, it becomes `node scripts/generate-contracts.js`; if P3 already removed its own half, `pretest` is now empty → **delete the `pretest` key entirely**. Also remove the `diGeneratorPlugin` from `vite.config.js`, the `di.generated` knip entry, and any codegen-drift assertion referencing di.generated. (P3 removes the `generate-contracts.js` half symmetrically; P5 only *verifies* `pretest` references neither generator — no third edit.)
- *Validate:* `npm test` (bare — the `pretest` hook must succeed: it runs only `generate-contracts.js` if P3 hasn't landed, or nothing if `pretest` was removed), `npm run lint:dead-code` (knip).

**Stage 5 — Replace the build-time guarantee with the runtime guard (MED).**
11. Author `tests/unit/renderer/application/resolve-all.test.ts`: build the container, iterate `container.registrations`, force-`resolve` every **constructable** token (skip the GPU/worker slice that jsdom can't build — list them explicitly with a comment that they are dev:smoke-only). Assert no `AwilixResolutionError`. This is the runtime replacement for the deleted hard-error.
12. Rewrite `tests/unit/renderer/application/container.test.ts` + `tests/.../main/application/container.shutdown.test.ts`: `new GeneratedContainer({ token: mock })` overrides → `buildRendererContainer({ token: asValue(mock) })` (or a scoped child container). Delete `tests/unit/packages/core/di-decorators.test.ts` (the marker is gone).
- *Validate:* full gate set (§6).

## 6. Gates checklist

- `npm run typecheck` · `npm run lint` (+ `check-layer-boundaries.js` — the registration module lives in `application/di/`, the allowed layer) · `npm run test:run` · `npm run build:vite` · **`npm run dev:smoke` — THE load-bearing gate** (it replaces the build-time dep-validation; it must boot both processes with awilix resolving every injected field) · `npm run coverage:ratchet`.
- **codegen-drift gate: the `generate-di` half is REMOVED** (that generator is deleted); the **`generate-contracts` drift still applies until P3** (its generator survives this phase, so `pretest`/CI still regenerates `validators.generated.ts`/`preload-api.d.ts`). Update any CI step that ran `generate-di.js --check`.
- **Coverage note:** `di.generated.ts` (368, counted in `src/**`) is deleted and replaced by the ~140-line `registry.ts` + the resolve-all test → net denominator drop; run the ratchet and confirm no regression (the registration module is exercised by the resolve-all + container tests).
- **Sequencing with Phase 1:** if Phase 1 (device) lands first, the main `di-registry.ts` device construction (`deviceService`/`profileRegistry`) reflects the collapsed device descriptor; if Phase 2 lands first, write it against the current device wiring and update in Phase 1. State the order in the PR.

## 7. Rollback

One PR/branch. Revert = `git revert -m 1 <merge>` (or reset the branch). `generate-di.js` + `di.generated.ts` are restored from git history; re-running `node scripts/generate-di.js` regenerates the committed output identically (the codegen is deterministic). Tag `pre-phase2-di` before Stage 3 (the wide `@Service` removal) for a fast pre-mechanical-edit restore point.

## 8. Test plan

- **Rewritten:** `container.test.ts` (overrides → `asValue`/scoped child), `container.shutdown.test.ts` (dispose path → awilix `dispose()`).
- **Added:** `resolve-all.test.ts` (the runtime dep-validation guard).
- **Deleted:** `di-decorators.test.ts` (the `@Service` marker test) and `tests/unit/renderer/application/di/manual-providers.test.ts` (the source module is deleted; its provider behavior is covered by the resolve-all + container tests).
- **dev:smoke:** the authoritative behavioral check — boots `npm run dev`, both processes resolve via awilix; any missing registration surfaces as an `AwilixResolutionError` at boot (with a full resolution stack — better diagnostics than the old `Could not resolve token: X`).
- **Coverage:** ratchet-checked; the GPU/worker slice excluded from resolve-all (documented) stays dev:smoke-covered.

## 9. Definition of done

`generate-di.js` + `di.generated.ts` + `external-tokens.ts` + `decorators.ts` deleted; zero `@Service` references remain (`grep -rn '@Service' src packages` is empty); `Object.assign(this, dependencyMap)` removed from both base classes; the renderer + main containers are awilix-built; `resetContainer` rewritten; all gates green; the resolve-all test guards every constructable token; the `pretest` hook no longer calls `generate-di.js`.

## 10. Fallback (if Spike-A runtime sub-gate FAILS)

`codegen-emitted-deplist-base-pull` (options-doc Dim 1, ~−38 net): keep the hand-rolled container but make the field-mirroring deletion safe — emit a per-class dependency-name list into `di.generated.ts` and have the base classes pull each name from the cradle (firing the get-trap), then `declare` the subclass fields and delete the assignments. This stays in-architecture (keeps the Increment-A guarantee + the codegen) and is the much smaller, lower-risk reduction. It does **not** deliver the codegen-elimination consequence (Phase 5's script deletion would then not include `generate-di.js`).
