# North Star Phase Log

Execution log for `NORTH_STAR_DESIGN_PLAN.md`. One section per phase; baselines and
exit metrics are recorded here, decisions are recorded here permanently.

## P0 — Baseline (2026-07-01, branch `refactor/gpu_normalization`, base `21b322c0`)

| Metric | Value |
|---|---|
| Test files / tests (`npm run test:run`) | 159 files / 2,071 tests |
| `npm run typecheck` | PASS |
| `npm run lint` | PASS |
| `npm run dev:smoke` | PASS |
| `npm run build:vite` | PASS (green since `4c5bf36d`; premise in the north-star corrected) |
| e2e specs passing | 86 / 86 (2.7m) |
| Prod LOC (src + packages/*/src) | 25,600 |
| Test LOC (tests + packages/*/tests) | 39,247 |

### Decisions

- **D1 (INF-1, ARM-Linux WebGPU-skip policy): DELETE — decided by owner 2026-07-01.**
  The renderer-side path (`capability-detector.utils.ts` → `gpu.getPolicy`) has been
  orphaned in committed code since `4011cb1b`. The policy remains enforced at the
  Chromium-flags layer: `src/main/index.ts` applies `disable-features=Vulkan` +
  `use-gl=desktop` on Linux-ARM at boot, so renderer WebGPU adapter requests fail
  naturally there. P1 Task 11 deletes the detector, the `gpu.getPolicy` route, and
  `gpu.schemas.ts`; `gpu-policy.ts` stays (trimmed per MAIN-9).
- **Coverage stance: FREEZE during the program.** Coverage is not a commit/CI gate
  today (CI runs tests without coverage; only `release:preflight` runs
  `test:coverage`). Keep it that way until P13, then re-ratchet. The stale
  `capability-detector.utils.ts` coverage-exclude entry is removed in P1 Task 11.
- **Executor: Antigravity (agy) headless, model `Gemini 3.5 Flash (High)`,** via
  `agy-phase` with `.agy-phase.conf` (base `refactor/gpu_normalization`, phase
  branches `northstar/phase-{P}`). P0 executed by the orchestrator per plan §4.4.

## P1 — Exit metrics (2026-07-01, branch `northstar/phase-1`)

| Metric | Value | Delta vs P0 |
|---|---|---|
| Test files / tests (`npm run test:run`) | 153 files / 1,942 tests | -6 files / -129 tests |
| `npm run typecheck` | PASS | - |
| `npm run lint` | PASS | - |
| `npm run dev:smoke` | PASS | - |
| `npm run build:vite` | PASS | - |
| Prod LOC (src + packages/*/src) | 25,069 | -531 LOC |
| Test LOC (tests + packages/*/tests) | 36,881 | -2,366 LOC |
| **Total LOC Delta** | | **-2,897 LOC** |

## P2 — Exit metrics (2026-07-01, branch `northstar/phase-2`)

| Metric | Value | Delta vs P1 |
|---|---|---|
| Test files / tests (`npm run test:run`) | 153 files / 1,942 tests | +0 files / +0 tests |
| `npm run typecheck` | PASS | - |
| `npm run lint` | PASS | - |
| `npm run dev:smoke` | PASS | - |
| `npm run build:vite` | PASS | - |
| `npm run check:gpu-boundaries` | PASS | - |
| Prod LOC (src + packages/*/src) | 25,000 | -69 LOC |
| Test LOC (tests + packages/*/tests) | 36,884 | +3 LOC |
| **Total LOC Delta** | | **-66 LOC** |

### Execution notes

- Task 1's content was folded into the Task 2 commit `4ac32ae7` by the executor
  (content complete, commit-per-task bookkeeping deviation).
- Task 12 hit a plan gap — `tests/unit/renderer/presentation/effects/effects.test.ts`
  also imported the deleted shim and was repointed to `@prismgb/config`.
- The Task 11 `satisfies` guards were reformulated post-hoc (commit `aafe1d91`) into
  `AssertAssignable` + `DeepPartial` type guards because zod inference collapses to
  all-optional under `tsconfig.test.json`'s `strictNullChecks: false`.
- The five planned deviations from the plan header stand (update.bridge,
  transcode-temp Logger, TypedEventBusLike deferral, .test.js extensions,
  isErrorLike export kept).
- The Task 16 sweep surfaced three additional local `LoggerFactoryLike` aliases
  beyond APP-6's audited two (capture.service, gpu-recording.service,
  update-section.component) — canonicalized in the follow-up commit.
- The sweep's `require('electron')` match in `src/preload/index.ts` is tolerated:
  sandboxed-preload `contextBridge`/`ipcRenderer` access predating this program,
  structurally distinct from X-2's app-singleton consolidation.

## P3 — Exit metrics (2026-07-02, branch `northstar/phase-3`)

| Metric | Value | Delta vs P2 |
|---|---|---|
| Test files / tests (`npm run test:run`) | 154 files / 1,950 tests | +1 file / +8 tests |
| `npm run typecheck` | PASS | - |
| `npm run lint` | PASS | - |
| `npm run dev:smoke` | PASS | - |
| `npm run build:vite` | PASS | - |
| `npm run check:gpu-boundaries` | PASS | - |
| e2e specs passing (`npm run test:e2e`) | 86 / 86 (2.6m) | - |
| Prod LOC (src; packages collapsed) | 28,198 | +12 LOC (corrected baseline, see measurement note) |
| Test LOC (tests; packages collapsed) | 37,059 | +121 LOC (corrected baseline, see measurement note) |
| **Total LOC Delta** (`git diff --shortstat pre-workspace-collapse..HEAD`) | 347 files changed, 932 insertions(+), 2,364 deletions(-) | **-1,432 LOC** |

### Measurement note

The P0-P2 prod/test LOC rows computed their packages term with the git
pathspec `packages/*/src/**/*.ts`, which never matches files directly under a
package's `src/` (git's `**/` does not match zero directories). The published
figures therefore undercounted package sources by 3,186 prod LOC and 54 test
LOC: P2's true full-count exit was prod 28,186 / test 36,938, not
25,000 / 36,884. The P3 deltas above are computed against that corrected
full-count baseline at `pre-workspace-collapse`; the collapse itself was
LOC-neutral for prod code (+12). The -1,432 total delta is the whole-branch
shortstat and includes the deleted manifests, per-package
tsconfig/vite/vitest configs, turbo, the exports checker, and lockfile motion
alongside src/tests.

### Commits (`git log --oneline pre-workspace-collapse..HEAD`)

```
bba0bfeb fix(e2e): route ipc channel fixtures through the platform prebundle
7c0ddf1f fix(e2e): prebundle devices testkit for Playwright's plain-Node resolution
408f4645 chore(platform): retire workspace residue from scripts and configs
68ce9424 refactor(platform): rewrite @prismgb imports to @platform and drop compat aliases
10ed5587 docs(northstar): drop stale platform-dom alias reference from Task 4
ee627eb6 docs(northstar): record relative-import decision for moved gpu tests
cb3c6cf2 test(platform): move package test suites into the root tree
5e76a293 fix(platform): restore lockfile integrity metadata lost to offline regeneration
34eb2c89 docs(northstar): amend P3 plan baselines after Task 2 execution findings
7696ec19 refactor(platform): collapse workspace package sources into src/platform
6881f57a chore(platform): add workspace alias registry ahead of collapse
```

### Execution notes

- Task 2's executor stopped BLOCKED correctly on three findings; fixes:
  depth-preserving relative-import retargets in 5 test files, and core's
  barrel-exported `getElectronApp` rewritten to lazy
  `process.getBuiltinModule` node access (module-scope `node:module` import
  crashed the unbundled dev-mode renderer; production tree-shaking had
  masked it).
- The sandboxed `npm install` stripped `resolved`/`integrity` from ~695
  lockfile entries; fixed by restoring the pre-collapse lockfile and pruning
  offline with `--package-lock-only` plus deleting 10 orphaned extraneous
  entries (commit `5e76a293`).
- The moved gpu tests import internals via relative paths, not
  `@platform/gpu` deep aliases — deep aliases resolve in vitest but can never
  typecheck under the registry's exact-match-only tsconfig paths; the
  platform-dom vitest project carries no gpu-specific alias. 30
  mechanism-only typecheck fixes in the moved gpu tests, reviewer-verified
  semantics-preserving.
- Test baseline moved 153 files/1,942 tests → 154/1,950 (+6 registry guard
  tests in Task 1, +2 config-sync guard tests in Task 2).
- The Task 4 codemod excluded `tests/unit/scripts/workspace-aliases.test.js`
  (its `@prismgb` literals are compat-prefix test data).
- The plan's anticipated isolatedModules fallout in `src/platform/**` never
  materialized; typecheck:app passed on first run after the move.
- The exit e2e gate caught a codemod-invisible regression class: Playwright
  resolves helpers with plain Node, so the two platform imports reachable
  from e2e (devices testkit, ipc channels) needed a registry-driven esbuild
  prebundle via globalSetup (esbuild is consumed transitively from vite;
  declaring it an explicit devDependency deferred to avoid an offline
  lockfile rewrite — flagged for owner follow-up).
- Relative-form and `@/`-form deep imports into platform internals are only
  partially covered by the interim gpu text-scan gate (alias tokens + the
  `@/platform/gpu` route); full three-family coverage (`@platform/x/deep`,
  `@/platform/x/…`, relative) is explicitly deferred to P4's
  dependency-cruiser rules — an accepted interim narrowing, per the final
  branch review.

## P4 — Exit metrics (2026-07-02, branch `northstar/phase-4`)

| Metric | Value | Delta vs P3 |
|---|---|---|
| Test files / tests (`npm run test:run`) | 156 files / 1,951 tests | +2 files / +1 test (+6 boundary self-test, −13 retired checker suite, +8 script libs) |
| `npm run lint` (eslint + depcruise) | PASS | gpu/layer checker scripts retired |
| `npm run lint:dead-code` (knip) | PASS (new failing CI gate) | was exit 1 pre-phase |
| `npm run typecheck` | PASS | typecheck:app now plain `tsc -p` |
| `npm run dev:smoke` | PASS | - |
| `npm run build:vite` | PASS | - |
| e2e specs passing (`npm run test:e2e`) | 86 / 86 (2.8m) | - |
| Prod LOC (src) | 28,193 | −5 |
| Test LOC (tests) | 37,105 | +46 |
| Code delta excl. lockfile+docs (`git diff --shortstat northstar-p3..HEAD -- . ':(exclude)package-lock.json' ':(exclude)docs/**'`) | 76 files, +589 / −1,106 | **−517 LOC** |
| Whole-branch shortstat (incl. plan doc + install lockfile motion) | 78 files, +2,743 / −1,229 | +1,514 (docs/lockfile-dominated) |

### Notes

- (a) Boundary enforcement is now ONE declarative gate: `.dependency-cruiser.cjs`
  (17 named rules + 10 generated per-platform-module rules), deriving platform
  surfaces from `scripts/lib/workspace-aliases.mjs` via `require()` of ESM
  (needs Node ≥ 22.12; CI runs Node 22). Deleted: `check-layer-boundaries.js`
  (+13-test suite + 13 fixture dirs), `check-gpu-package-boundaries.js`
  (+ `check:gpu-boundaries` script + 2 CI steps), all 8 eslint
  `no-restricted-imports` blocks. P3's interim three-family narrowing (note
  above) is closed: deep-alias imports fail `no-unresolvable`, `@/` and
  relative forms fail `app-to-platform-internals` on resolved paths.
- (b) The tightened matrix also closes old-checker sloppiness: main→renderer/lib,
  preload→main/bootstrap, and all of `src/platform/**` (previously unclassified
  ⇒ silently exempt) are now enforced. The single type-only tRPC edge
  (renderer/infrastructure → main/ipc) is preserved via
  `tsPreCompilationDeps: true` + `dependencyTypesNot: ['type-only']`.
- (c) Execution finding: depcruise orphans require no incoming AND no outgoing
  edges — dead-but-importing files are knip's job (unused-files), not
  depcruise's. Plan expectations were amended mid-phase (13 predicted orphan
  fixture violations removed; only the fully-disconnected fixture fires).
- (d) Self-test: one merged fixture tree (33 files), one depcruise spawn,
  exact violation-set equality (19 pairs) + structure guards (src top-level
  families vs the classified set; src/platform vs the registry) + the WebGL
  filename tripwire carried over from the retired gpu checker. Structure
  guards filter dot-entries (`.DS_Store` resilience — reviewer fix).
- (e) knip gate (CFG-4): pre-phase baseline was exit 1 with 11 unused exported
  types + 2 unused exported functions (the plan's baseline missed the
  functions — truncated capture) + 7 stale config hints. 5 intentional
  compile-time guards tagged `@public` (un-exporting would trip
  `noUnusedLocals` in the test program); 8 dead exports deleted, all
  grep-verified; stale ignores pruned (`@electron/notarize` kept).
- (f) SCR-4/5/6: `scripts/lib/{process-runner,fs-walk}.js` extracted (+8 unit
  tests); smoke-test on picomatch (`{dot: true}` preserves old regex
  semantics), dev-boot-smoke on `node:util` parseArgs; `typecheck-app.js`
  wrapper deleted for plain `tsc -p tsconfig.app.json --noEmit`. Pinned
  public exports of both smoke scripts unchanged. Known gap: the macOS
  mid-segment glob path is only exercisable via packaged `test:smoke`.
- (g) Live negative test at exit: a scratch infra→presentation import made
  `npm run lint` exit 1 naming `renderer-infrastructure-not-to-presentation`;
  removed, tree clean.
- (h) dependency-cruiser@17.4.3 + esbuild@0.28.1 installed OWNER-RUN online
  (sandbox npm corrupts lockfile metadata — P3 lesson); lockfile verified
  0 entries missing resolved/integrity. This also cleared the P3 esbuild
  declaration follow-up (`tests/e2e/global-setup.js`).

