# Pre-P6 Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute the dual-validated pre-P6 cleanup backlog — fix 2 live UI bugs, excise migration residue from configs/docs, and remove dead code and backwards-compat shims — so the tree is clean before the P6 decorator-DI phase starts.

**Architecture:** Thirteen sequential tasks on a `cleanup/pre-p6` branch off `refactor/gpu_normalization` (HEAD `de12e88f`), ordered risk-ascending: bug fixes → tooling config → repo/docs hygiene → dead code → shim removal → exit gates and ff-merge. Every finding herein was confirmed by two independent validators (Codex CLI + CodeReviewer, 33/33 confirmed, 0 refuted) on 2026-07-02.

**Tech Stack:** Electron 41 / TypeScript 5.9 / Vite 7 / Vitest 4 / Playwright / knip / dependency-cruiser.

## Global Constraints

- Commit subjects: conventional commits, **≤100 chars** (commitlint local + CI). No AI attribution of any kind. Never `--no-verify`.
- No inline code comments; JSDoc only. Code must match surrounding idiom.
- Gate ladder after every task: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run` — check each exit code individually.
- Baseline counts at branch start: **158 test files / 1,972 tests**. Task 1 adds one test file → from Task 1 onward the invariant is **159 files / 1,973 tests**. Any other change to these counts is a STOP condition (a vitest project glob silently dropped a suite).
- `npm run dev:smoke` is MANDATORY after Tasks 10 and 11 (they touch the renderer boot/template path).
- Single writer: tasks run sequentially, one implementer on the tree at a time.
- No `npm install` of any kind is needed by this plan. Do not touch `package-lock.json`.
- Husky: pre-commit runs lint-staged + `typecheck:app`; pre-push runs the full ladder. Budget for it.

## Decision Log (settled — do NOT relitigate or "fix" these)

| Item | Decision |
|---|---|
| `tsconfig.base.json` `experimentalDecorators`/`emitDecoratorMetadata` | **KEEP** — currently vacuous but required by P6 (next phase) |
| `BaseService.disposables` alias (S1: 14 files/47 sites + 22 test sites) | **DEFER to P8** (declarative lifecycle reworks those call sites) |
| X6 type exports (`AppConfiguration`/`AppConfig`/`WindowConfig`/`UiConfig`, `UserNote`/`NoteUpdates`/`NotesServiceDependencies`) | **KEEP** — intentional future-first public surface |
| GPU worker's local `isNumber`/`isString` copies in `src/platform/gpu/worker/protocol.ts` | **KEEP** — do not import `@platform/core` into the worker |
| `CHANGELOG.md` maintenance | **OUT OF SCOPE** — owner decision pending |
| `tests/unit/shared/` directory rename; `PRISMGB_FORCE_WEBGL` env-var rename | **OUT OF SCOPE** — owner decision pending |
| vitest `platform-node` include brace superset (line 144: `config,events,notes,transcode,updates` have no dirs yet) | **KEEP** — forward-declared superset |
| eslint `ignores` `out/**`/`coverage/**`; `.gitignore` `yarn.lock`/`out/` | **KEEP** — defensive, harmless |
| `scripts/clean-generated.js` inert `GENERATED_ARTIFACT_PATHS` entries (`.vitest`, root `test-results`) + `.gitignore` `.vitest/` line | **KEEP** — `existsSync`-guarded, harmless, defensive |
| `@prismgb` as the example prefix in `tests/unit/scripts/workspace-aliases.test.js:70` | **KEEP** — exercises the generic `prefixes` parameter; name is cosmetic |
| `settings-fullscreen` keyed document listener; P5 decision records (UIB-3, INF-3 scope, electron-log divergences) | **Standing** — untouched |

---

### Task 0: Branch setup + local residue sweep

**Files:** none tracked (branch + untracked local deletions only).

- [ ] **Step 1: Verify preconditions**

Run: `git status --short --branch && git log --oneline -1`
Expected: on `refactor/gpu_normalization`, clean tree, HEAD `de12e88f`.

- [ ] **Step 2: Create the branch**

```bash
git checkout -b cleanup/pre-p6
```

- [ ] **Step 3: Delete local-only residue (untracked, gitignored — no commit)**

```bash
rm -f logs/combined.log logs/error.log && rmdir logs
rmdir tests/unit/renderer/infrastructure/factories tests/unit/renderer/infrastructure/rendering
rm -f docs/superpowers/plans/2026-05-29-shared-coverage-paydown.md
rm -rf .turbo
```

Note: `rm -rf` may require elevated permission in sandboxed shells; if blocked, ask the controller to run it. None of these paths are tracked (`git status` must stay clean afterward — verify).

- [ ] **Step 4: Verify tree still clean**

Run: `git status --short`
Expected: empty output.

---

### Task 1: Fix JetBrains Mono font paths + add CSS asset guard test

The `@font-face` blocks in `tokens.css` reference `../fonts/…`, which resolves to the nonexistent `src/renderer/presentation/fonts/`. Real files: `src/renderer/assets/fonts/`. The app currently renders every `var(--font-display)` site with a fallback font.

**Files:**
- Test (create): `tests/unit/renderer/presentation/styles/css-asset-references.test.ts`
- Modify: `src/renderer/presentation/styles/tokens.css:10,18,26`

**Interfaces:** none consumed/produced by later tasks.

- [ ] **Step 1: Write the failing guard test**

Create `tests/unit/renderer/presentation/styles/css-asset-references.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rendererRoot = path.resolve(process.cwd(), 'src/renderer');

function collectCssFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectCssFiles(fullPath);
    }
    return entry.name.endsWith('.css') ? [fullPath] : [];
  });
}

function relativeUrlReferences(cssPath: string): { reference: string; resolved: string }[] {
  const content = fs.readFileSync(cssPath, 'utf8');
  const matches = content.matchAll(/url\(\s*['"]?(\.{1,2}\/[^'")]+)['"]?\s*\)/g);
  return [...matches].map((match) => ({
    reference: match[1],
    resolved: path.resolve(path.dirname(cssPath), match[1])
  }));
}

describe('css relative asset references', () => {
  it('resolves every relative url() to an existing file', () => {
    const missing = collectCssFiles(rendererRoot).flatMap((cssPath) =>
      relativeUrlReferences(cssPath)
        .filter(({ resolved }) => !fs.existsSync(resolved))
        .map(({ reference }) => `${path.relative(process.cwd(), cssPath)} -> ${reference}`)
    );
    expect(missing).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it — must fail on exactly the 3 font urls**

Run: `npx vitest run tests/unit/renderer/presentation/styles/css-asset-references.test.ts`
Expected: FAIL listing exactly 3 entries, all `…/styles/tokens.css -> ../fonts/JetBrainsMono-*.woff2`. If ANY other entry appears: STOP and report to controller (an unknown broken asset reference exists).

- [ ] **Step 3: Fix the three urls in `tokens.css`**

In `src/renderer/presentation/styles/tokens.css`, change each of the three `src:` lines (Regular line 10, Medium line 18, Bold line 26) from:

```css
  src: url('../fonts/JetBrainsMono-Regular.woff2') format('woff2');
```

to:

```css
  src: url('../../assets/fonts/JetBrainsMono-Regular.woff2') format('woff2');
```

(same `../fonts/` → `../../assets/fonts/` substitution for `-Medium` and `-Bold`).

- [ ] **Step 4: Run the guard test — must pass**

Run: `npx vitest run tests/unit/renderer/presentation/styles/css-asset-references.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify the build now emits the fonts**

Run: `npm run build:vite && find dist -name '*.woff2' | wc -l`
Expected: build exit 0 and count `3`. Also `grep -o 'JetBrainsMono[^)]*' dist/renderer/assets/*.css | head -3` must show hashed emitted asset paths, NOT `../fonts/`.

- [ ] **Step 6: Gate ladder + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; **159 files / 1,973 tests** from here on.

```bash
git add src/renderer/presentation/styles/tokens.css tests/unit/renderer/presentation/styles/css-asset-references.test.ts
git commit -m "fix(renderer): repair JetBrains Mono font urls broken by styles relocation"
```

---

### Task 2: Fix toolbar streaming-state selectors

`toolbar-states.css` styles `.toolbar-btn-screenshot`/`.toolbar-btn-record`, but the template (`toolbar.template.ts:58,63`) emits `class="toolbar-btn toolbar-capture toolbar-screenshot"` / `…toolbar-record"`. The sibling `.toolbar-notes` selector in the same rules is correct and proves the mechanism. Fix = drop the `-btn` infix so the selectors match, exactly like `.toolbar-notes`.

**BEHAVIOR CHANGE WARNING:** this re-activates hide-when-not-streaming for the screenshot/record buttons (opacity 0, scale 0, pointer-events none until `body.streaming-mode`). That is the stated design (file header: "Toolbar button visibility during streaming mode"). e2e must confirm nothing relied on the buggy always-visible state.

**Files:**
- Modify: `src/renderer/presentation/features/toolbar/styles/toolbar-states.css:7-8,16-17,26-27`

- [ ] **Step 1: Apply the three selector-group edits**

```css
/* lines 7-9 — was .toolbar-btn-screenshot, .toolbar-btn-record */
.toolbar-screenshot,
.toolbar-record,
.toolbar-notes {

/* lines 16-18 — was body.streaming-mode .toolbar-btn-… */
body.streaming-mode .toolbar-screenshot,
body.streaming-mode .toolbar-record,
body.streaming-mode .toolbar-notes {

/* lines 26-28 — was .toolbar-btn-….hiding */
.toolbar-screenshot.hiding,
.toolbar-record.hiding,
.toolbar-notes.hiding {
```

(Rule bodies unchanged. After the edit, `git grep -n 'toolbar-btn-' -- src` must return zero hits.)

- [ ] **Step 2: Gate ladder**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; 159/1,973.

- [ ] **Step 3: e2e — mandatory for this task (behavior change)**

Run: `npm run test:e2e`
Expected: 86/86 pass. The specs use `#screenshotBtn`/`#recordBtn` ids (`tests/e2e/pages/stream.page.js:6-7`) and stream before interacting, so they should pass. **STOP condition:** if any spec fails on record/screenshot visibility or actionability, `git checkout -- src` (do not commit) and report to controller — visible-when-idle may have become accepted UX and the owner must rule. (`streaming-smoke.spec.js` may flake under contention — re-run it in isolation once before concluding failure.)

- [ ] **Step 4: Commit**

```bash
git add src/renderer/presentation/features/toolbar/styles/toolbar-states.css
git commit -m "fix(renderer): align toolbar streaming-state selectors with template classes"
```

---

### Task 3: Remove retired webgl2 backend from event payload contracts

`@platform/events` carries a stale duplicate of the GPU domain's `RenderBackend` union. GPU domain (`src/platform/gpu/domain/types.ts:1`) is `'webgpu' | 'canvas2d'`; the events copy still lists `'webgl2'`, plus a `webgl2?: boolean` capability flag. Grep-verified: no code or test produces or reads the `'webgl2'` value or the `webgl2` property (only the two definition lines).

**Files:**
- Modify: `src/platform/events/event-payloads.ts:56,72`

**Interfaces:**
- Produces: `RenderBackend = 'webgpu' | 'canvas2d'` in `@platform/events` (now textually identical to the GPU domain union; kept as separate declarations deliberately — platform modules do not cross-import).

- [ ] **Step 1: Apply the two edits**

Line 56, from:
```ts
export type RenderBackend = 'webgpu' | 'webgl2' | 'canvas2d';
```
to:
```ts
export type RenderBackend = 'webgpu' | 'canvas2d';
```

Line 72: delete the line `  webgl2?: boolean;` from `StreamingCapabilities` (keep `webgpu?: boolean;` above it and `transferControlToOffscreen?: boolean;` below it).

- [ ] **Step 2: Verify zero webgl residue in platform/renderer source**

Run: `git grep -ni 'webgl2' -- src`
Expected: zero hits. (`src/main/infrastructure/gpu-policy.ts` mentions `PRISMGB_FORCE_WEBGL` — different string, out of scope per Decision Log.)

- [ ] **Step 3: Gate ladder + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; 159/1,973.

```bash
git add src/platform/events/event-payloads.ts
git commit -m "fix(events): drop retired webgl2 backend from render payload contracts"
```

---

### Task 4: Tooling-config residue sweep

Every entry below references a package or path that no longer exists (validated individually). None changes behavior except the `tests/utils` include fix, which ADDS one file to typecheck.

**Files:**
- Modify: `vite.config.js:53-59`, `vitest.config.js` (coverage excludes + two project blocks), `tsconfig.app.json:24`, `tsconfig.test.json:24,31`, `eslint.config.js:52-53`, `.gitignore` (Turborepo block), `.github/dependabot.yml:22-23`

- [ ] **Step 1: vite.config.js — prune main-build externals**

In the main-process build block (`externals` array, lines 53-59), delete the `'winston',` and `'dotenv',` entries, leaving:

```js
const externals = [
  'electron',
  'usb',
  'eventemitter3'
];
```

- [ ] **Step 2: vitest.config.js — delete 6 vacuous coverage excludes**

In the coverage exclude list, delete exactly these six lines (and the two orphaned comment lines noted):

```js
    // Web Worker files run in Worker context, not testable in vitest   ← delete comment
    'src/**/workers/*.{js,ts}',                                          ← delete
    // GPU/Canvas/WebGPU APIs not available in vitest                    ← KEEP comment? NO — delete it too
    'src/**/rendering/gpu/*.{js,ts}',                                    ← delete
    'src/renderer/infrastructure/services/streaming/adapters/streaming-canvas2d-renderer.adapter.ts',  ← delete
    'src/renderer/infrastructure/services/streaming/adapters/streaming-gpu-renderer.adapter.ts',       ← delete
    'src/renderer/infrastructure/services/streaming/streaming-renderer.factory.ts',                    ← delete
    'src/**/gpu-render-loop.service.{js,ts}',                            ← delete
    // Audio warmup requires Web Audio API not available in vitest       ← delete comment
    'src/**/audio/*.{js,ts}',                                            ← delete
```

KEEP: `'src/renderer/infrastructure/services/updates/**'`, `'src/**/canvas-lifecycle.service.{js,ts}'` (+ its comment), `'src/renderer/presentation/shell/*.{js,ts}'` (+ its comment) — those match real files.

- [ ] **Step 3: vitest.config.js — prune dead project include-globs**

`renderer-happy-dom` project include becomes:

```js
          include: [
            'tests/integration/**/*.{test,spec}.{js,ts}',
            'tests/workflows/**/*.{test,spec}.{js,ts}',
            'tests/unit/renderer/**/*.{test,spec}.{js,ts}'
          ],
```

(deleting `tests/unit/app/renderer/**`, `tests/unit/features/**`, `tests/unit/ui/**`).

`main-preload` project (line ~124) becomes — note the rename, verified zero external references to the old name:

```js
          name: 'main-node',
          globals: true,
          environment: 'node',
          include: [
            'tests/unit/main/**/*.{test,spec}.{js,ts}'
          ],
```

(deleting `tests/unit/app/main/**` and `tests/unit/preload/**`). Leave `platform-node` (line 144 superset) and `platform-dom` untouched.

- [ ] **Step 4: tsconfig includes**

`tsconfig.app.json`: delete line 24 `"src/shared/**/*.ts",`.
`tsconfig.test.json`: delete line 24 `"src/shared/**/*.ts",` AND change line 31 `"tests/utilities/**/*.js"` → `"tests/utils/**/*.js"`.

- [ ] **Step 5: eslint.config.js — drop dead preload global**

Delete lines 52-53:

```js
        // Electron preload
        deviceAPI: 'readonly'
```

and remove the now-trailing comma on the `__APP_VERSION__: 'readonly'` line above.

- [ ] **Step 6: .gitignore + dependabot**

`.gitignore`: delete the two lines `# Turborepo` and `.turbo/`.
`.github/dependabot.yml`: delete the two lines:

```yaml
      - dependency-name: "electron-vite"
        update-types: ["version-update:semver-major"]
```

- [ ] **Step 7: Gate ladder with count invariant**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0 and **exactly 159 files / 1,973 tests** (this proves the project-glob edits dropped nothing). The `tests/utils/**` include adds `tests/utils/index.js` to typecheck — **STOP condition:** if `typecheck:tests` surfaces more than trivial errors (>5) from that file, report instead of fixing blind.

- [ ] **Step 8: Commit**

```bash
git add vite.config.js vitest.config.js tsconfig.app.json tsconfig.test.json eslint.config.js .gitignore .github/dependabot.yml
git commit -m "build(config): sweep stale externals, vitest globs, and tsconfig includes"
```

---

### Task 5: Repo hygiene — untrack AGENT.md, delete superseded AGY prompts

`AGENT.md` is listed in `.gitignore` but tracked (committed before the ignore rule); it is a user-machine-specific Codex bootstrap. The two antigravity prompts belong to completed, tagged phases (`northstar-p1`/`p2`) and are non-replayable (they invoke the deleted `check:gpu-boundaries` gate).

**Files:**
- Untrack: `AGENT.md` (stays on disk, becomes ignored)
- Delete: `docs/antigravity-phase1-execution-prompt.md`, `docs/antigravity-phase2-execution-prompt.md`

- [ ] **Step 1: Apply**

```bash
git rm --cached AGENT.md
git rm docs/antigravity-phase1-execution-prompt.md docs/antigravity-phase2-execution-prompt.md
```

- [ ] **Step 2: Verify**

Run: `git status --short && ls AGENT.md`
Expected: staged `D` for the three paths (AGENT.md as deleted-from-index only), `AGENT.md` still on disk, and NOT listed as untracked (ignore rule now effective).

- [ ] **Step 3: Gate ladder + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; 159/1,973.

```bash
git commit -m "chore(repo): untrack AGENT.md and delete superseded antigravity prompts"
```

---

### Task 6: Docs content alignment

Fix stale claims in tracked docs. All line numbers were verified 2026-07-02. Replacement rules: `packages/prismgb-<name>/src/…` → `src/platform/<name>/…`; alias `@prismgb/<name>` → `@platform/<name>`; logging is `electron-log` (winston removed); renderer backends are WebGPU with Canvas2D fallback (WebGL2 removed).

**Files:**
- Modify: `README.md`, `CONTRIBUTING.md`, `DEVELOPMENT.md`, `docs/architecture-diagrams.md`, `docs/architecture-diagrams-onboarding.md`, `docs/feature-map.md`, `docs/naming-conventions.md`, `CODEBASE_NORMALIZATION_ANALYSIS.md`

- [ ] **Step 1: README.md**

L3 source-comment: fix `packages/prismgb-devices/...` path per rules. L52 and the L306 diagram label: replace "WebGL2 primary with WebGPU and Canvas2D fallback"-style claims with "WebGPU primary with Canvas2D fallback". L362 tech table: `**Logging** | Winston` → `**Logging** | electron-log`.

- [ ] **Step 2: CONTRIBUTING.md**

L3 source-comment: fix path. L96: replace the `packages/` tree entry with `src/platform/          # Platform modules shared across main and renderer`. L213: remove `electron-vite` from the protected-toolchain list (not a dependency). L221-222: rewrite the TypeScript-upgrade procedure to reference only root `package.json` and `tsconfig.base.json` (the per-package tsconfig no longer exists). L285: `import { BaseService } from '@prismgb/core';` → `import { BaseService } from '@platform/core';`.

- [ ] **Step 3: DEVELOPMENT.md**

L51: delete the `npm run typecheck:gpu` row (script does not exist). L52: describe `typecheck` as running `typecheck:app` + `typecheck:tests`.

- [ ] **Step 4: architecture-diagrams.md + architecture-diagrams-onboarding.md**

`architecture-diagrams.md`: L3 source-comment paths; L257 `@prismgb/devices` → `@platform/devices`; L264 → "Shared timing constants live in `src/platform/config/timing.config.ts` (imported via `@platform/config`)". `architecture-diagrams-onboarding.md`: L3 paths; L165 → `@platform/devices` / `@platform/devices/runtime`.

- [ ] **Step 5: feature-map.md**

Replace the alias table/count (L25, L32) with the 19 current aliases: `@`, `@main`, `@renderer`, `@preload`, plus the 15 `@platform/*` specifiers enumerated in `scripts/lib/workspace-aliases.mjs` (10 module roots + `devices/runtime`, `devices/testkit`, `gpu/runtime`, `transcode/service`, `ui-base/reactive`). Rewrite Extension Points sections (L78-81, L91-94, L104) to the `src/platform/devices/…`, `src/platform/gpu/…`, `@platform/config` paths. Replace the `CODEBASE_FEATURE_MAP:START/END` and `CODEBASE_PHASE1_MANIFESTS:START/END` marker comments with a plain note that the map is manually maintained (no generator exists).

- [ ] **Step 6: naming-conventions.md**

L3 source-comment paths. L58-60 → "Shared event contract: `src/platform/events/event-channels.ts` (via `@platform/events`). Main event channels: `src/platform/events/main-event-channels.ts`." L70 alias table → same 19-alias content as Step 5. L72 heading `(@prismgb/core)` → `(@platform/core)`.

- [ ] **Step 7: CODEBASE_NORMALIZATION_ANALYSIS.md**

Do NOT rewrite its 40 path references (historical evidence base cited by NORTH_STAR_DESIGN_PLAN §2). Insert one line directly under the title:

```markdown
> Historical note (2026-07-02): file paths in this document predate the P3 workspace collapse — `packages/prismgb-<name>/src/…` now lives at `src/platform/<name>/…`.
```

- [ ] **Step 8: Verify sweep**

Run: `git grep -n '@prismgb\|packages/prismgb' -- '*.md' 'docs/*.md' ':!CODEBASE_NORMALIZATION_ANALYSIS.md' ':!NORTH_STAR_DESIGN_PLAN.md'`
Expected: zero hits. Also `git grep -ni 'winston\|webgl' README.md` → zero hits.

- [ ] **Step 9: Gate ladder + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; 159/1,973 (docs cannot change counts — sanity only).

```bash
git add README.md CONTRIBUTING.md DEVELOPMENT.md docs/architecture-diagrams.md docs/architecture-diagrams-onboarding.md docs/feature-map.md docs/naming-conventions.md CODEBASE_NORMALIZATION_ANALYSIS.md
git commit -m "docs: align contributor and architecture docs with platform layout"
```

---

### Task 7: Dead CSS excision

All items verified by precise parse (animation/animation-name values joined across lines; `var()`/`setProperty`/`getPropertyValue`/classList sweeps) — no dynamic construction rescues any of them.

**Files:**
- Modify: `src/renderer/presentation/styles/animations.css`, `styles/tokens.css`, `styles/base.css`, `styles/responsive.css`, `styles/buttons.css`, `features/fullscreen/styles/fullscreen-controls.css`, `features/notes/styles/notes-reduced-motion.css`, `features/settings/styles/settings-menu.css`, `features/updates/styles/updates.css` (all under `src/renderer/presentation/`)

- [ ] **Step 1: Delete the unused keyframe**

`animations.css`: delete the comment `/* Floating pixel particles rising up */` and the entire `@keyframes particle-float { … }` block (starts ~line 119; ends at its closing brace ~line 141). Do NOT touch `@keyframes particle-float-rainbow` (~line 368) — it is live.

- [ ] **Step 2: Delete 18 unused custom properties from `tokens.css`**

Delete the declaration line for each of: `--blur-heavy`, `--color-bg-secondary`, `--color-bg-tertiary`, `--color-secondary-dark`, `--color-secondary-rgb`, `--color-tertiary`, `--color-tertiary-rgb`, `--color-warning-rgb`, `--font-size-lg`, `--glass-bg-light`, `--glass-border-hover`, `--glass-border`, `--shadow-glow-danger`, `--shadow-glow-success`, `--shadow-glow`, `--side-panel-width`, `--space-xl`, `--transition-slow`. Do NOT touch `--shadow-glow-prismatic` (live). Verify each before deleting: `git grep -n 'var(--<name>' -- src` must be empty.

- [ ] **Step 3: Delete orphaned rule blocks**

- `base.css:304,308`: both `.chromatic-hover` rules; `responsive.css:45`: its `.chromatic-hover` rule.
- `buttons.css`: `.btn-rainbow` rules (83,107), `.btn-success` (124,130), `.btn-danger` (135,141) — whole rule blocks each.
- `base.css:205`: the `body.app-animations-off .btn-rainbow { … }` block (dead once `.btn-rainbow` goes).
- `fullscreen-controls.css:41`: the `.fs-control-item` rule block.
- `notes-reduced-motion.css:18`: remove only the line `.notes-action-btn,` from the comma-selector list (the rest of the list is live).
- `settings-menu.css:81`: `.settings-section-title` block; `settings-menu.css:303`: `.settings-version` block.
- `updates.css:264`: `.update-new-version` block.

- [ ] **Step 4: Verify each removed name has zero remaining references**

Run: `git grep -nE 'chromatic-hover|fs-control-item|btn-rainbow|btn-success|btn-danger|notes-action-btn|settings-section-title|settings-version|update-new-version|particle-float[^-]' -- src`
Expected: zero hits.

- [ ] **Step 5: Gate ladder + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; 159/1,973. (CSS asset guard test from Task 1 also re-validates.)

```bash
git add src/renderer/presentation
git commit -m "refactor(styles): remove orphaned selectors, keyframe, and unused tokens"
```

---

### Task 8: Dead test factory/fixture exports

tests/ sits outside knip's project graph. Every export below was grep-verified (word-boundary, all test trees) to have zero consumers; both naming-collision traps were kept apart (`createStreamViewServiceMock` dead vs `createStreamingViewServiceMock` LIVE; `createStreamingDependencies` dead vs `createStreamingServiceDependencies` LIVE).

**Files:**
- Modify: `tests/factories/{window,dependencies,performance,stream,ui,system,app-state,streaming-pipeline,logger}.factory.js`, `tests/factories/index.js`, `tests/fixtures/capture.fixture.js`
- Delete: `tests/fixtures/index.js`, `tests/fixtures/settings.fixture.js`

- [ ] **Step 1: Remove dead factory exports (function + its `tests/factories/index.js` re-export line + any `export default` aggregate entry in its own file)**

| File | Remove |
|---|---|
| `window.factory.js` | `createTrayMock` AND `createTrayServiceElectronMock` (a self-contained pair — remove together) |
| `dependencies.factory.js` | `createMockDependencies`, `createStreamingDependencies`, `createCaptureDependencies` (internally chained trio — remove together) |
| `performance.factory.js` | `createAppMetricsServiceMock` |
| `stream.factory.js` | `createBrowserMediaServiceMock`, `createStreamConstraintsMock` |
| `ui.factory.js` | `createButtonFeedback`, `createCaptureEffects`, `createStatusNotificationElementsMock` — wait: `createStatusNotificationElementsMock` appears in index.js re-exports; verify with `git grep -l 'createStatusNotificationElementsMock' tests --include='*.test.*'` first; if any hit, KEEP it and note in report |
| `system.factory.js` | `createContextBridgeMock`, `createDisposableMock`, `createDomEventMock`, `createOffscreenCanvasElementMock`, `createPreloadEventApiMock`, `createProcessMetricsApiMock`, `createShellServiceMock` |
| `app-state.factory.js` | `createRecordingAppState`; demote `DEFAULT_STATE` to non-exported `const` (used internally by `createAppState`) |
| `streaming-pipeline.factory.js` | `createStreamViewServiceMock`, `createWorkerInstanceMock` |
| `logger.factory.js` | demote `LogLevels` to non-exported `const` (used internally by `createLogger`) |

Rule for every removal: delete the function/const (or demote to non-exported), delete its line from `tests/factories/index.js`, and delete its entry from the file's own `export default { … }` block if present (e.g. `ui.factory.js:916-936`).

- [ ] **Step 2: Delete dead fixture files and prune capture.fixture.js**

```bash
git rm tests/fixtures/index.js tests/fixtures/settings.fixture.js
```

`tests/fixtures/capture.fixture.js`: its only importer is `tests/workflows/capture.workflow.test.js:23`, which uses exactly `CAPTURE_EVENTS`, `UI_CAPTURE_EVENTS`, `createScreenshotBlob`, `createRecordingBlob`. Delete the other 10 exports (`SCREENSHOT_PATTERNS`, `RECORDING_PATTERNS`, `SCREENSHOT_FIXTURE`, `RECORDING_FIXTURE`, `MEDIA_RECORDER_OPTIONS`, `RECORDING_STATES`, `RECORDING_ERRORS`, `RECORDED_CHUNKS`, `createRecordedChunks`, `createCaptureEventFixture`) — BUT first check whether any of the 4 live exports references a dying constant internally; anything referenced by a live export stays (demoted to non-exported if it was exported).

- [ ] **Step 3: Run the directly-affected suites first**

Run: `npx vitest run tests/workflows tests/unit --reporter=basic 2>&1 | tail -5`
Expected: pass.

- [ ] **Step 4: Gate ladder with count invariant + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; **exactly 159 files / 1,973 tests** (no test file may disappear).

```bash
git add tests/factories tests/fixtures
git commit -m "test(factories): drop unconsumed factory and fixture exports"
```

---

### Task 9: Dead platform exports + icon constant

Verified via `npx knip --include-entry-exports --include exports,types,nsExports,nsTypes` + word-boundary grep. Per Decision Log: X6 types stay; GPU worker's local guard copies stay.

**Files:**
- Modify: `src/platform/core/primitives/async.utils.ts`, `src/platform/core/primitives/guards.utils.ts`, `src/platform/core/index.ts`, `src/platform/devices/application/connection.service.ts`, `src/platform/devices/runtime.ts`, `src/platform/transcode/transcode.config.ts`, `src/platform/transcode/index.ts`, `tests/support/mocks/trpc-client.mock.ts`, `scripts/generate-icons.js`

- [ ] **Step 1: core — `Deferred` and `isNumber`/`isString`**

`async.utils.ts`: delete lines 5-6 (the JSDoc line and `export type Deferred<T> = PromiseWithResolvers<T>;`).
`guards.utils.ts`: delete the `isNumber` and `isString` functions including their JSDoc lines (11-13 and 16-18 regions).
`core/index.ts` line 35 → `export { isRecord, isPromiseLike } from './primitives/guards.utils.js';`
`core/index.ts` line 39 → `export type { TimedRaceOutcome } from './primitives/async.utils.js';`

- [ ] **Step 2: devices — `DeviceConnectionEvents`**

`connection.service.ts`: delete the interface block (lines 28-31):
```ts
export interface DeviceConnectionEvents {
  statusChanged: DeviceStatus;
  checkError: DeviceConnectionCheckError;
}
```
`devices/runtime.ts`: delete the `  DeviceConnectionEvents,` line from the type re-export list (line 6).

- [ ] **Step 3: transcode — `TranscodeFormatKey`**

`transcode.config.ts`: delete line 71 `export type TranscodeFormatKey = TranscodeFormat;` (and its preceding blank line). The private same-named type in `transcode.service.ts:86` is unrelated — do not touch.
`transcode/index.ts`: delete line 10 `export type { TranscodeFormatKey } from './transcode.config.js';`

- [ ] **Step 4: test mock type + icon constant**

`tests/support/mocks/trpc-client.mock.ts`: delete line 93 `export type TrpcClientMock = ReturnType<typeof createTrpcClientMock>;`
`scripts/generate-icons.js`: delete line 40 `const ICON_BG_TERTIARY = '#16213e';` and trim the stale gradient comment on line 37 to end at `--color-bg-secondary 50%);` (the tertiary token is being removed from tokens.css in Task 7).

- [ ] **Step 5: Verify with the entry-exports knip pass**

Run: `npx knip --include-entry-exports --include exports,types,nsExports,nsTypes`
Expected: exactly 2 remaining items — the `scripts/afterPack.js` and `scripts/patch-appimage-runtime.js` default exports (electron-builder string-hook false positives). Anything else: STOP and report.

- [ ] **Step 6: Gate ladder + commits**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; 159/1,973.

```bash
git add src/platform tests/support/mocks/trpc-client.mock.ts
git commit -m "refactor(platform): remove dead exports from core, devices, and transcode"
git add scripts/generate-icons.js
git commit -m "chore(scripts): drop unused icon background constant"
```

---

### Task 10: Delete the legacy template-id fallback (S3 + S4)

The `data-ref` fallback-to-`id` mechanism is provably unreachable: all 81 refs in `TemplateDomRefGroups` resolve via `data-ref` (72 static, 9 interpolated), the single mapped element carries both attributes, and the fallback has zero test coverage. Removing `legacyIds` empties `TemplateRefBindingOptions`, so the whole options parameter goes. The dead re-export block in `template-ref.utils.ts` (S4) dies in the same task because it forwards the dying type.

**Files:**
- Modify: `src/platform/ui-base/template/template-ref.helpers.ts`, `src/platform/ui-base/index.ts:38-42`, `src/renderer/presentation/primitives/template-ref.utils.ts:1-25`, `src/renderer/presentation/primitives/template-dom.contract.ts:11`, `src/renderer/presentation/primitives/dom-bindings.utils.ts:1-13,69,73-77`, `src/renderer/presentation/shell/status-footer.template.ts:9`

**Interfaces:**
- Produces: `bindTemplateRefs<TBindings>(root: ParentNode, refs: TemplateRefList<TBindings>): TBindings` — two parameters, options object removed. `@platform/ui-base` no longer exports `TemplateRefLegacyIdMap` or `TemplateRefBindingOptions`.

- [ ] **Step 1: `template-ref.helpers.ts`**

Delete: the `TemplateRefLegacyIdMap` type (lines 7-8), the `TemplateRefBindingOptions` interface (lines 10-14), the `findLegacyId` function (lines 49-56). Replace `bindTemplateRefs` (lines 58-71) with:

```ts
export function bindTemplateRefs<TBindings extends Record<keyof TBindings, HTMLElement | null>>(
  root: ParentNode,
  refs: TemplateRefList<TBindings>
): TBindings {
  const elements = {} as TBindings;

  refs.forEach((ref) => {
    const element = queryRoot(root, createTemplateRefSelector(ref));
    elements[ref] = element as TBindings[typeof ref];
  });

  return elements;
}
```

- [ ] **Step 2: `ui-base/index.ts`**

Replace the type re-export block (lines 38-42) with:

```ts
export type { TemplateRefList } from './template/template-ref.helpers.js';
```

- [ ] **Step 3: `template-ref.utils.ts` — delete the S4 re-export block**

Delete lines 3-25: the import of `createTemplateRefSelector, getTemplateAction, getTemplateActionTarget, bindTemplateRefs` from `@platform/ui-base`, the `import type { TemplateRefList, TemplateRefLegacyIdMap, TemplateRefBindingOptions }` block, and both `export { … }` / `export type { … }` forwarding blocks. Keep line 1 (`EventChannels`) and line 2 (`TemplateActionTargets`) — they are used by the file's live logic. If typecheck then flags an internal use of a deleted symbol, re-add ONLY a plain (non-re-exported) import for that symbol.

- [ ] **Step 4: `template-dom.contract.ts`**

Delete the line: `export const TemplateRefLegacyIds = { footer: 'statusFooter' } as const;`

- [ ] **Step 5: `dom-bindings.utils.ts`**

Imports (lines 1-13): reduce the ui-base import to `import { bindTemplateRefs } from '@platform/ui-base';` and remove `TemplateRefLegacyIds,` from the contract import list.
Delete line 69: `const settingsLegacyIds = TemplateRefLegacyIds satisfies TemplateRefLegacyIdMap<DomSettingsBindings>;`
Change the settings bind call (lines 75-77) to: `const settings = bindTemplateRefs<DomSettingsBindings>(root, TemplateDomRefGroups.settings);`

- [ ] **Step 6: `status-footer.template.ts` line 9**

Remove the ` id="statusFooter"` attribute:
```html
    <footer class="footer status-hidden" data-ref="footer">
```

- [ ] **Step 7: Verify zero residue**

Run: `git grep -n 'LegacyId\|findLegacyId\|statusFooter' -- src tests`
Expected: zero hits.

- [ ] **Step 8: Gate ladder + dev:smoke (boot path) + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; 159/1,973.
Run: `npm run dev:smoke`
Expected: "Renderer application started successfully", exit 0.

```bash
git add src/platform/ui-base src/renderer/presentation
git commit -m "refactor(ui-base): delete unreachable legacy template-id fallback"
```

---

### Task 11: Drop the redundant `_disposables` getter (S2)

`PresentationComponent.lifecycle.disposables` is directly reachable; the getter is pure indirection with 1 src + 3 test consumers.

**Files:**
- Modify: `src/platform/ui-base/lifecycle/presentation-component.base.ts:19-21`, `src/renderer/presentation/features/settings/settings-menu.component.ts:304`, `tests/unit/renderer/presentation/features/settings/settings-menu.component.test.ts:433,437`, `tests/unit/renderer/presentation/features/toolbar/button-feedback.test.ts:107`, `tests/unit/renderer/presentation/primitives/activity-auto-hide.controller.test.ts:18`

- [ ] **Step 1: Delete the getter**

`presentation-component.base.ts`: delete lines 19-21 (`protected get _disposables(): DisposableBag { … }`). Then remove `DisposableBag` from the `@platform/core` type-import list IF it is now unused in the file (typecheck will confirm).

- [ ] **Step 2: Repoint the four consumers**

- `settings-menu.component.ts:304`: `this._disposables.size` → `this.lifecycle.disposables.size`
- `settings-menu.component.test.ts:433,437` (file is `@ts-nocheck`): `component._disposables.size` → `component.lifecycle.disposables.size`
- `button-feedback.test.ts:107` (subject var is untyped): `buttonFeedback._disposables.size` → `buttonFeedback.lifecycle.disposables.size`
- `activity-auto-hide.controller.test.ts:18` (TestComponent subclass): `return this._disposables.size;` → `return this.lifecycle.disposables.size;`

- [ ] **Step 3: Verify zero residue**

Run: `git grep -n '_disposables' -- src/platform/ui-base src/renderer tests/unit/renderer`
Expected: zero hits. (`BaseOrchestrator`'s separate `_lifecycle` member and its tests are untouched — different class, out of scope.)

- [ ] **Step 4: Gate ladder + dev:smoke + commit**

Run: `npm run lint && npm run lint:dead-code && npm run typecheck && npm run test:run`
Expected: all 0; 159/1,973.
Run: `npm run dev:smoke`
Expected: exit 0.

```bash
git add src/platform/ui-base src/renderer/presentation tests/unit/renderer
git commit -m "refactor(ui-base): drop redundant _disposables getter"
```

---

### Task 12: Exit ritual

- [ ] **Step 1: Full 8-gate ladder — check each exit code individually**

```bash
npm run lint
npm run lint:dead-code
npm run typecheck
npm run test:run
npm run test:integration
npm run build:vite
npm run dev:smoke
npm run test:e2e
```

Expected: all 0; test:run at 159 files / 1,973 tests; e2e 86/86; `find dist -name '*.woff2' | wc -l` → 3.

- [ ] **Step 2: Merge and clean up**

```bash
git checkout refactor/gpu_normalization
git merge --ff-only cleanup/pre-p6
git branch -d cleanup/pre-p6
git log --oneline northstar-p5..HEAD
```

Expected: ff-merge succeeds; log shows the ~12 cleanup commits; tree clean. No tag (not a northstar phase).

- [ ] **Step 3: Report**

Report to owner: commit list, final gate results, LOC delta (`git diff --stat northstar-p5..HEAD | tail -1`), and the standing decision log (S1→P8, X6 kept, CHANGELOG/`tests/unit/shared`/`FORCE_WEBGL` still open).

---

## Self-Review Record

- **Coverage:** every approved category from the 2026-07-02 audit maps to a task — F1→T1, F2→T2, F3(webgl2)→T3, C1-C4/C6-C8→T4, M1/M2→T5, M3→T6, D1-D3→T7, D4/D5→T8, X1-X5+ICON_BG_TERTIARY→T9, S3/S4→T10, S2→T11. Deliberately excluded items are all in the Decision Log with reasons.
- **Type consistency:** `bindTemplateRefs` two-param signature (T10) matches the sole call-site rewrite in `dom-bindings.utils.ts`; `core/index.ts` barrel lines match the surviving symbols after T9.
- **Count invariants:** 159/1,973 asserted from Task 1 onward; T4 and T8 carry explicit STOP conditions on count drift; T2 carries the behavior-change e2e STOP condition.
