# Plan 01 — @shared / src/shared Teardown

## 0. Goal & End State

Erase the obsolete `shared` *layer concept* from the architecture. `src/shared/` is already gone (its only file, `TypedRegistryFactory`, was promoted to `@prismgb/core`); what remains is dead machinery: the `@shared` path alias (6 definitions), the first-class `SHARED` layer in the boundary checker (+ its test fixture), a dead test mock, and stale test-data/doc references.

**Done =** no `@shared` alias anywhere; the `SHARED` layer is removed from `scripts/check-layer-boundaries.js` and its fixture/test repointed; no production or test code resolves `@shared`; stale `src/shared` test-data and doc references are cleaned. **All gates green: `npm run typecheck`, `npm run test:run`, `npm run lint`, `npm run dev:smoke`.** No behavior change.

> **Scope discipline — three things that look related but are NOT part of this teardown (do NOT touch them):**
> 1. The **`shared-node` vitest project** (`vitest.config.js:107`, includes `tests/unit/shared/**` at `:114`) — that is the node-environment test project; its name is incidental, it has nothing to do with the `@shared` alias or `src/shared`. **KEEP.**
> 2. The **`RENDERER_SHARED` layer** (`check-layer-boundaries.js:20,48,137`) — that is the `@renderer/lib` shared-kernel layer, a different live layer. **KEEP.**
> 3. **Coverage thresholds** (`scripts/coverage-thresholds.json`, the coverage-ratchet) — there is NO real `src/shared` coverage scope (only synthetic test-data strings, handled in Phase 4). **Do NOT edit coverage thresholds.**

## 1. Preconditions

- On a fresh branch `refactor/shared-teardown` off `refactor/codebase_reduction`.
- The four plan documents (`PLAN-01..04-*.md`) are committed at the repo root (this very file is the audit record), so `git status --short` is clean before Phase 1. If any are still untracked, commit them first (`docs(plan): add execution plans`).
- Re-verify the ground state still matches §3 (line numbers drift; the executor MUST re-grep before each edit and trust the grep, not the literal line numbers below):
  ```bash
  git grep -n "@shared" -- vite.config.js vitest.config.js tsconfig.app.json tsconfig.base.json   # expect 6 hits
  git grep -n "@shared" -- src                                                                    # expect EMPTY (no production import)
  ```

## 2. Locked Decisions

- Remove the `SHARED` layer concept entirely (not leave it dormant) — `src/shared` is gone, the layer has no members.
- `shared-node` vitest project, `RENDERER_SHARED` layer, and coverage thresholds are **out of scope** (§0).
- No `--no-verify`; clean commit messages, subject ≤100 chars, no AI attribution. No inline comments.

## 3. Current-State Facts (verified; re-verify before acting)

**F1 — `@shared` alias: 6 definitions** (`git grep -n "@shared" -- vite.config.js vitest.config.js tsconfig.app.json tsconfig.base.json`):
- `vite.config.js:43`, `vite.config.js:91`, `vite.config.js:165` (three build-target alias blocks; the exact target labels do not matter — delete all three `'@shared': path.resolve(__dirname, 'src/shared'),` lines).
- `vitest.config.js:16` (`'@shared': path.resolve(__dirname, 'src/shared'),`).
- `tsconfig.app.json:19` and `tsconfig.base.json:36` (each an `"@shared/*": [ ... ]` paths block — typically 2 lines: the key + the target array; delete the whole block).

**F2 — No production code imports `@shared`:** `git grep -n "@shared" -- src` returns empty. (`src/shared/` was dissolved.) So removing the alias affects only the items below.

**F3 — The `SHARED` layer in `scripts/check-layer-boundaries.js`** (`git grep -nE "SHARED|@shared/" -- scripts/check-layer-boundaries.js`):
- `:21` — `SHARED: 'shared',` (a `LayerIds` object-literal key).
- `:49` — `LayerIds.SHARED,` (entry in a layer-id list).
- `:151` — `[LayerIds.SHARED]: new Set([ ... ]),` (the SHARED allow-list rule block — spans multiple lines; find its closing `]),`).
- `:271–272` — `if (specifier.startsWith('@shared/')) {` / `return LayerIds.SHARED;` (the alias-prefix classifier, a 3-line block incl. the closing `}`).
- **Grep-count corollaries (the executor's pre-verify must expect these EXACT counts, or it will false-abort):**
  - `git grep -c "LayerIds.SHARED" -- scripts/check-layer-boundaries.js` → **3** (lines 49, 151, 272). Line 21 is the object KEY `SHARED:`, which does NOT contain the substring `LayerIds.SHARED`.
  - `git grep -nE "LayerIds.SHARED|@shared/|SHARED: 'shared'" -- scripts/check-layer-boundaries.js` → **5** hits (21, 49, 151, 271, 272). The `@shared/` sub-pattern matches BOTH line 271 (the `if`) and line 272 (the `return`).
- **Do NOT touch** `RENDERER_SHARED` (`:20`, `:48`, `:137`) — different live layer.

**F4 — Boundary-checker fixture depends on the SHARED classifier:** `tests/fixtures/layer-boundaries/pass-basic/src/renderer/infrastructure/service.ts:1` imports `@shared/lib/helper` specifically to exercise the `renderer/infrastructure → SHARED` allow-rule, asserted by `tests/unit/scripts/check-layer-boundaries.test.js`. The checker analyzes fixtures **statically as path strings** (`runFixture` reads files; it does NOT import/typecheck/resolve them), so the vite/tsconfig alias removal (Phase 2) does NOT affect it — but retiring the SHARED layer (Phase 3) does, and requires repointing this import to a still-allowed target.

**F5 — Dead mock (BLOCKER, remove FIRST):** `tests/unit/main/window.service.test.ts:19` has `vi.mock('@shared/config/config-loader.utils.js', ...)`. It is inert — `window.service.ts:5` imports `uiConfig` from `@prismgb/config`, NOT `@shared/config`. While the alias exists, vitest tolerates a mock of an unresolved-but-aliased spec; remove the alias (Phase 2) **without** first deleting this mock and vitest can no longer resolve the spec → the test errors. So delete the mock in Phase 1.

**F6 — Stale `src/shared` test-data (synthetic; tests pass, but stale):**
- `tests/unit/scripts/coverage-ratchet.test.js` — `:74`, `:92`, `:103`, `:125` use `'src/shared'`/`'src/shared/**'`/`'src/shared/model.ts'` as mock config scopes, AND **two distinct synthetic ids**: `id: 'shared-node'` (≈`:72`, in the `readCoverageThresholds` test) and `id: 'shared'` (≈`:123`, in the `evaluateCoverageRatchet` test). These are TEST DATA, not filesystem-checked.
- `tests/unit/scripts/typecheck-app.test.js` — `:110,130,144,147,158` use `'src/shared/example.ts'` as a synthetic diagnostic path.

**F7 — Stale doc references:** `docs/feature-map.md` (the architecture-aliases row lists `@shared` AND has an adjacent alias COUNT, currently `7`, that becomes stale), `docs/naming-conventions.md` (`@shared -> src/shared`), `docs/architecture-diagrams.md`, `docs/architecture-diagrams-onboarding.md`, and historical `docs/refactor-*.md`. (Re-verify the set: `git grep -ln "@shared\|src/shared" -- docs`.)

**F8 — `test:run` runs 5 vitest projects** (`vitest.config.js` `projects: [...]`, incl. `shared-node`, `renderer-happy-dom`, `main-preload`, `gpu-package`, `core-package`). Removing the alias does not change project membership.

## 4. Phased Implementation

### Phase 1 — Delete the dead `window.service` mock (unblocks alias removal)

1. In `tests/unit/main/window.service.test.ts`, delete the `vi.mock('@shared/config/config-loader.utils.js', () => ({ ... }))` block (the comment `// Mock ConfigLoader` above it too if present). `window.service.ts` gets `uiConfig` from `@prismgb/config`; verify that path is either real or already mocked elsewhere in the file (`git grep -n "@prismgb/config" tests/unit/main/window.service.test.ts src/main/infrastructure/window/window.service.ts`). If the test relied on the mocked `WINDOW_CONFIG` values, re-point the mock to `@prismgb/config` instead of deleting (read the test to decide; default is delete, since the mock is currently inert).
2. **Gate:** `npx vitest run tests/unit/main/window.service.test.ts` → green.
3. **Commit:** `test(main): drop dead @shared/config mock from window.service test`

### Phase 2 — Remove the 6 `@shared` alias definitions

1. Delete the three `'@shared': path.resolve(__dirname, 'src/shared'),` lines in `vite.config.js` (re-find with `git grep -n "@shared" -- vite.config.js`).
2. Delete the `'@shared': path.resolve(__dirname, 'src/shared'),` line in `vitest.config.js`.
3. Delete the `"@shared/*": [ ... ]` paths block in `tsconfig.app.json` and in `tsconfig.base.json` (key + its target-array lines; ensure surrounding JSON stays valid — no trailing comma left dangling, no missing comma on the preceding entry).
4. **Verify nothing else resolves `@shared`:** `git grep -n "@shared" -- src vite.config.js vitest.config.js tsconfig.app.json tsconfig.base.json` → EMPTY.
5. **Gate:** `npm run typecheck && npm run test:run`. (The boundary fixture's `@shared/lib/helper` import is statically analyzed, not resolved — F4 — so it is unaffected here. The Phase-1 mock removal means no vitest mock references `@shared` anymore.)
6. **Commit:** `build: remove the dead @shared path alias (src/shared dissolved)`

### Phase 3 — Retire the `SHARED` layer from the boundary checker

1. Pre-verify (expect the F3 counts): `git grep -nE "LayerIds.SHARED|@shared/|SHARED: 'shared'" -- scripts/check-layer-boundaries.js` → **5** hits (21, 49, 151, 271, 272). If not 5, STOP and re-read F3.
2. In `scripts/check-layer-boundaries.js`:
   - Delete the `SHARED: 'shared',` key (`:21`) from the `LayerIds` object. **Keep `RENDERER_SHARED` (`:20`).**
   - Delete the `LayerIds.SHARED,` entry (`:49`) from the layer-id list. **Keep `LayerIds.RENDERER_SHARED` (`:48`).**
   - Delete the entire `[LayerIds.SHARED]: new Set([ ... ]),` allow-rule block (starts `:151`, ends at its `]),`). **Keep the `[LayerIds.RENDERER_SHARED]: new Set([` block (`:137`).**
   - Delete the alias classifier `if (specifier.startsWith('@shared/')) { return LayerIds.SHARED; }` (the 3-line block at `:271–273`). Leave the surrounding classifier branches intact.
3. Repoint the fixture so `pass-basic` still exercises a VALID allowed import: in `tests/fixtures/layer-boundaries/pass-basic/src/renderer/infrastructure/service.ts:1`, change `import { helper } from '@shared/lib/helper';` to an import that is allowed from `renderer/infrastructure` under the surviving rules — e.g. `import { something } from '@prismgb/core';` (core is allowed everywhere) or a `@renderer/lib/...` (RENDERER_SHARED) import. Read `check-layer-boundaries.test.js` to see what `pass-basic` asserts, and pick an import that keeps it a PASS fixture. If the fixture exists ONLY to test the SHARED allow-rule and no other fixture covers `@prismgb/core`/`@renderer/lib`, repoint to whichever the test's pass-assertion still validates.
4. Update `tests/unit/scripts/check-layer-boundaries.test.js` if it references `SHARED`/`@shared` (`git grep -n "SHARED\|@shared" -- tests/unit/scripts/check-layer-boundaries.test.js`; note the intentional `renderer/lib` matches at ~`:114,:119` are RENDERER_SHARED — do NOT remove those). Adjust only assertions tied to the removed SHARED layer / the repointed fixture import.
5. **Gate:** `npm run lint` (runs `eslint` + `node scripts/check-layer-boundaries.js`) **and** `npx vitest run tests/unit/scripts/check-layer-boundaries.test.js`. Boundary checks must pass and the fixture test must be green.
6. **Cleanup:** after `git rm`-ing nothing here (the fixture file is edited, not removed), confirm no empty dirs were created. (If a future step `git rm`s a fixture, follow with `find tests/fixtures/layer-boundaries -type d -empty -delete`.)
7. **Commit:** `refactor(arch): retire the obsolete SHARED layer from the boundary checker`

### Phase 4 — Clean stale test-data and docs

1. `tests/unit/scripts/coverage-ratchet.test.js`: rename the synthetic scope strings `'src/shared'`/`'src/shared/**'`/`'src/shared/model.ts'` to a neutral placeholder (e.g. `'src/example'`/`'src/example/**'`/`'src/example/model.ts'`). Rename the TWO distinct synthetic ids **separately** (do not conflate): `id: 'shared-node'` (≈`:72`) → `id: 'example-node'`, and `id: 'shared'` (≈`:123`) → `id: 'example'`; update the matching assertions that reference those ids (e.g. `entry.target === 'shared'` near `:146`). **This is test-only data — it does NOT correspond to any real coverage scope; do not edit `scripts/coverage-thresholds.json`.**
2. `tests/unit/scripts/typecheck-app.test.js`: rename `'src/shared/example.ts'` (`:110,130,144,147,158`) → `'src/example/sample.ts'` consistently (synthetic diagnostic path).
3. Docs (`git grep -ln "@shared\|src/shared" -- docs`): remove `@shared` from `docs/feature-map.md`'s architecture-aliases row AND decrement the adjacent alias COUNT (`7` → `6`); update `docs/naming-conventions.md` (remove the `@shared -> src/shared` line); fix `docs/architecture-diagrams*.md` references. Leave HISTORICAL planning docs (`docs/refactor-*.md`, `docs/refactor-execution/*`) untouched OR add a one-line "(retired)" note — do not rewrite history; they are records.
4. **Gate:** `npm run test:run` (the renamed test-data must keep its tests green) `&& npm run typecheck`.
5. **Commit:** `chore: clean stale src/shared test-data + doc references`

### Phase 5 — Final verification

```bash
git grep -n "@shared" -- src tests scripts vite.config.js vitest.config.js tsconfig*.json   # EMPTY
git grep -n "@shared" -- docs                                                               # EMPTY (or only "(retired)" notes)
git grep -nE "LayerIds.SHARED|SHARED: 'shared'" -- scripts/check-layer-boundaries.js          # EMPTY
git grep -n "RENDERER_SHARED" -- scripts/check-layer-boundaries.js                            # still present (3 — KEEP)
npm run typecheck && npm run test:run && npm run lint && npm run dev:smoke
```
> Note on a bare `git grep "shared"`: it WILL still match the intentional, KEPT items — the `shared-node` vitest project, `RENDERER_SHARED`, `tests/unit/shared/**`, and historical docs. Do NOT use an unscoped `shared` grep as a done-check; use the scoped `@shared`/`LayerIds.SHARED` greps above.

## 5. Gates & Verification

| Phase | Gate |
|---|---|
| 1 | `npx vitest run tests/unit/main/window.service.test.ts` |
| 2 | `npm run typecheck && npm run test:run` |
| 3 | `npm run lint` + `npx vitest run tests/unit/scripts/check-layer-boundaries.test.js` |
| 4 | `npm run test:run && npm run typecheck` |
| Final | `npm run typecheck && npm run test:run && npm run lint && npm run dev:smoke` |

`dev:smoke` at the end confirms no boot regression (none expected — no runtime code changes). `lint` is the load-bearing gate for Phase 3 (it runs the boundary checker). Interpreting failures: a Phase-2 `test:run` failure almost certainly means the Phase-1 mock was not removed first (F5); a Phase-3 `lint` failure means a SHARED branch was half-removed (re-check all 5 lines) or the fixture repoint chose a disallowed import.

## 6. Risks, Mitigations & Rollback

| Risk | Likelihood | Blast radius | Mitigation | Rollback |
|---|---|---|---|---|
| Remove alias before mock (F5) → window.service test breaks | Med if phases reordered | 1 test | Phase 1 strictly precedes Phase 2 | restore the mock OR re-point it to `@prismgb/config` |
| Half-remove the SHARED layer (miss line 271 or the allow-block close) | Med | boundary checker | F3 exact-count pre-verify; `lint` gate | revert Phase-3 commit |
| Repoint fixture to a DISallowed import → `pass-basic` flips to fail | Low | 1 fixture test | choose `@prismgb/core` (allowed everywhere) and re-read the test's assertion | revert Phase-3 commit |
| Accidentally delete `RENDERER_SHARED` or the `shared-node` project | Low | broad (boundary/test config) | §0 scope-discipline callouts; keep-greps in Phase 5 | revert the commit |
| Invalid JSON after deleting a tsconfig paths block (dangling comma) | Med | typecheck | Phase 2 gate `npm run typecheck` catches it immediately | fix the comma |

Each phase is its own commit → rollback is `git revert <phase commit>`; phases are independent except 1-before-2.

## 7. Done Criteria

- [ ] `git grep -n "@shared" -- src tests scripts vite.config.js vitest.config.js tsconfig*.json` is EMPTY.
- [ ] `git grep -nE "LayerIds.SHARED|SHARED: 'shared'" -- scripts/check-layer-boundaries.js` is EMPTY; `RENDERER_SHARED` still present (3 hits).
- [ ] `tests/fixtures/layer-boundaries/pass-basic` still passes via a non-`@shared` import; `check-layer-boundaries.test.js` green.
- [ ] No `@shared` doc references remain (or only explicit "(retired)" notes in historical docs).
- [ ] `npm run typecheck && npm run test:run && npm run lint && npm run dev:smoke` all green.
- [ ] `shared-node` vitest project, `RENDERER_SHARED` layer, and `scripts/coverage-thresholds.json` are UNCHANGED.

## 8. Out of Scope (do NOT do)

- Renaming or removing the `shared-node` vitest project, or the `tests/unit/shared/**` include (node-env test project; incidental name).
- Touching the `RENDERER_SHARED` (`@renderer/lib`) layer.
- Editing `scripts/coverage-thresholds.json` or any coverage-ratchet logic (no real `src/shared` coverage scope exists; F6 is synthetic test-data only).
- Rewriting historical planning docs under `docs/refactor-*`.
- Any change that alters runtime behavior.
