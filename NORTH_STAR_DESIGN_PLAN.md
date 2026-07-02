# North Star Design Plan — Framework-Maximalist Architecture

**Date:** 2026-07-01
**Source analysis:** `CODEBASE_NORMALIZATION_ANALYSIS.md` (Rounds 1–3; finding IDs referenced throughout)
**Chosen direction:** Path C — framework-maximal (Spring-Boot-style)
**Governing goals:** decoupling · zero hand-written wiring · decorators · heavy OOP · one standard base layer · strict typed contracts
**Optimized metric:** hand-written-wiring count → 0 (LOC reduction is a byproduct, ~−8,000 expected)

---

## 1. The North Star (end state)

### 1.1 Vision

PrismGB is an Electron application where **no developer ever writes wiring**. Dependency injection, lifecycle, event subscription, error handling, renderer notification, and timer management are all *declared* at the class site via decorators and *executed* by maintained frameworks. Contracts are typed and single-sourced; anything that must exist in two places is generated. Architectural boundaries are enforced by declarative configuration, not hand-rolled scripts. Adding a service, a subscription, or an IPC procedure means writing exactly one decorated class — nothing else changes.

### 1.2 Tenets (the standing rules every phase serves)

1. **Decoupling through contracts + container.** Every collaborator is injected against a token-bound interface (`@inject(TOKENS.x)`); no service constructs another. The event bus remains the broadcast seam — annotated, never hand-subscribed.
2. **Zero hand-written wiring — including zero hand-written framework.** Wiring lives in maintained libraries (Inversify 7, electron-log, @preact/signals-core, dependency-cruiser, zod/tRPC). Bespoke framework code is capped at two thin, unit-tested modules (`@OnEvent` bridge, AOP decorator set), each < 100 LOC. The deleted `@Service`/generate-di stack is the cautionary tale: never rebuild it.
3. **Declarative cross-cutting concerns.** Logging-on-error, renderer notification, keyed timers, lifecycle, and subscriptions are method/class decorators, not repeated statement blocks.
4. **One standard base layer.** `BaseService`, `BaseOrchestrator`, and `PresentationComponent` remain the canonical bases — deduplicated onto one shared `ManagedLifecycleHost`, extended (never bypassed) by every class in their layer. The bases integrate with container lifecycle; they are not replaced by it.
5. **Single source of truth, enforced by generation.** The event manifest generates the channel/payload mirrors; zod schemas and TS types share one source (`z.infer` or `satisfies` guards); workspace aliases are emitted from one module. CI fails if generated output is stale.
6. **Boundaries as configuration.** Layer and module boundaries are dependency-cruiser rules (with orphan detection — no silently-exempt files), not a 381-LOC script. Directory structure still mirrors the architecture; only the *enforcement* is declarative.
7. **Strict contracts, no drift.** `strict` TypeScript from one base tsconfig; every cross-boundary payload is either generated or `satisfies`-guarded; knip runs in CI so dead exports die at the PR, not in the next audit.

### 1.3 End-state architecture

```
src/
├── main/                      # Electron main process
│   ├── application/           #   composition module (Inversify bindings) + lifecycle
│   ├── infrastructure/        #   window, tray, devices, updates, transcode, logging (electron-log)
│   └── ipc/                   #   tRPC routers (TRPCError channel, zod INPUT validation)
├── preload/
├── renderer/
│   ├── application/           #   composition modules, orchestrators (decorated), state
│   ├── infrastructure/        #   services/adapters (decorated), tRPC client
│   └── presentation/          #   components on PresentationComponent + signals
├── platform/                  # former packages/* — same folders, ONE build unit
│   ├── core/                  #   bases, ManagedLifecycleHost, primitives, TOKENS, decorators/
│   ├── config/  events/  ipc/ #   contracts (events: manifest → GENERATED mirrors)
│   ├── devices/ transcode/ notes/ updates/
│   ├── gpu/                   #   WebGPU pipeline (functional core — deliberately undecorated)
│   └── ui-base/               #   signals (re-export @preact/signals-core), widgets, bindings
├── scripts/                   # generate-events, workspace-aliases, shared lib/ (walk, process-runner)
└── tests/                     # + dom-mount helper, it.each tables, no wall-clock gates
```
One root tsconfig (decorator flags in exactly one place), one vite config, dependency-cruiser rules replacing all three checker scripts. `build:vite` works (the worker double-bundling class is structurally impossible once packages stop consuming their own `dist/`).

### 1.4 What a service looks like in the end state

```ts
@injectable()
export class CaptureService extends BaseService {
  constructor(
    @inject(TOKENS.loggerFactory) loggerFactory: LoggerFactoryLike,
    @inject(TOKENS.streamViewService) private readonly streamView: StreamViewServiceLike,
    @inject(TOKENS.eventBus) eventBus: TypedEventBusLike,
  ) {
    super({ loggerFactory, eventBus }, 'CaptureService');
  }

  @postConstruct()
  protected onInit(): void { /* container-ordered */ }

  @OnEvent(EventChannels.RENDER.STATS)          // typed: payload inferred from EventPayloadMap
  protected onRenderStats(payload: RenderStatsPayload): void { /* auto-subscribed, auto-disposed */ }

  @LogErrors('Failed to capture screenshot')     // AOP: try/log once, not per method body
  @Managed(CAPTURE_DRAIN_TIMER)                  // keyed timer, auto-cancel on dispose
  async captureScreenshot(): Promise<CaptureResult> { /* domain logic ONLY */ }

  @preDestroy()
  protected onDispose(): void { /* reverse-ordered */ }
}
```

**Adding a service, before vs after:**

| Step | Today | End state |
|---|---|---|
| Write the class | ✅ | ✅ (with decorators) |
| Edit `service-registrations.ts` | required | **gone** — binding declared at class / one line in layer module |
| Update container token-list test | required | **gone** (TEST-4) |
| Hand-wire bus subscribe + unsubscribe + dispose | required | **gone** — `@OnEvent` |
| Hand-write try/log/notify blocks | required | **gone** — `@LogErrors`/`@NotifyRenderer` |
| Register init/cleanup order | edit two lists | **gone** — `@postConstruct`/`@preDestroy` (+ one ordered module for the 2 order-critical teardowns) |

### 1.5 Explicit non-goals (rejected options, with reasons — do not relitigate mid-execution)

| Rejected | Why |
|---|---|
| R2-2 delete DI / R2-6 composition-over-inheritance | Opposite of the OOP + standard-base-layer goal; replaced by R3-1 |
| R2-3 delete the event bus | The bus is the decoupling seam; R3-3 removes its *ceremony*, not the seam |
| APP-4 awilix | Rejected as *lateral* — no decorators, registration map survives. Inversify is not lateral: wiring moves to class sites, lifecycle is container-managed |
| TRC-1 fluent-ffmpeg | Maintenance-stalled dep + progress-precision regression (D2); TRC-2/3 taken instead |
| R2-4 / UIB-8 UI framework rewrite | Horizon gate G3, not in scope (lit — decorator-native — is the aligned candidate if ever taken) |
| R3-2 NestJS in main | Horizon gate G2 — uniform Inversify across both processes preserves ONE standard base layer; Nest would fork the framework model per process. Documented upgrade path |
| PRES-10 id-attribute removal | 8 CSS + ~30 e2e selectors depend on ids; ~zero payoff |
| Bespoke decorator/codegen frameworks beyond the two capped modules | Tenet 2 |
| R2-8 feature deletions (notes, worker path, perf HUD, Canvas2D) | Product decisions — separate menu, not architecture |

### 1.6 Hard constraints (physics of the plan)

- **Type erasure:** interface injection always needs a token. `TOKENS` is the one canonical token module (in `platform/core`), typed `Token<T>` so `@inject` sites are type-checked.
- **esbuild emits no decorator metadata:** Phase 6 starts with **explicit tokens** (works under today's esbuild). Type-inferred autowiring is gate **G1** (adopt `unplugin-swc` + `reflect-metadata`) — optional, later, reversible.
- **Parameter decorators require `experimentalDecorators: true`** (legacy mode). Set once, in the single post-collapse tsconfig — which is exactly why Phase 3 precedes Phase 6.
- **Cradle-proxy gotcha dies in Phase 6:** Inversify performs real constructor injection; the `ownKeys → []` no-op class and every field-mirror workaround (APP-1/MAIN-6) become moot.
- **Commit discipline (repo law):** conventional commits, subject ≤ 100 chars, no AI attribution, commit per work item, no `--no-verify`.

---

## 2. Scope map — every adopted finding → its phase

| Phase | Findings absorbed |
|---|---|
| P0 | R2-7, D1/INF-1 investigation, W1 coverage-ratchet decision, land streaming-render WIP |
| P1 | TEST-1, CORE-1, CORE-2, APP-5, INF-4, MAIN-8, MAIN-9, MAIN-10, TYP-1, UIB-7, GPU-3, CFG-3, `formatErrorLabel`, INF-1 (per D1) |
| P2 | X-1, MAIN-7, APP-6, UIB-4, INF-8, UPD-2, EVT-3, PRES-8, PRES-9, CORE-5, X-4/MAIN-4 (`satisfies` guards), DEV-1, DEV-2, X-2, APP-7, NORM-2, TEST-5 (renames) |
| P3 | R2-1 (subsumes CFG-1, SCR-2, NORM-1, CFG-2 residue, SCR-3 inventory, `check:exports`, GPU-3 coupling) |
| P4 | SCR-1 (D7), CFG-4, SCR-4, SCR-5, SCR-6 |
| P5 | UIB-1, X-5/INF-9 (keyed timers), MAIN-1, UIB-2, UIB-3, CORE-3, CORE-4, INF-3, INF-7 |
| P6 | R3-1 renderer (retires APP-1, APP-4 question, TEST-4 token list) |
| P7 | R3-1 main (retires MAIN-6; deletes core `Container`) |
| P8 | R3-3 lifecycle (retires APP-3, UPD-1) |
| P9 | R3-3 events (retires APP-2/PRES-2, orchestrator subscribe blocks; optional `@SubscribeTrpc` for INF-6) |
| P10 | R3-4 AOP (retires X-3, INF-6 residue) + R2-9 (retires MAIN-2, MAIN-4 envelopes, MAIN-5) |
| P11 | R3-5 / EVT-1 generator, IPC-2, X-4 aggressive (z.infer single-source) |
| P12 | GPU-1, GPU-2, GPU-4, GPU-5, TRC-2, TRC-3, INF-2, INF-5, PRES-1, PRES-3, PRES-4, PRES-5, PRES-6, PRES-7 |
| P13 | TEST-2, TEST-3, TEST-4 (residue), script-test cleanup orphaned by P4 |

---

## 3. Phase plan

Every phase ends with: **gates green → tag `northstar-p<N>` → STOP** (review checkpoint; no auto-advance).
**Standard gates:** `npm run test:run` · `npm run typecheck` · `npm run lint` · `npm run dev:smoke`. **Additional:** `build:vite` from P3 onward (P3's exit criterion is that it *starts passing*); `test:e2e` at P3, P6, P9, P12, P13.

---

### Phase 0 — Baseline, policy, and open decisions
**Risk: LOW · Executor: ME · Est. LOC: ~0 · Blocking: everything**

1. Land the uncommitted `streaming-render.service.ts` WIP (or explicitly stash-and-record); clean tree required.
2. Record baselines in the phase log: test count, LOC per area, `dev:smoke` pass, `build:vite` **pass** (worker double-bundling fixed at `4c5bf36d`), e2e pass count.
3. **R2-7:** rewrite `.husky/pre-commit` → `lint-staged`-style: eslint on staged, `typecheck`, `vitest related --run` on staged; full `test:run` moves to pre-push + CI. Every later phase commits dozens of times — this pays for the whole plan.
4. **Resolve D1:** trace whether the ARM-Linux WebGPU-skip policy (`capability-detector.utils.ts` → `gpu.getPolicy`) was intentionally abandoned. Outcome A (abandoned): P1 deletes detector + route + `gpu-policy.ts`. Outcome B (regression): re-wire `_resolveGpuCapabilities` through the policy, and P1 deletes nothing here.
5. Decide the coverage-ratchet stance before the 2026-07-31 waiver expiry (recommend: freeze absolute thresholds during the plan; re-ratchet at P13).
6. Tag `northstar-p0`.

**Exit criteria:** clean tree, new pre-commit verified fast (<30 s), D1 decision recorded in this file, baselines logged.

---

### Phase 1 — Dead-code excision
**Risk: LOW · Executor: 3 parallel Sonnet agents · Est. LOC: ~−2,600 · Depends: P0**

Exclusive file-ownership batches (no overlap):

- **Batch 1A — tests & test-only subjects:** delete `tests/performance/` (1,007); remove `ResolutionCalculator` usage from `tests/integration/streaming.test.js`, then delete `tests/utilities/ResolutionCalculator.js` + `tests/unit/utils/ResolutionCalculator.test.js` (628). Delete the `AnimationCache` usage in `tests/integration/streaming.test.js` (coordinates with 1B).
- **Batch 1B — core & renderer:** `performance-cache.utils.ts` + export + DI provider + test assertions (CORE-1/APP-5); `typed-registry.ts` + exports + test (CORE-2); `native-resolution.utils.ts` (INF-4); INF-1 per D1; `formatErrorLabel`; UIB-7 dead exports (`createTemplateActionSelector`, export-only prunes, `replaceManagedAsync`).
- **Batch 1C — main, types, gpu surface, config:** MAIN-8 `unwrapOverride` (both containers), MAIN-9 `PlatformInfo` trim (per D1 outcome), MAIN-10 cast, TYP-1; GPU-3 as **one coordinated commit** (index/runtime re-export prune + `testkit` entrypoint + `EXPECTED_GPU_EXPORTS` + aliases + surface-lock tests); CFG-3 dead npm scripts/turbo task/knip ignores.

**Exit criteria:** all gates green; grep confirms zero references to every deleted symbol; LOC delta recorded.

---

### Phase 2 — Contract normalization
**Risk: LOW · Executor: 2 parallel Sonnet + 1 Haiku (renames) · Est. LOC: ~−350 · Depends: P1**

- **Batch 2A — canonical contract imports:** replace every locally re-declared `*Like`/logger/event-bus/storage shape with `@prismgb/core` imports (X-1 across notes/updates/transcode; MAIN-7 window/tray/login-item; APP-6 two orchestrators; UIB-4 `EventTargetLike` + widget loggers). Verify notes' storage impl provides `removeItem` before widening (X-1 caveat).
- **Batch 2B — canonical helpers & guards:** `getErrorMessage` adoption at the 8 inline sites + delete `getThrownMessage` (INF-8); `MainEventChannels` import (UPD-2); one exported `isPromiseLike` (EVT-3); `deepFreeze`/`compactRecord` promotion to core + DEV-1 mapper simplification + `getElectronApp` helper (X-2, DEV-2); `satisfies z.ZodType<…>` drift guards on device/status schemas (X-4/MAIN-4 cheap form); CORE-5 barrel relocation; PRES-8 shim deletion; PRES-9 class-token merge; APP-7 + NORM-2 consistency.
- **Batch 2C (Haiku) — mechanical renames:** TEST-5 `git mv` (5 drifted test names; `.test.js`→`.test.ts` where subject is TS).

**Exit criteria:** gates green; `grep -rn "interface Logger\b\|type LoggerFactory ="` in src/packages returns only core.

---

### Phase 3 — Workspace collapse (R2-1)
**Risk: HIGH · Executor: ME, sequential (no agents mutate during this phase) · Est. LOC: ~−1,300 · Depends: P1, P2**

The keystone phase: one build unit, one tsconfig, and the precondition for safe decorators (Tenet/constraint: decorator flags in ONE place).

1. Tag `pre-workspace-collapse`.
2. `git mv packages/prismgb-<name>/src → src/platform/<name>` for all ten; keep internal structure byte-identical.
3. Rewrite `@prismgb/<name>` imports → `@platform/<name>` alias (codemod; alias added to the single tsconfig + vite + vitest — emitted by one `scripts/lib/workspace-aliases.mjs` from day one, CFG-2's end state).
4. Delete: 10× `package.json`/`tsconfig.json`/`vite.config.ts`, `turbo.json` + `predev`/`prebuild:vite`, `check-package-exports.js` + `check:exports`, per-package dist plumbing in `clean-generated.js` (→ globs, SCR-3), the dist-boundary half of `check-gpu-package-boundaries.js` (deep-import bans survive until P4 absorbs them).
5. Merge the package tsconfig deltas (`types` arrays, decorator flags) into the root base; delete the redundant `paths`/flag blocks in `tsconfig.app.json` (CFG-1) — safe now because the raw-JSON checker consuming them is being retired.
6. Migrate package-local tests (`gpu`, `ui-base`, `core` vitest projects) to root-tree projects pointing at `src/platform/**`.
7. Update `.github` workflows that referenced turbo/package builds.

**Exit criteria (the big one):** all standard gates green **and `npm run build:vite` stays green through the collapse** (the stale-dist/double-bundling bug class becomes structurally impossible) **and** full `test:e2e` green. Rollback: `git reset --hard pre-workspace-collapse`.

---

### Phase 4 — Boundaries as configuration
**Risk: MEDIUM · Executor: ME (rules) + 1 Sonnet (script lib) · Est. LOC: ~−450 · Depends: P3**

1. Author `.dependency-cruiser.cjs`: the full layer matrix from `check-layer-boundaries.js`, the GPU deep-import bans, platform-module boundaries (`src/platform/x` may not import `src/renderer/**`, etc.), **orphan detection on** (closes the silent-exemption hole — SCR-1's confirmed gotcha), and no unclassified-file bypass.
2. Wire `depcruise` into `npm run lint`; delete `check-layer-boundaries.js`, the remainder of `check-gpu-package-boundaries.js`, and the now-duplicate `no-restricted-imports` eslint blocks. Migrate the intent of `tests/fixtures/layer-boundaries/` into a small depcruise self-test.
3. **CFG-4:** add `knip` to CI as a failing gate; prune stale ignores (already partly done in P1).
4. **SCR-4/5/6:** extract `scripts/lib/{process-runner,fs-walk}.js`; both smokes consume them; `typecheck:app` → plain `tsc -p`; `smoke-test.js` onto `picomatch`; arg parsing onto `node:util parseArgs`.

**Exit criteria:** gates green with depcruise active; deliberately introduce a cross-layer import in a scratch commit and verify the gate fails (negative test), then revert.

---

### Phase 5 — Standard base layer & foundation libraries
**Risk: MEDIUM · Executor: 3 parallel Sonnet batches · Est. LOC: ~−550 · Depends: P3**

- **Batch 5A — the base layer (Tenet 4):** extract `ManagedLifecycleHost` in `platform/core` owning the DisposableBag facade (timers/frames/track/replace/cancel + **keyed** `schedule(key, fn, ms)`/`cancelScheduled(key)`); `BaseService`/`BaseOrchestrator`/`PresentationComponent` compose it, keeping their layer-specific `listen` variants (UIB-1, X-5, INF-9). Add `replaceManagedGroup` (UIB-6). Route the hand-rolled timer/listener sites through the bases (INF-9 sites).
- **Batch 5B — library swaps (renderer/ui):** `@preact/signals-core` re-exported from `platform/ui-base/reactive` + delete `signal.ts` + rewrite its test to lazy semantics (UIB-2); `@floating-ui/dom` for `calculateAnchoredDisclosureLayout` with the docked-height-floor middleware caveat honored (UIB-3); `debounce` into core timing utils + port adoption (INF-7); `abortableDelay`/`raceWithTimeout` into core async utils + migrate the five ceremony sites (INF-3).
- **Batch 5C — library swaps (main/core):** `electron-log` behind `LoggerFactoryLike`, winston removed (MAIN-1; verify the two error-log tests); `Promise.withResolvers` + `lib` bump, keep `Deferred<T>` alias (CORE-3); `type-fest` for `ValueOf`/`UnionToIntersection` (CORE-4).

**Exit criteria:** gates green; `dev:smoke` mandatory (base-class change class); zero remaining `winston` references; ui-base signal tests rewritten, consumers untouched.

---

### Phase 6 — Decorator DI: renderer (R3-1a)
**Risk: HIGH · Executor: ME designs infra + 3 sequential Sonnet migration batches · Est. LOC: ~flat (−220 wiring) · Depends: P3, P5**

1. **ME:** add `inversify`; create `platform/core/di/`: `TOKENS` (typed `Token<T>` for all 53 renderer + 9 main identifiers — names normalized to class names where they diverge), decorator re-exports, container factory. `experimentalDecorators: true` in the single root tsconfig. **Explicit tokens only** (no swc, no reflect-metadata — constraint §1.6; autowiring deferred to gate G1).
2. **Migration batches (sequential — shared container file):** 6A infrastructure services (~30 classes) → `@injectable()` + `@inject(TOKENS.x)` constructor params; 6B application (orchestrators, stores, state); 6C presentation externals + manual-provider equivalents (factory bindings via `toDynamicValue` in a layer module).
3. Compose: three layer binding-modules (`infrastructureModule`, `applicationModule`, `presentationModule`) replace `service-registrations.ts`/`manual-providers.ts`/`container.ts`. Bootstrap builds the container from modules.
4. Delete the field-mirror ceremony as each class migrates (APP-1 — real injection makes it moot). Rewrite container tests as binding-module resolution tests (drop the hand-maintained token list — TEST-4 core case).
5. Keep the core `Container` primitive alive until P7 (main still uses it).

**Exit criteria:** gates green + `dev:smoke` + full e2e; zero imports of `service-registrations.ts`; every renderer class resolves via Inversify; boot time within 10% of baseline.

---

### Phase 7 — Decorator DI: main (R3-1b)
**Risk: MEDIUM · Executor: 1 Sonnet + ME verify · Est. LOC: ~−150 · Depends: P6**

1. Migrate the ~9 main services + `IpcHandlerRegistry` deps to `@injectable`/`@inject` with a `mainModule`; `MainBootstrap` builds the Inversify container.
2. `createContext()` builds `IpcContext` from injected deps directly (MAIN-5 boundary-preserving form).
3. **Delete `platform/core/primitives/container.ts`** and its remaining tests — the hand-rolled DI plane is now fully retired.
4. Record the NestJS decision (gate G2) as *not taken*, with the adapter sketch preserved in §6.

**Exit criteria:** gates + `dev:smoke` + `test:smoke` (packaged smoke exercises main boot); core `Container` has zero references.

---

### Phase 8 — Declarative lifecycle (R3-3a)
**Risk: HIGH · Executor: ME · Est. LOC: ~−150 · Depends: P7**

1. Adopt `@postConstruct`/`@preDestroy` on services whose init/dispose is order-independent; container activation/deactivation handles them.
2. `AppOrchestrator` (both processes): the 11-child field/init/cleanup triplication collapses to container-managed lifecycle **plus one explicit `orderedTeardown: Token[]` module** for the two genuinely order-critical sequences (APP-3's "cleanup ≠ reverse-init" and "GPU before recording" constraints move intact, as data — never inferred).
3. UPD-1: `UpdateBridge` deleted; its two calls become `UpdateService.@postConstruct` + a configured default interval.

**Exit criteria:** gates + `dev:smoke` + quit-path verification (the historical OOM-on-quit class): launch, stream, quit — clean shutdown, no re-entrancy warnings, teardown order log matches the ordered module.

---

### Phase 9 — Typed event subscriptions (R3-3b)
**Risk: MEDIUM-HIGH · Executor: ME (decorator) + 2 Sonnet batches (migration) · Est. LOC: ~−250 · Depends: P6 (P8 recommended first)**

1. **ME:** author `@OnEvent(channel)` in `platform/core/decorators/` (~60–80 LOC, capped bespoke module #1): registers handler metadata; container activation subscribes via the injected bus into the instance's `ManagedLifecycleHost`; disposal auto-unsubscribes. **Typed:** handler payload parameter is inferred from `EventPayloadMap[channel]` — a compile error on mismatch. Unit-test the decorator exhaustively (subscribe, dispose, double-init, error in handler).
2. **Batch 9A:** orchestrators — every `subscribeWithCleanup`/manual subscribe block becomes an `@OnEvent` method.
3. **Batch 9B:** the six stores (APP-2/PRES-2) — subscription harnesses and payload-narrowing readers deleted; `@OnEvent` methods set signals directly. Bridges (`ui-event.bridge` et al.) migrate or dissolve into their consumers.
4. Optional (decide during phase): `@SubscribeTrpc(starters)` for the INF-6 shells — only if it stays within the bespoke-code cap; otherwise the P5 base helper form stands.

**Exit criteria:** gates + e2e; `grep -rn "\.subscribe(" src/renderer` returns only the decorator internals and deliberate low-level sites (enumerated in the phase log).

---

### Phase 10 — AOP decorators + native error channel (R3-4, R2-9)
**Risk: MEDIUM · Executor: 2 Sonnet batches + ME review · Est. LOC: ~−450 · Depends: P8, P9**

- **Batch 10A — AOP set** (capped bespoke module #2, ~100 LOC total, unit-tested): `@LogErrors(label)` (try/log/rethrow — configurable return-fallback), `@NotifyRenderer(channel)` (replaces the X-3 duplicate in updates/transcode), `@Managed(key)` (keyed timers over the P5 base). Apply across main + platform services where the repeated blocks live.
- **Batch 10B — R2-9:** router procedures throw `TRPCError`; delete `resultEnvelope`/failure-mapper closures (MAIN-2), `successEnvelope` response schemas (MAIN-4 envelope half — keep zod **input** validation, Tenet 7), and the renderer consumers' `.success` branches (migrate to try/catch on typed client errors). MAIN-5's re-packing dissolves with the slimmer context.

**Exit criteria:** gates + e2e; `grep -rn "success: false" src/main/ipc` → 0; error paths exercised in unit tests via thrown `TRPCError`.

---

### Phase 11 — Codegen: single sources of truth (R3-5, EVT-1)
**Risk: MEDIUM · Executor: 1 Sonnet · Est. LOC: ~−200 · Depends: P3 (parallel-safe with P6–P10)**

1. `scripts/generate-events.js` (reuses `scripts/lib/fs-walk`): emits `event-channels.ts`, `main-event-channels.ts`, and the `EventPayloadOverrides`/`VoidEventChannel` block from `event.manifest.json` into the existing `CODEBASE_*` markers. Delete the two runtime drift-checkers and `AssertNever` scaffolding (the generator subsumes them).
2. CI step: `node scripts/generate-events.js && git diff --exit-code` (stale generation fails the build).
3. IPC-2: the 7 payload interfaces get one owner (`@platform/events`), re-exported by `@platform/ipc`.
4. X-4 aggressive: device schemas become the source (`z.infer`) **or** keep the P2 `satisfies` guards — decide by whether `platform/devices` may depend on zod (it may, post-collapse; prefer `z.infer`).

**Exit criteria:** gates green; hand-editing a generated block fails CI (negative test); manifest `payload` column is now load-bearing.

---

### Phase 12 — Domain & presentation dedupe (aligned Wave-5 remainder)
**Risk: MEDIUM · Executor: 4 parallel Sonnet batches (disjoint files) · Est. LOC: ~−700 · Depends: P5 (parallel-safe with P9–P11 except 12D notes overlap — see batch notes)**

- **Batch 12A — GPU:** GPU-1 primary form (delete the identity `source` layer + `_padding`; golden byte-test guards); GPU-2 (collapse worker triple-forwarding); GPU-4 (cache the present bind group via `BindGroupStore`); GPU-5 (aliases, wrappers, the array-join literal, index round-trip).
- **Batch 12B — transcode/updates:** TRC-2 parameterized binary resolver; TRC-3 `removeDir` + dead logger param.
- **Batch 12C — renderer infrastructure:** INF-2 `_createSession`/`_teardownAndRecreate` extraction (streaming-render); INF-5 `BrowserSignalAdapter<T>` base for the three adapters.
- **Batch 12D — presentation:** PRES-1 dispose-nulling removal + PRES-4 `ReinitializableComponent` base in ui-base (one canonical re-init contract — extends the standard base layer); PRES-3 `renderListboxOptions` everywhere + centralized escaping; PRES-5 streaming-controls/notes-panel onto `bind*`+store; PRES-6 auto-hide skeleton parameterization; PRES-7 notes-panel onto `DisclosureController`.

**Exit criteria:** gates + full e2e + `dev:smoke`; GPU golden packing test byte-identical; visual spot-check of notes/streaming/settings panels.

---

### Phase 13 — Test-suite modernization
**Risk: LOW-MEDIUM · Executor: 3 parallel Sonnet · Est. LOC: ~−900 · Depends: P12**

- **Batch 13A:** TEST-2 `dom-mount.helper` (real elements, declarative map, cleanup) + migrate the 22 component-test files.
- **Batch 13B:** TEST-3 `it.each` conversion of the pure-utility clusters (only those — the fat suites stay, per the analysis).
- **Batch 13C:** TEST-4 residue (installer-parity, any remaining hand-lists); delete `tests/unit/scripts/` cases orphaned by P4's script retirement; re-ratchet coverage (per P0 decision).

**Exit criteria:** gates green; test count re-baselined and recorded; pre-push full-suite time recorded vs P0 baseline.

---

## 4. Execution strategy (per the standard methodology)

### 4.1 Dependency graph

```
P0 ──► P1 ──► P2 ──► P3 ──► P4
                      │
                      ├──► P5 ──► P6 ──► P7 ──► P8 ──► P9 ──► P10 ──► ┐
                      │                                               ├──► P13
                      ├──► P11 ──────────────── (parallel track) ──── ┤
                      └──► P12 ─ (after P5; parallel with P9–P11) ────┘
```
Blocking chain: P0→P1→P2→P3 (P3 is the keystone — nothing decorator-related may precede it). Track A (P5→P10) is the framework spine, strictly sequential. Tracks B (P11) and C (P12) run concurrently with A's later phases — file-disjoint by construction (P11: scripts+events; P12: gpu/transcode/presentation vs A's DI/orchestrator files; 12D pauses if P9-B is mid-flight on stores).

### 4.2 Risk classification

| Phase | Risk | Why | Mitigation |
|---|---|---|---|
| P0, P1, P2, P13 | LOW | deletions/renames/mechanical | grep-verified, gates |
| P4, P5, P7, P10, P11, P12 | MEDIUM | behavior-adjacent, well-tested surfaces | per-batch gates, golden tests |
| P3 | HIGH | build-system keystone | ME-only, tag, e2e gate, `build:vite` must flip to green |
| P6 | HIGH | 53-class migration, boot-critical | sequential batches, `dev:smoke` per batch, boot-time budget |
| P8 | HIGH | teardown ordering (historical OOM class) | explicit ordered module, quit-path verification |
| P9 | MED-HIGH | event plane migration | decorator unit-tested first, e2e gate |

### 4.3 Parallelization

Max 3–4 agents per batch, exclusive file ownership, validation after the batch (not per agent): P1 (3), P2 (2+1), P5 (3), P12 (4), P13 (3). P6's three batches are **sequential** (shared binding modules). Tracks A/B/C concurrency as in §4.1.

### 4.4 Agent allocation

| Phase | Execution | Agents × Model |
|---|---|---|
| P0, P3, P8 | ME (orchestrator) | — |
| P1, P5, P12, P13 | parallel subagents | 3–4 × Sonnet |
| P2 | parallel subagents | 2 × Sonnet + 1 × Haiku (renames) |
| P4, P7, P11 | single subagent + ME review | 1 × Sonnet |
| P6 | ME (infra) + sequential batches | 3 × Sonnet |
| P9, P10 | ME (decorators) + batches | 2 × Sonnet |

### 4.5 Token estimate

| Segment | Est. tokens |
|---|---|
| P0–P2 (baseline + deletions + normalization) | ~350k |
| P3–P4 (collapse + boundaries) | ~400k |
| P5 (foundation) | ~250k |
| P6–P10 (framework spine) | ~1.0M |
| P11–P12 (codegen + dedupe, parallel track) | ~450k |
| P13 (tests) | ~200k |
| **Total** | **~2.6M** (±30%) |

Optimizations applied: `git mv` for all renames; exact paths + before/after snippets in every agent prompt (no exploration); Haiku for mechanical renames; validation per batch, not per agent; the analysis doc's file:line references are the pre-computed work list.

### 4.6 Error prevention

- **Commit per work item; tag per phase** (`northstar-p<N>`); tag before HIGH phases (`pre-workspace-collapse`, `pre-di-renderer`, `pre-lifecycle`).
- **Gate ladder:** batch → standard gates; phase → + `dev:smoke`; milestone (P3/P6/P9/P12/P13) → + full e2e; P3 onward → + `build:vite`.
- **Negative tests** where the change is a guardrail: P4 (boundary violation must fail), P11 (stale generation must fail).
- **Never trust executor narration** — verify every agent's claim against `git diff` + gate output before merging its batch (standing rule).
- **Rollback:** phase tags; HIGH phases are single-branch, revertible with one `reset --hard`.
- **Sequencing invariants:** decorators never before P3 (single tsconfig); core `Container` deleted only in P7; ordered-teardown data never inferred (P8).

### 4.7 Agent prompt template (per methodology; instantiate per batch)

```
Task: <one line — phase/batch id + objective>

Files to modify (exclusive ownership — touch nothing else):
- <exact path>: <specific change, with before/after snippet or finding ID from CODEBASE_NORMALIZATION_ANALYSIS.md>

Steps:
1. <action>
2. <action>

Validation (run before reporting): npm run typecheck && npm run lint && npx vitest related --run <touched files>

Do NOT:
- Modify files outside the list; explore the codebase; add comments; add attribution to commits.
- Claim completion without pasting the validation output.

Commit: conventional, subject ≤100 chars, one commit per logical change.
```

**Example — P1 Batch 1B (ready to dispatch):**
```
Task: P1/1B — delete dead core primitives + renderer dead files (CORE-1, CORE-2, APP-5, INF-4, UIB-7, formatErrorLabel)

Files to modify:
- packages/prismgb-core/src/primitives/performance-cache.utils.ts: DELETE file
- packages/prismgb-core/src/primitives/typed-registry.ts: DELETE file
- packages/prismgb-core/src/index.ts: remove exports (lines ~65-66, ~78) + formatErrorLabel (~:8-48 block; keep getErrorMessage/isErrorLike per CORE-5)
- src/renderer/application/di/service-registrations.ts: remove animationCache provider (:113) + AnimationCache import (:1)
- src/renderer/infrastructure/services/streaming/native-resolution.utils.ts: DELETE file
- packages/prismgb-ui-base/src/index.ts + template/template-ref.helpers.ts + lifecycle/presentation-component.base.ts: UIB-7 export prunes + delete replaceManagedAsync (:79-81)
- tests/unit/packages/core/typed-registry.test.ts: DELETE
- tests/unit/renderer/application/container.test.ts + manual-providers.test.ts: drop animationCache assertions
Validation: npm run typecheck && npm run lint && npm run test:run
```

---

## 5. Decision gates (open; do not block the plan)

| Gate | Question | Default | Revisit at |
|---|---|---|---|
| **G1** | Adopt `unplugin-swc` + `reflect-metadata` for type-inferred autowiring (drop explicit `@inject` tokens on concrete classes)? | Not yet — explicit tokens are proven and build-neutral | After P7, with the DI spine stable |
| **G2** | NestJS in the main process (modules/interceptors/`@OnEvent` native)? | No — uniform Inversify preserves one base layer; ~50–80 LOC electron-trpc bridge sketch preserved here | If main grows past ~20 services or interceptor demand materializes |
| **G3** | UI framework adoption (lit — decorator-native Web Components, the philosophy-aligned candidate)? | No — P5/P12 surgical wins capture most value | Only as a deliberate project; P5's signals swap is forward-compatible |
| **G4** | Feature menu (R2-8: notes −4,700, worker path −1,300, perf HUD −1,000, Canvas2D fallback) | Product decision, out of plan scope | Owner cadence |

## 6. Success metrics (measured at P13, vs P0 baseline)

1. **Hand-written wiring = 0:** no central registration maps; no manual bus subscribe/unsubscribe outside decorator internals; no hand-maintained init/cleanup lists beyond the one ordered-teardown module; no repeated try/log/notify blocks.
2. **`build:vite` green** (green from P0) and stays green; `dev:smoke` and 86 e2e green throughout.
3. **Net LOC ≈ −8,000** (±1,500) with the three bug classes structurally eliminated (stale-dist/double-bundling, cradle-proxy no-ops, hand-list drift).
4. **Bespoke framework code ≤ 200 LOC total** (`@OnEvent` bridge + AOP set), both fully unit-tested.
5. **Pre-commit < 30 s;** full suite on pre-push/CI only.
6. **Drift is impossible, not policed:** generated events mirrors + `satisfies`/`z.infer` schemas + depcruise boundaries + knip in CI — every invariant this plan establishes is enforced by a failing build, not a convention.
