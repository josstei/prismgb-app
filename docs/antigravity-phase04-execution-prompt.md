# Antigravity Phase 04 Execution Prompt — Thin the Shell

## GOAL PROMPT

Execute the committed plan `PLAN-04-shell-thinning.md` (repo root) EXACTLY as written. This is a CONSERVATIVE, classification-first plan — the main risk is mis-scoping renderer glue as packageable domain. Carry it out faithfully and stop at its checkpoint.

BRANCH: create and do ALL work on `refactor/plan-04`, branched from the current HEAD of `refactor/codebase_reduction` (which already includes Plans 01–03). Do not touch any other branch.

EXECUTION RULES:
- Read `PLAN-04-shell-thinning.md` fully first. Produce/confirm the plan's classification table by READING each candidate before moving anything; move ONLY what is provably package-domain (no renderer/DOM/IPC coupling). The composition root (`service-registrations.ts`, `manual-providers.ts`, `container.ts`) STAYS in `src/`. When in doubt, leave it in `src/` and document why — under-moving is correct; over-moving is the failure.
- For EACH move: exact source→target path, the import-repoint set, the package.json dep additions (respect the acyclic downward dependency rule + the layer-boundary checker), then the GATE; one commit per move, smallest/safest first.
- Keep `@prismgb/core` dependency-free; a moved unit's target package must rebuild its `dist` for standalone typecheck (per the plan).
- Commit hygiene: clean conventional messages, subject ≤100 chars, NO AI/tool attribution. NEVER use `--no-verify`.
- Gates: run EXACTLY what the plan specifies per move (typecheck for the touched package + app, test:run, lint, dev:smoke, and `npm run test:e2e` for any device/stream/capture path).
- If any gate fails: FIX it per the plan's risk/rollback guidance, or revert the move and document it as intentional renderer layer. Never skip or force.

STOP CONDITION: when the plan's Done Criteria are ALL met and the final gate is green, STOP. Do NOT merge, do NOT open a PR, do NOT start any other plan. Leave `refactor/plan-04` at its final commit for the orchestrator to verify against git.
