# Phase 1 — Device domain collapse

> Spine: [`00-overview.md`](./00-overview.md). Catalogue: [`../refactor-aggressive-reduction-options.md`](../refactor-aggressive-reduction-options.md) Dimension 18.
> **Readiness: UNCONDITIONAL — execute now.** No spike. The read-only dry-run is done (this doc). Phases 2-4 are gated; Phase 1 is not.

This phase is unconditional, so the **Spike gate** and **Fallback** sections that gated-phase docs carry are intentionally omitted.

---

## 1. Inherited status & caveats (verbatim from the catalogue, carried forward unsoftened)

**Verdict (Dim 18):** the device subsystem ships "an extensible multi-device plugin framework for **exactly one device**." `device.manifest.json` has 1 entry (`chromatic-mod-retro`), 1 `DeviceProfile` subclass (`DeviceChromaticProfile`), 1 adapter. It carries two parallel registries, a register→iterate-back round-trip, 4 redundant detection implementations, dead base-class defaulting, and triple-wrapped config. **YAGNI hypothesis: CONFIRMED.**

**Tier-1 (recommend, zero extensibility lost):** `dual-registry-merge`, `registry-roundtrip-elimination`, `detection-path-unification`, `profile-base-deadcode`, `config-triple-wrap-flatten`.

**Tier-2 (viable-tradeoff, conflicting):** `profile-framework-to-manifest-descriptor` — collapse the `DeviceProfile` class hierarchy + plugin API into a static `DeviceDescriptor` derived from the manifest. **The honest trade, carried forward in plain language:** this **forfeits the class-per-device extensibility seam** — a real conflict with the future-first philosophy. It is **hedged, not free**: the `device.manifest.json` stays the data-driven "add-a-device" path, so extensibility survives **as data, not OOP**. The catalogue's explicit keep-case: *if a 2nd device with imperative per-device logic is on the roadmap, do Tier-1 only.* The owner chose the maximal end-state with full information, so Tier-2 executes here.

**The load-bearing caveat (`profile-base-deadcode`), carried forward verbatim:**
> `device-profile.base.ts:184` `preferredRenderer: config.rendering?.preferredRenderer || 'canvas'` **IS live** — the Chromatic `RENDERING_CONFIG` omits `rendering.preferredRenderer`, so the `|| 'canvas'` default is the value actually used. Preserve it (add `preferredRenderer: 'canvas'` to the config) before deleting the branch; **it is not a no-op.**

Grounding correction that sharpens (not softens) the caveat: `grep -rn "preferredRenderer" src packages` (non-`dist`) returns **only the three lines inside `device-profile.base.ts` itself** — there is **no external reader**. So the field is *populated but never consumed* today. In the full Tier-2 collapse the base class is deleted entirely, so the only way the deletion changes observable shape is `chromaticConfig.rendering` losing the `'canvas'` value the profile instance carried. **The mitigation is therefore mandatory and sufficient: add `preferredRenderer: 'canvas'` to the flattened `RENDERING_CONFIG` *before* deleting the base class.** It is encoded below as a hard intra-phase ordering dependency (LOW task 2.1 precedes HIGH task 4.1). Do not treat the base-class delete as a no-op.

**Hard guardrail (KEEP — do NOT cross):**
- The **renderer↔package split is process separation, not duplication** (two ends of the IPC boundary). Do not merge `DeviceService` (main) into the renderer.
- The package's **`index.ts`-barrel (renderer-facing) vs `/service`-subpath (main-only) split keeps native `usb`/`electron` out of the renderer bundle** — an Electron isolation requirement. Every browser-safe symbol (catalog, config, detection) stays reachable via `@prismgb/devices`; every node/native symbol (`DeviceService`, lifecycle/bridge services) stays behind `@prismgb/devices/service`. **Do not collapse into "one device module."**

**Real safety net (named by the task):** `dev:smoke` + `tests/e2e/device-connection.spec.js` + `tests/e2e/device-streaming.spec.js`. Both boot paths are touched — main eager `DeviceService.initialize()` (`src/main/application/container.ts:196-197`) and renderer `StreamingAdapterFactory.initialize()` (`src/renderer/.../streaming/streaming-adapter.factory.ts:90`). These gates are the real proof; typecheck/unit tests use source aliasing and will not catch a boot regression.

---

## 2. Scope

### Catalogue options this phase EXECUTES
Tier-1: `dual-registry-merge`, `registry-roundtrip-elimination`, `detection-path-unification`, `profile-base-deadcode`, `config-triple-wrap-flatten`. Tier-2: `profile-framework-to-manifest-descriptor`.

### What it DELETES (files + measured LOC, verified by `wc -l` 2026-06-28)
All in `packages/prismgb-devices/src/` → **outside the `src/**` coverage scope** (`vitest.config.js:35` `include: ['src/**/*.{js,ts}']`), so these deletions are **coverage-neutral**.

| File | LOC | Why it dies |
|------|----:|-------------|
| `device-profile.base.ts` | 322 | The `DeviceProfile` class hierarchy collapses to a static descriptor (Tier-2). |
| `device-profile.registry.ts` | 235 | Second registry (`usbIndex`/`detectDevice`) merged into the single `matchDevice` (`dual-registry-merge`). |
| `device.registry.ts` | 149 | Class-registration round-trip (`registerProfileClass`/`getProfileClass`/`registerAdapterClass`/`getAdapterClass` + mutable `_registeredDevices`) eliminated; `DeviceRegistryEntry` type folds into `device-catalog.ts` (`registry-roundtrip-elimination`). |
| `device-iterator.utils.ts` | 37 | `forEachDeviceWithModule` existed only to iterate `DeviceRegistry` back out during the round-trip; both consumers now construct directly. |
| `device-detection.utils.ts` | 58 | `DeviceDetectionHelper` + matching folds into `device-catalog.ts`'s unified `matchDevice` (`detection-path-unification`). |
| `profiles/chromatic/device-chromatic.profile.ts` | 57 | The lone `DeviceProfile` subclass; descriptor replaces it. |
| **Deleted outright** | **858** | (package-layer, coverage-neutral) |

### What it ADDS
- **New file** `packages/prismgb-devices/src/device-catalog.ts` (~90-110 LOC, browser-safe): the legible manifest-derived seam — `DeviceDescriptor` interface + `getDeviceDescriptors()` + the single unified `matchDevice()` + a thin `DeviceDetectionHelper` compat facade (so renderer import sites stay byte-identical). Replaces the 5 deleted browser-safe matchers/registries.
- **No new runtime dependencies.** Tier-1+Tier-2 is an internal YAGNI collapse — zero `npm i`.

### What it TRANSFORMS in place
| File | LOC now | Target | Net | Coverage |
|------|--------:|-------:|----:|----------|
| `profiles/chromatic/device-chromatic.config.ts` | 189 | ~110-130 | −60…−80 | neutral (pkg) |
| `device.service.ts` (main) | 382 | ~255-270 | ~−120 | neutral (pkg) |
| `src/renderer/.../streaming/streaming-adapter.factory.ts` | 306 | ~250 | **~−55** | **measured (renderer)** |
| `src/renderer/.../devices/device-storage.service.ts` | 59 | 59 | **0** (re-point) | **measured (renderer)** |
| `src/main/application/container.ts` | 204 | ~180 | ~−25 | measured (main) |
| `packages/prismgb-devices/src/index.ts` | 16 | ~16 | re-pointed | neutral |
| `packages/prismgb-devices/src/service.ts` | 13 | ~11 | −2 | neutral |

### LOC reconciliation (visibly honoring the inherited range)
- **src net:** −858 (deleted) − ~70 (config) − ~120 (service) − ~55 (factory) − ~25 (container) + ~100 (new catalog) ≈ **−1,030 to −1,250 src**, of which only **~80 is coverage-measured** (factory ~−55 + container ~−25). Effectively the inherited **~−1,050-1,250 src** (the computed low end is ~20 LOC under the catalogue's round ~−1,050 — within estimate tolerance); the package concentration is exactly the catalogue's "concentrated in `packages/prismgb-devices/src` (coverage-neutral) + ~55 coverage-measured renderer." (The Stage 3.2 `device-storage.service.ts` re-point is **net-0** — an import swap + a call-site swap — so it does not perturb these totals or the ~80 coverage-measured figure.)
- **test net:** −809 deleted (3 files) − ~260 rewrite-shrink + ~120 new catalog test ≈ **~−800 test**, matching the inherited figure (§8).

---

## 3. Current → target state

**Current (1-device framework):**
```
manifest(1 entry) ─┬─► DeviceRegistry (mutable, holds ProfileClass/AdapterClass)
                   │        ▲ registerProfileClass()        ▲ registerAdapterClass()
                   │        │ (main boot)                   │ (renderer boot)
                   │   forEachDeviceWithModule ──► getProfileClass ──► new ProfileClass()
                   │                                                        │
                   │   forEachDeviceWithModule ──► getAdapterClass ──► registered into TypedRegistryFactory
                   │
                   └─► DeviceProfileRegistry (2nd registry: usbIndex + detectDevice)
                              ▲ registerProfile(new DeviceChromaticProfile())  ◄─ DeviceProfile base (322 LOC defaulting)
Detection paths: DeviceProfileRegistry.detectDevice · DeviceDetectionHelper.detectDeviceId · chromaticHelpers.matchesUSB/Label · DeviceChromaticProfile.matchesLabel  (4 impls)
Config: device-chromatic.config.ts re-freezes the manifest into a parallel triple-wrapped shape (189 LOC)
```

**Target (manifest-as-descriptor):**
```
device.manifest.json ──► device-catalog.ts
                            ├─ DeviceDescriptor (static, derived from manifest)
                            ├─ getDeviceDescriptors(): readonly DeviceDescriptor[]
                            └─ matchDevice({label?,vendorId?,productId?}): DeviceDescriptor | null   ◄─ the ONE detection path
                                 ▲                                   ▲
   main: DeviceService.matchDevice()                renderer: DeviceDetectionHelper facade → matchDevice
         (no DeviceProfileRegistry, no roundtrip)            (import sites unchanged)
   renderer: StreamingAdapterFactory iterates the injected adapterClasses Map directly (no DeviceRegistry roundtrip)
   Config: device-chromatic.config.ts reads the manifest once, no re-wrapping; +preferredRenderer:'canvas'
```
Extensibility-as-data survives: add a device = add a manifest entry + (its adapter class injected at the renderer boot Map in `manual-providers.ts`). No class-per-device OOP seam.

---

## 4. Ordered task breakdown (risk-tiered per the project Execution Planning Methodology)

**Agent allocation.** Stages 1-2 (LOW) are mechanical and may be delegated to a Coder/haiku subagent with exact paths. Stages 3-5 (MED/HIGH) are behavioral, touch both boot paths and the e2e safety net — **execute sequentially by ME (orchestrator)**, never in parallel (every task shares the `@prismgb/devices` barrel + the two boot files). One branch, commit-per-stage.

**Commit atomicity (source + test land together).** `.husky/pre-commit` runs the **full** `npm run test:run` on every commit, and this phase commits **once per stage**. Therefore each stage's source change and its §8 test counterpart MUST land in the **same commit** — a commit that drops a symbol without rewriting the test that references it (or vice-versa) red-fails the hook. Concretely: Stage 2 drops `chromaticHelpers.matchesUSB`/`matchesLabel` AND rewrites `chromatic-device-config.test.ts` in one commit; Stage 4 deletes `device-profile.base.ts`/`device.registry.ts`/`device-iterator.utils.ts` AND deletes their tests (`device-profile.test.ts`/`device-registry.test.ts`/`device-iterator.test.ts`) in the same commit. The §8 **Stage** column binds every test action to its stage.

**Barrel-export invariant:** a `device-catalog.ts` symbol is barrel-exported from `packages/prismgb-devices/src/index.ts` in/before the stage that first imports it, and is **never exported twice**. `getDeviceDescriptors` is therefore added to the barrel in Stage 3.2 (its first consumer) — Stage 4.3 must NOT re-export it.

**Hard intra-phase ordering dependency:** Stage 2 task **2.1 (add `preferredRenderer:'canvas'`) MUST land before** Stage 4 task **4.1 (delete `device-profile.base.ts`).** Encoded by stage order; do not reorder.

---

### Stage 1 — LOW: introduce the descriptor seam (additive, no deletions yet)
Additive only; nothing is removed, so the existing suite stays green throughout.

**1.1 — Create `packages/prismgb-devices/src/device-catalog.ts`.**
Browser-safe (imports only `./device.manifest.js`). Provide:
- `interface DeviceDescriptor` — `{ id; name; manufacturer; enabled; usb: { vendorId; productId }; labelPatterns: readonly string[]; modules: { profile?: string|null; adapter?: string|null } }` (the consumed subset of the old `DeviceRegistryEntry` at `device.registry.ts:11-23`).
- `getDeviceDescriptors(): readonly DeviceDescriptor[]` — frozen map over `DeviceManifest.devices` (mirror `device.registry.ts:41-67`, minus the mutable runtime-class fields).
- `matchDevice(input: { label?: string|null; vendorId?: number|null; productId?: number|null }): DeviceDescriptor | null` — the single unified matcher; preserve exact semantics of `device-detection.utils.ts:14-44` (label-substring case-insensitive over `labelPatterns`, then USB VID+PID equality; `enabled` entries only; label checked before USB).
- `export const DeviceDetectionHelper = { detectDeviceId(d) { return matchDevice(d)?.id ?? null; }, matchesByLabel(label) { return matchDevice({ label })?.id ?? null; } }` — byte-compatible with the API consumed at `device-media.service.ts:145,290,340`, `streaming.service.ts:399`, `streaming-adapter.factory.ts:240`.

*Validation:* `npm run typecheck` (new file compiles, no consumers yet).

**1.2 — Add a focused unit test** `tests/unit/renderer/infrastructure/services/device-catalog.test.ts` covering `matchDevice` (USB hit, label hit, label-before-USB precedence, disabled-skip, no-match→null) and the `DeviceDetectionHelper` facade. Mirror the surviving assertions from the to-be-deleted `device-detection.test.ts`.

*Validation:* `npm run test:run -- device-catalog`.

---

### Stage 2 — LOW: flatten the config + plant the `preferredRenderer` mitigation
**2.1 — `profiles/chromatic/device-chromatic.config.ts`: add `preferredRenderer: 'canvas'` to `RENDERING_CONFIG`** (currently `:100-113`, which omits it). **This is the mandated mitigation and MUST precede Stage 4.** Then flatten the triple `Object.freeze` re-wrapping (`config-triple-wrap-flatten`): read `CHROMATIC_MANIFEST_ENTRY` once, drop the per-field re-freeze pyramid (`:27-113`), keep one frozen exported `chromaticConfig`/`mediaConfig`. **Drop** `chromaticHelpers.matchesUSB` (`:163-170`) and `chromaticHelpers.matchesLabel` (`:172-179`) — `grep -rn "matchesUSB\|matchesLabel" src packages` (non-dist) shows zero src consumers; detection now flows through `matchDevice`. **Keep** `chromaticHelpers.getResolutionByScale` (`:181-188`) — consumed at `device-chromatic.adapter.ts:181`. **Keep** `chromaticConfig.name/.media/.rendering.recommendedScales` and `mediaConfig.audioFull/.video` — consumed at `device-chromatic.adapter.ts:117,118,200,202,237`.

*Tests (same commit):* REWRITE `chromatic-device-config.test.ts` per §8 (drop the `matchesUSB`/`matchesLabel` describe blocks, add the `preferredRenderer === 'canvas'` assertion) — the source drop and the test rewrite land in **one** commit.
*Validation:* `npm run typecheck && npm run test:run -- chromatic-device-config`. Re-run `wc -l` to confirm the target ~110-130 (record actual).

---

### Stage 3 — MED: re-point the renderer `DeviceRegistry` consumers (round-trip elimination + storage; the coverage-measured renderer slice)
There are **two** renderer files that import `DeviceRegistry` from the `@prismgb/devices` barrel (verified `grep -rn "DeviceRegistry" src` 2026-06-28): `streaming-adapter.factory.ts` (the round-trip, 3.1) and `device-storage.service.ts` (the descriptor-id read, 3.2). Both must be re-pointed here, **before** Stage 4.3 deletes the `DeviceRegistry` barrel export.

**3.1 — `src/renderer/.../streaming/streaming-adapter.factory.ts`.**
- Import line `:15`: drop `forEachDeviceWithModule`, `DeviceRegistry`, `type DeviceRegistryEntry`; keep `DeviceDetectionHelper`. (Resolves through the `@prismgb/devices` barrel.)
- `initialize()` (`:90-110`): delete the `for (const [deviceId, AdapterClass] of this._adapterClasses) DeviceRegistry.registerAdapterClass(...)` loop (`:97-100`).
- `_registerBuiltInAdapters()` (`:118-151`): replace the `forEachDeviceWithModule('adapterModule', …)` + `DeviceRegistry.getAdapterClass(device.id)` round-trip with a direct iteration of the **already-injected** `this._adapterClasses` Map (`new (deviceId, AdapterClass)` pairs the factory already holds), registering each into `this._adapterRegistry` via the existing `this._register(...)`. Drop the `DeviceRegistryEntry[]` local at `:122`.
- `detectDeviceId()` (`:229-249`) is unchanged — still calls `DeviceDetectionHelper.detectDeviceId`.

*Tests (same commit):* MODIFY `streaming-adapter.factory.test.ts` per §8 — land it in this stage's commit.
*Validation:* `npm run typecheck && npm run test:run -- streaming-adapter.factory && npm run lint`.

**3.2 — `src/renderer/infrastructure/services/devices/device-storage.service.ts` (the second renderer `DeviceRegistry` consumer; 59 LOC).**
- Import line `:3`: replace `import { DeviceRegistry } from '@prismgb/devices';` with `import { getDeviceDescriptors } from '@prismgb/devices';`.
- Call site `:51` (inside `getRegisteredStoredDeviceIds()`): replace `const registeredIds = DeviceRegistry.getAll().map(device => device.id);` with `const registeredIds = getDeviceDescriptors().map(device => device.id);`.
- **Semantics preserved (verified):** `getDeviceDescriptors()` mirrors the old `BUILT_IN_DEVICES` (`device.registry.ts:41-67`) with **no `enabled` filter**, exactly as `DeviceRegistry.getAll()` returned the full `_registeredDevices` set; both call sites consume only `.id`, so the id list is byte-identical.
- **Barrel-export prerequisite (per the §4 invariant):** add `export { getDeviceDescriptors } from './device-catalog.js';` to `packages/prismgb-devices/src/index.ts` **in this same commit** so the re-point typechecks. (`matchDevice` + the `DeviceDescriptor` type stay for Stage 4.3; `getDeviceDescriptors` is NOT re-added there.)
- **No test counterpart:** there is no dedicated `DeviceStorageService` unit test, and the `getRegisteredStoredDeviceIds` mocks in `streaming.service.test.ts` (`:35,105,…`) are interface-level on `mockDeviceService`, not on `DeviceRegistry` — so no test references the swapped symbol. The re-point is net-0 (import + call swap).

*Validation:* `npm run typecheck && npm run lint` (no `device-storage` test to filter; the full `test:run` still runs at the stage commit via the husky hook).

---

### Stage 4 — HIGH: collapse the framework (delete base + both registries + roundtrip iterator)
**Precondition: Stage 2.1 has landed.** Behavioral; run the full gate set after this stage.

**4.1 — Delete** `device-profile.base.ts` and `profiles/chromatic/device-chromatic.profile.ts`.
**4.2 — Delete** `device-profile.registry.ts`, `device.registry.ts`, `device-iterator.utils.ts`, `device-detection.utils.ts` (their browser-safe surface now lives in `device-catalog.ts`).
**4.3 — `packages/prismgb-devices/src/index.ts`:** drop exports of `DeviceProfile`, `DeviceRegistry`, `DeviceChromaticProfile`, `forEachDeviceWithModule`, and `type DeviceRegistryEntry` (`:1-2,12,14-15`). Re-point `DeviceDetectionHelper` to `./device-catalog.js` (was `./device-detection.utils.js`, `:13`). Add `export { matchDevice } from './device-catalog.js'; export type { DeviceDescriptor } from './device-catalog.js';`. **Do NOT re-export `getDeviceDescriptors` here** — it was already barrel-exported in Stage 3.2 (per the §4 barrel-export invariant); a second re-export of the same name fails typecheck. Keep `DeviceManifest`, `device-defaults`, `IDeviceAdapter`, `DeviceStatusProvider`/`RendererDeviceStatus`, `chromaticConfig`/`chromaticHelpers`/`mediaConfig`.
**4.4 — `packages/prismgb-devices/src/service.ts`:** remove `export { DeviceProfileRegistry }` (`:10`) and the `ProfileClass` type export (`:9`). Keep `DeviceService`, `DeviceLifecycleService`, `DeviceBridgeService`.

**4.5 — `packages/prismgb-devices/src/device.service.ts` (main):**
- Drop the `DeviceProfileRegistry` dependency (`:19,53,65,78`), the `profileClasses` constructor arg + `_profileClasses` field (`:50,72,76,98`), `ProfileClass` type (`:50`), and the `forEachDeviceWithModule`/`DeviceRegistry`/`DeviceRegistryEntry` imports (`:9,10`).
- Replace `_initializeProfiles()` round-trip (`:138-214`): `initialize()` becomes a lightweight guarantee — assert `getDeviceDescriptors().some(d => d.enabled)` (preserve the fail-fast semantics of the old "No device profiles were successfully initialized" throw at `:202-203`), set `_areProfilesInitialized`, keep the mutex (`:106-124`). No profile instantiation.
- `matchDevice(device)` (`:228-245`): call `matchDevice(device)` from `./device-catalog.js` → return `{ matched: !!descriptor, config: descriptor && { deviceName: descriptor.name, vendorId, productId }, profile: descriptor }`. The only consumed field downstream is `.name` (verified: `onDeviceDisconnected:347`, `connectedDeviceInfo.configName`), so `profile` typing narrows from `DeviceProfile` to `DeviceDescriptor | null` — update the `DeviceMatch` interface (`:24-32`) accordingly.

*Tests (same commit):* per §8 — DELETE `device-profile.test.ts`, `device-registry.test.ts`, `device-iterator.test.ts`; DELETE `device-detection.test.ts` alongside `device-detection.utils.ts` (its assertions were already ported into `device-catalog.test.ts` in Stage 1.2); REWRITE `tests/unit/main/device.service.test.ts`. All land in this stage's commit.
*Validation (full gate set):* `npm run typecheck && npm run lint && npm run test:run && npm run build:vite && npm run dev:smoke`.

---

### Stage 5 — HIGH: rewire the main boot path
**5.1 — `src/main/application/container.ts` (coverage-measured main).**
- Remove imports `DeviceProfileRegistry` (`:12`), `DeviceChromaticProfile` (`:19`), and `type ProfileClass` (`:15`). Keep `chromaticConfig` only if still used elsewhere (it is referenced at `:131`, which is being deleted — so drop `:20` too).
- `ContainerDependencies` (`:38-53`): remove `profileRegistry: DeviceProfileRegistry;` (`:46`).
- Constructor `keys` array (`:64-69`): remove `'profileRegistry'`.
- `resolve()` switch: delete the `case 'profileRegistry'` (`:126-128`); in `case 'deviceService'` (`:129-139`) drop the `profileClasses` Map (`:130-132`) and the `profileRegistry: this.resolve('profileRegistry')` dependency — construct `new DeviceService({ eventBus, loggerFactory })` (no 2nd arg).
- The eager `deviceService.initialize()` (`:196-197`) stays — now exercises the lightweight manifest guarantee.

*Tests (same commit):* **none.** Verified (`grep -rn "profileRegistry" tests` 2026-06-28): no main-container test asserts the `profileRegistry` token — `tests/unit/main/application/container.shutdown.test.ts` does not reference it. The only `profileRegistry`/`DeviceProfileRegistry` test references are the `DeviceService` constructor-arg mocks in `tests/unit/main/device.service.test.ts`, which are removed in **Stage 4** (4.5 rewrite). So Stage 5's source change has no test counterpart and the commit is green on its own.
*Validation (full gate set + the real safety net):* `npm run typecheck && npm run lint && npm run test:run && npm run build:vite && npm run dev:smoke`, then `npm run test:e2e` (or at minimum the two device specs) — see §6.

---

## 5. Tests touched (detail in §8)
DELETE: `device-profile.test.ts` (324), `device-registry.test.ts` (337), `device-iterator.test.ts` (148). REWRITE: `device-detection.test.ts` (107), `chromatic-device-config.test.ts` (202), `tests/unit/main/device.service.test.ts` (457). MODIFY: `streaming-adapter.factory.test.ts` (324). ADD: `device-catalog.test.ts` (Stage 1.2).

---

## 6. Gates checklist

Run before pushing (the husky pre-commit hook runs only `test:run`; the rest are manual):

| Gate | Command | Phase-1 note |
|------|---------|--------------|
| typecheck | `npm run typecheck` | Catches barrel/import re-points (`@prismgb/devices`, `/service`) and the `DeviceMatch.profile` narrowing. |
| lint + boundaries | `npm run lint` (`eslint` + `scripts/check-layer-boundaries.js`) | New `device-catalog.ts` is browser-safe (manifest-only import) — must not pull node/native. Confirms the renderer barrel stays usb-free. |
| unit | `npm run test:run` | Full suite (4 vitest projects). Expect the deletions/rewrites of §8 reflected in the count. |
| renderer build | `npm run build:vite` | Proves the renderer bundle still resolves `@prismgb/devices` (index barrel) with `DeviceRegistry`/`forEachDeviceWithModule` gone. |
| **runtime boot** | `npm run dev:smoke` | **Primary safety net.** Boots `npm run dev`, waits for "Renderer application started successfully", fails on DI-resolution errors. Exercises both eager `DeviceService.initialize()` and `StreamingAdapterFactory.initialize()`. |
| **device e2e** | `npm run test:e2e` (≥ `device-connection.spec.js` + `device-streaming.spec.js`) | The other real net — full connection + streaming boot under the mock Chromatic. |
| codegen-drift | `node scripts/generate-di.js && node scripts/generate-contracts.js` (the `pretest` pair) | **No-op for this phase.** Verified: `generate-contracts.js` reads `packages/prismgb-ipc/src/ipc.manifest.json` (`:9`) and the IPC `isValidDeviceInfo` validator — **not** the device package. `generate-di.js` carries zero device tokens. No device file feeds either generator; expect zero drift. (Stated so the executor does not chase a phantom drift gate.) |
| coverage ratchet | `npm run coverage:ratchet` | Monotonic on `src/**` by scope. Package deletions are out-of-scope (neutral). The measured deltas are `streaming-adapter.factory.ts` (~−55) and `container.ts` (~−25) — removing **covered** lines; expect neutral-or-up. If a covered branch in those two files is removed leaving an uncovered remainder, re-check; do not bypass. |

---

## 7. Rollback

Single squash-merged PR off `refactor/codebase_reduction` (per the spine's branch-per-phase convention). Concrete revert paths:
- **Pre-merge, mid-stage:** `git reset --hard <stage-N-1 commit>` (commit-per-stage; the deleted files are recoverable from the prior commit). The 6 deleted files and the manifest are plain source/JSON — no data migration, no generated artifact to restore.
- **Post-merge:** `git revert -m 1 <merge-commit>` restores `device-profile.base.ts`, both registries, the iterator/detection utils, the chromatic profile, the un-flattened config, and the old `device.service.ts`/`container.ts`/`streaming-adapter.factory.ts`/barrels in one shot.
- **No external state:** `device.manifest.json` is unchanged by this phase (only read differently); no DB, cache, or config file outside git is touched. `dist/` is gitignored and source-aliased, so nothing stale to purge.
- **Tag before Stage 4** (the HIGH framework-delete): `git tag phase1-pre-collapse` per the project methodology's high-risk-checkpoint rule.

---

## 8. Test plan

**Coverage-scope impact:** every deleted/rewritten package test exercises `packages/prismgb-devices/src/**`, which is **outside** `src/**` (`vitest.config.js:35`) — these tests contribute **zero** to the ratchet, so deleting/rewriting them is coverage-neutral. `tests/unit/main/device.service.test.ts` tests the package `DeviceService` (also out of scope). The coverage-measured src touched is `streaming-adapter.factory.ts` (renderer), `device-storage.service.ts` (renderer, Stage 3.2 re-point — net-0, no dedicated test), and `container.ts` (main); the factory and container existing tests are adjusted to keep those lines covered.

Each row's **Stage** is the commit in which its action lands **atomically with the source change** (see §4 commit-atomicity).

| Test file | LOC | Stage | Action | Reason |
|-----------|----:|:-----:|--------|--------|
| `…/services/device-profile.test.ts` | 324 | 4 | **DELETE** | Tests `DeviceProfile` base class (deleted in 4.1) — defaulting, validation, `toJSON`, `getMediaConstraints`. |
| `…/services/device-registry.test.ts` | 337 | 4 | **DELETE** | Tests `DeviceRegistry` round-trip API + `DeviceChromaticProfile.matchesLabel` (`:270-277`) — all deleted in 4.1/4.2. |
| `…/services/device-iterator.test.ts` | 148 | 4 | **DELETE** | Tests `forEachDeviceWithModule` (deleted in 4.2). |
| `…/services/device-detection.test.ts` | 107 | 1.2 port / 4 delete | **REWRITE → fold into** `device-catalog.test.ts` | `DeviceDetectionHelper` behavior is preserved through the facade; assertions are **ported into the catalog test in Stage 1.2**, and this file is **deleted in Stage 4** alongside its source `device-detection.utils.ts` (4.2) — avoids an intermediate red. |
| `…/services/chromatic-device-config.test.ts` | 202 | 2 | **REWRITE (~−60)** | Drop the `matchesUSB`/`matchesLabel` describe blocks (`:1-` head shows them) — those helpers are removed in 2.1. Keep `getResolutionByScale` + config-value assertions; **ADD** an assertion that `chromaticConfig.rendering.preferredRenderer === 'canvas'` (locks the caveat mitigation). |
| `tests/unit/main/device.service.test.ts` | 457 | 4 | **REWRITE (~−200)** | Remove the 35 references to `DeviceRegistry.registerProfileClass`/`getProfileClass`, `forEachDeviceWithModule`, `mockProfileRegistry`, `_profileClasses` (`:13-30,70-117,141-217`) — also clears the `profileRegistry` constructor-arg mocks (`:78,88,117,372`) ahead of Stage 5. Rewrite `initialize` tests to the lightweight manifest-guarantee semantics; `matchDevice` tests assert against the descriptor matcher. |
| `…/factories/streaming-adapter.factory.test.ts` | 324 | 3 | **MODIFY (~−40)** | Drop the `DeviceRegistry` round-trip mock/expectations in the `initialize`/registration blocks; keep `detectDeviceId`, `getAdapter*`, `hasAdapter` blocks (the adapter Map is still injected). |
| `tests/unit/.../device-catalog.test.ts` | +~120 | 1.2 | **ADD** | New seam coverage (Stage 1.2). |

**No test counterpart:** Stage 3.2 (`device-storage.service.ts` re-point) and Stage 5 (main `container.ts` rewire) have **no** test row — verified there is no `DeviceStorageService` unit test and no main-container test asserting the `profileRegistry` token, so those source-only commits stay green on their own.

**`dev:smoke` expectation:** boots clean, prints "Renderer application started successfully", no DI-resolution error for `deviceService`/`profileRegistry` (the latter token is gone — its absence must not be referenced anywhere; typecheck guards this). **e2e expectation:** `device-connection.spec.js` and `device-streaming.spec.js` pass unchanged — the mock Chromatic still matches via `matchDevice` (manifest USB `14158:257` / label patterns) and streams.

---

## 9. Definition of done
- All six files in §2 deleted; `device-catalog.ts` added; the five transformed files (incl. the `device-storage.service.ts` Stage 3.2 re-point) at their target LOC (record actual `wc -l`); the two barrels re-pointed.
- Both renderer `DeviceRegistry` consumers were re-pointed: `grep -rn "DeviceRegistry\|forEachDeviceWithModule" src` returns **zero** — proving `streaming-adapter.factory.ts` (Stage 3.1) AND `device-storage.service.ts` (Stage 3.2) no longer reference the deleted round-trip API.
- The hard ordering dependency was honored: `preferredRenderer:'canvas'` was added (Stage 2.1) before the base class was deleted (Stage 4.1); `chromatic-device-config.test.ts` asserts it.
- The guardrail held: `@prismgb/devices` (index) exports no node/native symbol; `DeviceService` and friends remain behind `@prismgb/devices/service`; `check-layer-boundaries.js` passes.
- Full gate set green: `typecheck` · `lint` · `test:run` · `build:vite` · `dev:smoke` · `coverage:ratchet` (neutral-or-up).
- The real safety net green: `device-connection.spec.js` + `device-streaming.spec.js`.
- Net measured: ~−1,030-1,250 src (≈−80 coverage-measured) + ~−800 test, matching the inherited Dim 18 ~−1,050-1,250 figures (the computed low end is ~20 LOC under the catalogue's round ~−1,050, within estimate tolerance).
- One squash-merged PR; conventional commit subject ≤100 chars, no AI/tool attribution; no `--no-verify`.
