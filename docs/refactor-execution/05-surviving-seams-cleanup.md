# Phase 5 — Surviving-code seams, reactivity & dead-code cleanup

> Spine: [`00-overview.md`](./00-overview.md). This doc inherits its scope and caveats from the overview's scope-resolution table verbatim. P5 executes **only** the seams whose host code *survives* the framework phases (P2 Awilix, P3 electron-trpc, P4 React/PrimeReact), plus the cleanup that becomes possible **once P2+P3 have landed**. Where a catalogue item touches code a framework phase deletes, it is **not** in P5 — it is dropped-as-superseded (`⊘Pn`) and called out below.

---

## 1. Inherited status & caveats

Per the overview classification (line 29): **P5 is "mostly unconditional" — there is no spike gate.** The independent seams can run any time; the codegen-cleanup items depend on **P2 (generate-di gone) + P3 (generate-contracts gone)** landing, and two base-class seams are **sequenced after P2** because Awilix also edits those base classes.

Inherited verdicts/tags (from `docs/refactor-aggressive-reduction-options.md`, audited clean over 4 rounds), carried forward without softening:

| Catalogue item | Verdict / tag | The load-bearing trade — carried forward in plain language |
|----------------|---------------|------------------------------------------------------------|
| `single-flight-primitive` | confirmed · aligned · **~−9 src** ("seam, not LOC") | The win is the *seam* (core's first real value-consumer), not the line count. The 4th consumer (audio-pipeline) is **keyed on stream identity** → the primitive must expose `reset()`, or the latch goes stale across streams. dev:smoke-gated (core primitive). |
| `disposablebag-keyed-timeout` | confirmed · aligned · **~−7 src** | A primitive *enhancement* — `replaceTimeout`/`replaceAnimationFrame` do **not exist yet**; net is small. The keys are still consumed by separate `cancel()` calls at teardown, which must keep working. dev:smoke-gated. |
| `disposable-host-base` | confirmed · aligned · **~break-even** | The cleanest 3-copies→1 single-source seam, but **break-even on LOC, not a reduction.** **SEQUENCE AFTER P2** (Awilix rewrites the same base-class constructors). Two invariants MUST be preserved: the `listen`-naming collision (`BaseService.listen` = eventBus subscribe vs `BaseOrchestrator.listen` = DOM `addEvent`) and the `disposables`/`_disposables` field-name split reached by ~12 subclasses. **dev:smoke-mandatory.** |
| `recording-transient-state` | confirmed · aligned · **~−7** | A value-object + factory for the 14 transient fields; the ctor and `_cleanupGpuRecording()` both collapse to one assignment. Low-blast, file-local. |
| GPU mining basket (`cleanup-dispose-dedup`, `release-and-clear-seam`, `transition-template`, `recreate-canvas-template`, `gpu-renderer-factory`, `message-bag-consolidation`, `disconnect-node-helper`) | confirmed · aligned/neutral · **~2–10 each, ~20–40 collectively for the P5 subset** | File-local extractions in the surviving GPU/streaming physics services. Each is small; the value is single-source/legibility. Low-blast. |
| `core-minimal-contract-consolidation` | confirmed · aligned · **~−9 type LOC** | `service.base.ts`'s `LoggerLike`/`StorageServiceLike` are byte-identical to core's `interfaces/{logger,storage}`; `LoggerFactoryLike` is a concrete specialization of `interfaces/factory`. Type-import swap, **preserve the `*Like` names via re-export alias**. Not a field-codemod — does **not** touch the boot-trap. **SEQUENCE AFTER P2** (`service.base.ts`'s DI part changes under Awilix). |
| `cache-into-performancecache` | confirmed (was needs-spike) · aligned · **~−15 (package LOC)** | `PerformanceCache` reimplements `Cache`'s LRU+TTL; compose so `Cache` becomes a real consumer. **Behavioral divergence on the eviction-guard must be pinned by a test first** (PerformanceCache evicts on `size >= maxSize` unconditionally; `Cache` skips eviction when the key already exists). Package-LOC → **src-ratchet-neutral**. dev:smoke-gated (core primitive). |
| `worker-protocol-guard-codegen` → **keep-not-Zod, extract shared predicate helpers only** | overclaimed · aligned · **~−30–50 gross, ~0 net realistic** | The doc's `keep` verdict stands: `worker-protocol.config.ts` carries `OffscreenCanvas`/`ImageBitmap` transferables (Zod can only `z.custom`-relocate, not remove the guards), its conditional required/optional typing is *more precise* than `z.infer`, and it is a same-app worker boundary (guard value near-zero). **The only move is extracting shared predicate helpers** (`isRecord`/required-field-type checks) to shrink the per-payload guards. Caveat: shared primitives **cannot import from `src/preload`** (layer boundary) — keep the helper file-local or in a package, never crossing the boundary. |
| `reactivity-rxjs-signals` | needs-spike · **conflicting-with-consistency** · **owner toggle, DEFAULT DEFER** | A one-off RxJS island **fragments** the eventemitter3 + DisposableBag mental model; worth it *only* if the render/audio pipelines also adopt it (codebase-wide reactive layer). Not executed unless the owner explicitly toggles it codebase-wide. |
| `delete-all-unused-primitives` | confirmed but **conflicting** · **NOT executed** | Real lines but **100% in `packages/prismgb-core` (0 coverage-src)** and **contradicts the future-first philosophy** (the **6** unadopted primitives `Pipeline`/`Store`/`Validator`/`Bus`/`Factory`/`Registry` stay as deliberate future-API seams; `Cache` is the one adopted, below). Explicitly kept. |
| `meta-codegen-elimination` (Dim 19) — the **dead-scripts removal** | derived · **P5 cleanup task** | The generators/artifacts are deleted **by P2/P3** as the swaps land. P5's job is to remove the **build-orchestration stragglers** they leave behind (`pretest`, `generate:contracts`, the vite DI plugin, knip's `di.generated` entry). |
| `build-turbo-nx` (Dim 19) | **reject expansion / drop vestigial turbo** | turbo is a vestigial devDep producing `dist/` the source-aliased runtime never consumes; full adoption would **reintroduce the stale-dist hazard the source-aliasing design deliberately eliminated.** The only move is *dropping* it. |

### ⚠️ Scope conflict resolved in favour of the spine — `notes-subscription-keyed-helper`

The task brief's parenthetical listed `notes-subscription-keyed-helper` in P5's GPU basket. **The overview overrides this** (scope-resolution table, `00-overview.md:63`): it is tagged **`⊘P4`** — superseded by the presentation rewrite. Verified: the seam lives in `src/renderer/presentation/features/notes/notes-panel.component.ts:412-442` (`this.trackSubscription(...)` ×3), a **presentation-layer file P4 deletes wholesale**. In the recommended order (P1→…→P4→P5), P4 runs first, so the file no longer exists when P5 starts. **P5 does NOT execute `notes-subscription-keyed-helper`.** It is recorded here only to document the resolution; do not relitigate it into P5.

---

## 2. Spike gate

**N/A — P5 is not a gated phase** (overview line 29: "none for the independent seams"). There is no fallback section (§10) for the same reason. The closest analog is the **sequencing precondition** for two task groups, which §3/§5 enforce explicitly:

- The **base-class seams** (D1 `disposable-host-base`, D2 `core-minimal-contract-consolidation`) MUST run **after P2** has merged (Awilix rewrites `BaseService`/`BaseOrchestrator` constructors). Precondition check before Stage D:
  ```sh
  git merge-base --is-ancestor <P2-squash-merge-sha> HEAD && echo "P2 landed" || echo "BLOCKED: rebase P5 onto post-P2 main"
  grep -n "Object.assign(this, dependencyMap)" packages/prismgb-core/src/primitives/service.base.ts \
    && echo "WARN: cradle Object.assign still present — P2 not fully landed" || echo "OK: Awilix base-class edits present"
  ```
- The **codegen-cleanup** (E1) MUST run **after P2+P3**. Precondition check before Stage E:
  ```sh
  test ! -f scripts/generate-di.js       && echo "OK: generate-di deleted (P2)"       || echo "generate-di.js present — P2 not landed OR P2 took the Spike-A FALLBACK (codegen kept): SKIP the generate-di cleanup, it is load-bearing"
  test ! -f scripts/generate-contracts.js && echo "OK: generate-contracts deleted (P3)" || echo "generate-contracts.js present — P3 not landed OR took its fallback: SKIP the generate-contracts cleanup"
  ```
  (If a generator is still present because its phase took its in-architecture **fallback**, that generator is load-bearing — E1 must **not** delete its references; only sweep the genuinely-dead `generate:contracts` alias + turbo.)
  If either file still exists, the cleanup stage is **blocked** — its deletions belong to the framework phase that owns the generator. Do not pre-delete a generator P5 doesn't own.

---

## 3. Scope

### What P5 EXECUTES (catalogue options)

`single-flight-primitive` · `disposablebag-keyed-timeout` · `disposable-host-base` (after P2) · `recording-transient-state` · GPU mining basket [`cleanup-dispose-dedup`, `release-and-clear-seam`, `transition-template`, `recreate-canvas-template`, `gpu-renderer-factory`, `message-bag-consolidation`, `disconnect-node-helper`] · `core-minimal-contract-consolidation` (after P2) · `cache-into-performancecache` · `worker-protocol` shared-predicate-helper extraction (keep-not-Zod) · codegen-straggler removal (after P2+P3) · drop vestigial turbo · W1 coverage-waiver / ADR ratchet verification.

### What P5 ADDS

New source (all coverage-neutral for the `src/**` ratchet — they land in `packages/prismgb-core`, outside the app scope, but require **package-level tests**, see §8):

| New file | Purpose | Est. LOC |
|----------|---------|---------:|
| `packages/prismgb-core/src/primitives/single-flight.ts` | `SingleFlight<T>` — in-flight-promise latch with `run(factory)` + `reset()` | ~35–45 |
| `tests/unit/packages/prismgb-core/single-flight.test.ts` | unit coverage (latch, settle-clears, reset, rejection-clears) — runnable path (`shared-node` project), per §8 | ~70 |
| `tests/unit/packages/prismgb-core/disposable-bag.keyed-timeout.test.ts` | keyed-timeout/AF helpers coverage — runnable path (`shared-node` project), per §8 | ~50 |
| (inline) `recording-transient-state.ts` value-object + factory, colocated under `services/gpu/` | the 14-field transient state | ~25 |

Edited in place: `DisposableBag` (+`replaceTimeout`/`replaceAnimationFrame`, ~12 LOC), `PerformanceCache` (compose `Cache`), `service.base.ts` (type-import swap), the three base classes → `DisposableHost`.

**Deps added: none.** (`reactivity-rxjs-signals` would add `rxjs`, but it is DEFERRED — not added.)

### What P5 DELETES (files + measured LOC, `wc -l`-verified)

These are deleted **by P2/P3**; P5 asserts they are gone and removes the build-orchestration references that point at them:

| Path | LOC (pre-deletion) | Deleted by | P5 action |
|------|-------------------:|------------|-----------|
| `scripts/generate-di.js` | 387 | P2 | assert absent; remove `pretest`/`vite` references |
| `scripts/generate-contracts.js` | 526 | P3 | assert absent; remove `pretest`/`generate:contracts` references |
| `src/renderer/application/di/di.generated.ts` | 368 (per catalogue) | P2 | assert absent; **verify** knip entry removed (P2 owns it) |
| `src/preload/validators.generated.ts` | 347 (per catalogue) | P3 | assert absent (P3 rewires consumers) |
| `src/types/preload-api.d.ts` | 109 (per catalogue) | P3 | assert absent |

P5's own deletions: `turbo.json` (16 LOC), the `turbo` devDep, and the two orphan turbo scripts (`build:packages`, `typecheck:packages`).

### What P5 does NOT touch

The presentation layer (all `⊘P4`), the IPC manifest/handlers (`⊘P3`), the DI container internals (`⊘P2`), and the 6 unadopted `@prismgb/core` primitives (`delete-all-unused-primitives`, kept).

---

## 4. Current → target state

**SingleFlight (4 surviving consumers, today each hand-rolled):**
- `device-media.service.ts:79,111-184` (`_enumerateInFlight`) and `:84,269-286` (`_permissionProbeInFlight`) — classic `if(pending)return pending; … finally{clear}`. **Caveat for `_enumerateInFlight`:** the wrap must preserve the cooldown-cache early-return (`:116-120`, returns `_lastEnumerateResult` inside the cooldown window *before* the in-flight latch fires a factory) and the conditional result-caching (`:175-176`, only writes `_lastEnumerateResult`/`_lastEnumerateAt` when `videoDevices.length > 0 || !connected`) — keep both around the `SingleFlight.run(...)` call, not inside the factory.
- `render-pipeline.service.ts:101,183-192` (`_cleanupPromise`) — same shape on cleanup.
- `audio-pipeline.service.ts:72,103-124` (`_startPromise`) — **keyed** (`this._startPromise && this._stream === stream`) → the primitive's `reset()` replaces the stream-identity guard.
→ **Target:** one `SingleFlight<T>` core primitive; each site holds a `SingleFlight` instance and calls `.run(() => …)`. Core's first real value-consumer.

**Keyed DisposableBag timeouts (7 sites, today `const h = setTimeout(...); replace(KEY, () => clearTimeout(h))`):**
`capture.service.ts:294-298` · `health.service.ts:83-87` · `gpu-worker-manager.ts:160-167` · `gpu-renderer.service.ts:548-553` · `gpu-recording.service.ts:331-334` (AF variant) · `viewport.service.ts:174-183` + `:218-225` · `performance-state.service.ts:211-215`.
→ **Target:** `DisposableBag.replaceTimeout(key, handler, delayMs, ...args)` and `replaceAnimationFrame(key, cb)` collapse each pair to one call; the existing `cancel(key)` teardown is unchanged.

**Base classes (3 re-wrap `DisposableBag` identically):** `BaseService` (109 LOC), `BaseOrchestrator` (122 LOC), `PresentationComponent` (148 LOC) each re-declare `track`/`replaceManaged`/`timeout`/`listen`/… delegators.
→ **Target (after P2):** one `DisposableHost` core base owning the delegators; the three extend it. **If P4 has already landed, `PresentationComponent` is gone → `DisposableHost` consolidates 2, not 3** (still a valid single-source win; note it in the PR).

**GPU recording transient state:** `gpu-recording.service.ts:42-55` (decls), `:62-79` (ctor init), `:304-329` (`_cleanupGpuRecording`) assign the **same 14 fields** twice.
→ **Target:** a `RecordingTransientState` value-object + `createInitialRecordingState()` factory; ctor and cleanup each become one assignment.

**Codegen pipeline:** today `pretest` (`package.json:56`) + the vite `diGeneratorPlugin` (`vite.config.js:14-28`) + `generate:contracts` (`package.json:54`) + knip's `di.generated.ts` entry (`knip.json:10`) all reference generators P2/P3 delete.
→ **Target:** zero references to the deleted generators/artifacts anywhere outside `docs/`.

**Build:** `turbo.json` + `turbo` devDep (`package.json:111`) + orphan scripts `build:packages` (`:18`) / `typecheck:packages` (`:36`), none referenced by `build`/`typecheck`/CI/husky.
→ **Target:** turbo fully removed; no stale-`dist/` orchestration.

---

## 5. Ordered task breakdown (risk-tiered)

Stages A–C are **independent of P2/P3** (run any time). Stage D is **after P2**. Stage E is **after P2+P3**. Validate after each task with the listed command; run the **full gate set (§6) after each stage**, not per task.

### Stage A — Core-primitive additions · MED · dev:smoke-gated · independent of P2

**A1. `single-flight-primitive`** — new primitive + 4 consumers.
- Add `packages/prismgb-core/src/primitives/single-flight.ts`: `class SingleFlight<T> { run(factory: () => Promise<T>): Promise<T>; reset(): void }` — holds `#pending: Promise<T> | null`; `run` returns the live promise if present, else stores `factory()` and clears it in `.finally()`; `reset()` nulls `#pending` (the keyed-consumer escape hatch). No `any`.
- Export from `packages/prismgb-core/src/index.ts` (alongside `DisposableBag`, line ~243).
- Rewire consumers to hold a `SingleFlight<…>` field and call `.run(...)`:
  - `src/renderer/infrastructure/services/devices/device-media.service.ts` — `_enumerateInFlight` (`:79,111-184`), `_permissionProbeInFlight` (`:84,269-286`).
  - `src/renderer/infrastructure/services/streaming/render-pipeline.service.ts` — `_cleanupPromise` (`:101,183-192`).
  - `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts` — `_startPromise` (`:72,103-124`); replace the `this._stream === stream` guard with `if (stream !== lastStream) singleFlight.reset()`.
- Validation: `npm run test:run -- device-media render-pipeline audio-pipeline` then `npm run typecheck`.

**A2. `disposablebag-keyed-timeout`** — primitive enhancement + 7 sites.
- Edit `packages/prismgb-core/src/primitives/disposable-bag.ts` (after `addAnimationFrame`, `:129`): add
  `replaceTimeout(key: DisposableKey, handler: () => void, delayMs: number, ...args): DisposableFunction` and
  `replaceAnimationFrame(key: DisposableKey, callback: FrameRequestCallback): DisposableFunction` — each does `cancel(key)`, schedules, and `replace(key, () => clear/cancel)`. Reuse the existing `replace`/`cancel` plumbing (`:80-107`).
- Rewire the 7 sites listed in §4. Leave each site's separate `cancel(KEY)` teardown call intact.
- Validation: `npm run test:run -- disposable-bag capture health gpu-worker-manager gpu-renderer gpu-recording viewport performance-state`.
- **Gate: `npm run dev:smoke`** (core-primitive edit).

### Stage B — File-local GPU/streaming seams · LOW · independent of P2

**B1. `recording-transient-state`** — `src/renderer/infrastructure/services/gpu/gpu-recording.service.ts`. Introduce `RecordingTransientState` (the 14 fields at `:42-55`) + `createInitialRecordingState()`; ctor `:62-79` and `_cleanupGpuRecording` `:304-329` each become `this._state = createInitialRecordingState()`. Preserve the `_recordingStream` track-stop side-effect (`:307-310`) *before* the reset. Validation: `npm run test:run -- gpu-recording`.

**B2. GPU mining basket** — `src/renderer/infrastructure/services/gpu/gpu-renderer.service.ts` (655 LOC). Pin and collapse, each file-local:
- `message-bag-consolidation`: route `_messageUnsubscribers` (`:108,164,273-327`) through a dedicated second `DisposableBag` (do **not** reuse `this.disposables` — it would be over-cleared).
- `cleanup-dispose-dedup` / `release-and-clear-seam`: the byte-identical `_cleanup()` (`:260`) / `dispose()` (`:651-653`) release-then-clear tails → one private helper.
- `transition-template` / `recreate-canvas-template` / `gpu-renderer-factory`: collapse the state-transition tails, the canvas-recreate template, and the renderer-construction switch into named private helpers (coordinate with `gpu-renderer-setup.ts`, 54 LOC).
- Validation: `npm run test:run -- gpu-renderer`.

**B3. `disconnect-node-helper`** — `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts:248-256`. Collapse the three `this._xNode?.disconnect()` + null blocks into one `disconnectNode(node)` helper. Validation: `npm run test:run -- audio-pipeline`.

### Stage C — Core primitive composition · LOW–MED · independent of P2

**C1. `cache-into-performancecache`** — **write the eviction-guard test FIRST** (TDD): assert `PerformanceCache` behavior on `set` of an existing key at `size === maxSize` (today it evicts unconditionally, `performance-cache.utils.ts:65-70`; `Cache` skips eviction when the key exists, `cache.ts:25`). Then refactor `PerformanceCache` (`:18-143`) to **compose** a `Cache<string, CacheEntry<T>>` for get/set/has/delete/clear, keeping the hit/miss stats + `getOrCompute`/`clearExpired`/`generateKey` surface and `AnimationCache` (`:145-206`) intact. Validation: `npm run test:run -- performance-cache cache`. **Gate: `npm run dev:smoke`** (core primitive; `animationCache`/`gpuFrameBuffer` are DI-constructed).

**C2. `worker-protocol` shared-predicate-helper** — `src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts` (357 LOC). Extract `isRecord(v): v is Record<string, unknown>` + required-field-type predicates used across the per-payload guards (`:204-357`); **keep** the transferable-carrying type declarations and the conditional required/optional typing (the `keep` verdict). Helper stays in `infrastructure/rendering/workers/` (renderer layer) — it must **not** import from or be imported by `src/preload`. **Not Zod.** Validation: `npm run test:run -- worker-protocol`.

### Stage D — Base-class consolidation · HIGH · SEQUENCE AFTER P2 · dev:smoke-mandatory

Run the §2 P2-landed precondition checks first.

**D1. `disposable-host-base`** — add `packages/prismgb-core/src/primitives/disposable-host.ts` owning the shared `DisposableBag` delegators (`track`/`replaceManaged`/`replaceManagedAsync`/`cancelManaged`/`timeout`/`interval`/`animationFrame` + the keyed helpers from A2). Make `BaseService` (109), `BaseOrchestrator` (122), and `PresentationComponent` (148) extend it. **Preserve both invariants:** (1) the `listen` collision — `BaseService.listen` = eventBus subscribe (`service.base.ts:59-67`) vs `BaseOrchestrator.listen` = DOM `addEvent` (`orchestrator.base.ts:88-95`); keep them as subclass-named methods, do **not** hoist a single `listen` into `DisposableHost`. (2) The `disposables` (protected, `service.base.ts:39`) vs `_disposables` (private, `orchestrator.base.ts:11`) field-name split reached by ~12 subclasses — `DisposableHost` must expose the bag under the name each subclass already uses (e.g. a protected `disposables` + an alias getter, or keep the field in each subclass and inject the bag). **If P4 has landed, drop `PresentationComponent` from this task** (file gone) — consolidate the two surviving base classes. Validation: `npm run typecheck && npm run test:run`. **Gate: `npm run dev:smoke` (mandatory).**

**D2. `core-minimal-contract-consolidation`** — `packages/prismgb-core/src/primitives/service.base.ts:3-25`. Replace the local `LoggerLike`/`StorageServiceLike` declarations with `import`s from core's `interfaces/{logger,storage}` and re-export them under the `*Like` aliases (preserve every external `LoggerLike`/`StorageServiceLike` import). `LoggerFactoryLike` stays as the concrete `{ create(name): LoggerLike }` specialization (do not widen to the generic `Factory`). Validation: `npm run typecheck` (watch `noUnusedLocals`) `&& npm run test:run`. **Gate: `npm run dev:smoke`.**

### Stage E — Cleanup · depends on P2+P3 · LOW

Run the §2 P2+P3-landed precondition checks first.

**E1. Codegen-straggler removal.**
- `package.json`: P5 **owns** deleting the dangling `generate:contracts` npm alias (`:54`) — P3 deletes the script it invoked but not this alias. **Verify** `pretest` (`:56`) no longer references either generator (P2 removed its `generate-di` half, P3 its `generate-contracts` half, and whichever ran second deleted the now-empty `pretest` key); if a straggler or an empty `pretest` key somehow remains, remove it. P5 is a *verify*, not the primary editor of `pretest`.
- `vite.config.js:14-28`: **verify P2 deleted `diGeneratorPlugin` + its `plugins:` registration (`:30`)**; if a straggler remains, remove it.
- `knip.json`: **verify P2 removed the `di.generated.ts` (`:10`) + `external-tokens.ts` (`:11`) entries** (these are the only explicit codegen entries; P3's `validators.generated.ts`/`preload-api.d.ts` have no explicit entry — they match knip's `**/*.generated.ts` glob, so nothing to remove there). Remove any straggler. (P2 owns the explicit-entry removal; P5 confirms.)
- Re-grep to prove zero stragglers: `grep -rIn "generate-di\|generate-contracts\|generate:contracts\|di\.generated\|validators\.generated\|preload-api\.d\.ts" . | grep -vE "node_modules|/dist/|/release/|docs/"` must return **only** lines P2/P3 own (ideally empty).
- Validation: `npm test` (bare — exercises the now-pretest-free path) `&& npm run lint:dead-code`.

**E2. Drop vestigial turbo.**
- Delete `turbo.json`. Remove the `turbo` devDep (`package.json:111`). Delete the orphan scripts `build:packages` (`:18`) and `typecheck:packages` (`:36`) — neither is referenced by `build`, `typecheck`, CI, or husky (verified: `grep -rIn "build:packages\|typecheck:packages\|turbo" .github .husky` → no matches).
- `npm install` to drop turbo from the lockfile.
- Validation: `npm run typecheck && npm run build:vite` (prove nothing relied on the turbo tasks).

**E3. W1 coverage-waiver / ADR ratchet verification.**
- `scripts/coverage-waivers.json` — P5 removes only **expired** waivers (the W1 cleanup: any whose `expiresOn` has passed; the original 2026-07-31 renderer-happy-dom waivers were already discharged when the floor was restored to 85). **Do NOT assert the array is empty, and do NOT delete P4's active ADR-0001 renderer-rebaseline waiver if P4 has landed** — that one is governed and time-boxed (overview line 116); deleting it would hard-fail `coverage:ratchet`. **No rebaseline is performed in P5** — the renderer-denominator rebaseline is **P4's** responsibility. P5 only asserts the ratchet still passes monotonically given P5's own deletions are `scripts/`/`packages/`/generated (src-ratchet-neutral).
- Validation: `npm run coverage:ratchet` and `npm run coverage:ratchet -- --check-monotonic --previous <prior-thresholds.json>`.

### Stage F — OPTIONAL / owner-toggle (DEFAULT: DEFER)

**`reactivity-rxjs-signals`** — NOT executed. Only pursue if the owner explicitly toggles a codebase-wide reactive layer (render + audio pipelines adopt RxJS too); a renderer-only island violates the consistency mandate. If toggled, it becomes its own spike-gated phase, not a P5 sweep.

### Agent allocation

| Stage | Risk | Execution | Agent / model |
|-------|------|-----------|---------------|
| A (core primitives + consumers) | MED | sequential, dev:smoke after | ME, or Coder(sonnet) per consumer with exact paths |
| B (file-local GPU/streaming) | LOW | parallelizable per file (no overlap) | Coder(sonnet) ×3, one file each |
| C (core composition) | LOW–MED | sequential, TDD on C1 | ME |
| D (base classes) | HIGH | sequential, ME only | ME |
| E (cleanup) | LOW | sequential | Coder(haiku) for the mechanical deletes, ME verifies grep |

B1/B2/B3 touch **disjoint files** (`gpu-recording`, `gpu-renderer`, `audio-pipeline`) → safe to parallelize. A/C/D edit `packages/prismgb-core` and must be **serialized** (shared files).

---

## 6. Gates checklist

Run the **full set before pushing each stage** (the husky pre-commit hook runs only `test:run`):

- [ ] `npm run typecheck` — primary catch for the base-class ref edits (D1) and the type-import swap (D2).
- [ ] `npm run lint` (includes `node scripts/check-layer-boundaries.js`) — critical for **C2** (worker-protocol helper must not cross `renderer`↔`preload`) and any new core primitive import.
- [ ] `npm run test:run` — all four vitest projects.
- [ ] `npm run build:vite` — required after **E1/E2** (vite plugin + turbo removal) and any base-class edit.
- [ ] `npm run dev:smoke` — **mandatory for A2, C1, D1, D2** (every core-primitive / base-class edit; `test:run` is blind to `useDefineForClassFields`/cradle-population regressions). The boot gate is "Renderer application started successfully" with no DI-resolution error.
- [ ] codegen-drift — **only meaningful until E1.** Once `generate-di.js`/`generate-contracts.js` are gone (P2/P3) and the `pretest` hook is removed, there is no drift gate to run; assert it is absent rather than green.
- [ ] `npm run coverage:ratchet` (+ `--check-monotonic`) — P5's src deletions are scripts/packages/generated (ratchet-neutral); confirm no `src/**` target regresses. New core primitives need package tests (§8), not src coverage.
- [ ] `npm run lint:dead-code` (knip) — after E1, prove no orphaned references to the deleted generated files remain.

Phase-specific note: `npm test` (bare) currently runs `pretest` → the two generators. After E1 that path changes; run bare `npm test` once post-E1 to confirm it no longer invokes a deleted script.

---

## 7. Rollback

- **Per stage:** `git revert <stage-squash-sha>` (one commit per task, conventional, ≤100-char subject, no AI attribution). Stages A–F are independent commits; reverting one does not disturb the others (disjoint files, except A/C/D which share `packages/prismgb-core` — revert those in reverse order D→C→A).
- **D1/D2 (base classes):** highest blast. `git tag pre-p5-stage-d` before Stage D; on a dev:smoke failure, `git reset --hard pre-p5-stage-d`. No data/config to restore — purely source.
- **E1/E2:** restore `turbo.json`, the `turbo` devDep, the `pretest`/`generate:contracts` scripts, and the vite plugin via the revert; then `npm install` to restore the lockfile. **Do not restore the deleted generators** (`generate-di.js`/`generate-contracts.js`) — those belong to P2/P3; if a P5 E-stage revert is needed it is because a *reference* was removed too early, not because a generator must come back.
- The new primitive files (`single-flight.ts`, `disposable-host.ts`, the recording value-object) are additive — reverting their commit removes them and their exports cleanly.

---

## 8. Test plan

**Added tests** (in `packages/prismgb-core/tests/**` AND mirrored under `tests/unit/packages/**` — note: `npm run test:run` uses `vitest.config.js`'s 4 projects and does **NOT** collect `packages/*/tests/**`; the runnable guard tests for the ratchet must live under `tests/unit/packages/**`, which is in the `shared-node` project include):
- `SingleFlight<T>`: latch (concurrent `run` returns same promise), settle-clears (next `run` re-invokes), rejection-clears, `reset()` mid-flight.
- `DisposableBag.replaceTimeout`/`replaceAnimationFrame`: schedules, replace-cancels-prior, `cancel(key)` clears, fires after delay.
- `PerformanceCache` eviction-guard: the **pinning test written first in C1** (existing-key set at capacity), plus the existing PerformanceCache suite stays green post-composition.
- `DisposableHost` (D1): a small fixture proving `track`/`replaceManaged`/`timeout` delegate identically for both a `BaseService` and a `BaseOrchestrator` subclass, and that `listen` semantics differ correctly per subclass.

**Changed tests:** the 4 SingleFlight consumers' suites (assert `.run()` behavior, esp. audio-pipeline's keyed `reset()`); the 7 keyed-timeout sites' suites (assert the helper path); gpu-recording/gpu-renderer/audio-pipeline basket suites; `service.base`/`orchestrator.base` suites (DisposableHost extraction); `worker-protocol` guard suite (predicate helpers).

**Deleted tests:** none in P5 (the codegen test deletions ride P2/P3; `tests/unit/preload/preload-api.invoke-contract.test.js:30` imports `validators.generated.js` and is deleted/rewritten **by P3**, not P5 — assert it is gone in E1).

**Coverage-scope impact:** new primitives are in `packages/prismgb-core` → **outside the `src/**` ratchet denominator** (src-neutral), but they raise the gpu-package/core package coverage need — add the package tests above. The file-local seams (B1–B3, C2) keep covered lines inside `src/renderer` → ratchet-neutral if the suites are updated in lockstep. No P5 deletion moves covered `src/**` lines out of scope (the generated/script files were never in `src/**` coverage, except `di.generated.ts` which P2 owns).

**dev:smoke expectation:** every core-primitive and base-class stage (A2, C1, D1, D2) must boot with "Renderer application started successfully" and no DI-resolution error. The keyed-timeout, SingleFlight, DisposableHost, and PerformanceCache edits all touch DI-constructed services (`animationCache`, `gpuFrameBuffer`, the GPU/streaming services), so dev:smoke is the load-bearing catch.

---

## 9. Definition of done

- [ ] `SingleFlight<T>` exists in `@prismgb/core`, exported, with the 4 consumers rewired (audio-pipeline uses `reset()`); package tests green.
- [ ] `DisposableBag.replaceTimeout`/`replaceAnimationFrame` exist; all 7 keyed-timeout sites collapsed; `cancel(key)` teardown still works.
- [ ] `RecordingTransientState` value-object + factory in place; gpu-recording ctor and `_cleanupGpuRecording` each one assignment; stream-stop side-effect preserved.
- [ ] GPU mining basket (B2) and `disconnect-node-helper` (B3) collapsed; `_messageUnsubscribers` on its own bag.
- [ ] `PerformanceCache` composes `Cache`; eviction-guard pinned by a test written first.
- [ ] `worker-protocol` shared predicate helpers extracted, transferable types + conditional typing kept, no preload boundary crossing, not Zod.
- [ ] (after P2) `DisposableHost` consolidates the surviving base classes; `listen` collision + `disposables`/`_disposables` split preserved; dev:smoke boots.
- [ ] (after P2) `service.base.ts` imports the core `interfaces/*` contracts under the `*Like` aliases.
- [ ] (after P2+P3) zero references to the deleted generators/artifacts outside `docs/` (`pretest`, `generate:contracts`, vite DI plugin, knip entry all removed); bare `npm test` runs without invoking a deleted script.
- [ ] turbo fully removed (`turbo.json`, devDep, orphan scripts); `build:vite` + `typecheck` pass.
- [ ] `coverage-waivers.json` has **no expired** waiver (W1 cleanup); **P4's active ADR-0001 rebaseline waiver is preserved if P4 has landed**; ratchet passes monotonically; renderer rebaseline left to P4.
- [ ] `reactivity-rxjs-signals` NOT added; `delete-all-unused-primitives` NOT executed.
- [ ] Full gate set (§6) green; one conventional commit per task, ≤100-char subjects, no AI attribution.

---

## 10. Fallback

**N/A — P5 is not a conditional phase** (no spike, §2). The only contingency is sequencing: if a P5 branch is opened before P2/P3 merge, Stage D (after P2) and Stage E (after P2+P3) are **blocked** by the §2 precondition checks — do the independent Stages A/B/C first and rebase D/E onto post-P2/P3 `main`. There is no framework fallback to name here.
