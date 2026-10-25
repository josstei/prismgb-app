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
