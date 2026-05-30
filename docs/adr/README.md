# Architecture Decision Records

This directory records **architecture decisions** — choices that are costly to reverse,
constrain future work, or resolve a contested trade-off. An ADR captures the *context*
and *consequences* of a decision so a future reader understands not just what was decided
but why, and what they must preserve.

## When to write an ADR

- A structural or cross-cutting choice (build gates, layering, load strategy, data flow).
- A decision that supersedes an earlier one (link the superseded ADR).
- Any time "we deliberately did X instead of the obvious Y" — so X is never mistaken for
  an accident and reverted by a later cleanup.

## Format

Each ADR is a numbered file `NNNN-kebab-title.md` with the sections:

| Section | Purpose |
| --- | --- |
| **Status** | `Proposed` / `Accepted` / `Superseded by ADR-NNNN` / `Deprecated`. |
| **Context** | The forces and constraints in play. Facts, not opinions. |
| **Decision** | The choice, stated in the active voice ("We will…"). |
| **Consequences** | What becomes easier, what becomes harder, what callers must now uphold. |
| **Alternatives considered** | Other options and why they were not chosen. |

Numbers are monotonic and never reused. A superseded ADR stays in place (history matters);
its Status points to the replacement.

## Index

| ADR | Title | Status |
| --- | --- | --- |
| [0001](0001-coverage-gate-governance.md) | Coverage-gate governance: monotonic ratchet, waivers, honest baseline | Accepted |
| [0002](0002-renderer-container-load-strategy.md) | Renderer DI container load strategy (static import) | Accepted |
| [0003](0003-oversized-file-decomposition-policy.md) | Oversized-file decomposition policy (LOC is a trigger, not a mandate) | Accepted |
