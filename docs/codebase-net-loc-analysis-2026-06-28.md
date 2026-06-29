# Codebase Net-LOC Analysis — Why the Refactor Grew Instead of Shrank (2026-06-28)

> Commissioned to answer one question: *"I see significantly more additions than deletions in
> the codebase, where this should have dramatically reduced it."* This doc replaces speculation
> with git-measured fact. All numbers re-checked on branch `refactor/p3-ipc-trpc-zod` (298 commits).

## TL;DR

The perception is correct in **gross** terms and modest in **net** terms — and the reason the
promised "dramatic reduction" never landed is structural, not accidental:

1. The refactor was overwhelmingly a **restructure + abstraction** program (extract 9 packages,
   add base classes / interfaces / DI codegen / a new IPC framework / boundary gates), **not** a
   deletion program. Restructure churns enormously but nets near-zero; abstraction only adds.
2. **Almost none of the planned *reduction* work has actually executed.** P2 (DI collapse),
   P5 (seam cleanup), and reduction Increments B/C/D are all unrun. The one that did run
   (Increment A) was −221 LOC. The reduction is *unrealized potential*; the additive restructure
   is *fully realized*.
3. The single biggest additive mass is **tests (48,615 LOC — 2× the application)**, a direct
   downstream cost of the abstraction count.
4. The deepest driver is a **genuine tension with the project's own architectural standard**
   (`CLAUDE.md`: anti-YAGNI, future-first, "more abstraction, more structure," "reach for the
   interface / registry / extension-seam *ahead of* the second consumer"). That standard *mandates*
   net-additive code. You cannot simultaneously maximize speculative abstraction **and** minimize LOC.

## 1. Current weight (tracked, excludes gitignored `dist/`)

| Area | LOC | Files | Note |
|---|---:|---:|---|
| `src/` (app) | 24,260 | 171 | renderer + main + preload |
| `packages/` (9 pkgs) | 10,891 | 130 | new top-level surface |
| `scripts/` (tooling) | 3,667 | 13 | codegen + gates, ships nothing |
| **Production subtotal** | **38,818** | **314** | |
| `tests/` | 48,615 | 243 | **1.38× all production; 2.0× `src/` alone** |

Per package: gpu 3,858 · devices 2,118 · core 1,711 · transcode 1,233 · events 735 · updates 521 ·
notes 327 · ipc 219 · config 169.

## 2. The actual add/delete deltas

`git diff --shortstat` on the combined `src`+`packages` pathspec (moves cancel in *net* = ins−del):

| Window | src+packages | tests |
|---|---|---|
| Whole program (e9ee6170 `2026-02-06` → HEAD) | +24,378 / −22,021 = **net +2,357** | +16,721 / −16,288 = **net +433** |
| Last ~50 commits (`2026-05-29` → HEAD) | +1,630 / −5,564 = **net −3,934** | +1,901 / −3,005 = **net −1,104** |

Reading:
- **Gross churn is enormous (~46k lines moved) but net production growth is only ~+2,357 LOC over
  five months.** Your "significantly more additions" is mostly the *gross* signal: most commits show
  large `+` counts (verbose new abstraction, Zod schemas, codegen, base classes) so insertions
  visibly lead even when the net is near-neutral.
- **The reduction *is* working — recently and slightly.** The last ~50 commits (reduction increments
  + P3) net **−3,934** in production. It started late and is small relative to the additive five
  months that preceded it.

## 3. Where the growth actually came from (ranked)

1. **Net-new abstraction in `packages/` built ahead of consumers.** Extraction moved code out of
   `src/` *and* added structure that never existed: base classes, interface contracts, registries,
   and a full primitive library. Concrete proof — core's primitive-CLASS layer has **zero** app
   consumers (per-symbol import check): `Bus` 0, `Cache` 0, `Store` 0, `Pipeline` 0, `Validator` 0,
   `Factory` 0, `Container` 0. ~227 LOC of speculative library + its tests. Small in LOC, but it is
   the philosophy made literal: future-first code with no second consumer.
2. **Tests (48,615 LOC).** Every new service / seam / abstraction gets a comprehensive suite. Test
   count rose 2,527 → 3,157 (+630 tests, +53 files). This is the largest single additive category and
   it is *invisible* to "did the app shrink" while being highly visible in diffs.
3. **Scaffolding / meta-code (3,667 LOC in `scripts/`).** DI codegen (`di.generated.ts` 368 +
   `generate-di.js`), boundary checks, type-debt reporting, coverage-ratchet, smoke gates. All
   additive, ships no feature — the cost of "strict contracts" enforcement.
4. **P3 IPC framework verbosity.** electron-trpc + tRPC-10 router + Zod schemas + `IpcPushBridge`
   replaced the manifest stack. P3 *deleted* the manifest/contracts/preload-globals (real deletions)
   but the typed-router + per-channel Zod schemas are wordier than what they replaced. Roughly a wash.

## 4. The root tension (the honest answer)

`CLAUDE.md` is explicit: *"We engineer for the future… design for extensibility… reach for the
interface, the generic primitive, the registered extension seam **ahead of** the second consumer…
more structure, more abstraction, more rigor — not less."* Executed faithfully, that standard
**produces net-additive code by construction**:

- core's unconsumed primitive library = "generic primitive ahead of the second consumer," verbatim.
- the device manifest+registry serving exactly **one** device = "registered extension seam ahead of
  the second consumer," verbatim.
- DI codegen + `manual-providers` + `external-tokens` + boundary scripts = "strict contracts."

None of these are mistakes against the standard; they are the standard. So the expectation
"dramatically reduce the codebase" is in direct conflict with the architectural philosophy the
codebase is being held to. **The reduction goal and the future-first goal cannot both be maximized.**
That is the core finding — the rest is bookkeeping.

## 5. What would actually deliver reduction (recoverable LOC, ranked by value)

| Action | Approx. LOC | Risk | Gate |
|---|---:|---|---|
| **Execute P2 (Awilix DI)** — deletes `di.generated.ts` (368) + `generate-di.js` + `manual-providers` + `external-tokens` + collapses 56 `@Service` + both hand-rolled containers | ~−600 prod + scripts (finder est.) | medium | dedicated PR; `dev:smoke` gate |
| **Delete core's dead primitive layer** (`Bus`/`Cache`/`Store`/`Pipeline`/`Validator`/`Factory`/`Container` + their interfaces + tests) | ~−227 + tests | low (0 consumers) | greenlight on trimming package surface |
| **Trivial dead code** (`IStreamingRenderer` shadow type, `RendererTrpcClient` alias, stale `joi` knip entry, `dist/` prune) | ~−40 | none | safe now |
| **Relax future-first on unconsumed package surface** — trim more of core's aspirational exports | variable | policy | architectural decision |
| **Test-suite right-sizing** — the real mass, but driven by abstraction count; fewer seams ⇒ fewer suites downstream | large but indirect | high | not a direct cut; follows from #4 |

Realistic near-term reduction without changing philosophy: **~−870 LOC** (P2 + dead primitives +
trivia), and it requires executing P2. Everything beyond that requires a deliberate decision to
**dial back the anti-YAGNI stance** for unconsumed surface — which is a values call, not a cleanup.

## 6. Recommendation

1. **Decide the philosophy dial first** (this is the lever, not the cleanups). If "dramatically
   reduce" is now the priority over "future-first," say so explicitly — it changes which package
   surface is "intentional extensibility" vs "dead weight to cut." Today the standard says keep it.
2. **Execute P2** — it is the largest *philosophy-compatible* reduction (codegen scaffolding is debt
   under any standard) and it is the most-ready phase (Spike-A green).
3. **Take the safe-trivial deletions now** (§5 row 3).
4. **Do not cut tests to hit a number** — test mass is a *symptom* of abstraction count; address it
   by reducing speculative abstraction (step 1), not by deleting coverage.
5. **Leave the genuine layering alone** — the device/transcode/event-bus "duplication" worry is
   refuted; consolidation onto core is already done. There is no large hidden duplication to delete.

---

*Supporting cutover audit (consolidation seam, shim classification, phase status) verified in the
companion findings; load-bearing claims independently re-verified by deterministic git greps this
session (core Bus/primitive consumers, device drift, `@Service`=56, turbo unwired, trivial-deletion
references). External Codex/CodeReviewer cross-check was attempted but hit a session limit; the
grep-checkable claims were verified directly instead.*
