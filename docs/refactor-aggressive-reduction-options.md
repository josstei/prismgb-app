# Aggressive Code-Reduction Options — `refactor/codebase_reduction`

> Status: **COMPLETE — three sweeps.** Part I = 8 technique dimensions (top-down seam extraction). Part II = 5 empirical dimensions (jscpd + structural mining of the largest files + primitive audit). **Part III = framework adoption & subsystem replacement** (DI→Awilix, IPC→electron-trpc, presentation→Lit, validation→Zod, state→Zustand/XState, the device-domain consolidation, codegen elimination) — added after "think of ANYTHING irregardless of scale or time… frameworks… device cleanup." Part III is where the real mass is: the most actionable win is the **device domain** (~−700-1,250 lines, an extensible profile framework built for one device), the cleanest swap is **DI→Awilix** (the `cradle` is a hand-rolled Awilix clone), the strongest fit is **IPC→tRPC**. **Part IV** answers the owner's "I don't want hand-rolled UI" directive — which **supersedes Part III's "keep the presentation hand-rolled" verdict**: adopt **Solid + Ark UI/Zag.js + Floating UI (light DOM)** to delete ~981 LOC of hand-rolled ARIA primitives outright + re-author 29 components (−40-60%) while keeping all 5,271 CSS lines; reject full shadow-DOM component libraries (Shoelace is reportedly in maintenance as its successor Web Awesome takes over — verify before relying; and shadow DOM would force re-authoring the brand CSS + breaking the 9k-LOC test suite). **Part V** recomputes after the owner removed ALL constraints ("nothing is off limits; I don't care about the test suite"): the maximal answer is a **wholesale rewrite on a full styled component library — React + PrimeReact (or MUI; or Vue + PrimeVue)** — deleting ~72-76% of presentation TS and ~92-95% of CSS (brand → a theme), with the residual being compact app-logic + ~200 LOC of event-bus glue. Part V supersedes Part IV. See the Part V verdict.

## What this is

An exhaustive menu of code-reduction options for the prismgb-app monorepo, generated on request ("aggressive code reduction through decorators, primitive-driven abstraction, DI, interfaces, and any other ideas — any and all options irregardless of impact"). It is an **options catalogue, not an execution plan**: nothing here is scheduled or endorsed for execution. Each option is measured, gate-checked, and tagged.

### Method

8 reduction dimensions were fanned out to independent seeded agents (each given the codebase's hard invariants), every dimension's options were then **adversarially re-verified** against the real files, and the headline finding was additionally **reproduced by hand** (see below). **38 options across 8 dimensions: 13 confirmed · 13 overclaimed · 9 rejected · 3 needs-spike.** The honest shape of that distribution matters: only ~a third survived verification as confirmed reductions; the rest were inflated, capped by a layer/invariant, or net-zero "DRY" moves dressed up as reductions.

### Framing (the lens every option is judged through)

Reduction here means **push duplication up into a well-named seam** (decorator, primitive, generic engine, codegen, base class, interface) — *not* flatten or delete abstraction. This honours the standing architecture philosophy ("more abstraction, more structure, more rigor — not less"). Every option carries a **philosophy tag**:

- **aligned** — increases abstraction leverage / removes duplication into a seam (the ideal).
- **neutral** — pure mechanical dedupe, no architectural effect.
- **conflicting** — trades away an interface / layer / extensibility / a committed invariant to save lines. Included because "all options" was requested; **never** read as endorsed.

### Verdict legend

- **confirmed** — duplication is real, mechanism works, LOC roughly right, survives the gates.
- **overclaimed** — real, but the verified LOC is smaller than first claimed and/or it stresses more gates. The corrected number is shown.
- **needs-spike** — plausible but unverifiable without a prototype.
- **rejected** — the duplication isn't there, the mechanism breaks an invariant, or it isn't actually a net reduction.

### LOC numbers are honest, not gross

Several agents' first-pass LOC were inflated; the verify pass corrected them. Where a number is mostly *generated-string compression* (codegen template shrink) rather than *hand-maintained code removed*, that is stated — the maintenance win is the seam, not the line count.

---

## ⚠️ Read first — the most-cited "free win" is a trap

The single biggest visible duplication is the DI constructor field-mirroring: **~144 `this.X = dependencies.X` lines across 43 files** (≈131 of them in the 40 `BaseService`/`BaseOrchestrator` subclasses), each sitting on top of a base class that *already* runs `Object.assign(this, dependencies)`. It looks like a free `declare`-the-field-and-delete-the-assignment delete. **It is not.**

**Empirical proof (`di.generated.ts:139-152`):** the DI container constructs every cradle-injected `@Service` class as `new X(this.cradle)` (48 of the 56 sites; the rest use `new X()` or manual providers), where `cradle` is

```js
new Proxy({}, { get: resolveToken, has: …, ownKeys: () => [] })
```

`Object.assign(this, cradle)` enumerates the source's **own keys** → `ownKeys` trap returns `[]` → **it copies nothing**. So the base-class `Object.assign` is a **dead no-op** for all 48 cradle-constructed sites, and each subclass's `this.X = dependencies.X` (which fires the `get` trap and resolves the token) is the **sole** runtime populator.

Hand-reproduced to settle a direct disagreement between two verifier agents:

```
cradle.eventBus via get-trap   : RESOLVED:eventBus
Object.assign copied keys      : []
WithAssign.eventBus (status quo): RESOLVED:eventBus
DeclareOnly.eventBus (codemod)  : undefined   <-- boot-break
```

**Consequences for any option touching this target:**

1. `declare readonly X` + delete the assignment leaves the field `undefined` at boot. Worse, `declare` *silences* the `TS2564` error that would otherwise catch it — so the naive codemod ships a **green typecheck** and fails only at `dev:smoke`. (This is exactly why the out-of-box dimension's "confirmed safe ~126-line win" verdict is **wrong** and is reclassified as rejected here.)
2. A safe delete must **add a runtime populator** — e.g. the base loops over an emitted per-class dependency-name list and pulls each from the cradle. But only **17 of 56** `@Service` classes declare a `dependencies` array today; the other 39 resolve lazily with no array, so they must be **back-filled first**. After the populator + back-fill + emitted map, the net is **≈ −38**, not −126.
3. The alternative — a generic `BaseService<TDeps>` exposing `this.deps.X` — deletes the field declarations too (**~150-200 gross**) but rewrites the **entire `this.X` injected-field read surface (several hundred sites — `this.eventBus` alone is ~146)** across the ~40 subclass files (very high blast; the ~144 figure is the *assignment* count, not the read-site count).

**This is process-wide, not renderer-only.** The *main* container uses the **identical** empty-`ownKeys` cradle (`container.ts:92-105`, `ownKeys: () => []`) and constructs `windowService`/`trayService`/`ipcHandlerRegistry` as `new X(this.cradle)` (`container.ts:117-124`). So the same trap applies to cradle-constructed main services — any `declare`-and-delete of their `this.X = dependencies.X` mirrors breaks at boot too. (This corrects the main-scope sub-agent's claim that `declare` is "safe" there — see the footnote on `dedupe-main-service-structural-contracts`.)

So the DI-boilerplate target is **real but capped**. Treat the line count as a mirage and weigh the two viable mechanisms below on their true net + blast.

---

## Where to start — one integrated priority path (spans all three parts)

The menu is large (3 sweeps, dozens of options). If you want a single ordered path for the big-swing intent, this is it:

1. **Device Tier-1 — now, no spike, no dependency** (Part III, Dim 18). The *only* large win tagged **recommend**: collapse the extensible profile/registry framework that serves one device → **~−700-800 src + −550 test, zero extensibility lost**. This is the direct answer to "device cleanup," and it ships without a framework bet.
2. **Awilix bundling spike — ~30 minutes** (Part III, Dim 14). One check: does `awilix` import clean in the Vite renderer build? If yes → **~−600**, no constructor changes, deletes a 387-line codegen. Cheapest big swing.
3. **tRPC one-channel spike — ~a day** (Part III, Dim 15). Prove `transcode:progress` end-to-end under `sandbox:true` + dev:smoke. If it holds → unlocks IPC **~−700-900** *and* the codegen **~1,737** as a consequence. Highest ceiling of any single move.
4. **Opportunistic / deferred:** the Part I/II seam wins (IPC envelope factory, `SingleFlight`/`DisposableHost`, the low-blast basket) as you touch those files; Lit per-component, RxJS, and device Tier-2 only if their preconditions land.

**The real decision is not LOC — it's the contract guarantee.** Awilix (Dim 14) and tRPC (Dim 15) each **undo the build-time codegen-drift validation the team deliberately built in Increment A** (the `@Service` topo-sort hard-error; the manifest cross-validation). They move that guarantee to runtime (`resolve-all` + dev:smoke for Awilix; type-inference for tRPC, with the `eventChannels→@prismgb/events` mapping as a genuine regression). For a future-first / strict-contracts codebase that just *added* that guarantee, choosing to trade it for ~1,300 fewer lines is the actual call — make it deliberately, not by stumbling into the LOC.

## Recommended shortlist (confirmed · low-blast · aligned-or-neutral)

These survived adversarial verification, stress no boot/codegen gate dangerously, and move duplication into a legible seam. Rough order by reward/effort. **Overlap caveats are flagged** — do not sum naively.

| ID | Dimension | Net LOC | Blast | Tag | One-liner |
|----|-----------|--------:|-------|-----|-----------|
| `validators-library-extraction` | codegen | ~315¹ | med | aligned | Move the validator library out of the generator's template string into real typed source; emit only the two tables |
| `container-engine-primitive` | codegen | ~233 gross² | med | aligned | Extract the regenerated DI container machinery into a hand-written `ContainerEngine`; generate only a token→factory map |
| `consolidate-preload-api-factories` | main/preload | ~55-60 | med | aligned | Collapse the near-identical per-API preload wrappers into one manifest-driven factory |
| `ipc-error-envelope-mapper-factory` | main/preload | ~33-57 | low | aligned | Push the 15 duplicated handler failure-envelopes into one `@prismgb/ipc` mapper primitive (range — see Part II reconciliation) |
| `dedupe-main-service-structural-contracts` | main/preload | ~42³ | low | neutral | Replace re-declared main dep contracts (loggerFactory shapes + registry interfaces) with existing named types |
| `vertical-slider-control-primitive` | presentation | ~25-40 | low | aligned | Collapse shader-slider's twin brightness/volume blocks into one parameterised slider primitive |
| `import-canonical-core-contracts` | interfaces | ~24-28 | low | aligned | Import `Logger/EventBus/Storage` contracts from `@prismgb/core` instead of redeclaring them locally |
| `shared-presentation-dom-contracts` | interfaces | ~20-30 | low | aligned | Lift duplicated DOM-element structural shims into one presentation `dom-contracts` primitive |
| `registry-interface-dedup` | codegen | ~21³ | low | neutral | Stop redeclaring the 5 handler service interfaces in `ipc-handler.registry.ts`; import them (~30 gross deleted − ~9 `Pick<>` composition added) |
| `panel-hidden-visibility-method` | presentation | ~10-12 | low | neutral | Dedupe the `aria-hidden` + `inert` toggle (3 copies) into a `PresentationComponent` method |

¹ `validators-library-extraction` ~315 is genuine de-duplication: the validator library currently exists **twice** (escaped template string in `generate-contracts.js` *and* the committed `validators.generated.ts`). The win is single-source + direct testability, not new typing (the generated output is already typechecked/linted).
² `container-engine-primitive` ~233 is mostly generated-string compression; the real win is ~71 lines of byte-identical container machinery becoming **one tested file** + a smaller generator. Carries a construction-ordering hole (subclass field initialisers run after `super()`) — pass factories into `super(FACTORIES)` or expose them via an abstract getter, never a subclass field. Gate-caught if wrong.
³ **Overlap:** `registry-interface-dedup` (codegen dim) and part (b) of `dedupe-main-service-structural-contracts` (main dim) target the **same** redeclared interfaces in `ipc-handler.registry.ts:25-56` (~30 lines gross, ~21 net after the `Pick<>` composition). Count this ~21-net once.

> Two of these already-divergent copies have **rotted**: `ipc-handler.registry.ts:49` types `format: string` while the authoritative `transcode.handler.ts:14` types `format: TranscodeFormat`. The dedupe also fixes a live drift.

---

## Cross-dimension overlaps (synthesis the per-dimension agents could not see)

Independent finders converged on the same targets from different angles. Collapse these before costing any program:

- **DI declaration boilerplate has two *distinct* targets — don't conflate them:**
  - *Field-mirroring* (the `this.X = dependencies.X` lines) is attacked by **7 mechanisms across 3 dimensions** — all the same ~131-144 lines: the six in the Dim 1 table (`codegen-emitted-deplist-base-pull`, `typed-dependency-base-seam`, `service-decorator-runtime-deps-attach`, `narrow-object-construction-codegen`, `declaration-merged-generated-interface`, `declare-only-naive-codemod`) plus `declare-injection-seam` (Dim 8, *wrongly* confirmed → reclassified rejected — mechanically the same declare-and-delete as `declare-only-naive-codemod`). Capped + boot-trap — see the headline box.
  - *The `@Service` dependency array* (`infer-service-deps-from-constructor-type`, Dim 2) is a **different, cleaner** target: the 17 hand-written arrays, removed by inferring from the constructor type. No boot-trap, ~70-100 lines, and it strengthens the build guard. If only one DI-declaration reduction is pursued, this is the better one.
- **IPC envelope** is one cluster, not three options: `ipc-error-envelope-mapper-factory` (error side, confirmed ~−33 to −57), `ipc-result-envelope-engine` (error+success, overclaimed ~40), and `activate-dormant-responsemode-success-envelope` (success side, overclaimed ~0). The **error side** (`ipc-error-envelope-mapper-factory`) is the clean win; the success side requires reclassifying 3 transcode manifest entries to `bare` and is near-zero LOC.
- **Registry interface dedup** is double-listed (`registry-interface-dedup` ≈ `dedupe-main-service-structural-contracts` part b).
- **Disclosure / panel visibility** overlap in presentation: `disclosure-host-base-component`, `panel-hidden-visibility-method`, and the `notes-panel`-hand-rolls-`DisclosureController` finding all touch the same primitive convergence.

---

## Dimension 1 — DI / constructor dependency-mirroring

See the headline box for the empirical core. The six mechanisms (five real + one strawman, listed so reviewers reject it on sight), ranked:

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `codegen-emitted-deplist-base-pull` | overclaimed | ~−38 | med | aligned | Emit per-class dep-name statics into `di.generated`; base pulls them from the cradle. Net small after the 39-array back-fill + emitted map. The **only** fully-safe delete mechanism. |
| `typed-dependency-base-seam` | confirmed | ~150-200 gross | high | aligned | Generic `BaseService<TDeps>` exposing `this.deps.X`; deletes field decls too but rewrites the **entire injected-field read surface (several hundred `this.X` sites, not the 144 assignments)** across ~40 files. Typecheck-guarded (removing the field makes `this.X` a compile error, forcing the rewrite). Excludes the 29 `PresentationComponent` subclasses (no `Object.assign` base — their assignments are load-bearing). |
| `service-decorator-runtime-deps-attach` | overclaimed | ~−90 | med | **conflicting** | Make `@Service` attach `dependencies` as a runtime static; base pulls it. Functionally sound but **breaks the committed `@Service`-is-zero-runtime invariant** (it runs at all 56 `@Service` sites — renderer + packages; main has no `@Service`). |
| `narrow-object-construction-codegen` | rejected | ~0 to +40 | med | neutral | Codegen narrow `{eventBus: resolve('eventBus'), …}` objects so `Object.assign` becomes real. Net-positive LOC (relocates mirror lines into generated code) — a maintainability move, not a reduction. Still needs the 39 back-fill. |
| `declaration-merged-generated-interface` | rejected | n/a | high | **conflicting** | Generate `interface X extends XDeps {}` to erase field decls. **Breaks `private` visibility** (merged interface members are inherently public) and the codegen has no type source (it knows dep *names*, not types). |
| `declare-only-naive-codemod` | rejected | 0 | high | neutral | The tempting one-liner. **Verified boot-break** (see headline). Listed so reviewers reject it on sight. |

---

## Dimension 2 — Decorator leverage

The decorator surface is deliberately thin: `@Service` is the only decorator, and it is a **build-time AST marker with zero runtime** (`decorators.ts:21-23`; `generate-di.js` reads its options object syntactically). Three ideas — only one substantive.

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `infer-service-deps-from-constructor-type` | needs-spike | ~70-100 | high | aligned | Delete all 17 hand-written `@Service` dependency arrays by inferring them from the constructor's typed param; needs a TypeChecker upgrade to the generator. The genuine win. |
| `method-decorator-log-catch` | rejected | ~0 | med | neutral | `@LogEntry`/`@Catch` for orchestrator log-then-delegate/try-catch; tiny count, adds the first method decorators (dev:smoke risk) + decorator infra. |
| `class-decorator-passthrough-codegen` | rejected | n/a | high | **conflicting** | Same as `orchestrator-passthrough-codegen` (Dim 8) — mechanically impossible. |

**`infer-service-deps-from-constructor-type` (needs-spike, ~70-100 LOC, aligned) — the genuine decorator win, and a cleaner DI-declaration reduction than the field-mirroring of Dimension 1.** The `@Service` `dependencies` array is hand-maintained but **duplicates the constructor's typed parameter**: `update.orchestrator.ts:42-46` lists `["updateService","updateUiService","loggerFactory"]` — exactly the members of `UpdateOrchestratorDependencies` (`:34-38`). Only **17 of 56** classes declare the array, and `generate-di.js` reads it **only** to (a) order the topological sort and (b) hard-error on an undeclared dep (`generate-di.js:212-220`). It does **not** drive injection — every dependency-injected class is built `new X(this.cradle)` (48 of 56; the rest are parameterless `new X()`) and the cradle resolves lazily (`:287`), which is *why* the 39 array-less classes already work. So the array is pure duplication of the param type. **Mechanism:** upgrade `generate-di.js` to resolve the constructor's first-parameter type and enumerate its member names as the tokens — deleting all 17 arrays **and** extending the undeclared-dep build guard from 17 to all 56 classes (a correctness gain, not just LOC). **Why needs-spike:** the scanner is syntax-only today (`ts.createSourceFile` per file, `:106`, no type checker); resolving a *named/imported* param interface needs a full `ts.Program`/TypeChecker — the unverified part (inline-object-typed params would resolve syntactically, but most use named interfaces). **Gates:** codegen-drift (generator rewrite) + dev:smoke (topo order + guard must stay correct). **Net:** ~70-100 source lines (the 17 multi-line arrays) removed for ~30-60 lines of generator growth that lives in `scripts/` (coverage-exempt). Unlike the field-mirroring target, this has **no boot-trap** and strengthens a guard — the better DI-declaration reduction of the two.

**`method-decorator-log-catch` (rejected, ~0):** `@LogEntry`/`@Catch` could drop the `this.logger.info(...)`-then-delegate line in a few orchestrator methods (`update.orchestrator.ts:78-91`, 3 methods) and try/catch-map blocks. But the count is tiny, it introduces the **first method decorators** in the renderer (esbuild decorator-emit risk, dev:smoke-only catch) and needs a decorator definition + `emitDecoratorMetadata` — net ~0 for added infra + risk.

**`class-decorator-passthrough-codegen` (rejected, conflicting):** Identical to `orchestrator-passthrough-codegen` (Dimension 8) — `@Service` carries no method metadata and `generate-di` emits a container, not method bodies; impossible without a new forwarding DSL, and it would trade the legible hand-edited orchestrator seam for generated opacity.

---

## Dimension 3 — Primitive under-use

Honest headline: primitive *under*-use is a **thinner seam than expected**. The one real target needs test edits to land; the rest are primitive *enhancements* (the primitive doesn't exist yet) or category mismatches — not under-use of an existing primitive.

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `disposable-bag-under-use-adapters` | overclaimed | ~28-32 | low | aligned | Route hand-rolled listener/unsubscriber bookkeeping through the existing `DisposableBag`. **`test:run` fails as-is** → ~6 unit-test edits required. |
| `keyed-registry-primitive-promotion` | overclaimed | ~15-30 | med | aligned | Promote the keyed registry to a `@prismgb/core` primitive; 3 bespoke registries extend it. Promotion+creation, not under-use; capped by domain-named APIs. |
| `keyed-managed-timer-seam` | overclaimed | ~0 | med | aligned | A new `DisposableBag.replaceTimeout(key)` helper. Idiom-dedup; net ~0 (the helper doesn't exist → enhancement, not under-use). |
| `emitter-consolidation-onto-core-bus` | rejected | ~0 | med | **conflicting** | Fold 4 hand-rolled emitters onto core `Bus`. Category mismatch — would regress `no-any` and drop behaviour. |

**`disposable-bag-under-use-adapters` (overclaimed, ~28-32 net, aligned):** Several adapters hand-roll bound-handler fields + manual `removeEventListener`/unsubscriber arrays that the existing `DisposableBag` (`disposable-bag.ts:109-117`) already models via `addEvent()`/`clear()`/`cancel()`. Clean targets: `visibility.adapter.ts:9-28`, `reduced-motion.adapter.ts:10-37`, `stream-track-monitor.ts:8-49`, and `gpu-renderer.service.ts`'s `_messageUnsubscribers` (needs its *own* second bag so the shared `this.disposables` isn't over-cleared). **Gate hole:** `test:run` **fails as-is** — `DisposableBag.addEvent`'s removal passes a trailing `undefined` options arg (breaks `visibility.adapter.test.js:86-89`'s 2-arg assertion), and it uses one options object for both add+remove (can't satisfy `user-activity.adapter.test.js`'s asymmetric `{passive}`/`{capture}`). ~6 test files must be edited. `dispose()` must also become `Promise<void>` (clear() is async; DI disposal already awaits). **Drop** `browser-media.adapter` (its `_listeners` Map backs a public contract) and `preload-event-bridge` (loses per-failure logging, flips to AggregateError-throw). A low-blast aligned move worth ~30 source lines — but a "fix the tests + scope carefully" item, not a free win.

**`keyed-registry-primitive-promotion` (overclaimed, ~15-30, aligned):** `preset-registry`, `device-profile.registry`, and `component.registry` each duplicate a keyed-`Map` + default-id + get/getAll/has surface. But core `registry.ts` is a Set+releaser, so **no keyed-registry primitive exists** — this is promotion+creation, not under-use. LOC capped because the public APIs are domain-named (`getProfileById` vs `get`) so folding without renaming needs delegating wrappers; `device-profile`'s USB secondary index and `preset`'s freeze/auto-default stay subclass-local. Moving `typed-registry.factory.ts` out of `src/shared` into a package also shifts coverage scope.

**`keyed-managed-timer-seam` (overclaimed, ~0):** The `cancel + setTimeout + replace(clearTimeout)` idiom (5 real sites: `health.service.ts:83-87`, `performance-state.service.ts:211-215`, …) could collapse to a new `DisposableBag.replaceTimeout(key)`. But that helper doesn't exist yet (a primitive *enhancement*), the keys are still consumed by separate `cancel()` calls, and 2 cited sites don't fit (`viewport.service.ts` nulls a field the disposer reads). Net ~0 — a DRY/legibility move.

**`emitter-consolidation-onto-core-bus` (rejected, conflicting):** Folding `SharedEventBus`/`browser-media`/`usb-device-monitor`/`gpu-worker-manager` onto core `Bus` fails — each is a category mismatch (typed error-routing dispatcher vs cleanup-tracker vs node USB-hotplug forwarder vs single-handler-per-type), and `Bus` is `Record<string, any>`, so it would regress the typed buses and drop error routing / by-handler unsubscribe.

---

## Dimension 4 — Codegen & manifest consolidation

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `validators-library-extraction` | confirmed | ~315 | med | aligned | See shortlist ¹. Single-source the validator library; `validators.generated.ts` shrinks to two tables + re-export. Coverage-neutral (already in `src/**` denominator). 7 preload consumers must keep resolving. |
| `container-engine-primitive` | confirmed | ~233 gross | med | aligned | See shortlist ². `ContainerEngine` base owns cache/register/resolve/dispose; generated subclass becomes imports + one-line factory map. `container.ts` only touches `new GeneratedContainer()`, `.cache`, `.dispose()` — surface preserved. |
| `ipc-result-envelope-engine` | overclaimed | ~40 | med | aligned | Make the dead `responseMode:'result-envelope'` load-bearing; delete 12 boilerplate `mapError` envelopes. Error side solid (~60 deletable − ~20 engine). **Success-wrap blocked** until 3 transcode entries are reclassified `bare` (they legitimately return `success:false`). Handler tests assert exact shapes → `test:run` churn. |
| `registry-interface-dedup` | confirmed | ~21 net (~30 gross) | low | neutral | See shortlist ³. Export the 5 handler-local service interfaces; registry imports them via `Pick<>` (~30 deleted − ~9 composition). Fixes the live `format: string`↔`TranscodeFormat` drift. |
| `single-manifest-superset-codegen` | needs-spike | ~80-120 soft | high | aligned | One manifest-driven generator emits the hand-written-then-runtime-validated bridge mirror tables too, behind a shared `GeneratedModule` emit+drift primitive. **Mostly removes active runtime drift-guards** — regresses drift safety unless a real generated-vs-committed diff gate is added **first** (none exists today; `pretest` silently regenerates). Risk of a `core`/`util` generator junk-drawer. |

---

## Dimension 5 — Presentation primitive consolidation

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `vertical-slider-control-primitive` | confirmed | ~25-40 | low | aligned | Twin brightness/volume blocks are byte-identical bar the field name (`shader-slider-controls.component.ts:206-214` ≡ `238-246`). One parameterised primitive + two instances. Asymmetric side-effects (echo epsilon 0.01 vs 0.5, transforms) become per-instance hooks. Clean. |
| `panel-hidden-visibility-method` | confirmed | ~10-12 | low | neutral | `aria-hidden`+`inert` toggle has 3 copies; lift to a `PresentationComponent` protected method (not a `-util` file). Also exposes a latent redundancy: `listbox-dropdown` double-manages the same element its inner `DisclosureController` already toggles. |
| `disclosure-host-base-component` | overclaimed | ~10-20 | med | aligned | Real, valuable direction — **`notes-panel` hand-rolls a parallel `DisclosureController`** (reimplements `_applyOpenState`/escape-listener). But LOC is dominated by behavioural risk: converging adds `inert` + click-outside-to-close it lacks today; a single-disclosure base doesn't model settings-menu's two disclosures. |
| `managed-element-binding-seam` | overclaimed | ~20-50 | high | aligned | `@ManagedRef`/`ManagedElements` over `dom-bindings`. Of 163 `this.X = null` reclaim lines only ~75 are DOM-typed; the rest are services/callbacks/observers a element-seam can't reclaim. The **decorator** form introduces the first property decorators in presentation (esbuild decorator-emit risk, `dev:smoke`-only catch); the **mixin** form is build-safe but captures less (~20). |
| `listbox-option-navigation-primitive` | overclaimed | ~5-15 | med | aligned | At exactly 2 consumers with **divergent** active-state models (roving tabIndex vs `aria-activedescendant`) the truly-shared surface is ~3 identical lines + a clamp helper. Near break-even; a naming move more than a reduction. |
| `managed-child-component-set` | overclaimed | ~0-15 | med | aligned | `Promise.all(child.dispose())` + identity-guarded reclaim. The guard **writes back to owner fields** — a primitive can't without owning the children (rewrite every `this.listView!` accessor → blast explodes) or per-field setters (trips `no-any` → savings erased). Break-even at best. |

---

## Dimension 6 — Interface & delegation duplication

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `import-canonical-core-contracts` | confirmed | ~24-28 | low | aligned | 5× `LoggerFactoryLike`, plus `LoggerLike`/`EventBusLike`/`StorageServiceLike` redeclared byte-identical to `@prismgb/core`'s exports. Import them. Watch `noUnusedLocals` on orphaned `LoggerLike` imports after the swap. `@prismgb/*` imports are layer-exempt. |
| `shared-presentation-dom-contracts` | confirmed | ~20-30 | low | aligned | `EventTargetLike` (identical ×2 + a 3rd copy of core's internal), `ClassListLike`/`ButtonElementLike`/`TextElementLike` redeclared per-component. Lift into `presentation/primitives/dom-contracts.ts` (same-layer, boundary-clean). Mild superset-widening. |
| `canonical-service-contract-interfaces` | overclaimed | ~40-60 | med | aligned | Promote duplicated domain `*Like` views into one exported contract per service, consumed via `Pick<>`. **Layer-boundary capped**: `SettingsServiceLike` (app+infra+presentation) has no legal single `src/` home (presentation↔infra mutually forbidden) → needs a `@prismgb/contracts` package. **All-infra clusters** (`GpuRendererServiceLike`, `BrowserMediaServiceLike`) are realisable today. |
| `typed-dependency-base-seam` | confirmed | ~150-200 gross | high | aligned | (Same target as Dimension 1 — see there.) |
| `generic-delegation-facade-primitive` | rejected | ~0 | med | **conflicting** | A `Proxy`/`DelegatingFacade<T>` to auto-forward orchestrator pass-throughs. `Proxy` returns `any` (breaks `no-any`), and 3 of 6 update-orchestrator forwarders aren't pure (carry `logger.info`). Only real deletion is 2 production-dead fullscreen forwarders — a dead-code finding, not this mechanism. |

---

## Dimension 7 — Main + preload scope

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `consolidate-preload-api-factories` | confirmed | ~55-60 | med | aligned | `device`/`window`/`update` preload-api files are the same body (3 files deleted) → one `createManifestPreloadApi<TApiName>` in `subscription.factory.ts`. Per-API type precision preserved via `NonNullable<Window[TApiName]>`. `transcode`/`gpu`/`loginItem` keep their bespoke factories. Surfaces a bonus: device's redundant `DevicePreloadAPI` interface. |
| `ipc-error-envelope-mapper-factory` | confirmed | ~33-57 | low | aligned | 15 `mapError` closures, each with the identical `error instanceof Error ? … : 'Unknown error'`. One `createErrorEnvelopeMapper<TResponse, TDeps>` in `@prismgb/ipc`. Needs optional `logMessage` (login-item.get doesn't log) + `defaultFields` (3 extra-field cases) + a default type-arg. Byte-identical output → tests green. (Net is a range — see the Part II reconciliation; ~−50 realistic.) |
| `dedupe-main-service-structural-contracts` | confirmed (parts a+b) | ~42 | low | neutral | (a) inline `loggerFactory` shapes → `LoggerFactoryLike` (~21); (b) registry interfaces → `Pick<*HandlerDependencies>` (= `registry-interface-dedup`, ~21). **Part (c) — converting the 7 field mirrors to `declare readonly` — is DROPPED as a boot-trap**, not a safe dedupe (see ⁴). |
| `codegen-main-di-container-via-service` | needs-spike | net <20 | high | aligned | Lift the hand-written main switch-container into the `@Service` codegen seam. **Breaks `codegen-drift` as-described**: `generate-di.js` scans `packages/*/src` and emits the *renderer* container — decorating the 5 main-used package services would inject them into the renderer with main-only deps → topological-sort hard-error. Requires process-scoped scan + split emit + a 2nd drift check first. |
| `activate-dormant-responsemode-success-envelope` | overclaimed | ~0-6 | med | **conflicting** | (Same IPC-envelope cluster — see Dimension 4.) Most `success:true` are inline tokens (deleting them removes 0 lines); behaviour-changing on every channel; the line-saving `bare`-return impl erodes the per-invoke typed-response contract. |
| `flatten-main-di-container-to-direct-instantiation` | confirmed | ~100-120 | high | **conflicting** | Delete `MainServiceContainer`, `new` the ~13 services directly in bootstrap. Trades away the DI container, cradle loose-coupling, uniform dispose lifecycle, and the override test seam — the direct inverse of `codegen-main-di-container`. Included for completeness; not endorsed. |

⁴ **Part (c) is the headline boot-trap, not a safe dedupe** — the main sub-agent had it inverted. The cited field mirrors live in `ipc-handler.registry.ts` and `tray.service.ts`, both constructed `new X(this.cradle)` (`container.ts:120-124`) with the **same empty-`ownKeys` cradle** as the renderer (`container.ts:103`). So `Object.assign(this, cradle)` copies nothing, the `this.X = dependencies.X` assignment is the sole populator, and `declare`-and-delete leaves the field `undefined` at boot (green typecheck, fails `dev:smoke`). Keep the assignments — only parts (a) and (b) (interface dedup) are safe, netting ~42.

---

## Dimension 8 — Out-of-box / cross-cutting

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `worker-protocol-guard-codegen` | overclaimed | ~30-50 | med | aligned | `worker-protocol.config.ts` declares types (31-134) and mirrored runtime guards (204-357). The grand "schema → both" mechanism rests on a false premise — `generate-contracts.js` embeds guard bodies as a literal string, it is **not** a schema→guard compiler. Realistic win: extract shared predicate helpers (`isRecord`/required-field-types) to shrink the per-payload guards; a real DSL is needs-spike. Shared primitives can't import from `src/preload` (layer boundary) → need a package. |
| `declare-injection-seam` | **rejected** (was "confirmed") | 0 | low | neutral | The out-of-box dimension's headline. **Reclassified rejected** — it is the same mechanism as `declare-only-naive-codemod`: `declare` + delete-assignment relies on the base `Object.assign(this, cradle)`, which is a **no-op** (see headline + repro). The verifier's claim that "TS2564 is the primary catch" is backwards — `declare` *silences* TS2564, so it ships green and breaks at boot. |
| `orchestrator-passthrough-codegen` | rejected | n/a | high | **conflicting** | Generate the orchestrator delegation layer from `@Service`. **Mechanism broken**: `@Service` carries only token/lifecycle/disposal/dependencies — zero method metadata — and `generate-di.js` emits a container, not class method bodies. Would need a new forwarding DSL + source generator; trades the most legible hand-editable seam for generated opacity. |
| `unified-di-ipc-events-manifest` | rejected | ~0 | high | **conflicting** | One engine driving DI + IPC + events. The shared scaffolding lives in `scripts/` (913 lines) which coverage doesn't measure → **0 src reduction**; emitted artifacts don't shrink. Also mischaracterises `@prismgb/events` (a runtime reader, not a 3rd generator). Worst risk/reward of the set. |

---

# Part II — Second sweep: empirical structural mining

The first pass was top-down by technique. This one is bottom-up by *evidence*: clone detection (jscpd) across `src`+`packages`+`tests`, per-file structural mining of the 10 largest files (one agent each, to dodge the output stall), a core-primitive adoption audit, a cross-package contract sweep, and capped test/CSS passes.

## Second-sweep verdict (honest)

**The codebase is genuinely well-factored — and that is itself a finding, not a dodge.** jscpd (v5, default settings, `src packages tests`) finds only **~1.3-2% duplicated lines** (config-dependent), with **roughly half the clones touching test files**; and under *structural* inspection (the duplication jscpd can't see), the adversarial verify repeatedly turned "looks duplicated" into **intentional minimal-interface-per-consumer**, **layer-mandated decoupling**, or **category-mismatch that would need `any` to merge**. There is no hidden large seam — no 1,000-line goldmine.

**But the push was right: the sweep surfaced real options the technique-pass missed**, and they cluster around one theme that directly answers "leverage a contract from a generic primitive core." The honest shape of that answer is the twist:

> The app *should* grow a few **well-fit** primitives — `DisposableHost`, `SingleFlight<T>`, a keyed `DisposableBag.replaceTimeout` — rather than adopt the **existing 7** `@prismgb/core` generics, **6 of which are category-mismatched and unused** (they're future-first scaffolding that doesn't fit the real needs). The "generic primitive core" exists but was built one abstraction-level off from where the duplication actually is.

The biggest *measured* new win is the IPC failure-envelope factory (**~−33 to −57 src** — three agents gave −33/−50/−52-57, so it is a range, not a confirmed point; ~−50 is the realistic figure once the 3 custom-shape handlers fold into a `base` param — see the reconciliation below). The rest are a basket of small, honest extractions — most ~break-even on LOC but real single-source/legibility wins.

## Dimension 9 — Big-file structural mining (the 10 largest files)

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `single-flight-primitive` | confirmed | ~−9 src (seam, not LOC) | med | aligned | **The flagship cross-file primitive.** 4 hand-rolled `if(pending)return pending; …finally{clear}` in-flight-promise dedups → one `SingleFlight<T>` core primitive. Would be core's *first real value-consumer*. `device-media` ×2, `render-pipeline`, `audio-pipeline` (4th is keyed → needs `reset()`). |
| `disposablebag-keyed-timeout` | confirmed | ~−7 src | med | aligned | 7 sites repeat `setTimeout`+`replace(KEY,()=>clearTimeout)`; add the missing *keyed* `replaceTimeout`/`replaceAnimationFrame` to `DisposableBag` (it already has the unkeyed `addTimeout` family). dev:smoke-gated (core primitive). Composes with the deferred ideas below. |
| `elements-whitelist-spread` | confirmed | ~−20 | low | neutral | `notes-panel` copies 22 element fields one-by-one → a spread. Largest single-file raw reduction; ceremony-collapse, not a seam. |
| `update-state-descriptor-table` | confirmed | modest | low | aligned | `update-section` has 6 dispatch sites over the `UpdateState` enum → one declarative state→view table. |
| `recording-transient-state` | confirmed | ~−7 | low | aligned | `gpu-recording` ctor and cleanup assign the same 14 transient fields → a `RecordingTransientState` value-object + factory; both become one assignment. |
| `cleanup-dispose-dedup` / `release-and-clear-seam` / `transition-template` / `recreate-canvas-template` / `gpu-renderer-factory` / `message-bag-consolidation` / `notes-subscription-keyed-helper` / `disconnect-node-helper` | confirmed | ~2-10 each | low | aligned/neutral | A basket of file-local extractions (byte-identical `cleanup()`/`dispose()`, stop/cleanup template, state-transition tails, canvas-recreate template, etc.). Each small; collectively ~50-80 src lines, all low-blast. |
| `tuple-memo-primitive` | needs-spike | ~−16 (both sites) | med | aligned | Single-entry tuple memo repeated in 2 gpu services. Renderer site is the 60fps hot path with **no perf gate** — benchmark mandatory; recording-only is net-negative. |
| `timeout-deferred-primitive` | needs-spike | ~−40 to −70 | med-high | aligned | 3 instance-held `{promise,resolve,reject}`+timeout deferreds (capture/gpu-renderer/gpu-worker) → a `TimeoutDeferred<T>` primitive (built on keyed-timeout). Real, but settlement-semantics-sensitive; needs the sibling deep-read for a point number. |
| `presentation-dispose-template-method` | confirmed | ~−30 | med-high | aligned | Add an `onDispose()` hook to `PresentationComponent`; ~18 subclasses drop the `super.dispose()` wrapper. The null-lists stay (load-bearing), and ~6 overrides do pre-dispose ordering work that must stay explicit → poor LOC/blast ratio. |

**Rejected in mining (honest):** `mediarecorder-session`/`screenshot-source-strategy` (move-not-reduce / add LOC), `device-temporary-stream-template` (break-even, stream-lifetime delta), `stream-session-value-object` (philosophy-aligned but net-positive here), `single-flight-cross-sibling` for streaming (category mismatch — it's a state machine, not a latch), `child-subcomponent-teardown` (single occurrence, 7 heterogeneous shapes), `scale-calc-memoize` (Cache is a category mismatch).

## Dimension 10 — Core-primitive adoption (the "unused generic core")

**All 7 `@prismgb/core` primitives have zero `src/` value-imports** — verified. The per-primitive verdict is the deliverable:

| Primitive | Verdict | Reason |
|-----------|---------|--------|
| `pipeline.ts` | KEEP-AS-IS | No `(input,next)=>` middleware chains exist anywhere. |
| `store.ts` | KEEP-AS-IS | In-memory `Map`; the app persists via `BrowserStorageAdapter`/localStorage. |
| `validator.ts` | KEEP-AS-IS | Trivial fn-wrapper; wrapping adds indirection, removes zero logic. |
| `bus.ts` | KEEP-AS-IS | Lacks error-routing + by-handler unsubscribe that `SharedEventBus` needs (already rejected). |
| `factory.ts` | KEEP-AS-IS | Trivial fn-wrapper; DI providers are typed `(cradle)=>T` fns. |
| `registry.ts` | KEEP-AS-IS | The track+release-all need is met by `DisposableBag`; the keyed registries are a different shape. |
| `cache.ts` | **ADOPT (needs-spike)** | Genuine in-package duplicate of `PerformanceCache` (LRU+TTL). Compose → ~−15 LOC. |

- `cache-into-performancecache` (needs-spike, ~−15, aligned) — `PerformanceCache` composes a `Cache<string,T>`, delegating get/set/has. The one philosophy-aligned adoption; turns `Cache` into a real consumer. (Behavioral divergence on eviction-guard must be pinned by a test.)
- `delete-all-unused-primitives` (confirmed but **conflicting**, ~−221 package-LOC / **0 coverage-src** / ~−427 gross) — excise the 6 unadopted primitives + dead `interfaces/*` + tests. Real lines, but **100% in `packages/prismgb-core` (outside the app's `src/**` coverage scope, so it moves the measured needle by zero)** and it **contradicts the future-first philosophy** (the prior audit ruled the dead-export backlog *intentional future API*). Presented as the alternative strategy, **not** recommended.

## Dimension 11 — Cross-package / cross-module contracts

| ID | Verdict | Net LOC | Blast | Tag | Note |
|----|---------|--------:|-------|-----|------|
| `dead-ipc-payload-aliases` | confirmed | −8 | low | aligned | 8 zero-consumer `… as IpcXxxPayload` re-export aliases in `@prismgb/ipc`. The one clean ship-today win here. |
| `ipc-contract-dto-dedup` | needs-spike | ~−42 type | low | **conflicting** | 8 byte-identical DTOs duplicated `event-payloads.ts` ↔ `preload-api.contract.ts`. **Both advisor checks done:** dep direction is benign (neither imports the other, edge would be acyclic+type-only); **but the boundary check is decisive** — `event-payloads` carries non-serializable in-process types (`MediaStream`/`Blob`/`HTMLCanvasElement`) absent from the wire contract, and the wire contract owns response envelopes with no event analog. They're identical *by necessity*, not coincidence, but unifying **couples two deliberately-divergent boundaries**. Only via a new `@prismgb/contracts` leaf, not a backwards `events→ipc` edge. A human call. |
| `core-minimal-contract-consolidation` | confirmed | ~−9 type | low | aligned | `service.base.ts`'s `LoggerLike`/`StorageServiceLike` are byte-identical to core's `interfaces/{logger,storage}`; `LoggerFactoryLike` is a concrete specialization of `interfaces/factory` (the `name` arg is required vs the generic `Factory` — the latent drift). Type-import swap (preserve `*Like` names via re-export alias). Not a field-codemod — doesn't touch the boot-trap. |
| `transcode-format-set-single-source` | confirmed | ~0 | low | aligned | `{webm,mp4,mov}` hand-encoded in 3 places (ipc union, transcode config, settings fallback). The ipc↔transcode *type* leg is a clean `import type` (~0 LOC); a drift-prevention win, not a reduction. |

**Rejected (correctly):** `gpu-config-uniforms-overlap` (`*Config` raw values vs `*Uniforms` gated/computed — structural identity is coincidental; merging conflates two domains inside `@prismgb/gpu`); `layer-decoupled-lookalikes` (`EventBusLike`/`DeviceStatusPayloadLike` are layer-mandated decouplings that must stay separate); `like-interface-consolidation` (the 125 `*Like` decls are *divergent subsets* — intentional minimal-surface typing, not copy-paste). **Dimension verdict: type-contract duplication is thin** once `dist/` artifacts are excluded.

## Dimension 12 — Tests (capped; ratchet-neutral)

| ID | Verdict | Note |
|----|---------|------|
| `gpu-worker-manager-setup-hoist` | confirmed-small | A 13-line `beforeEach` (build manager + mock canvas + ready-message + `initialize()`) is copy-pasted across 3+ `describe` blocks → one `initializeReadyManager()` helper (~−30 test LOC, independence preserved). |
| `electron-mock-factory` | **rejected** | The premise (8 near-identical `vi.mock('electron')`) is empirically false — they mock *disjoint, test-tailored* surfaces; consolidating would hide each test's real dependency and fight DAMP/independence. |
| `vitest-base-config` | thin | Only 2 packages have a config; ~15-line shared base, marginal. |

Tests are ~50k LOC but **reducing tests ≠ reducing the app** (not coverage-measured), and the suite is already factored (`factories/`, `subscribeWithCleanup` template). Capped deliberately — not headlined.

## Dimension 13 — CSS (capped)

| ID | Verdict | Net LOC | Note |
|----|---------|--------:|------|
| `css-vertical-fill-slider-block` | confirmed | ~−20-40 | `.brightness-slider` ≡ `.volume-slider-vertical` byte-identical in `slider-controls.css` → comma-grouped selector. The one clean CSS reduction (one file). |
| `disposable-host-base` | confirmed | ~break-even | **The cleanest "leverage a primitive" structural seam** (surfaced by the CSS agent's cross-scan): `BaseService`, `BaseOrchestrator`, and `PresentationComponent` each re-wrap `DisposableBag` with the same `track`/`replaceManaged`/`timeout`/… delegators → one `DisposableHost` core base. ~break-even LOC but a real 3-copies→1 single-source win. Caveats: a `listen`-naming collision (Service=eventBus vs DOM) and a `disposables`/`_disposables` field-name split reached by ~12 subclasses — both must be preserved. dev:smoke-mandatory. |
| `css-glass-surface-and-token-adoption` | overclaimed | ~0 | Design tokens already exist (`tokens.css`, 201 lines); literal→`var()` adoption is LOC-neutral consistency. Real value is closing the `-webkit-backdrop-filter` pairing gap (correctness), not reduction. |

## Updated shortlist additions (clean, low-blast, from Part II)

Add to the recommended set: `dead-ipc-payload-aliases` (−8, zero-risk), `css-vertical-fill-slider-block` (~−25), `elements-whitelist-spread` (~−20), `recording-transient-state` (~−7), `update-state-descriptor-table`, plus the file-local mining basket (~50-80 lines collectively). The structural-primitive wins (`single-flight-primitive`, `disposablebag-keyed-timeout`, `disposable-host-base`) are higher-value as *seams* than as LOC and are med-blast (dev:smoke-gated core edits) — pursue for single-source/legibility, not line count.

**On the IPC envelope factory (the most-likely-first item — honest number):** `ipc-failure-envelope-seam` (Part II) and `ipc-error-envelope-mapper-factory` (Part I, Dim 7) are the **same** refactor, measured independently by three agents — which gave **−33, −50, and −52-57**, *not* three confirmations of one number. The honest figure is a **range: ~−33 to −57 net src** (~−50 realistic), driven by two real disagreements: (a) whether the 3 custom-shape handlers (`device`→`connected:false`, `window.isFullScreen`→`isFullscreen:false`, `login-item.get`→`enabled:false`) fold via an optional `base`-fields param (15 sites, ~−50-57) or stay bespoke (12 sites, ~−33); and (b) import accounting — the `@prismgb/ipc` import already exists in all 8 handler files, so the factory adds ~0 import lines, not +7. Confirmed-real either way; scoping the 3 custom-shape handlers into the `base` param lands the upper end.

---

# Part III — Out-of-the-box: framework adoption & subsystem replacement

Parts I-II optimized *within* the architecture. This part asks the bigger question — **replace hand-rolled subsystems with established frameworks**, irregardless of scale or time — plus treats the **device domain** as a first-class consolidation target. This is where the real mass is.

## Part III verdict (the big swings — and the intuition inverts)

The honest ranking is **not** by raw LOC. The largest hand-rolled subsystem (presentation, 8,052 lines) is the **weakest** ROI; the most actionable win is the **device domain** (your callout — confirmed over-engineered); the cleanest framework swap is **DI→Awilix** (you hand-rolled Awilix's `cradle` *twice*); and the strongest framework *fit* is **IPC→tRPC** (the hand-rolled IPC is literally a tRPC reimplementation). None of the *framework swaps* are drop-ins — they're **needs-spike / viable-tradeoff**, i.e. real multi-week engineering projects (the device-domain collapse is the lone **recommend-now** lever — it needs no dependency), which is exactly the "irregardless of time" scale requested.

| Swap | Framework | Honest net | Verdict | Deciding gate |
|------|-----------|-----------|---------|---------------|
| **Device domain** (your callout) | *none — internal YAGNI collapse* | Tier-1 **~−700-800 src + −550 test** (zero extensibility loss); full collapse **~−1,050-1,250 src + −800 test** | **recommend** (Tier-1) / viable-tradeoff (Tier-2) | dev:smoke + device e2e |
| **DI** | **Awilix** | **~−600** (~−228 coverage-src) | **needs-spike → recommend** | does `awilix` import clean in the Vite renderer build (no Node polyfills)? |
| **IPC** | **electron-trpc + Zod** | **~−700-900 coverage-src / ~−1,300-1,500 net / ~−2,100 gross** | **needs-spike → recommend** (strongest fit) | one channel (`transcode:progress`) end-to-end subscription under `sandbox:true`, passing dev:smoke |
| **Codegen** (2nd-order) | *consequence of Awilix+tRPC+Zod* | **~1,737 deleted outright; ~2,400-3,000 net** | derived — *not a standalone lever* | the three swaps above |
| **Presentation** | **Lit** (light-DOM) | ~−1,500-2,200 of 8,052 (CSS untouched; +9,064 test LOC rework) | **viable-tradeoff** (not recommend) | incremental per-component only |
| **Validation** | Zod (rides IPC) | ~−80 standalone | viable-tradeoff (IPC-coupled) | — |
| **State store / FSM** | Zustand / XState | ~0 | **reject** | (streaming FSM = needs-spike) |
| **Reactivity** | RxJS | ~−150-200 | needs-spike | only if render/audio adopt it too |
| **Build** | turbo / nx | negative | **reject** (drop vestigial turbo) | — |

> **Do not sum the column.** The codegen ~1,737/~2,400-3,000 figure *overlaps* the DI and IPC deletions (it's the consolidated cross-swap number, gated on all three). The genuinely-additive, recommend-now line is the **device domain** (independent of every framework). One premise correction: the "4,170-line codegen pipeline" I cited was **inflated ~4.5×** — only **913 lines** are DI/IPC codegen; the rest is packaging/CI/coverage that survives every swap.

## Dimension 14 — DI → Awilix (the cradle is a hand-rolled Awilix clone)

`di.generated.ts:139-152` and `main/container.ts:92-105` are **byte-for-byte the same `get cradle()` Proxy** — the team reverse-engineered Awilix's PROXY-injection mode and built it twice, plus a 387-line AST-scanning codegen to do the topo-sort Awilix does internally.

- **`awilix-di` (needs-spike → recommend, ~−600 / ~−228 src, aligned):** Awilix is pure-JS, **no decorators, no reflect-metadata** (sidesteps the esbuild decorator gotcha entirely). PROXY mode = `new X(cradle)` with named cradle access — **identical to current service constructors, zero constructor changes**. Deletes `generate-di.js` (387, scripts), `di.generated.ts` (368, generated) → ~140-line registration module, the `@Service` marker + ~60 annotations, the codegen-drift gate, and `manual-providers` folds to `asFunction`. **Migration L, ~70 files, incremental** (main + renderer containers swap independently). **Two gates:** (1) prove `awilix` imports clean in the Vite renderer build (its `loadModules` historically pulls Node `fs`/`glob`; it ships a `browser` field — *unverified*, the deciding risk); (2) accept that the un-constructable GPU/worker token slice (already coverage-excluded) loses *build-time* dep-validation and falls back to dev:smoke. Also must delete the dead `Object.assign(this,cradle)` from the base classes (safe — it's the no-op from the Part I headline).
- **`tsyringe-di` / `inversify-di` (reject):** both need `@inject` on every constructor param + `reflect-metadata` (fights the esbuild-decorator-metadata gotcha) and are net-neutral-to-positive LOC vs Awilix. No advantage.

## Dimension 15 — IPC → electron-trpc (the strongest framework fit)

The hand-rolled IPC (manifest + `generate-contracts.js` codegen + preload bridges) is **structurally a typed-IPC-over-codegen reimplementation of tRPC**. The manifest's whole job — keep the renderer client type and the main handler type in sync — is what tRPC does by *inference*, for free.

- **`ipc-trpc` (needs-spike → recommend — single strongest candidate, aligned-on-types/conflicting-on-control):** Deletes `generate-contracts.js` (526), `validators.generated.ts` (347), `preload-api.d.ts` (109), the preload factory layer (`subscription`/`exposure`/`apis` ~470 → one `exposeElectronTRPC()`), and the manifest+descriptor cross-validation machinery (542). **Gross ~−2,100; net ~−1,300-1,500; coverage-src net ~−700-900** (much of the renderer-consumer code is *churn*, not deletion — re-pointed to `client.x.subscribe()`). **Three honest caveats, named:** (a) main→renderer **push** (`webContents.send`) must be rewritten as EventEmitter-fed tRPC subscriptions (async generators) — real work, single-window keeps it tractable; (b) **output/payload validation is NOT automatic** — you must add `.output(z…)` to every subscription or silently drop the defense-in-depth guard (input/security validation *does* fold cleanly into `.input(z)`); (c) the `eventChannels→@prismgb/events` mapping is the one genuine **regression** (manifest cross-validates it today; tRPC doesn't model it). **Spike:** prove `transcode:progress` end-to-end under `sandbox:true` + dev:smoke. Both pass → recommend.
- **`ipc-tipc` (viable, dominated):** `@egoist/tipc` is lighter but has no validation, so you keep `validators.generated.ts` (−347 vs tRPC) and hand-maintain the security boundary. tRPC wins *because* input validation is a stated requirement.
- **`ipc-keep-simplify` (viable fallback):** ~20-30% reduction without a framework — the conservative path if the spike fails.

## Dimension 16 — Presentation → Lit (largest target, weakest ROI)

8,052 lines, but the honest reduction is **mid-sized, not transformative**.

- **`lit-light-dom` (viable-tradeoff, NOT recommend — ~−1,500-2,200 of 8,052):** Lit is the *only* fit (class-based `LitElement` + decorators match the heavy-OOP house style; tagged templates = no JSX/build change; custom elements drop into the existing shell **incrementally**; **light-DOM** mode keeps the 5,271-line global CSS working). Deletes the `data-ref` binding system (~400-500), relocates templates into `render()`, collapses `DisposableBag` listener wiring into `@event` bindings. **But:** the **CSS (5,271) is untouched** (not a win), the **test suite (9,064 LOC) must be rewritten**, and **DI-into-custom-elements** is unavoidable (custom elements are `document.createElement`'d → can't constructor-inject → needs `@lit/context` + the registry survives in reduced ~300-400-line form). The components are **already thin, factored, tested, and working** — so "keep hand-rolled" is defensible. *If* pursued: incremental, starting with state-projection components (update-section/device-status/transcode-toast shrink 30-40%), never the orchestration-heavy notes-panel, never big-bang.
- **`solid` / `preact` (reject):** JSX compile step + functional model conflict with the heavy-OOP standard; own-the-tree fights the incremental path; the signal advantage is moot (components are stateless view-controllers — state lives in services).
- **`shoelace-aria` (reject):** swapping the 700-900 lines of disclosure/listbox/combobox controllers — the *best* code in the tree (headless, typed, tested) — for a shadow-DOM design system you'd fight on theming is a negative trade. If Lit lands, re-wrap them as Lit reactive controllers; don't replace them.
- **Not framework territory (stays):** the entire GPU/WebGPU/canvas/worker rendering + OffscreenCanvas streaming, `effects/` (918), `bridges/` (434).

## Dimension 17 — Validation & State (mostly keep)

- **Validation:** `joi` is already a dep but tree-shaken out of the renderer (re-expanding it adds ~145KB). The real win is letting the **IPC swap pull in Zod**, then folding config-loader (~−15) + settings-coercion (~−50, lean-keep — the `SettingsDefinitions` registry is *more* philosophy-aligned than static schemas) onto it. `worker-protocol.config.ts` (357) is a **keep** — its payloads carry `OffscreenCanvas`/`ImageBitmap` transferables (Zod can only `z.custom`-relocate, not remove the guards), its conditional required/optional typing is *more precise* than `z.infer`, and it's a same-app worker boundary (guard value near-zero). Standalone validation net **~−80**.
- **State store (reject):** there is **no central store to replace** — `app-state.ts` is an event-bus-fed read-through facade owning exactly one mutable flag; state is deliberately **DI-distributed across encapsulated services**. A global store *centralizes what is intentionally decentralized* — directly anti the separation-of-concerns standard.
- **State machines (reject, except one):** UpdateState/TranscodeState **mirror external EventEmitters** (electron-updater / ffmpeg child-process) 1:1 — XState would add a translation layer over a machine you don't own, *more* verbose than the 6 one-line `this.state = X` assignments. The **only** candidate is `streaming.service`'s `StreamState` → **needs-spike**, gated on whether XState's actor model preserves the in-flight-promise return contract without new glue.

## Dimension 18 — Device domain consolidation (your callout — the most actionable win)

**Ground-truth YAGNI hypothesis: CONFIRMED.** The device subsystem ships an extensible multi-device plugin framework for **exactly one device**: `device.manifest.json` has 1 entry (`chromatic-mod-retro`), 1 `DeviceProfile` subclass, 1 adapter. Yet it carries two parallel registries, a register→iterate-back round-trip (you already hold the class at the call site), **4 redundant detection implementations**, dead base-class defaulting, and triple-wrapped config. This is your "numerous cleanup opportunities" — quantified.

**Tier 1 — accidental complexity, removable with ZERO extensibility loss (recommend):**
- `dual-registry-merge` — two registries for a 1-element set → one `matchDevice()`. **~−330-384 src (pkg)** (the two registries total 384 lines; net after the `matchDevice` add-back) **+ −485 test.** *recommend.*
- `registry-roundtrip-elimination` — delete the hardcoded-Map→register→iterate-back scaffolding in both boot paths → direct construction. **~−125** (~55 coverage-measured renderer). *recommend.*
- `detection-path-unification` — 4 match implementations → 1 named `matchDevice`. **~−110 src + −65 test.** *recommend, aligned* (DRY).
- `profile-base-deadcode` — *most* of the defaulting branches in `device-profile.base.ts:152-198` never fire (Chromatic supplies nearly every field). **~−80.** *recommend, with one caveat:* `:184` `preferredRenderer: config.rendering?.preferredRenderer || 'canvas'` **IS live** — the Chromatic `RENDERING_CONFIG` omits `rendering.preferredRenderer`, so the `|| 'canvas'` default is the value actually used. Preserve it (add `preferredRenderer: 'canvas'` to the config) before deleting the branch; it is not a no-op.
- `config-triple-wrap-flatten` — `device-chromatic.config.ts` re-freezes the manifest into a parallel shape → ~60-line typed accessor. **~−130.** *recommend* (Tier-1 portion).
- **Tier-1 total: ~−700-800 src + ~−550 test, zero extensibility lost** (the per-item `src` figures sum to ~775-830; the 700-800 total nets out the overlap between `dual-registry-merge` and `registry-roundtrip-elimination`).

**Tier 2 — the one genuine future-bet (viable-tradeoff, conflicting):**
- `profile-framework-to-manifest-descriptor` — collapse the `DeviceProfile` class hierarchy + plugin API into a static `DeviceDescriptor` derived from the manifest. **~−350-450 src + −250 test.** Forfeits the *class-per-device* seam (conflicts with future-first) — **but hedged**: the manifest stays the data-driven "add-a-device" path, so extensibility survives as data, not OOP. **Keep-case:** a 2nd device with *imperative* per-device logic on the roadmap → do Tier-1 only.

**Hard guardrail (KEEP):** the renderer↔package split is **process separation, not duplication** (two ends of the IPC boundary), and the package's `index.ts`-barrel vs `/service`-subpath split **keeps native `usb` out of the renderer bundle** — an Electron isolation requirement. Do **not** merge into "one device module." **Combined collapse removes ~a third of the ~3,600-line device domain** (~801-line framework + round-trips → ~180 lean lines), concentrated in the coverage-neutral package layer.

## Dimension 19 — Codegen elimination (consequence) + reactivity + build

- **`meta-codegen-elimination` (needs-spike, derived):** the codegen exists *only* to compensate for hand-rolled DI+IPC+validation, so it deletes as a **second-order effect** of those swaps — not as an independent lever. **~1,737 lines outright** (generate-di 387 + generate-contracts 526 + di.generated 368 + validators.generated 347 + preload-api.d.ts 109), **~2,400-3,000 net** across all three swaps. Honest framing: *real and large, but 100% downstream of committing to Awilix + electron-trpc + Zod, and NOT a 4,170-line win.*
- **`reactivity-rxjs-signals` (needs-spike, ~−150-200):** `performance-state` + the visibility/idle/reduced-motion adapters hand-code `throttleTime`/`switchMap(timer)`/`combineLatest` logic that RxJS owns. Renderer-only, low technical risk — but a **one-off RxJS island fragments** the eventemitter3+DisposableBag mental model. Worth it *only* if the render/audio pipelines also adopt it (codebase-wide reactive layer), else it violates the consistency mandate.
- **`build-turbo-nx` (reject):** turbo is already a vestigial devDep producing `dist/` that the source-aliased runtime never consumes. Full turbo/nx adoption *adds* config and would **reintroduce the stale-dist hazard** the source-aliasing design deliberately eliminated. The only reduction available is **dropping** turbo, not expanding it.

---

# Part IV — Maximal UI de-hand-rolling (owner directive: minimize hand-rolled UI)

> **Superseded by Part V.** This part is the *constrained* answer (preserve the CSS + minimize test churn). The owner subsequently removed those constraints ("nothing is off limits"), so the operative recommendation is **Part V** (wholesale full-component-library rewrite). Part IV is retained for context and for the case where CSS-preservation/test-cost *do* matter.

Owner directive overrides the Part III "keep hand-rolled, it's good code" verdict: **delete hand-rolled UI as much as possible.** The question becomes *which framework + library replaces the most*, honestly. Four agents (stack decision, behavioral-atom map, presentational-atom map, migration/boundary) converged — three on one answer, with the fourth's full-component-library pick refuted on hard grounds.

## The recommendation (decisive): **Solid + Ark UI (Solid) / Zag.js + Floating UI — light DOM, keep all 5,271 CSS lines**

A signals+JSX rendering framework deletes the hand-rolled binding/lifecycle + DOM-construction; a **headless** state-machine library deletes the hand-rolled ARIA behavior; both render into **your own markup with your own classes**, so the entire visual identity survives untouched. This is the *maximal* honest deletion of hand-rolled UI that also satisfies the hard constraints (brand survives, `dev:smoke` boots, the 9k-LOC test suite doesn't detonate).

- **Solid** (signals + JSX, ~7KB, no VDOM) — deletes the binding/lifecycle layer: `presentation-component.base.ts` (148), `template-ref.utils.ts` (158), `dom-bindings.utils.ts` (100), `template-dom.contract.ts` (19) ≈ **425 → ~0**, plus the `innerHTML` string templates and the `notes-list-view` repeater (`innerHTML = notes.map().join('')` + child-walking re-sync, ~190) → reactive `<For>`. Mounts as **light-DOM islands** into existing containers, carries DI through **context**.
- **Ark UI (Solid) / Zag.js** (headless state machines, you bring the CSS) — deletes the hand-rolled ARIA layer **outright**: `disclosure.class.ts` (367) + `listbox-dropdown.class.ts` (310) + `combobox-listbox.class.ts` (244) + `listbox.utils.ts` (60) = **~981 LOC → ~0 + config**. Zag is framework-agnostic, so this slice can even start *before* the Solid migration.
- **Floating UI** (transitive via Zag) — replaces the hand-rolled anchored-placement math in `disclosure.class.ts:99-176` (right-of-anchor, dock-below fallback, clamp) with `computePosition` + `flip`/`shift`/`size` middleware.

## Why NOT a full styled component library (Shoelace / Web Awesome / Material) — refuted on hard grounds

The presentational agent initially crowned Shoelace; the behavioral + migration agents refuted it decisively:

- **Shoelace is reportedly in maintenance / read-only mode** as its successor **Web Awesome** (freemium — a free tier plus a paid Pro) takes over; per the agents Web Awesome **gates combobox/autocomplete behind paid Pro** (the highest-LOC behavioral atom: `combobox-listbox` 244 + `game-autocomplete` 175), and **`sl-range` has no vertical orientation** — the app's sliders are the *vertical* brightness/volume twins. **Verify the current maintenance status and Pro-tier gating before relying on this** — but the slider/combobox gaps alone are hard misses on the highest-value atoms.
- **Shadow DOM walls off the 5,271-line class-targeted CSS.** "Keeping the brand" would mean re-authoring the entire identity into `::part()` + custom-property theming — that is *re-hand-rolling* the branding the owner said to preserve, not deleting code. (The presentational agent's own accounting: of 5,271 CSS lines, ~3,680 survive untouched either way, and the full-lib path nets only **~250 true CSS deletion** while *converting* ~850 to `::part()` — the savings aren't in CSS.)
- **Tests + boot:** shadow-DOM / form-associated custom elements break the **9,064-LOC happy-dom** suite (needs a real-browser runner), and the `innerHTML` shell + `customElements.whenDefined` upgrade introduces a fresh `dev:smoke` race. The light-DOM-islands path avoids all three.

**Lit** is the secondary fallback (class-based, fits the OOP/DI house style) but defaults to shadow DOM and has *no official Zag adapter* — you'd force light DOM on every component (`createRenderRoot(){return this}`) and hand-author a ~60-100-LOC `ReactiveController`↔Zag bridge; at which point Solid simply fits better. The Solid-vs-Lit gap is **narrow**, not a blowout. **Shoelace** survives only as a fallback for *isolated net-new surfaces with no existing styling*, never the spine.

## DI-into-components is a non-problem (the key migration insight)

Because the chosen path uses **light-DOM islands, not custom elements**, the DI hole that kills shadow-DOM adoption never opens. Keep the existing factory/registry seam (`ui-component.catalog.ts` / `component.registry.ts`) almost verbatim — the only change is the factory body: `new XComponent(elements)` (decorate queried DOM) → `mountIsland(container, () => <X {...deps}/>)` (same DI deps as Solid props/context). Boot order, `dev:smoke`, and the test harness stay intact; `registry.dispose()` maps to Solid's `dispose`.

## The honest grand total (of 8,052 presentation TS + 5,271 CSS)

| Bucket | LOC | Fate |
|--------|----:|------|
| ARIA behavior primitives (disclosure/listbox/combobox/listbox.utils) | ~981 | **Deleted** → Ark/Zag + Floating UI |
| Feature components (the `features/` tree, 22 files / 29 `PresentationComponent` subclasses across the layer) | ~4,026 | **Re-authored**, net **−40-60%** (delete ARIA plumbing + manual DOM build; *keep* event-bus glue) |
| Binding/element-slice glue (template-ref/dom-bindings/template-dom) | ~277 | **Mostly deleted** (components own markup) |
| `effects/` (auto-hide, shutter, body-class) | 918 | **Stays hand-rolled** (no state machine models "hide cursor after Nms idle") |
| `bridges/` (orchestrator→UI glue) | 434 | **Stays hand-rolled** |
| `activity-auto-hide` + `notes-resize-handler` bespoke drag | ~250 | **Stays (partial)** — dual-purpose drag+collapse + rAF `--notes-list-width` + cursor snapshot; Zag Splitter is the wrong shape (between-panes) |
| DI / registry / mount seam | ~850 | **Reduced** to ~400-500 |

- **Replaces ~4,500-5,000 of the 8,052 presentation TS lines.** Of the remainder, the *untouched* hand-rolled floor is **~2,000-2,500** (effects + bridges + mount seam + resize/auto-hide + per-component event-bus glue); the rest is thin re-authored feature-component logic (reduced ~40-60%, not eliminated). Plus the out-of-scope GPU/canvas pipeline.
- **CSS 5,271 lines preserved ~intact — a feature, not a failure.** The *only* way to "replace" the CSS is a shadow-DOM library, which forces re-authoring ~5,000 lines into part/token theming. Keeping the identity is the correct maximal outcome, and the light-DOM stack is the one that *also* deletes the most behavior code.
- **Biggest honest cost: rewriting the ~9,064-LOC presentation test suite + re-authoring 29 components.** This is the dominant line item — pay it incrementally, atoms before composites.

## Migration: incremental, leaf-atoms-first

| Stage | Components | Mapping |
|-------|-----------|---------|
| 0. Harness | island-mount + DI-context shim; add Solid/Ark/Floating UI; happy-dom + browser-mode test patterns | — |
| 1. Leaf atoms (prove the pattern) | `cinematic-toggle` (switch), `device-status` (badge), `status-notification`, `transcode-toast` | Ark Switch / plain Solid / Ark Toast |
| 2. Single-behavior atoms | `shader-slider-controls` (vertical slider), `shader-preset-list` (listbox), `game-autocomplete` (combobox), `game-filter`/`shader-selector` | Ark Slider/Listbox/Combobox/Menu (+Floating UI) |
| 3. Composites LAST | `settings-menu` (397), `update-section` (410), `notes-panel` (470) + `notes-list-view` (repeater) | Ark Dialog+Menu+Checkbox+Collapsible; Solid `<For>` |
| 4. Delete primitives | `disclosure`/`listbox-dropdown`/`combobox-listbox`/`listbox.utils` once no consumers remain | replaced by Ark/Zag + Floating UI |

## Two honest library gaps (where "no library covers it" — keep, with reason)

- **Vertical slider** (`shader-slider-controls` 267): the *behavior* is already native `<input type=range>` (drag + keyboard free); the 267 LOC is app wiring (settings load/save, event-bus, the `--fill-percent` thumb-center math) that **no library deletes**. Keep native; route to Zag's vertical slider only if a state machine is later wanted. ~0 behavioral deletion either way.
- **`settings-menu` is a non-modal anchored popover, not a modal dialog** — `sl-dialog`/`wa-dialog` (modal + backdrop + focus-trap) is the wrong primitive. Behavior → Zag `popover` + `select`×N; keep the panel DOM/CSS. (`status-notification` is likewise a `role="status"` live region, not a toast — don't swap it for a corner-stacked `sl-alert` unless you want that UX change.)

---

# Part V — Maximal wholesale UI replacement (no constraints: CSS, tests, scale all on the table)

Owner clarified: **nothing is off limits** — the 5,271-line CSS, the 9,064-line test suite, and migration scale are *not* constraints to protect. That supersedes Part IV's headless-keep-your-CSS answer (which existed only to preserve those). Recomputed for the true maximum: **rip out the entire hand-rolled presentation layer and rebuild on a full, batteries-included styled component library** where the library owns markup, styling, *and* behavior. Three agents independently converged on the same shape and split only on the host framework — which is the one remaining decision.

## The recommendation: **React + PrimeReact** (or React + MUI; or Vue + PrimeVue — same component surface)

Adopt a **full styled component library** and delete ours wholesale. The decisive discriminators were three atoms that break most libraries — **vertical slider**, **resizable split-pane**, **stacking toast** — plus theming a custom dark+magenta brand from a token object:

- **Prime family (PrimeReact on React / PrimeVue v4 on Vue — sibling projects, identical component parity)** is the **only library covering 100% of the atom list in ONE package**, natively: `Slider orientation="vertical"`, `Splitter`/`SplitterPanel` (deletes the gnarliest file — `notes-resize-handler` 250 LOC of pointer/touch/RAF math → ~15), `VirtualScroller`, stacking `Toast`, `AutoComplete`, anchored non-modal `OverlayPanel`/`Popover`, `Drawer`. One dependency, design-token theming.
- **React + MUI v7** is the equally-valid **ecosystem-first** alternative: 14/15 atoms native + 3 tiny pre-built companions (`react-resizable-panels`, `notistack`, `react-idle-timer`) — themselves zero-hand-roll. MUI is the strictest-typed and most mature (fits the no-`any`/future-first philosophy). Its only native gaps are split-pane and toast-stacking, which cost **~0 hand-rolled LOC** (the companions are pre-built).

**Why React as host (the split resolved):** two of the three agents chose React for one load-bearing reason — **`useSyncExternalStore` is the purpose-built primitive for subscribing the app's `eventemitter3` / `EventChannels` bus to component state.** The whole integration story is "bridge the event bus to UI," and React (since 18) has the canonical hook for it. Vue + PrimeVue is genuinely co-equal on *coverage* (a Pinia store subscribing to `EventChannels` does the same job); pick Vue only if the team prefers it — the component surface is identical to PrimeReact.

**Rejected (coverage-first):** Mantine (slider horizontal-only, no splitter), Vuetify (no native splitter + hard-to-neutralize Material identity), Angular Material (no vertical slider, no splitter, heaviest), Material Web / React Spectrum (sliders horizontal-only, incomplete), Svelte+Skeleton (a Tailwind kit, not a component library), Shoelace (reportedly in maintenance — verify; superseded by the freemium Web Awesome).

## What this eliminates (the whole point: compose, never hand-roll)

- **Bespoke ARIA primitives → deleted outright (~981 LOC):** `disclosure.class` 367, `listbox-dropdown.class` 310, `combobox-listbox.class` 244, `listbox.utils` 60 → library widgets (WAI-ARIA, focus management, keyboard nav, type-ahead all built in).
- **The binding/registry/controller substrate → evaporates (~1,130 LOC):** `PresentationComponent` base 148, `template-ref`/`dom-bindings`/`template-dom` ~277, `ui.controller` 281, `component.registry` 211, `ui-component.catalog` 214 → the JSX/SFC tree + a `useService` context hook + framework refs.
- **`bridges/` 434 → ~30:** the 17-entry imperative event→`uiController` descriptor table collapses into two generic hooks (`useEventBus`/`useEventValue`) because components subscribe to the bus and render from state instead of being imperatively pushed.
- **`effects/` 918 → ~100:** `react-idle-timer` (or VueUse `useIdle`) owns the cursor/toolbar/controls auto-hide idle timers; shutter-flash/body-class/button-feedback become hook + transient-state + CSS-transition. (The cursor-hide the prior pass called a possible residual — a hook owns it.)
- **5,271 CSS → ~250-400 (~92-95% gone):** one `createTheme()` / `definePreset()` token set re-expresses the magenta-on-dark + mono brand. A thin **bespoke-effects stylesheet survives** (~100-400 LOC) for the genuinely irreducible brand flourishes no component models — chromatic aberration (`text-shadow` trick), rainbow gradient borders, glass blur (`backdrop-filter`), and the particle/retro-standby screen *around* the canvas.

## The honest grand total

| Layer | Now | After | Eliminated |
|-------|----:|------:|-----------:|
| **Pure UI** (primitives 1,572 + controller 706 + bridges 434 + effects 918 = 3,630 — markup/ARIA/binding/lifecycle) | ~3,630 | ~330 | **~91%** |
| **Feature components** (22 files — app logic kept, all markup/ARIA/class-toggling/lifecycle deleted) | ~4,026 | ~1,400-1,800 | **~55-65%** (the swing estimate) |
| **Shell / shared / config / icons / lib** | ~396 | ~150 | — |
| **Presentation TS total** | **8,052** | **~1,900-2,250** | **~72-76%** |
| **CSS** | 5,271 | ~250-400 | **~92-95%** |
| **Combined** | 13,323 | ~2,150-2,650 | **~80-84%** |

**The residual ~1,900-2,250 TS is not hand-rolled widgets — it's the irreducible minimum:** ~200 LOC of generic event-bus↔framework glue (`useEventBus`/`useEventValue`/`useService`), and compact application logic in feature components ("this control calls `notesService.save`," "this toggle publishes `CINEMATIC_MODE_CHANGED`," the slider↔brightness math) — composition + wiring, not UI. The team writes **essentially zero markup, zero from-scratch styling, and zero behavior for any standard widget.**

## The integration pattern (the only real glue, grounded)

The current flow — `eventBus → bridge descriptor → uiController god-object → registry → DOM mutation` — inverts and the intermediary stack disappears:
1. **DI cradle → React context + `useService(token)` hook** (wraps the existing `di.generated` cradle); `ui-component.catalog`/`component.registry`/`ui.controller` deleted.
2. **Event bus → `useSyncExternalStore`**: `useEventValue(channel, initial)` subscribes a channel to state; `useEventBus(channel, handler)` is the fire-and-handle variant (replaces `DisposableBag`/`trackSubscription`). Publishing is unchanged (`bus.publish(EventChannels.SETTINGS.BRIGHTNESS_CHANGED, v)`).
3. **`@prismgb/events`/`@prismgb/core` are framework-agnostic TS** — zero penalty for the framework choice; the services/orchestrators/event-bus all stay exactly as-is.

## The hard boundary (physics, not a hedge)

The **GPU/WebGPU/canvas/worker/OffscreenCanvas rendering pipeline** (`infrastructure/rendering/`, *never* part of presentation) is untouched — no component library renders shader pixels. Its entire presentation touchpoint shrinks to **~5-10 LOC**: a framework `ref` handing the `<canvas>`/`<video>` element to the rendering service. The stream/recording media logic lives in services, not UI.

**Scale, stated plainly:** this is a **ground-up rewrite of the presentation layer** + the event-bus re-integration + a full rewrite of the ~9,064-LOC presentation test suite (in `@testing-library/react`). Per the directive, that cost is not a factor in the recommendation — it's the price of getting to near-zero hand-rolled UI.

---

## Rejected / not-recommended (consolidated)

Included because "all options irregardless of impact" was requested. Each is either a verified non-reduction or trades away a committed invariant.

- `declare-only-naive-codemod` / `declare-injection-seam` — **verified boot-break** (the headline trap).
- `narrow-object-construction-codegen` — net-positive LOC (relocation, not reduction).
- `declaration-merged-generated-interface` — breaks `private` visibility; no type source in codegen.
- `service-decorator-runtime-deps-attach` — trades the `@Service` zero-runtime invariant. **conflicting**.
- `generic-delegation-facade-primitive` — `Proxy` returns `any`, drops real logic. **conflicting**.
- `orchestrator-passthrough-codegen` — `@Service` has no method metadata; mechanism can't run. **conflicting**.
- `unified-di-ipc-events-manifest` — 0 src-measured reduction. **conflicting**.
- `flatten-main-di-container-to-direct-instantiation` — deletes the DI abstraction. **conflicting**.
- `activate-dormant-responsemode-success-envelope` — ~0 net, behaviour-changing.
- `method-decorator-log-catch` — net ~0, adds the first renderer method decorators (dev:smoke risk) + decorator infra.
- `class-decorator-passthrough-codegen` — mechanically impossible (`@Service` has no method metadata). **conflicting**.
- `emitter-consolidation-onto-core-bus` — category mismatch; regresses `no-any`, drops error routing. **conflicting**.
- `keyed-managed-timer-seam` — net ~0; a DRY idiom-dedup, the primitive doesn't exist yet.

---

## Gate map (which gate each kind of option stresses)

- **`dev:smoke` (boot)** — every option touching DI field-mirroring or `declare` conversions, **in both the renderer and main containers** (both use the empty-`ownKeys` cradle, so `Object.assign(this, cradle)` is a no-op in each); the *only* automated catch for `useDefineForClassFields` clobbering and cradle-population regressions. `test:run` is **blind** here (`tsconfig.test.json` sets `useDefineForClassFields:false`).
- **`typecheck`** — the primary catch for subclass-owned field deletions (`TS2564`), unless silenced by `declare`. Catches the generic-base ref-rewrite.
- **`codegen-drift`** — any generator change (`container-engine`, `validators-library`, main-DI codegen, `single-manifest`). Note: **no hard CI drift-diff exists today** (`pretest` silently regenerates) — `single-manifest-superset-codegen` and `codegen-main-di-container` both need a real diff gate added *first*.
- **`check-layer-boundaries`** — `canonical-service-contract-interfaces` (cross-layer contracts have no legal `src/` home), shared-primitive extractions that would cross preload↔renderer.
- **`coverage-ratchet`** — presentation-component options (per-file, ratchet-sensitive). `scripts/`-only changes are ratchet-neutral (coverage measures `src/**`).
- **renderer-barrel-leak (`dev:smoke`)** — none of the confirmed shortlist introduces a node/native import into a renderer-imported barrel; verified type-only for the IPC mapper factory.

---

## How to sequence (if any of this is pursued)

This is guidance, not a commitment. Right-size per the project's standing rule (a few-finding sweep is one self-authored PR; only genuine multi-phase work earns the autonomous-execution machinery).

1. **Free-standing low-blast aligned wins first** — `import-canonical-core-contracts`, `shared-presentation-dom-contracts`, `vertical-slider-control-primitive`, `panel-hidden-visibility-method`, `registry-interface-dedup`/`dedupe-main-service-structural-contracts`. No boot/codegen risk; each a small PR.
2. **Single-source codegen seams** — `validators-library-extraction`, `container-engine-primitive`. Bigger, but tested seams; regenerate-and-commit discipline.
3. **IPC envelope cluster** — `ipc-error-envelope-mapper-factory` (clean) + `consolidate-preload-api-factories`. Treat the success-envelope as a separate, near-zero, behaviour-changing item.
4. **DI declaration boilerplate** — prefer the `@Service`-array target (`infer-service-deps-from-constructor-type`, spike the TypeChecker upgrade) over the field-mirroring target. If field-mirroring is pursued anyway, decide the mechanism first (`codegen-emitted-deplist-base-pull` ≈ −38 safe, or `typed-dependency-base-seam` high-blast); **never** the naive `declare` codemod; gate on `dev:smoke`.
5. **Needs-spike** (`infer-service-deps-from-constructor-type`, `single-manifest-superset-codegen`, `codegen-main-di-container-via-service`, `worker-protocol-guard-codegen`) — prototype, and add the missing codegen drift-diff gate, before any commitment.
6. **Conflicting tier** — do not pursue without an explicit decision to trade the named invariant.
