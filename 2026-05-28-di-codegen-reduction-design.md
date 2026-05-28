# DI Codegen Reduction — Design Spec

- **Date:** 2026-05-28
- **Increment:** A (of a four-increment codebase-reduction program)
- **Approach:** 2 — dead-code excision + generic codegen + single source of truth for dependencies
- **Branch:** `refactor/codebase_reduction`
- **Status:** Approved for implementation planning

## Context

The renderer uses an annotation-driven DI system: classes are marked with the
`@Service` decorator from `@prismgb/core`, and a build-time scanner
(`scripts/generate-di.js`) walks `src/renderer` and `packages/prismgb-*/src`,
parses the decorators from the TypeScript AST, topologically sorts the services,
and emits `src/renderer/di.generated.ts` (the `GeneratedContainer`). The
generated container resolves each token lazily through a `cradle` proxy and
constructs each scanned service as `new ClassName(this.cradle)`.

Exploration of the DI layer surfaced three classes of waste, all of which keep
every architectural boundary intact when removed:

1. **Dead code** — decorators and runtime metadata that are written but never
   read.
2. **App knowledge baked into the generic build script** — `generate-di.js`
   hardcodes 11 application tokens, their imports, and ~95 lines of hand-written
   `case` bodies emitted as untyped strings.
3. **Per-service dependency duplication** — each service declares its dependency
   names up to five times, with two competing "sources of truth" (the `@Service`
   array, read at build time, and the `super(deps, [...], name)` required-deps
   array, used for runtime validation) that must agree but are not enforced to.

This spec covers Increment A only. Increments B (renderer infrastructure base
classes), C (presentation component framework), and D (main/IPC manifest
codegen) are backlogged for separate spec → plan → implementation cycles.

## Goals

Reduce the DI layer's hand-maintained surface area while preserving every
architectural boundary and all behavior.

**Success criteria:**

- No architectural boundaries collapsed; net-negative line count overall (A2
  adds exactly one file, the typed `manual-providers.ts` registry).
- One source of truth for each service's dependency list.
- `scripts/generate-di.js` contains zero hardcoded application class names or
  tokens — it becomes a fully generic codegen tool.
- The three dead-code constructs are gone.
- Full test suite green and `npm run lint` clean after every phase.

## Non-Goals

- **No boundary flattening.** Thin delegation services, pass-through layers, and
  separate state machines stay as they are. "Reduce" here means remove
  duplication and dead code, not erase separation of concerns.
- **A3-deep is deferred.** The typed `*Dependencies` interfaces, the private
  field declarations, and the `this.x = dependencies.x` assignment blocks are
  left intact in this increment. Rewriting those into codegen-emitted
  constructor wiring is a future increment, to be scrutinized line-by-line for
  "does this remove complexity or merely relocate it into an abstraction."
- The empty-registration pre-seeding in the generated container is left as-is;
  the cradle proxy's `has` trap depends on it and the gain from touching it is
  marginal.

## Verified Findings (anchors)

These were verified directly against the codebase, not assumed:

- `@Inject` appears only inside JSDoc example comments; it is never applied to
  any constructor parameter. `injectMetadata` is written by the decorator and
  read by nothing.
- `serviceMetadata` is written by the `@Service` decorator and read by nothing;
  the codegen reads the decorator from the source AST, not from this runtime
  property.
- 57 `@Service`-decorated classes exist (54 in `src/renderer`, 3 in packages).
- 11 tokens are hand-wired in `generate-di.js` (a `customTokens` set plus manual
  `case` bodies in the emitted `resolve()`): `storageService`,
  `deviceIpcAdapter`, `deviceChangeDebounceAdapter`, `canvasRenderLoopService`,
  `gpuFrameBuffer`, `streamingRendererFactory`, `ipcClient`,
  `deviceStatusProvider`, `adapterFactory`, `uiComponentRegistry`,
  `animationCache`.
- Each scanned service is constructed as `new ClassName(this.cradle)`; the
  cradle is a `Proxy` whose `get` trap calls `resolve(token)`. Service
  constructors read dependencies explicitly (`this.eventBus =
  dependencies.eventBus`), which works through the proxy `get` trap.
- `BaseService`'s `Object.assign(this, dependencyMap)` is effectively inert in
  production: the cradle proxy's `ownKeys` returns `[]`, so `Object.assign`
  copies nothing. Services therefore rely on their explicit field assignments,
  not on the base-class `Object.assign`.

## Design

### Phase A1 — Dead-Code Excision (LOW risk)

- Delete the `@Inject` decorator and its `injectMetadata` writes from
  `packages/prismgb-core/src/di/decorators.ts`. Remove the corresponding export
  from `packages/prismgb-core/src/index.ts`.
- Reduce `@Service` to a pure marker. It must remain present as the annotation
  the codegen scans for, but its runtime body becomes a no-op identity decorator
  (`(): ClassDecorator => (target) => target`); it stops writing the unused
  `serviceMetadata` property. `ServiceOptions` is retained as the documented
  shape of the decorator argument (the codegen reads these option keys from the
  AST).

### Phase A2 — Generic Codegen + Declarative Provider Registry (MED risk)

Introduce `src/renderer/infrastructure/di/manual-providers.ts`: a typed registry
mapping `token → (resolve: <T>(token: string) => T) => instance` for the
constructions that cannot be expressed as plain scanned `@Service` classes. The
generated container imports this registry and merges its entries into the
`resolve()` switch (or a delegated lookup). `scripts/generate-di.js` is then
rewritten to emit only:

1. imports + `case` bodies for scanned `@Service` classes, and
2. a single import of, and merge with, the manual-provider registry.

After this, `generate-di.js` carries no application class names, tokens, or
import paths — it is a generic tool.

#### Governing invariant: construction shape, not location

The choice between the two registration mechanisms is a **strict contract**,
never a per-class judgment call:

> Registration mechanism is determined **solely by construction shape, never by
> package location.**
>
> - **Standard construction** — `new X(cradle)` (dependencies read from the
>   cradle) or `new X()` (no arguments) → the **`@Service` annotation**,
>   discovered by the scanner. Applies uniformly to application *and* package
>   classes.
> - **Non-standard construction** — requires custom logic: global / `window`
>   access, building provider or adapter maps, calling `initialize()`, injecting
>   a derived named logger (`loggerFactory.create(...)`), or config / positional
>   constructor arguments → a typed entry in `manual-providers.ts`.

This invariant is consistent with the **existing precedent**: `NotesService`
(`packages/prismgb-notes/src/notes.service.ts`) is already a package class
carrying `@Service` and is scanned into the container today. Routing other
standard-constructible package classes through the provider registry would fork
from that precedent and reintroduce the inconsistency this increment exists to
remove.

The "library purity" concern (an app DI token living in a reusable package) is
resolved by Phase A1: once `@Service` is a pure no-op marker with zero runtime
effect, decorating a `@prismgb/core` primitive couples nothing at runtime — a
consumer using a different DI system, or none, is unaffected. The annotation is
build-time-only metadata read by the scanner.

**Disposition of the 11 hand-wired tokens (by the invariant above):**

- **Promote to `@Service` (standard construction; leave the registry entirely):**
  - `gpuFrameBuffer` — `GpuFrameBuffer` reads `{ loggerFactory }` from the
    cradle: `new GpuFrameBuffer(this.cradle)`.
  - `animationCache` — `AnimationCache` is a no-arg constructor: the scanner
    emits `new AnimationCache()`, behavior-identical to the current hand-wiring.
    It is decorated `@Service` exactly like `NotesService` and `gpuFrameBuffer`;
    the fact that it lives in `@prismgb/core` does not change its treatment.
- **Keep as typed providers in `manual-providers.ts` (non-standard
  construction):** `ipcClient` (reads `window.deviceAPI`, not a class),
  `streamingRendererFactory` and `adapterFactory` (build provider maps and call
  `initialize()`), `storageService` (constructor config arg), `deviceIpcAdapter`,
  `deviceChangeDebounceAdapter`, `canvasRenderLoopService` (inject a derived,
  named logger via `loggerFactory.create(...)`), `deviceStatusProvider`
  (positional dependency), `uiComponentRegistry` (app component catalog).

**Honest framing of A2's payoff:** for the retained providers this *relocates*
construction code rather than deleting it. The win is structural, not primarily
LOC: untyped emitter strings become type-checked TypeScript, the codegen gains a
single generic shape, and there is one source of truth for each construction.
Net LOC reduction in A2 is modest; the consistency and separation win is the
point.

#### Named future extension (out of scope here, on the roadmap)

The most uniform possible end-state is a **single** registration mechanism:
extend `@Service` with a `factory` / `useFactory` option so even non-standard
constructions become annotation-driven, collapsing `manual-providers.ts` into
the decorator. This is deliberately deferred — it is a meaningful codegen
feature that overlaps A3-deep and risks over-engineering the scanner now. The
typed provider registry is the loosely-coupled seam in the meantime. It is
recorded here so the contract is explicitly *extensible*, not accidentally
closed: when adopted, the construction-shape invariant migrates from "shape
selects one of two mechanisms" to "shape selects one of two `@Service` forms."

### Phase A3-safe — Single Source of Truth for Dependencies (MED risk)

The `@Service({ dependencies: [...] })` array becomes the single source of truth
for each service's dependency list.

- Remove the required-deps array argument from every `super(...)` call across
  all 57 services; services call `super(dependencies)` and the service name is
  auto-derived from `constructor.name`. Adjust the `BaseService` /
  `BaseOrchestrator` constructor signatures accordingly (the `requiredDeps`
  parameter is removed).
- Upgrade the codegen's existing "dependency is not a scanned service" warning to
  a hard build error, so a typo or missing wiring fails the build. (`pretest`
  already runs the codegen, so this is enforced in CI.)
- **Runtime validation is dropped (decision (a)).** Production correctness is
  guaranteed by the generated container: topological sort plus proxy resolution
  ensures every declared dependency resolves before a service is constructed.
  Build-time validation catches misconfiguration. Test code that constructs a
  service with an incomplete mock will fail fast at field access rather than via
  the previous "Missing required dependencies" message; this is an accepted
  trade for a single source of truth and consistency with A1 (no reintroduced
  runtime metadata).

This phase produces the bulk of the net-line reduction (~57 services, each
losing its duplicated required-deps array).

## Execution Strategy

### Dependency analysis

- A1 and A2 are independent of each other.
- A3 depends on A2 (it relies on the generic script and regenerated container).
- All three phases modify `scripts/generate-di.js` and/or regenerate
  `src/renderer/di.generated.ts`; therefore the phases are executed
  **sequentially**, not in parallel, to avoid conflicts on those shared
  artifacts.

### Sequencing (commit per phase)

1. **A1 — dead code.** Edit `decorators.ts` + core `index.ts`; regenerate;
   run full suite + lint; commit.
2. **A2 — generic codegen.** Add `manual-providers.ts`; rewrite
   `generate-di.js`; promote `gpuFrameBuffer` / `animationCache`; regenerate;
   **diff `di.generated.ts`** to confirm resolution logic is unchanged for
   untouched tokens; run full suite + lint; commit.
3. **A3-safe — single source of truth.** Remove `super()` required-deps arrays
   across 57 services; remove the `requiredDeps` parameter from the base
   classes; upgrade codegen warning to error; regenerate; run full suite + lint;
   commit.

### Risk classification

| Phase | Risk | Rationale |
|-------|------|-----------|
| A1 | LOW | Deleting verified-dead code; no behavior path touched. |
| A2 | MED | Resolution logic relocates; mitigated by diffing the regenerated container. |
| A3 | MED | Touches 57 files mechanically; mitigated by the full test suite. |

### Verification

- The full test suite (baseline 3061 tests / 155 files, verified 2026-05-28) and
  `npm run lint` must pass before each phase's commit and before starting the
  next phase.
- After A2 and A3, diff the regenerated `di.generated.ts` and confirm that the
  `resolve()` behavior for every pre-existing token is byte-for-byte equivalent
  except for the intended structural change.
- Behavior preservation is the hard constraint throughout: no token's runtime
  construction may change.

## Out-of-Scope Backlog (future increments)

- **B — Renderer infrastructure base classes:** dependency-unpacking helper, a
  `BrowserEventAdapter` base, a managed preload-bridge helper, an
  error-handling helper. ~400–600 LOC lead.
- **C — Presentation component framework:** declarative element binding,
  subcomponent orchestration, subscription manager, and a codegen step for the
  currently hand-maintained `presentation/generated/template-dom.generated.ts`.
  Highest payoff, highest risk; defer until A/B prove the pattern.
- **D — Main/IPC manifest codegen:** generate handler dependency interfaces from
  `ipc.manifest.json`, a shared `mapError` factory, and auto-discovered handler
  registration. ~150 LOC lead, fully independent.
- **A3-deep (future DI increment):** codegen-emitted explicit constructor wiring
  and a base mechanism that auto-assigns declared fields, eliminating the
  `this.x = deps.x` blocks and the typed `*Dependencies` interfaces.
