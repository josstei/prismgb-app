# Phase 3 — IPC → electron-trpc + Validation → Zod

> ## ⚠️ SPIKE-B (2026-06-28) — electron-trpc works ONLY pinned to tRPC 10. Owner picks the Phase-3 path before executing.
>
> Spike-B ran the gate in worktrees. **Against `@trpc 11.18` it FAILED** (Gate-0 peer-range passed but was misleading; transport broke). electron-trpc 0.7.1 is a tRPC-10-era package: 5 breaks, the **fatal** one unpatchable-without-fork — the main `te()` routes via tRPC-10's boolean `procedure._def['subscription']` (now `undefined`; tRPC 11 uses `_def.type==='subscription'`) → **every** procedure NOT_FOUND. (Others: no `./preload` export; `main.mjs`'s `import {ipcMain,contextBridge,ipcRenderer} from 'electron'` breaks ESM main; unbundlable into the IIFE preload; `ipcLink` reads the removed `runtime.transformer.serialize`.) **But a retest on its NATIVE pairing — `@trpc/* 10.45.4` + `electron-trpc 0.7.1` + `zod 3` — WORKED END-TO-END** (the main observable subscribed and the renderer received progress events under `sandbox:true` + `script-src 'self'`) using only the 2 version-independent build shims (#2 `main.mjs` namespace `import`, #3 the ~6-line inline preload bridge — replacing the broken `electron-trpc/main` preload import). Breaks #4/#5 are tRPC-10-native and need no patch on v10.
>
> **So Phase 3 is an OWNER CHOICE:**
> - **(A) Take the tRPC swap pinned to tRPC 10** — the **full ~−1,300-1,500 LOC** of this doc's Stages 0-4, but with deps pinned to `@trpc/* @10.45.4` + `electron-trpc 0.7.1` + `zod 3`, Zod validation via tRPC-10's `.input()`, and **two shims** (#3 = app code; **#2 requires `patch-package` on `node_modules/electron-trpc`**). COST: the app's entire renderer↔main boundary rides a **frozen tRPC major** (11 is the maintained line) + an **unmaintained package** (electron-trpc, last pub 2024-12) — zero future-proofing. This matches the owner's "nothing off limits / maximal reduction" stance, with the staleness as the accepted price. **If (A): re-pin every `@trpc 11`/`zod 4` reference in the Stages below to the v10/zod-3 equivalents, and the `.subscription(()=>observable())` form (NOT tRPC-11 async-generators).**
> - **(B) Keep-and-simplify (§10 option 2)** — retain the manifest/cradle stack, ship only the in-arch wins (`dead-ipc-payload-aliases` −8, `transcode-format-set-single-source` ~0, `ipc-error-envelope-mapper-factory` ~−50). **~−58 LOC**, zero new deps, zero staleness. The conservative floor.
> - **(C) tRPC 11 cleanly** — not available off-the-shelf (no electron-trpc 11 release; tipc also stale). Would need a future spike of a maintained typed-IPC layer.
>
> Full evidence chain (both runs): session scratchpad `SPIKE-B-VERDICT.md`. The Stages 0-4 below are written for tRPC 11; **under path (A) they execute as-is EXCEPT pinned to tRPC 10** (see the re-pin note); under (B)/(C) they are deferred.
>
> Inherits scope and caveats from `docs/refactor-execution/00-overview.md` (the spine) and `docs/refactor-aggressive-reduction-options.md` (Dimensions 15 + 17, Part II `dead-ipc-payload-aliases` / `transcode-format-set-single-source`). ~~**CONDITIONAL on Spike-B.**~~ Spike-B resolved — see banner above.

---

## 1. Inherited status & caveats

**Options-doc verdict (carried forward verbatim in substance):**

- **`ipc-trpc` (Dimension 15)** — `needs-spike → recommend`, the *single strongest framework fit*. The renderer↔main `cradle`/manifest machinery is a hand-rolled tRPC. Gross **~−2,100**; net **~−1,300 to −1,500**; coverage-src net **~−700 to −900** (much of the renderer-consumer code is *churn*, re-pointed to `client.x.subscribe()`, **not** deletion).
- **Validation → Zod (Dimension 17)** — `viable-tradeoff (IPC-coupled)`, ~−80 standalone. It *rides* the IPC swap; the `joi` dep (one non-test consumer, `packages/prismgb-config/src/config-loader.utils.ts:8`) folds onto Zod and is then removable.
- **`dead-ipc-payload-aliases` (Part II)** — `confirmed`, −8, the one clean ship-today win. Verified zero-consumer this session (8/8 aliases, 0 external references).
- **`transcode-format-set-single-source` (Part II)** — `confirmed`, ~0 LOC. A drift-prevention win (single `import type` leg), **not** a reduction.

**Superseded-into-this-phase (do NOT execute as standalone seams — they fold into the router rewrite):**

- `ipc-error-envelope-mapper-factory` / `ipc-failure-envelope-seam` — **⊘P3.** The 15 `mapError` closures fold into a single `resultEnvelope()` helper inside the router (§5, Stage 3).
- `ipc-result-envelope-engine` / `activate-dormant-responsemode-success-envelope` — **⊘P3.** The `responseMode:'bare'|'result-envelope'` machinery (`ipc-handler.descriptor.ts:8`) is deleted with the manifest.
- `registry-interface-dedup` / `dedupe-main-service-structural-contracts (b)` — **⊘P3.** The hand-written handler interfaces (`DeviceService`, `TranscodeService`, … in `ipc-handler.registry.ts:25-56`) are replaced by tRPC procedure types + the router `ctx` type.
- `validators-library-extraction` — **⊘P3.** `validators.generated.ts` is *deleted*, not extracted; Zod replaces it.

**LOAD-BEARING TRADES — carry forward, do NOT launder into confidence:**

- **(a) Weakens the `eventChannels`→`@prismgb/events` parity guard.** `ipc.manifest.ts:46-65` (`assertIpcChannelsMatchManifest`) cross-validates the IPC channel map against the manifest today, and the manifest's `eventChannels` blocks (`ipc.manifest.json:13,58,111,226`) tie push channels to renderer bridge consumers. tRPC models none of this. After this phase the channel↔event mapping is **hand-maintained**. We pay the trade down with one unit test (§8) asserting the relocated `IPC_CHANNELS` matches `@prismgb/events` `EventChannels` — but it is no longer a build-time structural invariant.
- **(b) `.output(z)` is NOT automatic.** tRPC validates `.input(z)` automatically; it does **not** validate subscription payloads unless `.output(z)` is added to *every* subscription procedure. The 9 payload validators (`preloadPayloadValidators` in `validators.generated.ts`, e.g. `isValidDeviceInfo`, `isValidTranscodeProgress`) are the current defense-in-depth. **Every subscription must carry `.output(z…)` or the guard is silently dropped.** This is an explicit per-procedure checklist item (§5, Stage 4), not a default.
- **(c) `electron-trpc` is stale.** `0.7.1` was last published **2024-12-07** (~18 months), with only `1.0.0-alpha` ahead. It is a maintenance risk on the app's *entire* renderer↔main boundary. **Spike-B must confirm `electron-trpc@0.7.1` resolves and runs against `@trpc 11.18`** before any wiring — peer-range mismatch is the cheapest possible fail (§2, Gate-0).
- **(d) `worker-protocol.config.ts` STAYS — not Zod.** `src/renderer/infrastructure/rendering/workers/worker-protocol.config.ts` (357 LOC, verified) carries `OffscreenCanvas`/`ImageBitmap` transferables (Zod can only `z.custom`-relocate, not remove the guard), its conditional required/optional typing is *more precise* than `z.infer`, and it is a same-app worker boundary. Options-doc `keep` verdict. **Out of scope for this phase.**
- **(e) gpu/loginItem QUERY graceful-fallback is not auto-replaced.** Distinct from trade (b) (subscriptions): only `gpuAPI.getPolicy` and `loginItemAPI.get` carry the preload `createResponseFallbackInvoker`/`responsePolicy` guard (`inline.preload-api.ts:21-34`) — on a `{success:false}`/malformed response it returns `policy.fallback` instead of surfacing the envelope (metrics/shell use plain invoke, so this is scoped to *these two queries only*). tRPC's `.input(z)` (input-only) and trade-(b) `.output(z)` (subscriptions-only) re-establish neither for queries. The plan therefore adds `.output(z)` to the `gpu.getPolicy`/`loginItem.get` queries (§5 Stage 1 task 5, Stage 2 task 9) and reconciles the **two** consumers (§5 Stage 3 task 14) — which are *asymmetric*: `capability-detector.utils.ts:11-12` (`getGpuPolicyWithFallback`) is the genuine exposure (it reads `gpuPolicy.skipWebGPU` with **no** `.success` check, so a resultEnvelope `{success:false}` reads `undefined`→falsy and the UA fallback never fires) and needs an explicit failure→fallback map; `settings.service.ts:208-209` (`_readLoginItemSetting`) already guards (`result.success ? result.enabled : false` + try/catch→stored) and only needs *verification* against the new tRPC error shape, not new mapping.

**Scope-tag reconciliation (overview §scope-resolution `meta-codegen-elimination`):** each framework phase deletes **its own** generator directly — **P2 deletes `scripts/generate-di.js`**, **P3 deletes `scripts/generate-contracts.js`** (it is dead the instant its two outputs `validators.generated.ts`/`preload-api.d.ts` are deleted and its `pretest` half is removed — this subsystem's generator, not a generic sweep). **P5 only *verifies*** both generators are gone and sweeps residual references (the `generate:contracts` npm alias, any `pretest`/`knip` straggler, vestigial turbo). No double-counting.

---

## 2. Spike gate (Spike-B) — run in an isolated worktree before any wiring

> Per `~/.claude/CLAUDE.md`: a mutating spike MUST run in its own git worktree so the clean branch's `package.json`/lockfile/`node_modules` are untouched. One executor per tree.

```bash
# from repo root, on a clean tree
git worktree add ../prismgb-spike-b refactor/codebase_reduction
cd ../prismgb-spike-b
```

**Gate-0 — peer-range resolution (cheapest fail; run FIRST, before any install):**

```bash
npm view electron-trpc@0.7.1 peerDependencies
npm view electron-trpc@0.7.1 dependencies
npm view @trpc/server@11.18 version
```

- **PASS:** `electron-trpc@0.7.1` peer `@trpc/server`/`@trpc/client` admits `11.x` (or is unpinned). **FAIL** (peer pins `^10` and rejects 11): stop here → **Fallback (§10)**. Do not write wiring code against an unresolvable peer.

**Gate-1 — install + end-to-end `transcode:progress` subscription under `sandbox:true`:**

```bash
npm i @trpc/server@^11.18 @trpc/client@^11.18 electron-trpc@^0.7.1 zod@^4.4
# minimal wiring (throwaway, in the worktree):
#  - main:     initTRPC + a 'transcode.onProgress' subscription that yields from a Node EventEmitter,
#              createIPCHandler({ router, windows:[mainWindow] }) at the registerHandlers() call site
#              (src/main/application/app.orchestrator.ts:107)
#  - preload:  exposeElectronTRPC() (electron-trpc/preload) — must work under
#              webPreferences { sandbox:true, contextIsolation:true, nodeIntegration:false }
#              (src/main/infrastructure/window/window.service.ts:96-100)
#  - renderer: createTRPCProxyClient<AppRouter>({ links:[ipcLink()] });
#              client.transcode.onProgress.subscribe(undefined, { onData: console.log })
#  - drive one ee.emit('transcode:progress', {percent:50}) from main on a timer
npm run build:vite
npm run dev:smoke
```

- **PASS criteria (ALL):**
  1. `npm run build:vite` succeeds — no Node-builtin polyfill error in the renderer bundle, `electron-trpc/renderer` + `@trpc/client` tree-shake cleanly under Vite 7.
  2. `npm run dev:smoke` prints `Renderer application started successfully` (script: `scripts/dev-boot-smoke.js`).
  3. The renderer `onData` callback fires with `{percent:50}` end-to-end (capture in the dev console / smoke log) under `sandbox:true` — i.e. `exposeElectronTRPC()` is reachable across the contextBridge with no CSP (`script-src 'self'`, `src/renderer/index.html:6`) violation.
- **FAIL (any):** tear down the worktree, do NOT merge anything, go to **Fallback (§10)**.

```bash
# teardown regardless of result (record findings first):
cd ../prismgb-app && git worktree remove ../prismgb-spike-b --force
```

---

## 3. Scope

### EXECUTES
- Dimension 15 `ipc-trpc` — replace the manifest/cradle/preload-factory IPC stack with electron-trpc.
- Dimension 17 Zod — `.input(z)` security/input validation + `.output(z)` subscription payload guards; fold `config-loader` joi→Zod; drop the `joi` dependency.
- `dead-ipc-payload-aliases` — delete the 8 zero-consumer `Ipc*` re-export aliases.
- `transcode-format-set-single-source` — make `@prismgb/ipc`'s `TranscodeFormat` derive (type-only) from `@prismgb/transcode`'s config.

### DELETES (verified by `wc -l`)
| Path | LOC | Note |
|------|----:|------|
| `scripts/generate-contracts.js` | 526 | generator for the two files below; remove from `pretest` |
| `src/preload/validators.generated.ts` | 347 | replaced by Zod schemas |
| `src/types/preload-api.d.ts` | 109 | tRPC client types replace the `Window.*API` globals |
| `src/preload/subscription.factory.ts` | 198 | replaced by tRPC client subscriptions |
| `src/preload/exposure.factory.ts` | 57 | replaced by `exposeElectronTRPC()` |
| `src/preload/listener-registry.ts` | 13 | listener bookkeeping moves into tRPC/electron-trpc |
| `src/preload/apis/device.preload-api.ts` | 39 | — |
| `src/preload/apis/inline.preload-api.ts` | 64 | — |
| `src/preload/apis/transcode.preload-api.ts` | 46 | — |
| `src/preload/apis/update.preload-api.ts` | 19 | — |
| `src/preload/apis/window.preload-api.ts` | 18 | — |
| `packages/prismgb-ipc/src/ipc.manifest.json` | 301 | the manifest data |
| `packages/prismgb-ipc/src/ipc.manifest.ts` (parity machinery) | ~51 of 65 | `createIpcChannels`/`assertIpcChannelsMatchManifest`; **`IPC_CHANNELS` (lines 6-19) is RELOCATED, not deleted** |
| `packages/prismgb-ipc/src/ipc-handler.descriptor.ts` | 176 | `defineManifestIpcHandlers`/`responseMode`/registration machinery |
| 8 `Ipc*` aliases in `packages/prismgb-ipc/src/index.ts` (6-29) | ~8 | `IpcDeviceInfoPayload`, `IpcUpdateInfoPayload`, `IpcUpdateProgressPayload`, `IpcUpdateErrorPayload`, `IpcTranscodeProgressPayload`, `IpcTranscodeCompletedPayload`, `IpcTranscodeCancelledPayload`, `IpcTranscodeErrorPayload` |

**Gross delete ≈ 2,060 LOC** (≈ −2,100 with the partial manifest.ts + alias lines), matching the catalogue.

**Rewritten-down (not clean deletes — net reduction, counted toward net):**
- `src/preload/index.ts` (77) → ~5-line `exposeElectronTRPC()` preload (net −72).
- `src/main/ipc/ipc-handler.registry.ts` (168) → replaced by `createIPCHandler` wiring (~15 LOC); the registry's manifest cross-validation (`createIpcHandlerRegistrationGroups`, lines 73-100) is deleted outright.
- The 8 `src/main/ipc/handlers/*.handler.ts` **bodies are reused** inside router procedures; the descriptor/`mapError`/`defineManifestIpcHandlers` scaffolding around them is removed.

### ADDS
- **deps:** `@trpc/server@^11.18`, `@trpc/client@^11.18`, `electron-trpc@^0.7.1`, `zod@^4.4`. **Removes:** `joi` (after config-loader fold).
- **new files:**
  | Path | Est LOC | Responsibility |
  |------|--------:|----------------|
  | `src/main/ipc/trpc.ts` | ~40 | `initTRPC.context<IpcContext>()`, `router`/`publicProcedure`, `resultEnvelope()` helper (the folded `mapError`) |
  | `src/main/ipc/router.ts` | ~180 | `appRouter` with per-namespace sub-routers; reuses handler bodies; `export type AppRouter` |
  | `src/main/ipc/event-bridge.ts` | ~40 | a process-local `EventEmitter` (`IpcPushBridge`) per push channel; DI token `ipcPushBridge` |
  | `src/main/ipc/schemas/*.ts` | ~120 | Zod input schemas (security) + subscription `.output` schemas, by namespace |
  | `packages/prismgb-ipc/src/ipc-channels.ts` | ~16 | relocated `IPC_CHANNELS` const + `IpcChannels` type |
  | `src/renderer/infrastructure/ipc/trpc-client.ts` | ~25 | `createTRPCProxyClient<AppRouter>({ links:[ipcLink()] })`; `import type { AppRouter }` (boundary exception, §5 Stage 0) |
  | `src/preload/index.ts` (rewrite) | ~5 | `exposeElectronTRPC()` |

**Net ≈ −1,300 to −1,500 LOC; coverage-src net ≈ −700 to −900.**

---

## 4. Current → target state

**Current.** A hand-rolled contract pipeline: `ipc.manifest.json` (single source) → `generate-contracts.js` emits `preload-api.d.ts` (the `Window.*API` typings) + `validators.generated.ts` (input + payload validators). The preload (`src/preload/index.ts` → `subscription.factory.ts` + `apis/*` + `exposure.factory.ts`) reads the manifest at runtime to build per-API `invoke`/`on*` methods and `contextBridge.exposeInMainWorld`. Main registers handlers via `IpcHandlerRegistry` (`ipc-handler.registry.ts`) using `defineManifestIpcHandlers` descriptors with `responseMode` + `mapError` envelopes. Push (main→renderer) funnels through `WindowService.send(channel, data)` → `webContents.send` (`window.service.ts:319`), fed by `DeviceBridgeService` (`packages/prismgb-devices/src/device-bridge.service.ts:65-67`), `UpdateService._notifyRenderer` (`packages/prismgb-updates/src/update.service.ts:257`), `TranscodeService._notifyRenderer` (`packages/prismgb-transcode/src/transcode.service.ts:351`), and `WindowService` itself (`:180-186`). Renderer consumes `window.*API.on*` via `preload-event-bridge.factory.ts` (335 LOC) + adapters, republishing to `@prismgb/events`.

**Target.** A typed tRPC boundary. `src/main/ipc/router.ts` exposes `appRouter`: `.query`/`.mutation` procedures (invoke handler bodies reused, `.input(z)` security validation, `resultEnvelope()` for the failure shape) + `.subscription` procedures (`.output(z)` payload guard, yielding from a per-channel `EventEmitter`). `createIPCHandler({ router: appRouter, windows })` (main) + `exposeElectronTRPC()` (preload) + `ipcLink()` (renderer) carry the transport. `WindowService.send` is repointed from `webContents.send` to `ipcPushBridge.emit(channel, payload)` — so the 3 package emitters are **unchanged** (single-funnel preserved). The renderer drops the preload globals and calls `trpcClient.<ns>.<proc>.query/mutate/subscribe`. `IPC_CHANNELS` survives in `ipc-channels.ts`; the manifest + cross-validation are gone.

---

## 5. Ordered task breakdown (risk-tiered)

> Per the project Execution Planning Methodology. Each task: exact files, the change, the validation command. Run the gate at the end of each Stage, not per task. Pre-specified paths — no exploration needed.

### Stage 0 — boundary + channel groundwork (LOW/MED, no behavior change) — ME
The renderer must `import type { AppRouter }` from `src/main/ipc/router.ts`; the layer checker forbids `RENDERER_INFRASTRUCTURE → MAIN_IPC` and its import regex (`scripts/check-layer-boundaries.js:212`) does **not** skip type-only imports (`FORBIDDEN_LAYER_MAP[RENDERER_INFRASTRUCTURE]` includes `MAIN_IPC`).

1. **`scripts/check-layer-boundaries.js`** — teach `getImportSpecifiers`/the analyzer to mark whether a specifier is `import type`-only, and exempt type-only specifiers from the renderer→main rule **only** (documented: type-only imports carry zero runtime coupling; required for electron-trpc end-to-end inference). Add a focused comment citing the `AppRouter` import. Keep all value-import rules intact. *Validation:* `npm run lint` (must still flag a value import renderer→main — add a temporary probe, confirm it fails, remove it).
2. **`packages/prismgb-ipc/src/ipc-channels.ts`** (new) — move the `IPC_CHANNELS` const + `IpcChannels`/`IpcManifest`-independent type out of `ipc.manifest.ts:6-19`. No JSON import. *6 live consumers must keep resolving:* `device-bridge.service.ts`, `update.service.ts`, `transcode.service.ts`, `window.service.ts`, `src/preload/index.ts` (until rewritten), `index.ts` re-export.
3. **`packages/prismgb-ipc/src/index.ts`** — re-export `IPC_CHANNELS`/`IpcChannels` from `./ipc-channels.js`; **delete the 8 `Ipc*` aliases** (lines 6-29, keep the canonical names). *Validation:* `npm run typecheck`.
4. **`packages/prismgb-ipc/src/preload-api.contract.ts:62`** — change `export type TranscodeFormat = 'webm' | 'mp4' | 'mov'` to derive from `@prismgb/transcode` config: `import type { TRANSCODE_CONFIG } from '@prismgb/transcode'; export type TranscodeFormat = keyof typeof TRANSCODE_CONFIG['formats']`. **Direction note (cycle risk):** `transcode.service.ts` already imports `IPC_CHANNELS` (value) *from* `@prismgb/ipc`; this adds an ipc→transcode *type-only* leg (erased at runtime, but tsc + the package graph see it). Verify no type cycle: `npm run typecheck && npm run build:vite`. If a graph cycle warns, invert (move the canonical `TranscodeFormat` to `@prismgb/transcode` and re-export type-only from ipc).

**Gate:** `npm run typecheck && npm run lint`.

### Stage 1 — Zod schemas + the push EventEmitter bridge (MED, additive) — ME
5. **`src/main/ipc/schemas/`** (new, by namespace) — author Zod schemas porting `validators.generated.ts`:
   - **Input/security** (→ `.input`): `external-url` (`isValidExternalUrl` — `z.string().url().max(2048).refine(http|https)`), `boolean-argument`, `transcode-start-params` (`isValidTranscodeParams` — ArrayBuffer + format ∈ `TRANSCODE_CONFIG.formats`), `ffmpeg-input-args` (`isValidFfmpegArgs`), `transcode-job-id`.
   - **Output/subscription payload** (→ `.output`, trade (b)): one schema per payload type for `device-info`, `nullable-device-info`, `update-info`, `update-progress`, `update-error`, `transcode-progress`, `transcode-completed`, `transcode-error`, `transcode-cancelled` (`preloadPayloadValidators` in `validators.generated.ts`).
   - **Output/query payload** (→ `.output`, trade (e)): two query-output schemas restoring the preload `responsePolicy` fallback contract — `gpu-policy` (`isValidGpuPolicy`) for `gpu.getPolicy` and a login-item-status schema for `loginItem.get`.
6. **`src/main/ipc/event-bridge.ts`** (new) — `IpcPushBridge` wrapping a Node `EventEmitter` (raise `setMaxListeners` to cover the windowed subscribers; `MAX_LISTENERS_PER_CHANNEL` was 10). Methods: `emit(channel, payload)`, `on(channel, listener)`/`off`. Register DI token `ipcPushBridge` in the main container — **order-aware:** if P2 has **not** landed, add it to the dependency list at `src/main/application/container.ts:66-67` + a `case` in the resolve switch; **if P2 has landed**, that switch is gone — register `ipcPushBridge` as an `asClass`/`asFunction` entry in `src/main/application/di-registry.ts` instead.
7. **`src/main/infrastructure/window/window.service.ts`** — inject `ipcPushBridge`; change `send()` body (`:318-321`) from `this.mainWindow.webContents.send(channel, ...args)` to `this.ipcPushBridge.emit(channel, args[0])`. **The 3 package emitters (`device-bridge`, `update.service`, `transcode.service`) call `windowService.send` and are UNCHANGED** — single-funnel preserved. *Design note:* keeping `WindowService.send` as a thin forwarder is deliberate (minimizes blast radius vs injecting the bridge into each package emitter; the latter is a future cleanup, not this phase).

**Gate:** `npm run typecheck && npm run test:run` (new schema unit tests; §8).

### Stage 2 — the tRPC router (HIGH, behavioral) — ME, sequentially
8. **`src/main/ipc/trpc.ts`** (new) — `interface IpcContext` carrying the same dependency set the registry resolves today (`ipc-handler.registry.ts:136-145`: `deviceService`, `updateService`, `windowService`, `transcodeService`, `loginItemService`, `app`, `shell`, `logger`, plus `ipcPushBridge`). `const t = initTRPC.context<IpcContext>().create()`. Export `router`, `publicProcedure`, and **`resultEnvelope(fn, mapError)`** — the single folded replacement for the 15 per-handler `mapError` closures (⊘ `ipc-error-envelope-mapper-factory`): runs `fn`, on throw returns `mapError(error, ctx)` (the typed `{success:false,error}` shape). **Scope of the no-throw guarantee — read carefully:** `resultEnvelope` covers only the **resolver/handler-error** path; on a *handler* failure the procedure returns the `{success:false,error}` envelope (current wire shape preserved, renderer churn minimal). It does **NOT** cover the **validation** paths — `.input(z)` throws `TRPCError(BAD_REQUEST)` *before the resolver runs*, and `.output(z)` errors the call if the payload is malformed. Those are genuine behavior changes from today (§ below) and are intentional: a rejected URL/format/payload *should* surface as an error at a renderer→main trust boundary rather than resolve a `{success:false}` fallback. Do **not** strip `.input(z)`/`.output(z)` to restore the old graceful-fallback — that would discard the typed-input inference that justifies the swap.

   **Behavior delta the executor must honor (not a bug to "fix back"):**
   - *Invalid input:* today `createDefaultInvokeMethod` (`subscription.factory.ts:124-129`) `console.warn`s and resolves the `{success:false,error}` *fallback* (shape enforced by `isValidIpcFailureResult`). Under `.input(z)` the client **rejects**. Affects the ~5 sites with `argumentValidators` (`shellAPI.openExternal`, `transcodeAPI.start/cancel`, …).
   - *Malformed subscription payload:* today the listener silently **drops** the event and keeps the stream alive (`subscription.factory.ts:189`). Under `.output(z)` a malformed payload **errors the subscription** server-side.
9. **`src/main/ipc/router.ts`** (new) — `appRouter = router({ device, shell, window, update, performance, gpu, loginItem, transcode })`. Each sub-router ports its handler file 1:1:
   - **invoke → `.input(z).query|mutation`** reusing the body. e.g. `transcode.start`: `.input(transcodeStartSchema).mutation(({input, ctx}) => resultEnvelope(() => ctx.transcodeService.transcode(toBuffer(input)), mapTranscodeStartError))` (body from `transcode.handler.ts:55-74`). `device.getDeviceStatus` from `device.handler.ts:22-51` (keep the test-mode mock branch). `shell.openExternal` carries `.input(externalUrlSchema)` (the security validator). `gpu.getPolicy` and `loginItem.get` additionally carry `.output(z)` (trade (e)) so a malformed/`{success:false}` payload **errors the call** rather than silently resolving — preserving, at the consumer (task 14), the graceful-fallback contract the preload `responsePolicy` guard provided.
   - **subscription → `.subscription(() => observable|async-generator).output(z)`** yielding from `ctx.ipcPushBridge.on(IPC_CHANNELS.<NS>.<EVT>, …)`. **Add `.output(z)` to ALL of: `device.onConnected/onDisconnected`, `window.onEnterFullscreen/onLeaveFullscreen/onResized`, `update.onAvailable/onNotAvailable/onProgress/onDownloaded/onError`, `transcode.onProgress/onCompleted/onError/onCancelled`** (trade (b) — checklist, 14 procedures; `void`-payload ones use `z.void()`).
   - `export type AppRouter = typeof appRouter`.
10. **`src/main/ipc/ipc-handler.registry.ts`** — replace registration with electron-trpc. Either reduce this file to a thin `createIPCHandler({ router: appRouter, windows: [windowService.getMainWindow()] })` wrapper, or inline it at the call site. Wire at `src/main/application/app.orchestrator.ts:107` (where `registerHandlers()` is called) and keep the `dispose()` teardown. Delete `createIpcHandlerRegistrationGroups` + the structural interfaces (`:25-56`).
11. **Delete** `src/main/ipc/handlers/*.handler.ts` once their bodies are inlined into the router (or keep pure body-functions imported by the router — executor's call; the *descriptor scaffolding* must go either way).

**Gate:** `npm run typecheck && npm run test:run && npm run build:vite`.

### Stage 3 — preload + renderer client + consumer re-point (HIGH, behavioral) — ME
12. **`src/preload/index.ts`** (rewrite to ~5 lines) — `import { exposeElectronTRPC } from 'electron-trpc/preload'; process.once('loaded', () => exposeElectronTRPC());`. **Delete** `subscription.factory.ts`, `exposure.factory.ts`, `listener-registry.ts`, `apis/*`, `validators.generated.ts`.
13. **`src/renderer/infrastructure/ipc/trpc-client.ts`** (new) — `export const trpcClient = createTRPCProxyClient<AppRouter>({ links: [ipcLink()] })` with `import type { AppRouter } from '@main/ipc/router'` (the Stage-0 boundary exception). Register a DI provider for it — **order-aware (P2 coordination):** in renderer `manual-providers.ts` if P2 has **not** landed; **if P2 has landed**, `manual-providers.ts` is deleted (folded into the awilix `registry.ts`) — add the provider as an `asFunction` entry in `registry.ts` instead.
14. **Re-point the ~10 renderer consumers** (churn, not deletion):
    - `src/renderer/infrastructure/adapters/device-ipc.adapter.ts` — `window.deviceAPI.onDeviceConnected(cb)` → `trpcClient.device.onConnected.subscribe(undefined, { onData: cb })`.
    - `src/renderer/infrastructure/services/platform/preload-event-bridge.factory.ts` (335 LOC) — largely **deleted/replaced**: the manifest-driven `window.*API` bridge collapses into direct `trpcClient.<ns>.<sub>.subscribe(...)` calls in the adapters; keep only the `@prismgb/events` republish glue.
    - `src/renderer/infrastructure/adapters/platform-metrics.adapter.ts`, `src/renderer/infrastructure/services/transcode/transcode.service.ts` (renderer), `src/renderer/infrastructure/services/updates/update.service.ts`, `src/renderer/infrastructure/services/settings/settings.service.ts`, `src/renderer/infrastructure/services/settings/settings-fullscreen.service.ts`, `src/renderer/infrastructure/rendering/capability-detector.utils.ts`, `src/renderer/application/orchestrators/ui-setup.orchestrator.ts`, and the renderer `ipcClient` provider (in `src/renderer/application/di/manual-providers.ts`, **or `registry.ts` if P2 has landed** — the `window as unknown as { deviceAPI }` cast moves with the fold) — swap each `window.<ns>API.<m>(...)` invoke for `trpcClient.<ns>.<m>.query|mutate(...)`.
    - **gpu/loginItem query fallback (trade (e)) — two asymmetric consumers.** `capability-detector.utils.ts:11-12` (`getGpuPolicyWithFallback`) reads `gpuPolicy.skipWebGPU` with **no** `.success` guard, so a thrown `.output(z)` error or a `{success:false}` envelope from `gpu.getPolicy` must be mapped to the UA/`{skipWebGPU:false}` fallback — its existing `try/catch` only covers the API-unavailable path, not the malformed-response path. `settings.service.ts:208-209` (`_readLoginItemSetting`) already guards (`result.success ? result.enabled : false` + try/catch→stored) — **verify** it still holds against the tRPC error shape; no new mapping needed.
    - **Validated-input call sites (~5) need a try/catch — not just a call swap.** `.input(z)` now *rejects* on invalid input where the preload previously resolved a `{success:false,error}` fallback (Stage 2 behavior delta). For the renderer `transcode.service.ts` `start`/`cancel` and any `shellAPI.openExternal` caller, wrap the `mutate(...)` in `try/catch` mapping the `TRPCError` to the prior fallback shape **only where a downstream caller depends on a resolved value** (don't blanket-swallow — a thrown validation error is the correct boundary signal; preserve it where the caller can surface it).
    - Delete `src/types/preload-api.d.ts` (the `Window.*API` globals) — the tRPC client types replace them. Confirm no residual preload-`*API` references remain — macOS/BSD-safe ripgrep that enumerates the 8 preload namespaces so it also catches the **cast-hidden** forms the GNU-only `window\.\w*API` pattern misses (`manual-providers.ts` `window as unknown as { deviceAPI }`/`globalWindow.deviceAPI` and `platform-metrics.adapter.ts` `globalThis.metricsAPI`): `rg -n '\b(device|shell|metrics|gpu|window|loginItem|update)API\b' src/renderer -g '!*.test.ts'` — must be 0 (excluding JSDoc mentions).

**Gate:** `npm run typecheck && npm run lint && npm run test:run && npm run build:vite && npm run dev:smoke`.

### Stage 4 — Zod consolidation tail + codegen removal (MED) — ME
15. **`packages/prismgb-config/src/config-loader.utils.ts:8`** — replace `joi` with the Zod equivalent (Dim 17 config-loader fold). Remove `joi` from `package.json` (verified: only non-test consumer). *Validation:* `npm run typecheck && npm run test:run`.
16. **`package.json`** — remove the **`generate-contracts.js` invocation** from `pretest` (`:56`), whatever its current form — **order-aware:** if it is still the pristine `node scripts/generate-di.js && node scripts/generate-contracts.js`, it becomes `node scripts/generate-di.js` (P2 owns *that* half's removal); if P2 already removed its half, `pretest` is now empty → **delete the `pretest` key entirely**. Do **not** blindly rewrite it *to* `node scripts/generate-di.js` — if P2 has landed, that script is gone and the hook would point at a deleted file (the "G2" `npm test` breakage). **Delete `scripts/generate-contracts.js`.**

**Gate (full set):** §6.

---

## 6. Gates checklist

Run before pushing (husky pre-commit runs only `test:run`):

- [ ] `npm run typecheck` (app + tests + gpu + core)
- [ ] `npm run lint` — eslint **+ `scripts/check-layer-boundaries.js`**. *Phase note:* the Stage-0 type-only exception must be in place; a value-level renderer→main import must still fail.
- [ ] `npm run test:run` (vitest, 4 src projects)
- [ ] `npm run build:vite` — confirms `electron-trpc/renderer` + `@trpc/client` + `zod` bundle under Vite 7 with no Node-builtin polyfill error and CSP-clean.
- [ ] `npm run dev:smoke` — `Renderer application started successfully`; **manually confirm one push channel** (drive a device-connect or transcode-progress) reaches the renderer over tRPC.
- [ ] **codegen-drift** — N/A for contracts after Stage 4 (generator deleted). `generate-di` drift still applies until P2.
- [ ] `npm run coverage:ratchet` — monotonic, `src/**` by scope. Deletions are ratchet-positive; the new `src/main/ipc/*` + `src/renderer/infrastructure/ipc/trpc-client.ts` + the `WindowService.send` reroute land in `src/**` and **must be tested** (§8) or the ratchet fails.

---

## 7. Rollback

- **Branch per phase:** `refactor/p3-ipc-trpc-zod` off `refactor/codebase_reduction`. One squash-merge PR. Revert = `git revert` the squash commit (or drop the branch pre-merge).
- **Lockfile:** the PR adds `@trpc/*`/`electron-trpc`/`zod` and removes `joi` in `package-lock.json`; `git checkout main -- package.json package-lock.json && npm ci` restores the dependency graph.
- **Generated files:** `generate-contracts.js`, `validators.generated.ts`, `preload-api.d.ts` are restored by the revert; re-add the `generate-contracts` call to `pretest`. No data/disk state is touched (IPC is in-process); no migration to unwind.
- **Tag before Stage 2** (`git tag p3-pre-router`) — the router rewrite is the highest-risk, least-reversible stage.

---

## 8. Test plan

**Deleted tests** (their subjects are gone): the manifest-cross-validation / preload-factory / generated-validator assertions in — `tests/unit/main/ipc-handler.registry.test.ts` (registration-group/manifest-drift cases), `tests/unit/renderer/infrastructure/preload-event-bridge.test.ts` (largely), and the `validators.generated`/`subscription.factory` assertions inside the 9 touched test files (full list: `tests/unit/main/ipc-handler.registry.test.ts`, `tests/unit/renderer/application/container.test.ts`, `tests/unit/renderer/infrastructure/adapters/device-ipc.adapter.test.ts`, `…/platform-metrics.adapter.test.ts`, `…/preload-event-bridge.test.ts`, `…/services/settings-fullscreen.service.test.ts`, `…/services/settings.service.test.ts`, `…/services/transcode.service.test.ts`, `…/services/update.service.test.ts`).

**Changed tests:** the device/transcode/update/settings consumer tests re-point their mocks from `window.*API` stubs to a mocked `trpcClient` (same behavioral assertions for the *happy* path, new seam). **Two assertion-flips (behavior change, not just a seam swap) — see Stage 2 delta:**
- *Invalid-input* cases (the ~5 `argumentValidators` sites, e.g. `transcodeAPI.start` with an unsupported format / `openExternal` with a bad URL): today they assert a **resolved `{success:false,error}` fallback**; they must flip to assert a **thrown/rejected `TRPCError`** (or, where a try/catch wrapper was added in Stage 3 task 14, the mapped fallback).
- *Malformed subscription payload*: today the preload-bridge tests assert the event is **silently dropped, stream alive**; that guard now lives server-side and the assertion moves to the router test below (`.output(z)` **errors the subscription**).

**Added tests (cover the new `src/**` — required for the ratchet):**
- `src/main/ipc/schemas/*` — Zod input schemas accept/reject the same cases the old validators did (port the `validators.generated` test vectors: bad URL, non-ArrayBuffer transcode buffer, unsupported format, non-string jobId).
- `src/main/ipc/router.ts` — per-procedure: invoke happy path returns the typed envelope; `resultEnvelope` maps a thrown *handler* error to `{success:false,error}`; an invalid `.input(z)` **throws `TRPCError(BAD_REQUEST)`** before the resolver; **each subscription's `.output(z)` errors the stream on a malformed payload** (the trade-(b) guard — one test per subscription, or a table test over all 14). Note this is the *new* posture (error), not the old silent-drop — assert accordingly.
- `src/main/ipc/event-bridge.ts` — `emit`→`on` delivery; listener cleanup.
- **`tests/unit/packages/ipc/channel-parity.test.ts`** (new) — asserts the relocated `IPC_CHANNELS` equals `@prismgb/events` `EventChannels` for the push channels. **This is the concrete carry-forward of trade (a)** — the only remaining guard for the channel↔event mapping. Goes under `tests/unit/packages/**` (shared-node project).

**Coverage-scope impact:** net `src/**` removal (preload factory + `validators.generated.ts` + `preload-api.d.ts`) outweighs additions → ratchet-positive overall, provided the new `src/main/ipc/*` is tested. Re-run `coverage:ratchet` after Stage 4; if a new file dips the ratchet, add the missing procedure test (do NOT lower the threshold).

**dev:smoke expectation:** boots clean; one push channel verified live (no DI-resolution error, no `exposeElectronTRPC` bridge failure under `sandbox:true`).

---

## 9. Definition of done

- Spike-B passed (Gate-0 + Gate-1) and recorded.
- All §3 deletions done; `IPC_CHANNELS` relocated and its 6 consumers resolve; 8 `Ipc*` aliases gone; `TranscodeFormat` single-sourced.
- `appRouter` serves all 8 invoke namespaces + 14 subscriptions; **every subscription carries `.output(z)`** (and the `gpu.getPolicy`/`loginItem.get` queries carry `.output(z)` with their consumers reconciled to fallback — trade (e)); the failure envelope is `resultEnvelope()` (no per-handler `mapError` closures remain).
- Preload is `exposeElectronTRPC()`; renderer consumes `trpcClient`; no `window.*API` reference remains.
- `WindowService.send` routes through `ipcPushBridge`; the 3 package emitters are unchanged.
- `joi` removed; `config-loader` on Zod; `pretest` no longer calls `generate-contracts.js` (it runs only `generate-di.js` if P2 hasn't landed, else `pretest` is removed entirely); `generate-contracts.js` deleted.
- The Stage-0 layer-boundary type-only exception is in place and documented; value-level renderer→main still fails lint.
- The channel-parity test exists (trade (a) carry-forward).
- Full gate set (§6) green; `dev:smoke` boots and one push channel verified live.

---

## 10. Fallback (if Spike-B fails)

Per overview line 41, in order of preference:

1. **`@egoist/tipc`** (Gate-0/Gate-1 fail = electron-trpc↔trpc-11 incompatibility, or stale-package breakage). tipc is a lighter typed-IPC layer over the same contextBridge model. **Keep `validators.generated.ts`** (tipc does not bring Zod payload validation for free) and keep the relocated `IPC_CHANNELS` + the EventEmitter push bridge. Re-scope this doc's Stage 2-3 to tipc's `createServer`/`createClient`; drop the `.output(z)` work (trade (b) is moot — the generated payload validators stay). The dead-alias + `transcode-format` + (optional) Zod-for-config-loader sub-tasks still ship independently.
2. **Keep-and-simplify** (both framework fallbacks rejected). Retain the manifest/cradle stack; harvest only the in-architecture wins: `dead-ipc-payload-aliases` (−8), `transcode-format-set-single-source` (~0), and `ipc-error-envelope-mapper-factory` (the ~−50 envelope-factory seam, Part I Dim 7) extracted into `@prismgb/ipc`. No transport change, no Zod. This is the conservative floor that still lands a real (small) reduction without the staleness risk.
