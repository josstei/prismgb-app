# Codebase Reduction & Architecture Analysis — `src/`

**Date:** 2026-05-28
**Scope:** `src/` only. `packages/*` are flagged solely where they directly cause pain inside `src/`.
**Lens:** Findings are ranked by **impact-vs-effort** (payoff-to-cost), so quick high-value wins float to the top.
**Goal:** Reduce the codebase and make the architecture clearer, better separated, and less nested.

> This is an **analysis report only**. It contains no code changes and is not an execution plan. Each finding lists a recommendation, but nothing here has been applied.

---

## TL;DR

The `src/` tree is **healthy and well-guarded** — there is no significant dead code, type-debt is tiny (24 `any` usages, a third of them in one file), and the architecture is enforced by real tooling (DI codegen, layer-boundary checks, a type-debt allowlist, a coverage ratchet). **Do not expect large line-count reductions from deletion.**

The real opportunities are **clarity and navigability**, not bulk removal:

1. **The architecture docs no longer match the code.** `feature-map.md` and `naming-conventions.md` describe a domain-nested layout and several files/aliases that don't exist. The onboarding source of truth is actively misleading.
2. **The `src/` tree is flat where the docs say it should be domain-grouped** — 32 services in one folder, 17 main-infra files in one folder, 12 orchestrators in one folder. This is the biggest "hard to navigate" issue.
3. **A few small redundancies and naming collisions** (a duplicate re-export shim, two same-named "app orchestrators" in one process) add confusion for near-zero benefit.
4. **A handful of files have grown past ~450 lines** and are doing too much.

The single biggest *enabler* is that **160 test files import `src/` modules by full aliased path**, so every file move breaks tests. Decoupling that (barrels / per-domain aliases) de-risks most of the structural findings.

---

## Snapshot Metrics

| Metric | Value |
| --- | ---: |
| Hand-written TS in `src/` | ~26,966 LOC |
| Generated TS in `src/` | ~734 LOC |
| TS files in `src/` | 185 |
| Renderer files | 136 |
| Main files | 32 |
| Largest single file | `gpu-renderer.service.ts` (663 LOC) |
| `any` usages (excl. generated) | 24 |
| Unreferenced modules (heuristic) | 0 |
| Test files coupled to `src/` paths | 160 |

---

## Ranked Findings

| # | Finding | Dimension | Impact | Effort |
| --: | --- | --- | :-: | :-: |
| 1 | Architecture docs contradict the actual tree | Clarity | High | Low |
| 2 | Add a dead-code/unused-export tool (knip) | Size | Med | Low |
| 3 | Rename the second "app orchestrator" in renderer | Clarity | Med | Low |
| 4 | Delete redundant `file-download` re-export shim + unify the two `lib/` folders | Size/Clarity | Med | Low |
| 5 | Drop the redundant per-feature CSS barrel layer | Nesting | Low | Low |
| 6 | Extract the inline fatal-error screen from `renderer/index.ts` | Concerns | Low | Low |
| 7 | Decouple tests from `src/` paths (enabler for all moves) | Concerns | Med-High | Med |
| 8 | Group `infrastructure/services/` (32 files) by domain | Nesting/Clarity | Med-High | Med |
| 9 | Group `main/infrastructure/` (17 files) by domain | Nesting/Clarity | Med | Med |
| 10 | Tighten renderer bootstrap (`any` casts, manual wiring) | Concerns | Med | Med |
| 11 | Align main vs. renderer composition-root patterns | Clarity | Med | Med |
| 12 | Split the 7 oversized files (>450 LOC) | Concerns | Med | Med-High |
| 13 | Consolidate scattered streaming code under one domain | Concerns | Med | Med-High |
| 14 | Extract the ~140-line `NotesPanelComponent.initialize()` | Concerns | Low-Med | Med |
| 15 | Sub-group the 12 orchestrators (esp. the 3 performance ones) | Nesting | Low | Low-Med |
| 16 | Investigate the `importWithRetry` dynamic-import workaround | Size | Low | Low-Med |

---

## Quick Wins (do these first)

### 1. Architecture docs contradict the actual tree — **Impact: High · Effort: Low · Risk: None**

`docs/feature-map.md` and `docs/naming-conventions.md` describe a structure that no longer exists. The following doc-referenced paths/aliases are **missing**:

- `src/core/` and the `@core` → `src/core` alias (the whole "🏛️ Modern Core & Interface Conventions" section in `naming-conventions.md`) — core moved to the `@prismgb/core` package, and `feature-map.md` itself lists `@core` as *retired*.
- `src/shared/events/event-channels.ts`
- `src/shared/ipc/ipc.manifest.ts` and `ipc.manifest.json`
- `src/shared/features/devices/device.manifest.json`
- `src/renderer/infrastructure/services/devices/device-storage.service.ts` (actual: flat `…/services/device-storage.service.ts`)
- `src/main/infrastructure/devices/device-profile.registry.ts` (actual: flat `…/infrastructure/device-profile.registry.ts`)
- `src/shared/config/timing.config.ts` (actual `src/shared/config/` holds only `storage-keys.config.ts`)

**Why it ranks #1:** docs are the onboarding contract, and they currently send a reader to files that aren't there. It's also the cheapest fix.
**Recommendation:** Reconcile the two docs with reality in one pass. Decide per-claim whether the *doc* is stale (fix the doc) or whether the *code* drifted from an intended convention (note it as a target — see findings #8/#9, which the docs already prescribe).

### 2. Add a dead-code / unused-export tool — **Impact: Med · Effort: Low · Risk: None**

There is no `knip` / `ts-prune` / `depcheck` in the repo. My basename-reference heuristic found **0 orphaned modules**, but it cannot see unused *exports* within referenced files — the most common form of dead code in a DI codebase like this.
**Recommendation:** Add `knip` (workspace-aware, handles the monorepo) as a dev dependency and a `lint:dead-code` script. This gives a definitive unused-export/dependency sweep that this report's heuristic can't, and becomes a standing guardrail alongside the existing layer-boundary check.

### 3. Rename the second "app orchestrator" in the renderer — **Impact: Med · Effort: Low · Risk: Low**

There are two files named `app.orchestrator.ts`-ish in the *same* process with different jobs:

- `src/renderer/renderer-app.orchestrator.ts` — the **bootstrap / composition root** (plain class, builds the container, wires UI, calls `createApplication()`).
- `src/renderer/application/orchestrators/app.orchestrator.ts` — the **DI lifecycle coordinator** (`@Service`, coordinates 11 sub-orchestrators).

A reader grepping "AppOrchestrator" lands in the wrong place constantly.
**Recommendation:** Rename the bootstrap file to express its role, e.g. `renderer/app-bootstrap.ts` exporting `RendererBootstrap` / `createApplication`. Leaves the DI `AppOrchestrator` as the single "AppOrchestrator". (Note: `main/application/app.orchestrator.ts` is *also* a bootstrap orchestrator — see #11.)

### 4. Delete the redundant `file-download` shim and unify the two `lib/` folders — **Impact: Med · Effort: Low · Risk: Low**

`src/renderer/presentation/lib/file-download.utils.ts` is a **one-line re-export** of `src/renderer/lib/file-download.utils.ts`:

```ts
export { downloadFile } from '@renderer/lib/file-download.utils.js';
```

Meanwhile `renderer/lib/` exists *only* to host that one canonical file, while `renderer/presentation/lib/` holds the real utilities (`brightness`, `filename-generator`, and the shim). Two "lib" homes with overlapping intent.
**Recommendation:** Pick one home for renderer-level utilities (`renderer/lib/` reads as the more general one), move `downloadFile`'s single implementation there, update the ~2 importers + 2 test imports, and delete the shim and the now-empty folder.

### 5. Drop the redundant per-feature CSS barrel layer — **Impact: Low · Effort: Low · Risk: Low**

CSS uses a barrel-of-barrels: the top `presentation/styles/styles.css` `@import`s six per-feature `*.styles.css` files, each of which is a **1–8 line file that only `@import`s its `styles/` leaves**. That middle layer adds indirection without grouping logic.

```
styles.css ──@import──▶ notes.styles.css (8 lines of @import) ──▶ styles/notes-*.css (×8)
```

**Recommendation:** Have the top barrel import the per-feature `styles/*.css` leaves directly (or keep one barrel per feature but inline the others). Removes ~6 files of pure indirection. Low value, but trivially safe.

### 6. Extract the inline fatal-error screen from `renderer/index.ts` — **Impact: Low · Effort: Low · Risk: Low**

`src/renderer/index.ts` builds a ~25-line error screen with manual `document.createElement` calls inline in the entry file's catch block.
**Recommendation:** Extract to `presentation/shell/fatal-error-screen.ts`. Keeps the entry point about lifecycle, not DOM construction.

---

## Medium Effort (structural clarity)

### 7. Decouple tests from `src/` paths — **Impact: Med-High · Effort: Med · Risk: Low** *(enabler)*

160 test files import `src/` modules by full aliased path (e.g. `@renderer/infrastructure/streaming/acquisition/acquisition-context.ts`), several with explicit `.ts`/`.js` extensions that contradict the "prefer extensionless imports" convention. **Every structural move below breaks a batch of these imports**, which is what makes reorganization feel risky.
**Recommendation:** Introduce per-domain barrel exports (or finer path aliases) so tests import from a stable surface (e.g. `@renderer/services` rather than a deep file path). Do this *before* #8/#9/#13 so those moves touch the barrel, not 160 test files. Also normalize the extension inconsistency while here.

### 8. Group `infrastructure/services/` (32 files) by domain — **Impact: Med-High · Effort: Med · Risk: Low**

`src/renderer/infrastructure/services/` is a flat bucket of **32 files** spanning capture, devices, gpu, performance, settings, streaming, transcode, updates, health, viewport, audio. `naming-conventions.md` *already prescribes* `infrastructure/services/<domain>/` — the code simply never followed it.
**Recommendation:** Group into the documented domain subfolders (`capture/`, `devices/`, `gpu/`, `performance/`, `settings/`, `streaming/`, `transcode/`, `updates/`). Pure moves, no logic change. Effort is in the import churn (mitigated by #7). DI tokens are unaffected (resolution is by token string, not path).

### 9. Group `main/infrastructure/` (17 files) by domain — **Impact: Med · Effort: Med · Risk: Low**

Same flat-bucket problem in main: 17 files mixing `device*` (×4), `transcode*` (×3), `window`, `tray`, `login-item`, `usb-device-monitor`, `gpu-policy`, `logger*` (×2), `event*` (×2), `ffmpeg-path`.
**Recommendation:** Group to match the documented `main/infrastructure/<domain>/` convention (`devices/`, `transcode/`, `window/`, `tray/`, plus shared `logging/`, `events/`). Mirrors the renderer fix for cross-process consistency.

### 10. Tighten the renderer bootstrap — **Impact: Med · Effort: Med · Risk: Low**

`renderer-app.orchestrator.ts` holds **8 of the codebase's 24 `any` usages**, all `container.resolve<any>(...)`, and manually re-implements UI/bridge wiring (`_initializeUI`, `_registerUIComponents`, `_initializeUIEventBridge`) that overlaps with what the DI `AppOrchestrator` coordinates.
**Recommendation:** Resolve services through typed tokens (the DI layer already has generated types) to drop the `any`s, and consider folding the UI-bridge initialization into the DI `AppOrchestrator.initialize()` so the bootstrap file only owns container creation + start/stop. Pairs naturally with #3 and #11.

### 11. Align main vs. renderer composition-root patterns — **Impact: Med · Effort: Med · Risk: Low**

The two processes structure their composition root differently:

- **Main:** one `application/app.orchestrator.ts` that *both* bootstraps the DI container *and* coordinates services (self-documented as a "bootstrap orchestrator").
- **Renderer:** a *split* — `renderer-app.orchestrator.ts` (bootstrap) + `application/orchestrators/app.orchestrator.ts` (coordinator).

Same job, two shapes, which makes cross-process reasoning harder.
**Recommendation:** Pick one pattern and apply it to both processes. The renderer's split (bootstrap separate from coordinator) is the cleaner of the two; aligning main to it would make the composition root consistent and resolve the naming ambiguity from #3.

### 14. Extract `NotesPanelComponent.initialize()` — **Impact: Low-Med · Effort: Med · Risk: Low**

`notes-panel.component.ts` is 513 LOC even though list/editor/search/filter/autocomplete/resize are *already* separate components — because `initialize()` alone is ~140 lines (lines 154–293) of element wiring.
**Recommendation:** Extract the wiring into a small `notes-panel-wiring` helper or push setup into the sub-components. This is the clearest single example of the oversized-file pattern in #12.

### 15. Sub-group the 12 orchestrators — **Impact: Low · Effort: Low-Med · Risk: Low**

`application/orchestrators/` has 12 flat files, including **three** performance orchestrators (`performance-animation`, `performance-metrics`, `performance-state`).
**Recommendation:** At minimum group the performance trio under `orchestrators/performance/`. Lower priority than the services/infra grouping since orchestrators are all one kind.

### 16. Investigate the `importWithRetry` workaround — **Impact: Low · Effort: Low-Med · Risk: Med**

The renderer bootstrap wraps `import('./application/container')` in an exponential-backoff `importWithRetry` (3 attempts). This looks like a workaround for a transient chunk-load failure (possibly Vite HMR after sleep/wake — note the separate `vite:ws` reconnect logic in `index.ts`).
**Recommendation:** Determine whether it's still needed. If the original failure mode is gone, it's removable complexity; if real, document *why* so it isn't mistaken for dead code later. Marked Med risk because removing a real workaround could reintroduce a heisenbug.

---

## Larger Effort (worthwhile, but plan carefully)

### 12. Split the 7 oversized files (>450 LOC) — **Impact: Med · Effort: Med-High · Risk: Med**

| File | LOC | Note |
| --- | ---: | --- |
| `renderer/infrastructure/services/gpu-renderer.service.ts` | 663 | ~225 LOC between constructor and first public method; mixes settings access, preset mgmt, capture resolution, capabilities |
| `renderer/infrastructure/services/render-pipeline.service.ts` | 546 | central pipeline coordinator |
| `renderer/presentation/primitives/listbox-dropdown.class.ts` | 544 | reusable primitive; candidate to split behavior vs. rendering |
| `renderer/infrastructure/services/audio-pipeline.service.ts` | 517 | |
| `renderer/presentation/features/notes/notes-panel.component.ts` | 513 | see #14 |
| `main/infrastructure/device.service.ts` | 483 | |
| `renderer/infrastructure/services/streaming.service.ts` | 452 | state machine + adapter selection |

**Recommendation:** Treat each individually — large isn't automatically wrong (GPU/audio pipelines are inherently complex). Target the ones with mixed responsibilities first (`gpu-renderer.service`, `notes-panel.component`). Extract cohesive helpers behind the same public interface so consumers and tests don't change. Risk is Med because these are hot-path runtime files with the most behavior to preserve.

### 13. Consolidate scattered streaming code — **Impact: Med · Effort: Med-High · Risk: Low-Med**

The "streaming" concern is spread across **6 directories / ~20 files**: `application/orchestrators/` (×2), `infrastructure/services/` (×2), `infrastructure/adapters/` (×3), `infrastructure/factories/` (×2), `infrastructure/streaming/acquisition/` (×7), `presentation/features/streaming/` (×2). Some spread is *correct* layering (presentation vs. infra vs. app should stay separate). But within `infrastructure/`, streaming is split four ways (`services`, `adapters`, `factories`, `streaming/acquisition`) for no clear reason.
**Recommendation:** Consolidate the *infrastructure-layer* streaming pieces under one `infrastructure/streaming/` domain folder (services + adapters + factories + acquisition), leaving the orchestrator and presentation layers where they belong. Best tackled together with #8 (it's the same "group by domain" move) and after #7.

---

## What's Already Healthy — Leave It Alone

So the cleanup doesn't accidentally undo good work:

- **No dead modules.** The reference sweep found zero orphaned files. (Still run #2 for unused *exports*.)
- **Low type-debt.** 24 `any`s total, with a tracked allowlist and a `typecheck-app` gate. The biggest cluster (8) is the bootstrap file in #10.
- **Strong guardrails.** DI is generated (`generate-di.js`) and the `@Service` array is the single source of truth for dependencies; layer boundaries are enforced (`check-layer-boundaries.js`); contracts/validators are generated; there's a coverage ratchet and a type-debt report. Keep these — they're why the codebase is in good shape.
- **Generated files** (`di.generated.ts`, `validators.generated.ts`, `template-dom.generated.ts`) are not hand-maintained; exclude them from any reduction effort.
- **Genuinely-different same-named files** are fine: `transcode.service.ts`, `device.service.ts`, `logger.factory.ts` exist once per process (main vs. renderer). Only the two renderer "app orchestrators" (#3) are a real collision.
- **CSS leaf-splitting and the acquisition sub-package** are reasonable separations — only their *redundant wrapper layers* (#5) or *mis-grouping* (#13) are worth touching.

---

## Suggested Sequencing (by payoff-to-cost)

1. **Free wins, no moves:** #1 (docs), #2 (knip), #3 (rename), #4 (shim), #5 (CSS), #6 (error screen).
2. **Enabler:** #7 (decouple tests from paths) — unblocks the rest cheaply.
3. **Structural grouping:** #8, #9, #15, #13 — all "group by domain" moves, now low-risk thanks to #7.
4. **Targeted internal cleanup:** #10, #11, #14, then #12 file-by-file.
5. **Investigate-then-decide:** #16.

---

## Method & Caveats

- **Analysis is static** (file tree, LOC, grep for imports/`any`/`.css`, doc cross-checking, spot-reading the largest files). No code was run.
- **Dead-code detection is heuristic** (basename reference counting). It reliably finds orphaned *files* but not unused *exports* — hence finding #2 recommends a real tool for a definitive pass.
- **LOC is a proxy, not a verdict.** The oversized-file list (#12) flags candidates for review, not mandatory splits.
- **Effort estimates assume #7 is done first** for any finding that moves files; without it, add the cost of updating ~160 path-coupled test imports.
