# Antigravity Phase 02 Execution Prompt — Build Model: dist + turbo + CI

## GOAL PROMPT

Execute the committed plan `PLAN-02-build-model.md` (repo root) EXACTLY as written. It is an exhaustive, phased, gated plan; carry it out faithfully and stop at its checkpoint.

BRANCH: create and do ALL work on `refactor/plan-02`, branched from the current HEAD of `refactor/codebase_reduction` (which already includes Plan 01). Do not touch any other branch.

EXECUTION RULES:
- Read `PLAN-02-build-model.md` fully first. This is the HIGHEST-RISK plan (it can break the whole build). Follow its phases IN ORDER and obey its defensive staging: run `turbo run build` + `turbo run typecheck` LOCALLY for all packages FIRST and FIX any package that does not build standalone (the plan flags `@prismgb/ipc` as a known case) BEFORE touching CI.
- For EACH plan phase: re-verify the plan's Current-State Facts with live commands (TRUST live output, not literal line numbers); make the edits; run that phase's GATE; commit ONLY if green, one commit per plan phase with the plan's specified message.
- Honor the plan's adopted build model exactly (do NOT rip out the app's src-aliasing unless the plan's chosen model says to; the plan's recommendation is to keep app src-aliasing AND add a turbo standalone-build CI gate). Do not invent an alternative.
- Commit hygiene: clean conventional messages, subject ≤100 chars, NO AI/tool attribution. NEVER use `--no-verify`.
- Gates: run EXACTLY what the plan's gate matrix specifies (typecheck, test:run, lint, `turbo run build`/`turbo run typecheck` for all 9 packages, dev:smoke). If CI workflow files are edited, validate them as the plan specifies.
- If any gate fails: FIX it per the plan's risk/rollback guidance. Never skip or force.

STOP CONDITION: when the plan's Done Criteria are ALL met and the final gate is green, STOP. Do NOT merge, do NOT open a PR, do NOT start any other plan. Leave `refactor/plan-02` at its final commit for the orchestrator to verify against git.
