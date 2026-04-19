# Rust Capture Sidecar — Design

**Date:** 2026-04-19
**Status:** Design approved, ready for implementation planning
**Scope:** Experimental opt-in native video-capture path for PrismGB on macOS

## 1. Problem

The Chromatic's USB output is YUY2 4:2:2, which already averages Cb/Cr pairwise in the FPGA. When the Chromium capture stack inside Electron ingests that YUY2 via `getUserMedia`, it further converts to I420/NV12 (4:2:0) via libyuv before the frame is ever exposed to app code. The result is color bleeding that cannot be fully recovered from JS-land because the chroma has been decimated twice by the time we see it.

This spec designs a native capture path that reads YUY2 directly from macOS's AVFoundation — before Chromium touches it — does chroma reconstruction + RGB conversion in Rust, and hands frames to the existing renderer pipeline as a `MediaStream`. All existing downstream code (GPU render loop, recording, screenshots) stays unchanged.

Root-cause fix of the FPGA YUY2 averaging is a separate, upstream effort tracked in `chromatic-repos/CHROMATIC_RGB24_PLAN.md`. This sidecar is the host-side mitigation PrismGB can ship unilaterally.

## 2. Decisions (brainstorming outcomes)

| Decision | Chosen | Why |
|---|---|---|
| Rollout | Opt-in experimental settings toggle, default stays on `getUserMedia` | Lowest user-visible risk; zero cost when off |
| Scope | Video only; audio keeps using `getUserMedia` (UAC) | Color-bleeding issue is video-only; halves implementation surface |
| Reconstruction location | Inside the Rust sidecar; sidecar emits RGB24 | Better quality ceiling (deterministic fp math, testable, SIMD-tunable); no WebGL shader precision quirks |
| Platform strategy | Trait-based backend in Rust, implement macOS (AVFoundation) first; Linux/Windows stubs only | Matches user's dev environment; architected so added platforms require only a new backend module |
| IPC | POSIX shared-memory ring buffer for frames; stdio line-JSON for control | Zero-copy frame path; control-plane isolated from hot path |
| Renderer integration | `MediaStreamTrackGenerator` wraps the frame stream; feeds existing acquisition layer | Every downstream consumer (GPU, recording, screenshots) is unchanged |
| Lifecycle | Spawn-on-toggle-enable; kill on toggle-off/app-quit | Respects the opt-in framing; mirrors existing FFmpeg subprocess pattern |
| Rust project layout | Single binary with modules | Experimental-phase YAGNI; workspace splits easy later if needed |
| macOS backend | AVFoundation (not libuvc, not DriverKit) | Blessed path, handles in-kernel UVC driver contention automatically, works under Hardened Runtime + notarization |

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Rust sidecar (one process, spawned by Electron main)       │
│                                                             │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────────┐   │
│  │ Capture     │  │ Reconstruct  │  │ IPC               │   │
│  │ trait       │  │ (Cb/Cr       │  │ - stdio (control) │   │
│  │  ├─ AVF     │  │  upsample +  │  │ - POSIX shm ring  │   │
│  │  ├─ V4L2*   │  │  YCbCr→RGB24)│  │   (frames)        │   │
│  │  └─ MF*     │  │              │  │                   │   │
│  └──────┬──────┘  └───────┬──────┘  └─────────┬─────────┘   │
│         └─ YUY2 buf ──────┘                   │             │
└────────────────────────────────────────────────┼────────────┘
                          stdio / shm           │
┌────────────────────────────────────────────────┼────────────┐
│  Electron MAIN                                 │            │
│                                                ↓            │
│  CaptureSidecarService (Awilix) ── supervisor ── reads shm  │
│    spawn/kill, crash policy, fd ownership                   │
│    emits IPC:capture:frame (MessageChannelMain Transferable)│
└────────────────────┬────────────────────────────────────────┘
                     │  IPC (preload contextBridge)
┌────────────────────┼────────────────────────────────────────┐
│  Electron RENDERER ↓                                        │
│                                                             │
│  CaptureSidecarAdapter (new, acquisition layer)             │
│    ├─ receives frame buffers                                │
│    ├─ wraps each as VideoFrame                              │
│    └─ pushes into MediaStreamTrackGenerator                 │
│                           │                                 │
│                           ↓                                 │
│  Existing acquisition.orchestrator ─ MediaStream ─► existing│
│    GPU render loop, recording, screenshots (unchanged)      │
└─────────────────────────────────────────────────────────────┘
   * V4L2 / MF backends stubbed for now; trait in place.
```

### 3.1 Boundary rationale

- **Sidecar is a process, not a library.** AVFoundation requires its own run loop and USB entitlements; containing that inside one OS process keeps permissions, threading, and failure modes isolated.
- **Shared memory carries frames; stdio carries control.** A control-message parse bug can never corrupt a frame stream; a frame overrun can never block a control command.
- **Renderer sees a `MediaStream` exactly like today.** The GPU render loop, recording pipeline, screenshot service, and acquisition orchestrator receive zero modifications. The swap happens only at the acquisition seam.

## 4. Component breakdown

### 4.1 Rust sidecar (`packages/prismgb-capture-sidecar/`)

New workspace sibling to `@prismgb/gpu`. Single binary. Module layout:

| Module | Responsibility | Key dependencies |
|---|---|---|
| `main.rs` | Entry point; parses CLI; sets up stdio control loop; drives capture→recon→shm pipeline | all below |
| `capture::backend` | `trait CaptureBackend { fn start, fn stop, fn subscribe_frames }`. Platform-neutral API. | — |
| `capture::macos` | AVFoundation impl. Uses `objc2` + `core-video` crates. Requests `kCVPixelFormatType_422YpCbCr8_yuvs`. | `objc2`, `core-foundation` |
| `capture::linux`, `capture::windows` | Empty module stubs (`unimplemented!()`), wired to the trait but not compiled via cfg gates | — |
| `capture::fake` | In-memory deterministic frame producer for CI/tests | — |
| `recon::chroma` | Luma-guided Cb/Cr upsampler. Pure function `upsample_chroma(yuy2_in, out_cb, out_cr)`. SIMD via `wide` crate. | `wide` |
| `recon::colorspace` | `ycbcr_to_rgb24(y, cb, cr, matrix)` with pluggable matrix (BT.601, BT.709, custom) | — |
| `ipc::control` | Line-delimited JSON framing over stdio. Messages: `StartCapture`, `StopCapture`, `Status`, `Error`, `Ready`, `DeviceGone`, `DeviceBack`, `Ping`, `Pong` | `serde`, `serde_json` |
| `ipc::shm` | POSIX `shm_open` + `mmap`. Ring buffer: N frame slots (default 4), atomic `head`/`tail`, per-frame header (sequence, pts_ns, width, height, stride, format) | `nix` |
| `error` | `thiserror` enum with structured variants | `thiserror` |

### 4.2 Electron main process (`src/main/infrastructure/capture-sidecar/`)

| File | Responsibility |
|---|---|
| `capture-sidecar.service.ts` | `BaseService`. Public API: `start()`, `stop()`, `getStatus()`. Owns process lifecycle, crash policy (exponential backoff, N retries), binary path resolution, emits state events on EventBus |
| `capture-sidecar-process.ts` | Thin child-process wrapper; stdio JSON framing in/out; pipes stderr to Winston |
| `shm-reader.ts` | Reads frames from POSIX shm created by sidecar; polls atomic head at ~240 Hz; transfers frame buffer to renderer via `MessageChannelMain` with Transferable payload |
| `capture-sidecar.config.ts` | Paths, retry limits, ring size, binary name, watchdog timeout |

Modified: `src/main/application/container.ts` (register service); new IPC handlers in `src/main/ipc/handlers/capture-sidecar.handler.ts`.

### 4.3 Renderer

New files:

| File | Responsibility |
|---|---|
| `src/renderer/infrastructure/adapters/devices/chromatic/sidecar/sidecar-capture.adapter.ts` | Implements existing `device-adapter.interface`. On frame buffer arrival, constructs a `VideoFrame` and pushes into a `MediaStreamTrackGenerator` |
| `src/renderer/infrastructure/streaming/acquisition/sidecar-acquisition.strategy.ts` | Alternative acquisition strategy; returns a `MediaStream` whose video track is the generator above |

Modified:
- `src/renderer/infrastructure/streaming/acquisition/acquisition.orchestrator.ts` — branch on toggle
- `src/renderer/application/di/register-streaming.ts` — register sidecar strategy
- `src/renderer/presentation/features/settings/` — add "High-fidelity capture (experimental)" toggle + status chip + banner

### 4.4 Shared

- `src/shared/ipc/channels.json` — add `capture:sidecar:*` channels
- `src/shared/ipc/preload-api.contract.ts` — add `window.captureAPI` surface (`start`, `stop`, `onFrame`, `onStatus`)

### 4.5 Boundary invariants

- Renderer cannot spawn, kill, or read raw binary output from the sidecar. Only main owns the process and shm fd.
- Sidecar cannot read renderer state. Only receives structured commands over stdin.
- The trait in `capture::backend` is the sole extension point for Linux/Windows — no other module changes when a backend is added.

## 5. Data flow

### 5.1 Frame path (hot loop, 60 Hz)

```
AVFoundation session
    │ YUY2 CVPixelBuffer, ~2.76 MB/s
    ▼
sidecar: recon::chroma (SIMD bilateral upsample, Cb & Cr to full-res)
    │
    ▼
sidecar: recon::colorspace (YCbCr → RGB24, chosen matrix)
    │ 69,120 B per frame
    ▼
sidecar: shm ring buffer — write into slot[head]; atomic head++
    │ (no stdio message per frame)
    ▼
main: shm-reader polls atomic head counter at ~240 Hz; on advance, reads slot[tail]
    │ mmap'd pointer — zero-copy
    ▼
main: MessageChannelMain.postMessage(buffer, [buffer])  // Transferable, zero-copy
    │
    ▼
renderer: port.onmessage → new VideoFrame({ format:'RGBX', buffer, timestamp })
    │
    ▼
MediaStreamTrackGenerator.writable.getWriter().write(frame)
    │
    ▼
MediaStream ──► existing acquisition.orchestrator ──► existing GPU loop, recording, screenshots
```

### 5.2 Control path

**Enable:**
1. Renderer calls `captureAPI.startSidecar()` via preload bridge.
2. Main: `CaptureSidecarService.start()` spawns the binary, awaits `{"type":"Ready","shm_name":"..."}` on stdout.
3. Main maps the named shm; sends `{"type":"StartCapture","device_id":"..."}` on stdin.
4. Sidecar opens AVFoundation session, replies `{"type":"Status","capturing":true}`.
5. Main emits `capture:sidecar:ready`; renderer begins pulling frames off the MessageChannel.

**Disable / shutdown:**
1. Renderer sends `captureAPI.stopSidecar()`.
2. Main sends `{"type":"StopCapture"}` on stdin.
3. Sidecar closes AVF session, drains ring, responds `{"type":"Status","capturing":false}`, exits.
4. Main `unlink`s the shm name; emits `capture:sidecar:stopped`.

### 5.3 Backpressure

Ring buffer has N slots (default 4). Sidecar writer never blocks — on full ring, overwrites oldest. For live capture, freshest frame wins. Main reader tracks `last_sequence`; on gap, logs once per second, no retry. `VideoFrame.close()` on every write — no accumulated JS GC pressure.

### 5.4 Hotplug

Sidecar subscribes to `AVCaptureDeviceWasConnectedNotification` / `...Disconnected`. On disconnect: emits `DeviceGone`; main forwards to renderer as event. On reconnect matching the last-known device: sidecar auto-resumes, emits `Status` update. If the toggle is off, sidecar isn't running — hotplug falls through to the existing `getUserMedia` path unchanged.

## 6. Lifecycle + error handling

### 6.1 State machine

```
         ┌─ toggle on ──►
 Disabled                 Starting ──► Idle ──── StartCapture ────► Capturing
    ▲                        │                                         │
    │ dead/stop              │ Ready timeout, spawn fail               │ StopCapture
    │                        ▼                                         ▼
    │                     Crashed ◄──── exit != 0 ────── (anywhere) ── Stopping
    │                        │                                         │
    │ retries ≤ budget       │ retries exceeded                        ▼
    │        ▼               ▼                                      Disabled
    └───── backoff          Dead
           respawn          (banner + toggle auto-off)
```

All transitions emit corresponding events on `capture:sidecar:*` so the renderer status chip updates live.

### 6.2 Error taxonomy & recovery policy

| Error | Source | Recovery |
|---|---|---|
| `BinaryNotFound` | spawn fails | Dead immediately. Banner: "Feature not available on this build." |
| `PermissionDenied` (camera/USB) | AVFoundation reports `AVAuthorizationStatusDenied` | Dead, no retry. Banner deeplinks to `x-apple.systempreferences:com.apple.preference.security?Privacy_Camera` |
| `DeviceNotFound` | AVFoundation enumeration empty for Chromatic | Idle state, poll every 2s, auto-promote when device appears. No retry budget consumed |
| `FormatUnsupported` | AVF can't serve YUY2 from device | Dead immediately. Surface as "capture format unavailable" with log detail |
| `DeviceGone` | hotplug disconnect mid-capture | Return to Idle; on reconnect auto-resume to Capturing |
| `CaptureStalled` (>500ms no frames) | main-side watchdog | Send `Ping` on stdin; on `Pong` timeout, treat as crash |
| `ShmOpenFailed` | `shm_open`/`mmap` error | Dead (system out of shm resources) |
| Non-zero exit, no structured error | supervisor observes `close` with code≠0 | Crashed → backoff (250ms, 1s, 4s) → respawn up to 3× per 60s. Exceeds → Dead |
| Renderer stall (shm sequence gap >2s) | shm-reader heuristic | Log warning; no action. Drop-oldest means stream catches up |

### 6.3 Observability

- **Logs**: Winston sink for sidecar stderr; each state transition logged; frame-rate counter logged every 10s at `debug`
- **EventBus**: `capture:sidecar:{starting,ready,capturing,stopped,crashed,dead,device-gone,device-back,frame-drop}`
- **Metrics via existing performance API**: fps, drops-per-minute, `last_sequence_gap`, shm-to-VideoFrame latency sampled 1×/sec
- **DevTools panel**: deferred; spec-tracked, non-blocking for v1

### 6.4 User-visible surfaces

- **Settings toggle**: "High-fidelity capture (experimental)". Status chip beneath with label mapped from internal state:

  | Internal state | Chip label |
  |---|---|
  | `Disabled` | `Off` |
  | `Starting` | `Starting` |
  | `Idle` (device-not-found while toggle on) | `Offline` |
  | `Capturing` | `Active` |
  | `Crashed` (during backoff) | `Starting` (retry visible via spinner) |
  | `Dead` | `Failed` |
  | `Stopping` | `Off` |

- **Banner**: appears only on `Dead` or `PermissionDenied`. Copy: "High-fidelity capture couldn't start, reverted to standard capture. [Try again] [Details]". **Try again** resets the retry counter and issues a fresh `start()` — treats the click as a user-initiated new attempt, not a continuation of the backoff sequence. **Details** opens a modal with the structured error variant name and the last ~20 lines of sidecar stderr.
- **macOS permission prompt**: AVFoundation triggers the system Camera dialog on first enable
- **Automatic fallback**: on `Dead`, toggle auto-flips off; `acquisition.orchestrator` reverts to `getUserMedia` on next acquisition

### 6.5 Invariants

- If toggle is on and state is not `Capturing`, acquisition orchestrator falls back to `getUserMedia`; user never sees a blank canvas
- shm is always `unlink`ed on graceful stop and on `Dead`; stray shm segments from crashes cleaned up by startup sweep (`shm_unlink` any `/prismgb-capture-*` names older than 60s)
- Sidecar process cannot outlive Electron main: supervisor registers a `before-quit` handler sending SIGTERM with 1s SIGKILL fallback

## 7. Testing strategy

### 7.1 Rust side (`packages/prismgb-capture-sidecar/tests/`)

| Layer | What it covers |
|---|---|
| Unit | `recon::chroma` correctness (synthetic YUY2 → expected RGB byte sequences); `recon::colorspace` matrix round-trips per matrix option; `ipc::shm` ring concurrency (producer/consumer, wraparound, drop-oldest); `ipc::control` serde round-trips |
| Integration | Binary spawn → `Ready` → `StartCapture` → frame production → `StopCapture` → graceful exit, using `capture::fake` backend. Hotplug, crash, SIGTERM handling all exercised |
| Property (`proptest`) | Arbitrary YUY2 inputs → no panics, no OOB, stride invariants hold |
| Golden frames | Checked-in pathological YUY2 fixture (single-pixel chroma stripes, palette-boundary pattern) → checked-in PNG ground truth. Byte-identical assertion |
| Bench (`criterion`) | `recon::chroma` throughput — assert ≥ 240 fps on a named reference machine (see §10 calibration). Regression watch, not release gate |

### 7.2 Electron side (Vitest)

| Layer | What it covers |
|---|---|
| Main unit | `capture-sidecar.service` state machine with stubbed `child_process`; retry/backoff with fake timers; shm-reader transfer semantics |
| Main integration | Real sidecar binary + `capture::fake` backend + real shm + real `MessageChannelMain`, asserting frame bytes reach the renderer intact. macOS CI only |
| Renderer unit | `sidecar-capture.adapter` — `VideoFrame` construction, generator writes, cleanup on stop. `sidecar-acquisition.strategy` — toggle branch, fallback on `Dead` |
| E2E (Playwright) | Toggle on → status chip `Active`; toggle off → `Off`; simulate permission denial → banner with deeplink; simulate crash → silent fallback to `getUserMedia` |

## 8. Build, distribution, packaging

### 8.1 Cargo workspace

Located at `packages/prismgb-capture-sidecar/`:
```
packages/prismgb-capture-sidecar/
├── Cargo.toml
├── src/                   # binary + modules per §4.1
├── tests/                 # integration tests
└── benches/               # criterion benchmarks
```

### 8.2 npm integration

- `build:sidecar` script: `cargo build --release --target aarch64-apple-darwin && cargo build --release --target x86_64-apple-darwin && lipo -create ... -output dist/sidecar/prismgb-capture-sidecar`
- `npm run dev` and `npm run build` both depend on `build:sidecar` (turbo task graph, matches existing workspace pattern)
- `scripts/check-layer-boundaries.js` already ignores `packages/`; unchanged

### 8.3 electron-builder config

- `extraResources` copies `dist/sidecar/prismgb-capture-sidecar` into `Contents/Resources/sidecar/`
- `afterPack` hook codesigns the binary with Hardened Runtime enabled
- Entitlements additions:
  - `com.apple.security.device.camera` (AVFoundation)
  - `com.apple.security.device.usb` (required for this device class)
- Notarization via existing electron-builder step; ticket stapled

### 8.4 Runtime binary resolution (`capture-sidecar.config.ts`)

- Production: `path.join(process.resourcesPath, 'sidecar', 'prismgb-capture-sidecar')`
- Dev: `path.join(__dirname, '../../../../packages/prismgb-capture-sidecar/target/release/prismgb-capture-sidecar')`

### 8.5 Distribution

- Ships inside the normal PrismGB macOS .dmg; no separate download
- Entirely gated behind the experimental toggle — zero process/memory/IO cost when off
- Platform detection at startup: if not macOS, toggle visible but disabled with tooltip "Not yet available on this platform"

### 8.6 CI additions

Existing GitHub Actions PR-validation workflow adds a `sidecar` job:
- `cargo fmt --check`
- `cargo clippy -- -D warnings`
- `cargo test --all-features`
- `cargo build --release` for both macOS arches

Build artifacts cached between jobs so Vitest integration tests reuse them. Existing release workflow picks up `dist/sidecar/` via electron-builder's `extraResources`.

## 9. Explicit non-goals for v1

- Linux/Windows sidecar binaries (trait stubs only)
- Independent auto-update of the sidecar binary
- Multiple concurrent sidecar instances
- Audio capture via sidecar (stays on `getUserMedia` per §2)
- On-device format negotiation — sidecar only requests YUY2; if device doesn't advertise it, error out with `FormatUnsupported`, no fallback to other formats
- DevTools panel for sidecar metrics (tracked, non-blocking)

## 10. Open calibration items (resolve during implementation, not blocking design approval)

- **Color matrix**: BT.601 vs BT.709 vs custom — calibrate empirically with a known-RGB test pattern on first hardware bring-up. Matrix choice is a `recon::colorspace` enum parameter, configurable at sidecar start.
- **Ring buffer slot count** (default 4) — measure GC pause tails on Electron to pick final N.
- **shm-reader poll rate** (default 240 Hz) — measure tail latency on reference machine.
- **Chroma upsample kernel shape** (5×5 bilateral default) — calibrate against golden-frame SSIM.
- **Reference machine for bench thresholds** — name the CI macOS runner model (GitHub Actions' macOS-14 arm64 is the probable choice) and record its fps baseline as the regression bar.

## 11. References

- Chromatic FPGA root-cause plan: `../../../chromatic-repos/CHROMATIC_RGB24_PLAN.md`
- Existing FFmpeg subprocess supervisor pattern: `src/main/infrastructure/transcode/transcode-process.ts` (template for sidecar supervision)
- Existing acquisition layer: `src/renderer/infrastructure/streaming/acquisition/`
- Existing Chromatic device adapter: `src/renderer/infrastructure/adapters/devices/chromatic/`
- `MediaStreamTrackGenerator` — WebCodecs Insertable Streams, supported in Electron's Chromium (version-check during implementation)
