# P4 — Boundaries as Configuration (dependency-cruiser) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two bespoke boundary-checker scripts and the duplicated eslint import blocks with one declarative `.dependency-cruiser.cjs` gate (full layer matrix, platform-module surfaces derived from the alias registry, orphan detection), make knip a failing CI gate, and pay down the script-layer findings SCR-4/5/6.

**Architecture:** One `.dependency-cruiser.cjs` at the repo root owns every import-boundary rule; platform-module public surfaces derive from `scripts/lib/workspace-aliases.mjs` via `require()` of ESM (Node ≥ 22.12), so the P3 registry stays the single source of truth. A merged fixture tree plus one table-driven vitest self-test pins the rule behavior (all three deep-import specifier families). Shared script logic extracts into `scripts/lib/{process-runner,fs-walk}.js`.

**Tech Stack:** dependency-cruiser (new devDependency, owner-installed online), knip 6 (present), picomatch 2 (present), `node:util` `parseArgs`, vitest.

**Branch:** `northstar/phase-4` off `refactor/gpu_normalization` (HEAD `6c53f202`). Executor pattern per P3: fresh implementer subagent per task + task review; controller adjudicates BLOCKED; ledger at `.superpowers/sdd/progress.md`.

## Global Constraints

- Commit subjects ≤ 100 chars, conventional-commits (`commitlint` enforces locally AND in CI); NO AI attribution lines (no "Generated with", no "Co-Authored-By"). Never `--no-verify`.
- No inline code comments; JSDoc only. (dependency-cruiser rule `comment:` fields are data, not comments — allowed.)
- Sandbox: heredocs are blocked; `rm -rf`/`git clean -fdx` are blocked; **offline npm must never install or rewrite the lockfile** (P3 lesson: it strips `resolved`/`integrity`). Task 1 is owner-run outside the sandbox.
- Single-writer discipline: one implementer on the tree at a time; controller verifies every claim against `git diff`, never narration.
- Gates after every task: `npm run lint && npm run typecheck && npm run test:run`. After Task 5 add `npm run lint:dead-code`. `npm run dev:smoke` + `npm run build:vite` + `npm run test:e2e` at phase exit (Task 8).
- Baseline metrics at branch point: **154 test files / 1,950 tests**, 86/86 e2e, prod LOC 28,198.

## Verified Premises (2026-07-02, live tree at `6c53f202`)

1. `src/` top level = `main, platform, preload, renderer, types` — no `src/core`, no `src/shared`. The layer checker's `core` layer, its `@core/` alias resolver, and eslint's `src/shared/**` block match nothing.
2. `src/platform/**` is entirely unclassified by `check-layer-boundaries.js` → silently exempt (SCR-1 hole). The eslint block list also references the deleted `src/renderer/renderer-app.orchestrator.ts`.
3. Cross-boundary greps are clean: no `src/platform` → app imports; no `@/platform/` or deep-relative platform imports from app code; main/preload import no renderer code; exactly ONE renderer→main edge exists: `src/renderer/infrastructure/ipc/trpc-client.ts:3` `import type { AppRouter } from '@main/ipc/router'` (the documented type-only exemption).
4. `require('./scripts/lib/workspace-aliases.mjs')` from CJS works (verified Node 25.6.1; CI uses actions/setup-node `'22'` → ≥ 22.12, where `require(esm)` is unflagged). Registry exports `PLATFORM_MODULES` (10 modules, `entrypoints` maps like `{'.': 'index.ts', './runtime': 'runtime.ts'}`) and `PLATFORM_ROOT = 'src/platform'`.
5. `knip` exits **1** today: 11 unused exported types (4 zod drift guards + 1 event exhaustiveness guard are intentional compile-time guards; 6 are dead) + 7 configuration hints (4 stale `ignore` entries, 3 stale `ignoreDependencies`; `@electron/notarize` NOT hinted — keep it).
6. `dependency-cruiser` absent from manifest, lockfile, and `node_modules`. `picomatch@^2.3.1` and `knip@^6.14.2` are declared and installed. `esbuild` present only as a transitive dep, but imported by `tests/e2e/global-setup.js`.
7. The gpu worker loads via `new Worker(new URL('../worker-entry.js', import.meta.url))` (`src/platform/gpu/application/video-session.ts:134`) — invisible to dependency-cruiser → `worker-entry.ts` needs an orphan exemption. `src/platform/{gpu,devices}/testkit` trees are imported only by tests → orphan-exempt pattern needed. `src/types/*.d.ts` are ambient → `.d.ts` orphan-exempt.
8. `tests/fixtures/layer-boundaries/` fixtures reference non-existent alias targets yet `typecheck:tests` is green ⇒ fixture trees are NOT in the typecheck program; new fixtures may safely contain unresolvable imports.
9. CI: `reusable-ci-tests.yml` runs `check:gpu-boundaries` at lines 40 (validate-linux) and 74 (validate-linux-arm64); `npm run lint` runs only in validate-linux. `.husky/pre-commit` = `npx lint-staged` + `npm run typecheck:app`.
10. `tsconfig.app.json` has `strict`/`noImplicitAny`/`strictNullChecks` all `true` → SCR-5's plain-`tsc` swap loses nothing the compiler doesn't already enforce. `tsconfig.base.json` has `noUnusedLocals: true` and tests compile src ⇒ un-exporting the guard types would break `typecheck:tests`; use knip's `@public` JSDoc tag instead.
11. Script tests that pin public exports: `tests/unit/scripts/dev-boot-smoke.test.js` imports `evaluateStartupChunk, runDevBootSmoke`; `tests/unit/scripts/platform-manifest.test.js` imports `findExecutable, resolveSmokePlatformEntry`. These exports must survive Task 6 unchanged. No test imports `typecheck-app.js`.
12. Manifest glob patterns (`scripts/manifests/platforms.manifest.json`) use single-segment `*` only and all match files — picomatch default `*` semantics match the hand-rolled `[^/]*` regex; pass `{ dot: true }` to preserve dotfile matching.

## Execution Strategy

| Task | Risk | Executor | Depends on |
|------|------|----------|-----------|
| 1 owner-run install | LOW (but online-only) | OWNER outside sandbox | — |
| 2 depcruise config + lint wiring | MEDIUM (judgment: real-tree adjudication) | Sonnet implementer | 1 |
| 3 self-test + fixtures | MEDIUM | Sonnet implementer | 2 |
| 4 deletion sweep | LOW-MEDIUM (mechanical, many files) | Sonnet implementer | 3 |
| 5 knip gate (CFG-4) | MEDIUM | Sonnet implementer | 4 |
| 6 script libs (SCR-4/6) | MEDIUM | Sonnet implementer | — (sequenced after 5) |
| 7 plain tsc (SCR-5) | LOW | Haiku implementer | — (sequenced after 6) |
| 8 phase exit | — | Controller (ME) | all |

Strictly sequential (single writer; package.json / CI files are shared across tasks). Commit per task; every commit green.

---

### Task 1: OWNER-RUN — install dependency-cruiser, declare esbuild

> **HARD PRECONDITION for everything after it.** The sandbox's offline npm cannot fetch new packages and corrupts lockfile metadata. The OWNER runs this outside the sandbox with network access. No other P4 task may start before this commit lands.

**Files:**
- Modify: `package.json` (devDependencies)
- Modify: `package-lock.json`

- [ ] **Step 1: Create the phase branch** (controller, before the owner step)

```bash
git checkout refactor/gpu_normalization && git pull --ff-only 2>/dev/null; git checkout -b northstar/phase-4
```

- [ ] **Step 2 (OWNER, online, outside sandbox): install**

```bash
npm i -D dependency-cruiser esbuild
```

- [ ] **Step 3: Verify lockfile integrity (P3 lesson — zero tolerance)**

```bash
node -e "const l=require('./package-lock.json');const bad=Object.entries(l.packages).filter(([n,p])=>n&&!p.link&&(!p.resolved||!p.integrity));console.log(bad.length+' entries missing resolved/integrity');process.exit(bad.length?1:0)"
npx depcruise --version
npx tsc --version
```

Expected: `0 entries missing resolved/integrity`; depcruise prints a version.

- [ ] **Step 4: Verify the suite still passes**

Run: `npm run test:run`
Expected: 154 files / 1,950 tests pass.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json
git commit -m "build(deps): add dependency-cruiser and esbuild as declared dev dependencies"
```

---

### Task 2: Author `.dependency-cruiser.cjs` and wire it into lint

**Files:**
- Create: `.dependency-cruiser.cjs`
- Modify: `package.json:18-19` (`lint`, `lint:fix`)

**Interfaces:**
- Consumes: `PLATFORM_MODULES`, `PLATFORM_ROOT` from `scripts/lib/workspace-aliases.mjs` (shapes in Verified Premise 4).
- Produces: rule names consumed verbatim by Task 3's self-test — `no-unresolvable`, `no-orphans`, `main-not-to-renderer`, `preload-isolated`, `renderer-not-to-main`, `renderer-not-to-main-ipc`, `renderer-infra-to-main-ipc-value`, `renderer-infrastructure-not-to-presentation`, `renderer-presentation-not-to-infrastructure`, `renderer-lib-not-to-app`, `renderer-entry-not-imported`, `renderer-bootstrap-only-from-entry`, `main-entry-not-imported`, `main-bootstrap-only-from-entry`, `platform-not-to-app`, `app-to-platform-internals`, `gpu-root-not-to-internals`, `platform-<name>-not-to-foreign-internals` (×10, generated).

The matrix is the *intended* boundary model: it preserves every constraint of `scripts/check-layer-boundaries.js` (including the single type-only tRPC exemption) and closes its known sloppiness (main→renderer/lib was accidentally permitted; preload→main/bootstrap was accidentally permitted; `src/platform/**` was entirely unchecked). Premise 3 verifies the live tree already satisfies the tightened model.

- [ ] **Step 1: Write `.dependency-cruiser.cjs`**

```js
/**
 * Dependency boundary gate (north-star P4 — boundaries as configuration).
 *
 * Single owner of every import-boundary rule that previously lived in
 * scripts/check-layer-boundaries.js, the import half of
 * scripts/check-gpu-package-boundaries.js, and the no-restricted-imports
 * blocks in eslint.config.js. Platform-module public surfaces derive from
 * scripts/lib/workspace-aliases.mjs so the alias registry stays the single
 * source of truth. Loading the registry uses require() of an ESM module,
 * which needs Node >= 22.12.
 */
const { PLATFORM_MODULES, PLATFORM_ROOT } = require('./scripts/lib/workspace-aliases.mjs');

const APP_ROOTS = '^src/(main|preload|renderer)/';

const platformEntrypointPatterns = PLATFORM_MODULES.flatMap((platformModule) =>
  Object.values(platformModule.entrypoints).map(
    (entryFile) => `^${PLATFORM_ROOT}/${platformModule.name}/${entryFile.replace(/\./g, '\\.')}$`
  )
);

const platformCrossModuleRules = PLATFORM_MODULES.map((platformModule) => ({
  name: `platform-${platformModule.name}-not-to-foreign-internals`,
  severity: 'error',
  comment: `src/platform/${platformModule.name} may reach other platform modules only through their registry entrypoints.`,
  from: { path: `^${PLATFORM_ROOT}/${platformModule.name}/` },
  to: {
    path: `^${PLATFORM_ROOT}/`,
    pathNot: [`^${PLATFORM_ROOT}/${platformModule.name}/`, ...platformEntrypointPatterns]
  }
}));

const orphanExemptPatterns = [
  ...platformEntrypointPatterns,
  `^${PLATFORM_ROOT}/[^/]+/testkit(/|\\.ts$)`,
  `^${PLATFORM_ROOT}/gpu/worker-entry\\.ts$`,
  '^src/main/index\\.ts$',
  '^src/preload/index\\.ts$',
  '^src/renderer/index\\.ts$',
  '\\.d\\.ts$'
];

module.exports = {
  forbidden: [
    {
      name: 'no-unresolvable',
      severity: 'error',
      comment: 'Every import must resolve; deep @platform aliases and typos fail here.',
      from: {},
      to: { couldNotResolve: true, pathNot: ['\\?url$'] }
    },
    {
      name: 'no-orphans',
      severity: 'error',
      comment: 'Modules nothing imports are dead or misplaced; declared entrypoints and test-support surfaces are exempt.',
      from: { orphan: true, pathNot: orphanExemptPatterns },
      to: {}
    },
    {
      name: 'main-not-to-renderer',
      severity: 'error',
      comment: 'Main-process code never imports renderer code.',
      from: { path: '^src/main/' },
      to: { path: '^src/renderer/' }
    },
    {
      name: 'preload-isolated',
      severity: 'error',
      comment: 'Preload bridges the processes and imports neither of them.',
      from: { path: '^src/preload/' },
      to: { path: '^src/(main|renderer)/' }
    },
    {
      name: 'renderer-not-to-main',
      severity: 'error',
      comment: 'Renderer code never imports main-process code outside the typed IPC router edge.',
      from: { path: '^src/renderer/' },
      to: { path: '^src/main/', pathNot: ['^src/main/ipc/'] }
    },
    {
      name: 'renderer-not-to-main-ipc',
      severity: 'error',
      comment: 'Only renderer/infrastructure may reference main/ipc, and only as types.',
      from: { path: '^src/renderer/', pathNot: ['^src/renderer/infrastructure/'] },
      to: { path: '^src/main/ipc/' }
    },
    {
      name: 'renderer-infra-to-main-ipc-value',
      severity: 'error',
      comment: 'The tRPC AppRouter edge is type-only; value imports of main/ipc are forbidden.',
      from: { path: '^src/renderer/infrastructure/' },
      to: { path: '^src/main/ipc/', dependencyTypesNot: ['type-only'] }
    },
    {
      name: 'renderer-infrastructure-not-to-presentation',
      severity: 'error',
      comment: 'Infrastructure stays UI-agnostic.',
      from: { path: '^src/renderer/infrastructure/' },
      to: { path: '^src/renderer/presentation/' }
    },
    {
      name: 'renderer-presentation-not-to-infrastructure',
      severity: 'error',
      comment: 'Presentation consumes application orchestrators, never infrastructure directly.',
      from: { path: '^src/renderer/presentation/' },
      to: { path: '^src/renderer/infrastructure/' }
    },
    {
      name: 'renderer-lib-not-to-app',
      severity: 'error',
      comment: 'renderer/lib is a shared kernel; it imports platform modules and externals only.',
      from: { path: '^src/renderer/lib/' },
      to: { path: '^src/(main|preload)/|^src/renderer/(application|infrastructure|presentation)/|^src/renderer/(index|app-bootstrap)\\.ts$' }
    },
    {
      name: 'renderer-entry-not-imported',
      severity: 'error',
      comment: 'The renderer entry is loaded by the host page, never imported.',
      from: { path: '^src/' },
      to: { path: '^src/renderer/index\\.ts$' }
    },
    {
      name: 'renderer-bootstrap-only-from-entry',
      severity: 'error',
      comment: 'Only the renderer entry wires the bootstrap.',
      from: { path: '^src/', pathNot: ['^src/renderer/index\\.ts$'] },
      to: { path: '^src/renderer/app-bootstrap\\.ts$' }
    },
    {
      name: 'main-entry-not-imported',
      severity: 'error',
      comment: 'The main entry is the electron main target, never imported.',
      from: { path: '^src/' },
      to: { path: '^src/main/index\\.ts$' }
    },
    {
      name: 'main-bootstrap-only-from-entry',
      severity: 'error',
      comment: 'Only the main entry wires the bootstrap.',
      from: { path: '^src/', pathNot: ['^src/main/index\\.ts$'] },
      to: { path: '^src/main/app-bootstrap\\.ts$' }
    },
    {
      name: 'platform-not-to-app',
      severity: 'error',
      comment: 'Platform modules are the foundation; they never import app code.',
      from: { path: `^${PLATFORM_ROOT}/` },
      to: { path: APP_ROOTS }
    },
    {
      name: 'app-to-platform-internals',
      severity: 'error',
      comment: 'App code reaches platform modules only through their registry entrypoints.',
      from: { path: APP_ROOTS },
      to: { path: `^${PLATFORM_ROOT}/`, pathNot: platformEntrypointPatterns }
    },
    {
      name: 'gpu-root-not-to-internals',
      severity: 'error',
      comment: 'The gpu module root exposes the app-facing surface only.',
      from: { path: `^${PLATFORM_ROOT}/gpu/index\\.ts$` },
      to: { path: `^${PLATFORM_ROOT}/gpu/(infrastructure/|worker/|worker-entry|application/renderer\\.service)` }
    },
    ...platformCrossModuleRules
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.app.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: { extensions: ['.ts', '.js', '.d.ts', '.json'] }
  }
};
```

`tsPreCompilationDeps: true` is load-bearing: without it `import type` edges are erased before rules run, and the type-only discrimination (`dependencyTypesNot: ['type-only']`) can never fire.

- [ ] **Step 2: Run it against the real tree and adjudicate**

Run: `npx depcruise --config .dependency-cruiser.cjs src`
Expected: exit 0 (Premise 3). Adjudication protocol if violations appear:
- A real boundary violation → fix the importing code (report it; if the fix needs a design decision, STOP with BLOCKED).
- An orphan that is a legitimate test-support or generated surface → extend `orphanExemptPatterns` with a *named, narrow* pattern and record why in the task report.
- An unresolvable that is a Vite asset scheme (e.g. `?url`) → extend the `no-unresolvable` `pathNot` with the narrowest suffix pattern.
Never broaden a layer rule to make the tree pass.

- [ ] **Step 3: Manual negative check (proves the gate bites)**

```bash
printf "import '@renderer/presentation/controller/ui-component.catalog';\nexport {};\n" > src/renderer/infrastructure/services/boundary-negative-check.ts
npx depcruise --config .dependency-cruiser.cjs src; echo "exit: $?"
rm src/renderer/infrastructure/services/boundary-negative-check.ts
```

Expected: nonzero exit reporting `renderer-infrastructure-not-to-presentation` for the scratch file (`no-orphans` does not fire — the file has an outgoing edge, and depcruise orphans require no edges in either direction). (If the sandbox refuses `rm` of the just-created file, ask the controller to remove it.)

- [ ] **Step 4: Wire into lint (transitional — old checker stays until Task 4)**

In `package.json` replace:

```json
"lint": "eslint \"src/**/*.{js,ts}\" && node scripts/check-layer-boundaries.js",
"lint:fix": "eslint \"src/**/*.{js,ts}\" --fix && node scripts/check-layer-boundaries.js",
```

with:

```json
"lint": "eslint \"src/**/*.{js,ts}\" && node scripts/check-layer-boundaries.js && depcruise --config .dependency-cruiser.cjs src",
"lint:fix": "eslint \"src/**/*.{js,ts}\" --fix && node scripts/check-layer-boundaries.js && depcruise --config .dependency-cruiser.cjs src",
```

- [ ] **Step 5: Gates**

Run: `npm run lint && npm run typecheck && npm run test:run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add .dependency-cruiser.cjs package.json
git commit -m "feat(boundaries): author dependency-cruiser gate from the alias registry"
```

---

### Task 3: Fixture tree + table-driven self-test

**Files:**
- Create: `tests/fixtures/dependency-boundaries/tsconfig.app.json` + 33 fixture source files (exact list below)
- Create: `tests/unit/scripts/dependency-boundaries.test.js` (runs in the `shared-node` vitest project)

**Interfaces:**
- Consumes: `.dependency-cruiser.cjs` rule names (Task 2); `PLATFORM_MODULES` from the registry.
- Produces: the P4 guardrail test suite; Task 4 may delete the old checker only after this is green.

One merged fixture tree, ONE depcruise spawn, exact-set assertion (`rule from`-pairs). Set equality catches both missed violations AND over-firing rules. The tree exercises all three deep-import specifier families (`@platform/x/deep`, `@/platform/x/…`, relative), the type-only tRPC edge (pass + value-import fail), dynamic import, orphan detection, and the gpu root-surface rule.

Orphan semantics (Task 2 execution finding, verified against dependency-cruiser 17.4.3): a module is an orphan only when it has NO incoming AND NO outgoing edges. Fixture files that import something are therefore never orphans even though nothing imports them — only the fully-disconnected `unused.utils.ts` fires `no-orphans`. Dead-but-importing files are knip's job (unused-files detection), not depcruise's.

- [ ] **Step 1: Write the failing self-test**

`tests/unit/scripts/dependency-boundaries.test.js`:

```js
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_MODULES } from '../../../scripts/lib/workspace-aliases.mjs';

const projectRoot = process.cwd();
const fixtureRoot = path.join(projectRoot, 'tests/fixtures/dependency-boundaries');
const configPath = path.join(projectRoot, '.dependency-cruiser.cjs');

function resolveDepcruiseBin() {
  const manifestPath = path.join(projectRoot, 'node_modules/dependency-cruiser/package.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const binEntry = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin.depcruise;
  return path.join(projectRoot, 'node_modules/dependency-cruiser', binEntry);
}

function cruiseFixtureTree() {
  const result = spawnSync(
    process.execPath,
    [resolveDepcruiseBin(), '--config', configPath, '--output-type', 'json', 'src'],
    { cwd: fixtureRoot, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }
  );
  if (!result.stdout) {
    throw new Error(`depcruise produced no output: ${result.stderr}`);
  }
  const report = JSON.parse(result.stdout);
  return report.summary.violations.map((violation) => `${violation.rule.name} ${violation.from}`).sort();
}

const EXPECTED_VIOLATIONS = [
  'app-to-platform-internals src/renderer/application/platform-internal-alias.ts',
  'app-to-platform-internals src/renderer/application/platform-internal-relative.ts',
  'gpu-root-not-to-internals src/platform/gpu/index.ts',
  'main-not-to-renderer src/main/infrastructure/window.service.ts',
  'no-orphans src/renderer/lib/unused.utils.ts',
  'no-unresolvable src/renderer/application/platform-deep-alias.ts',
  'platform-not-to-app src/platform/notes/index.ts',
  'platform-notes-not-to-foreign-internals src/platform/notes/index.ts',
  'preload-isolated src/preload/index.ts',
  'renderer-bootstrap-only-from-entry src/renderer/application/bootstrap-loop.ts',
  'renderer-entry-not-imported src/renderer/presentation/views/entry-reach.ts',
  'renderer-infra-to-main-ipc-value src/renderer/infrastructure/services/router-value.ts',
  'renderer-infrastructure-not-to-presentation src/renderer/infrastructure/services/presentation-reach.ts',
  'renderer-infrastructure-not-to-presentation src/renderer/infrastructure/services/presentation-relative.ts',
  'renderer-lib-not-to-app src/renderer/lib/app-reach.ts',
  'renderer-not-to-main src/renderer/application/main-reach.ts',
  'renderer-not-to-main src/renderer/presentation/views/main-dynamic.ts',
  'renderer-not-to-main-ipc src/renderer/application/ipc-reach.ts',
  'renderer-presentation-not-to-infrastructure src/renderer/presentation/views/infra-reach.ts'
].sort();

describe('dependency boundary rules', () => {
  it('reports exactly the expected violation set for the fixture tree', () => {
    expect(cruiseFixtureTree()).toEqual(EXPECTED_VIOLATIONS);
  });
});

function listSourceEntries(relativeDirectory) {
  return fs.readdirSync(path.join(projectRoot, relativeDirectory))
    .filter((entry) => !entry.startsWith('.'))
    .sort();
}

describe('source tree structure', () => {
  it('classifies every src/ top-level family', () => {
    expect(listSourceEntries('src')).toEqual(['main', 'platform', 'preload', 'renderer', 'types']);
  });

  it('classifies every src/renderer top-level entry', () => {
    expect(listSourceEntries('src/renderer')).toEqual([
      'app-bootstrap.ts', 'application', 'assets', 'index.html', 'index.ts',
      'infrastructure', 'lib', 'presentation'
    ]);
  });

  it('classifies every src/main top-level entry', () => {
    expect(listSourceEntries('src/main'))
      .toEqual(['app-bootstrap.ts', 'application', 'index.ts', 'infrastructure', 'ipc']);
  });

  it('keeps src/platform aligned with the alias registry', () => {
    expect(listSourceEntries('src/platform'))
      .toEqual(PLATFORM_MODULES.map((platformModule) => platformModule.name).sort());
  });
});

describe('gpu module hygiene', () => {
  it('keeps the gpu module free of WebGL renderer files', () => {
    const roots = ['src/platform/gpu', 'tests/unit/platform/gpu'];
    const files = roots.flatMap((root) =>
      fs.readdirSync(path.join(projectRoot, root), { recursive: true }).map(String)
    );
    expect(files.filter((name) => name.toLowerCase().includes('webgl'))).toEqual([]);
  });
});
```

The structure guards close SCR-1's unclassified-file hole at the level the path rules are keyed on (a new unclassified top-level directory fails the suite instead of being silently exempt). The gpu-hygiene test carries forward `assertNoWebGL2FilesIfWebGL2Removed` from the retiring gpu checker (WebGL2 is permanently removed, so the conditional guard becomes unconditional).

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/unit/scripts/dependency-boundaries.test.js`
Expected: FAIL — depcruise errors on the missing fixture tree (no `src` in fixture cwd).

- [ ] **Step 3: Create the fixture tree**

`tests/fixtures/dependency-boundaries/tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"],
      "@main/*": ["./src/main/*"],
      "@renderer/*": ["./src/renderer/*"],
      "@preload/*": ["./src/preload/*"],
      "@platform/gpu": ["./src/platform/gpu/index"],
      "@platform/core": ["./src/platform/core/index"]
    }
  }
}
```

Fixture source files — exact path → exact full content:

| Path (under `tests/fixtures/dependency-boundaries/`) | Content |
|---|---|
| `src/main/index.ts` | `import './app-bootstrap';` |
| `src/main/app-bootstrap.ts` | `import '@main/application/session.orchestrator';` |
| `src/main/application/session.orchestrator.ts` | `import '../infrastructure/window.service';`<br>`import '../ipc/router-host';` |
| `src/main/infrastructure/window.service.ts` | `import '@renderer/lib/format.utils';` |
| `src/main/ipc/router-host.ts` | `import './router';` |
| `src/main/ipc/router.ts` | `export type AppRouter = Record<string, never>;` |
| `src/preload/index.ts` | `import '@main/ipc/router-host';` |
| `src/renderer/index.ts` | `import './app-bootstrap';` |
| `src/renderer/app-bootstrap.ts` | `import '@renderer/application/app.orchestrator';` |
| `src/renderer/application/app.orchestrator.ts` | `import '@renderer/infrastructure/services/stream.service';`<br>`import '@renderer/presentation/views/stream.view';`<br>`import '@renderer/lib/format.utils';`<br>`import '@platform/gpu';` |
| `src/renderer/application/bootstrap-loop.ts` | `import '../app-bootstrap';` |
| `src/renderer/application/main-reach.ts` | `import '@main/application/session.orchestrator';` |
| `src/renderer/application/ipc-reach.ts` | `import type { AppRouter } from '@main/ipc/router';`<br>`export type ReachRouter = AppRouter;` |
| `src/renderer/application/platform-internal-alias.ts` | `import '@/platform/gpu/infrastructure/upscale.pass';` |
| `src/renderer/application/platform-internal-relative.ts` | `import '../../platform/gpu/infrastructure/upscale.pass';` |
| `src/renderer/application/platform-deep-alias.ts` | `import '@platform/gpu/infrastructure/upscale.pass';` |
| `src/renderer/infrastructure/services/stream.service.ts` | `import '@renderer/lib/format.utils';`<br>`import type { AppRouter } from '@main/ipc/router';`<br>`export type ClientRouter = AppRouter;` |
| `src/renderer/infrastructure/services/router-value.ts` | `import '@main/ipc/router';` |
| `src/renderer/infrastructure/services/presentation-reach.ts` | `import '@renderer/presentation/views/stream.view';` |
| `src/renderer/infrastructure/services/presentation-relative.ts` | `import '../../presentation/views/stream.view';` |
| `src/renderer/presentation/views/stream.view.ts` | `import '@renderer/lib/format.utils';` |
| `src/renderer/presentation/views/infra-reach.ts` | `import '@/renderer/infrastructure/services/stream.service';` |
| `src/renderer/presentation/views/main-dynamic.ts` | `export async function loadMain(): Promise<void> { await import('@main/infrastructure/window.service'); }` |
| `src/renderer/presentation/views/entry-reach.ts` | `import '@renderer/index';` |
| `src/renderer/lib/format.utils.ts` | `export {};` |
| `src/renderer/lib/app-reach.ts` | `import '../presentation/views/stream.view';` |
| `src/renderer/lib/unused.utils.ts` | `export {};` |
| `src/platform/gpu/index.ts` | `import './domain/presets';`<br>`import './infrastructure/upscale.pass';` |
| `src/platform/gpu/domain/presets.ts` | `export {};` |
| `src/platform/gpu/infrastructure/upscale.pass.ts` | `export {};` |
| `src/platform/notes/index.ts` | `import '../core/primitives/lifecycle';`<br>`import '@renderer/lib/format.utils';` |
| `src/platform/core/index.ts` | `import './primitives/lifecycle';` |
| `src/platform/core/primitives/lifecycle.ts` | `export {};` |

Legal edges exercised (must produce NO violation): entry→bootstrap→application chains in both processes; application→infrastructure+presentation+lib+platform-entrypoint; intra-main application→infrastructure/ipc; intra-platform module imports; the type-only `AppRouter` import from renderer/infrastructure (`stream.service.ts`).

- [ ] **Step 4: Run the self-test to verify it passes**

Run: `npx vitest run tests/unit/scripts/dependency-boundaries.test.js`
Expected: PASS. If the exact-set assertion fails on formatting (e.g. depcruise emits a different `from` path shape), fix the extraction in `cruiseFixtureTree` — never restate `EXPECTED_VIOLATIONS` to match wrong rule behavior; a rule-name mismatch means Task 2's config is wrong and goes back to review.

- [ ] **Step 5: Full gates**

Run: `npm run lint && npm run typecheck && npm run test:run`
Expected: green; test count grows by 6 (1 boundary + 4 structure + 1 hygiene).

- [ ] **Step 6: Commit**

```bash
git add tests/fixtures/dependency-boundaries tests/unit/scripts/dependency-boundaries.test.js
git commit -m "test(boundaries): pin depcruise rules with fixture tree and structure guards"
```

---

### Task 4: Deletion sweep — retire the script checkers and eslint duplicates

**Files:**
- Delete: `scripts/check-layer-boundaries.js`, `tests/unit/scripts/check-layer-boundaries.test.js`, `tests/fixtures/layer-boundaries/` (13 dirs)
- Delete: `scripts/check-gpu-package-boundaries.js`
- Modify: `package.json` (`lint`, `lint:fix`, remove `check:gpu-boundaries`)
- Modify: `.github/workflows/reusable-ci-tests.yml` (remove 2 gpu-boundary steps)
- Modify: `eslint.config.js` (remove all 8 `no-restricted-imports` blocks)

**Interfaces:**
- Consumes: Task 3's green self-test (the replacement guardrail must exist before the old one dies).
- Produces: `lint` = eslint + depcruise only; no `check:gpu-boundaries` anywhere.

Coverage accounting for `check-gpu-package-boundaries.js` (why full deletion is safe): registry-entrypoint shape, tsconfig↔registry sync, no-wildcard aliases, and resolver-config consumption are already asserted by `tests/unit/scripts/workspace-aliases.test.js`; deep/worker import bans and root-surface safety became depcruise rules (`app-to-platform-internals`, `gpu-root-not-to-internals`) pinned by Task 3; the WebGL filename tripwire moved into the Task 3 hygiene test.

- [ ] **Step 1: Delete files via git**

```bash
git rm scripts/check-layer-boundaries.js scripts/check-gpu-package-boundaries.js
git rm tests/unit/scripts/check-layer-boundaries.test.js
git rm -r tests/fixtures/layer-boundaries
```

- [ ] **Step 2: Rewrite the npm scripts**

In `package.json` delete the `check:gpu-boundaries` line and set:

```json
"lint": "eslint \"src/**/*.{js,ts}\" && depcruise --config .dependency-cruiser.cjs src",
"lint:fix": "eslint \"src/**/*.{js,ts}\" --fix && depcruise --config .dependency-cruiser.cjs src",
```

- [ ] **Step 3: Remove the CI steps**

In `.github/workflows/reusable-ci-tests.yml` delete BOTH steps (validate-linux and validate-linux-arm64):

```yaml
      - name: Run GPU package boundary check
        run: npm run check:gpu-boundaries
```

- [ ] **Step 4: Prune eslint.config.js**

Delete every config object whose `rules` contain `no-restricted-imports` — the 8 blocks covering `src/main/application/**`, `src/renderer/infrastructure/**`, `src/main/infrastructure/** + src/main/ipc/**`, `src/renderer/application/**`, `src/renderer/presentation/**`, `src/main/index.ts`, `src/renderer/index.ts + renderer-app.orchestrator.ts` (stale path), and `src/shared/**` (dead path). Keep the two base language blocks and the `ignores` block.

- [ ] **Step 5: Sweep for stragglers**

```bash
grep -rn "check-layer-boundaries\|check-gpu-package-boundaries\|check:gpu-boundaries\|no-restricted-imports" --include="*.js" --include="*.json" --include="*.yml" --include="*.ts" . --exclude-dir=node_modules --exclude-dir=.git --exclude-dir=docs
```

Expected: zero hits.

- [ ] **Step 6: Full gates**

Run: `npm run lint && npm run typecheck && npm run test:run`
Expected: green; test count drops by 13 (the old checker's suite — execution-verified count; the plan originally estimated 12).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "refactor(boundaries): retire script checkers and eslint boundary blocks for depcruise"
```

---

### Task 5: CFG-4 — knip as a failing CI gate

**Files:**
- Modify: `src/main/ipc/schemas/device.schemas.ts:46-49` (tag 4 drift guards `@public`)
- Modify: `src/platform/events/event-payloads.ts` (tag `EventPayloadExhaustivenessCheck` `@public`; delete `EventPayload` at line 331)
- Modify: `src/platform/gpu/domain/presets.ts:9` (delete `PresetPolicy`)
- Modify: `src/platform/transcode/transcode.config.ts:56` (delete `TranscodeStateValue`)
- Modify: `src/renderer/lib/settings.definitions.ts:121` (delete `SettingsDefinitionsManifest`)
- Modify: `src/renderer/presentation/controller/ui-component.catalog.ts:112` (delete `RendererUiComponentElements`)
- Modify: `src/renderer/presentation/primitives/dom-bindings.utils.ts:15` (delete `DomBindingElement`)
- Modify: `knip.json` (prune stale ignores, widen scripts/lib glob)
- Modify: `.github/workflows/reusable-ci-tests.yml` (add dead-code step)

**Interfaces:**
- Consumes: knip findings from Verified Premise 5.
- Produces: `npx knip` exits 0; `npm run lint:dead-code` is a CI gate; Task 6's new `scripts/lib/*.js` files are covered by the widened entry glob.

- [ ] **Step 1: Adjudicate the 11 unused exported types**

For each *deletion* candidate, first verify zero references: `grep -rn "<TypeName>" src/ tests/ --include="*.ts" --include="*.js"` must show only the definition line. Then:

**Tag (intentional compile-time guards — un-exporting would trip `noUnusedLocals` in the test program, Premise 10).** In `src/main/ipc/schemas/device.schemas.ts`, prefix EACH of the four `DriftGuard` exports with:

```ts
/**
 * Compile-time drift guard between the zod schema and the shared payload type.
 * @public
 */
```

In `src/platform/events/event-payloads.ts`, prefix `EventPayloadExhaustivenessCheck` with:

```ts
/**
 * Compile-time exhaustiveness guard for the event payload map.
 * @public
 */
```

**Delete (dead):** the six export lines listed in Files above, e.g. `export type PresetPolicy = typeof PRESET_POLICY;` and `export type EventPayload<K extends keyof EventPayloadMap> = EventPayloadMap[K];`.

- [ ] **Step 2: Prune knip.json**

Remove the whole `"ignore"` array (all four entries are hinted stale) and shrink `ignoreDependencies` to `["@electron/notarize"]`. Widen the scripts-lib entry `"scripts/lib/*.mjs"` → `"scripts/lib/*.{js,mjs}"`. Resulting `knip.json`:

```json
{
  "$schema": "https://unpkg.com/knip@5/schema.json",
  "ignoreExportsUsedInFile": true,
  "workspaces": {
    ".": {
      "entry": [
        "src/main/index.ts",
        "src/preload/index.ts",
        "src/renderer/index.ts",
        "src/platform/*/index.ts",
        "src/platform/gpu/runtime.ts",
        "src/platform/devices/runtime.ts",
        "src/platform/devices/testkit.ts",
        "src/platform/transcode/service.ts",
        "src/platform/ui-base/reactive/index.ts",
        "scripts/*.js",
        "scripts/lib/*.{js,mjs}",
        "tests/support/**/*.{js,ts}",
        "tests/**/*.{test,spec}.{js,ts}"
      ],
      "project": ["src/**/*.{ts,js}"],
      "ignoreDependencies": ["@electron/notarize"],
      "ignoreUnresolved": ["/overlay-icons/default.svg?url", "/Logo.png?url"]
    }
  }
}
```

- [ ] **Step 3: Verify knip exits clean**

Run: `npx knip; echo "exit: $?"`
Expected: `exit: 0`, no findings, no configuration hints. Known adjudication: if `esbuild` is reported as an unused devDependency (knip may not trace `tests/e2e/global-setup.js` through the playwright config), add `"tests/e2e/global-setup.js"` to the `entry` array — do NOT add it to `ignoreDependencies`. Record the outcome in the task report.

- [ ] **Step 4: Add the CI gate**

In `.github/workflows/reusable-ci-tests.yml`, validate-linux job, insert directly after the `Run linter` step:

```yaml
      - name: Run dead-code gate
        run: npm run lint:dead-code
```

- [ ] **Step 5: Full gates (dead-code gate now included)**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all green.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(dead-code): make knip a failing CI gate and clear its findings"
```

---

### Task 6: SCR-4/SCR-6 — extract script libs, adopt picomatch and parseArgs

**Files:**
- Create: `scripts/lib/process-runner.js`, `scripts/lib/fs-walk.js`
- Create: `tests/unit/scripts/process-runner.test.js`, `tests/unit/scripts/fs-walk.test.js`
- Modify: `scripts/smoke-test.js` (drop `walkPaths`/`globToRegex`/`escapeRegex`/`getStaticGlobRoot`; consume libs + picomatch)
- Modify: `scripts/dev-boot-smoke.js` (drop `waitForProcessClose`/`signalProcessGroup`/`shutdownDevProcess` + hand-rolled arg loop; consume lib + `parseArgs`)

**Interfaces:**
- Consumes: nothing from earlier tasks (independent).
- Produces: `headlessElectronEnv(baseEnv?) → env`, `waitForProcessClose(child, timeoutMs) → Promise<{closed, code, signal}>`, `terminateProcessTree(child, {gracefulMs?, killProcessGroup?, platform?, execCommand?, signalGroup?}) → Promise<void>` from `process-runner.js`; `walkPaths(rootDirectory) → string[]` (dirs AND files, missing root → `[]`) from `fs-walk.js`. MUST NOT change: `evaluateStartupChunk`/`runDevBootSmoke` exports of dev-boot-smoke.js and `findExecutable`/`resolveSmokePlatformEntry` exports of smoke-test.js (existing tests pin them — Premise 11).

- [ ] **Step 1: Write the failing lib tests**

`tests/unit/scripts/fs-walk.test.js`:

```js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { walkPaths } from '../../../scripts/lib/fs-walk.js';

const tempRoots = [];

afterEach(() => {
  while (tempRoots.length > 0) fs.rmSync(tempRoots.pop(), { recursive: true, force: true });
});

function createTree() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-fs-walk-'));
  tempRoots.push(root);
  fs.mkdirSync(path.join(root, 'nested/deep'), { recursive: true });
  fs.writeFileSync(path.join(root, 'top.txt'), '');
  fs.writeFileSync(path.join(root, 'nested/deep/leaf.txt'), '');
  return root;
}

describe('walkPaths', () => {
  it('returns every directory and file below the root', () => {
    const root = createTree();
    const relativePaths = walkPaths(root).map((entry) => path.relative(root, entry)).sort();
    expect(relativePaths).toEqual(
      ['nested', path.join('nested', 'deep'), path.join('nested', 'deep', 'leaf.txt'), 'top.txt'].sort()
    );
  });

  it('returns an empty list for a missing root', () => {
    expect(walkPaths(path.join(os.tmpdir(), 'prismgb-fs-walk-missing'))).toEqual([]);
  });
});
```

`tests/unit/scripts/process-runner.test.js`:

```js
import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import {
  headlessElectronEnv,
  terminateProcessTree,
  waitForProcessClose
} from '../../../scripts/lib/process-runner.js';

class FakeChildProcess extends EventEmitter {
  constructor() {
    super();
    this.pid = 4242;
    this.kill = vi.fn(() => {
      setImmediate(() => this.emit('close', null, 'SIGTERM'));
      return true;
    });
  }
}

describe('headlessElectronEnv', () => {
  it('overlays the headless electron flags on the base environment', () => {
    expect(headlessElectronEnv({ PATH: '/usr/bin' })).toEqual({
      PATH: '/usr/bin',
      ELECTRON_DISABLE_GPU: '1',
      ELECTRON_NO_ATTACH_CONSOLE: '1'
    });
  });
});

describe('waitForProcessClose', () => {
  it('resolves with the close code and signal', async () => {
    const child = new FakeChildProcess();
    const pending = waitForProcessClose(child, 1000);
    child.emit('close', 0, null);
    await expect(pending).resolves.toEqual({ closed: true, code: 0, signal: null });
  });

  it('resolves with a timeout marker when the process stays open', async () => {
    const child = new FakeChildProcess();
    await expect(waitForProcessClose(child, 10)).resolves.toEqual({
      closed: false,
      code: null,
      signal: 'timeout'
    });
  });
});

describe('terminateProcessTree', () => {
  it('signals the process group when configured', async () => {
    const child = new FakeChildProcess();
    const signalGroup = vi.fn(() => {
      setImmediate(() => child.emit('close', null, 'SIGTERM'));
    });
    await terminateProcessTree(child, { gracefulMs: 100, killProcessGroup: true, platform: 'linux', signalGroup });
    expect(signalGroup).toHaveBeenCalledWith(4242, 'SIGTERM');
    expect(child.kill).not.toHaveBeenCalled();
  });

  it('terminates the child directly by default', async () => {
    const child = new FakeChildProcess();
    await terminateProcessTree(child, { gracefulMs: 100, platform: 'linux' });
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
  });

  it('uses taskkill on windows', async () => {
    const child = new FakeChildProcess();
    const execCommand = vi.fn(() => {
      setImmediate(() => child.emit('close', null, null));
    });
    await terminateProcessTree(child, { gracefulMs: 100, platform: 'win32', execCommand });
    expect(execCommand).toHaveBeenCalledWith('taskkill /pid 4242 /t /f');
    expect(child.kill).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `npx vitest run tests/unit/scripts/fs-walk.test.js tests/unit/scripts/process-runner.test.js`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the libs**

`scripts/lib/fs-walk.js`:

```js
/**
 * Recursive filesystem walk shared by gate scripts.
 */
import fs from 'node:fs';
import path from 'node:path';

export function walkPaths(rootDirectory) {
  if (!fs.existsSync(rootDirectory)) {
    return [];
  }

  return fs.readdirSync(rootDirectory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      return [absolutePath, ...walkPaths(absolutePath)];
    }
    return [absolutePath];
  });
}
```

`scripts/lib/process-runner.js`:

```js
/**
 * Shared child-process lifecycle helpers for gate scripts: headless electron
 * environment, close-awaiting, and platform-aware process-tree termination.
 */
import { exec } from 'node:child_process';

export function headlessElectronEnv(baseEnv = process.env) {
  return {
    ...baseEnv,
    ELECTRON_DISABLE_GPU: '1',
    ELECTRON_NO_ATTACH_CONSOLE: '1'
  };
}

export async function waitForProcessClose(child, timeoutMs) {
  if (!child) {
    return { closed: false, code: null, signal: null };
  }

  return new Promise((resolve) => {
    let settled = false;

    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve({ closed: false, code: null, signal: 'timeout' });
      }
    }, timeoutMs);

    child.once('close', (code, signal) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve({ closed: true, code, signal });
      }
    });
  });
}

export async function terminateProcessTree(child, {
  gracefulMs = 5000,
  killProcessGroup = false,
  platform = process.platform,
  execCommand = exec,
  signalGroup = (pid, signal) => process.kill(-pid, signal)
} = {}) {
  if (!child || typeof child.pid !== 'number') {
    return;
  }

  try {
    if (platform === 'win32') {
      execCommand(`taskkill /pid ${child.pid} /t /f`);
    } else if (killProcessGroup) {
      signalGroup(child.pid, 'SIGTERM');
    } else {
      child.kill('SIGTERM');
    }
  } catch {
    try {
      child.kill('SIGTERM');
    } catch {
      return;
    }
  }

  const closeResult = await waitForProcessClose(child, gracefulMs);
  if (!closeResult.closed) {
    try {
      child.kill('SIGKILL');
    } catch {
      return;
    }
    await waitForProcessClose(child, Math.min(1000, gracefulMs));
  }
}
```

- [ ] **Step 4: Run lib tests to verify they pass**

Run: `npx vitest run tests/unit/scripts/fs-walk.test.js tests/unit/scripts/process-runner.test.js`
Expected: PASS.

- [ ] **Step 5: Rewire `scripts/smoke-test.js`**

Add imports; delete the local `escapeRegex`, `globToRegex`, `walkPaths`, `getStaticGlobRoot` functions:

```js
import picomatch from 'picomatch';
import { walkPaths } from './lib/fs-walk.js';
import { headlessElectronEnv, terminateProcessTree } from './lib/process-runner.js';
```

Replace `findFirstPatternMatch` with:

```js
function findFirstPatternMatch(rootDirectory, relativePattern) {
  const normalizedPattern = relativePattern.split(path.sep).join('/');
  const absolutePattern = path.resolve(rootDirectory, relativePattern);
  if (!normalizedPattern.includes('*')) {
    return fs.existsSync(absolutePattern) ? absolutePattern : null;
  }

  const searchRoot = path.resolve(rootDirectory, picomatch.scan(normalizedPattern).base);
  const isMatch = picomatch(normalizedPattern, { dot: true });
  return walkPaths(searchRoot)
    .map((absolutePath) => ({
      absolutePath,
      relativePath: path.relative(rootDirectory, absolutePath).split(path.sep).join('/')
    }))
    .filter(({ relativePath }) => isMatch(relativePath))
    .sort((left, right) => left.relativePath.localeCompare(right.relativePath))[0]?.absolutePath ?? null;
}
```

In `runSmokeTest`, replace the spawn env object with:

```js
    env: {
      ...headlessElectronEnv(),
      NODE_ENV: 'production'
    },
```

and replace the timeout handler's platform-specific kill block:

```js
  const timeout = setTimeout(() => {
    timedOut = true;
    console.log('');
    console.log('Smoke test timeout reached - app appears to be running successfully');
    console.log('Terminating process...');
    terminateProcessTree(child);
  }, TIMEOUT_MS);
```

(Behavior note for the reviewer: the old path killed without awaiting or escalating; `terminateProcessTree` adds SIGKILL escalation — success detection is unchanged because it still keys off the `close` event.)

- [ ] **Step 6: Rewire `scripts/dev-boot-smoke.js`**

Add imports; delete the local `waitForProcessClose`, `signalProcessGroup`, `shutdownDevProcess` functions:

```js
import { parseArgs } from 'node:util';
import { headlessElectronEnv, terminateProcessTree } from './lib/process-runner.js';
```

Replace `parseOptions` with:

```js
function parseOptions(argv) {
  const { values } = parseArgs({
    args: argv,
    options: {
      'timeout-ms': { type: 'string' },
      command: { type: 'string' },
      'command-arg': { type: 'string' },
      root: { type: 'string' }
    }
  });

  const options = {
    timeoutMs: DEFAULT_TIMEOUT_MS,
    root: values.root ? path.resolve(process.cwd(), values.root) : process.cwd(),
    command: values.command ?? 'npm',
    args: values['command-arg'] ? [values['command-arg']] : ['run', 'dev'],
    gracefulShutdownMs: DEFAULT_GRACEFUL_SHUTDOWN_MS
  };

  if (values['timeout-ms'] !== undefined) {
    const timeoutValue = Number(values['timeout-ms']);
    if (!Number.isFinite(timeoutValue) || timeoutValue <= 0) {
      throw new Error(`Invalid --timeout-ms value: ${values['timeout-ms']}`);
    }
    options.timeoutMs = timeoutValue;
  }

  return options;
}
```

In `runDevBootSmoke`, replace the `shutdownDevProcess(child, gracefulShutdownMs)` call inside `finalize` with:

```js
      await terminateProcessTree(child, { gracefulMs: gracefulShutdownMs, killProcessGroup: true });
```

and the spawn env object with:

```js
    env: headlessElectronEnv(process.env),
```

- [ ] **Step 7: Verify the pinned suites and the live smoke**

Run: `npx vitest run tests/unit/scripts/ && npm run dev:smoke`
Expected: all script tests pass (including the untouched `dev-boot-smoke.test.js` and `platform-manifest.test.js`); dev:smoke reports `dev boot smoke preflight passed`.

- [ ] **Step 8: Full gates + commit**

```bash
npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run
git add scripts/lib/fs-walk.js scripts/lib/process-runner.js scripts/smoke-test.js scripts/dev-boot-smoke.js tests/unit/scripts/fs-walk.test.js tests/unit/scripts/process-runner.test.js
git commit -m "refactor(scripts): extract process-runner and fs-walk libs, adopt picomatch and parseArgs"
```

---

### Task 7: SCR-5 — `typecheck:app` becomes plain tsc

**Files:**
- Delete: `scripts/typecheck-app.js`
- Modify: `package.json:26`

The wrapper's only extra behavior was asserting strict flags in `tsconfig.app.json`; those flags are verified present (Premise 10) and their removal would be caught in code review — the north-star explicitly retires the wrapper (SCR-5).

- [ ] **Step 1: Swap the script**

```json
"typecheck:app": "tsc -p tsconfig.app.json --noEmit",
```

```bash
git rm scripts/typecheck-app.js
```

- [ ] **Step 2: Verify both consumers**

Run: `npm run typecheck && sh -c 'npm run typecheck:app'`
Expected: green (the husky pre-commit hook calls `npm run typecheck:app` — script name unchanged).

- [ ] **Step 3: Full gates + commit**

```bash
npm run lint && npm run lint:dead-code && npm run test:run
git add package.json
git commit -m "refactor(scripts): replace typecheck-app wrapper with plain tsc project invocation"
```

---

### Task 8: Phase exit (controller)

- [ ] **Step 1: Full gate ladder**

```bash
npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run && npm run build:vite && npm run dev:smoke && npm run test:e2e
```

Expected: all green, 86/86 e2e. (P3 lesson: never `tail -1` a chained ladder; check each exit code. `streaming-smoke.spec.js` may flake right after dev:smoke — re-run in isolation before treating as regression.)

- [ ] **Step 2: Live negative test (north-star P4 exit criterion)**

```bash
printf "import '@renderer/presentation/controller/ui-component.catalog';\nexport {};\n" > src/renderer/infrastructure/services/boundary-negative-check.ts
npm run lint; echo "exit: $?"
rm src/renderer/infrastructure/services/boundary-negative-check.ts
git status --porcelain
```

Expected: lint exits nonzero naming `renderer-infrastructure-not-to-presentation`; tree clean after removal.

- [ ] **Step 3: Record and merge**

Update `docs/northstar/PHASE_LOG.md` with a P4 section (metrics: test files/tests delta, prod LOC via the corrected pathspec, notes on any Task 2/5 adjudications). Then:

```bash
git checkout refactor/gpu_normalization
git merge --ff-only northstar/phase-4
git tag northstar-p4
git branch -d northstar/phase-4
```

Commit for the log: `docs(northstar): record P4 exit metrics`.

---

## Self-Review Notes

- **Spec coverage:** north-star P4 step 1 (config: layer matrix ✓ Task 2; gpu deep-import bans ✓ `app-to-platform-internals` + `gpu-root-not-to-internals`; platform-module boundaries ✓ `platform-not-to-app` + cross-module rules; orphan detection ✓ `no-orphans`; no unclassified bypass ✓ structure guards + full-path rule coverage); step 2 (wire lint ✓ Task 2/4; delete checkers + eslint blocks ✓ Task 4; fixture intent migration ✓ Task 3); step 3 CFG-4 ✓ Task 5; step 4 SCR-4/5/6 ✓ Tasks 6-7; exit criteria ✓ Task 8. Three specifier families ✓ fixture rows `platform-deep-alias`/`platform-internal-alias`/`platform-internal-relative`. Stale filename retired ✓ Task 4.
- **Known adjudication points (deliberately in-plan, not placeholders):** Task 2 Step 2 (real-tree orphans/unresolvables beyond the predicted exemptions), Task 3 Step 4 (depcruise JSON `from` path shape), Task 5 Step 3 (esbuild via playwright plugin). Each has a decision rule and a prohibition on rule-weakening.
- **Type consistency:** rule names in Task 2 ↔ Task 3 `EXPECTED_VIOLATIONS` cross-checked; lib export names in Task 6 code ↔ tests cross-checked.
