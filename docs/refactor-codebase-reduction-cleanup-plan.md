# refactor/codebase_reduction — Cleanup & Completion Plan

> Audit date: 2026-06-26. Branch `refactor/codebase_reduction` vs `main` (~90 commits, 746 files).
> Method: 8-dimension fan-out audit → per-finding adversarial verification → completeness critic →
> independent re-verification of HIGH items → **Codex CLI + CodeReviewer dual-validation** (both confirmed all
> findings, zero false positives). Uncommitted working document.

## Execution status (2026-06-26) — DONE except S6

Executed on `refactor/codebase_reduction` in 9 commits (`2b24110d`..`68017e98`), net **−3,227 lines**. Every gate green
after each stage: full `typecheck`, `lint` + boundaries, `test:run` (now **173 files / 3200 tests**, up from 167/3114 —
G1 restored 4 suites + a core-package suite + the B4 guard), `dev:smoke`, codegen no-drift, `coverage:ratchet` at the
**restored 85** renderer floor, and a knip backlog reduced to the documented-intentional I1 set only.

- **Done:** G1, G2, B4 (gates) · S1, S2, S3, M1 (package strip, −2,385 LOC of duplicates) · S4, S5 (DI relocation +
  RENDERER_SHARED layer) · B1, B2, B3 · R1, R2, R3, N1, M2, D1 (cleanup/docs) · W1 (coverage restored to 85 on merit,
  waivers discharged) · follow-through dep prune (`68017e98`).
- **I1:** kept as documentation (the knip backlog is deliberate future-first API; the `EventPayloadExhaustivenessCheck`
  micro-cleanup was skipped — dropping `export` on an unreferenced type alias risks silently disabling the guard).
- **S6: DEFERRED** — owner decision (see its section below). It couples a renderer-only relocation to an ADR-0001
  coverage-scope rebaseline; not a blind mechanical fix.

## Health verdict

The refactor is **~90% landed and structurally sound**: `npm run dev:smoke` passes (DI container resolves at
boot), `node scripts/generate-di.js` leaves `di.generated.ts` in sync, layer-boundary lint passes, and the
executed suite is green (167 files / 3114 tests). The owner's anti-YAGNI/future-first surface (unused-but-deliberate
public APIs, compile-time-invariant types) is intact and correctly classified as intentional — **not** to be deleted.

But the branch has **two merge-gating regressions** the green badges hide, **one genuinely broken codegen path**,
and an **unfinished package-extraction seam** (three packages carry unconsumed — and in one case already-drifted —
duplicate implementations). The rest is low-risk cleanup and a handful of structural-guardrail repairs.

Severity legend: 🔴 merge-gating · 🟠 medium · 🟡 low. Effort: T(rivial)/S(mall)/M(edium).

---

## Phase 0 — Merge gates (do before merging to `main`)

### G1 🔴 — vitest `projects` migration silently dropped 4 test files (~59 passing cases) · S
`vitest.config.js` was rewritten from main's flat `include: ['tests/**/*.{test,spec}...']` to a `projects` model
whose per-project `include` lists enumerate specific subdirs and **omit `tests/workflows/**` and `tests/performance/**`**.
- Dropped, no longer executed: `tests/workflows/capture.workflow.test.js`, `tests/workflows/streaming.workflow.test.js`,
  `tests/performance/baseline.test.js`, `tests/performance/benchmarks.test.js`. Re-wired and run by the audit: **59 passed.**
- Invisible because the coverage ratchet enforces `src/**` coverage %, not the executed-test set — the
  "3114 tests" badge is the *post-drop* number.
- **Fix:** add `tests/workflows/**` to the **`renderer-happy-dom` project** `include` (`vitest.config.js:136-146`) —
  these renderer streaming/capture workflow tests need the `happy-dom` environment **and** that project's `setupFiles`;
  dropping them into `shared-node` (node env) would error. Decide `tests/performance/**` the same way (re-wire into
  `renderer-happy-dom`, or formally retire the dir + its helpers — see R3).
- **Caveat:** the audit's "59 passed" was measured under a *temporary flat* config (tests in isolation). That proves
  they *can* pass, not that they pass as-wired. After slotting them into `renderer-happy-dom`, **re-run them there** —
  re-enabling may surface real failures the flat-config run masked (env/setup differences).
- **Verify:** `npx vitest list | grep -E 'workflows|performance'` shows them collected, then `npx vitest run` is green.

### G2 🔴 — `generate-contracts.js` is broken; bare `npm test` and `npm run generate:contracts` fail · S
`MANIFEST_PATH` (`scripts/generate-contracts.js:9`) and the header string (`:91`) point at
`src/shared/ipc/ipc.manifest.json`, **deleted by this branch**. The real manifest is `packages/prismgb-ipc/src/ipc.manifest.json`.
- **Verified:** `node scripts/generate-contracts.js; echo $?` → `1` (ENOENT). Masked because CI + `.husky/pre-commit`
  use `test:run` (no `pretest` hook); only bare `npm test` / `generate:contracts` trip it.
- Consequence: `src/preload/validators.generated.ts` + `src/types/preload-api.d.ts` are **frozen** — cannot be
  regenerated to measure drift until the path is repaired.
- **Fix:** repoint `MANIFEST_PATH` + header to `packages/prismgb-ipc/src/ipc.manifest.json`; run the generator;
  commit the refreshed artifacts; review the diff (reveals any real channel drift accumulated while frozen).

### B4 🟠 — coverage governance enforces coverage %, not the executed-test set (root cause of G1) · S
Without this, G1-class regressions recur silently.
- **Fix:** add an executed-test-set guard — snapshot the collected test-file list (or case count) and fail CI on
  an unexplained shrink; or assert every `tests/**/*.{test,spec}.*` (minus `e2e`) is matched by some project `include`.
  Wire into `coverage:ratchet` / `release:preflight` alongside the existing monotonic guard (ADR-0001 territory).

---

## Phase 1 — Finish (or revert) the package-extraction seam · OWNER DECISION, then execute

Packages were scaffolded (commit `b8fb8b6a`) with **full copies** of `src/main` code, but production still runs the
`src/main` forks; only config/types/manifest are actually adopted from the packages. Per package, the owner picks a
direction: **(a) finish extraction** — point `src/main` at the package, delete the src copy — or **(b) strip the
package** to its adopted surface (config/types/manifest), delete the unconsumed impl files. The audit recommends (b)
as lower-risk for transcode/ipc; devices needs drift reconciliation regardless of direction.

### S1 🟠 — `@prismgb/devices`: 5 impl files (1097 LOC) unconsumed AND already DRIFTED (most urgent) · M
`device.service.ts`, `device-profile.registry.ts`, `usb-device-monitor.ts`, `device-lifecycle.service.ts`,
`device-bridge.service.ts` + their `index.ts` re-exports. Zero consumers of the service classes (importers adopt only
`DeviceRegistry`/`DeviceDetectionHelper`/`chromaticConfig`/`mediaConfig`/profile data); no package tests; live copies
wired in `src/main/application/container.ts`. The package `device.service.ts` (488 LOC) has **diverged ~106 LOC** from
the live `src/main` copy (382 LOC): the live one extracted USB-monitoring into the branch-new `UsbMonitoringController`/
`DeviceConnectionHandler`; the package copy still inlines it (a stale pre-refactor snapshot).
- **Fix:** reconcile drift first (live `src/main` is source of truth), then consolidate per the chosen direction.

### S2 🟠 — `@prismgb/transcode`: 4 impl files (1112 LOC) unconsumed, near-byte-identical duplicates · S
`transcode.service.ts`, `transcode-process.ts`, `ffmpeg-path.utils.ts` (byte-identical), `transcode-temp.utils.ts`.
Each differs from the live `src/main` copy by **one line** (the `TRANSCODE_CONFIG` import path). Importers adopt only
`TRANSCODE_CONFIG`/`TranscodeState`; zero importers of the impl files; no package tests.
- **Fix:** recommend (b) — strip the package to `transcode.config.ts`, delete the 4 impl files + re-exports.

### S3 🟠 — `@prismgb/ipc`: `ipc-handler.descriptor.ts` (176 LOC) unconsumed duplicate of the live copy · S
main already imports `IpcContractManifest` from `@prismgb/ipc` (partial adoption) but uses its **local**
`ipc-handler.descriptor.ts`; the package's `define*`/`register*` descriptor functions have zero importers (one-line
diff from the live copy).
- **Fix:** consolidate — main consumes the package descriptor + delete the src copy, OR strip the package to the
  manifest/types it legitimately provides.

### M1 🟠 — deep package-`src` imports bypass the package barrel (couples to S2) · T
`src/renderer/app-bootstrap.ts:16`, `src/renderer/presentation/features/settings/settings-menu.template.ts:11`, and the
(stale) `src/preload/validators.generated.ts:2` import `packages/prismgb-transcode/src/transcode.config.js` **directly**
instead of the `@prismgb/transcode` barrel — breaching the package's public-API boundary. The generator at
`generate-contracts.js:156-158` would emit the barrel form, but G2 blocks regeneration.
- **Fix:** switch the two hand-written sites to `import { TRANSCODE_CONFIG } from '@prismgb/transcode'`; the generated
  site self-corrects once G2 is fixed and the artifact is regenerated.

---

## Phase 2 — Structural guardrail repairs · 🟠 MEDIUM

The layer-boundary linter passes, but a **null-classification gap** silently exempts refactor-introduced files from
enforcement (see [[layer-boundary-null-classification-gotcha]]). No active leak today — these are latent holes.

### S4 🟠 — `di.generated.ts` escapes layer-boundary enforcement · S
At `src/renderer/` root it is neither `index.ts` nor `app-bootstrap.ts` (the only special-mapped renderer-root files),
so `classifyFileLayer` returns `null` and `analyzeLayerBoundaries` skips it (`check-layer-boundaries.js:295-298`), even
though it imports across infrastructure/application/presentation.
- **Fix (preferred):** relocate into `src/renderer/application/di/` beside `manual-providers.ts`/`external-tokens.ts`
  — closes the gap with **zero classifier changes** and un-strands the DI artifacts (2 already live in `application/di/`).
  Mechanical, but update **all three** reference sites or `lint:dead-code` / the build breaks: (1) `generate-di.js:6`
  `outputPath`, (2) `knip.json:10` `entry[]` (force-lists the old path — orphans otherwise), (3) `container.ts:1`
  import `'../di.generated.js'`. (The vite `diGeneratorPlugin` just shells `generate-di.js`, and `generate-di.js:243`
  matches by `endsWith` — both path-agnostic, no change needed.) Fallback: add to `SPECIAL_FILE_LAYER_MAP`.

### S5 🟠 — `renderer/lib/` is null-classified as both source and target (invisible infra→presentation channel) · S
`renderer/lib/file-download.utils.ts` is consumed by infrastructure (`capture-save.service.ts:4`) **and** presentation
(`ui.controller.ts:2`) — mutually-forbidden layers. Because the dir is unclassified, both `infra→lib` and
`lib→presentation` are silently permitted. The consolidation was correct (the file is genuinely cross-layer-shared);
the gap is the missing layer model.
- **Fix:** model a `RENDERER_SHARED` layer mapped to `renderer/lib` — importable by all renderer layers, forbidden from
  importing any — in `check-layer-boundaries.js` (`LAYER_SEQUENCE` + `FORBIDDEN_LAYER_MAP`).

### S6 🟠 — `shared/features/settings/` holds renderer-only code and splits the settings feature · M — **DEFERRED (owner decision)**
`settings.definitions.ts` is consumed only by the renderer (5 sites) and is renderer-**scoped** (hardcodes
`getEventManifestScopeEvents('renderer')`). `shared/features/` (cross-process) + `features` (feature-specific) is a
contradictory directory concept; the settings UI lives separately under `presentation/features/settings/`.

**Execution finding (2026-06-26):** verified BOTH `settings.definitions.{ts,json}` and `shared/config/storage-keys.config.ts`
are renderer-only (storage-keys' sole consumer is `application/di/manual-providers.ts`), so they'd relocate together.
The natural home is the new `RENDERER_SHARED` layer (`src/renderer/lib/`, from S5) — both are renderer-wide-shared and
import no renderer layer. **Blocker:** moving them out of `src/shared` shifts well-covered files (storage-keys is at 100%)
from the `src/shared` coverage scope into `src/renderer`, which interacts with the **ADR-0001 monotonic ratchet**
(`src/shared` floor 86/86/84/80). Relocating the best-covered files out of that scope would likely drop it below floor and
fail CI, requiring a deliberate coverage-threshold rebaseline. **Deferred** because it couples a structural move to a
governance-threshold decision the owner should make (target location + ratchet rebaseline) — not a blind mechanical fix.
- **Recommended fix when taken up:** `git mv` the three files to `src/renderer/lib/`; repoint the 7 import sites
  (`@shared/features/settings/settings.definitions` → `@renderer/lib/settings.definitions` ×5, storage-keys' internal
  import, and `manual-providers.ts`'s storage-keys import); retire `shared/features/` + `shared/config/`; then
  rebaseline the `src/shared` and `src/renderer` coverage thresholds in the same commit (ADR-0001 waiver or honest
  restate). The `RENDERER_SHARED` layer already permits this exact consumption shape.

---

## Phase 3 — Build / config consistency · 🟠/🟡

### B1 🟠 — external npm dependency under-declaration in two branch-new packages · T
`@prismgb/updates` calls `require('electron').app` (`update.service.ts:21`) but doesn't declare `electron`;
`@prismgb/devices` imports `type { Device } from 'usb'` (`usb-device-monitor.ts:1`) but doesn't declare `usb`.
(knip can't catch this — both are declared at the workspace root.)
- **Fix:** declare `electron` (dev/peer) in `packages/prismgb-updates/package.json`; `usb` (dev, type-only) in
  `packages/prismgb-devices/package.json`.

### B2 🟡 — stale coverage-exclude paths in `vitest.config.js` after the infrastructure-flatten move · T
Five dead exclude paths (`vitest.config.js:59-61,78-79`): the two streaming adapters, the streaming-renderer **factory**,
`src/shared/interfaces/**` (moved to `@prismgb/core`), and `src/shared/ipc/*.contract.ts` (moved to `@prismgb/ipc`).
- **Fix:** re-point **all three** live-but-relocated excludes to current paths —
  `…/services/streaming/adapters/streaming-canvas2d-renderer.adapter.ts`,
  `…/services/streaming/adapters/streaming-gpu-renderer.adapter.ts`,
  `…/services/streaming/streaming-renderer.factory.ts` (genuinely untestable; measure 0% — the exclude is correct intent) —
  and **remove** the two truly-gone excludes (`shared/interfaces`, `shared/ipc`).

### B3 🟡 — `vitest.config.js` declares `@prismgb/*/` trailing-slash subpath aliases that vite lacks · T
Nine trailing-slash aliases (`vitest.config.js:18,20,…,34`) with no counterpart in vite (renderer/main/preload); package
`exports` expose only the `.` barrel, and no source uses subpath imports — latent test-vs-build resolution divergence.
- **Fix:** remove the nine trailing-slash aliases for barrel-only parity with vite.

---

## Phase 4 — Orphan removals, naming, docs · 🟡 LOW

### R1 🟡 — orphaned barrel `src/main/application/index.ts` (zero importers after app-bootstrap rewire) · T
`app-bootstrap.ts` imports `container`/`app.orchestrator` directly. **Fix:** delete the barrel **and** drop its line
from `knip.json` `entry[]` (`knip.json:12` force-lists it, masking the orphan).

### R2 🟡 — two zero-importer `render-component.js` test helpers (NOT identical duplicates) · T
`tests/support/render-component.js` (branch-introduced, commit `68baebf8`) and `tests/utils/render-component.js`
(pre-existing) both have zero importers; the files differ materially. **Fix:** delete the branch-introduced one; confirm
intent + delete the pre-existing one too.

### R3 🟡 — three orphaned test-infra helpers (zero refs) · T
`tests/integration/electron-memory-util.js`, `tests/runtime-performance.js`, `tests/streaming-simulation.js` have no
importers. **Fix:** confirm + remove (pre-existing — opportunistic). Note: `tests/utilities/ResolutionCalculator.js` is
**live** (consumed by `ResolutionCalculator.test.js` + `tests/integration/streaming.test.js`) — keep it.

### N1 🟡 — `template-dom.generated.ts` is misnamed: `.generated` suffix, no generator, no banner, no drift guard · S
Hand-authored (no emitter ever existed; the historic parity checker was decommissioned). 5 import sites + `docs/feature-map.md:48`.
- **Fix:** drop the `.generated` suffix and move out of `presentation/generated/` (e.g. `template-dom.contract.ts`);
  optionally add a test asserting its ref ids match the real template. Do **not** build a generator.

### M2 🟡 — stale inert test mock in `tests/unit/main/update.service.test.ts:35-46` · T
Mocks the deleted `@shared/ipc/ipc.manifest.js`; the mock no longer exercises the real import seam (test passes 54
regardless). **Fix:** repoint the mock to the real manifest module (`@prismgb/ipc`) so it actually guards the seam, or
remove the dead mock.

### D1 🟡 — `CONTRIBUTING.md` drift · T
`:280` uses the deleted `@shared/base/service.base.js` import path → `@prismgb/core`; `:284` uses the old 3-arg
`super(dependencies, [...], 'MyService')` → `super(dependencies, 'MyService')` (Increment A dropped `requiredDeps`);
`:161` says pre-commit runs `npm test` → it runs `npm run test:run`. **Fix:** update all three. (Docs are otherwise grep-clean.)

### I1 🟡 — knip backlog is deliberate — document, do NOT delete · T
Current knip: ~3 unused exports + ~14 unused exported types — package public-API/compile-time-invariant types
(`EventPayloadExhaustivenessCheck`, `RENDER_PASS_HELPERS_BY_ID`, `BuiltInPreset`, `PresetMetadata`, `DeviceManifestEntry`,
`MutableDeviceRegistryEntry`, `ChromaticResolution`, `TranscodeStateValue`, `TranscodeFormatKey`, `TranscodeCompletedData`, …),
derived/structural renderer/preload types, and `createTemplateActionSelector` (symmetric counterpart to the used
`createTemplateRefSelector`). All deliberate per the future-first philosophy.
- **Fix:** record the disposition (a one-line note per symbol, or a `knip` config comment). Optional micro-cleanup: drop
  `export` on the pure compile-time invariant `EventPayloadExhaustivenessCheck` (zero external consumers).

### W1 🟡 — dated leftover: three `renderer-happy-dom` coverage waivers expire **2026-07-31** · T
`scripts/coverage-waivers.json` time-boxes a sub-1pt coverage reduction (lines/statements 85→84, functions 85→83)
from the 2026-05-29 domain regrouping. The expiry **is** enforced (ADR-0001 tripwire in `coverage:ratchet`), so on
2026-07-31 CI **breaks** unless `renderer-happy-dom` coverage is restored to 85 or the waivers are renewed. A genuine
development leftover with a deadline.
- **Fix (before 2026-07-31):** re-balance the relocated renderer suites back to ≥85% and restore the thresholds
  (discharge the waivers), or consciously renew them with a new expiry. Note G1's re-enabled workflow tests will move
  the `renderer-happy-dom` numbers — settle G1 first, then re-measure.

---

## Execution strategy (per the project's planning methodology)

| Stage | Items | Nature | Risk | Suggested executor |
|-------|-------|--------|------|--------------------|
| 0 | G1, G2, B4 | Config + codegen repair; **gate merge** | HIGH (behavioral) | ME / sequential, verify each |
| 1 | S1, S2, S3, M1 | Package consolidation | MED — needs **owner direction** first | ME after decision (drift-sensitive) |
| 2 | S4, S5, S6 | Layer-classifier + relocations | MED | ME (S4/S5 touch the enforcer); Coder(sonnet) for S6 moves |
| 3 | B1, B2, B3 | Build/config edits | LOW | Coder (haiku/sonnet), batch |
| 4 | R1, R2, R3, N1, M2, D1, I1 | Orphan removal, rename, docs | LOW | Coder (haiku), batch; ME reviews removals |

**Dependencies / ordering:**
- **G2 → M1's generated site → I1's regenerate**: fix `generate-contracts.js` first; the stale generated artifact and
  the `validators.generated.ts:2` deep-import self-correct on regeneration.
- **G1 ↔ R3 / `tests/performance`**: the keep-or-retire decision on `tests/performance/**` is shared — settle it once.
- **Phase 1 is decision-blocked**: do not delete either copy until the owner picks finish-vs-strip per package;
  reconcile S1's drift before any devices deletion.
- **S4 is mechanical** and a strict improvement (consolidates DI artifacts) — safe to land early and independently.
- **No file overlap** across Phase 3/4 batch items → safe to parallelize (non-overlapping file ownership).

**Validation gate after each stage:** `npm run typecheck && npm run lint && npm run test:run && npm run dev:smoke`,
plus `node scripts/generate-di.js && git diff --exit-code src/renderer/di.generated.ts` and (after G2)
`node scripts/generate-contracts.js && git diff --exit-code src/preload/validators.generated.ts`.

> **Runtime caveat:** finders are static. Wiring completeness was runtime-spot-checked via `dev:smoke` (boot DI resolves)
> and `generate-di` sync only. A full `npm test` is currently blocked by G2; run it once G2 lands as a deeper gate.
>
> **Packaging/release swept clean:** the inline `electron-builder` config (`package.json` `build.files`/`asarUnpack`/
> `afterPack`), `scripts/afterPack.js`, `scripts/smoke-test.js`, and `.github/workflows/*` carry **no** references to
> relocated/deleted source paths (`src/shared/ipc`, `shared/base`, `renderer/ui/`, `infrastructure/factories`). Notably
> `asarUnpack` lists `node_modules/usb/prebuilds/**` — confirming `usb` is a real runtime dependency, which corroborates
> B1 (the `@prismgb/devices` package merely under-*declares* it).

---

## Appendix — correctly rejected (false-positive control evidence; NOT action items)

Both Codex CLI and CodeReviewer confirmed these are non-issues:
- **Pre-existing / out of scope:** `IStreamingRenderer` type alias, `isStreamHealthOk/TimeoutPayload` guards, the six
  `@prismgb/gpu` barrels (byte-identical to `main`), the `Manager` codenames (`GpuWorkerManager`, `BodyClassManager`).
- **Intentional / load-bearing:** `filename-generator.utils.ts` + `constants.config.ts` re-export shims;
  `createMediaStream` (actually consumed at `device.factory.js:174`).
- **Already resolved on this branch:** turbo wiring, `vitest.workspace.ts`, the `rewrite-imports` codemod,
  `contract-helpers.js`/`manifest-drift.js`, over-declared `@prismgb/*` deps, the shared-coverage paydown.
- **Not a branch artifact:** the gitignored local-only plan doc under `docs/superpowers/plans/`.
