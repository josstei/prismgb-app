# ADR-0002: Renderer DI container load strategy (static import)

**Status:** Accepted

## Context

The renderer bootstrap (`src/renderer/app-bootstrap.ts`) constructs the DI container at startup. For
much of the project's history it loaded the container through a **dynamic import wrapped in an
exponential-backoff retry**:

```ts
const { initializeContainer } = await importWithRetry(() => import('./application/container'));
```

`importWithRetry` (3 attempts, 300 ms base, doubling) was introduced in commit `cdd3535c`
(2026-01-02), whose body lists *"Dev experience: Handle Vite connection loss during sleep/wake cycles."*
The retry therefore guarded a **transient chunk-load failure**, not a steady-state one.

Investigation of that failure mode shows it is **dev-only**:

- The sleep/wake handling in `src/renderer/index.ts` is itself explicitly gated:
  `if (import.meta.env.DEV) { … import.meta.hot.on('vite:ws:disconnect' / 'vite:ws:connect', … window.location.reload()) }`.
  `import.meta.hot` and `vite:ws` are **Vite dev-server / HMR** primitives that **do not exist in a
  production build**.
- A production build has no dev server to disconnect from; Vite emits statically-resolved chunks.
- There is **no deliberate code-splitting** of the container — `vite.config.js` defines no `manualChunks`
  isolating it — so the dynamic `import()` bought no first-paint or bundle-size benefit. Its sole purpose
  was the dev-time retry.
- After the 2026-05-29 reduction work, there are **no remaining dynamic imports in the renderer**.

Phase 5 of that work converted the container to a **static** top-level import and removed
`importWithRetry`. The change was correct but was made *without* recording this analysis, which is why
it initially read as a risky blind removal.

## Decision

We will load the renderer DI container via a **static (eager) import**:

```ts
import { initializeContainer, asValue } from './application/container.js';
```

`importWithRetry` and the dynamic `import('./application/container')` are removed. The dev-only
sleep/wake resilience remains where it belongs — behind `import.meta.env.DEV` in `index.ts`
(the `vite:ws` reconnect-reload), which already covers the dev scenario at the page level.

Rationale: the container is needed immediately at boot; a static import makes it part of the entry
module graph the browser has already fetched, **eliminating the separate lazy-chunk fetch that was the
only thing the retry protected** — so the static form is strictly *more* robust, including in dev. The
guarded failure mode does not exist in production.

## Consequences

- **Production:** no behavior change for shipped users — the failure mode the retry guarded was dev-only.
  The boot path is simpler and has one fewer failure surface.
- **Dev:** sleep/wake recovery is still handled by the existing `import.meta.env.DEV` `vite:ws`
  reconnect-reload in `index.ts`; no regression.
- **Guard:** a boot regression test pins the container-initialization path so this load contract is
  covered and cannot be silently changed again (the original retry had *no* test, which is what let it be
  removed without scrutiny).
- **Forward rule (binding):** if future work reintroduces dynamic `import()` for *genuine* code-splitting,
  chunk-load resilience must be a **first-class, reusable, observable** utility
  (`resilientImport(loaderFn, { retries, backoff })` with structured telemetry and JSDoc citing this ADR),
  applied uniformly — **not** an inline per-call-site helper, and any retry that only matters in dev must
  be gated behind `import.meta.env.DEV`. Inline band-aids that look like dead code are forbidden.

## Alternatives considered

- **Restore `importWithRetry` + the dynamic import.** Rejected: it reinstates an inline, untested,
  dev-only band-aid against a failure that does not occur in production, and the dynamic import bought no
  code-split benefit. It would re-create exactly the "looks like dead code" hazard.
- **Keep dynamic import, drop the retry.** Rejected: pure downside — retains the lazy-chunk fetch (the
  failure surface) while removing the only thing that mitigated it.
- **Build the `resilientImport` utility now.** Deferred (YAGNI for the current tree): there are no
  remaining dynamic imports to apply it to. The forward rule above mandates it the moment one returns.
