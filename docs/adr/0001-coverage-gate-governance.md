# ADR-0001: Coverage-gate governance — monotonic ratchet, waivers, honest baseline

**Status:** Accepted

## Context

Coverage is enforced by `scripts/coverage-ratchet.js`, which reads per-scope minimums from
`scripts/coverage-thresholds.json` and fails the build when measured coverage drops below a
minimum. It runs inside `npm run release:preflight` and in CI (`.github/workflows/reusable-ci-tests.yml`),
so it is a real merge gate.

Two structural weaknesses surfaced during the 2026-05-29 codebase-reduction work:

1. **The ratchet has no monotonic protection.** `coverage-thresholds.json` is a hand-edited file
   and the script only compares *actual vs. minimum*. Nothing prevents a minimum from being
   **lowered** to make a failing build pass. This is the inverse of what a ratchet is for.
2. **The heaviest gate is not part of the baseline contract.** Refactor/feature branches commonly
   validate `typecheck` + `lint` + `test:run` at their starting point but not `release:preflight`.
   A pre-existing coverage shortfall can therefore go undiscovered until the very end of a branch.

Both weaknesses were exercised concretely. The `shared-node` scope (`src/shared`) sits at roughly
**70% lines / 72% statements / 75% functions / 66% branches**, well below its enforced minimums of
86/86/84/80. `src/shared` was **not modified** by the refactoring and neither was the test-collection
config, so this is a **pre-existing** shortfall — `release:preflight` was already red at the branch
baseline. Rather than surface it, commit `c4e12faf` lowered the `shared-node` minimums to ~70/71/75/65
(reverse-engineered to sit just under the actual numbers) under the message *"adjust coverage ratchet
thresholds to match post-refactoring architecture"* — a euphemism, since that scope's architecture did
not change. The gate was moved to fit the coverage instead of the reverse, silently, inside an
unrelated refactor branch.

The `shared-node` threshold note already reads *"Bootstrap target for shared-node coverage migration"* —
i.e. these were forward targets that were never actually met.

## Decision

We will make coverage thresholds **tamper-evident, monotonic, and honestly baselined.**

1. **Monotonic enforcement.** `coverage-ratchet.js` gains a `--check-monotonic` mode that compares each
   target's `minimums` against the values at the CI merge-base and **fails if any metric decreased**
   unless a matching, unexpired waiver exists. This mode runs in `reusable-ci-tests.yml`. Thresholds may
   rise freely; they may not fall silently.

2. **Explicit waiver contract.** `scripts/coverage-waivers.json` records every intentional lowering as a
   first-class, owned, expiring entry:
   `{ target, metric, from, to, owner, reason, approvedBy, expiresOn, adr }`. A lowering passes the
   monotonic check only when covered by an unexpired waiver. Goalpost moves become visible, reviewed
   decisions — never buried commits.

3. **Honest baseline, then ratchet up.** Thresholds reflect the *true current* coverage per scope, set in
   a dedicated, reviewed "coverage baseline" commit — never bundled into a refactor. The `shared-node`
   gap (70 → 86) is recorded as tracked debt: a waiver with a paydown `expiresOn`, paid down by writing
   the missing `src/shared` tests and raising the floor each iteration. The "migration" note becomes a
   real, scheduled migration rather than an unmet aspiration.

4. **Preflight enters the definition-of-done baseline.** Any refactor/feature branch records
   `release:preflight` status at its starting point — green, or red-with-known-debt explicitly logged —
   before work begins. This structurally prevents "discover red preflight at the end → patch the gate."

## Consequences

- **Harder (intentionally):** lowering a coverage minimum now requires an explicit waiver with an owner,
  reason, and expiry, reviewed in its own commit. It can no longer be done silently or bundled.
- **Easier:** a reviewer can trust that a green `release:preflight` means the gate was *satisfied*, not
  *weakened*. Coverage debt is visible and scheduled, not hidden in threshold edits.
- **Obligation on callers:** the `shared-node` shortfall must be paid down to 86 by its waiver expiry, or
  the waiver re-reviewed. CI will block a silent re-lowering of any scope.
- **One-time work:** the threshold *values* from `c4e12faf` are retained — they match measured coverage,
  so the defect was the *process* (silent, euphemistic, ungoverned), not the numbers. They are
  retroactively legitimized by a `coverage-waivers.json` entry plus this ADR, and the monotonic check +
  waiver loader are implemented test-first so the lowering is governed from here on. The Context section
  above is the honest record of how the values arrived.

## Alternatives considered

- **Just revert `c4e12faf` back to 86/80.** Rejected as the sole action: it returns the gate to a value
  the codebase has never met, so `release:preflight` stays red with no path forward and no record of the
  debt. Honest baseline + tracked paydown is the durable form.
- **Revert `c4e12faf` and re-land identical values.** Rejected: the values match true coverage, so a
  revert-then-reapply is diff-noise that implies the numbers were wrong when only the process was. We
  fix forward — retain the values, add the governance and audit trail they lacked.
- **Delete the coverage gate / set it to `warning`.** Rejected — it removes a guardrail the project
  deliberately maintains, the opposite of the future-first goal.
- **Trust review to catch threshold lowerings.** Rejected — review demonstrably missed exactly this
  (the lowering was bundled into a 218-file refactor). Enforcement must be mechanical.
