# Antigravity Phase 01 Execution Prompt — @shared / src/shared Teardown

## GOAL PROMPT

Execute the committed plan `PLAN-01-shared-teardown.md` (repo root) EXACTLY as written. It is an exhaustive, phased, gated plan; your job is to carry it out faithfully and stop at its checkpoint.

BRANCH: create and do ALL work on `refactor/plan-01`, branched from the current HEAD of `refactor/codebase_reduction`. Do not touch any other branch.

EXECUTION RULES:
- Read `PLAN-01-shared-teardown.md` fully first. Follow its numbered phases (Phase 1 → 5) IN ORDER.
- For EACH plan phase: re-verify the plan's Current-State Facts with the live `git grep` (line numbers drift — TRUST THE GREP, not the literal numbers in the plan); make the edits; run that phase's GATE; and commit ONLY if the gate passes, using the plan's specified commit message (one commit per plan phase).
- Honor the plan's scope-discipline §0/§8 exactly: do NOT touch the `shared-node` vitest project, the `RENDERER_SHARED` layer, or `scripts/coverage-thresholds.json`.
- Commit hygiene: clean conventional messages, subject ≤100 chars, NO AI/tool attribution (no "Generated with…", no "Co-Authored-By"). NEVER use `--no-verify` (the husky pre-commit runs the full `npm run test:run`; a long/dirty commit will be rejected by commitlint/CI).
- Gates: run EXACTLY what the plan's §5 gate matrix specifies per phase. The final gate is `npm run typecheck && npm run test:run && npm run lint && npm run dev:smoke`.
- If any gate fails: FIX it per the plan's §6 risk/rollback guidance before proceeding. Never skip, weaken a test, or force past a red gate.

STOP CONDITION: when the plan's §7 Done Criteria are ALL met and the final gate is green, STOP. Do NOT merge, do NOT open a PR, do NOT start any other plan. Leave `refactor/plan-01` at its final commit for the orchestrator to verify against git.
