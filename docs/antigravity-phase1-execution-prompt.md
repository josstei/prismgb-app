# Antigravity Execution Prompt — North Star Phase 1 (dead-code excision)

Launched via `agy-phase 1` (see `.agy-phase.conf`). The launcher feeds everything after
the `## GOAL PROMPT` marker to `agy --print`. Phase P0 is complete and tagged
`northstar-p0`; this phase executes Tasks 5–16 of the implementation plan.

## GOAL PROMPT

You are executing Phase P1 (dead-code excision) of a plan-driven refactor of the PrismGB Electron app.

REPO: /Users/josstei/Development/prismgb-workspace/prismgb-app
BASE BRANCH: refactor/gpu_normalization (you are launched on it, clean tree)

FIRST ACTION: create and switch to the phase branch:
git checkout -b northstar/phase-1

AUTHORITATIVE PLAN: docs/northstar/2026-07-01-p0-p1-implementation-plan.md
Read that file in full before touching anything. Then execute **Tasks 5 through 16, in order, exactly as written**. Tasks 1–4 (Phase P0) are already complete — do not redo or re-verify them. The plan contains, for every task: the exact files, the exact before/after code, the validation commands with expected results, and the exact commit command.

NON-NEGOTIABLE RULES:
1. **One commit per task**, using EXACTLY the commit message written in that task's final step. Conventional format, subject ≤ 100 chars. NO AI/tool attribution of any kind — no "Generated with …", no "Co-Authored-By:". NEVER use `--no-verify` (the pre-commit hook is fast now; the commit-msg hook enforces commitlint).
2. **Validate before every commit.** Run every validation command in the task and confirm the expected result. Every grep-zero check must return empty. If a validation fails, fix it within that task's file list only; if you cannot, STOP immediately and report which task and which command failed — do not skip it, do not widen scope, do not continue to the next task.
3. **Touch ONLY the files each task lists.** No drive-by refactoring, no formatting sweeps, no added code comments (JSDoc only, and only where the plan shows it).
4. `npm run dev:smoke` is MANDATORY wherever a task's validation step says so (Tasks 7, 11, 12, 13, 14) — DI/base-class/router changes have a boot-break class that typecheck and vitest cannot catch. It must print "Renderer application started successfully".
5. The plan's "Plan-time corrections" section and each task's KEEP lists are binding: `gpu-policy.ts` is trimmed, never deleted; `updateListboxActiveState` keeps its export; `src/testkit/fixtures.ts` (the directory module) stays.
6. **EXCEPTION to the plan:** do NOT execute Task 16 Step 4 (the `git tag`). The orchestrator tags after independent verification. Everything else in Task 16 — the full gate ladder, the grep-zero sweep, and the Step 3 metrics commit — executes as written.

FINAL GATES (Task 16 Step 1 — all must pass before your last commit):
npm run test:run && npm run typecheck && npm run lint && npm run dev:smoke && npm run build:vite && npm run check:gpu-boundaries

WHEN DONE: STOP at the checkpoint. Do not merge, do not push, do not open PRs, do not start Phase P2. Print a final summary table: task number → commit hash → one-line result, plus the final gate outputs and the grep-zero sweep result.
