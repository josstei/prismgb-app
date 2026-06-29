# Plan 02 — Build Model: dist + turbo + CI, retire src-aliasing

## 0. Goal & End State

Make the workspace build its nine `@prismgb/*` packages to `dist/` via **turbo**, wire turbo into CI so a package that fails to **build standalone** (or violates its declared dependency graph, or fails to **emit its declared `exports` artifacts**) is **caught**, and retire the `@prismgb/*->src` **vite** aliasing so the shipped app consumes **built artifacts** — the property that makes `@prismgb/core` genuinely publishable/extractable.

This is the **highest-risk** plan in the program: a wrong move breaks `npm run build`, `npm run dev`, and CI for the whole app. It is therefore executed as **three independently-shippable, hard-gated phases** so the validation hole is closed long before the risky resolution-model flip:

| Phase | What it delivers | Risk | Shippable on its own? |
|-------|------------------|------|------------------------|
| **1** | (a) Break the `ipc↔transcode` standalone-build cycle (the latent failure that breaks every cold `turbo run build` today); **(b) make the `@prismgb/devices` / `@prismgb/transcode` `./service` subpath exports real** — emit `dist/service.js` (today the build emits only `dist/index.js`, so the declared `./service` export resolves to a file that does not exist); (c) add the file-existence **export-smoke** gate (`scripts/check-package-exports.js`). | LOW (two type-only edits + two additive build-config edits + one new validation script) | Yes |
| **2** | Wire `turbo run build` + `turbo run typecheck` + the export-smoke gate into CI (replacing the ad-hoc gpu+core builds) **while vite src-aliasing still stands** — closes the validation hole at near-zero risk. **This is the adopted-model milestone.** | LOW | Yes |
| **3** | Flip the **vite** build/dev/runtime to consume `dist`; delete the three `@prismgb/*->src` vite alias blocks; add `turbo run build` pre-hooks to the vite-driven scripts | HIGH (resolution-model change; can break boot) | Yes, gated on a **cold** rebuild + `dev:smoke` + `test:e2e` |

**Why Phase 1(b) is mandatory and not optional (root cause):** both `packages/prismgb-{devices,transcode}/package.json` declare `"./service": { "import": "./dist/service.js", "types": "./dist/service.d.ts" }`, and the main process imports those subpaths as **value** imports (`src/main/application/container.ts` lines 13–16 + 19 import `DeviceService`, `DeviceProfileRegistry`, `DeviceLifecycleService`, `DeviceBridgeService`, `TranscodeService`). But each package's `vite.config.ts` builds a **single** `lib.entry: src/index.ts` with `preserveModules: false`, so the build emits only `dist/index.js`; the `tsc --emitDeclarationOnly` step emits `dist/service.d.ts` (declaration only, no `.js`). **`dist/service.js` is never produced.** Verified this session: a fresh `npm run build` of either package yields `dist/index.js` + `dist/service.d.ts` and no `dist/service.js`, and `node --input-type=module -e "import('@prismgb/devices/service')"` fails with `ERR_MODULE_NOT_FOUND` (same for transcode). Today this is masked **only** because vite src-aliasing rewrites `@prismgb/devices/service` straight to `packages/prismgb-devices/src/service.ts`. The moment Phase 3 removes that alias, `@prismgb/devices/service` resolves through `node_modules → exports["./service"] → dist/service.js`, which does not exist → **main-process boot breaks** (`npm run dev`, `npm run build:vite`, `npm run dev:smoke` all fail with module-not-found). Phase 1(b) makes the build emit `dist/service.js` **before** any alias is removed, and the export-smoke gate proves it.

**Concrete "done" (full end-state, Phase 3 landed):**
- `npx turbo run build` cold-builds all 9 packages in topological order to `packages/*/dist/**`; `npx turbo run typecheck` is green.
- Every path referenced by every package's `exports` (`.` and, for devices/transcode, `./service`; both `import` and `types` conditions) **exists** after a cold build — enforced by `npm run check:exports`.
- CI (`.github/workflows/reusable-ci-tests.yml`, both `validate-linux` and `validate-linux-arm64`) runs `npm run build:packages` + `npm run check:exports` + `npm run typecheck:packages` in place of the two ad-hoc per-package build steps; a standalone-build / boundary / **missing-export-artifact** regression in **any** package fails CI.
- `vite.config.js` contains **zero** `@prismgb/*` aliases in all three build targets; the app build/dev/runtime resolves `@prismgb/*` via `node_modules` → each package's `exports`/`dist`.
- `npm run dev`, `npm run build:vite`, `npm run dev:smoke`, `npm run test:e2e` all run `turbo run build` first (via `pre*` hooks) so they never consume stale/missing `dist`.
- `dev:smoke` remains the runtime boot gate and is **green consuming dist**; `test:e2e` (86 Playwright tests) green.

**Owner stop-point (the recommendation's "for now" hedge, made explicit):** Completing **Phase 1 + Phase 2** already achieves the stated *goal of this plan* — "a package's standalone-build / export-artifact / boundary regression is CAUGHT, not hidden by src-aliasing" — with near-zero risk, because the turbo + export-smoke CI gate now builds every package standalone and proves its declared exports exist. **Phase 3 (the vite resolution-model flip) is the only part that touches the app's runtime resolution and is the only high-risk part.** It is included because the LOCKED DECISION and this plan's title both mandate "retire src-aliasing," but it is structured as a separate, separately-revertible branch increment so the owner may legitimately defer it after Phase 2 lands. If deferred, Section 8 records exactly what remains.

---

## 1. Preconditions

Before starting, the executor MUST perform (do not assume), **in order**:

1. **Base branch & clean tree.** Switch to the base branch unconditionally (do **not** assert the current branch — HEAD may be any prior plan's branch), then confirm no **tracked** changes are pending. Untracked planning markdown (`scratch-plan-*.md`, `docs/plan-*.md`) is permitted and out of scope — do not commit, stash, or delete it.
   ```
   git fetch origin
   git checkout refactor/codebase_reduction
   git pull --ff-only origin refactor/codebase_reduction
   git status --short --untracked-files=no    # MUST be empty (no modified/staged tracked files)
   ```
2. **This plan runs on its OWN branch off the base.** Create it now:
   ```
   git checkout -b refactor/plan-02-build-model refactor/codebase_reduction
   ```
3. **Toolchain present.** `npx turbo --version` resolves (turbo `^2.9.16` is in root `devDependencies`). `node -v` ≥ 22.
4. **Dependencies installed.** `ls node_modules/@prismgb` shows symlinks `config core devices events gpu ipc notes transcode updates` → all 9 workspaces linked. If not: `npm ci`.
5. **`dist/` and `.turbo/` are gitignored** — confirm `git check-ignore packages/prismgb-core/dist` prints the path and `.gitignore` contains `dist/` and `.turbo/`. Removing/rebuilding `packages/*/dist` therefore never dirties the tree.
6. **No prior plan landed is required.** Plan 02 depends on nothing but the base branch state described here. (UI/signals/shell plans are independent.)

---

## 2. Locked Decisions (restated, do not re-open)

- **Base branch is `refactor/codebase_reduction`.** Each plan executes on its own branch off that base, gated, then squash-merged.
- **`@prismgb/core` stays dependency-free and standalone-buildable** (publishable). Never add a runtime dep or a `window`/DOM/Node import to core. (Phase 1 touches `ipc`, `transcode`, and the **build configs** of `devices`/`transcode`; it does **not** touch core.)
- **Build-model end-state** = packages build to `dist` via turbo, app consumes built artifacts, turbo wired into CI; **retire the `@prismgb/*->src` vite aliasing**. `dev:smoke` stays the runtime boot gate.
- The locked-decision wording is **"retire the `@prismgb/*->src` *vite* aliasing"**: Phase 3 removes the aliases from **`vite.config.js` only**. `vitest.config.js` and `tsconfig.*.json` deliberately **retain** their `@prismgb/*->src` paths so unit tests and app typecheck run against package **source** (fast, and stricter than checking against emitted `.d.ts`); standalone-build + export-artifact correctness is owned by the Phase 2 turbo + export-smoke CI gate. Tightening vitest/tsconfig to dist is explicitly **out of scope** (Section 8).
- **Device manifest/registry seam = KEEP.** Not touched by this plan.

---

## 3. Current-State Facts (verified this session — executor MUST re-verify before acting)

> Re-verify each with the listed command; **line numbers drift** as files change, so every edit below is specified by **exact string match**, not by line number.

### 3.1 turbo.json is already correct — verify, do not edit in Phases 1–2
`cat turbo.json`:
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build":     { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "lint":      { "outputs": [] }
  }
}
```
`build` already has `"dependsOn": ["^build"]` and `"outputs": ["dist/**"]`; `typecheck` already has `"dependsOn": ["^build"]`. **No change required.** Re-verify: `grep -A2 '"build"' turbo.json`.

### 3.2 Scripts already exist in root package.json — verify
- `"build:packages": "turbo run build"`
- `"typecheck:packages": "turbo run typecheck"`
Re-verify: `grep -E '"(build:packages|typecheck:packages)"' package.json`. (`check:exports` does **not** exist yet — Phase 1 adds it.)

### 3.3 turbo is ORPHANED — not referenced in any workflow/hook
`grep -rl turbo .github .husky` → **no matches**. CI ad-hoc-builds only gpu + core.

### 3.4 Each package builds `vite build && tsc --emitDeclarationOnly`; cross-package deps are externalized in vite, resolved via workspace symlink in tsc
Per-package `build` script (verify `grep -r '"build"' packages/*/package.json`): all nine = `"vite build && tsc --emitDeclarationOnly"`. Each `vite.config.{js,ts}` externalizes its `@prismgb/*` deps (so the vite step needs no sibling dist), but `tsc --emitDeclarationOnly`/`tsc --noEmit` resolves `@prismgb/*` via `node_modules/@prismgb/<x>` → its `package.json` `"types": "./dist/index.d.ts"`. **Therefore a package's `dist/*.d.ts` must exist before any dependent package's tsc runs — exactly what `dependsOn: ["^build"]` enforces.**

### 3.5 THE LATENT CYCLE FAILURE — `ipc↔transcode` type/value cycle (empirically reproduced this session)
- `packages/prismgb-ipc/src/preload-api.contract.ts:2` → `import type { TranscodeFormatKey } from '@prismgb/transcode';`
- `packages/prismgb-transcode/src/transcode.service.ts:11` → `import { IPC_CHANNELS } from '@prismgb/ipc';`
- `@prismgb/ipc/package.json` declares **only** `@prismgb/config` as a dep — it does **not** declare `@prismgb/transcode`. `@prismgb/transcode/package.json` declares `@prismgb/ipc`.

So the **declared** graph is `config → ipc → transcode`, but the **real import** graph has `ipc → transcode` (type-only) on top, i.e. a cycle. turbo orders ipc **before** transcode; ipc's `tsc --emitDeclarationOnly` then needs `transcode/dist/index.d.ts`, which does not exist yet.

**Reproduced (this session):**
```
rm -rf packages/*/dist .turbo
npx turbo run build
# → @prismgb/ipc:build: src/preload-api.contract.ts(2,41): error TS2307:
#     Cannot find module '@prismgb/transcode' or its corresponding type declarations.
# → Tasks: 4 successful (core, gpu, config, events), Failed: @prismgb/ipc#build
```
This is masked today because **stale `packages/*/dist` dirs exist locally** and **CI only builds gpu+core** (both leaves). `ipc → transcode` is the **only** undeclared cross-package import (verified: `for d in packages/prismgb-*; do grep -rhoE "from '@prismgb/[a-z]+'" $d/src | sort -u; done` vs each `package.json` deps — every other import is declared).

`TranscodeFormatKey` is the sole offending symbol; its only use in ipc is `packages/prismgb-ipc/src/preload-api.contract.ts:63` → `export type TranscodeFormat = TranscodeFormatKey;`. It is defined in `packages/prismgb-transcode/src/transcode.config.ts:69` as `keyof typeof TRANSCODE_CONFIG.formats`, whose keys are exactly **`webm | mp4 | mov`** (the `TRANSCODE_CONFIG.formats` literal at `transcode.config.ts:57-61`). Re-verify the exact lines: `grep -nE "export const TRANSCODE_CONFIG|webm:|mp4:|mov:|^export type TranscodeFormatKey" packages/prismgb-transcode/src/transcode.config.ts`.

### 3.6 THE BROKEN `./service` SUBPATH EXPORTS — `dist/service.js` is never emitted (empirically reproduced this session)
- Both `packages/prismgb-devices/package.json` and `packages/prismgb-transcode/package.json` declare:
  ```json
  "./service": { "import": "./dist/service.js", "types": "./dist/service.d.ts" }
  ```
- Both `packages/prismgb-{devices,transcode}/vite.config.ts` build a **single** entry — `lib.entry: resolve(__dirname, 'src/index.ts')`, `fileName: 'index'`, `rollupOptions.output.preserveModules: false` — so the vite step emits only `dist/index.js`. The `tsc --emitDeclarationOnly` step emits `dist/service.d.ts` (a `.d.ts`, no `.js`). **No path in the current build produces `dist/service.js`.**
- Main process imports the subpaths as value imports (so they need the runtime `.js`): `src/main/application/container.ts:13-16,19`. (`src/main/application/app.orchestrator.ts:14-21` imports them `import type`, which is erased and does not need the `.js`.)

**Reproduced (this session):**
```
npm run build --workspace=@prismgb/devices && ls packages/prismgb-devices/dist/*.js
# → dist/index.js   (no dist/service.js)
node --input-type=module -e "import('@prismgb/devices/service')"
# → ERR_MODULE_NOT_FOUND: .../@prismgb/devices/dist/service.js   (same for @prismgb/transcode/service)
```
Masked today only by the vite `@prismgb/devices/service` / `@prismgb/transcode/service` src-aliases (§3.7). Phase 1(b) fixes the build to emit `dist/service.js`; Phase 1(c)'s export-smoke proves it. Re-verify the single-entry configs: `grep -nE "entry:|fileName:|preserveModules" packages/prismgb-devices/vite.config.ts packages/prismgb-transcode/vite.config.ts`.

### 3.7 The vite `@prismgb/*` alias blocks (THREE) — Phase 3 targets; counts are 11 / 11 / 9
`grep -n "@prismgb/" vite.config.js` (total **31** `@prismgb/*` alias lines):
- **Main-process build target**, `electron([{ … vite: { resolve: { alias: {…} }}}])` (`alias: {` at line ~38): **11** `@prismgb/*` entries (gpu, core, events, config, ipc, **devices/service**, devices, **transcode/service**, transcode, updates, **notes**). The two `/service` **subpath** aliases are here.
- **Preload build target** (`alias: {` at line ~86): **11** `@prismgb/*` entries — the same set, including the two `/service` subpaths.
- **Top-level renderer `resolve.alias`** (`resolve: {` at line ~159): **9** `@prismgb/*` entries (gpu, core, events, config, ipc, devices, transcode, updates, notes). **No `/service` subpaths** here.

> The earlier draft's "10 / 10 / 8" counts were wrong; `@prismgb/notes` is the consistently-uncounted entry in each block. Phase 3 deletes by the **grep gate** (`grep -n "@prismgb/" vite.config.js` → no matches), not by stated count — but the corrected counts are 11 / 11 / 9. Re-verify: `grep -c "@prismgb/" vite.config.js` → `31`.

### 3.8 vitest + tsconfig src-aliasing — Phase 3 LEAVES THESE
- `vitest.config.js`: `sharedAlias` (`@prismgb/*` entries, includes `/service` subpaths) used by all projects except `gpu-package` (which aliases only `@`). **Retained in Phase 3.** Re-verify `grep -n "@prismgb/" vitest.config.js`.
- `tsconfig.base.json` and `tsconfig.app.json` both carry `@prismgb/* -> ./packages/prismgb-*/src` in `paths`. **Retained in Phase 3.** Re-verify `grep -n "@prismgb/" tsconfig.app.json tsconfig.base.json`.

### 3.9 CI: the two ad-hoc per-package build steps — Phase 2 targets
`.github/workflows/reusable-ci-tests.yml` has the identical pair in **two** jobs:
- `validate-linux` (after "Run linter", before "Run typecheck"):
  ```yaml
      - name: Build GPU package types
        run: npm run build --workspace=@prismgb/gpu
      - name: Build Core package types
        run: npm run build --workspace=@prismgb/core
  ```
- `validate-linux-arm64` (after "Check native packaging ABI", before "Run typecheck"): the **same two steps**.
- `validate-matrix` (macos/windows) has **neither** — leave it untouched.
Re-verify: `grep -n "Build GPU package types\|Build Core package types\|workspace=@prismgb" .github/workflows/reusable-ci-tests.yml`.

### 3.10 `clean:build` does NOT remove `packages/*/dist` — Phase 3-safe
`scripts/clean-generated.js` `BUILD_OUTPUT_PATHS` = root-level `dist`, `release`, `build`, `out` (resolved from PROJECT_ROOT). It never touches `packages/*/dist`. So a `prebuild:vite → turbo run build` hook survives `build:vite`'s internal `clean:build`. Re-verify: `grep -n "path:" scripts/clean-generated.js`.

### 3.11 e2e count, scripts, module type — verified
- `npm run test:e2e` runs **86 Playwright tests in 6 files** (single `electron` project, no per-browser fan-out). **Authoritative source = `npx playwright test --list` → `Total: 86 tests in 6 files`** (a static `grep "test("` undercounts to 78 because 8 tests are generated dynamically — do not use grep to count e2e). `test:e2e` = `npm run build:vite && npm run test:e2e:built`; `test:e2e:built` = `playwright test` (a direct escape hatch that expects an already-built app — it does **not** itself run `build:vite`).
- Root `package.json` is `"type": "module"`; `scripts/*.js` are ESM (`import`/`export`). The new export-smoke script is therefore `scripts/check-package-exports.js`.
- All 9 packages use object-form `exports` with `import` + `types` conditions; only `devices` and `transcode` declare a `./service` subpath.

### 3.12 Minor / informational
- `packages/prismgb-config/vite.config.ts` externalizes `'joi'`, but the package depends on `zod` (joi is not imported). **Stale, harmless — do NOT fix in this plan** (scope creep).
- `dev:smoke` (`scripts/dev-boot-smoke.js`) boots `npm run dev` (vite) → today resolves `@prismgb/*` via src-aliasing; after Phase 3 it resolves via dist, which is exactly why it becomes the dist-resolution boot gate.

---

## 4. Phased Implementation

> Conventions for every commit: clean conventional message, **subject ≤100 chars**, **NO** AI/tool attribution. **NEVER** `--no-verify` (husky pre-commit runs full `npm run test:run`). No inline comments (JSDoc only). Strict types, no `any`.

---

### Phase 1 — Make every package build standalone AND emit its declared exports

**Objective:** the cold `turbo run build` (Phase 2's CI gate) must (a) not fail on the `ipc↔transcode` cycle (§3.5) and (b) actually emit the `dist/service.js` files the `./service` exports promise (§3.6), and (c) be guarded by an export-smoke check. **Two commits** (cycle-break, then service-emit + export-smoke), one combined gate. All edits are LOW risk: two type-only relocations + two additive build-config edits + one new validation script.

#### Commit 1A — Break the `ipc↔transcode` standalone-build cycle

**Design:** the wire-contract format-key union is owned by the **contract** package (`@prismgb/ipc`); the implementation (`@prismgb/transcode`, which already depends on ipc) conforms to it. This removes ipc's import of transcode (breaking the cycle) and makes drift impossible via a `Record<TranscodeFormat, …>` constraint. **Type-only, behavior-preserving** — both `TranscodeFormat` (from ipc) and `TranscodeFormatKey` (from transcode) still resolve to `'webm' | 'mp4' | 'mov'` for every consumer.

**Step 1A.1 — `packages/prismgb-ipc/src/preload-api.contract.ts`** (remove the transcode import; inline the union)

Delete this line (the second import):
```ts
import type { TranscodeFormatKey } from '@prismgb/transcode';
```
Replace this line:
```ts
export type TranscodeFormat = TranscodeFormatKey;
```
with:
```ts
export type TranscodeFormat = 'webm' | 'mp4' | 'mov';
```

**Step 1A.2 — `packages/prismgb-transcode/src/transcode.config.ts`** (import the contract type; conform to it, drift-safe)

Add as the **first line of the file** (before `type TranscodeFormatConfig = …`):
```ts
import type { TranscodeFormat } from '@prismgb/ipc';
```
Replace this exact block:
```ts
export const TRANSCODE_CONFIG = Object.freeze({
  formats: Object.freeze({
    webm: FORMAT_WEBM,
    mp4: FORMAT_MP4,
    mov: FORMAT_MOV
  }),

  defaultFormat: 'mp4',
  tempPrefix: 'prismgb-transcode-',
  progressIntervalMs: 100,
  probeDurationTimeoutMs: 10000
} as const);

export type TranscodeFormatKey = keyof typeof TRANSCODE_CONFIG.formats;
```
with:
```ts
const TRANSCODE_FORMATS: Readonly<Record<TranscodeFormat, TranscodeFormatConfig>> = Object.freeze({
  webm: FORMAT_WEBM,
  mp4: FORMAT_MP4,
  mov: FORMAT_MOV
});

export const TRANSCODE_CONFIG = Object.freeze({
  formats: TRANSCODE_FORMATS,

  defaultFormat: 'mp4',
  tempPrefix: 'prismgb-transcode-',
  progressIntervalMs: 100,
  probeDurationTimeoutMs: 10000
} as const);

export type TranscodeFormatKey = TranscodeFormat;
```
(`Record<TranscodeFormat, …>` forces the formats object to contain exactly `webm`/`mp4`/`mov`; if a contract format is added/removed in ipc, transcode fails to compile — drift is caught.)

> **Do NOT touch the local alias in a *different* file:** `packages/prismgb-transcode/src/transcode.service.ts:91` declares its own file-local `type TranscodeFormatKey = keyof typeof TRANSCODE_CONFIG.formats;`. Leave it untouched — `keyof` of the now-`Record`-typed `formats` still yields the same `'webm' | 'mp4' | 'mov'` union, so it continues to compile. This instruction applies **only** to the `transcode.service.ts` file's local alias; the **exported** alias being replaced lives in `transcode.config.ts` (Step 1A.2 above) — they share a name but are distinct symbols in distinct files.

**Commit 1A:**
```
git add packages/prismgb-ipc/src/preload-api.contract.ts packages/prismgb-transcode/src/transcode.config.ts
git commit -m "refactor(build): own TranscodeFormat in @prismgb/ipc to break ipc/transcode build cycle"
```

#### Commit 1B — Emit `dist/service.js` for devices & transcode; add the export-smoke gate

**Design:** add `src/service.ts` as a **second** vite library entry in both packages so the build emits `dist/service.js` alongside `dist/index.js`, finally making the declared `./service` `import` condition resolve. Then add a node-only, file-existence **export-smoke** script that asserts every declared `exports` target exists after a build. Both edits are additive and leave `dist/index.js` (the barrel) byte-for-byte equivalent.

**Step 1B.1 — `packages/prismgb-devices/vite.config.ts`** — replace the `lib` block (drop `name`/`fileName: 'index'`, use a two-entry object + a `fileName` function). Keep the existing `rollupOptions.external` array, `sourcemap`, `minify`, and `resolve.alias` exactly as they are.

Replace:
```ts
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PrismGBDevices',
      fileName: 'index',
      formats: ['es']
    },
```
with:
```ts
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        service: resolve(__dirname, 'src/service.ts')
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    },
```

**Step 1B.2 — `packages/prismgb-transcode/vite.config.ts`** — the identical `lib`-block replacement (keep transcode's own `external` array etc.):

Replace:
```ts
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'PrismGBTranscode',
      fileName: 'index',
      formats: ['es']
    },
```
with:
```ts
    lib: {
      entry: {
        index: resolve(__dirname, 'src/index.ts'),
        service: resolve(__dirname, 'src/service.ts')
      },
      formats: ['es'],
      fileName: (_format, entryName) => `${entryName}.js`
    },
```

> **Expected harmless side effect (do not be alarmed):** because `@prismgb/devices`'s barrel and service share modules, rollup hoists a small **hashed shared chunk** into `dist/` (this session: `device-iterator.utils-<hash>.js`). It is referenced by `index.js`/`service.js` via relative import and is covered by the package's `"files": ["dist"]`, so resolution/publishing is unaffected and the export-smoke (which checks the `exports` targets, not chunk files) is unaffected. `@prismgb/transcode` emitted no extra chunk this session.

**Step 1B.3 — add `scripts/check-package-exports.js`** (new file, ESM, node-only, **file-existence** based)

> **Why file-existence, not runtime `import()`:** a runtime-import smoke is unreliable under bare `node` — e.g. `@prismgb/updates` throws at module-eval because it touches electron-only globals, a false failure unrelated to export correctness. File-existence deterministically catches the real defect (a declared `exports` target that the build never emitted) with zero electron/native dependence. The authoritative **runtime** resolution gate remains `dev:smoke` (real electron) in Phase 3.

Create `scripts/check-package-exports.js`:
```js
/**
 * Export smoke gate: asserts every path referenced by each workspace package's
 * `exports` map (the `import` and `types` conditions of every subpath) exists on
 * disk after a build. Catches a declared export whose target artifact the build
 * never emitted (e.g. a `./service` subpath pointing at a non-emitted dist file).
 * Run after `npm run build:packages`. Exits non-zero on any missing target.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const PACKAGE_NAMES = [
  'config',
  'core',
  'devices',
  'events',
  'gpu',
  'ipc',
  'notes',
  'transcode',
  'updates'
];

const EXPORT_CONDITIONS = ['import', 'types'];

const collectMissingTargets = () => {
  const missing = [];
  for (const packageName of PACKAGE_NAMES) {
    const manifestPath = resolve(PROJECT_ROOT, `packages/prismgb-${packageName}/package.json`);
    const packageDir = dirname(manifestPath);
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const exportsMap = manifest.exports ?? {};
    for (const [subpath, conditions] of Object.entries(exportsMap)) {
      for (const condition of EXPORT_CONDITIONS) {
        const target = conditions[condition];
        if (!target) {
          continue;
        }
        if (!existsSync(resolve(packageDir, target))) {
          missing.push(`${manifest.name} "${subpath}".${condition} -> ${target}`);
        }
      }
    }
  }
  return missing;
};

const missingTargets = collectMissingTargets();
if (missingTargets.length > 0) {
  console.error('Export smoke FAILED — declared export targets missing after build:');
  for (const entry of missingTargets) {
    console.error(`  ${entry}`);
  }
  process.exit(1);
}

console.log(`Export smoke OK — all declared export targets exist for ${PACKAGE_NAMES.length} packages.`);
```
> This handles the object-form `exports` conditions used by all 9 current packages. If a future package adds a string-form or nested-conditional export, extend this script accordingly (out of scope here).

**Step 1B.4 — add the `check:exports` root script (`package.json`)** — place it adjacent to `build:packages`/`typecheck:packages`:
```json
    "check:exports": "node scripts/check-package-exports.js",
```

**Commit 1B:**
```
git add packages/prismgb-devices/vite.config.ts packages/prismgb-transcode/vite.config.ts scripts/check-package-exports.js package.json
git commit -m "build(packages): emit dist/service.js for devices/transcode and add export-smoke gate"
```

#### Step 1.GATE — combined Phase 1 gate (run in order; all must pass)
```
rm -rf packages/*/dist .turbo
npx turbo run build            # EXPECT: Tasks: 9 successful, 9 total   (was: Failed @prismgb/ipc#build)
npx turbo run typecheck        # EXPECT: all tasks successful
npm run check:exports          # EXPECT: "Export smoke OK ... for 9 packages."
ls packages/prismgb-devices/dist/service.js packages/prismgb-transcode/dist/service.js   # EXPECT: both present
npm run typecheck              # app: typecheck:app + :tests + :gpu + :core all green
npm run lint                   # eslint + check-layer-boundaries.js
npm run test:run               # full vitest (also runs in husky pre-commit)
npm run dev:smoke              # runtime boot gate (still src-aliased here — must boot)
```
> **Session-verified (assert):** the cold `rm -rf packages/*/dist .turbo && npx turbo run build` went from `Failed @prismgb/ipc#build` to **`9 successful, 9 total`**; `npx turbo run typecheck` → **13 successful**; `npm run check:exports` → **all declared export targets exist** (both `dist/service.js` files emitted); `node` resolves `@prismgb/devices/service` (`DeviceBridgeService,…`) and `@prismgb/transcode/service` (`TranscodeService`).
> **Gates to run (not yet session-verified this revision):** `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run dev:smoke`. The Phase-1 edits are type-preserving and additive, so these are expected green, but the executor MUST run them and not assume.
> `test:e2e` is **not** required for Phase 1 (no DI/IPC-runtime/renderer-resolution change — only a type-alias relocation and a package-build-output addition), but is harmless to run if time permits.

---

### Phase 2 — Wire turbo + export-smoke into CI (the adopted-model milestone)

**Why:** make a standalone-build, **missing-export-artifact**, or boundary regression in **any** of the 9 packages fail CI — replacing the ad-hoc gpu+core builds (§3.9). `turbo run build` builds every package standalone in topo order; `check:exports` proves each declared export's artifact exists; any package that does not build standalone (or imports an undeclared sibling, or under-emits its exports) fails. Vite src-aliasing is untouched here, so app build/dev/test are unaffected — **near-zero risk**.

#### Step 2.1 — `.github/workflows/reusable-ci-tests.yml`, job `validate-linux`
Replace the two steps:
```yaml
      - name: Build GPU package types
        run: npm run build --workspace=@prismgb/gpu

      - name: Build Core package types
        run: npm run build --workspace=@prismgb/core
```
with:
```yaml
      - name: Build all workspace packages (turbo, topological)
        run: npm run build:packages

      - name: Validate package export artifacts
        run: npm run check:exports

      - name: Typecheck all workspace packages (turbo)
        run: npm run typecheck:packages
```

#### Step 2.2 — `.github/workflows/reusable-ci-tests.yml`, job `validate-linux-arm64`
Apply the **identical** three-step replacement to the same two steps in `validate-linux-arm64` (they sit between "Check native packaging ABI" and "Run typecheck").

> Keep `validate-matrix` (macos/windows) untouched — it never built packages.
> Steps-in-place (not a new dedicated job) is chosen deliberately to minimize workflow churn on the highest-risk plan. (Alternative: a standalone `validate-packages` job that other jobs `needs:` — more isolation, more YAML; not adopted.)
> Optional CI speedup (not required): cache `.turbo/` via `actions/cache` keyed on package sources. Skip unless build time is a problem.

#### Step 2.3 — GATE
- **Local sanity** (CI runs these verbatim) — make it **cold** so a stale local `dist` cannot mask a CI-only failure:
  ```
  rm -rf packages/*/dist .turbo
  npm run build:packages        # EXPECT: 9 successful
  npm run check:exports         # EXPECT: Export smoke OK ... for 9 packages.
  npm run typecheck:packages    # EXPECT: green
  ```
- **Workflow well-formedness + step presence** (primary, tool-free): re-grep to confirm the old steps are gone and the new ones present.
  ```
  grep -n "build:packages\|check:exports\|typecheck:packages\|workspace=@prismgb/gpu\|workspace=@prismgb/core" .github/workflows/reusable-ci-tests.yml
  # EXPECT: build:packages x2, check:exports x2, typecheck:packages x2, and ZERO workspace=@prismgb/{gpu,core} matches
  ```
  Also `git diff --check` (whitespace/conflict-marker sanity). If `actionlint` is available (`brew install actionlint`), optionally `actionlint .github/workflows/reusable-ci-tests.yml`. Do **not** rely on `npx yaml-lint` — it is not a maintained validator; the re-grep + `git diff --check` is the required gate.
- **No app gates needed** (no app source changed). `npm run test:run` still runs in husky pre-commit on the commit below.

#### Step 2.4 — Commit
```
git add .github/workflows/reusable-ci-tests.yml
git commit -m "ci(build): build+export-smoke+typecheck all packages via turbo, replacing ad-hoc gpu/core builds"
```

> **Checkpoint.** After Phase 2 squash-merges, the *goal of this plan is met* (standalone-build / export-artifact / boundary regressions are now CAUGHT in CI). Phase 3 is the locked-decision completion (retire vite src-aliasing) and is the only high-risk part. Proceed to Phase 3 unless the owner defers (Section 8).

---

### Phase 3 — Retire `@prismgb/*->src` vite aliasing; app consumes `dist`

**Why:** the shipped/dev app must resolve `@prismgb/*` from built artifacts (the publishable/extractable end-state). **Highest blast radius** — gate on a **cold** rebuild + `dev:smoke` **and** `test:e2e`.

**Scope (locked-decision wording):** edit **`vite.config.js` and `package.json` only**. Leave `vitest.config.js` and `tsconfig.*.json` src-aliased (§3.8, Section 2).

#### Step 3.1 — Add turbo build pre-hooks to the vite-driven scripts (`package.json`)
Once vite aliases are gone, vite resolves `@prismgb/*` from `dist`, so `dist` must exist first. Add `pre*` scripts (npm auto-runs `pre<name>` before `<name>`):
- Add `"predev": "turbo run build"` (covers `npm run dev` and, transitively, `npm run dev:smoke` which spawns `npm run dev`).
- Add `"prebuild:vite": "turbo run build"` (covers `build:vite` and everything that calls it: `build`, `build:mac/win/linux`, and `test:e2e` — which runs `build:vite` then `test:e2e:built`).

> `prebuild:vite` runs **before** `build:vite` (`clean:build && vite build`); `clean:build` only wipes root `dist`/`release`/`build`/`out` (§3.10), never `packages/*/dist`, so the freshly-built package dist survives. turbo is cache-fast (`>>> FULL TURBO` warm), so the hook adds negligible latency.
> **`test:e2e:built` has no pre-hook by design** — it is the direct "app is already built" escape hatch (`playwright test`); only `test:e2e` (which wraps `build:vite`) gets the fresh-dist guarantee. Do not add a hook to `test:e2e:built`.
> Do **not** add a hook to `test:run`/`typecheck` — they keep src-aliasing (vitest/tsconfig), so they need no dist.

Resulting additions (place near the existing `dev` / `build:vite` entries):
```json
    "predev": "turbo run build",
    "prebuild:vite": "turbo run build",
```

#### Step 3.2 — `vite.config.js`: delete all `@prismgb/*` aliases in all three blocks
Remove every `@prismgb/*` line (keep `@`, `@main`, `@renderer`, `@preload`, `@shared`, and the `url: 'url/'` polyfill). The counts are a guide; the **grep gate** below is the source of truth:
- **Main-process block** (`alias: {` ~line 38): delete all **11** `@prismgb/*` entries (including `@prismgb/devices/service`, `@prismgb/transcode/service`).
- **Preload block** (`alias: {` ~line 86): delete all **11** `@prismgb/*` entries (including the two `/service` subpaths).
- **Top-level renderer `resolve.alias`** (`resolve: {` ~line 159): delete all **9** `@prismgb/*` entries.

After the edit:
```
grep -n "@prismgb/" vite.config.js     # EXPECT: no matches (was 31)
```
Resolution now flows through `node_modules/@prismgb/<x>` → `package.json` `exports`. The `./service` subpaths (devices, transcode) now resolve to `dist/service.js`, which exists thanks to Phase 1(b) and is proven by `check:exports`.

#### Step 3.3 — COLD rebuild, then GATE (full, hard)
Run from a clean dist to mirror a fresh CI checkout (a stale local `dist/service.js` must not mask a cold failure):
```
rm -rf packages/*/dist .turbo
npm run build:packages                 # populate packages/*/dist (9 successful)
npm run check:exports                  # all declared export targets exist (incl. both dist/service.js)
npm run dev:smoke                       # CRITICAL: boot must succeed consuming dist
                                        #   (predev → turbo run build also runs automatically; cache-warm)
npm run build:vite                      # app bundle must build resolving @prismgb/* from dist
                                        #   (prebuild:vite → turbo run build runs automatically)
npm run typecheck                       # still green (tsconfig still src-aliased)
npm run test:run                        # still green (vitest still src-aliased)
npm run lint
npm run test:e2e                        # REQUIRED: 86 Playwright tests (renderer-resolution change)
```
**Interpretation:**
- `dev:smoke` failing with a module-resolution error for `@prismgb/*` → a package's `dist`/`exports` is wrong, or a subpath (`/service`) is imported but not emitted/exported. Inspect the failing import; confirm the package's `package.json` `exports` covers it and `check:exports` is green. Do **not** re-add a vite alias to paper over it — fix the package's `exports`/`dist` (the `/service` class of failure is exactly what Phase 1(b) prevents).
- `build:vite` failing on `@prismgb/*` resolution → same root cause; verify `prebuild:vite` actually ran (`packages/*/dist` present). The CI "Run build smoke" step (`npm run build:vite`) also exercises this dist-resolution at the **bundler** level, giving partial CI coverage even though `dev:smoke`/`test:e2e` are local-only gates.
- `test:e2e` failing where unit tests pass → a real dist-vs-source divergence; that is precisely the regression class this plan exists to surface. Triage against the boot/IPC path; confirm the renderer bundle stays native-free (the barrel/`/service` split exists so node/native code never enters the renderer chunk).

#### Step 3.4 — Commit
```
git add vite.config.js package.json
git commit -m "build(vite): consume built @prismgb dist, drop src aliasing, add turbo pre-build hooks"
```

#### Step 3.5 — Merge
Open a PR `refactor/plan-02-build-model` → `refactor/codebase_reduction`; squash-merge after CI (now including `build:packages` / `check:exports` / `typecheck:packages`) is green. PR body must NOT contain AI/tool attribution.

> **Known-benign CI interaction (m3):** after Phase 3, `validate-linux` runs `npm run build:packages` (turbo) explicitly, then later the "Run build smoke" step (`npm run build:vite`) triggers `prebuild:vite → turbo run build` a **second** time. turbo's `.turbo/` cache is filesystem-local and persists across steps in the same job, so the second run is a `>>> FULL TURBO` cache hit (~seconds) — functionally safe. The explicit Phase 2 `build:packages` step is **kept** intentionally (it makes the gate explicit and runs `check:exports` against its output); do not remove it.

---

## 5. Gates & Verification

### 5.1 Gate matrix

| Gate | Command | Catches | P1 | P2 | P3 |
|------|---------|---------|----|----|----|
| Cold package build | `rm -rf packages/*/dist .turbo && npx turbo run build` | standalone-build / topo / undeclared-dep regressions | ✅ | ✅ (`build:packages`) | ✅ |
| **Export smoke** | `npm run check:exports` | declared `exports` target missing after build (e.g. `dist/service.js`) | ✅ | ✅ (CI) | ✅ |
| `dist/service.js` present | `ls packages/prismgb-{devices,transcode}/dist/service.js` | the §3.6 defect specifically | ✅ | — (subsumed by export smoke) | ✅ |
| Package typecheck | `npx turbo run typecheck` | per-package type errors against built deps | ✅ | ✅ (`typecheck:packages`) | ✅ |
| App typecheck | `npm run typecheck` | app/tests/gpu/core types (src-aliased) | ✅ | — | ✅ |
| Lint + boundaries | `npm run lint` | eslint + `check-layer-boundaries.js` | ✅ | — | ✅ |
| Full unit suite | `npm run test:run` | behavior (runs in husky pre-commit) | ✅ | ✅ (pre-commit) | ✅ |
| **Boot gate** | `npm run dev:smoke` | DI/boot/**package-resolution** (only gate that exercises real runtime resolution) | ✅ | — | ✅ **required** |
| App bundle | `npm run build:vite` | vite resolution of `@prismgb/*` from dist | — | — | ✅ |
| **E2E** | `npm run test:e2e` | renderer/IPC/DI integration (86 tests; count via `playwright test --list`) | — | — | ✅ **required** |

### 5.2 Failure interpretation
- **`turbo run build` fails on a package other than ipc** after Commit 1A → a *second* latent standalone-build failure (not seen this session; only `ipc→transcode` was undeclared). Identify the `TS2307`/missing-dep, then either declare the missing workspace dep in that package's `package.json` (if acyclic) or relocate the offending symbol to break a cycle (as Commit 1A did for ipc). Re-run the cold build until `9 successful`.
- **`check:exports` reports a missing target** → the package's build under-emits a declared export. Add the missing entry as a second `lib` entry (as Phase 1(b) did for `service`) or correct the package's `exports`. Never silence it by editing the script.
- **turbo reports a dependency cycle** → never resolve it by adding the reverse dep (that *is* the cycle); relocate the shared type to the lower layer, as in Commit 1A.
- **`dev:smoke` green but `test:e2e` red (Phase 3)** → genuine dist-vs-source divergence; this is the regression this plan is designed to expose — fix the package `dist`/`exports`, not a vite alias.

---

## 6. Risks, Mitigations & Rollback

| # | Risk | Likelihood | Blast radius | Mitigation | Rollback |
|---|------|-----------|--------------|------------|----------|
| R1 | Commit 1A type relocation changes a consumer's resolved type | Low | Compile errors across app | Behavior-preserving: both `TranscodeFormat` and `TranscodeFormatKey` still resolve to `'webm'\|'mp4'\|'mov'`; `Record<TranscodeFormat,…>` enforces parity. Gate = full `npm run typecheck` + `test:run`. (Cold `turbo run typecheck` verified green this session.) | `git revert` Commit 1A (2 files). |
| R2 | Commit 1B multi-entry vite change perturbs the barrel `dist/index.js` or emits an unexpected chunk | Low | Renderer/main bundles | The barrel output is unchanged (verified: `dist/index.js` identical size); devices emits one extra hashed shared chunk, covered by `"files": ["dist"]` and referenced via relative import. Gate = `check:exports` + `dev:smoke`. (Cold build + node-import of both `/service` subpaths verified this session.) | `git revert` Commit 1B (4 files). |
| R3 | A package other than ipc fails cold standalone build (newly surfaced) | Low | Phase 2 CI red on first run | Phase 1's cold `turbo run build` (run **before** any CI change) surfaces all such failures locally; fix before Phase 2. This session confirmed all 9 build after Commit 1A. | Keep ad-hoc gpu/core CI steps until the package is fixed; do not merge Phase 2 until `build:packages` + `check:exports` are green locally. |
| R4 | Phase 2 CI YAML malformed → whole CI broken | Low | All PRs blocked | Steps-in-place minimal diff; re-grep assertions + `git diff --check` (+ optional `actionlint`) in 2.3; the three scripts already exist and were run locally. | `git revert` the Phase 2 commit restores the exact prior two steps. |
| R5 | **Stale/missing dist after vite alias removal** (Phase 3) → app boots stale or fails to resolve | Medium | `dev`, `build`, `dev:smoke`, `e2e` | `predev`/`prebuild:vite` → `turbo run build` guarantee fresh dist before every vite invocation; Phase 3's gate is **cold** (`rm -rf packages/*/dist .turbo` first) so a stale local `dist` cannot mask a CI-clean failure; `dist`/`.turbo` gitignored so always rebuilt in CI; `clean:build` proven not to wipe `packages/*/dist`. Gate = `check:exports` + `dev:smoke` + `test:e2e`. | `git revert` the Phase 3 commit re-instates the three vite alias blocks and removes the pre-hooks in one step. |
| R6 | A `/service` subpath fails to resolve under `exports` (Phase 3) | Low (was the headline defect; now fixed + gated) | main-process boot | Phase 1(b) emits `dist/service.js`; `check:exports` proves both targets exist after every cold build; `dev:smoke` exercises the main-process boot path that imports them. The defect that made this risk real (no emitted `.js`) is eliminated before the alias is removed. | Same as R5 (revert Phase 3); forward-fix = ensure the package emits the subpath entry + `check:exports` green. |
| R7 | Phase 3 deferred by owner → end-state incomplete | Allowed | None (Phase 1+2 are self-consistent) | Phase 1+2 already meet the plan's *goal*; Section 8 records the residual. | n/a (nothing to roll back). |

**General rollback:** Phases 2 and 3 are exactly one commit each; Phase 1 is two independently-revertible commits (1A cycle-break, 1B service-emit+smoke). `git revert <sha>` restores the prior state with no manual surgery. Branches squash-merge to `refactor/codebase_reduction`; a bad merge is revertible there.

---

## 7. Done Criteria

- [ ] On branch `refactor/plan-02-build-model` off `refactor/codebase_reduction`; tree clean (no tracked changes) between phases; pre-existing untracked planning docs left as-is.
- [ ] **Phase 1:** `rm -rf packages/*/dist .turbo && npx turbo run build` → `9 successful, 9 total`; `npx turbo run typecheck` green; `npm run check:exports` → "Export smoke OK ... for 9 packages."; `ls packages/prismgb-{devices,transcode}/dist/service.js` → both present; `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run dev:smoke` green. `grep -n "@prismgb/transcode" packages/prismgb-ipc/src/preload-api.contract.ts` → no match. `scripts/check-package-exports.js` + root `check:exports` script exist. Two commits (1A, 1B).
- [ ] **Phase 2:** `reusable-ci-tests.yml` `validate-linux` **and** `validate-linux-arm64` each run `npm run build:packages` + `npm run check:exports` + `npm run typecheck:packages`; `grep "workspace=@prismgb/gpu\|workspace=@prismgb/core" .github/workflows/reusable-ci-tests.yml` → no match; `validate-matrix` unchanged. Cold `build:packages` + `check:exports` + `typecheck:packages` green locally. Committed.
- [ ] **Phase 3:** `grep -n "@prismgb/" vite.config.js` → no match; `package.json` has `predev` and `prebuild:vite` = `turbo run build`; `vitest.config.js` + `tsconfig.app.json` + `tsconfig.base.json` **retain** `@prismgb/*` paths. From cold (`rm -rf packages/*/dist .turbo`): `npm run dev:smoke` green **consuming dist**; `npm run build:vite` green; `npm run test:e2e` (86 tests, per `playwright test --list`) green; `npm run check:exports` + `npm run typecheck` + `npm run test:run` + `npm run lint` green. Committed.
- [ ] turbo.json unchanged across all phases (it was already correct).
- [ ] All commit subjects ≤100 chars, conventional, no AI/tool attribution; no `--no-verify` used.
- [ ] PR opened to `refactor/codebase_reduction`, CI (with the new turbo + export-smoke gate) green, squash-merged.

---

## 8. Out of Scope

This plan deliberately does **NOT**:
- Touch `@prismgb/core` source, deps, or its standalone-buildability (it already builds standalone).
- Remove `@prismgb/*->src` aliasing from **`vitest.config.js`** or **`tsconfig.{app,base}.json`** — tests and app typecheck stay on source by design (Section 2). Migrating those to dist is a separate, lower-value follow-up.
- Generalize `scripts/check-package-exports.js` beyond the object-form `exports` used by the current 9 packages (no string-form / nested-conditional / wildcard-subpath handling), nor add a bespoke "alias↔package parity" lint — the Phase 2 `turbo run build` + `check:exports` CI steps **are** the divergence guard.
- Change the renderer-safe barrel vs. `/service` split beyond emitting `dist/service.js` (i.e. do not move symbols between the barrel and the service entry).
- Fix the stale `'joi'` external in `packages/prismgb-config/vite.config.ts` (§3.12) — harmless, unrelated.
- Add turbo remote caching, a `turbo run lint` CI wiring, `.turbo` CI caching, or publish any package to a registry.
- Change the device manifest/registry seam, IPC contracts (beyond the Commit 1A type relocation), DI wiring, or any UI/signals/shell work (other plans).
- Convert the app to a TypeScript project-references build, or change electron-builder packaging.

**If the owner defers Phase 3** (legitimate stop after Phase 2): the residual is exactly — `vite.config.js` still src-aliases `@prismgb/*` (app build/dev/runtime consume **source**, not dist), so the app is not yet consuming built artifacts. The *validation* goal is already met (turbo + export-smoke CI catches standalone-build / export-artifact / boundary regressions, and `dist/service.js` is now genuinely emitted); only the *publishable-artifact-consumption* end-state remains. Re-entry = execute Phase 3 verbatim on a fresh branch off the then-current base.