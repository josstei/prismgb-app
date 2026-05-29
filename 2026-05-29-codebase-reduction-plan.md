# Codebase Reduction & Architecture Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute all 16 findings from `codebase-reduction-analysis.md` (repo root) to make `src/` clearer, better-separated, and less nested — without changing runtime behavior.

**Architecture:** Five independent, individually-shippable phases following the report's payoff-to-cost sequence: (1) zero-move quick wins, (2) a move-safety enabler, (3) domain-grouping file moves, (4) internal cleanup + oversized-file splits, (5) one investigation. Every change is behavior-preserving and gated by the existing test/typecheck/lint suite.

**Tech Stack:** Electron + Vite + TypeScript (ESM, path aliases), npm workspaces monorepo (`@prismgb/*`), Vitest (unit + integration), Playwright (e2e), generated DI container (`scripts/generate-di.js`), generated IPC contracts (`scripts/generate-contracts.js`), enforced layer boundaries (`scripts/check-layer-boundaries.js`).

---

## How To Use This Plan

**Phases are independent.** Each phase ends with a green build and is shippable on its own. You may stop after any phase. Do not start Phase 3 moves before Phase 2 is done.

**This is mostly a refactoring plan, not feature work.** Two task shapes appear:

- **Refactor-verify tasks** (most tasks): the safety net is *"establish green → make the behavior-preserving change → confirm still green."* There is no new failing test to write because behavior must not change; the existing suite is the regression guard. Where a task *extracts a pure function*, real red-green TDD is used (write the test for the new pure unit first).
- **TDD tasks** (extracted pure utilities only): write the failing test first, then the implementation.

**Relocation convention:** For "move/split" tasks, the method *bodies* being moved are existing, unchanged code — they are referenced by name and line range, not re-pasted, to avoid drift. New code (new files' scaffolding, delegation, doc text, configs, type changes) is shown in full.

### The Standard Green Gate (referenced as **GATE** throughout)

```bash
node scripts/generate-di.js          # regenerate DI container (only needed if @Service files moved/renamed)
node scripts/generate-contracts.js   # regenerate IPC contracts (only needed if preload/ipc touched)
npm run typecheck                    # app + tests + gpu + core
npm run lint                         # eslint + layer-boundary check
npm run test:run                     # full vitest run (unit + integration)
```
Expected: all commands exit 0. `npm run test:run` ends with all suites passing (no new failures vs. baseline).

> `test:run` does NOT auto-run the `pretest` generators, so run `generate-di.js` yourself after any move/rename of an `@Service`-decorated file or the generated container will import a stale path.

### Phase 0: Preconditions (do once, before Phase 1)

- [ ] **Step 1: Confirm clean tree and capture baseline**

```bash
git status --short            # expect: empty
git rev-parse --abbrev-ref HEAD   # note the current branch
```

- [ ] **Step 2: Establish the baseline is green**

Run the **GATE** (skip the two generator steps here; just run typecheck/lint/test). Record that it passes. If the baseline is not green, STOP and report — do not start refactoring on a red baseline.

- [ ] **Step 3: Create the working branch (if not already on a dedicated one)**

```bash
git switch -c refactor/codebase-reduction-exec
```

---

# Phase 1 — Quick Wins (Findings #1–6)

Zero file moves, low risk, no test-import churn. Each task is independently committable.

## Task 1.1: Reconcile architecture docs with reality (#1)

The docs reference an old layout that predates the `@prismgb/*` package extraction. Correct each stale path to where the code actually lives.

**Files:**
- Modify: `docs/feature-map.md` (lines 30, 66, 76–77, 96–99)
- Modify: `docs/naming-conventions.md` (lines 28, 42, 46, 54, 56, 67, 70–72)

**Reality reference (verified):**
| Doc claims | Actual location |
| --- | --- |
| `src/shared/config/timing.config.ts` | `packages/prismgb-config/src/timing.config.ts` (imported via `@prismgb/config`) |
| `src/shared/ipc/ipc.manifest.{ts,json}` | `packages/prismgb-ipc/src/ipc.manifest.{ts,json}` (via `@prismgb/ipc`) |
| `src/shared/events/event-channels.ts` | `packages/prismgb-events/src/event-channels.ts` (via `@prismgb/events`); main-only channels in `src/main/infrastructure/event-channels.config.ts` |
| `src/shared/features/devices/device.manifest.json` + `profiles/` | `packages/prismgb-devices/src/device.manifest.{ts,json}` (via `@prismgb/devices`) |
| `src/main/infrastructure/devices/device-profile.registry.ts` | flat: `src/main/infrastructure/device-profile.registry.ts` |
| `src/renderer/infrastructure/services/devices/device-storage.service.ts` | flat: `src/renderer/infrastructure/services/device-storage.service.ts` |
| `@core` → `src/core` alias, "Modern Core" section | removed; pure primitives live in `@prismgb/core` package |

- [ ] **Step 1: Fix `feature-map.md` line 66** — change `src/renderer/infrastructure/services/devices/device-storage.service.ts` to `src/renderer/infrastructure/services/device-storage.service.ts`.

- [ ] **Step 2: Fix `feature-map.md` lines 76–77 (Add a New Device)** — replace the device-manifest/profile/registry paths:

```markdown
1. Register manifest metadata in `packages/prismgb-devices/src/device.manifest.json`.
2. Add a profile class in `packages/prismgb-devices/src/profiles/` and register it in `src/main/infrastructure/device-profile.registry.ts`.
```

- [ ] **Step 3: Fix `feature-map.md` lines 96–98 (Architecture Guardrails)**:

```markdown
- Renderer infrastructure timing values come from `packages/prismgb-config/src/timing.config.ts` (imported via `@prismgb/config`).
- IPC handlers import manifest-derived channels from `packages/prismgb-ipc/src/ipc.manifest.ts` (imported via `@prismgb/ipc`).
- Preload API and method descriptors are marker-generated from `packages/prismgb-ipc/src/ipc.manifest.json`.
```
(Line 99 "Active runtime paths do not use `@core` imports" is still true — keep it. Line 30 already lists `@core` as retired — keep it.)

- [ ] **Step 4: Fix `naming-conventions.md` line 28** — change the `.config` example from `timing.config.ts` to a path that exists, e.g. `storage-keys.config.ts`, OR annotate `timing.config.ts` as living in `@prismgb/config`. Use:

```markdown
| `.config.<ext>` | Configuration constants | `storage-keys.config.ts` (shared); `timing.config.ts` (in `@prismgb/config`) |
```

- [ ] **Step 5: Fix `naming-conventions.md` lines 42 & 46** — these describe the *intended* domain-grouped structure that Phase 3 will create. Add a status note so the doc is honest until Phase 3 lands:

```markdown
- `src/renderer/infrastructure/services/<domain>`: Renderer services grouped by domain (capture, devices, gpu, performance, settings, streaming, transcode, updates, platform). See Phase 3 of the codebase-reduction plan.
- `src/main/infrastructure/<domain>`: Main-process services grouped by domain (devices, transcode, window, tray, logging, events).
```
(After Phase 3 completes, remove the "See Phase 3…" note.)

- [ ] **Step 6: Fix `naming-conventions.md` lines 54 & 56** — point event-channel and IPC-manifest references to the packages:

```markdown
  - Shared event contract: `packages/prismgb-events/src/event-channels.ts` (via `@prismgb/events`).
  - Main event channels: `src/main/infrastructure/event-channels.config.ts`.
  - IPC channels: `packages/prismgb-ipc/src/ipc.manifest.json`, consumed through `packages/prismgb-ipc/src/ipc.manifest.ts` (via `@prismgb/ipc`).
```

- [ ] **Step 7: Remove the dead `@core` alias and "Modern Core" section from `naming-conventions.md`** — delete line 67 (`@core -> src/core` bullet) and the entire `## 🏛️ Modern Core & Interface Conventions` section (lines 70–72 and its list). Re-home the still-useful naming rules (pure-noun interfaces, kebab-case files, extensionless imports) into the existing "Identifier Naming" / "Imports and Aliases" sections, retargeted at `@prismgb/core`:

```markdown
## Core Primitive Conventions (`@prismgb/core`)

Pure, environment-agnostic primitives live in the `@prismgb/core` package. Interfaces representing abstract capabilities use PascalCase pure nouns (`Logger`, `EventBus`, `Storage`) — no `I...` prefixes or `...Like`/`...Interface` suffixes. Files use lowercase kebab-case; each interface concern gets its own file. Prefer extensionless TS imports.
```

- [ ] **Step 8: Verify no other stale paths remain**

Run: `grep -rnE 'src/core|@core ->|shared/events/event-channels|shared/ipc/ipc.manifest|shared/features/devices|services/devices/|infrastructure/devices/|shared/config/timing' docs/`
Expected: no matches except the retired-`@core` mention on `feature-map.md` line 30 (which is correct) and the line-99 guardrail.

- [ ] **Step 9: Commit**

```bash
git add docs/feature-map.md docs/naming-conventions.md
git commit -m "docs: reconcile architecture docs with @prismgb/* package layout"
```

## Task 1.2: Add knip dead-code tooling (#2)

**Files:**
- Create: `knip.json`
- Modify: `package.json` (devDependencies + `lint:dead-code` script)
- Create: `docs/dead-code-triage.md` (one-time findings log)

- [ ] **Step 1: Install knip**

```bash
npm install -D knip
```

- [ ] **Step 2: Create `knip.json`** (workspace-aware; DI-resolved services are reachable via the generated container, which is an entry; generated files are ignored)

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "workspaces": {
    ".": {
      "entry": [
        "src/main/index.ts",
        "src/preload/index.ts",
        "src/renderer/index.ts",
        "src/renderer/di.generated.ts",
        "scripts/*.js",
        "vite.config.js",
        "vitest.config.js",
        "playwright.config.js"
      ],
      "project": ["src/**/*.{ts,js}"]
    },
    "packages/*": {
      "entry": ["src/index.ts"],
      "project": ["src/**/*.ts"]
    }
  },
  "ignore": ["**/*.generated.ts", "**/*.d.ts", "dist/**", "release/**", "tests/fixtures/**"]
}
```

- [ ] **Step 3: Add the script** to `package.json` `scripts`:

```json
"lint:dead-code": "knip"
```

- [ ] **Step 4: Run knip and capture the baseline**

```bash
npx knip > /tmp/knip-out.txt 2>&1 || true
cat /tmp/knip-out.txt
```
Expected: a report of unused files/exports/dependencies. **Do not bulk-delete.** DI services resolved by string token may be falsely flagged if the generated container does not import them — verify each candidate against `grep -rn "<exportName>" src tests` before believing it.

- [ ] **Step 5: Triage into `docs/dead-code-triage.md`** — record each knip finding as `confirmed-dead` (safe to remove), `false-positive` (DI/dynamic), or `defer`. Only delete items you proved unreferenced (`grep` shows zero non-self, non-fixture references). For each confirmed-dead deletion, run the **GATE** before committing.

- [ ] **Step 6: Run GATE** (typecheck/lint/test only) to confirm tooling install didn't break anything.

- [ ] **Step 7: Commit**

```bash
git add knip.json package.json package-lock.json docs/dead-code-triage.md
git commit -m "build: add knip dead-code analysis + baseline triage"
```

## Task 1.3: Rename the renderer bootstrap to remove the "app orchestrator" collision (#3)

`renderer-app.orchestrator.ts` (bootstrap) collides conceptually with `application/orchestrators/app.orchestrator.ts` (DI coordinator). Real importers: `src/renderer/index.ts` and `tests/unit/renderer/RendererAppOrchestrator.test.ts`. (The `tests/fixtures/layer-boundaries/...` reference is an intentional fixture — DO NOT touch it.)

**Files:**
- Rename: `src/renderer/renderer-app.orchestrator.ts` → `src/renderer/app-bootstrap.ts`
- Rename: `tests/unit/renderer/RendererAppOrchestrator.test.ts` → `tests/unit/renderer/app-bootstrap.test.ts`
- Modify: `src/renderer/index.ts`

- [ ] **Step 1: Run GATE (test only) to confirm green**, then `git mv` both files:

```bash
git mv src/renderer/renderer-app.orchestrator.ts src/renderer/app-bootstrap.ts
git mv tests/unit/renderer/RendererAppOrchestrator.test.ts tests/unit/renderer/app-bootstrap.test.ts
```

- [ ] **Step 2: Rename the class** `RendererAppOrchestrator` → `RendererBootstrap` in `src/renderer/app-bootstrap.ts`. Update the `export { RendererAppOrchestrator, createApplication }` to `export { RendererBootstrap, createApplication }`, and the internal `class RendererAppOrchestrator` declaration and its logger label (`loggerFactory.create('RendererBootstrap')`).

- [ ] **Step 3: Update `src/renderer/index.ts`** imports:

```ts
import { createApplication } from './app-bootstrap';
import type { RendererBootstrap } from './app-bootstrap';
// ...
let app: RendererBootstrap | null = null;
```

- [ ] **Step 4: Update the test file** `tests/unit/renderer/app-bootstrap.test.ts` — fix its import path to `@renderer/app-bootstrap` and rename `RendererAppOrchestrator` references to `RendererBootstrap` (including the `describe(...)` label).

- [ ] **Step 5: Find any stragglers**

```bash
grep -rn "renderer-app.orchestrator\|RendererAppOrchestrator" src tests | grep -v tests/fixtures
```
Expected: no matches.

- [ ] **Step 6: Run GATE.** Expected: green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(renderer): rename bootstrap to app-bootstrap to end app-orchestrator name collision"
```

## Task 1.4: Remove the file-download re-export shim and unify the two `lib/` folders (#4)

`src/renderer/presentation/lib/file-download.utils.ts` is a one-line re-export of `src/renderer/lib/file-download.utils.ts`. Its only real importer is `src/renderer/presentation/controller/ui.controller.ts` (the `tests/fixtures/...` importer is an intentional violation fixture — leave it). Canonical impl already lives at `@renderer/lib/file-download.utils`.

**Files:**
- Delete: `src/renderer/presentation/lib/file-download.utils.ts`
- Modify: `src/renderer/presentation/controller/ui.controller.ts`

- [ ] **Step 1: Repoint the real importer.** In `src/renderer/presentation/controller/ui.controller.ts`, change the import to the canonical path:

```ts
import { downloadFile } from '@renderer/lib/file-download.utils';
```

- [ ] **Step 2: Delete the shim**

```bash
git rm src/renderer/presentation/lib/file-download.utils.ts
```

- [ ] **Step 3: Confirm no remaining non-fixture references**

```bash
grep -rn "presentation/lib/file-download" src tests | grep -v tests/fixtures
```
Expected: no matches.

- [ ] **Step 4: Run GATE.** Expected: green (the layer-boundary check must still pass — `ui.controller.ts` importing from `@renderer/lib` is presentation→lib, which is allowed).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(renderer): drop redundant file-download re-export shim"
```

> Note: the broader "unify the two `lib/` folders" cleanup (moving `brightness.utils` / `filename-generator.utils` out of `presentation/lib/`) is deferred — those are presentation-specific and their current home is defensible. Removing the shim resolves the actual duplication.

## Task 1.5: Flatten the redundant per-feature CSS barrels (#5)

Six per-feature `*.styles.css` files are 1–8 line aggregators that only `@import` their `styles/` leaves. Remove that middle layer; have the top barrel import leaves directly.

**Files:**
- Modify: `src/renderer/presentation/styles/styles.css`
- Delete: `features/{settings,updates,streaming,toolbar,fullscreen,notes}/*.styles.css` (6 files)

- [ ] **Step 1: Inline the feature barrels into the top barrel.** In `src/renderer/presentation/styles/styles.css`, replace each `@import '../features/<feature>/<feature>.styles.css';` line with that feature barrel's actual leaf `@import`s. For notes (8 leaves) replace `@import '../features/notes/notes.styles.css';` with:

```css
@import '../features/notes/styles/notes-panel.css';
@import '../features/notes/styles/notes-toolbar.css';
@import '../features/notes/styles/notes-list.css';
@import '../features/notes/styles/notes-resize.css';
@import '../features/notes/styles/notes-editor.css';
@import '../features/notes/styles/notes-autocomplete.css';
@import '../features/notes/styles/notes-footer.css';
@import '../features/notes/styles/notes-reduced-motion.css';
```
Do the same for `toolbar` (8 leaves under `toolbar/styles/`), `settings` (1: `settings/styles/settings-menu.css`), `updates` (1: `updates/styles/updates.css`), `streaming` (2: `streaming/styles/overlays.css`, `streaming/styles/streaming-states.css`), `fullscreen` (1: `fullscreen/styles/fullscreen-controls.css`). **Preserve the original import order** (cascade matters).

- [ ] **Step 2: Delete the now-unused feature barrels**

```bash
git rm src/renderer/presentation/features/settings/settings.styles.css \
       src/renderer/presentation/features/updates/updates.styles.css \
       src/renderer/presentation/features/streaming/streaming.styles.css \
       src/renderer/presentation/features/toolbar/toolbar.styles.css \
       src/renderer/presentation/features/fullscreen/fullscreen.styles.css \
       src/renderer/presentation/features/notes/notes.styles.css
```

- [ ] **Step 3: Confirm nothing else imports the deleted barrels**

```bash
grep -rn "\.styles\.css" src/renderer/presentation/styles src/renderer | grep -E "features/.*\.styles\.css"
```
Expected: no matches.

- [ ] **Step 4: Build and visually verify CSS still loads**

```bash
npm run build:vite
```
Expected: build succeeds, no unresolved `@import` warnings. (Optional: `npm run dev` and confirm the UI is styled — the cascade order was preserved.)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(styles): remove redundant per-feature CSS barrel layer"
```

## Task 1.6: Extract the inline fatal-error screen from the entry point (#6)

`src/renderer/index.ts` builds a ~25-line error screen with manual `document.createElement` in its catch block. Move it to a focused module.

**Files:**
- Create: `src/renderer/presentation/shell/fatal-error-screen.ts`
- Create (test): `tests/unit/renderer/presentation/shell/fatal-error-screen.test.ts`
- Modify: `src/renderer/index.ts`

This task extracts a pure-ish DOM function → use TDD.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { renderFatalError } from '@renderer/presentation/shell/fatal-error-screen';

describe('renderFatalError', () => {
  beforeEach(() => { document.body.innerHTML = '<div id="x"></div>'; });

  it('replaces body content with the error heading, message, and stack', () => {
    const err = new Error('boom');
    err.stack = 'STACKTRACE';
    renderFatalError(err);
    expect(document.querySelector('h2')?.textContent).toBe('Failed to initialize application');
    expect(document.querySelector('p')?.textContent).toBe('boom');
    expect(document.querySelector('pre')?.textContent).toBe('STACKTRACE');
    expect(document.getElementById('x')).toBeNull(); // previous content cleared
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/presentation/shell/fatal-error-screen.test.ts`
Expected: FAIL — cannot resolve `@renderer/presentation/shell/fatal-error-screen`.

- [ ] **Step 3: Create `src/renderer/presentation/shell/fatal-error-screen.ts`** (lift the exact DOM logic from `index.ts`'s catch block):

```ts
/**
 * Renders a last-resort fatal error screen when application bootstrap fails,
 * before the logger/DI are available. Uses safe DOM construction (no innerHTML
 * for untrusted content) to avoid XSS.
 */
export function renderFatalError(error: Error): void {
  const container = document.createElement('div');
  container.style.cssText = 'padding: 20px; color: red; font-family: sans-serif;';

  const heading = document.createElement('h2');
  heading.textContent = 'Failed to initialize application';

  const message = document.createElement('p');
  message.textContent = error.message;

  const stack = document.createElement('pre');
  stack.textContent = error.stack ?? '';

  container.appendChild(heading);
  container.appendChild(message);
  container.appendChild(stack);

  document.body.innerHTML = '';
  document.body.appendChild(container);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/renderer/presentation/shell/fatal-error-screen.test.ts`
Expected: PASS.

- [ ] **Step 5: Use it in `src/renderer/index.ts`** — add `import { renderFatalError } from './presentation/shell/fatal-error-screen';` and replace the manual DOM block in the `catch` with:

```ts
    const normalizedError = error instanceof Error ? error : new Error(String(error));
    console.error('Failed to initialize application:', normalizedError);
    renderFatalError(normalizedError);
```

- [ ] **Step 6: Run GATE.** Expected: green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(renderer): extract fatal-error screen out of entry point"
```

**Phase 1 exit check:** Run the full **GATE** + `npm run build:vite`. All green. Phase 1 is shippable.

---

# Phase 2 — Move-Safety Enabler (Finding #7)

The 160 path-coupled test files mean every move in Phase 3 must rewrite import paths in lockstep. This phase establishes a **repeatable, verifiable move procedure** and normalizes the import-extension inconsistency so Phase 3 moves are mechanical and safe.

## Task 2.1: Establish the move procedure + normalize test import extensions

**Files:**
- Create: `scripts/lib/rewrite-imports.js`
- Create (test): `tests/unit/scripts/rewrite-imports.test.js`
- Modify: test files using explicit `.ts` import extensions (see Step 6)

- [ ] **Step 1: Write the failing test for the import-path rewriter** (a pure function used by the move procedure)

```js
import { describe, it, expect } from 'vitest';
import { rewriteImportPath } from '../../../scripts/lib/rewrite-imports.js';

describe('rewriteImportPath', () => {
  it('rewrites an alias path prefix on import/from lines only', () => {
    const src = "import { A } from '@renderer/infrastructure/services/foo';\nconst x = '@renderer/infrastructure/services/foo';";
    const out = rewriteImportPath(src, '@renderer/infrastructure/services/foo', '@renderer/infrastructure/services/devices/foo');
    expect(out).toContain("from '@renderer/infrastructure/services/devices/foo'");
    // non-import string literal is left untouched
    expect(out).toContain("const x = '@renderer/infrastructure/services/foo'");
  });

  it('handles both quote styles and trailing .js/.ts specifiers', () => {
    const src = "import './services/foo.js';\nimport \"@renderer/infrastructure/services/foo\";";
    const out = rewriteImportPath(src, '@renderer/infrastructure/services/foo', '@renderer/infrastructure/services/devices/foo');
    expect(out).toContain("import \"@renderer/infrastructure/services/devices/foo\"");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/scripts/rewrite-imports.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `scripts/lib/rewrite-imports.js`**

```js
/**
 * Rewrites an exact module-specifier prefix on `import ... from '<spec>'`,
 * `import '<spec>'`, and `export ... from '<spec>'` lines only. Leaves
 * non-import string literals untouched. Matches optional trailing .js/.ts.
 */
export function rewriteImportPath(source, fromSpec, toSpec) {
  const esc = fromSpec.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // match `from '<spec>'` / `from "<spec>"` / `import '<spec>'` with optional .js/.ts and optional /subpath
  const re = new RegExp(`((?:from|import|export[^'"\\n]*from)\\s*['"])${esc}((?:\\.(?:js|ts))?['"])`, 'g');
  const re2 = new RegExp(`(import\\s*['"])${esc}((?:\\.(?:js|ts))?['"])`, 'g');
  return source.replace(re, `$1${toSpec}$2`).replace(re2, `$1${toSpec}$2`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/scripts/rewrite-imports.test.js`
Expected: PASS.

- [ ] **Step 5: Document the canonical move procedure** at the top of `scripts/lib/rewrite-imports.js` as a comment block (this is the procedure every Phase 3 task references):

```
MOVE PROCEDURE (per file):
  1. git mv <old> <new>
  2. For each (oldSpec -> newSpec): rewrite across src/ and tests/ (excluding tests/fixtures/):
       node -e "import('./scripts/lib/rewrite-imports.js').then(m=>{const fs=require('fs');const f=process.argv[1];fs.writeFileSync(f,m.rewriteImportPath(fs.readFileSync(f,'utf8'),process.argv[2],process.argv[3]))})" <file> <oldSpec> <newSpec>
     (or use a small batch wrapper over `grep -rl <oldSpec> src tests | grep -v tests/fixtures`)
  3. node scripts/generate-di.js   (if the moved file is @Service-decorated)
  4. Run GATE.
```

- [ ] **Step 6: Normalize explicit `.ts` import extensions in tests** (convention is extensionless TS imports). Find them:

```bash
grep -rln "from '@\(renderer\|main\|shared\|preload\)/[^']*\.ts'" tests | grep -v tests/fixtures
```
For each match, drop the `.ts` suffix on those specifiers (e.g. `@renderer/infrastructure/streaming/acquisition/acquisition-context.ts` → `@renderer/infrastructure/streaming/acquisition/acquisition-context`). Leave `.js` specifiers as-is (those are the convention for runtime-only modules).

- [ ] **Step 7: Run GATE.** Expected: green.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "build: add verified import-rewrite helper + normalize test import extensions"
```

**Phase 2 exit check:** GATE green. The move procedure is now defined and tested.

---

# Phase 3 — Domain Grouping (Findings #8, #9, #13, #15)

> **⚠ Design decision to confirm before executing Phase 3.** This phase commits to one target taxonomy. Review it; adjust the domain assignments if you disagree, then proceed. Moves are pure relocations — no logic changes. DI tokens are string-based, so resolution is unaffected, but the **generated container imports by path**, so `node scripts/generate-di.js` runs after each domain's moves.

**Target taxonomy (renderer `infrastructure/services/<domain>/`):**
| Domain | Files |
| --- | --- |
| `capture/` | capture.service, capture-save.service |
| `devices/` | device.service, device-connection.service, device-media.service, device-operation-sequencer.service, device-storage.service |
| `performance/` | performance-animation.service, performance-metrics.service, performance-state.service |
| `settings/` | settings.service, settings-cinematic-mode.service, settings-fullscreen.service, settings-presentation-mode.service |
| `gpu/` | gpu-renderer.service, gpu-render-loop.service, gpu-recording.service, gpu-worker-manager, gpu-frame-buffer |
| `streaming/` | streaming.service, streaming-view.service, render-pipeline.service, canvas-lifecycle.service, canvas-render-loop.service, audio-pipeline.service, native-resolution.utils |
| `transcode/` | transcode.service |
| `updates/` | update.service, update-ui.service |
| `platform/` | health.service, viewport.service, preload-event-bridge.factory |

`gpu/` and `platform/` extend the documented domain list — add them to `naming-conventions.md` line 42 as part of this phase (ties back to Task 1.1 Step 5).

## Task 3.1: Group renderer `infrastructure/services/` by domain (#8)

**Files:** moves within `src/renderer/infrastructure/services/` per the taxonomy table above.

- [ ] **Step 1: Confirm baseline green** — run GATE (test only).

- [ ] **Step 2: Create domain folders and move files** using the Phase 2 move procedure, one domain at a time. Example for `capture/`:

```bash
mkdir -p src/renderer/infrastructure/services/capture
git mv src/renderer/infrastructure/services/capture.service.ts src/renderer/infrastructure/services/capture/capture.service.ts
git mv src/renderer/infrastructure/services/capture-save.service.ts src/renderer/infrastructure/services/capture/capture-save.service.ts
```
Then rewrite specifiers: `@renderer/infrastructure/services/capture.service` → `@renderer/infrastructure/services/capture/capture.service` (and `capture-save.service`) across `src tests` (excluding `tests/fixtures`). Repeat per domain in the table.

> Watch relative imports *inside* moved files (e.g. `./gpu-frame-buffer`) — files moving into the same new folder keep working; cross-domain relative imports must become alias imports or be rewritten to the new relative depth. After moving, `grep -n "from '\.\./\|from '\./" <movedfile>` and fix any now-broken relative paths.

- [ ] **Step 3: Regenerate DI**

```bash
node scripts/generate-di.js
git diff --stat src/renderer/di.generated.ts   # expect import paths updated
```

- [ ] **Step 4: Run GATE.** Expected: green. The layer-boundary check (`infrastructure/services/<domain>/`) passes — the tooling already supports domain subfolders (confirmed by existing fixtures).

- [ ] **Step 5: Update `naming-conventions.md`** to add `gpu` and `platform` to the renderer domain list (and remove the "See Phase 3…" note added in Task 1.1).

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(renderer): group infrastructure services into domain folders"
```

## Task 3.2: Group `main/infrastructure/` by domain (#9)

**Target taxonomy (main `infrastructure/<domain>/`):**
| Domain | Files |
| --- | --- |
| `devices/` | device.service, device-bridge.service, device-lifecycle.service, device-profile.registry, usb-device-monitor |
| `transcode/` | transcode.service, transcode-process, transcode-temp.utils, ffmpeg-path.utils |
| `window/` | window.service, login-item.service |
| `tray/` | tray.service |
| `logging/` | logger.factory, logger.interface |
| `events/` | event-bus, event-channels.config |
| (stays at root) | gpu-policy |

- [ ] **Step 1: Confirm baseline green** (GATE, test only).

- [ ] **Step 2: Move files per the table** using the Phase 2 move procedure (e.g. `mkdir -p src/main/infrastructure/devices && git mv …`), rewriting `@main/infrastructure/<file>` → `@main/infrastructure/<domain>/<file>` across `src tests` (excluding fixtures). Note `device-profile.registry` is referenced in `feature-map.md` Task 1.1 text — it stays flat there? No: it moves to `devices/`. Update `feature-map.md` line 77 to `src/main/infrastructure/devices/device-profile.registry.ts` accordingly.

- [ ] **Step 3: Fix internal relative imports** in moved files (`grep -n "from '\.\." <movedfile>`), then regenerate DI:

```bash
node scripts/generate-di.js
```

- [ ] **Step 4: Run GATE.** Expected: green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(main): group infrastructure services into domain folders"
```

## Task 3.3: Consolidate streaming infrastructure (#13)

Bring the scattered renderer streaming infra under the `streaming/` domain created in Task 3.1. Move the streaming-specific adapters, factories, and the acquisition tree into `infrastructure/services/streaming/`.

**Files to move into `src/renderer/infrastructure/services/streaming/`:**
- From `infrastructure/adapters/`: `streaming-canvas2d-renderer.adapter.ts`, `streaming-gpu-renderer.adapter.ts`, `streaming-renderer.interface.ts`
- From `infrastructure/factories/`: `streaming-adapter.factory.ts`, `streaming-renderer.factory.ts`
- From `infrastructure/streaming/`: the whole `acquisition/` folder (7 files) + `streaming-contracts.ts`

- [ ] **Step 1: Confirm baseline green** (GATE, test only).

- [ ] **Step 2: Move the adapters and factories** into `infrastructure/services/streaming/` (consider sub-folders `streaming/adapters/`, `streaming/acquisition/` to keep it navigable):

```bash
mkdir -p src/renderer/infrastructure/services/streaming/adapters
git mv src/renderer/infrastructure/adapters/streaming-canvas2d-renderer.adapter.ts src/renderer/infrastructure/services/streaming/adapters/
git mv src/renderer/infrastructure/adapters/streaming-gpu-renderer.adapter.ts src/renderer/infrastructure/services/streaming/adapters/
git mv src/renderer/infrastructure/adapters/streaming-renderer.interface.ts src/renderer/infrastructure/services/streaming/adapters/
git mv src/renderer/infrastructure/factories/streaming-adapter.factory.ts src/renderer/infrastructure/services/streaming/
git mv src/renderer/infrastructure/factories/streaming-renderer.factory.ts src/renderer/infrastructure/services/streaming/
```

- [ ] **Step 3: Move the acquisition tree + contracts**

```bash
git mv src/renderer/infrastructure/streaming/acquisition src/renderer/infrastructure/services/streaming/acquisition
git mv src/renderer/infrastructure/streaming/streaming-contracts.ts src/renderer/infrastructure/services/streaming/
rmdir src/renderer/infrastructure/streaming 2>/dev/null || true
```

- [ ] **Step 4: Rewrite all specifiers** for each moved file (`@renderer/infrastructure/adapters/streaming-*` → `@renderer/infrastructure/services/streaming/adapters/streaming-*`, `@renderer/infrastructure/factories/streaming-*` → `@renderer/infrastructure/services/streaming/streaming-*`, `@renderer/infrastructure/streaming/acquisition/*` → `@renderer/infrastructure/services/streaming/acquisition/*`) across `src tests` (excluding fixtures). The test `tests/unit/...acquisition-context` and `...fallback-strategy` imports MUST be updated. Fix internal relative imports in moved files.

- [ ] **Step 5: Regenerate DI**, then run GATE. Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(renderer): consolidate streaming infrastructure under services/streaming"
```

> Leave `application/orchestrators/streaming*.orchestrator.ts` and `presentation/features/streaming/` where they are — those are correct layer separations, not the spread #13 targets.

## Task 3.4: Sub-group the performance orchestrators (#15)

**Files:** move the three performance orchestrators into a subfolder.

- [ ] **Step 1: Confirm baseline green** (GATE, test only).

- [ ] **Step 2: Move**

```bash
mkdir -p src/renderer/application/orchestrators/performance
git mv src/renderer/application/orchestrators/performance-animation.orchestrator.ts src/renderer/application/orchestrators/performance/
git mv src/renderer/application/orchestrators/performance-metrics.orchestrator.ts src/renderer/application/orchestrators/performance/
git mv src/renderer/application/orchestrators/performance-state.orchestrator.ts src/renderer/application/orchestrators/performance/
```

- [ ] **Step 3: Rewrite specifiers** `@renderer/application/orchestrators/performance-*.orchestrator` → `@renderer/application/orchestrators/performance/performance-*.orchestrator` across `src tests` (excluding fixtures); fix internal relatives.

- [ ] **Step 4: Regenerate DI**, run GATE. Expected: green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(renderer): group performance orchestrators into a subfolder"
```

**Phase 3 exit check:** Full GATE + `npm run build:vite` + `npm run dev:smoke`. All green. The tree now matches the documented domain structure.

---

# Phase 4 — Internal Cleanup & Oversized-File Splits (Findings #10, #11, #14, #12)

All behavior-preserving. Splits relocate existing, named methods behind unchanged public interfaces (relocation convention applies). Where a *pure function* is extracted, TDD is used.

## Task 4.1: Tighten the renderer bootstrap types (#10)

`src/renderer/app-bootstrap.ts` (renamed in Task 1.3) has 8 `container.resolve<any>(...)` casts. Replace with the real types.

**Files:** Modify `src/renderer/app-bootstrap.ts`.

- [ ] **Step 1: Confirm baseline green** (GATE, test only).

- [ ] **Step 2: Import the concrete types** and replace each `resolve<any>` with the real interface/class. Map (verify exact exported type names with `grep -rn "export .*<Name>"`):

```ts
import type { UIComponentRegistry } from '@renderer/presentation/controller/component.registry';
import type { UIEffects } from '@renderer/presentation/effects/ui-effects.class';
import type { BodyClassManager } from '@renderer/presentation/effects/body-class.class';
import type { LoggerFactoryLike } from '@prismgb/core';
import type { UIEventBridge } from '@renderer/presentation/bridges/ui-event.bridge';
import type { CaptureUIBridge } from '@renderer/presentation/bridges/capture-ui.bridge';
import type { TranscodeUIBridge } from '@renderer/presentation/bridges/transcode-ui.bridge';
import type { TranscodeService } from '@renderer/infrastructure/services/transcode/transcode.service'; // post-Phase-3 path
```
Then change e.g. `container.resolve<any>('uiComponentRegistry')` → `container.resolve<UIComponentRegistry>('uiComponentRegistry')`, etc., across `_initializeUI`, `_registerUIComponents`, `_initializeUIEventBridge`. If a precise type is genuinely unavailable, prefer a minimal local structural type over `any`.

- [ ] **Step 3: Run GATE.** Expected: green. Then confirm the count dropped:

```bash
grep -cE 'resolve<any>|: any|as any' src/renderer/app-bootstrap.ts
```
Expected: 0 (or a documented, justified remainder).

- [ ] **Step 4: Commit**

```bash
git add src/renderer/app-bootstrap.ts
git commit -m "refactor(renderer): replace any-casts in app-bootstrap with concrete types"
```

## Task 4.2: Align main vs. renderer composition-root patterns (#11)

Main's `application/app.orchestrator.ts` both bootstraps the DI container AND coordinates services. The renderer separates these (`app-bootstrap.ts` vs. `application/orchestrators/app.orchestrator.ts`). Align main to the renderer's separated pattern.

**Files:**
- Create: `src/main/app-bootstrap.ts`
- Modify: `src/main/application/app.orchestrator.ts`, `src/main/index.ts`, `src/main/application/index.ts`

> This is the highest-design task in the plan. Do it as a *small, reviewed* refactor: extract only the container-creation + lifecycle wiring (`createAppContainer`, logger pre-creation, start/stop) from the main `AppOrchestrator` into a `MainBootstrap` class in `src/main/app-bootstrap.ts`, leaving service coordination in `AppOrchestrator`. Keep `main/index.ts`'s public entry behavior identical.

- [ ] **Step 1: Confirm baseline green** (GATE, test only).

- [ ] **Step 2: Read the two files to map the seam**

```bash
sed -n '1,80p' src/main/application/app.orchestrator.ts
cat src/main/application/index.ts
sed -n '30,120p' src/main/index.ts
```
Identify which members are *bootstrap* (container creation, pre-created logger, `start`/`stop`/dispose) vs. *coordination* (service initialize order).

- [ ] **Step 3: Create `src/main/app-bootstrap.ts`** with a `MainBootstrap` class that owns `createAppContainer()`, the pre-created `MainLogger`, and `initialize()/start()/cleanup()` lifecycle, delegating service coordination to the existing `AppOrchestrator` it resolves from the container — mirroring `src/renderer/app-bootstrap.ts`'s shape. (Show the full class once read; it is new code.)

- [ ] **Step 4: Slim `AppOrchestrator`** to coordination only (remove the container-creation responsibility, accept dependencies via DI like its renderer counterpart). Update `src/main/application/index.ts` exports.

- [ ] **Step 5: Update `src/main/index.ts`** to import and use `MainBootstrap` instead of constructing `AppOrchestrator` directly. Keep menu setup and GPU-flag logic untouched.

- [ ] **Step 6: Regenerate DI**, run GATE + `npm run dev:smoke`. Expected: green; the app still boots.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(main): separate composition-root bootstrap from app coordination"
```

> If, on reading, main's coupling makes this risky to do safely, STOP and surface it for review rather than forcing the split. Note the decision in the commit/PR.

## Task 4.3: Extract `NotesPanelComponent.initialize()` wiring (#14)

`notes-panel.component.ts` (513 LOC) has a ~140-line `initialize()` (lines 154–293). Extract the element-wiring into a focused helper.

**Files:**
- Create: `src/renderer/presentation/features/notes/notes-panel-wiring.ts`
- Modify: `src/renderer/presentation/features/notes/notes-panel.component.ts`

- [ ] **Step 1: Confirm baseline green** — run the notes tests: `npx vitest run tests/unit/renderer/presentation/features/notes` (note the path; adjust if different). Expected: green.

- [ ] **Step 2: Read `initialize()`** (lines 154–293) and identify the cohesive wiring block (sub-component construction + event subscriptions) vs. genuine init state.

- [ ] **Step 3: Create `notes-panel-wiring.ts`** exporting a `wireNotesPanel(component, elements, deps)` function that performs the extracted wiring and returns whatever handles the component needs to retain. Move the wiring statements verbatim; `initialize()` calls `wireNotesPanel(...)`.

- [ ] **Step 4: Run** `npx vitest run tests/unit/renderer/presentation/features/notes`. Expected: green (behavior identical). Then full GATE.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(notes): extract notes-panel initialize wiring into a helper"
```

## Task 4.4: Split `listbox-dropdown.class.ts` into two files (#12 — easiest seam)

This 544-LOC file contains **two classes**: `ListboxDropdown` (≈ lines 123–319) and `ComboboxListboxController` (≈ lines 361–528). Split one class per file.

**Files:**
- Create: `src/renderer/presentation/primitives/combobox-listbox.class.ts`
- Modify: `src/renderer/presentation/primitives/listbox-dropdown.class.ts`

- [ ] **Step 1: Confirm baseline green** (GATE, test only). Find importers:

```bash
grep -rln "ComboboxListboxController\|ListboxDropdown" src tests | grep -v tests/fixtures
```

- [ ] **Step 2: Move the `ComboboxListboxController` class** (and any helper types it alone uses) into the new `combobox-listbox.class.ts`, importing whatever shared types it needs from `listbox-dropdown.class.ts` or `listbox.utils.ts`. Keep `ListboxDropdown` in the original file.

- [ ] **Step 3: Update importers** of `ComboboxListboxController` to the new module path (use the Step-1 list).

- [ ] **Step 4: Run GATE.** Expected: green.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(primitives): split combobox controller out of listbox-dropdown"
```

## Task 4.5: Split `gpu-renderer.service.ts` (663 LOC) (#12)

Largest file; ~225 LOC of private setup between constructor (line 120) and first public method `renderFrame` (line 345). Extract the cohesive setup/capability logic, keeping the public interface (`renderFrame`, `setPreset`, `getPresetId`, `resize`, `isActive`, `isFallback`, `isCanvasTransferred`, `getCapabilities`, `getTargetDimensions`, `cleanup`) intact.

**Files:**
- Create: `src/renderer/infrastructure/services/gpu/gpu-renderer-setup.ts` (post-Phase-3 path)
- Modify: `src/renderer/infrastructure/services/gpu/gpu-renderer.service.ts`

- [ ] **Step 1: Confirm baseline green** — `npx vitest run tests/unit/renderer/infrastructure/services` (adjust path to the gpu tests). Expected: green.

- [ ] **Step 2: Read lines 120–345** and identify the extractable unit. Likely candidates: context/capability initialization and the pending-capture resolution (`_resolvePendingCapture`, line 612). Extract a `GpuRendererSetup` helper (or pure functions) that the service composes; the service retains its public methods and delegates.

- [ ] **Step 3: Move the identified private logic** into `gpu-renderer-setup.ts`. If any extracted piece is a pure function (e.g. capability/dimension computation), add a unit test for it (TDD: test first). The service's public method signatures do not change.

- [ ] **Step 4: Run GATE.** Expected: green. Confirm the file shrank: `wc -l src/renderer/infrastructure/services/gpu/gpu-renderer.service.ts`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(gpu): extract gpu-renderer setup/capability logic"
```

## Task 4.6: Split `audio-pipeline.service.ts` (517 LOC) (#12 — best TDD opportunity)

Contains pure gain-envelope math: `_computeRms` (line 440), `_fadeTo` (451), `_createEaseInCurve` (464). Extract these as **pure, tested utilities**.

**Files:**
- Create: `src/renderer/infrastructure/services/streaming/audio-gain.utils.ts` (post-Phase-3 path)
- Create (test): `tests/unit/renderer/infrastructure/services/audio-gain.utils.test.ts`
- Modify: `src/renderer/infrastructure/services/streaming/audio-pipeline.service.ts`

- [ ] **Step 1: Write the failing test** for the pure functions

```ts
import { describe, it, expect } from 'vitest';
import { computeRms, createEaseInCurve } from '@renderer/infrastructure/services/streaming/audio-gain.utils';

describe('audio-gain.utils', () => {
  it('computeRms returns 0 for an all-128 (silence) byte buffer', () => {
    const buf = new Uint8Array(64).fill(128);
    expect(computeRms(buf)).toBeCloseTo(0, 5);
  });

  it('createEaseInCurve spans start to end over the requested steps', () => {
    const curve = createEaseInCurve(0, 1, 5);
    expect(curve.length).toBe(5);
    expect(curve[0]).toBeCloseTo(0, 5);
    expect(curve[curve.length - 1]).toBeCloseTo(1, 5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/renderer/infrastructure/services/audio-gain.utils.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Move `_computeRms` and `_createEaseInCurve`** (and `_fadeTo`'s pure parts) into `audio-gain.utils.ts` as exported pure functions `computeRms(buffer)`, `createEaseInCurve(start, end, steps)` (copy the existing bodies verbatim, drop the `_`/`this`). In `audio-pipeline.service.ts`, import and call them; delete the private copies.

- [ ] **Step 4: Run the new test + the audio-pipeline suite.** Expected: PASS.

- [ ] **Step 5: Run GATE.** Expected: green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor(audio): extract pure gain-envelope math into tested utils"
```

## Task 4.7: Split `render-pipeline.service.ts` (546 LOC) (#12)

Many `handle*` event responders (`handlePerformanceStateChanged`, `handleRenderPresetChanged`, `handleFullscreenChange`, `handlePerformanceModeChanged`) alongside pipeline lifecycle (`startPipeline`, `stopPipeline`, `cleanup`, `_waitForHealthyStream`). Separate event-handling from lifecycle.

**Files:**
- Create: `src/renderer/infrastructure/services/streaming/render-pipeline-event-handlers.ts`
- Modify: `src/renderer/infrastructure/services/streaming/render-pipeline.service.ts`

- [ ] **Step 1: Confirm baseline green** (relevant suite, then plan to run full GATE).

- [ ] **Step 2: Extract the `handle*` responders** into a helper that takes the pipeline service (or its needed collaborators) and wires the event subscriptions, keeping `startPipeline`/`stopPipeline`/`cleanup`/`initialize` in the service. The service composes the helper in its constructor/`initialize`.

- [ ] **Step 3: Run GATE.** Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(streaming): separate render-pipeline event handlers from lifecycle"
```

## Task 4.8: Split main `device.service.ts` (483 LOC) (#12)

USB monitoring (`startUSBMonitoring`, `_cleanupUSBListeners`, `stopUSBMonitoring`, `matchDevice`) is a distinct concern from device-status tracking (`refreshDeviceStatus`, `onDeviceConnected`, `onDeviceDisconnected`, `getStatus`, `isConnected`, `getConnectedDevice`). Note: a `usb-device-monitor.ts` already exists in main/infrastructure/devices — fold the USB-monitoring methods toward it rather than creating a third device file.

**Files:**
- Modify: `src/main/infrastructure/devices/device.service.ts`, `src/main/infrastructure/devices/usb-device-monitor.ts` (post-Phase-3 paths)

- [ ] **Step 1: Confirm baseline green** — run the main device tests. Expected: green.

- [ ] **Step 2: Read both files** and decide which USB-monitoring responsibilities belong in `usb-device-monitor.ts`. Move the cohesive USB-listener lifecycle there; `device.service.ts` retains device-status/state and delegates monitoring.

- [ ] **Step 3: Run GATE.** Expected: green. Confirm `device.service.ts` shrank.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(main): move USB monitoring out of device.service into usb-device-monitor"
```

## Task 4.9: Split `streaming.service.ts` (452 LOC) (#12)

Track-monitoring (`_setupTrackMonitoring`, `_removeTrackMonitoring`) is separable from the start/stop state machine.

**Files:**
- Create: `src/renderer/infrastructure/services/streaming/stream-track-monitor.ts`
- Modify: `src/renderer/infrastructure/services/streaming/streaming.service.ts`

- [ ] **Step 1: Confirm baseline green** — run the streaming suite. Expected: green.

- [ ] **Step 2: Extract a `StreamTrackMonitor`** that owns the track event listeners (`_setupTrackMonitoring`/`_removeTrackMonitoring` bodies), exposing `start(stream, onEnded)` / `stop()`. The service composes it; `start`/`stop`/`dispose`/`getStream`/`isActive`/`isStreaming` signatures unchanged.

- [ ] **Step 3: Run GATE.** Expected: green.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(streaming): extract track-monitoring from streaming.service"
```

**Phase 4 exit check:** Full GATE + `npm run build:vite` + `npm run dev:smoke`. Re-run `npx knip` and compare to the Task 1.2 baseline — confirm no new dead code introduced by the splits. Largest-file check: `find src -name '*.ts' | xargs wc -l | sort -rn | head -10` — confirm the >450 LOC offenders shrank.

---

# Phase 5 — Investigate (Finding #16)

## Task 5.1: Determine whether `importWithRetry` is still needed

`src/renderer/app-bootstrap.ts` wraps `import('./application/container')` in an exponential-backoff `importWithRetry` (3 attempts). This looks like a workaround for a transient chunk-load failure (possibly Vite HMR after sleep/wake — see the `vite:ws` reconnect logic in `index.ts`).

**Files:** Modify `src/renderer/app-bootstrap.ts` (only if removal is justified).

- [ ] **Step 1: Trace the origin**

```bash
git log --oneline -S "importWithRetry" -- src/renderer
git log -p -S "importWithRetry" -- src/renderer | head -120
```
Read the introducing commit message/diff to learn what failure it was added for.

- [ ] **Step 2: Decide and document.** If the original failure mode is gone (e.g. it predates the current Vite `vite:ws` reconnect handling and the dynamic `import('./application/container')` could be a static import), simplify: replace `importWithRetry(() => import('./application/container'))` with a direct import and remove the helper. If it guards a real, current race, **keep it** and add a comment citing the originating commit so it is not mistaken for dead code later.

- [ ] **Step 3: If changed, run GATE + `npm run dev:smoke`.** Expected: green; app boots. If you cannot confirm safety, leave it and record the finding in `docs/dead-code-triage.md`.

- [ ] **Step 4: Commit** (whichever path)

```bash
git add -A
git commit -m "refactor(renderer): simplify bootstrap dynamic import"   # OR
git commit -m "docs: document why bootstrap importWithRetry is retained" --allow-empty
```

**Phase 5 exit check:** Full GATE. Project complete.

---

## Final Verification (after all phases)

- [ ] Run `npm run release:preflight` (native-ABI check, type-debt check, coverage, ratchet, smoke) — the project's heaviest gate.
- [ ] Run `npm run test:e2e` if feasible.
- [ ] Confirm `git log --oneline` shows one focused commit per task.
- [ ] Open a PR summarizing the phases and linking `codebase-reduction-analysis.md`.

---

## Self-Review

**Spec coverage (all 16 findings → tasks):** #1→1.1, #2→1.2, #3→1.3, #4→1.4, #5→1.5, #6→1.6, #7→2.1, #8→3.1, #9→3.2, #13→3.3, #15→3.4, #10→4.1, #11→4.2, #14→4.3, #12→4.4–4.9 (listbox, gpu-renderer, audio-pipeline, render-pipeline, main device.service, streaming.service; notes-panel handled by 4.3), #16→5.1. All covered.

**Placeholder scan:** No "TBD/TODO/implement later." Two tasks (4.2, 4.5) intentionally instruct the executor to *read then design* the exact seam — these are framed as bounded refactors with explicit stop-if-risky conditions and full verification, not open-ended placeholders, because the precise extraction depends on file internals that should not be guessed blind.

**Type/name consistency:** Bootstrap renamed `RendererAppOrchestrator`→`RendererBootstrap` in 1.3 and referenced by that name in 4.1/5.1. Post-Phase-3 paths (`infrastructure/services/<domain>/…`) are used consistently in Phase 4 task file paths. The GATE is defined once and referenced uniformly. `rewriteImportPath` signature matches its test and its usage in the move procedure.

**Known risk note:** Phase 3's taxonomy is a stated design decision flagged for confirmation; Phase 4.2 (composition-root alignment) is the highest-risk task and carries an explicit "stop and surface" escape hatch.
