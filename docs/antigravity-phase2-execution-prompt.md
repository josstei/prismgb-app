# Antigravity Execution Prompt — North Star Phase 2 (contract normalization)

Launched via `agy-phase 2` (see `.agy-phase.conf`). The launcher feeds everything after
the `## GOAL PROMPT` marker to `agy --print`. Phases P0/P1 are complete and tagged
(`northstar-p0`, `northstar-p1`); this phase executes the P2 implementation plan.

## GOAL PROMPT

You are executing Phase P2 (contract normalization) of a plan-driven refactor of the PrismGB Electron app.

REPO: /Users/josstei/Development/prismgb-workspace/prismgb-app
BASE BRANCH: refactor/gpu_normalization (you are launched on it, clean tree)

FIRST ACTION: create and switch to the phase branch:
git checkout -b northstar/phase-2

AUTHORITATIVE PLAN: docs/northstar/2026-07-01-p2-implementation-plan.md
Read that file in full before touching anything. Then execute **Tasks 1 through 16, in order, exactly as written**. The plan contains, for every task: the exact files, the exact before/after code, the validation commands with expected results, and the exact commit command. Its "Plan-time verification notes" and deviation list are binding.

NON-NEGOTIABLE RULES:
1. **One commit per task**, using EXACTLY the commit message written in that task's final step. Conventional format, subject ≤ 100 chars. NO AI/tool attribution of any kind — no "Generated with …", no "Co-Authored-By:". NEVER use `--no-verify`.
2. **Validate before every commit.** Run every validation command in the task and confirm the expected result, including the NEGATIVE probe in Task 11 Step 2 (the drift guard must fail when the schema is wrong, then pass after reverting the probe). If a validation fails, fix it within that task's file list only; if you cannot, STOP immediately and report which task and which command failed — do not skip, do not widen scope, do not continue.
3. **Touch ONLY the files each task lists.** No drive-by refactoring, no formatting sweeps beyond Task 14's specified rewrite, no added code comments (JSDoc only where the plan shows it).
4. `npm run dev:smoke` is MANDATORY where a task's validation says so (Tasks 9 and 13) — it must print "Renderer application started successfully". Task 9 also requires `npm run build:vite` to pass (renderer bundle-safety for the node-flavored core helper).
5. The deviation list is binding: do NOT touch `update.bridge.ts`, `transcode-temp.utils.ts`'s local `Logger`, the orchestrators' `EventBusLike`→`TypedEventBusLike` unification, or `.test.js` extensions. `isErrorLike` stays exported.
6. Task 16 is gates + sweep + metrics ONLY — there is no tag step in this phase's plan; the orchestrator tags after independent verification.

FINAL GATES (Task 16 Step 1 — all must pass before your last commit):
npm run test:run && npm run typecheck && npm run lint && npm run dev:smoke && npm run build:vite && npm run check:gpu-boundaries

WHEN DONE: STOP at the checkpoint. Do not merge, do not push, do not open PRs, do not start Phase P3. Print a final summary table: task number → commit hash → one-line result, plus the final gate outputs and both sweep results.
