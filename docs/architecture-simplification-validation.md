# Architectural simplification validation

Implementation snapshot, 2026-10-23. Baseline: `origin/main` at
`292fe1d1bb08f93548e202e1a0cab1656538c5b0`.

The seven review areas follow the approved implementation plan:

1. **Verification:** real packaged bootstrap, renderer-ready and shutdown acknowledgements,
   bounded failure handling, in-process dependency-boundary fixtures, strict Knip graphs,
   one complete test run per CI platform, and Linux E2E against the existing build.
2. **Composition:** explicit typed process factories replace Inversify, tokens, binding
   modules, metadata decorators and the private-metadata test harness. Shared lifecycle
   handling provides concurrent initialization, rollback and idempotent asynchronous
   disposal. Component factories retain deferred construction and explicit ownership.
3. **Contracts:** the unused main event bus and 15 obsolete request constants are gone.
   Canonical schemas define IPC DTOs; one event table defines renderer payloads.
   Transcoding retains only active work and injects Electron environment capabilities.
4. **Settings/presentation:** immutable TypeScript definitions retain existing keys,
   defaults and codecs. Notes mutations own list reconciliation; notes children mount
   once. Presentation state uses typed stores and a pure animation projection.
5. **Rendering lifecycle:** one serialized session replacement path owns workers,
   cancellation, failed initialization and fresh-canvas fallback. Capture replies are
   correlated; late bitmaps close; recorder and screenshot work drain before teardown.
6. **GPU work:** uniform packing, enabled-pass plans and persistent-resource bind groups
   are invalidated on changes. Presentation texture acquisition remains per frame.
   Typed pass layouts generate uniform declarations; handwritten shader bodies and
   24/16/32/32-byte layouts are preserved.
7. **Build/dead code:** duplicate asset copying and the unused renderer shim plugin are
   removed. Generated alias paths have a read-only freshness gate. Strict full and
   production Knip checks include exports and types; fixture-only contracts live in
   testkits. Main external imports use package names rather than build-machine paths.

Shutdown needed one purposeful addition beyond the original push-channel reduction:
an application shutdown request, bringing the active push catalog to 15 channels.
Main waits for renderer disposal while IPC remains available, then drains accepted
conversions and downloads before closing services and the window. Blob downloads are
registered before the anchor click, covering delayed Electron download creation.
Failed handshakes still release resources and make the smoke test fail. Main has one
initialization phase; renderer retains separate initialize/start phases.

## Verification results

| Check | Result |
| --- | --- |
| Complete unit/integration suite | 163 files, 2,022 tests passed |
| App and test TypeScript | Passed |
| Generated paths, ESLint, dependency boundaries | Passed |
| Full and production Knip, including exports/types | Passed |
| Full Electron E2E with fullscreen enabled | 92 passed, no skips or retries |
| E2E rerun after final download barrier | 6 affected streaming/capture/shutdown tests passed |
| Real Vite development startup | Passed in an isolated source copy |
| Final Linux unpacked package smoke | Passed, including preload/tRPC readiness and renderer disposal |
| Electron native ABI gate and USB binding load/enumeration | Passed |
| Real FFmpeg/ffprobe | MP4 H.264/AAC and MOV ProRes/PCM outputs validated; error cleanup and graceful drain covered |
| Whitespace check | Passed |

Lifecycle coverage includes partial startup, concurrent/repeated disposal, failure
aggregation, fresh runtime construction, deferred components and subscription cleanup.
Behavior tests cover persisted setting codecs, notes reconciliation and pending edits
surviving real quit/relaunch with autosave timers paused. Media tests cover session
replacement/fallback, capture timeout and late frames, stop-then-quit, final WebM output,
and actual canvas pixels across repeated hidden/visible transitions.

The Linux package used the installed Electron distribution and verified USB prebuild
with `electron-builder --linux --dir --config.npmRebuild=false`. The normal native
rebuild attempted to download Electron headers and was blocked by the environment's
HTTP proxy. No packaging configuration was changed to disable native rebuilds.
The local smoke invocation added `--no-sandbox` for this container.

## Measurements

These are snapshot measurements, not architectural limits or maintained counts.
Line counts include comments and whitespace in the indicated source trees.

| Measurement | Baseline | Implemented |
| --- | ---: | ---: |
| Production source lines (`src`, TS/JS/JSON/HTML/CSS/WGSL) | 32,471 | 29,083 |
| Composition/bootstrap/shared-runtime-lifecycle lines | 885 | 422 |
| Test-support and factory lines | 5,092 | 4,631 |
| Renderer entry JavaScript | 523,365 bytes | 396,512 bytes |
| Main JavaScript | 359,469 bytes | 227,348 bytes |
| Renderer entry gzip | 132,150 bytes | 104,314 bytes |
| Main gzip | 81,044 bytes | 56,514 bytes |

Removed byte-identical duplicate assets total **718,736 bytes**. Five direct package
dependencies were removed: Inversify, its private core test dependency, type-fest,
the renderer shim plugin, and static-copy plugin.

Five alternating fresh-profile Electron launches, after one warm-up per build,
measured median renderer readiness at **499.5 ms baseline / 425.1 ms refactored**.
Ranges overlapped (431.8–553.3 ms / 400.3–531.9 ms); this small local sample does not
establish a general startup speedup. Median aggregate Electron working set was
343,900 / 343,040 KiB, effectively unchanged in this sample. These samples precede
the final download barrier, which does not execute during startup.

A mocked-GPU CPU benchmark of 100,000 unchanged Vibrant frames measured five-run
medians of **438.06 ms / 20.14 ms**. Bind-group creation fell from 100,003 to 4;
texture views from 200,005 to 100,003, retaining the per-frame presentation view.
Uniform uploads remained at four in both versions; the removed work was allocation,
packing/hashing and repeated resource planning. This measures CPU bookkeeping,
not hardware GPU throughput or FPS.

Physical Chromatic hardware, macOS/Windows packaging, and real hardware WebGPU image
parity remain unverified here. A SwiftShader parity attempt produced invalid black
captures and then adapter initialization failures, so no pixel-parity claim is made.
Shader body/layout tests pass; Canvas rendering and visibility behavior passed the
Electron pixel checks. Retained compatibility includes the preload adapter,
electron-trpc patch/boxed booleans, ARM AppImage library handling, macOS naming patch,
FFmpeg location fallbacks and Canvas2D fallback.

## Follow-up cleanup audit, 2026-10-25

A second pass traced production consumers, test-only APIs, fixture machinery and
packaging inputs against the prior PR head, `c10ab70`. It removed ten unconsumed
events, the entire development memory-metrics request/timer chain, unused GPU frame
telemetry, the renderer event-bus forwarding subclass, and test-only inspection APIs.
Error logging, async event settlement, frame backpressure and capture drain remain.

The remaining dynamic `applyOptions` helper and 26 calls were replaced with typed
constructor/DOM assignments. Other removals include the unused `window.__app` global,
WebKit AudioContext and old test-environment observer fallbacks, duplicate Vite asset
declarations, notes cache validity duplication, impossible missing-storage handling,
and mock histories already provided by Vitest. Fixed application defaults no longer
pass through a duplicated runtime schema. Stored settings and tolerant notes loading
retain their existing codecs and behavior.

Tooling now uses Electron Builder's architecture enum, omits retired coverage options
and obsolete installer exclusions under `dist`, and uses a smaller generated-output
cleanup command that reports deletion failures. No tracked build/report artifacts
were found. Generated reports, fixtures and validation build outputs were cleared
after verification. Current preload/tRPC, FFmpeg, ARM AppImage, macOS naming, native
USB loading and Canvas fallback compatibility remain in place.

| Measurement | Prior PR head | After cleanup |
| --- | ---: | ---: |
| Production source lines, same extensions as above | 29,083 | 27,911 |
| Test-support and factory lines | 4,631 | 3,940 |
| Renderer entry JavaScript | 396,512 bytes | 389,690 bytes |
| Main JavaScript | 227,348 bytes | 220,407 bytes |
| Defined renderer events | 73 | 63 |

The complete unit/integration suite passes **1,928 tests across 158 files**. The
smaller test count reflects removed APIs and tests of mock/assignment machinery;
behavioral coverage remains, including notes write rollback and shutdown, event
cleanup/drain, media fallback, and widget keyboard/focus behavior. All **92 Electron
E2E tests** pass with fullscreen enabled and no retries. Application/test types,
architecture lint, generated-path freshness, full/production Knip, production build,
real development startup, native USB loading/enumeration and Linux packaged startup
with renderer readiness/disposal also pass. The package again used the installed
Electron distribution with `npmRebuild=false`; normal packaging settings still
rebuild native dependencies. Hardware and other-platform limitations above still
apply. Bundle sizes are measured; no additional runtime-speed claim is made.

## Deeper ownership audit, 2026-10-25

This pass compared the previous cleanup head, `db35ad9`, with actual production
ownership and call paths. It removes the main-process lifecycle forwarding class,
the performance-state forwarding service, browser media adapter, notes search and
autocomplete wrappers, duplicated AppState media caches, and redundant device DTO
conversions. Service, orchestrator and component bases now inherit the shared
resource owner directly. One UI registry defines component IDs, factories, mounting
and deferred status; component instance types are inferred from it.

Worker readiness, frame reservations and correlated capture now belong to the worker
client. Backend choice and fresh-canvas fallback belong only to the streaming render
service. The low-level renderer initializes its requested backend and rolls back
failure. Removed worker capability discovery, callback registries, duplicate preset
catalogs and transport fields have no remaining consumers. Preset values/order,
Canvas fallback, capture timeouts, late bitmap closure and recording drain remain.

Two correctness fixes accompany the reductions. Concurrent disposal now joins cleanup
already in progress, including explicitly released resources and overlapping groups;
freshly registered resources remain owned. Synchronous device reconciliation no longer
uses an asynchronous lock that could discard an immediate detach after attach. The
presentation-mode store also has one owner instead of being disposed by both its
effect and process composition.

Test support uses real Happy DOM nodes instead of a handwritten DOM/selector/event
implementation. Mock-only streaming and capture workflow suites, unused browser
installers and parity tests were removed. Four replacement streaming integrations run
the production acquirer, service, view, AppState and orchestrator through the real
event bus, covering paired audio, UI requests, recording drain, ended tracks and retry.
Actual capture service/orchestrator/bridge and Electron coverage remain.

| Measurement | Previous cleanup | Deeper audit |
| --- | ---: | ---: |
| Production source lines, same extensions as above | 27,911 | 26,561 |
| Test-support and factory lines | 3,940 | 2,937 |
| Renderer entry JavaScript | 389,690 bytes | 374,401 bytes |
| Main JavaScript | 220,407 bytes | 213,451 bytes |

The final unit/integration suite passes **1,809 tests across 154 files**. The test
count reduction comes from removed APIs, forwarding layers and fake implementation
tests. New regressions cover pending disposal, cleanup failures and reuse, immediate
device detach, direct media ownership and real streaming event paths. Application
and test types, generated paths, architecture lint, full/production Knip and the
production build pass. Independent lifecycle/UI and media review found no actionable
regression. These are size measurements; no new runtime-speed claim is made.

All **92 Electron E2E tests** pass with fullscreen enabled and no retries, including
notes persistence/quit, focus/keyboard interactions, stream restart, visibility,
screenshots and recording shutdown. Real Vite development startup, the native ABI
gate and Linux packaged startup/disposal also pass. Packaging again used the installed
Electron distribution and USB prebuild with `npmRebuild=false`; no production package
defaults changed. Physical-device, hardware WebGPU and other-platform limitations
listed above remain. Generated test reports, fixtures and local builds were removed
after validation.

## Six additional audit passes, 2026-10-26

Six subsystem reviews compared the prior head, `8e0a6ae`, with production callers,
ownership and behavior. Each pass implemented supported changes and ran focused
checks; an independent challenge reviewed the combined result.

1. **Lifecycle and composition:** remove MainBootstrap and the renderer
   AppOrchestrator forwarding layer. Process composition owns initialization and
   ordered teardown directly; UISetup owns device presentation events. Cinematic
   commands belong to the display-mode orchestrator. Renderer-shutdown failure no
   longer bypasses accepted conversion and download drains. Remove the duplicate
   cancellation API.
2. **Contracts:** one typed push table supplies channel names, runtime schemas and
   payload types. Remove schema barrels and repeated registry dependency fields.
   Reserve renderer transcode ownership before awaiting startup, replay early replies
   after STARTED, and require/match job IDs. Remove unused HTML fullscreen handling;
   native Electron state remains authoritative.
3. **Presentation:** UIEffects directly owns activity listeners, frame scheduling,
   streaming timeout and fullscreen activity. Remove three auto-hide wrappers,
   ReactiveStore, mirrored panel caches and unused controller options. Shared
   lifecycle ownership manages store resources and transcode toast timing.
4. **Media:** replace the stateful first-frame health service with a scoped promise
   owning frame delivery, timeout and cancellation. Publish STARTED after the stream
   owner enters its started state. Preserve superseding stop ownership and recover
   recording from synchronous capture errors; stale capture failures cannot restart
   a stopped recording. Remove redundant capture-pending state.
5. **Tooling and test support:** share exact Vite aliases across processes. Remove
   unused browser globals/installers, mock introspection APIs, orphan factories and
   storage override machinery; reuse Vitest and one MediaRecorder event simulation.
   Replace the retired bootstrap boundary with the actual composition boundary.
6. **Independent challenge:** remove last-listener state and global disposal from
   three browser adapters. Each returned disposer captures its own listener/source.
   Real DOM/EventTarget tests verify independent cleanup. Cross-review additionally
   challenged event ordering, transcode ownership, fullscreen and auto-hide behavior.

| Measurement | Prior head | Six passes |
| --- | ---: | ---: |
| Production source lines, same extensions as above | 26,561 | 25,512 |
| Test-support and factory lines | 2,937 | 2,457 |
| Renderer entry JavaScript | 374,401 bytes | 362,694 bytes |
| Main JavaScript | 213,451 bytes | 212,192 bytes |

The complete suite passes **1,636 tests across 148 files**. Removed tests exercised
retired wrappers, fake APIs and delegated calls; replacement regressions run real
event/DOM paths and cover shutdown failure, conversion races, missing/stale job IDs,
stream state ordering, old capture failures and independent listener disposal.
Application/test types, generated paths, architecture lint, strict full/production
Knip and production build pass. Boundary fixtures retain the previous 19 violations
and add one violation of the new main-composition rule. No shader mathematics,
layouts or presets changed; no new runtime-speed claim is made.

All **92 Electron E2E tests** pass against a stable build with fullscreen enabled
and no retries. An initial run lost the build output during three launches because
two verification builds overlapped; the complete rerun passed without source changes.
Real Vite development startup, native ABI checks and Linux packaged readiness/disposal
also pass. The package used the installed Electron distribution and verified USB
prebuild with `npmRebuild=false`; normal packaging defaults still rebuild native
dependencies. Physical hardware, hardware WebGPU image parity and macOS/Windows
packaging remain unverified here. Local reports, generated fixtures and build outputs
were removed after verification.

## Maximum-depth six-pass audit, 2026-10-26

Baseline: `87a8825`. Six reviews traced actual callers, asynchronous state changes,
partial initialization and persistent outputs, then implemented the supported
findings. Independent challenge reviewed the combined ownership changes.

1. **Process lifecycle:** renderer entry owns its runtime before awaiting startup.
   Remove RendererBootstrap and its restart/load-strategy test scaffolding. Early
   shutdown now joins actual disposal, including before DOM readiness. Late service
   initialization cannot revive disposed readiness. Resource registration belongs
   to the lifecycle host; remove unused bag APIs and subscription inspection state.
2. **Main contracts and outputs:** one transcode completion owner covers process
   outcome, atomic promotion, notifications and cleanup. Encoding uses a unique
   same-directory staging file; failed/cancelled conversions preserve existing final
   recordings. Standard readline parsing handles split progress records. Window
   listeners have one owner and capture their persistent session for cleanup.
   Download failures remain visible to draining; disabled update checks cannot leave
   the renderer checking forever. Cleanup removes only each runtime's own sessions.
3. **Notes and settings:** commit notes cache changes only after persistence succeeds.
   Own settings children before mounting and await every cleanup on error. Delayed
   login-item reads cannot overwrite newer checkbox edits. Remove self-forwarding
   editor callbacks, an unused resize reference and duplicate startup metadata.
   Tolerant loading, stored keys/defaults and asymmetric codecs remain unchanged.
4. **Media:** each audio start owns one graph and cancellation scope. Old resume
   failures cannot close replacement audio; partial graph failures release resources.
   Recording stops share one drain; rejected rapid restarts preserve accepted chunks.
   Stream startup cancels without waiting for a native permission prompt, and late
   grants close their tracks. Cancelled target lookup cannot acquire or persist a
   selection after replacement or shutdown. Preserve fades, platform timings, raw
   audio/Canvas fallbacks, capture backpressure and recording drain.
5. **Tooling/distribution:** process waits remove timeout listeners and distinguish
   exited children from undrained stdio; forced termination covers owned process
   groups. Remove the process mock framework and factor repeated test-project config.
   Boundary rules target actual renderer composition. Move three packaging-only
   assets outside publicDir, update all seven packaging paths and icon generation,
   and retain their exact bytes. PNG, tray and renderer asset URLs remain unchanged.
6. **Cross-boundary challenge:** queue device changes during initial queries, derive
   reconnects from current snapshots and roll back partial subscriptions. Remove
   unused clock metadata and runtime inspection APIs. Fullscreen/update queries
   cannot overwrite newer pushes or publish after disposal. The update state owner
   emits feedback directly, replacing UpdateUiService and four unconsumed renderer
   republishes. Performance state reads the actual stream owner during late startup.

| Measurement | Prior head | Maximum-depth audit |
| --- | ---: | ---: |
| Production source lines, same extensions as above | 25,512 | 24,976 |
| Test-support and factory lines | 2,457 | 2,320 |
| Renderer entry JavaScript | 362,694 bytes | 359,236 bytes |
| Main JavaScript | 212,192 bytes | 210,333 bytes |
| Three packaging-only files copied into renderer | 230,214 bytes | 0 bytes |

The complete suite passes **1,689 tests across 148 files**. Added coverage exercises
real ownership failures and deferred races: early shutdown, late initialization,
existing-file collisions, shared temporary storage, rejected writes, partial mounts,
old audio/recording work, native permission grants, device selection and stale state
queries. Production and support code decreased while regression coverage grew.
Application/test types, architecture lint, generated paths, full/production Knip and
production build pass. Shader bodies, layouts and presets did not change; these size
measurements establish no new runtime-speed or GPU-throughput claim.

The unsafe global temporary-session sweep was removed. Each runtime removes only its
own files. Forced termination can leave an unowned temporary session or hidden output
staging file; normal failure/cancellation/shutdown cleans owned artifacts. This
preserves live work from other profiles and existing successful recordings instead
of attempting an unscoped filesystem sweep. Current preload/tRPC/boxed-boolean,
FFmpeg-location, ARM AppImage, macOS naming and Canvas fallback compatibility retain
demonstrated consumers.

All **92 Electron E2E tests** pass with fullscreen enabled and no retries, including
notes quit/persistence, media restart/visibility, screenshots and final recording
output. Real Vite development startup, native ABI checks and Linux packaged startup
with preload/tRPC readiness and renderer disposal also pass. The package used the
installed Electron distribution and verified native USB prebuild with
`npmRebuild=false`; production packaging defaults retain native rebuilding. The
three moved resources are byte-identical and absent from the built renderer.
Physical hardware, hardware WebGPU image parity and macOS/Windows packaging remain
unverified here. Local reports, generated fixtures and build outputs were removed
after verification.
