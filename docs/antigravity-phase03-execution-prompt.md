# Antigravity Phase 03 Execution Prompt — @prismgb/ui-base Reactive Migration (Option B)

## GOAL PROMPT

Execute the committed plan `PLAN-03-ui-base-reactive.md` (repo root) EXACTLY as written. It is the largest plan — an inherently incremental, multi-phase migration. Carry it out faithfully, one shippable gated commit per step, and stop at its checkpoint.

BRANCH: create and do ALL work on `refactor/plan-03`, branched from the current HEAD of `refactor/codebase_reduction` (which already includes Plans 01–02). Do not touch any other branch.

RESUMPTION (this is a CONTINUATION run): Phase 1 is ALREADY DONE on the base branch — the `@prismgb/ui-base` package, the hand-rolled `reactive/signal.ts` + its correctness suite, the binding helpers (`SignalBinder` + `dom-bindings`), and the converted `status-notification` proof component + its event→signal store. VERIFY the current state first (`ls packages/prismgb-ui-base`, `git log --oneline -8`), SKIP every already-completed phase/component, and CONTINUE from the first INCOMPLETE phase per the plan's order: Phase 2 (promote the accessible-widget toolkit into ui-base), Phase 3 (AppState fields → signals), Phases 4–9 (component-by-component conversion grouped by feature). Do NOT re-scaffold or re-create what exists; do NOT re-run Phase 1.

EXECUTION RULES:
- Read `PLAN-03-ui-base-reactive.md` fully first. The reactive primitive is **HAND-ROLLED, zero-dependency** (do NOT add `@preact/signals-core` or any reactivity lib). Transcribe the Phase-1.2 `reactive/signal.ts` implementation EXACTLY and make the Phase-1.2b correctness suite (`signal.test.ts`) pass BEFORE building any consumer — if `diamond` or `dynamic deps` fails, the engine is wrong; fix `signal.ts`, do not weaken the test.
- CRITICAL ordering: do Phase 1 (scaffold + hand-rolled primitive + correctness suite + binding helpers + convert the ONE proof component) and PROVE it end-to-end (the converted component coexists with the 28 imperative ones; its existing tests stay green; dev:smoke + e2e pass) BEFORE enumerating/converting the rest. Each subsequent component conversion is its own gated commit; delete each glue file only as its LAST consumer is converted.
- For EACH plan phase/step: re-verify facts with live greps; make edits; run the phase GATE; commit only if green with the plan's message.
- Keep `@prismgb/core` dependency-free. Per the Plan-02 dist model (reconciled F7): `@prismgb/ui-base` is src-aliased ONLY on the 3 fast paths (vitest `sharedAlias` + 2 tsconfig — already done in Phase 1) and is consumed from `dist` by the app (NO vite alias — do not add one). It already builds to dist via turbo + the `predev`/`prebuild:vite` hooks; new ui-base source ships from there automatically.
- Commit hygiene: clean conventional messages, subject ≤100 chars, NO AI/tool attribution. NEVER use `--no-verify`.
- Gates: run EXACTLY what the plan specifies per phase, INCLUDING `npm run dev:smoke` (the only gate that catches package-resolution/boot regressions) and `npm run test:e2e` (the ~86 Playwright tests prove converted + imperative components coexist) for every phase the plan requires them.
- If any gate fails: FIX it per the plan's risk/rollback guidance (the binding-seam is one file — swappable). Never skip, weaken a test, or force.

STOP CONDITION: convert as many remaining components as you can cleanly, each its own fully-gated commit. STOP when EITHER (a) the plan's Done Criteria are ALL met (every component converted, all glue deleted, final gate incl. dev:smoke + e2e green), OR (b) you are running low on context/time — then STOP at a COHERENT boundary (immediately after a fully-gated, committed conversion; NEVER leave a component half-converted or a gate red) and clearly report in your final message which components are DONE and which REMAIN. Either way: do NOT merge, do NOT open a PR, do NOT start any other plan. Leave `refactor/plan-03` at its final commit for the orchestrator to verify against git.
