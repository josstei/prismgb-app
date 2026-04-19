# Changesets

This directory contains Changesets — markdown files describing package version bumps.

## When to add a changeset

- Every PR that changes a `@prismgb/*` package in a user-visible way.
- Internal refactors without API changes can skip (mark `--empty` if required by CI).

## How to add a changeset

```bash
npx changeset
```

Follow the interactive prompts:
1. Select which packages changed.
2. Select bump type (major/minor/patch).
3. Write a short summary.

The resulting `.md` file goes into this directory. Commit it with the PR.

## Versioning

- Tier 1 packages (`@prismgb/core`, `@prismgb/transport`, `@prismgb/runtime`) will be **linked** once created — they version together to preserve contract coherence. (Currently marked to be linked in Phase 1.)
- All other packages version independently.
- Every package starts at `1.0.0` once the refactor completes.
- All packages are `private: true` initially; lifted per-package when ready for external publishing.
