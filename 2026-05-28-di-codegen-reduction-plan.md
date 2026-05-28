# DI Codegen Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the renderer DI layer's hand-maintained surface area — delete verified dead code, make the codegen script generic via a typed provider registry, and collapse each service's dependency list to a single source of truth — with zero behavior change.

**Architecture:** Three sequential phases (A1 dead code → A2 generic codegen + provider registry → A3 single source of truth). The existing suite (3061 tests / 155 files) is the behavior-preserving safety net; the generated `src/renderer/di.generated.ts` is diffed after regeneration to confirm runtime construction is unchanged. One commit per phase.

**Tech Stack:** TypeScript (legacy/experimental decorators), Vite + Vitest (both alias `@prismgb/core` → `packages/prismgb-core/src/index.ts`, so source edits need no package rebuild), Node TypeScript Compiler API in `scripts/generate-di.js`, ESLint + a custom layer-boundary checker.

**Source spec:** `2026-05-28-di-codegen-reduction-design.md` (repo root).

---

## Conventions used in every phase

- **Full suite:** `npm run test:run` (Vitest, runs against source; does **not** trigger the `pretest` hook).
- **Regenerate DI after touching the scanner, decorators, or `@Service` placement:** `node scripts/generate-di.js` (writes `src/renderer/di.generated.ts`). `npm run test:run` does **not** regenerate it; run the script explicitly.
- **Typecheck:** `npm run typecheck:core` (package) and `npm run typecheck:app` (app).
- **Lint:** `npm run lint` (ESLint + `scripts/check-layer-boundaries.js`).
- **Generated-diff gate:** after any regeneration, `git diff src/renderer/di.generated.ts` and confirm the change matches intent (no token's runtime construction altered except the intended structural change).
- **Decision (a) (from spec):** runtime dependency validation is dropped in A3; correctness is guaranteed by codegen + build-time validation.

---

## Phase A1 — Dead-Code Excision (LOW risk)

Removes three verified-unread constructs: the `@Inject` decorator, its `injectMetadata`, and the `serviceMetadata` write inside `@Service`. `@Service` is reduced to a pure build-time marker (the scanner reads it from the AST, never at runtime).

### Task 1: Add a guard test for the no-op `@Service` marker

**Files:**
- Test: `tests/unit/packages/core/di-decorators.test.ts` (create)

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import * as core from '@prismgb/core';
import { Service } from '@prismgb/core';

describe('@Service decorator (build-time marker)', () => {
  it('returns the class unchanged', () => {
    class Example {}
    const decorated = Service({ token: 'example' })(Example as never);
    expect(decorated).toBe(Example);
  });

  it('writes no runtime metadata onto the class', () => {
    class Example {}
    Service({ token: 'example', disposal: 'dispose' })(Example as never);
    expect((Example as Record<string, unknown>).serviceMetadata).toBeUndefined();
  });

  it('no longer exports an Inject decorator', () => {
    expect((core as Record<string, unknown>).Inject).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- tests/unit/packages/core/di-decorators.test.ts`
Expected: FAIL — `serviceMetadata` is currently defined (the decorator writes it) and `Inject` is currently exported.

- [ ] **Step 3: Rewrite the decorators module**

Replace the entire contents of `packages/prismgb-core/src/di/decorators.ts` with:

```typescript
/**
 * Dependency Injection Decorators
 */

export interface ServiceOptions {
  token?: string;
  lifecycle?: 'singleton' | 'transient';
  disposal?: 'dispose' | 'cleanup' | 'none';
  dependencies?: string[];
}

/**
 * Build-time marker annotating a class for DI registration. The options are
 * read from the TypeScript AST by `scripts/generate-di.js`; this decorator has
 * no runtime effect and returns the class unchanged.
 *
 * Usage:
 * @Service({ token: 'customToken', lifecycle: 'singleton', disposal: 'dispose' })
 * export class MyService {}
 */
export function Service(_options?: ServiceOptions): ClassDecorator {
  return (target) => target;
}
```

- [ ] **Step 4: Remove the `Inject` export from the core barrel**

In `packages/prismgb-core/src/index.ts:255`, change:

```typescript
export { Service, Inject } from './di/decorators.js';
```

to:

```typescript
export { Service } from './di/decorators.js';
```

Leave line 256 (`export type { ServiceOptions } ...`) unchanged.

- [ ] **Step 5: Verify no remaining references to the removed symbols**

Run:
```bash
grep -rn "Inject\b\|injectMetadata\|serviceMetadata" src packages scripts --include='*.ts' --include='*.js' | grep -v 'dist/'
```
Expected: only JSDoc-free source is left — **zero** matches in `src/`, `scripts/`, and `packages/*/src` (the only acceptable remaining hits are inside `packages/prismgb-core/dist/`, which is stale build output regenerated on the next package build). If any `.ts`/`.js` source still references `Inject`/`injectMetadata`/`serviceMetadata`, stop and resolve it before continuing.

- [ ] **Step 6: Run the guard test, then typecheck**

Run: `npm run test:run -- tests/unit/packages/core/di-decorators.test.ts`
Expected: PASS

Run: `npm run typecheck:core`
Expected: PASS (no usages of the removed `Inject` type/value).

- [ ] **Step 7: Regenerate DI and diff (sanity — should be unchanged)**

Run:
```bash
node scripts/generate-di.js
git diff --stat src/renderer/di.generated.ts
```
Expected: **no diff** to `di.generated.ts`. The scanner never read the removed runtime metadata, so the generated container is byte-identical. If there is a diff, stop and investigate.

- [ ] **Step 8: Full suite + lint**

Run: `npm run test:run`
Expected: PASS — 3061 tests / 155 files (plus the 3 new assertions).

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add packages/prismgb-core/src/di/decorators.ts packages/prismgb-core/src/index.ts tests/unit/packages/core/di-decorators.test.ts
git commit -m "refactor(di): excise dead @Inject/serviceMetadata, reduce @Service to a marker"
```

---

## Phase A2 — Generic Codegen + Declarative Provider Registry (MED risk)

Introduces `src/renderer/application/di/manual-providers.ts` (typed registry for the 9 non-standard-construction tokens) and `src/renderer/application/di/external-tokens.ts` (tokens registered at runtime, not constructed by the container), promotes `gpuFrameBuffer` and `animationCache` to `@Service` (standard construction), and rewrites `scripts/generate-di.js` so it carries no application class names or tokens.

**Governing invariant (from spec):** registration mechanism is chosen by *construction shape*, never by package location. Standard construction (`new X(cradle)` or `new X()`) → `@Service`; non-standard construction → a `manual-providers.ts` entry.

**Why `application/di/`, not `infrastructure/di/` (verified boundary fact):** the registry must import `UIComponentRegistry`/`rendererUiComponentDefinitions` from `presentation/controller/`. `scripts/check-layer-boundaries.js` forbids `RENDERER_INFRASTRUCTURE → RENDERER_PRESENTATION`, but `RENDERER_APPLICATION`'s forbidden set is `{CORE, RENDERER_ENTRY, RENDERER_BOOTSTRAP, MAIN_*}` — it may legally import both infrastructure and presentation. The DI composition root (`container.ts`) already lives in `application/`, so the registry belongs beside it. (The generated `renderer/di.generated.ts` dodges layering only because its path matches no layer prefix and is therefore unclassified.)

### Task 2: Create the typed manual-provider registry and external-token list

**Files:**
- Create: `src/renderer/application/di/manual-providers.ts`
- Create: `src/renderer/application/di/external-tokens.ts`
- Test: `tests/unit/renderer/application/di/manual-providers.test.ts` (create)

This registry holds the **9** tokens whose construction cannot be expressed as a plain scanned class. The bodies are transcribed verbatim from the current hand-written `case` blocks in `src/renderer/di.generated.ts` (lines 194–262, the 11 static cases ending at `animationCache`) so behavior is identical; only the location and typing change. `gpuFrameBuffer` and `animationCache` are deliberately **excluded** (they are promoted to `@Service` in Task 3). The other 53 `case` blocks in the generated file are scanned `@Service` classes (including `browserMediaService` → `new BrowserMediaAdapter()`) and are NOT touched.

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from 'vitest';
import { manualProviders } from '@renderer/application/di/manual-providers';

describe('manualProviders registry', () => {
  it('exposes exactly the nine non-standard-construction tokens', () => {
    expect(Object.keys(manualProviders).sort()).toEqual(
      [
        'adapterFactory',
        'canvasRenderLoopService',
        'deviceChangeDebounceAdapter',
        'deviceIpcAdapter',
        'deviceStatusProvider',
        'ipcClient',
        'storageService',
        'streamingRendererFactory',
        'uiComponentRegistry'
      ].sort()
    );
  });

  it('does NOT contain the promoted standard-construction tokens', () => {
    expect(manualProviders.gpuFrameBuffer).toBeUndefined();
    expect(manualProviders.animationCache).toBeUndefined();
  });

  it('every entry is a factory function taking a resolver', () => {
    for (const provider of Object.values(manualProviders)) {
      expect(typeof provider).toBe('function');
    }
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm run test:run -- tests/unit/renderer/application/di/manual-providers.test.ts`
Expected: FAIL — module does not exist yet.

- [ ] **Step 3: Create the registry**

Create `src/renderer/application/di/manual-providers.ts`. Transcribe each body from the current `di.generated.ts` cases. Import paths are relative to `src/renderer/application/di/`.

```typescript
import type { LoggerFactoryLike } from '@prismgb/core';
import { BrowserStorageAdapter } from '../../infrastructure/browser/browser-storage.adapter';
import { PROTECTED_STORAGE_KEYS } from '../../../shared/config/storage-keys.config.js';
import { DeviceIpcAdapter } from '../../infrastructure/adapters/device-ipc.adapter';
import { DeviceChangeDebounceAdapter } from '../../infrastructure/adapters/device-change-debounce.adapter';
import { StreamingCanvasRenderLoopService } from '../../infrastructure/services/canvas-render-loop.service';
import { StreamingRendererFactory } from '../../infrastructure/factories/streaming-renderer.factory';
import { StreamingGpuRendererAdapter } from '../../infrastructure/adapters/streaming-gpu-renderer.adapter';
import { StreamingCanvas2DRendererAdapter } from '../../infrastructure/adapters/streaming-canvas2d-renderer.adapter';
import { DeviceIpcStatusAdapter } from '../../infrastructure/adapters/device-ipc-status.adapter';
import { StreamingAdapterFactory } from '../../infrastructure/factories/streaming-adapter.factory';
import { DeviceChromaticAdapter } from '../../infrastructure/adapters/device-chromatic.adapter';
import { chromaticConfig } from '@prismgb/devices';
import { UIComponentRegistry } from '../../presentation/controller/component.registry';
import { rendererUiComponentDefinitions } from '../../presentation/controller/ui-component.catalog';

/** Resolver handed to each provider so it can pull already-registered tokens. */
export type ResolveFn = <T = unknown>(token: string) => T;

/** Constructs an instance for a token whose wiring is not plain `new X(cradle)`. */
export type ManualProvider = (resolve: ResolveFn) => unknown;

/**
 * Tokens whose construction is non-standard (global access, provider/adapter
 * maps, `initialize()` calls, derived named loggers, or config/positional
 * constructor args) and therefore cannot be expressed as a scanned `@Service`
 * class. Standard-construction classes use `@Service` instead.
 */
export const manualProviders: Record<string, ManualProvider> = {
  storageService: () =>
    new BrowserStorageAdapter({ protectedKeys: PROTECTED_STORAGE_KEYS }),

  deviceIpcAdapter: (resolve) =>
    new DeviceIpcAdapter({
      eventBus: resolve('eventBus'),
      logger: resolve<LoggerFactoryLike>('loggerFactory').create('DeviceIpcAdapter')
    }),

  deviceChangeDebounceAdapter: (resolve) =>
    new DeviceChangeDebounceAdapter({
      browserMediaService: resolve('browserMediaService'),
      logger: resolve<LoggerFactoryLike>('loggerFactory').create('DeviceChangeDebounceAdapter')
    }),

  canvasRenderLoopService: (resolve) =>
    new StreamingCanvasRenderLoopService(
      resolve<LoggerFactoryLike>('loggerFactory').create('StreamingCanvasRenderLoopService'),
      resolve('animationCache')
    ),

  streamingRendererFactory: (resolve) => {
    const rendererProviders = {
      gpu: (deps: unknown) => new StreamingGpuRendererAdapter(deps as never),
      canvas2d: (deps: unknown) => new StreamingCanvas2DRendererAdapter(deps as never)
    };
    const rendererFactory = new StreamingRendererFactory(
      resolve('eventBus'),
      resolve('loggerFactory'),
      rendererProviders as never
    );
    rendererFactory.initialize();
    return rendererFactory;
  },

  ipcClient: () => {
    const globalWindow = window as unknown as { deviceAPI?: unknown };
    if (!globalWindow.deviceAPI) {
      throw new Error(
        'deviceAPI is not available in the renderer. The preload script may have failed to load.'
      );
    }
    return globalWindow.deviceAPI;
  },

  deviceStatusProvider: (resolve) =>
    new DeviceIpcStatusAdapter(resolve('ipcClient')),

  adapterFactory: (resolve) => {
    const adapterClasses = new Map([[chromaticConfig.id, DeviceChromaticAdapter]]);
    const adapterFactory = new StreamingAdapterFactory(
      resolve('eventBus'),
      resolve('loggerFactory'),
      resolve('browserMediaService'),
      adapterClasses as never
    );
    adapterFactory.initialize();
    return adapterFactory;
  },

  uiComponentRegistry: (resolve) =>
    new UIComponentRegistry({
      componentDefinitions: rendererUiComponentDefinitions,
      loggerFactory: resolve('loggerFactory')
    })
};
```

> **Note on `as never` casts:** match the casting the current generated file uses for these constructions. If `npm run typecheck:app` reports a mismatch, prefer importing the real parameter type from the adapter/factory module over widening — do not introduce `any`.

- [ ] **Step 4: Create the external-token list**

Create `src/renderer/application/di/external-tokens.ts`. These tokens are registered at runtime via `container.register(...)` (e.g. `uiController` in `renderer-app.orchestrator.ts`), not constructed by the container. The codegen reads this list so it does not flag them as undeclared dependencies — keeping the script free of hardcoded application tokens.

```typescript
/**
 * DI tokens provided at runtime by bootstrap (`container.register(...)`) rather
 * than constructed by the generated container or a manual provider. The codegen
 * treats these as valid dependency targets.
 */
export const externallyRegisteredTokens: readonly string[] = ['uiController'];
```

- [ ] **Step 5: Run the registry test**

Run: `npm run test:run -- tests/unit/renderer/application/di/manual-providers.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit (registry + external tokens in place, not yet wired)**

```bash
git add src/renderer/application/di/manual-providers.ts src/renderer/application/di/external-tokens.ts tests/unit/renderer/application/di/manual-providers.test.ts
git commit -m "refactor(di): add typed manual-provider registry and external-token list"
```

### Task 3: Promote `gpuFrameBuffer` and `animationCache` to `@Service`

**Files:**
- Modify: `src/renderer/infrastructure/services/gpu-frame-buffer.ts` (add decorator)
- Modify: `packages/prismgb-core/src/primitives/performance-cache.utils.ts` (decorate `AnimationCache`)

- [ ] **Step 1: Decorate `GpuFrameBuffer`**

In `src/renderer/infrastructure/services/gpu-frame-buffer.ts`, ensure `Service` is imported from `@prismgb/core` and annotate the class. `GpuFrameBuffer` reads `{ loggerFactory }` from its constructor argument, so the scanner will emit `new GpuFrameBuffer(this.cradle)`.

```typescript
import { Service } from '@prismgb/core';

@Service({ token: 'gpuFrameBuffer' })
export class GpuFrameBuffer {
  // ...existing body unchanged...
}
```

(Preserve the existing `disposal` behavior: if the class exposes `dispose()`/`cleanup()`, the generated container's disposal loop already calls it by duck-typing — no `disposal` option is required for behavior parity, but add `disposal: 'dispose'` if the class has a `dispose()` method, to mirror existing intent.)

- [ ] **Step 2: Decorate `AnimationCache`**

In `packages/prismgb-core/src/primitives/performance-cache.utils.ts`, import the marker and annotate. `AnimationCache` has a no-arg constructor, so the scanner emits `new AnimationCache()`.

```typescript
import { Service } from '../di/decorators.js';

@Service({ token: 'animationCache' })
export class AnimationCache extends PerformanceCache {
  // ...existing body unchanged...
}
```

- [ ] **Step 3: Typecheck both projects**

Run: `npm run typecheck:core && npm run typecheck:app`
Expected: PASS.

- [ ] **Step 4: Commit (decorations only; codegen rewrite next)**

```bash
git add src/renderer/infrastructure/services/gpu-frame-buffer.ts packages/prismgb-core/src/primitives/performance-cache.utils.ts
git commit -m "refactor(di): promote gpuFrameBuffer and animationCache to @Service"
```

### Task 4: Rewrite `scripts/generate-di.js` to be generic

**Files:**
- Modify: `scripts/generate-di.js`
- Regenerate: `src/renderer/di.generated.ts`

The script must stop hardcoding application tokens. It learns the manual tokens by parsing the exported keys of `application/di/manual-providers.ts`, the externally-registered tokens from `application/di/external-tokens.ts`, emits scanned `@Service` cases plus a `default` branch that delegates to the imported `manualProviders` map, dedupes imports by module, and pre-seeds static tokens from `Object.keys(manualProviders)` at runtime.

- [ ] **Step 1: Add helpers that read the registry and external tokens from source**

Add near the other parse helpers in `scripts/generate-di.js`. The first parses the `manualProviders` object keys; the second parses the `externallyRegisteredTokens` array.

```javascript
function readDeclaredTokens(relativePath, exportName, kind) {
  const filePath = path.resolve(relativePath);
  const sourceFile = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.Latest, true);
  const tokens = [];

  function visit(node) {
    if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && node.name.text === exportName && node.initializer) {
      if (kind === 'objectKeys' && ts.isObjectLiteralExpression(node.initializer)) {
        for (const prop of node.initializer.properties) {
          if ((ts.isPropertyAssignment(prop) || ts.isMethodDeclaration(prop)) && prop.name &&
              (ts.isIdentifier(prop.name) || ts.isStringLiteral(prop.name))) {
            tokens.push(prop.name.text);
          }
        }
      }
      if (kind === 'arrayItems') {
        let arr = node.initializer;
        if (ts.isAsExpression(arr)) arr = arr.expression;
        if (ts.isArrayLiteralExpression(arr)) {
          arr.elements.forEach(el => { if (ts.isStringLiteral(el)) tokens.push(el.text); });
        }
      }
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return tokens;
}

function readManualProviderTokens() {
  const tokens = readDeclaredTokens('src/renderer/application/di/manual-providers.ts', 'manualProviders', 'objectKeys');
  if (tokens.length === 0) {
    throw new Error('[DI CodeGen] Could not parse any tokens from manual-providers.ts');
  }
  return tokens;
}

function readExternalTokens() {
  return readDeclaredTokens('src/renderer/application/di/external-tokens.ts', 'externallyRegisteredTokens', 'arrayItems');
}
```

- [ ] **Step 2: Replace the hardcoded `customTokens` set in `topologicalSort`**

In `topologicalSort` (around lines 161–174), delete the literal `customTokens` set and the hardcoded `dep !== 'uiController'` special case; accept the valid non-scanned tokens as a parameter:

```javascript
function topologicalSort(services, nonScannedTokens) {
  const sorted = [];
  const visited = new Set();
  const temp = new Set();
  const serviceMap = new Map(services.map(s => [s.token, s]));
  const customTokens = new Set(nonScannedTokens);
  // ...rest unchanged EXCEPT the dep-visit warning branch becomes simply:
  //   } else if (!customTokens.has(dep)) {
  //     console.warn("[DI Emitter Warning] Dependency " + dep + " ... is not a scanned service.");
  //   }
  // (the explicit `&& dep !== 'uiController'` is gone — uiController now arrives via nonScannedTokens)
}
```

The call site (Step 4) passes `[...manualTokens, ...externalTokens]`.

- [ ] **Step 3: Delete the static imports block and the static `case` bodies; add a module-deduped import tail**

Remove, from the generated-code template:
- the block of standard-infrastructure `import` lines (the `importsCode += \`...\`` block importing `BrowserStorageAdapter`, `DeviceIpcAdapter`, `StreamingRendererFactory`, `chromaticConfig`, `UIComponentRegistry`, `AnimationCache`, `safeDispose`, etc.);
- the entire hardcoded `case 'storageService':` … `case 'animationCache':` section (lines ~194–262) in the emitted `resolve()`.

**Dedupe scanned imports by module** to prevent a duplicate `@prismgb/core` import once `AnimationCache` is scanned (it would otherwise collide with the `safeDispose` import; the generated file IS linted). Replace the per-service `importsCode += "import { X } from '...'"` loop with a module-grouped emit:

```javascript
const importsByModule = new Map();
function addImport(module, name) {
  if (!importsByModule.has(module)) importsByModule.set(module, new Set());
  importsByModule.get(module).add(name);
}
// scanned services:
for (const service of sortedServices) {
  addImport(resolveImportPath(service), service.className); // resolveImportPath = the existing @prismgb/<pkg> | relative logic
}
// container-runtime dependencies:
addImport('@prismgb/core', 'safeDispose');
addImport('./application/di/manual-providers', 'manualProviders');

let importsCode = '// AUTOGENERATED DEPENDENCY INJECTION CONTAINER - DO NOT EDIT DIRECTLY\n\n';
for (const [module, names] of importsByModule) {
  importsCode += "import { " + [...names].join(', ') + " } from '" + module + "';\n";
}
```

(`manualProviders` is a value import so it must be a regular `import`, not `import type`.)

- [ ] **Step 4: Emit a generic `default` branch and runtime-derived static tokens**

Update `generateDI()`:

```javascript
function generateDI() {
  console.log('[DI CodeGen] Scanning src/renderer and packages/prismgb-*/src for @Service annotated classes...');
  const services = [];
  for (const scanDir of scanDirs) {
    walkDir(scanDir, (filePath) => {
      if (filePath.endsWith('di.generated.ts') || filePath.endsWith('di.generated.js')) return;
      services.push(...scanFile(filePath));
    });
  }

  const manualTokens = readManualProviderTokens();
  const externalTokens = readExternalTokens();
  console.log('[DI CodeGen] Found ' + services.length + ' scanned services, ' + manualTokens.length + ' manual providers, ' + externalTokens.length + ' external tokens.');

  let sortedServices;
  try {
    sortedServices = topologicalSort(services, [...manualTokens, ...externalTokens]);
  } catch (err) {
    console.error('[DI CodeGen] Generation aborted: ' + err.message);
    process.exit(1);
  }
  // ...build deduped importsCode (Step 3), then emit the container body...
}
```

The emitted container body changes in two places:

1. Static-token pre-seed (replaces the hardcoded `allStaticTokens` literal). Emit the scanned tokens as a literal and union with manual-provider keys at runtime:

```javascript
const scannedTokensLiteral = JSON.stringify(sortedServices.map(s => s.token), null, 2);
```
and in the emitted constructor body:
```javascript
const staticTokens = [...Object.keys(manualProviders), ...SCANNED_TOKENS_LITERAL];
```
where `SCANNED_TOKENS_LITERAL` is interpolated from `scannedTokensLiteral`. (External tokens are intentionally NOT pre-seeded — they are registered at runtime by bootstrap, exactly as today.)

2. The `resolve()` `default` branch:

```javascript
      default: {
        const provider = manualProviders[token];
        if (!provider) {
          throw new Error("[GeneratedContainer] Could not resolve token: " + token);
        }
        instance = provider((dependencyToken) => this.resolve(dependencyToken));
      }
```

- [ ] **Step 5: Leave the dependency warning as a warning (A3 upgrades it)**

Keep line ~188's `console.warn` as a warning for now. A3 (Task 7) turns it into a hard error. This keeps A2 strictly mechanical.

- [ ] **Step 6: Regenerate and diff carefully**

Run:
```bash
node scripts/generate-di.js
git --no-pager diff src/renderer/di.generated.ts
```
Expected diff, and nothing else:
- the static infra `import` lines are replaced by deduped imports ending in the `manualProviders` import; exactly one `import { ... } from '@prismgb/core'` line remains (now including `AnimationCache` and `safeDispose`);
- the 9 hardcoded `case` blocks (`storageService`…`uiComponentRegistry`, plus the old `gpuFrameBuffer`/`animationCache` infra cases) are gone, replaced by the generic `default` branch;
- `gpuFrameBuffer` and `animationCache` now appear as **scanned** `case` blocks (`new GpuFrameBuffer(this.cradle)` and `new AnimationCache()`);
- the static-token pre-seed is now computed from `Object.keys(manualProviders)` + the scanned-token literal.

Confirm every previously-resolvable token is still resolvable (same token set — verify with: `grep -c "case '" src/renderer/di.generated.ts` returns the same count as before, **66**). If any token disappeared or changed construction, stop.

- [ ] **Step 7: Run the container test specifically**

Run: `npm run test:run -- tests/unit/renderer/application/container.test.ts`
Expected: PASS. The test asserts `expect(tokens).toEqual(expect.arrayContaining(expectedRegistrationKeys))` — an **order-insensitive subset** check (verified), so the reordered pre-seed is fine; `animationCache`/`gpuFrameBuffer` remain registered under identical token names.

- [ ] **Step 8: Full suite + typecheck + lint**

Run: `npm run test:run`
Expected: PASS — 3061 tests / 155 files (plus A1/A2 additions).

Run: `npm run typecheck:app`
Expected: PASS.

Run: `npm run lint`
Expected: PASS. `manual-providers.ts` is in `RENDERER_APPLICATION`, which may import both `RENDERER_INFRASTRUCTURE` and `RENDERER_PRESENTATION` (verified against `check-layer-boundaries.js`), so its imports from `infrastructure/*` and `presentation/controller/*` are legal. If the boundary checker nonetheless flags it, stop — it means the layer classification differs from this analysis.

- [ ] **Step 9: Verify the script is now generic**

Run:
```bash
grep -nE "BrowserStorageAdapter|DeviceIpcAdapter|StreamingRendererFactory|UIComponentRegistry|chromaticConfig|customTokens|storageService|ipcClient|uiController" scripts/generate-di.js
```
Expected: **zero** matches. `scripts/generate-di.js` no longer names any application class or token (including `uiController`, now sourced from `external-tokens.ts`).

- [ ] **Step 10: Commit**

```bash
git add scripts/generate-di.js src/renderer/di.generated.ts
git commit -m "refactor(di): make generate-di.js generic via manual-provider registry"
```

---

## Phase A3 — Single Source of Truth for Dependencies (MED risk)

The `@Service({ dependencies: [...] })` array becomes the single source of truth for each service's dependency list. The duplicated required-deps array is removed from every `super(...)` call across the **38** classes that use the `super(dependencies, [...], 'Name')` form. Runtime validation is dropped (decision (a)); build-time validation in the codegen is upgraded to a hard error.

> **Refinement of the spec's wording (flagged for reviewer):** the spec text says services call `super(dependencies)` with the name auto-derived from `constructor.name`. `vite.config` sets no esbuild `keepNames`, so production minification mangles class names and `constructor.name`-derived **logger categories would change in production** — a behavior regression. This plan therefore **keeps the explicit service-name string and removes only the duplicated dependency array** (`super(dependencies, 'DeviceOrchestrator')`). This fully satisfies the spec's stated goal — a single source of truth for the dependency *list* — while staying strictly behavior-preserving. The name string is not duplicated data, so it is not in scope for de-duplication.

### Task 5: Change the base-class constructor signatures

**Files:**
- Modify: `packages/prismgb-core/src/primitives/service.base.ts:44-63`
- Modify: `packages/prismgb-core/src/primitives/orchestrator.base.ts:13-33`

- [ ] **Step 1: Update `BaseService`**

In `packages/prismgb-core/src/primitives/service.base.ts`, change the constructor from `(dependencies, requiredDeps = [], serviceName = null)` to drop `requiredDeps` and the validation call:

```typescript
  constructor(dependencies: object, serviceName: string | null = null) {
    const name = serviceName || this.constructor.name;
    const dependencyMap = dependencies as Record<string, unknown>;

    Object.assign(this, dependencyMap);

    const loggerFactory = dependencyMap.loggerFactory as LoggerFactoryLike | undefined;
    if (loggerFactory) {
      this.logger = loggerFactory.create(name);
    }

    this.disposables = new DisposableBag();
    this._eventBus = isEventBusLike(dependencyMap.eventBus) ? dependencyMap.eventBus : null;
    this._serviceName = name;
  }
```

Remove the now-unused `import { validateDependencies } from './validate-deps.utils.js';` at the top of the file.

- [ ] **Step 2: Update `BaseOrchestrator`**

In `packages/prismgb-core/src/primitives/orchestrator.base.ts`, apply the identical change:

```typescript
  constructor(dependencies: object, name: string | null = null) {
    const orchestratorName = name || this.constructor.name;
    const dependencyMap = dependencies as Record<string, unknown>;

    Object.assign(this, dependencyMap);

    const loggerFactory = dependencyMap.loggerFactory as LoggerFactoryLike | undefined;
    if (loggerFactory) {
      this.logger = loggerFactory.create(orchestratorName);
    }

    this.isInitialized = false;
    this._isCleanedUp = false;
    this._orchestratorName = orchestratorName;
    this._disposables = new DisposableBag();
  }
```

Remove the now-unused `validateDependencies` import.

- [ ] **Step 3: Handle `validate-deps.utils.ts` if now unused**

Run:
```bash
grep -rn "validateDependencies\|validate-deps" src packages tests --include='*.ts' | grep -v 'dist/'
```
- If the only remaining references are the file itself and its own unit test (if any), delete `packages/prismgb-core/src/primitives/validate-deps.utils.ts`, remove any export of it from `packages/prismgb-core/src/index.ts`, and delete its dedicated test. (Bonus dead-code reduction.)
- If anything else imports it, leave it in place and note it.

- [ ] **Step 4: Typecheck core (expect errors in app — that is the next task)**

Run: `npm run typecheck:core`
Expected: PASS for the package itself.

Run: `npm run typecheck:app`
Expected: **FAIL** — 38 call sites still pass three arguments to a two-argument `super(...)`. This is the worklist for Task 6. (TypeScript flags extra arguments only if the signature is not variadic; if it does not error on extra args, rely on the mechanical sweep in Task 6 instead.)

- [ ] **Step 5: Do not commit yet** — base + call sites must land together to keep the build green.

### Task 6: Collapse the 38 `super(...)` call sites

**Files (38 total):** every class matching `super(dependencies, [` under `src/` and `packages/`. Enumerate the exact list with:

```bash
grep -rln "super(dependencies, \[" src packages --include='*.ts'
```

For **each** file, apply this exact mechanical transformation. Example — `src/renderer/application/orchestrators/device.orchestrator.ts:51-55`:

Before:
```typescript
    super(
      dependencies,
      ['deviceService', 'deviceIpcAdapter', 'deviceOperationSequencer', 'eventBus', 'loggerFactory'],
      'DeviceOrchestrator'
    );
```

After:
```typescript
    super(dependencies, 'DeviceOrchestrator');
```

Rules for the transformation:
- Drop the middle argument (the string-array of required deps).
- Keep the third argument (the name string) as the new second argument.
- Leave the `@Service({ dependencies: [...] })` decorator array untouched — it is now the single source of truth.
- Leave the field-declaration block and the `this.x = dependencies.x` assignment block untouched (that is A3-deep, deferred).
- **Edge case (verified absent, but handle defensively):** all 38 sites currently include a name string. If any site has only two args `super(dependencies, [...])` (array, no name), collapse it to `super(dependencies)` — those classes already relied on `constructor.name`, so dropping to no-name is behavior-preserving for them.

- [ ] **Step 1: Sweep all 38 files applying the transformation above.**

- [ ] **Step 2: Verify no required-deps arrays remain in `super(...)`**

Run:
```bash
grep -rn "super(dependencies, \[" src packages --include='*.ts'
```
Expected: **zero** matches.

- [ ] **Step 3: Typecheck app**

Run: `npm run typecheck:app`
Expected: PASS.

- [ ] **Step 4: Regenerate DI and diff (expect no change)**

Run:
```bash
node scripts/generate-di.js
git diff --stat src/renderer/di.generated.ts
```
Expected: **no diff** — the codegen reads the `@Service` decorator arrays (untouched), not `super(...)`. If there is a diff, stop.

- [ ] **Step 5: Full suite + lint**

Run: `npm run test:run`
Expected: PASS — 3061 tests / 155 files. (If any unit test constructed a service with an incomplete mock and relied on the old "Missing required dependencies" throw, it will now fail differently. Per decision (a), update that test to assert the real downstream behavior, or to supply the complete mock. Document any such test touched.)

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 6: Commit base classes + call sites together**

```bash
git add packages/prismgb-core/src/primitives/service.base.ts packages/prismgb-core/src/primitives/orchestrator.base.ts packages/prismgb-core/src/index.ts src/ packages/
git commit -m "refactor(di): make @Service array the single source of truth for dependencies"
```

### Task 7: Upgrade the codegen dependency check to a hard error

**Files:**
- Modify: `scripts/generate-di.js:188`

Now that the `@Service` array is the only dependency source, a dependency that is neither a scanned service nor a manual-provider token is a real misconfiguration and must fail the build.

- [ ] **Step 1: Replace the warning with a thrown error**

At `scripts/generate-di.js` line ~188, change:

```javascript
          } else if (!customTokens.has(dep) && dep !== 'uiController') {
            console.warn("[DI Emitter Warning] Dependency " + dep + " of " + token + " is not a scanned service.");
          }
```

to:

After A2, the warning branch is `} else if (!customTokens.has(dep)) {` (where `customTokens` is the union of manual-provider + external tokens). Change that `console.warn` to a throw:

```javascript
          } else if (!customTokens.has(dep)) {
            throw new Error(
              "[DI CodeGen] Dependency '" + dep + "' of '" + token +
              "' is neither a scanned @Service, a manual provider, nor an external token. " +
              "Add it as an @Service class, to manual-providers.ts, or to external-tokens.ts."
            );
          }
```

(The surrounding `try/catch` in `generateDI()` already calls `process.exit(1)` on a thrown error.)

- [ ] **Step 2: Verify a clean run still succeeds**

Run: `node scripts/generate-di.js`
Expected: completes with no error and no warning; `git diff --stat src/renderer/di.generated.ts` shows no change.

- [ ] **Step 3: Verify the guard actually fails on a bad dependency (temporary probe)**

Temporarily add a nonexistent dependency to one `@Service` array (e.g. add `'doesNotExist'` to `device.orchestrator.ts`'s `dependencies`), then:

Run: `node scripts/generate-di.js`
Expected: exits non-zero with the new error message naming `doesNotExist`.

Revert the probe (`git checkout src/renderer/application/orchestrators/device.orchestrator.ts`) and regenerate to confirm clean.

- [ ] **Step 4: Full suite + lint**

Run: `npm run test:run && npm run lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add scripts/generate-di.js
git commit -m "refactor(di): fail the build on undeclared DI dependencies"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- A1 (dead `@Inject`/`injectMetadata`/`serviceMetadata`, `@Service` → marker) → Task 1. ✅
- A2 generic codegen + provider registry (in `application/di/`) → Tasks 2, 4. ✅
- A2 promote `gpuFrameBuffer` + `animationCache` (construction-shape invariant) → Task 3. ✅
- A2 "script carries no app tokens" → Task 4 Step 9 verifies it (incl. `uiController`). ✅
- A3 single source of truth (drop required-deps array) → Tasks 5, 6. ✅
- A3 drop runtime validation (decision (a)) → Task 5 (removes `validateDependencies` call). ✅
- A3 codegen warning → hard error → Task 7. ✅
- Behavior-preserving + suite/typecheck/lint per phase + commit per phase → every task. ✅

**Pre-execution verification baked into the plan (from advisor review):**
- *Build-breaker checked & cleared:* the orphan check (declared deps − scanned − manual − external) is **empty**; `browserMediaService` is a scanned `@Service` (`new BrowserMediaAdapter()`), not an external token, so Task 7's hard error won't spuriously fire.
- *Layer boundary:* registry placed in `application/di/` (not `infrastructure/di/`) because `RENDERER_APPLICATION` may import presentation/infrastructure but `RENDERER_INFRASTRUCTURE` may **not** import presentation. Verified against `check-layer-boundaries.js`.
- *Lint duplicate-import:* the generated file IS linted; Task 4 Step 3 dedupes imports by module so promoting `AnimationCache` does not create a second `@prismgb/core` import.
- *Container test:* uses `arrayContaining` (order-insensitive), so the reordered static-token pre-seed is safe.
- *No name-less `super()` sites* exist (Finding 4): all 38 carry a name string; defensive rule added anyway.

**Deliberate refinement flagged for reviewer:** A3 keeps the explicit service-name string (drops only the duplicated deps array) to avoid a production logger-category regression from minified `constructor.name`. Satisfies the spec's stated goal; see the callout in Phase A3.

**Placeholder scan:** no TBD/TODO; every code step shows real code; every command has expected output. ✅

**Type/name consistency:** `manualProviders`, `ManualProvider`, `ResolveFn`, `readManualProviderTokens`, `readExternalTokens`, `externallyRegisteredTokens`, the `default`-branch delegation, and the two-arg `super(dependencies, name)` signature are referenced consistently across Tasks 2, 4, 5, 6, 7. ✅

**Out of scope (future increments):** A3-deep (field-assignment/interface elimination), increments B/C/D. The inert `Object.assign(this, dependencyMap)` in the base classes is intentionally left untouched (harmless; addressed in A3-deep).
