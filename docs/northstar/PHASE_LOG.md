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

