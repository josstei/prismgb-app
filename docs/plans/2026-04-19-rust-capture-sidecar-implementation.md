# Rust Capture Sidecar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an opt-in experimental macOS-only native video-capture path that reads YUY2 directly from AVFoundation, does chroma reconstruction + RGB24 conversion in Rust, and feeds the renderer via `MediaStreamTrackGenerator` — bypassing Chromium's lossy YUY2→I420/NV12 conversion.

**Architecture:** Single Rust binary spawned by Electron main process. POSIX shared-memory ring for frames, stdio line-JSON for control. Trait-based capture backend (macOS AVFoundation first, Linux/Windows stubbed). Renderer wraps the frame stream as a standard `MediaStream` so the existing GPU pipeline, recording, and screenshot services are untouched.

**Tech Stack:** Rust (Cargo), `objc2` + `core-video` (AVFoundation bindings), `nix` (POSIX shm), `serde`/`serde_json`, `wide` (SIMD), `thiserror`, `proptest`, `criterion`. Electron main process uses existing `child_process.spawn` pattern from `src/main/infrastructure/transcode/transcode-process.ts`. Renderer uses WebCodecs `MediaStreamTrackGenerator` + `VideoFrame`.

**Spec reference:** `docs/plans/2026-04-19-rust-capture-sidecar-design.md`

---

## Phase 0 — Scaffolding

### Task 0.1: Create Cargo workspace skeleton

**Files:**
- Create: `packages/prismgb-capture-sidecar/Cargo.toml`
- Create: `packages/prismgb-capture-sidecar/src/main.rs`
- Create: `packages/prismgb-capture-sidecar/.gitignore`
- Create: `packages/prismgb-capture-sidecar/README.md`

- [ ] **Step 1: Create `packages/prismgb-capture-sidecar/Cargo.toml`**

```toml
[package]
name = "prismgb-capture-sidecar"
version = "0.1.0"
edition = "2021"
publish = false

[[bin]]
name = "prismgb-capture-sidecar"
path = "src/main.rs"

[dependencies]
serde = { version = "1", features = ["derive"] }
serde_json = "1"
thiserror = "1"
nix = { version = "0.27", features = ["mman", "fs"] }
wide = "0.7"

[target.'cfg(target_os = "macos")'.dependencies]
objc2 = "0.5"
objc2-foundation = "0.2"
objc2-av-foundation = "0.2"
objc2-core-media = "0.2"
objc2-core-video = "0.2"
core-foundation = "0.9"

[dev-dependencies]
proptest = "1"
criterion = { version = "0.5", features = ["html_reports"] }

[[bench]]
name = "recon"
harness = false

[profile.release]
opt-level = 3
lto = "thin"
codegen-units = 1
strip = true
```

- [ ] **Step 2: Create `packages/prismgb-capture-sidecar/src/main.rs`**

```rust
fn main() {
    eprintln!("prismgb-capture-sidecar v{}", env!("CARGO_PKG_VERSION"));
}
```

- [ ] **Step 3: Create `packages/prismgb-capture-sidecar/.gitignore`**

```
/target
```

- [ ] **Step 4: Create `packages/prismgb-capture-sidecar/README.md`**

```markdown
# prismgb-capture-sidecar

Native video-capture binary for PrismGB. Spawned by Electron main process.
Reads raw YUY2 from the OS capture subsystem, performs chroma reconstruction
and RGB24 conversion, and publishes frames via POSIX shared memory.

See `docs/plans/2026-04-19-rust-capture-sidecar-design.md` for design.

## Build

    cargo build --release

Produces `target/release/prismgb-capture-sidecar`.

## Test

    cargo test
    cargo clippy -- -D warnings
    cargo fmt --check
```

- [ ] **Step 5: Verify it builds**

Run: `cd packages/prismgb-capture-sidecar && cargo build`
Expected: Successful compile; binary at `target/debug/prismgb-capture-sidecar`.

- [ ] **Step 6: Commit**

```bash
git add packages/prismgb-capture-sidecar/
git commit -m "feat(capture-sidecar): scaffold Rust workspace"
```

---

### Task 0.2: Wire into npm workspace and add build script

**Files:**
- Modify: `package.json` (workspaces, scripts)
- Create: `scripts/build-sidecar.js`

- [ ] **Step 1: Add sidecar to workspaces in `package.json`**

The `workspaces` field already has `"packages/*"` (line 8-10) so no change needed — the new `packages/prismgb-capture-sidecar/` directory is picked up automatically. Verify by running `npm ls --workspaces` and confirming `prismgb-capture-sidecar@0.1.0` appears.

- [ ] **Step 2: Create `scripts/build-sidecar.js`**

```javascript
#!/usr/bin/env node
/**
 * Builds the Rust capture sidecar for macOS (universal arm64 + x64).
 * Output: dist/sidecar/prismgb-capture-sidecar
 */
import { execSync } from 'node:child_process';
import { mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const SIDECAR = join(ROOT, 'packages/prismgb-capture-sidecar');
const OUT_DIR = join(ROOT, 'dist/sidecar');
const OUT_BIN = join(OUT_DIR, 'prismgb-capture-sidecar');

function run(cmd, cwd = SIDECAR) {
  console.log(`→ ${cmd}`);
  execSync(cmd, { cwd, stdio: 'inherit' });
}

if (process.platform !== 'darwin') {
  console.log('[build-sidecar] not on macOS — skipping sidecar build');
  process.exit(0);
}

mkdirSync(OUT_DIR, { recursive: true });

const mode = process.env.SIDECAR_MODE === 'release' ? 'release' : 'debug';
const flag = mode === 'release' ? '--release' : '';

if (mode === 'release') {
  run(`cargo build --release --target aarch64-apple-darwin`);
  run(`cargo build --release --target x86_64-apple-darwin`);
  const arm = join(SIDECAR, 'target/aarch64-apple-darwin/release/prismgb-capture-sidecar');
  const x64 = join(SIDECAR, 'target/x86_64-apple-darwin/release/prismgb-capture-sidecar');
  run(`lipo -create "${arm}" "${x64}" -output "${OUT_BIN}"`, ROOT);
} else {
  run(`cargo build ${flag}`);
  const bin = join(SIDECAR, `target/${mode}/prismgb-capture-sidecar`);
  copyFileSync(bin, OUT_BIN);
}

if (!existsSync(OUT_BIN)) {
  console.error('[build-sidecar] binary not produced');
  process.exit(1);
}

console.log(`[build-sidecar] ok → ${OUT_BIN}`);
```

- [ ] **Step 3: Add npm scripts to `package.json`**

Add to `scripts` block:
```json
"build:sidecar": "node scripts/build-sidecar.js",
"build:sidecar:release": "SIDECAR_MODE=release node scripts/build-sidecar.js",
"test:sidecar": "cd packages/prismgb-capture-sidecar && cargo test && cargo clippy -- -D warnings && cargo fmt --check"
```

Update `dev` and `build` to depend on sidecar build:
- Change `"dev": "node scripts/patch-mac-app-name.js && vite"` to `"dev": "npm run build:sidecar && node scripts/patch-mac-app-name.js && vite"`
- Change `"build": "vite build && electron-builder"` to `"build": "npm run build:sidecar:release && vite build && electron-builder"`
- Change `"build:mac": "vite build && electron-builder --mac"` to `"build:mac": "npm run build:sidecar:release && vite build && electron-builder --mac"`

- [ ] **Step 4: Run the build and verify**

Run: `npm run build:sidecar`
Expected: `dist/sidecar/prismgb-capture-sidecar` exists and runs: `./dist/sidecar/prismgb-capture-sidecar` prints version to stderr.

- [ ] **Step 5: Update `.gitignore`**

Add to repo root `.gitignore`:
```
dist/sidecar/
```

- [ ] **Step 6: Commit**

```bash
git add package.json scripts/build-sidecar.js .gitignore
git commit -m "build(capture-sidecar): add npm build script + workspace integration"
```

---

## Phase 1 — Rust IPC control plane

### Task 1.1: Define IPC control message types

**Files:**
- Create: `packages/prismgb-capture-sidecar/src/ipc/mod.rs`
- Create: `packages/prismgb-capture-sidecar/src/ipc/control.rs`
- Create: `packages/prismgb-capture-sidecar/src/error.rs`

- [ ] **Step 1: Create `src/error.rs`**

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error, Serialize, Clone)]
#[serde(tag = "variant")]
pub enum SidecarError {
    #[error("device not found")]
    DeviceNotFound,
    #[error("format unsupported: {detail}")]
    FormatUnsupported { detail: String },
    #[error("permission denied: {scope}")]
    PermissionDenied { scope: String },
    #[error("shm open failed: {detail}")]
    ShmOpenFailed { detail: String },
    #[error("capture stalled")]
    CaptureStalled,
    #[error("internal: {detail}")]
    Internal { detail: String },
}
```

- [ ] **Step 2: Create `src/ipc/mod.rs`**

```rust
pub mod control;
pub mod shm;
```

- [ ] **Step 3: Create `src/ipc/control.rs`**

```rust
use crate::error::SidecarError;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum InboundMessage {
    StartCapture { device_id: String },
    StopCapture,
    Ping,
    Shutdown,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type")]
pub enum OutboundMessage {
    Ready { shm_name: String, slots: u32 },
    Status { capturing: bool },
    Pong,
    DeviceGone,
    DeviceBack,
    Error { error: SidecarError },
}

pub fn encode(msg: &OutboundMessage) -> String {
    let mut s = serde_json::to_string(msg).expect("OutboundMessage serialization cannot fail");
    s.push('\n');
    s
}

pub fn decode(line: &str) -> Result<InboundMessage, serde_json::Error> {
    serde_json::from_str(line.trim())
}
```

- [ ] **Step 4: Wire modules in `src/main.rs`**

Replace the entire file:
```rust
mod error;
mod ipc;

fn main() {
    eprintln!("prismgb-capture-sidecar v{}", env!("CARGO_PKG_VERSION"));
}
```

- [ ] **Step 5: Add tests at bottom of `src/ipc/control.rs`**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn inbound_start_capture_round_trip() {
        let line = r#"{"type":"StartCapture","device_id":"abc-123"}"#;
        let decoded = decode(line).unwrap();
        assert_eq!(decoded, InboundMessage::StartCapture { device_id: "abc-123".to_string() });
    }

    #[test]
    fn inbound_stop_capture_round_trip() {
        let line = r#"{"type":"StopCapture"}"#;
        assert_eq!(decode(line).unwrap(), InboundMessage::StopCapture);
    }

    #[test]
    fn outbound_ready_encodes_newline_terminated() {
        let out = encode(&OutboundMessage::Ready {
            shm_name: "/prismgb-capture-42".to_string(),
            slots: 4,
        });
        assert!(out.ends_with('\n'));
        assert!(out.contains(r#""type":"Ready""#));
        assert!(out.contains(r#""slots":4"#));
    }

    #[test]
    fn outbound_error_variant_preserved() {
        let out = encode(&OutboundMessage::Error {
            error: SidecarError::DeviceNotFound,
        });
        assert!(out.contains(r#""variant":"DeviceNotFound""#));
    }
}
```

- [ ] **Step 6: Run tests**

Run: `cargo test --package prismgb-capture-sidecar`
Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add packages/prismgb-capture-sidecar/src/
git commit -m "feat(capture-sidecar): add IPC control message types"
```

---

### Task 1.2: Stdio control loop

**Files:**
- Modify: `packages/prismgb-capture-sidecar/src/ipc/control.rs`
- Modify: `packages/prismgb-capture-sidecar/src/main.rs`

- [ ] **Step 1: Append a stdio reader helper to `src/ipc/control.rs`**

```rust
use std::io::{BufRead, Write};
use std::sync::mpsc;

pub fn spawn_stdin_reader(sender: mpsc::Sender<InboundMessage>) {
    std::thread::Builder::new()
        .name("stdin-reader".into())
        .spawn(move || {
            let stdin = std::io::stdin();
            for line_result in stdin.lock().lines() {
                let Ok(line) = line_result else { break };
                if line.trim().is_empty() { continue; }
                match decode(&line) {
                    Ok(msg) => {
                        if sender.send(msg).is_err() { break; }
                    }
                    Err(e) => {
                        eprintln!("bad control line: {e}: {line}");
                    }
                }
            }
        })
        .expect("spawn stdin reader");
}

pub fn send_stdout(msg: &OutboundMessage) {
    let s = encode(msg);
    let stdout = std::io::stdout();
    let mut lock = stdout.lock();
    let _ = lock.write_all(s.as_bytes());
    let _ = lock.flush();
}
```

- [ ] **Step 2: Replace `src/main.rs` with an interactive skeleton**

```rust
mod error;
mod ipc;

use ipc::control::{self, InboundMessage, OutboundMessage};
use std::sync::mpsc;

fn main() {
    eprintln!("prismgb-capture-sidecar v{}", env!("CARGO_PKG_VERSION"));

    let (tx, rx) = mpsc::channel::<InboundMessage>();
    control::spawn_stdin_reader(tx);

    control::send_stdout(&OutboundMessage::Status { capturing: false });

    loop {
        match rx.recv() {
            Ok(InboundMessage::Ping) => control::send_stdout(&OutboundMessage::Pong),
            Ok(InboundMessage::Shutdown) => break,
            Ok(InboundMessage::StartCapture { .. }) => {
                control::send_stdout(&OutboundMessage::Status { capturing: true });
            }
            Ok(InboundMessage::StopCapture) => {
                control::send_stdout(&OutboundMessage::Status { capturing: false });
            }
            Err(_) => break,
        }
    }
}
```

- [ ] **Step 3: Smoke test**

Run:
```bash
cd packages/prismgb-capture-sidecar
cargo build
echo '{"type":"Ping"}
{"type":"Shutdown"}' | ./target/debug/prismgb-capture-sidecar
```

Expected stdout (one line each):
```
{"type":"Status","capturing":false}
{"type":"Pong"}
```

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-capture-sidecar/
git commit -m "feat(capture-sidecar): add stdio control loop"
```

---

## Phase 2 — POSIX shared-memory ring buffer

### Task 2.1: Frame header + ring buffer types

**Files:**
- Create: `packages/prismgb-capture-sidecar/src/ipc/shm.rs`

- [ ] **Step 1: Create `src/ipc/shm.rs` with layout types**

```rust
use std::sync::atomic::{AtomicU64, Ordering};

pub const SLOT_COUNT: usize = 4;
pub const FRAME_WIDTH: u32 = 160;
pub const FRAME_HEIGHT: u32 = 144;
pub const FRAME_BYTES: usize = (FRAME_WIDTH as usize) * (FRAME_HEIGHT as usize) * 3;

#[repr(C)]
pub struct FrameHeader {
    pub sequence: u64,
    pub pts_ns: u64,
    pub width: u32,
    pub height: u32,
    pub stride: u32,
    pub format: u32,  // 0 = RGB24
}

pub const FRAME_FORMAT_RGB24: u32 = 0;
pub const HEADER_SIZE: usize = std::mem::size_of::<FrameHeader>();
pub const SLOT_SIZE: usize = HEADER_SIZE + FRAME_BYTES;

#[repr(C)]
pub struct RingControl {
    pub head: AtomicU64,
    pub tail: AtomicU64,
    pub slots: u32,
    pub slot_size: u32,
    pub magic: u32,
}

pub const RING_MAGIC: u32 = 0x5047_4246; // "PGBF"
pub const CONTROL_SIZE: usize = std::mem::size_of::<RingControl>();
pub const TOTAL_SIZE: usize = CONTROL_SIZE + SLOT_COUNT * SLOT_SIZE;

impl RingControl {
    pub fn read_head(&self) -> u64 { self.head.load(Ordering::Acquire) }
    pub fn write_head(&self, v: u64) { self.head.store(v, Ordering::Release) }
    pub fn read_tail(&self) -> u64 { self.tail.load(Ordering::Acquire) }
    pub fn write_tail(&self, v: u64) { self.tail.store(v, Ordering::Release) }
}
```

- [ ] **Step 2: Register module**

Already wired via `pub mod shm;` in `src/ipc/mod.rs` from Task 1.1. No change.

- [ ] **Step 3: Build check**

Run: `cargo build --package prismgb-capture-sidecar`
Expected: compiles without warnings.

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-capture-sidecar/src/ipc/shm.rs
git commit -m "feat(capture-sidecar): add shm layout types"
```

---

### Task 2.2: shm_open + mmap wrapper with producer API

**Files:**
- Modify: `packages/prismgb-capture-sidecar/src/ipc/shm.rs`

- [ ] **Step 1: Append `ShmProducer` to `src/ipc/shm.rs`**

```rust
use nix::fcntl::OFlag;
use nix::sys::mman::{mmap, munmap, shm_open, shm_unlink, MapFlags, ProtFlags};
use nix::sys::stat::Mode;
use nix::unistd::ftruncate;
use std::num::NonZeroUsize;
use std::os::fd::{AsRawFd, OwnedFd};
use std::ptr::NonNull;

pub struct ShmProducer {
    name: String,
    ptr: NonNull<u8>,
    len: usize,
    _fd: OwnedFd,
    next_sequence: u64,
}

unsafe impl Send for ShmProducer {}

impl ShmProducer {
    pub fn create(name: &str) -> nix::Result<Self> {
        let fd = shm_open(
            name,
            OFlag::O_RDWR | OFlag::O_CREAT | OFlag::O_EXCL,
            Mode::S_IRUSR | Mode::S_IWUSR,
        )?;
        ftruncate(fd.as_raw_fd(), TOTAL_SIZE as i64)?;
        let len = NonZeroUsize::new(TOTAL_SIZE).unwrap();
        let ptr = unsafe {
            mmap(
                None,
                len,
                ProtFlags::PROT_READ | ProtFlags::PROT_WRITE,
                MapFlags::MAP_SHARED,
                Some(&fd),
                0,
            )?
        };
        let ptr = NonNull::new(ptr as *mut u8).expect("mmap returned null");

        let ctrl = unsafe { &mut *(ptr.as_ptr() as *mut RingControl) };
        ctrl.head = AtomicU64::new(0);
        ctrl.tail = AtomicU64::new(0);
        ctrl.slots = SLOT_COUNT as u32;
        ctrl.slot_size = SLOT_SIZE as u32;
        ctrl.magic = RING_MAGIC;

        Ok(Self {
            name: name.to_string(),
            ptr,
            len: TOTAL_SIZE,
            _fd: fd,
            next_sequence: 1,
        })
    }

    pub fn name(&self) -> &str { &self.name }

    pub fn write_frame(&mut self, pts_ns: u64, rgb24: &[u8]) {
        assert_eq!(rgb24.len(), FRAME_BYTES, "frame size mismatch");

        let ctrl = unsafe { &*(self.ptr.as_ptr() as *const RingControl) };
        let head = ctrl.read_head();
        let slot_idx = (head as usize) % SLOT_COUNT;
        let slot_offset = CONTROL_SIZE + slot_idx * SLOT_SIZE;

        unsafe {
            let slot_ptr = self.ptr.as_ptr().add(slot_offset);
            let header = &mut *(slot_ptr as *mut FrameHeader);
            header.sequence = self.next_sequence;
            header.pts_ns = pts_ns;
            header.width = FRAME_WIDTH;
            header.height = FRAME_HEIGHT;
            header.stride = FRAME_WIDTH * 3;
            header.format = FRAME_FORMAT_RGB24;

            let data_ptr = slot_ptr.add(HEADER_SIZE);
            std::ptr::copy_nonoverlapping(rgb24.as_ptr(), data_ptr, FRAME_BYTES);
        }

        ctrl.write_head(head + 1);
        self.next_sequence += 1;
    }
}

impl Drop for ShmProducer {
    fn drop(&mut self) {
        unsafe {
            let _ = munmap(self.ptr.as_ptr() as *mut std::ffi::c_void, self.len);
        }
        let _ = shm_unlink(self.name.as_str());
    }
}
```

- [ ] **Step 2: Add test for single-frame write**

Append to `src/ipc/shm.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    fn test_name() -> String {
        format!("/prismgb-test-{}-{}", std::process::id(), rand_suffix())
    }

    fn rand_suffix() -> u64 {
        use std::time::{SystemTime, UNIX_EPOCH};
        SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_nanos() as u64
    }

    #[test]
    fn producer_writes_frame_and_advances_head() {
        let name = test_name();
        let mut producer = ShmProducer::create(&name).expect("shm create");

        let frame = vec![0xABu8; FRAME_BYTES];
        producer.write_frame(12345, &frame);

        let ctrl = unsafe { &*(producer.ptr.as_ptr() as *const RingControl) };
        assert_eq!(ctrl.read_head(), 1);
        assert_eq!(ctrl.slots, SLOT_COUNT as u32);
        assert_eq!(ctrl.magic, RING_MAGIC);
    }

    #[test]
    fn wraparound_after_slot_count_writes() {
        let name = test_name();
        let mut producer = ShmProducer::create(&name).expect("shm create");

        let frame = vec![0x42u8; FRAME_BYTES];
        for _ in 0..(SLOT_COUNT + 2) {
            producer.write_frame(0, &frame);
        }

        let ctrl = unsafe { &*(producer.ptr.as_ptr() as *const RingControl) };
        assert_eq!(ctrl.read_head(), (SLOT_COUNT + 2) as u64);
    }
}
```

- [ ] **Step 3: Run tests**

Run: `cargo test --package prismgb-capture-sidecar shm::tests`
Expected: 2 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-capture-sidecar/src/ipc/shm.rs
git commit -m "feat(capture-sidecar): add shm producer with mmap"
```

---

### Task 2.3: Consumer reader + drop-oldest semantics

**Files:**
- Modify: `packages/prismgb-capture-sidecar/src/ipc/shm.rs`

- [ ] **Step 1: Append `ShmConsumer` (for in-process tests; main consumer lives in TS)**

```rust
pub struct ShmConsumer {
    ptr: NonNull<u8>,
    len: usize,
    _fd: OwnedFd,
    last_seq: u64,
}

unsafe impl Send for ShmConsumer {}

pub struct ReadFrame<'a> {
    pub header: &'a FrameHeader,
    pub data: &'a [u8],
}

impl ShmConsumer {
    pub fn open(name: &str) -> nix::Result<Self> {
        let fd = shm_open(name, OFlag::O_RDWR, Mode::empty())?;
        let len = NonZeroUsize::new(TOTAL_SIZE).unwrap();
        let ptr = unsafe {
            mmap(None, len, ProtFlags::PROT_READ, MapFlags::MAP_SHARED, Some(&fd), 0)?
        };
        let ptr = NonNull::new(ptr as *mut u8).expect("mmap returned null");
        Ok(Self { ptr, len: TOTAL_SIZE, _fd: fd, last_seq: 0 })
    }

    pub fn try_read(&mut self) -> Option<ReadFrame<'_>> {
        let ctrl = unsafe { &*(self.ptr.as_ptr() as *const RingControl) };
        let head = ctrl.read_head();
        if head == 0 { return None; }

        // Drop-oldest: always read the most recent frame
        let latest_slot_idx = ((head - 1) as usize) % SLOT_COUNT;
        let slot_offset = CONTROL_SIZE + latest_slot_idx * SLOT_SIZE;

        let header = unsafe { &*(self.ptr.as_ptr().add(slot_offset) as *const FrameHeader) };
        if header.sequence <= self.last_seq { return None; }
        self.last_seq = header.sequence;

        let data = unsafe {
            std::slice::from_raw_parts(
                self.ptr.as_ptr().add(slot_offset + HEADER_SIZE),
                FRAME_BYTES,
            )
        };
        Some(ReadFrame { header, data })
    }
}

impl Drop for ShmConsumer {
    fn drop(&mut self) {
        unsafe { let _ = munmap(self.ptr.as_ptr() as *mut std::ffi::c_void, self.len); }
    }
}
```

- [ ] **Step 2: Add end-to-end producer/consumer test**

Append to the `tests` module in `src/ipc/shm.rs`:
```rust
    #[test]
    fn consumer_reads_latest_after_overwrite() {
        let name = test_name();
        let mut producer = ShmProducer::create(&name).expect("shm create");
        let mut consumer = ShmConsumer::open(&name).expect("shm open");

        for i in 0..(SLOT_COUNT as u8 + 3) {
            let frame = vec![i; FRAME_BYTES];
            producer.write_frame(i as u64, &frame);
        }

        let latest = consumer.try_read().expect("should have latest frame");
        let expected_value = SLOT_COUNT as u8 + 2;
        assert_eq!(latest.data[0], expected_value);
        assert_eq!(latest.header.sequence, (SLOT_COUNT + 3) as u64);

        assert!(consumer.try_read().is_none(), "no new frame after last read");
    }
```

- [ ] **Step 3: Run tests**

Run: `cargo test --package prismgb-capture-sidecar shm::tests`
Expected: 3 passed.

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-capture-sidecar/src/ipc/shm.rs
git commit -m "feat(capture-sidecar): add shm consumer with drop-oldest semantics"
```

---

## Phase 3 — Reconstruction

### Task 3.1: Chroma upsample (bilinear baseline)

**Files:**
- Create: `packages/prismgb-capture-sidecar/src/recon/mod.rs`
- Create: `packages/prismgb-capture-sidecar/src/recon/chroma.rs`

- [ ] **Step 1: Create `src/recon/mod.rs`**

```rust
pub mod chroma;
pub mod colorspace;
```

- [ ] **Step 2: Create `src/recon/chroma.rs`**

```rust
/// Unpack YUY2 (YUYV 4:2:2 packed) into three full-resolution planes.
///
/// YUY2 byte order: Y0 U0 Y1 V0 | Y2 U1 Y3 V1 | ...
/// U and V are shared between pairs of horizontally-adjacent pixels.
/// We upsample U/V to full resolution with horizontal bilinear interpolation.
///
/// Inputs:
///   yuy2:   WIDTH*HEIGHT*2 bytes
/// Outputs:
///   y_out:  WIDTH*HEIGHT bytes
///   u_out:  WIDTH*HEIGHT bytes
///   v_out:  WIDTH*HEIGHT bytes
pub fn unpack_yuy2_bilinear(
    yuy2: &[u8],
    width: usize,
    height: usize,
    y_out: &mut [u8],
    u_out: &mut [u8],
    v_out: &mut [u8],
) {
    assert_eq!(yuy2.len(), width * height * 2);
    assert_eq!(y_out.len(), width * height);
    assert_eq!(u_out.len(), width * height);
    assert_eq!(v_out.len(), width * height);
    assert!(width >= 2 && width % 2 == 0, "width must be even and ≥ 2");

    for row in 0..height {
        let src_row = &yuy2[row * width * 2..(row + 1) * width * 2];
        let y_row = &mut y_out[row * width..(row + 1) * width];
        let u_row = &mut u_out[row * width..(row + 1) * width];
        let v_row = &mut v_out[row * width..(row + 1) * width];

        // Extract Y at every pixel; U at even pixels; V at even pixels.
        for pair in 0..(width / 2) {
            let i = pair * 4;
            let px0 = pair * 2;
            let px1 = pair * 2 + 1;
            y_row[px0] = src_row[i];
            y_row[px1] = src_row[i + 2];
            u_row[px0] = src_row[i + 1];
            v_row[px0] = src_row[i + 3];
        }
        // Bilinear for odd pixels: average of neighboring even samples.
        for pair in 0..(width / 2) {
            let px0 = pair * 2;
            let px1 = pair * 2 + 1;
            let next_even = if pair + 1 < width / 2 { (pair + 1) * 2 } else { px0 };
            u_row[px1] = ((u_row[px0] as u16 + u_row[next_even] as u16) / 2) as u8;
            v_row[px1] = ((v_row[px0] as u16 + v_row[next_even] as u16) / 2) as u8;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solid_color_unpacks_identically() {
        let w = 4;
        let h = 2;
        // Y=128, U=64, V=200 for every pixel pair
        let yuy2 = vec![128, 64, 128, 200, 128, 64, 128, 200].repeat(h);
        let mut y = vec![0u8; w * h];
        let mut u = vec![0u8; w * h];
        let mut v = vec![0u8; w * h];
        unpack_yuy2_bilinear(&yuy2, w, h, &mut y, &mut u, &mut v);
        assert!(y.iter().all(|&b| b == 128));
        assert!(u.iter().all(|&b| b == 64));
        assert!(v.iter().all(|&b| b == 200));
    }

    #[test]
    fn odd_pixel_chroma_is_interpolated() {
        let w = 4;
        let h = 1;
        // pair 0: Y=0, U=100, Y=0, V=100
        // pair 1: Y=0, U=200, Y=0, V=200
        let yuy2 = vec![0, 100, 0, 100, 0, 200, 0, 200];
        let mut y = vec![0u8; 4];
        let mut u = vec![0u8; 4];
        let mut v = vec![0u8; 4];
        unpack_yuy2_bilinear(&yuy2, w, h, &mut y, &mut u, &mut v);
        assert_eq!(u, vec![100, 150, 200, 200]);
        assert_eq!(v, vec![100, 150, 200, 200]);
    }
}
```

- [ ] **Step 3: Wire module in `src/main.rs`**

Add `mod recon;` after `mod ipc;`:
```rust
mod error;
mod ipc;
mod recon;
```

- [ ] **Step 4: Run tests**

Run: `cargo test --package prismgb-capture-sidecar recon::chroma`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-capture-sidecar/src/
git commit -m "feat(capture-sidecar): add YUY2 bilinear chroma upsampler"
```

---

### Task 3.2: YCbCr→RGB24 colorspace conversion

**Files:**
- Create: `packages/prismgb-capture-sidecar/src/recon/colorspace.rs`

- [ ] **Step 1: Create `src/recon/colorspace.rs`**

```rust
#[derive(Debug, Clone, Copy)]
pub enum ColorMatrix {
    Bt601Full,
    Bt709Full,
}

/// Convert planar Y, U, V (all full-resolution, all 0..=255) to packed RGB24.
pub fn ycbcr_to_rgb24(
    y: &[u8],
    u: &[u8],
    v: &[u8],
    rgb_out: &mut [u8],
    matrix: ColorMatrix,
) {
    assert_eq!(y.len(), u.len());
    assert_eq!(u.len(), v.len());
    assert_eq!(rgb_out.len(), y.len() * 3);

    match matrix {
        ColorMatrix::Bt601Full => convert_bt601_full(y, u, v, rgb_out),
        ColorMatrix::Bt709Full => convert_bt709_full(y, u, v, rgb_out),
    }
}

fn convert_bt601_full(y: &[u8], u: &[u8], v: &[u8], rgb_out: &mut [u8]) {
    // Full-range BT.601: Y, Cb, Cr all 0..=255.
    // R = Y + 1.402   (V - 128)
    // G = Y - 0.344136(U - 128) - 0.714136(V - 128)
    // B = Y + 1.772   (U - 128)
    for i in 0..y.len() {
        let yi = y[i] as f32;
        let ui = u[i] as f32 - 128.0;
        let vi = v[i] as f32 - 128.0;
        let r = yi + 1.402 * vi;
        let g = yi - 0.344136 * ui - 0.714136 * vi;
        let b = yi + 1.772 * ui;
        rgb_out[i * 3]     = clamp_u8(r);
        rgb_out[i * 3 + 1] = clamp_u8(g);
        rgb_out[i * 3 + 2] = clamp_u8(b);
    }
}

fn convert_bt709_full(y: &[u8], u: &[u8], v: &[u8], rgb_out: &mut [u8]) {
    // Full-range BT.709
    // R = Y + 1.5748  (V - 128)
    // G = Y - 0.1873  (U - 128) - 0.4681(V - 128)
    // B = Y + 1.8556  (U - 128)
    for i in 0..y.len() {
        let yi = y[i] as f32;
        let ui = u[i] as f32 - 128.0;
        let vi = v[i] as f32 - 128.0;
        let r = yi + 1.5748 * vi;
        let g = yi - 0.1873 * ui - 0.4681 * vi;
        let b = yi + 1.8556 * ui;
        rgb_out[i * 3]     = clamp_u8(r);
        rgb_out[i * 3 + 1] = clamp_u8(g);
        rgb_out[i * 3 + 2] = clamp_u8(b);
    }
}

#[inline(always)]
fn clamp_u8(v: f32) -> u8 {
    v.round().clamp(0.0, 255.0) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn neutral_gray_stays_neutral_bt601() {
        let y = vec![128u8; 4];
        let u = vec![128u8; 4];
        let v = vec![128u8; 4];
        let mut rgb = vec![0u8; 12];
        ycbcr_to_rgb24(&y, &u, &v, &mut rgb, ColorMatrix::Bt601Full);
        for chunk in rgb.chunks_exact(3) {
            assert_eq!(chunk, &[128, 128, 128]);
        }
    }

    #[test]
    fn pure_red_bt601_full() {
        // Full-range BT.601: pure red RGB(255,0,0) encodes to Y=76, U=85, V=255
        let y = vec![76];
        let u = vec![85];
        let v = vec![255];
        let mut rgb = vec![0u8; 3];
        ycbcr_to_rgb24(&y, &u, &v, &mut rgb, ColorMatrix::Bt601Full);
        // Round-trip tolerance of a few codes is expected
        assert!(rgb[0] >= 250, "R ≈ 255, got {}", rgb[0]);
        assert!(rgb[1] <= 5, "G ≈ 0, got {}", rgb[1]);
        assert!(rgb[2] <= 5, "B ≈ 0, got {}", rgb[2]);
    }

    #[test]
    fn output_length_matches_input() {
        let y = vec![100u8; 10];
        let u = vec![100u8; 10];
        let v = vec![100u8; 10];
        let mut rgb = vec![0u8; 30];
        ycbcr_to_rgb24(&y, &u, &v, &mut rgb, ColorMatrix::Bt709Full);
        assert_eq!(rgb.len(), y.len() * 3);
    }
}
```

- [ ] **Step 2: Run tests**

Run: `cargo test --package prismgb-capture-sidecar recon::colorspace`
Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add packages/prismgb-capture-sidecar/src/recon/
git commit -m "feat(capture-sidecar): add YCbCr→RGB24 matrix conversion"
```

---

### Task 3.3: Combined YUY2→RGB24 pipeline + property test

**Files:**
- Create: `packages/prismgb-capture-sidecar/src/recon/pipeline.rs`
- Modify: `packages/prismgb-capture-sidecar/src/recon/mod.rs`

- [ ] **Step 1: Create `src/recon/pipeline.rs`**

```rust
use super::chroma::unpack_yuy2_bilinear;
use super::colorspace::{ycbcr_to_rgb24, ColorMatrix};

/// Scratch buffers for one full-resolution decoded YCbCr frame.
pub struct ReconBuffers {
    y: Vec<u8>,
    u: Vec<u8>,
    v: Vec<u8>,
    width: usize,
    height: usize,
}

impl ReconBuffers {
    pub fn new(width: usize, height: usize) -> Self {
        Self {
            y: vec![0; width * height],
            u: vec![0; width * height],
            v: vec![0; width * height],
            width,
            height,
        }
    }

    pub fn process(&mut self, yuy2: &[u8], rgb_out: &mut [u8], matrix: ColorMatrix) {
        unpack_yuy2_bilinear(yuy2, self.width, self.height, &mut self.y, &mut self.u, &mut self.v);
        ycbcr_to_rgb24(&self.y, &self.u, &self.v, rgb_out, matrix);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pipeline_produces_full_resolution_rgb() {
        let w = 160;
        let h = 144;
        let yuy2 = vec![128u8; w * h * 2];
        let mut rgb = vec![0u8; w * h * 3];
        let mut bufs = ReconBuffers::new(w, h);
        bufs.process(&yuy2, &mut rgb, ColorMatrix::Bt601Full);
        // Y=U=V=128 → neutral gray
        for px in rgb.chunks_exact(3) {
            assert_eq!(px, &[128, 128, 128]);
        }
    }
}

#[cfg(test)]
mod property_tests {
    use super::*;
    use proptest::prelude::*;

    proptest! {
        #[test]
        fn pipeline_never_panics_on_arbitrary_yuy2(
            bytes in prop::collection::vec(any::<u8>(), 160 * 144 * 2)
        ) {
            let mut rgb = vec![0u8; 160 * 144 * 3];
            let mut bufs = ReconBuffers::new(160, 144);
            bufs.process(&bytes, &mut rgb, ColorMatrix::Bt601Full);
            prop_assert_eq!(rgb.len(), 160 * 144 * 3);
        }
    }
}
```

- [ ] **Step 2: Register module**

In `src/recon/mod.rs`:
```rust
pub mod chroma;
pub mod colorspace;
pub mod pipeline;
```

- [ ] **Step 3: Run tests**

Run: `cargo test --package prismgb-capture-sidecar recon::pipeline`
Expected: 2 passed (1 unit + 1 proptest with 256 iterations by default).

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-capture-sidecar/src/recon/
git commit -m "feat(capture-sidecar): add combined YUY2→RGB24 pipeline with proptest"
```

---

## Phase 4 — Capture trait + fake backend

### Task 4.1: Capture trait + fake backend

**Files:**
- Create: `packages/prismgb-capture-sidecar/src/capture/mod.rs`
- Create: `packages/prismgb-capture-sidecar/src/capture/backend.rs`
- Create: `packages/prismgb-capture-sidecar/src/capture/fake.rs`

- [ ] **Step 1: Create `src/capture/backend.rs`**

```rust
use crate::error::SidecarError;

/// One raw YUY2 frame at capture resolution.
pub struct RawFrame {
    pub yuy2: Vec<u8>,
    pub pts_ns: u64,
}

pub trait CaptureBackend: Send {
    fn start(&mut self, device_id: &str) -> Result<(), SidecarError>;
    fn stop(&mut self);
    /// Blocks until a frame is available or stop() is called.
    /// Returns None when the backend has stopped.
    fn next_frame(&mut self) -> Option<RawFrame>;
}
```

- [ ] **Step 2: Create `src/capture/fake.rs`**

```rust
use super::backend::{CaptureBackend, RawFrame};
use crate::error::SidecarError;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};

pub struct FakeBackend {
    running: Arc<AtomicBool>,
    pattern: u8,
    frame_count: u64,
    started_at: Option<Instant>,
}

impl FakeBackend {
    pub fn new() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            pattern: 0,
            frame_count: 0,
            started_at: None,
        }
    }
}

impl Default for FakeBackend {
    fn default() -> Self { Self::new() }
}

impl CaptureBackend for FakeBackend {
    fn start(&mut self, _device_id: &str) -> Result<(), SidecarError> {
        self.running.store(true, Ordering::Release);
        self.started_at = Some(Instant::now());
        Ok(())
    }

    fn stop(&mut self) {
        self.running.store(false, Ordering::Release);
    }

    fn next_frame(&mut self) -> Option<RawFrame> {
        if !self.running.load(Ordering::Acquire) { return None; }

        // Deterministic frame: fill YUY2 with a rotating byte pattern.
        self.pattern = self.pattern.wrapping_add(1);
        self.frame_count += 1;

        let mut yuy2 = vec![0u8; 160 * 144 * 2];
        for (i, b) in yuy2.iter_mut().enumerate() {
            *b = self.pattern.wrapping_add((i % 256) as u8);
        }

        let pts_ns = self.started_at.unwrap().elapsed().as_nanos() as u64;
        std::thread::sleep(Duration::from_millis(16)); // Simulate ~60fps
        Some(RawFrame { yuy2, pts_ns })
    }
}
```

- [ ] **Step 3: Create `src/capture/mod.rs`**

```rust
pub mod backend;
pub mod fake;

#[cfg(target_os = "macos")]
pub mod macos;
#[cfg(target_os = "linux")]
pub mod linux;
#[cfg(target_os = "windows")]
pub mod windows;
```

- [ ] **Step 4: Create stub backends to satisfy `cfg` paths**

`src/capture/linux.rs`:
```rust
use super::backend::{CaptureBackend, RawFrame};
use crate::error::SidecarError;

pub struct LinuxBackend;

impl CaptureBackend for LinuxBackend {
    fn start(&mut self, _device_id: &str) -> Result<(), SidecarError> {
        Err(SidecarError::Internal { detail: "Linux backend not implemented".into() })
    }
    fn stop(&mut self) {}
    fn next_frame(&mut self) -> Option<RawFrame> { None }
}
```

`src/capture/windows.rs`:
```rust
use super::backend::{CaptureBackend, RawFrame};
use crate::error::SidecarError;

pub struct WindowsBackend;

impl CaptureBackend for WindowsBackend {
    fn start(&mut self, _device_id: &str) -> Result<(), SidecarError> {
        Err(SidecarError::Internal { detail: "Windows backend not implemented".into() })
    }
    fn stop(&mut self) {}
    fn next_frame(&mut self) -> Option<RawFrame> { None }
}
```

- [ ] **Step 5: Wire `mod capture;` in `src/main.rs`**

```rust
mod capture;
mod error;
mod ipc;
mod recon;
```

- [ ] **Step 6: Add a simple test for the fake backend**

Append to `src/capture/fake.rs`:
```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fake_produces_frames_when_running() {
        let mut b = FakeBackend::new();
        b.start("test").unwrap();
        let frame = b.next_frame().expect("should produce frame");
        assert_eq!(frame.yuy2.len(), 160 * 144 * 2);
        b.stop();
        assert!(b.next_frame().is_none(), "no frames after stop");
    }
}
```

- [ ] **Step 7: Run tests + build**

Run: `cargo test --package prismgb-capture-sidecar && cargo build --package prismgb-capture-sidecar`
Expected: all tests pass; builds on macOS with `macos.rs` missing is OK because `mod capture/macos` compiles only when cfg matches — will fail until Task 6.1 creates it. For now, comment out the `#[cfg(target_os = "macos")] pub mod macos;` line in `src/capture/mod.rs` until Phase 6 lands, or stub it now:

`src/capture/macos.rs` (temporary stub, replaced in Phase 6):
```rust
use super::backend::{CaptureBackend, RawFrame};
use crate::error::SidecarError;

pub struct MacosBackend;

impl CaptureBackend for MacosBackend {
    fn start(&mut self, _device_id: &str) -> Result<(), SidecarError> {
        Err(SidecarError::Internal { detail: "macos backend not yet wired (see Phase 6)".into() })
    }
    fn stop(&mut self) {}
    fn next_frame(&mut self) -> Option<RawFrame> { None }
}
```

Now run: `cargo test && cargo build`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add packages/prismgb-capture-sidecar/src/
git commit -m "feat(capture-sidecar): add capture trait + fake/stub backends"
```

---

## Phase 5 — End-to-end pipeline wiring

### Task 5.1: Pipeline loop driving fake backend through recon to shm

**Files:**
- Create: `packages/prismgb-capture-sidecar/src/pipeline.rs`
- Modify: `packages/prismgb-capture-sidecar/src/main.rs`

- [ ] **Step 1: Create `src/pipeline.rs`**

```rust
use crate::capture::backend::CaptureBackend;
use crate::error::SidecarError;
use crate::ipc::shm::{ShmProducer, FRAME_BYTES, FRAME_HEIGHT, FRAME_WIDTH};
use crate::recon::colorspace::ColorMatrix;
use crate::recon::pipeline::ReconBuffers;

pub struct Pipeline<B: CaptureBackend> {
    backend: B,
    recon: ReconBuffers,
    producer: ShmProducer,
    matrix: ColorMatrix,
    rgb_scratch: Vec<u8>,
}

impl<B: CaptureBackend> Pipeline<B> {
    pub fn new(backend: B, shm_name: &str, matrix: ColorMatrix) -> Result<Self, SidecarError> {
        let producer = ShmProducer::create(shm_name)
            .map_err(|e| SidecarError::ShmOpenFailed { detail: e.to_string() })?;
        Ok(Self {
            backend,
            recon: ReconBuffers::new(FRAME_WIDTH as usize, FRAME_HEIGHT as usize),
            producer,
            matrix,
            rgb_scratch: vec![0; FRAME_BYTES],
        })
    }

    pub fn shm_name(&self) -> &str { self.producer.name() }

    pub fn start(&mut self, device_id: &str) -> Result<(), SidecarError> {
        self.backend.start(device_id)
    }

    pub fn stop(&mut self) { self.backend.stop(); }

    /// Pull one frame from backend → recon → shm. Returns false if backend stopped.
    pub fn step(&mut self) -> bool {
        let Some(frame) = self.backend.next_frame() else { return false; };
        self.recon.process(&frame.yuy2, &mut self.rgb_scratch, self.matrix);
        self.producer.write_frame(frame.pts_ns, &self.rgb_scratch);
        true
    }
}
```

- [ ] **Step 2: Replace `src/main.rs` with wiring**

```rust
mod capture;
mod error;
mod ipc;
mod pipeline;
mod recon;

use capture::fake::FakeBackend;
use ipc::control::{self, InboundMessage, OutboundMessage};
use ipc::shm::SLOT_COUNT;
use pipeline::Pipeline;
use recon::colorspace::ColorMatrix;
use std::sync::mpsc;

fn main() {
    eprintln!("prismgb-capture-sidecar v{}", env!("CARGO_PKG_VERSION"));

    let (tx, rx) = mpsc::channel::<InboundMessage>();
    control::spawn_stdin_reader(tx);

    let shm_name = format!("/prismgb-capture-{}", std::process::id());

    let backend = if std::env::var("PRISMGB_FAKE_BACKEND").is_ok() {
        FakeBackend::new()
    } else {
        // Real backend wired in Phase 6; fall back to fake for now so this runs.
        FakeBackend::new()
    };

    let mut pipeline = match Pipeline::new(backend, &shm_name, ColorMatrix::Bt601Full) {
        Ok(p) => p,
        Err(e) => {
            control::send_stdout(&OutboundMessage::Error { error: e });
            std::process::exit(1);
        }
    };

    control::send_stdout(&OutboundMessage::Ready {
        shm_name: pipeline.shm_name().to_string(),
        slots: SLOT_COUNT as u32,
    });

    let mut capturing = false;

    loop {
        // Non-blocking receive of control messages
        while let Ok(msg) = rx.try_recv() {
            match msg {
                InboundMessage::Ping => control::send_stdout(&OutboundMessage::Pong),
                InboundMessage::StartCapture { device_id } => {
                    match pipeline.start(&device_id) {
                        Ok(()) => {
                            capturing = true;
                            control::send_stdout(&OutboundMessage::Status { capturing: true });
                        }
                        Err(e) => {
                            control::send_stdout(&OutboundMessage::Error { error: e });
                        }
                    }
                }
                InboundMessage::StopCapture => {
                    pipeline.stop();
                    capturing = false;
                    control::send_stdout(&OutboundMessage::Status { capturing: false });
                }
                InboundMessage::Shutdown => {
                    pipeline.stop();
                    return;
                }
            }
        }

        if capturing {
            if !pipeline.step() {
                capturing = false;
                control::send_stdout(&OutboundMessage::Status { capturing: false });
            }
        } else {
            std::thread::sleep(std::time::Duration::from_millis(10));
        }
    }
}
```

- [ ] **Step 3: Integration test via fixture binary**

Create `packages/prismgb-capture-sidecar/tests/integration_fake.rs`:
```rust
use std::io::{BufRead, BufReader, Write};
use std::process::{Command, Stdio};
use std::time::Duration;

#[test]
fn fake_backend_produces_frames_end_to_end() {
    let bin = env!("CARGO_BIN_EXE_prismgb-capture-sidecar");

    let mut child = Command::new(bin)
        .env("PRISMGB_FAKE_BACKEND", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .expect("spawn sidecar");

    let mut stdin = child.stdin.take().unwrap();
    let stdout = child.stdout.take().unwrap();
    let mut reader = BufReader::new(stdout);

    // Expect Ready first
    let mut ready_line = String::new();
    reader.read_line(&mut ready_line).expect("read Ready");
    assert!(ready_line.contains(r#""type":"Ready""#), "got: {ready_line}");

    // Start
    writeln!(stdin, r#"{{"type":"StartCapture","device_id":"any"}}"#).unwrap();

    // Expect Status capturing:true
    let mut status_line = String::new();
    reader.read_line(&mut status_line).expect("read Status");
    assert!(status_line.contains(r#""capturing":true"#));

    // Let it produce a few frames
    std::thread::sleep(Duration::from_millis(150));

    // Shutdown
    writeln!(stdin, r#"{{"type":"Shutdown"}}"#).unwrap();

    let status = child.wait_timeout_or_kill();
    assert!(status.success(), "sidecar exit: {:?}", status);
}

trait WaitTimeoutOrKill {
    fn wait_timeout_or_kill(&mut self) -> std::process::ExitStatus;
}
impl WaitTimeoutOrKill for std::process::Child {
    fn wait_timeout_or_kill(&mut self) -> std::process::ExitStatus {
        for _ in 0..50 {
            if let Ok(Some(s)) = self.try_wait() { return s; }
            std::thread::sleep(Duration::from_millis(100));
        }
        self.kill().ok();
        self.wait().unwrap()
    }
}
```

- [ ] **Step 4: Run everything**

Run: `cargo test --package prismgb-capture-sidecar`
Expected: all unit tests + integration test pass.

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-capture-sidecar/
git commit -m "feat(capture-sidecar): wire full pipeline end-to-end with fake backend"
```

---

## Phase 6 — macOS AVFoundation backend

Phase 6 replaces the stub `capture/macos.rs` with a real AVFoundation implementation. Execute sequentially; no interleaving with other phases because each sub-task depends on the prior.

### Task 6.1: AVFoundation device enumeration + permission probe

**Files:**
- Modify: `packages/prismgb-capture-sidecar/src/capture/macos.rs`

- [ ] **Step 1: Replace `src/capture/macos.rs` with device enumeration**

```rust
use super::backend::{CaptureBackend, RawFrame};
use crate::error::SidecarError;
use objc2::rc::Retained;
use objc2::runtime::ProtocolObject;
use objc2_av_foundation::{
    AVAuthorizationStatus, AVCaptureDevice, AVCaptureDeviceDiscoverySession,
    AVCaptureDevicePosition, AVCaptureDeviceTypeExternalUnknown, AVMediaTypeVideo,
};
use objc2_foundation::NSArray;
use std::sync::mpsc::{self, Receiver, Sender};
use std::sync::{Arc, Mutex};

pub struct MacosBackend {
    frame_rx: Option<Receiver<RawFrame>>,
    stop_flag: Arc<Mutex<bool>>,
    session_holder: Option<SessionHolder>,
}

struct SessionHolder {
    // Retained refs to the AVCaptureSession + delegate kept here so they live.
    // Filled in Task 6.3.
    _placeholder: (),
}

impl MacosBackend {
    pub fn new() -> Self {
        Self {
            frame_rx: None,
            stop_flag: Arc::new(Mutex::new(false)),
            session_holder: None,
        }
    }

    fn check_permission() -> Result<(), SidecarError> {
        let status = unsafe {
            AVCaptureDevice::authorizationStatusForMediaType(AVMediaTypeVideo)
        };
        match status {
            AVAuthorizationStatus::Authorized => Ok(()),
            AVAuthorizationStatus::Denied | AVAuthorizationStatus::Restricted => {
                Err(SidecarError::PermissionDenied { scope: "camera".into() })
            }
            AVAuthorizationStatus::NotDetermined => {
                // Spawn a request and wait briefly; if user dismisses, fall through as denied.
                // In practice, the request triggers the system prompt on first start.
                request_permission_blocking()
            }
            _ => Err(SidecarError::PermissionDenied { scope: "camera-unknown".into() }),
        }
    }

    fn find_device(device_id: &str) -> Result<Retained<AVCaptureDevice>, SidecarError> {
        let types = NSArray::from_slice(&[unsafe { AVCaptureDeviceTypeExternalUnknown }]);
        let session = unsafe {
            AVCaptureDeviceDiscoverySession::discoverySessionWithDeviceTypes_mediaType_position(
                &types,
                AVMediaTypeVideo,
                AVCaptureDevicePosition::Unspecified,
            )
        };
        let devices = unsafe { session.devices() };
        for i in 0..devices.count() {
            let dev = devices.objectAtIndex(i);
            let unique_id = unsafe { dev.uniqueID() };
            if unique_id.to_string() == device_id || device_id.is_empty() {
                return Ok(dev);
            }
        }
        Err(SidecarError::DeviceNotFound)
    }
}

fn request_permission_blocking() -> Result<(), SidecarError> {
    // Synchronous permission request approximation: poll until state resolves or time out.
    use std::time::{Duration, Instant};
    let start = Instant::now();
    // Kick off an async request (required on modern macOS); completion handler noop.
    unsafe {
        use objc2::rc::autoreleasepool;
        autoreleasepool(|_| {
            AVCaptureDevice::requestAccessForMediaType_completionHandler(
                AVMediaTypeVideo,
                &block2::RcBlock::new(|_granted: bool| {}),
            );
        });
    }
    loop {
        let status = unsafe { AVCaptureDevice::authorizationStatusForMediaType(AVMediaTypeVideo) };
        match status {
            AVAuthorizationStatus::Authorized => return Ok(()),
            AVAuthorizationStatus::Denied => {
                return Err(SidecarError::PermissionDenied { scope: "camera".into() });
            }
            _ => {
                if start.elapsed() > Duration::from_secs(30) {
                    return Err(SidecarError::PermissionDenied { scope: "camera-timeout".into() });
                }
                std::thread::sleep(Duration::from_millis(200));
            }
        }
    }
}

impl Default for MacosBackend {
    fn default() -> Self { Self::new() }
}

impl CaptureBackend for MacosBackend {
    fn start(&mut self, _device_id: &str) -> Result<(), SidecarError> {
        // Full session setup lands in Task 6.3; for now just validate permission + device.
        Self::check_permission()?;
        let _device = Self::find_device(_device_id)?;
        Err(SidecarError::Internal {
            detail: "AVFoundation session setup not yet wired (Task 6.3)".into(),
        })
    }

    fn stop(&mut self) {
        *self.stop_flag.lock().unwrap() = true;
        self.session_holder = None;
    }

    fn next_frame(&mut self) -> Option<RawFrame> {
        self.frame_rx.as_ref().and_then(|rx| rx.recv().ok())
    }
}
```

Note: the `objc2-av-foundation` API surface above is current to the crate versions pinned in `Cargo.toml`; if crate semver-minor bumps rename any symbols, the Rust compiler will point to the exact line. Consult the crate's docs.rs page for current method signatures if compilation fails.

- [ ] **Step 2: Add `block2` dependency**

In `packages/prismgb-capture-sidecar/Cargo.toml`, under `[target.'cfg(target_os = "macos")'.dependencies]`:
```toml
block2 = "0.5"
```

- [ ] **Step 3: Build — expect a "not yet wired" error from the stub**

Run: `cargo build --package prismgb-capture-sidecar`
Expected: clean compile. Linking may pull `AVFoundation.framework` automatically via `objc2-av-foundation`'s build script.

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-capture-sidecar/
git commit -m "feat(capture-sidecar): add AVFoundation device enumeration + permission probe"
```

---

### Task 6.2: AVFoundation session + YUY2 format request

**Files:**
- Modify: `packages/prismgb-capture-sidecar/src/capture/macos.rs`

- [ ] **Step 1: Append session setup helper + sample delegate**

Extend `src/capture/macos.rs` with an `unsafe impl` of a sample-buffer delegate. Because the exact delegate trait boilerplate with `objc2` is ~80 lines of macro-driven protocol implementation, structure the module as follows — adapt the skeleton to current `objc2` API:

```rust
use objc2::declare_class;
use objc2::mutability::MainThreadOnly;
use objc2_av_foundation::{
    AVCaptureSession, AVCaptureDeviceInput, AVCaptureVideoDataOutput,
    AVCaptureVideoDataOutputSampleBufferDelegate,
    AVCaptureSessionPresetLow,
};
use objc2_core_media::{CMSampleBuffer, CMSampleBufferGetImageBuffer};
use objc2_core_video::{
    CVPixelBufferLockBaseAddress, CVPixelBufferUnlockBaseAddress,
    CVPixelBufferGetBaseAddress, CVPixelBufferGetDataSize,
    kCVPixelBufferPixelFormatTypeKey, kCVPixelFormatType_422YpCbCr8_yuvs,
};

struct FrameSinkState {
    sender: Sender<RawFrame>,
}

declare_class!(
    struct FrameSink;

    unsafe impl ClassType for FrameSink {
        type Super = NSObject;
        type Mutability = MainThreadOnly;
        const NAME: &'static str = "PrismgbFrameSink";
    }

    impl DeclaredClass for FrameSink {
        type Ivars = FrameSinkState;
    }

    unsafe impl AVCaptureVideoDataOutputSampleBufferDelegate for FrameSink {
        #[method(captureOutput:didOutputSampleBuffer:fromConnection:)]
        fn did_output_sample_buffer(
            &self,
            _output: &AVCaptureVideoDataOutput,
            sample: &CMSampleBuffer,
            _connection: &AVCaptureConnection,
        ) {
            unsafe {
                let Some(pixel_buffer) = CMSampleBufferGetImageBuffer(sample) else { return; };
                CVPixelBufferLockBaseAddress(&pixel_buffer, 0);
                let base = CVPixelBufferGetBaseAddress(&pixel_buffer);
                let size = CVPixelBufferGetDataSize(&pixel_buffer);
                if !base.is_null() && size >= 160 * 144 * 2 {
                    let slice = std::slice::from_raw_parts(base as *const u8, 160 * 144 * 2);
                    let pts_ns = mach_absolute_time_ns();
                    let frame = RawFrame { yuy2: slice.to_vec(), pts_ns };
                    let _ = self.ivars().sender.send(frame);
                }
                CVPixelBufferUnlockBaseAddress(&pixel_buffer, 0);
            }
        }
    }
);

fn mach_absolute_time_ns() -> u64 {
    unsafe {
        let mut info = std::mem::zeroed();
        libc_mach::mach_timebase_info(&mut info);
        let t = libc_mach::mach_absolute_time();
        t.saturating_mul(info.numer as u64) / (info.denom as u64)
    }
}
```

Because the `declare_class!` macro signature evolves across `objc2` versions, consult current crate docs for exact syntax. The **behavior** required is: a class that conforms to `AVCaptureVideoDataOutputSampleBufferDelegate` and forwards sample buffers into a `Sender<RawFrame>`.

- [ ] **Step 2: Wire session construction into `MacosBackend::start`**

Replace the `start` body:
```rust
fn start(&mut self, device_id: &str) -> Result<(), SidecarError> {
    Self::check_permission()?;
    let device = Self::find_device(device_id)?;

    let (tx, rx) = mpsc::channel::<RawFrame>();
    let session = unsafe { AVCaptureSession::new() };
    unsafe { session.setSessionPreset(AVCaptureSessionPresetLow); }

    let input = unsafe {
        AVCaptureDeviceInput::deviceInputWithDevice_error(&device)
            .map_err(|e| SidecarError::Internal { detail: format!("input init: {e:?}") })?
    };
    if unsafe { session.canAddInput(&input) } {
        unsafe { session.addInput(&input); }
    } else {
        return Err(SidecarError::Internal { detail: "cannot add input".into() });
    }

    let output = unsafe { AVCaptureVideoDataOutput::new() };
    // Configure YUY2 format
    let settings = unsafe {
        use objc2_foundation::{NSDictionary, NSNumber};
        let fmt = NSNumber::new_u32(kCVPixelFormatType_422YpCbCr8_yuvs);
        NSDictionary::from_keys_and_objects(
            &[kCVPixelBufferPixelFormatTypeKey as &NSString],
            vec![fmt as Retained<NSObject>],
        )
    };
    unsafe { output.setVideoSettings(&settings); }

    let delegate = FrameSink::new(FrameSinkState { sender: tx });
    let queue = unsafe {
        dispatch_queue_create(b"com.prismgb.capture.frames\0".as_ptr() as *const _, std::ptr::null())
    };
    unsafe { output.setSampleBufferDelegate_queue(Some(&delegate), queue); }

    if unsafe { session.canAddOutput(&output) } {
        unsafe { session.addOutput(&output); }
    } else {
        return Err(SidecarError::FormatUnsupported { detail: "YUY2 output rejected".into() });
    }

    unsafe { session.startRunning(); }

    self.frame_rx = Some(rx);
    self.session_holder = Some(SessionHolder { _placeholder: () /* retain session + delegate + output */ });
    Ok(())
}
```

Note: the fully detailed `declare_class!` + `dispatch_queue_create` bindings require concrete `objc2`/`dispatch` crate usage that has minor evolution across versions; the above is the **functional contract**. Expect ~30-60 lines of adaptation when the compiler points to API mismatches. The key invariants to preserve:

1. The `AVCaptureSession` is retained for the lifetime of `MacosBackend::start..stop`.
2. `videoSettings` dictionary keys `kCVPixelBufferPixelFormatTypeKey` → `kCVPixelFormatType_422YpCbCr8_yuvs` — this is the YUY2 request.
3. The sample-buffer delegate runs on a background dispatch queue (not main thread).
4. The delegate copies YUY2 bytes into a `RawFrame` and sends through the channel.

- [ ] **Step 3: Build + smoke test on real hardware**

Run: `cargo build --package prismgb-capture-sidecar`

Then, with a Chromatic plugged in:
```bash
./packages/prismgb-capture-sidecar/target/debug/prismgb-capture-sidecar
```
In another shell, feed it:
```bash
echo '{"type":"StartCapture","device_id":""}' > /tmp/stdin-pipe
```

Expected: binary emits `Ready` then `Status capturing:true`, no crash within 5 seconds.

Macos Camera permission dialog should appear on first run.

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-capture-sidecar/
git commit -m "feat(capture-sidecar): wire AVFoundation session with YUY2 request"
```

---

### Task 6.3: Hotplug notifications + device-gone/back events

**Files:**
- Modify: `packages/prismgb-capture-sidecar/src/capture/macos.rs`
- Modify: `packages/prismgb-capture-sidecar/src/main.rs`

- [ ] **Step 1: Subscribe to AVFoundation connection notifications**

In `MacosBackend::start`, after session is running, register observers for:
- `AVCaptureDeviceWasConnectedNotification`
- `AVCaptureDeviceWasDisconnectedNotification`

Each handler posts a `HotplugEvent::Connected` / `HotplugEvent::Disconnected` into a second channel owned by the backend. Expose a new method on `CaptureBackend`:

Extend trait in `src/capture/backend.rs`:
```rust
pub enum HotplugEvent { Connected(String), Disconnected(String) }

pub trait CaptureBackend: Send {
    fn start(&mut self, device_id: &str) -> Result<(), SidecarError>;
    fn stop(&mut self);
    fn next_frame(&mut self) -> Option<RawFrame>;
    fn poll_hotplug(&mut self) -> Option<HotplugEvent> { None }
}
```

(Default impl returns `None` so `FakeBackend`/`LinuxBackend`/`WindowsBackend` don't need to implement it.)

Implement `poll_hotplug` in `MacosBackend` via `NSNotificationCenter`. The observer block pushes into an `mpsc::Sender<HotplugEvent>`. The receiver is consumed non-blocking by `poll_hotplug`.

- [ ] **Step 2: Emit DeviceGone/DeviceBack in `main.rs` loop**

In the main event loop (between `while let Ok(msg) = rx.try_recv()` and the `if capturing` block):
```rust
while let Some(event) = pipeline.poll_hotplug() {
    use crate::capture::backend::HotplugEvent;
    match event {
        HotplugEvent::Disconnected(_) => {
            control::send_stdout(&OutboundMessage::DeviceGone);
        }
        HotplugEvent::Connected(_) => {
            control::send_stdout(&OutboundMessage::DeviceBack);
        }
    }
}
```

And expose `poll_hotplug` on `Pipeline`:
```rust
// in src/pipeline.rs
pub fn poll_hotplug(&mut self) -> Option<crate::capture::backend::HotplugEvent> {
    self.backend.poll_hotplug()
}
```

- [ ] **Step 3: Smoke test — unplug device mid-capture**

Plug device → start capture → unplug device. Expect `DeviceGone` on stdout. Replug: expect `DeviceBack`.

- [ ] **Step 4: Commit**

```bash
git add packages/prismgb-capture-sidecar/
git commit -m "feat(capture-sidecar): add hotplug notifications"
```

---

## Phase 7 — Electron main: sidecar service

### Task 7.1: Sidecar config + types

**Files:**
- Create: `src/main/infrastructure/capture-sidecar/index.ts`
- Create: `src/main/infrastructure/capture-sidecar/capture-sidecar.config.ts`
- Create: `src/main/infrastructure/capture-sidecar/capture-sidecar.types.ts`

- [ ] **Step 1: Create `src/main/infrastructure/capture-sidecar/capture-sidecar.config.ts`**

```typescript
import { app } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CaptureSidecarConfig {
  readonly binaryPath: string;
  readonly readyTimeoutMs: number;
  readonly captureStallTimeoutMs: number;
  readonly maxRetriesPerWindow: number;
  readonly retryWindowMs: number;
  readonly backoffMs: readonly number[];
  readonly gracefulShutdownMs: number;
  readonly shmPollHz: number;
}

function resolveBinaryPath(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'sidecar', 'prismgb-capture-sidecar');
  }
  return path.join(
    __dirname,
    '../../../../packages/prismgb-capture-sidecar/target/debug/prismgb-capture-sidecar'
  );
}

export function getCaptureSidecarConfig(): CaptureSidecarConfig {
  return {
    binaryPath: resolveBinaryPath(),
    readyTimeoutMs: 3000,
    captureStallTimeoutMs: 500,
    maxRetriesPerWindow: 3,
    retryWindowMs: 60_000,
    backoffMs: [250, 1000, 4000],
    gracefulShutdownMs: 1000,
    shmPollHz: 240,
  };
}
```

- [ ] **Step 2: Create `src/main/infrastructure/capture-sidecar/capture-sidecar.types.ts`**

```typescript
export type SidecarState =
  | 'Disabled'
  | 'Starting'
  | 'Idle'
  | 'Capturing'
  | 'Stopping'
  | 'Crashed'
  | 'Dead';

export interface InboundMessage {
  type: 'StartCapture' | 'StopCapture' | 'Ping' | 'Shutdown';
  device_id?: string;
}

export type OutboundMessage =
  | { type: 'Ready'; shm_name: string; slots: number }
  | { type: 'Status'; capturing: boolean }
  | { type: 'Pong' }
  | { type: 'DeviceGone' }
  | { type: 'DeviceBack' }
  | { type: 'Error'; error: SidecarErrorPayload };

export interface SidecarErrorPayload {
  variant:
    | 'DeviceNotFound'
    | 'FormatUnsupported'
    | 'PermissionDenied'
    | 'ShmOpenFailed'
    | 'CaptureStalled'
    | 'Internal';
  detail?: string;
  scope?: string;
}
```

- [ ] **Step 3: Create `src/main/infrastructure/capture-sidecar/index.ts`**

```typescript
export { CaptureSidecarService } from './capture-sidecar.service.js';
export type { SidecarState } from './capture-sidecar.types.js';
export { getCaptureSidecarConfig } from './capture-sidecar.config.js';
```

- [ ] **Step 4: Commit**

```bash
git add src/main/infrastructure/capture-sidecar/
git commit -m "feat(main): add capture-sidecar config + types"
```

---

### Task 7.2: Sidecar child-process wrapper

**Files:**
- Create: `src/main/infrastructure/capture-sidecar/capture-sidecar-process.ts`

- [ ] **Step 1: Create the wrapper**

```typescript
import { spawn, ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import type { InboundMessage, OutboundMessage } from './capture-sidecar.types.js';

/**
 * Wraps the Rust sidecar binary as a child process with line-delimited JSON stdio.
 * Mirrors the supervisor pattern in src/main/infrastructure/transcode/transcode-process.ts
 * but for a long-lived interactive process.
 */
export class CaptureSidecarProcess extends EventEmitter {
  private proc: ChildProcess | null = null;
  private stdoutBuffer = '';
  private killTimer: NodeJS.Timeout | null = null;
  private readonly gracefulShutdownMs: number;

  constructor(
    private readonly binaryPath: string,
    gracefulShutdownMs: number,
  ) {
    super();
    this.gracefulShutdownMs = gracefulShutdownMs;
  }

  spawn(): void {
    if (this.proc) throw new Error('sidecar already running');

    this.proc = spawn(this.binaryPath, [], {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.proc.stdout!.setEncoding('utf8');
    this.proc.stdout!.on('data', (chunk: string) => this.onStdoutChunk(chunk));

    this.proc.stderr!.setEncoding('utf8');
    this.proc.stderr!.on('data', (line: string) => this.emit('stderr', line.trim()));

    this.proc.on('exit', (code, signal) => {
      this.proc = null;
      if (this.killTimer) { clearTimeout(this.killTimer); this.killTimer = null; }
      this.emit('exit', { code, signal });
    });

    this.proc.on('error', (err) => this.emit('error', err));
  }

  send(msg: InboundMessage): void {
    if (!this.proc || !this.proc.stdin) return;
    this.proc.stdin.write(JSON.stringify(msg) + '\n');
  }

  shutdown(): void {
    if (!this.proc) return;
    this.send({ type: 'Shutdown' });
    this.killTimer = setTimeout(() => {
      if (this.proc) this.proc.kill('SIGKILL');
    }, this.gracefulShutdownMs);
  }

  kill(): void {
    if (this.proc) {
      this.proc.kill('SIGKILL');
      if (this.killTimer) { clearTimeout(this.killTimer); this.killTimer = null; }
    }
  }

  get running(): boolean { return this.proc !== null; }

  private onStdoutChunk(chunk: string): void {
    this.stdoutBuffer += chunk;
    let idx: number;
    while ((idx = this.stdoutBuffer.indexOf('\n')) !== -1) {
      const line = this.stdoutBuffer.slice(0, idx);
      this.stdoutBuffer = this.stdoutBuffer.slice(idx + 1);
      if (!line) continue;
      try {
        const parsed = JSON.parse(line) as OutboundMessage;
        this.emit('message', parsed);
      } catch (e) {
        this.emit('malformed', line);
      }
    }
  }
}
```

- [ ] **Step 2: Unit test with stubbed child_process**

Create `tests/unit/main/capture-sidecar/capture-sidecar-process.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';

vi.mock('node:child_process', () => {
  const spawnMock = vi.fn();
  return { spawn: spawnMock };
});

import { spawn } from 'node:child_process';
import { CaptureSidecarProcess } from '@main/infrastructure/capture-sidecar/capture-sidecar-process';

function makeFakeChild() {
  const child: any = new EventEmitter();
  child.stdin = { write: vi.fn() };
  child.stdout = new EventEmitter();
  (child.stdout as any).setEncoding = vi.fn();
  child.stderr = new EventEmitter();
  (child.stderr as any).setEncoding = vi.fn();
  child.kill = vi.fn();
  return child;
}

describe('CaptureSidecarProcess', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('parses line-delimited JSON messages from stdout', () => {
    const fake = makeFakeChild();
    (spawn as any).mockReturnValue(fake);
    const proc = new CaptureSidecarProcess('/fake/bin', 1000);
    const messages: unknown[] = [];
    proc.on('message', (m) => messages.push(m));
    proc.spawn();

    fake.stdout.emit('data', '{"type":"Ready","shm_name":"/x","slots":4}\n');
    fake.stdout.emit('data', '{"type":"Status","cap');
    fake.stdout.emit('data', 'turing":true}\n');

    expect(messages).toEqual([
      { type: 'Ready', shm_name: '/x', slots: 4 },
      { type: 'Status', capturing: true },
    ]);
  });

  it('writes inbound messages with trailing newline', () => {
    const fake = makeFakeChild();
    (spawn as any).mockReturnValue(fake);
    const proc = new CaptureSidecarProcess('/fake/bin', 1000);
    proc.spawn();
    proc.send({ type: 'StartCapture', device_id: 'dev-1' });
    expect(fake.stdin.write).toHaveBeenCalledWith('{"type":"StartCapture","device_id":"dev-1"}\n');
  });

  it('schedules SIGKILL after graceful shutdown window', () => {
    vi.useFakeTimers();
    const fake = makeFakeChild();
    (spawn as any).mockReturnValue(fake);
    const proc = new CaptureSidecarProcess('/fake/bin', 1000);
    proc.spawn();
    proc.shutdown();
    expect(fake.stdin.write).toHaveBeenCalledWith('{"type":"Shutdown"}\n');
    vi.advanceTimersByTime(1001);
    expect(fake.kill).toHaveBeenCalledWith('SIGKILL');
    vi.useRealTimers();
  });

  it('emits exit event when child exits', () => {
    const fake = makeFakeChild();
    (spawn as any).mockReturnValue(fake);
    const proc = new CaptureSidecarProcess('/fake/bin', 1000);
    const exits: unknown[] = [];
    proc.on('exit', (e) => exits.push(e));
    proc.spawn();
    fake.emit('exit', 0, null);
    expect(exits).toEqual([{ code: 0, signal: null }]);
  });
});
```

- [ ] **Step 3: Run**

Run: `npx vitest run tests/unit/main/capture-sidecar/capture-sidecar-process.test.ts`
Expected: 4 passed.

- [ ] **Step 4: Commit**

```bash
git add src/main/infrastructure/capture-sidecar/capture-sidecar-process.ts tests/unit/main/capture-sidecar/
git commit -m "feat(main): add capture-sidecar child-process wrapper"
```

---

### Task 7.3: Sidecar service — state machine + supervisor

**Files:**
- Create: `src/main/infrastructure/capture-sidecar/capture-sidecar.service.ts`

- [ ] **Step 1: Create the service**

```typescript
import { BaseService } from '@shared/base/base.service.js';
import type { EventBus } from '@shared/events/event-bus.js';
import type { CaptureSidecarConfig } from './capture-sidecar.config.js';
import { CaptureSidecarProcess } from './capture-sidecar-process.js';
import type { OutboundMessage, SidecarState, SidecarErrorPayload } from './capture-sidecar.types.js';

export interface CaptureSidecarServiceDependencies {
  eventBus: EventBus;
  config: CaptureSidecarConfig;
  processFactory?: () => CaptureSidecarProcess;
  logger?: { info: (m: string, ...a: unknown[]) => void; warn: (m: string, ...a: unknown[]) => void; error: (m: string, ...a: unknown[]) => void };
}

export class CaptureSidecarService extends BaseService {
  private proc: CaptureSidecarProcess | null = null;
  private state: SidecarState = 'Disabled';
  private shmName: string | null = null;
  private slotCount = 0;
  private retryTimestamps: number[] = [];
  private retryTimer: NodeJS.Timeout | null = null;
  private pendingDeviceId: string | null = null;
  private lastError: SidecarErrorPayload | null = null;

  constructor(deps: CaptureSidecarServiceDependencies) {
    super(deps, ['eventBus', 'config'], 'CaptureSidecarService');
  }

  get currentState(): SidecarState { return this.state; }
  get shmInfo(): { name: string; slots: number } | null {
    return this.shmName ? { name: this.shmName, slots: this.slotCount } : null;
  }
  get lastErrorPayload(): SidecarErrorPayload | null { return this.lastError; }

  start(deviceId: string = ''): void {
    if (this.state !== 'Disabled' && this.state !== 'Dead') return;
    this.pendingDeviceId = deviceId;
    this.lastError = null;
    this.retryTimestamps = [];
    this.spawnOnce();
  }

  stop(): void {
    if (!this.proc) {
      this.transition('Disabled');
      return;
    }
    this.transition('Stopping');
    this.proc.shutdown();
  }

  dispose(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    this.proc?.kill();
    this.proc = null;
  }

  private spawnOnce(): void {
    const factory = (this.dependencies as CaptureSidecarServiceDependencies).processFactory
      ?? (() => new CaptureSidecarProcess(this.dependencies.config.binaryPath, this.dependencies.config.gracefulShutdownMs));

    this.transition('Starting');
    const proc = factory();
    this.proc = proc;

    proc.on('message', (msg: OutboundMessage) => this.onMessage(msg));
    proc.on('stderr', (line: string) => this.dependencies.logger?.warn?.('[sidecar stderr]', line));
    proc.on('error', (e: Error) => {
      this.recordError({ variant: 'Internal', detail: e.message });
      this.handleUnexpectedExit();
    });
    proc.on('exit', () => this.handleUnexpectedExit());
    proc.on('malformed', (line: string) => this.dependencies.logger?.warn?.('[sidecar malformed]', line));

    try { proc.spawn(); }
    catch (e) {
      this.recordError({ variant: 'Internal', detail: (e as Error).message });
      this.transition('Dead');
    }
  }

  private onMessage(msg: OutboundMessage): void {
    switch (msg.type) {
      case 'Ready':
        this.shmName = msg.shm_name;
        this.slotCount = msg.slots;
        this.transition('Idle');
        if (this.pendingDeviceId !== null) {
          this.proc?.send({ type: 'StartCapture', device_id: this.pendingDeviceId });
        }
        break;
      case 'Status':
        this.transition(msg.capturing ? 'Capturing' : (this.state === 'Stopping' ? 'Disabled' : 'Idle'));
        if (!msg.capturing && this.state === 'Disabled') {
          this.proc?.shutdown();
        }
        break;
      case 'DeviceGone':
        this.dependencies.eventBus.emit('capture:sidecar:device-gone');
        this.transition('Idle');
        break;
      case 'DeviceBack':
        this.dependencies.eventBus.emit('capture:sidecar:device-back');
        if (this.pendingDeviceId !== null) {
          this.proc?.send({ type: 'StartCapture', device_id: this.pendingDeviceId });
        }
        break;
      case 'Error':
        this.recordError(msg.error);
        if (msg.error.variant === 'PermissionDenied' || msg.error.variant === 'FormatUnsupported' || msg.error.variant === 'ShmOpenFailed') {
          this.transition('Dead');
          this.proc?.shutdown();
        }
        break;
      case 'Pong':
        break;
    }
  }

  private handleUnexpectedExit(): void {
    this.proc = null;
    if (this.state === 'Stopping' || this.state === 'Dead' || this.state === 'Disabled') {
      if (this.state !== 'Dead') this.transition('Disabled');
      return;
    }
    this.transition('Crashed');

    const now = Date.now();
    this.retryTimestamps = this.retryTimestamps.filter(t => now - t < this.dependencies.config.retryWindowMs);
    this.retryTimestamps.push(now);

    if (this.retryTimestamps.length > this.dependencies.config.maxRetriesPerWindow) {
      this.transition('Dead');
      return;
    }

    const backoffIdx = Math.min(this.retryTimestamps.length - 1, this.dependencies.config.backoffMs.length - 1);
    const delay = this.dependencies.config.backoffMs[backoffIdx];
    this.retryTimer = setTimeout(() => { this.retryTimer = null; this.spawnOnce(); }, delay);
  }

  private recordError(err: SidecarErrorPayload): void {
    this.lastError = err;
    this.dependencies.eventBus.emit('capture:sidecar:error', err);
  }

  private transition(to: SidecarState): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;
    this.dependencies.logger?.info?.(`[sidecar] ${from} → ${to}`);
    this.dependencies.eventBus.emit('capture:sidecar:state', { from, to });
  }
}
```

Note: `BaseService` constructor signature is `(dependencies, requiredDeps[], serviceName)` per `CLAUDE.md`. Adjust `EventBus` import path if the existing code uses a different one (`@shared/events/event-bus.js` is the convention; verify by looking at existing service imports).

- [ ] **Step 2: Unit test the state machine**

Create `tests/unit/main/capture-sidecar/capture-sidecar.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventEmitter } from 'node:events';
import { CaptureSidecarService } from '@main/infrastructure/capture-sidecar/capture-sidecar.service';

function makeFakeProcess() {
  const ee = new EventEmitter() as any;
  ee.spawn = vi.fn();
  ee.send = vi.fn();
  ee.shutdown = vi.fn();
  ee.kill = vi.fn();
  return ee;
}

function makeDeps(fakeProc: ReturnType<typeof makeFakeProcess>) {
  const events: Array<{ channel: string; payload: unknown }> = [];
  const eventBus = { emit: (channel: string, payload: unknown) => { events.push({ channel, payload }); } };
  const config = {
    binaryPath: '/fake',
    readyTimeoutMs: 1000,
    captureStallTimeoutMs: 500,
    maxRetriesPerWindow: 3,
    retryWindowMs: 60000,
    backoffMs: [10, 20, 40],
    gracefulShutdownMs: 500,
    shmPollHz: 240,
  };
  return {
    events,
    deps: {
      eventBus,
      config,
      processFactory: () => fakeProc,
    },
  };
}

describe('CaptureSidecarService', () => {
  beforeEach(() => { vi.useRealTimers(); });

  it('transitions Disabled → Starting → Idle on Ready, sends StartCapture', () => {
    const fake = makeFakeProcess();
    const { events, deps } = makeDeps(fake);
    const svc = new CaptureSidecarService(deps as any);
    svc.start('dev-1');
    expect(svc.currentState).toBe('Starting');
    fake.emit('message', { type: 'Ready', shm_name: '/x', slots: 4 });
    expect(svc.currentState).toBe('Idle');
    expect(fake.send).toHaveBeenCalledWith({ type: 'StartCapture', device_id: 'dev-1' });
  });

  it('transitions Idle → Capturing on Status capturing:true', () => {
    const fake = makeFakeProcess();
    const { deps } = makeDeps(fake);
    const svc = new CaptureSidecarService(deps as any);
    svc.start('d');
    fake.emit('message', { type: 'Ready', shm_name: '/x', slots: 4 });
    fake.emit('message', { type: 'Status', capturing: true });
    expect(svc.currentState).toBe('Capturing');
  });

  it('goes to Dead on PermissionDenied without retry', () => {
    const fake = makeFakeProcess();
    const { deps } = makeDeps(fake);
    const svc = new CaptureSidecarService(deps as any);
    svc.start('d');
    fake.emit('message', { type: 'Error', error: { variant: 'PermissionDenied', scope: 'camera' } });
    expect(svc.currentState).toBe('Dead');
    expect(fake.shutdown).toHaveBeenCalled();
  });

  it('retries with backoff on unexpected exit, goes Dead after budget', () => {
    vi.useFakeTimers();
    const fake = makeFakeProcess();
    const { deps } = makeDeps(fake);
    const svc = new CaptureSidecarService(deps as any);
    svc.start('d');

    for (let i = 0; i < 4; i++) {
      fake.emit('exit', { code: 1, signal: null });
      vi.advanceTimersByTime(50);
    }
    expect(svc.currentState).toBe('Dead');
  });

  it('stop from Capturing transitions through Stopping to Disabled on Status false', () => {
    const fake = makeFakeProcess();
    const { deps } = makeDeps(fake);
    const svc = new CaptureSidecarService(deps as any);
    svc.start('d');
    fake.emit('message', { type: 'Ready', shm_name: '/x', slots: 4 });
    fake.emit('message', { type: 'Status', capturing: true });
    svc.stop();
    expect(svc.currentState).toBe('Stopping');
    fake.emit('message', { type: 'Status', capturing: false });
    expect(svc.currentState).toBe('Disabled');
  });
});
```

- [ ] **Step 3: Run**

Run: `npx vitest run tests/unit/main/capture-sidecar/capture-sidecar.service.test.ts`
Expected: 5 passed.

- [ ] **Step 4: Commit**

```bash
git add src/main/infrastructure/capture-sidecar/capture-sidecar.service.ts tests/unit/main/capture-sidecar/capture-sidecar.service.test.ts
git commit -m "feat(main): add capture-sidecar state machine service"
```

---

### Task 7.4: Register service in Awilix container

**Files:**
- Modify: `src/main/application/container.ts`

- [ ] **Step 1: Add the registration**

Inspect `src/main/application/container.ts` — it registers services with Awilix using `.singleton()`/`.scoped()`. Find the registration block and add:

```typescript
import { CaptureSidecarService, getCaptureSidecarConfig } from '@main/infrastructure/capture-sidecar/index.js';

// inside the container registration section:
container.register({
  captureSidecarConfig: asFunction(() => getCaptureSidecarConfig()).singleton(),
  captureSidecarService: asClass(CaptureSidecarService).singleton(),
});
```

Exact neighboring registrations may differ — match the existing pattern in the file. The service depends on `{ eventBus, config: captureSidecarConfig, logger }`; ensure the DI proxy-injection mode resolves these by name (Awilix proxy-injection picks up dependencies by property name of the constructor's single argument object).

- [ ] **Step 2: Wire `before-quit` shutdown**

In `src/main/application/app.orchestrator.ts` (or wherever `before-quit` is handled — grep for `before-quit`): call `captureSidecarService.dispose()` during app shutdown.

Example snippet (adapt to actual location):
```typescript
app.on('before-quit', () => {
  this.dependencies.captureSidecarService.dispose();
});
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck:app`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/main/application/
git commit -m "feat(main): register capture-sidecar service in DI container"
```

---

## Phase 8 — SHM reader + frame transport to renderer

### Task 8.1: Native addon to read POSIX shm

Node does not expose `shm_open`/`mmap` from the standard library. Two options: use an existing npm package (`shared-memory` or `mmap-io`) or write a small N-API addon. The existing package `mmap-io` is maintained and has Node 20+ prebuilds — use it.

**Files:**
- Modify: `package.json` (add dependency)
- Create: `src/main/infrastructure/capture-sidecar/shm-reader.ts`

- [ ] **Step 1: Add `mmap-io` dependency**

```bash
cd /Users/josstei/Development/prismgb-workspace/prismgb-repos/prismgb-app
npm install mmap-io
```

Expected: installs, prebuild for darwin-arm64 or darwin-x64 resolved.

- [ ] **Step 2: Create `src/main/infrastructure/capture-sidecar/shm-reader.ts`**

```typescript
import { openSync, O_RDWR } from 'node:fs';
import { map, PROT_READ, MAP_SHARED } from 'mmap-io';

const CONTROL_SIZE = 32; // must match Rust RingControl: 2×u64 + 3×u32 = 32 with padding
const HEADER_SIZE = 32;  // must match Rust FrameHeader: u64+u64+u32+u32+u32+u32 = 32
const FRAME_BYTES = 160 * 144 * 3;
const SLOT_SIZE = HEADER_SIZE + FRAME_BYTES;

export interface FrameView {
  sequence: bigint;
  ptsNs: bigint;
  width: number;
  height: number;
  data: Uint8Array;
}

/**
 * Reads frames from a POSIX shm ring written by the Rust sidecar.
 * Uses mmap-io to map /dev/shm/<name> (macOS presents shm at the VFS layer).
 */
export class ShmReader {
  private buffer: Buffer | null = null;
  private lastSeq = 0n;

  open(shmName: string, slotCount: number): void {
    // POSIX shm on macOS: shm_open creates an fd; we need a fs path.
    // mmap-io takes an fd. Use /dev/shm-like path via /tmp? No — POSIX shm requires shm_open.
    // Workaround: the sidecar also writes the shm region as a regular file in /tmp
    // when running (mirror write); or we open by shm_open path.
    //
    // On macOS, POSIX shm objects are NOT exposed via filesystem paths. mmap-io cannot
    // open them directly. Options:
    //   (a) Dual-map: sidecar creates the shm, then also writes to a memfd/tmpfile mirror.
    //   (b) Use an N-API addon that calls shm_open(name, O_RDWR).
    //
    // CHOICE: use a tiny N-API addon. See §8.1 step 3 for that addon.
    throw new Error('Use ShmReaderNative (see capture-sidecar-shm addon) — mmap-io cannot open POSIX shm by name on macOS');
  }

  close(): void { this.buffer = null; this.lastSeq = 0n; }

  tryRead(): FrameView | null {
    if (!this.buffer) return null;
    const head = this.buffer.readBigUInt64LE(0);
    if (head === 0n) return null;
    const slotCount = this.buffer.readUInt32LE(16); // after 2 u64s
    const slotIdx = Number((head - 1n) % BigInt(slotCount));
    const slotOffset = CONTROL_SIZE + slotIdx * SLOT_SIZE;

    const sequence = this.buffer.readBigUInt64LE(slotOffset);
    if (sequence <= this.lastSeq) return null;
    this.lastSeq = sequence;

    const ptsNs = this.buffer.readBigUInt64LE(slotOffset + 8);
    const width = this.buffer.readUInt32LE(slotOffset + 16);
    const height = this.buffer.readUInt32LE(slotOffset + 20);

    const dataOffset = slotOffset + HEADER_SIZE;
    const data = new Uint8Array(this.buffer.buffer, this.buffer.byteOffset + dataOffset, FRAME_BYTES);

    return { sequence, ptsNs, width, height, data };
  }
}
```

The comment in `open()` reveals the platform reality: POSIX shm on macOS is not exposed at a filesystem path. We need a tiny N-API addon to call `shm_open` and `mmap`. The next steps build that addon.

- [ ] **Step 3: Create the native addon scaffolding**

Create `packages/prismgb-capture-shm/` as a new npm workspace package for the native addon:

`packages/prismgb-capture-shm/package.json`:
```json
{
  "name": "@prismgb/capture-shm",
  "version": "0.1.0",
  "private": true,
  "main": "index.js",
  "gypfile": true,
  "scripts": {
    "install": "node-gyp rebuild",
    "rebuild": "node-gyp rebuild"
  },
  "dependencies": {
    "node-addon-api": "^8.0.0"
  },
  "devDependencies": {
    "node-gyp": "^11.0.0"
  }
}
```

`packages/prismgb-capture-shm/binding.gyp`:
```python
{
  "targets": [{
    "target_name": "prismgb_capture_shm",
    "sources": ["src/addon.cc"],
    "include_dirs": ["<!(node -p \"require('node-addon-api').include_dir\")"],
    "cflags_cc!": ["-fno-exceptions"],
    "cflags_cc": ["-std=c++17"],
    "defines": ["NAPI_VERSION=8"],
    "conditions": [
      ["OS==\"mac\"", {
        "xcode_settings": {
          "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
          "CLANG_CXX_LIBRARY": "libc++",
          "MACOSX_DEPLOYMENT_TARGET": "12.0"
        }
      }]
    ]
  }]
}
```

`packages/prismgb-capture-shm/src/addon.cc`:
```cpp
#include <napi.h>
#include <sys/mman.h>
#include <sys/stat.h>
#include <fcntl.h>
#include <unistd.h>
#include <errno.h>
#include <string.h>

// Open an existing POSIX shm and mmap it read-only. Returns a Buffer aliasing the mapping.
Napi::Value Open(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsNumber()) {
    Napi::TypeError::New(env, "expected (name: string, size: number)").ThrowAsJavaScriptException();
    return env.Null();
  }
  std::string name = info[0].As<Napi::String>();
  size_t size = info[1].As<Napi::Number>().Uint32Value();

  int fd = shm_open(name.c_str(), O_RDONLY, 0);
  if (fd < 0) {
    Napi::Error::New(env, std::string("shm_open failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

  void* ptr = mmap(nullptr, size, PROT_READ, MAP_SHARED, fd, 0);
  if (ptr == MAP_FAILED) {
    close(fd);
    Napi::Error::New(env, std::string("mmap failed: ") + strerror(errno)).ThrowAsJavaScriptException();
    return env.Null();
  }

  // Wrap as an external Buffer with finalizer that munmaps and closes fd.
  struct Context { void* ptr; size_t size; int fd; };
  auto* ctx = new Context{ptr, size, fd};

  return Napi::Buffer<uint8_t>::New(
    env,
    static_cast<uint8_t*>(ptr),
    size,
    [](Napi::Env, uint8_t*, Context* c) {
      munmap(c->ptr, c->size);
      close(c->fd);
      delete c;
    },
    ctx
  );
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("open", Napi::Function::New(env, Open));
  return exports;
}

NODE_API_MODULE(prismgb_capture_shm, Init)
```

`packages/prismgb-capture-shm/index.js`:
```javascript
const addon = require('./build/Release/prismgb_capture_shm.node');
module.exports = addon;
```

- [ ] **Step 4: Install + build**

Run:
```bash
cd /Users/josstei/Development/prismgb-workspace/prismgb-repos/prismgb-app
npm install
npm install --workspace=@prismgb/capture-shm
```
Expected: `@prismgb/capture-shm` workspace builds; `packages/prismgb-capture-shm/build/Release/prismgb_capture_shm.node` exists.

- [ ] **Step 5: Add as a dependency of the main app**

In `package.json` dependencies, add:
```json
"@prismgb/capture-shm": "*",
```

Remove `mmap-io` added in Step 1 (no longer needed):
```bash
npm uninstall mmap-io
```

- [ ] **Step 6: Rewrite `shm-reader.ts` to use the addon**

```typescript
import shm from '@prismgb/capture-shm';

const CONTROL_SIZE = 32;
const HEADER_SIZE = 32;
const FRAME_BYTES = 160 * 144 * 3;
const SLOT_SIZE = HEADER_SIZE + FRAME_BYTES;

export interface FrameView {
  sequence: bigint;
  ptsNs: bigint;
  width: number;
  height: number;
  data: Uint8Array;
}

export class ShmReader {
  private buffer: Buffer | null = null;
  private slotCount = 0;
  private lastSeq = 0n;

  open(shmName: string, slotCount: number): void {
    this.slotCount = slotCount;
    const totalSize = CONTROL_SIZE + slotCount * SLOT_SIZE;
    this.buffer = shm.open(shmName, totalSize);
    this.lastSeq = 0n;
  }

  close(): void { this.buffer = null; this.lastSeq = 0n; }

  tryRead(): FrameView | null {
    if (!this.buffer) return null;
    const head = this.buffer.readBigUInt64LE(0);
    if (head === 0n) return null;
    const slotIdx = Number((head - 1n) % BigInt(this.slotCount));
    const slotOffset = CONTROL_SIZE + slotIdx * SLOT_SIZE;

    const sequence = this.buffer.readBigUInt64LE(slotOffset);
    if (sequence <= this.lastSeq) return null;
    this.lastSeq = sequence;

    const ptsNs = this.buffer.readBigUInt64LE(slotOffset + 8);
    const width = this.buffer.readUInt32LE(slotOffset + 16);
    const height = this.buffer.readUInt32LE(slotOffset + 20);

    const dataOffset = slotOffset + HEADER_SIZE;
    const data = new Uint8Array(
      this.buffer.buffer,
      this.buffer.byteOffset + dataOffset,
      FRAME_BYTES,
    );

    return { sequence, ptsNs, width, height, data };
  }
}
```

- [ ] **Step 7: Verify struct-size assumptions**

Rust `#[repr(C)]` on the structs in `src/ipc/shm.rs` may add padding. Confirm the Rust layout is:

- `RingControl`: `AtomicU64(8) + AtomicU64(8) + u32(4) + u32(4) + u32(4) + padding(4) = 32` ✓
- `FrameHeader`: `u64(8) + u64(8) + u32(4)*4 = 32` ✓ (all naturally aligned, no trailing padding)

If `cargo test` of a Rust-side size check panics (add `assert_eq!(std::mem::size_of::<RingControl>(), 32)` in `src/ipc/shm.rs` tests), adjust the padding in the TS constants.

Append to `src/ipc/shm.rs` tests:
```rust
    #[test]
    fn abi_sizes_match_ts_constants() {
        assert_eq!(std::mem::size_of::<RingControl>(), 32);
        assert_eq!(std::mem::size_of::<FrameHeader>(), 32);
    }
```

Run: `cargo test abi_sizes_match_ts_constants`
Expected: pass.

- [ ] **Step 8: Commit**

```bash
git add packages/prismgb-capture-shm/ src/main/infrastructure/capture-sidecar/shm-reader.ts packages/prismgb-capture-sidecar/src/ipc/shm.rs package.json package-lock.json
git commit -m "feat(capture-sidecar): add POSIX shm N-API reader addon"
```

---

### Task 8.2: Polling loop + MessageChannel transfer to renderer

**Files:**
- Create: `src/main/infrastructure/capture-sidecar/shm-poller.ts`
- Modify: `src/main/infrastructure/capture-sidecar/capture-sidecar.service.ts`

- [ ] **Step 1: Create `shm-poller.ts`**

```typescript
import { MessageChannelMain, MessagePortMain } from 'electron';
import { ShmReader, FrameView } from './shm-reader.js';

export class ShmPoller {
  private reader: ShmReader | null = null;
  private port: MessagePortMain | null = null;
  private timer: NodeJS.Timeout | null = null;
  private pollIntervalMs: number;

  constructor(pollHz: number) {
    this.pollIntervalMs = Math.max(1, Math.round(1000 / pollHz));
  }

  attach(shmName: string, slotCount: number): MessagePortMain {
    const { port1, port2 } = new MessageChannelMain();
    this.port = port1;

    this.reader = new ShmReader();
    this.reader.open(shmName, slotCount);

    this.timer = setInterval(() => this.poll(), this.pollIntervalMs);
    return port2;
  }

  detach(): void {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    this.reader?.close();
    this.reader = null;
    this.port?.close();
    this.port = null;
  }

  private poll(): void {
    if (!this.reader || !this.port) return;
    const frame = this.reader.tryRead();
    if (!frame) return;
    this.sendFrame(frame);
  }

  private sendFrame(frame: FrameView): void {
    if (!this.port) return;
    // Copy the mapped bytes into a transferable ArrayBuffer.
    const ab = new ArrayBuffer(frame.data.byteLength);
    new Uint8Array(ab).set(frame.data);
    this.port.postMessage(
      {
        sequence: frame.sequence.toString(),
        ptsNs: frame.ptsNs.toString(),
        width: frame.width,
        height: frame.height,
        data: ab,
      },
      [ab],
    );
  }
}
```

The copy into `ab` before `postMessage` is required because Electron's `MessagePortMain` only transfers disconnected `ArrayBuffer`s, and the mapped buffer is externally owned. The copy cost at 4 MB/s is negligible.

- [ ] **Step 2: Wire `ShmPoller` into `CaptureSidecarService`**

In `capture-sidecar.service.ts` add a `ShmPoller` instance, attach on `Ready`, detach on `Stopping`/`Dead`:

```typescript
// in the service class:
import { ShmPoller } from './shm-poller.js';

private poller: ShmPoller | null = null;
private activePort: MessagePortMain | null = null;

// In onMessage('Ready'):
this.poller = new ShmPoller(this.dependencies.config.shmPollHz);
this.activePort = this.poller.attach(msg.shm_name, msg.slots);
this.dependencies.eventBus.emit('capture:sidecar:port-ready', this.activePort);

// In handleUnexpectedExit + stop shutdown path:
this.poller?.detach();
this.poller = null;
this.activePort = null;
```

- [ ] **Step 3: Commit**

```bash
git add src/main/infrastructure/capture-sidecar/
git commit -m "feat(main): poll shm and transfer frames to renderer via MessageChannel"
```

---

## Phase 9 — IPC surface

### Task 9.1: Channels + preload API contract

**Files:**
- Modify: `src/shared/ipc/channels.json`
- Modify: `src/shared/ipc/preload-api.contract.ts`
- Create: `src/preload/apis/capture-api.ts`
- Modify: `src/preload/index.js`

- [ ] **Step 1: Add channels to `src/shared/ipc/channels.json`**

Add to the JSON object (adjacent to existing channels):
```json
"captureSidecar": {
  "start": "capture:sidecar:start",
  "stop": "capture:sidecar:stop",
  "state": "capture:sidecar:state",
  "error": "capture:sidecar:error",
  "portReady": "capture:sidecar:port-ready"
}
```

- [ ] **Step 2: Extend `src/shared/ipc/preload-api.contract.ts`**

Add:
```typescript
export interface CaptureAPI {
  start(deviceId: string): Promise<void>;
  stop(): Promise<void>;
  onStateChange(handler: (from: string, to: string) => void): () => void;
  onError(handler: (error: unknown) => void): () => void;
  /** Consumer receives a MessagePort on which frames will be posted. */
  onPortReady(handler: (port: MessagePort) => void): () => void;
}

export interface PreloadApis {
  // ... existing
  captureAPI: CaptureAPI;
}
```

- [ ] **Step 3: Create `src/preload/apis/capture-api.ts`**

```javascript
import { contextBridge, ipcRenderer } from 'electron';
import channels from '@shared/ipc/channels.json';

export function createCaptureAPI() {
  return {
    start: (deviceId) => ipcRenderer.invoke(channels.captureSidecar.start, deviceId),
    stop: () => ipcRenderer.invoke(channels.captureSidecar.stop),
    onStateChange: (handler) => {
      const listener = (_e, payload) => handler(payload.from, payload.to);
      ipcRenderer.on(channels.captureSidecar.state, listener);
      return () => ipcRenderer.off(channels.captureSidecar.state, listener);
    },
    onError: (handler) => {
      const listener = (_e, err) => handler(err);
      ipcRenderer.on(channels.captureSidecar.error, listener);
      return () => ipcRenderer.off(channels.captureSidecar.error, listener);
    },
    onPortReady: (handler) => {
      // MessagePort transferred via ipcRenderer.on 'electron' event path
      const listener = (event) => {
        const [port] = event.ports;
        if (port) handler(port);
      };
      ipcRenderer.on(channels.captureSidecar.portReady, listener);
      return () => ipcRenderer.off(channels.captureSidecar.portReady, listener);
    },
  };
}
```

- [ ] **Step 4: Wire `captureAPI` into `src/preload/index.js`**

Find the existing `contextBridge.exposeInMainWorld` block and add:
```javascript
import { createCaptureAPI } from './apis/capture-api.js';
contextBridge.exposeInMainWorld('captureAPI', createCaptureAPI());
```

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc/channels.json src/shared/ipc/preload-api.contract.ts src/preload/
git commit -m "feat(ipc): add captureSidecar IPC surface + preload API"
```

---

### Task 9.2: Main-process IPC handler

**Files:**
- Create: `src/main/ipc/handlers/capture-sidecar.handler.ts`
- Modify: `src/main/ipc/` handler registry (exact file determined by existing pattern)

- [ ] **Step 1: Create the handler**

```typescript
import { ipcMain, BrowserWindow } from 'electron';
import channels from '@shared/ipc/channels.json' with { type: 'json' };
import type { CaptureSidecarService } from '@main/infrastructure/capture-sidecar/index.js';
import type { EventBus } from '@shared/events/event-bus.js';

export interface CaptureSidecarHandlerDependencies {
  captureSidecarService: CaptureSidecarService;
  eventBus: EventBus;
  getMainWindow: () => BrowserWindow | null;
}

export function registerCaptureSidecarHandlers(deps: CaptureSidecarHandlerDependencies): void {
  ipcMain.handle(channels.captureSidecar.start, (_event, deviceId: string) => {
    deps.captureSidecarService.start(deviceId ?? '');
  });

  ipcMain.handle(channels.captureSidecar.stop, () => {
    deps.captureSidecarService.stop();
  });

  deps.eventBus.on('capture:sidecar:state', (payload) => {
    const win = deps.getMainWindow();
    win?.webContents.send(channels.captureSidecar.state, payload);
  });

  deps.eventBus.on('capture:sidecar:error', (err) => {
    const win = deps.getMainWindow();
    win?.webContents.send(channels.captureSidecar.error, err);
  });

  deps.eventBus.on('capture:sidecar:port-ready', (port: Electron.MessagePortMain) => {
    const win = deps.getMainWindow();
    if (!win) return;
    win.webContents.postMessage(channels.captureSidecar.portReady, null, [port]);
  });
}
```

- [ ] **Step 2: Register in the handler registry**

Grep for where other handlers are registered (e.g. `registerTranscodeHandlers`, `registerDeviceHandlers`). Add the same pattern:

```typescript
import { registerCaptureSidecarHandlers } from './capture-sidecar.handler.js';
// in handler registration:
registerCaptureSidecarHandlers({
  captureSidecarService: container.resolve('captureSidecarService'),
  eventBus: container.resolve('eventBus'),
  getMainWindow: () => mainWindowRef.current,
});
```

- [ ] **Step 3: Commit**

```bash
git add src/main/ipc/
git commit -m "feat(ipc): wire captureSidecar handlers to renderer"
```

---

## Phase 10 — Renderer: sidecar adapter + acquisition strategy

### Task 10.1: Sidecar-backed `MediaStream` source

**Files:**
- Create: `src/renderer/infrastructure/adapters/devices/chromatic/sidecar/sidecar-capture.adapter.ts`
- Create: `src/renderer/infrastructure/adapters/devices/chromatic/sidecar/index.ts`

- [ ] **Step 1: Create the adapter**

```typescript
import { BaseService } from '@shared/base/base.service.js';

export interface SidecarCaptureAdapterDependencies {
  captureAPI: typeof window.captureAPI;
  logger?: Console;
}

interface FrameMessage {
  sequence: string;
  ptsNs: string;
  width: number;
  height: number;
  data: ArrayBuffer;
}

/**
 * Produces a MediaStream whose video track is driven by frames from the Rust sidecar,
 * arriving on a transferred MessagePort. Uses WebCodecs MediaStreamTrackGenerator.
 */
export class SidecarCaptureAdapter extends BaseService {
  private port: MessagePort | null = null;
  private generator: MediaStreamTrackGenerator<VideoFrame> | null = null;
  private writer: WritableStreamDefaultWriter<VideoFrame> | null = null;
  private stream: MediaStream | null = null;
  private portReadyResolve: ((port: MessagePort) => void) | null = null;
  private cleanupPortListener: (() => void) | null = null;
  private cleanupStateListener: (() => void) | null = null;

  constructor(deps: SidecarCaptureAdapterDependencies) {
    super(deps, ['captureAPI'], 'SidecarCaptureAdapter');
  }

  async acquire(deviceId: string): Promise<MediaStream> {
    if (typeof MediaStreamTrackGenerator === 'undefined') {
      throw new Error('MediaStreamTrackGenerator unavailable in this Electron/Chromium version');
    }

    const api = this.dependencies.captureAPI;

    const portPromise = new Promise<MessagePort>((resolve) => {
      this.portReadyResolve = resolve;
      this.cleanupPortListener = api.onPortReady((p) => {
        this.portReadyResolve?.(p);
        this.portReadyResolve = null;
      });
    });

    this.cleanupStateListener = api.onStateChange((_from, to) => {
      if (to === 'Dead' || to === 'Disabled') {
        this.release();
      }
    });

    await api.start(deviceId);
    this.port = await portPromise;

    this.generator = new MediaStreamTrackGenerator({ kind: 'video' });
    this.writer = this.generator.writable.getWriter();
    this.stream = new MediaStream([this.generator as unknown as MediaStreamTrack]);

    this.port.onmessage = (e) => this.onFrame(e.data as FrameMessage);
    this.port.start?.();

    return this.stream;
  }

  release(): void {
    if (this.port) { this.port.onmessage = null; this.port.close(); this.port = null; }
    if (this.writer) { this.writer.close().catch(() => {}); this.writer = null; }
    if (this.generator) { this.generator = null; }
    this.stream?.getTracks().forEach(t => t.stop());
    this.stream = null;
    this.cleanupPortListener?.();
    this.cleanupStateListener?.();
    this.cleanupPortListener = null;
    this.cleanupStateListener = null;
    this.dependencies.captureAPI.stop().catch(() => {});
  }

  private onFrame(msg: FrameMessage): void {
    if (!this.writer) return;
    const frame = new VideoFrame(new Uint8Array(msg.data), {
      format: 'RGBX',
      codedWidth: msg.width,
      codedHeight: msg.height,
      timestamp: Number(BigInt(msg.ptsNs) / 1000n), // µs
      layout: [{ offset: 0, stride: msg.width * 4 }],
    });
    this.writer.write(frame).catch(() => { /* ignored */ });
    frame.close();
  }
}
```

**Note on format:** `VideoFrame` accepts `RGBA`, `RGBX`, `BGRA`, `BGRX`, `I420`, `NV12` as standard formats. It does NOT accept packed RGB24 (3 bytes/pixel). The Rust sidecar currently emits RGB24 (see `src/recon/colorspace.rs`). To fit `VideoFrame` we must either:

- **(a)** Change the sidecar to emit `RGBX` (4 bytes/pixel with a padding byte).
- **(b)** Insert a renderer-side Uint8Array → Uint8Array expansion (RGB→RGBX) per frame.

**Choose (a)** — cheaper overall, slightly larger ring slots (69,120 → 92,160 B, well within budget). Update in next task.

- [ ] **Step 2: Commit (adapter code lands first; pixel-format fix next)**

```bash
git add src/renderer/infrastructure/adapters/devices/chromatic/sidecar/
git commit -m "feat(renderer): add sidecar capture adapter (RGB→VideoFrame bridge)"
```

---

### Task 10.2: Change sidecar output to RGBX for VideoFrame compatibility

**Files:**
- Modify: `packages/prismgb-capture-sidecar/src/recon/colorspace.rs`
- Modify: `packages/prismgb-capture-sidecar/src/recon/pipeline.rs`
- Modify: `packages/prismgb-capture-sidecar/src/ipc/shm.rs`
- Modify: `src/main/infrastructure/capture-sidecar/shm-reader.ts`

- [ ] **Step 1: Add `ycbcr_to_rgbx` in `src/recon/colorspace.rs`**

Replace `convert_bt601_full` and `convert_bt709_full` contents with an RGBX writer. Or add a parallel `ycbcr_to_rgbx` function keeping 24-bit path for future use. Minimal-change approach — add:

```rust
pub fn ycbcr_to_rgbx(
    y: &[u8],
    u: &[u8],
    v: &[u8],
    rgbx_out: &mut [u8],
    matrix: ColorMatrix,
) {
    assert_eq!(y.len(), u.len());
    assert_eq!(u.len(), v.len());
    assert_eq!(rgbx_out.len(), y.len() * 4);

    let (kr_y, kr_u, kr_v, kg_u, kg_v, kb_u) = match matrix {
        ColorMatrix::Bt601Full => (1.0, 0.0, 1.402, -0.344136, -0.714136, 1.772),
        ColorMatrix::Bt709Full => (1.0, 0.0, 1.5748, -0.1873,   -0.4681,   1.8556),
    };

    for i in 0..y.len() {
        let yi = y[i] as f32;
        let ui = u[i] as f32 - 128.0;
        let vi = v[i] as f32 - 128.0;
        let r = kr_y * yi + kr_u * ui + kr_v * vi;
        let g = kr_y * yi + kg_u * ui + kg_v * vi;
        let b = kr_y * yi + kb_u * ui + 0.0   + kb_u * 0.0; // placeholder avoided — fix below
        let _ = b;
        // Correct expressions:
        let r = yi + kr_v * vi;
        let g = yi + kg_u * ui + kg_v * vi;
        let b = yi + kb_u * ui;
        rgbx_out[i * 4]     = clamp_u8(r);
        rgbx_out[i * 4 + 1] = clamp_u8(g);
        rgbx_out[i * 4 + 2] = clamp_u8(b);
        rgbx_out[i * 4 + 3] = 0xFF;
    }
}
```

Add a test:
```rust
    #[test]
    fn rgbx_output_has_four_bytes_per_pixel_with_full_alpha() {
        let y = vec![200u8; 2];
        let u = vec![128u8; 2];
        let v = vec![128u8; 2];
        let mut rgbx = vec![0u8; 8];
        ycbcr_to_rgbx(&y, &u, &v, &mut rgbx, ColorMatrix::Bt601Full);
        assert_eq!(rgbx[3], 0xFF);
        assert_eq!(rgbx[7], 0xFF);
        assert_eq!(rgbx[0], 200); assert_eq!(rgbx[1], 200); assert_eq!(rgbx[2], 200);
    }
```

- [ ] **Step 2: Update `FRAME_BYTES` and pipeline**

In `src/ipc/shm.rs`:
```rust
pub const FRAME_BYTES: usize = (FRAME_WIDTH as usize) * (FRAME_HEIGHT as usize) * 4;
pub const FRAME_FORMAT_RGBX: u32 = 1;
```

Update `FrameHeader.stride`-emitting code in `write_frame` to `FRAME_WIDTH * 4`.

In `src/recon/pipeline.rs`, replace `ycbcr_to_rgb24` with `ycbcr_to_rgbx` and change `rgb_scratch: Vec<u8>` size to `FRAME_BYTES` (now 92,160). Use `FRAME_FORMAT_RGBX` in the header write.

- [ ] **Step 3: Update TS `FRAME_BYTES` in `shm-reader.ts`**

```typescript
const FRAME_BYTES = 160 * 144 * 4;
```

- [ ] **Step 4: Run full Rust test suite**

Run: `cargo test --package prismgb-capture-sidecar`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-capture-sidecar/ src/main/infrastructure/capture-sidecar/shm-reader.ts
git commit -m "refactor(capture-sidecar): emit RGBX instead of RGB24 for VideoFrame compat"
```

---

### Task 10.3: Sidecar acquisition strategy + toggle branch

**Files:**
- Create: `src/renderer/infrastructure/streaming/acquisition/sidecar-acquisition.strategy.ts`
- Modify: `src/renderer/infrastructure/streaming/acquisition/acquisition.orchestrator.ts`
- Modify: `src/renderer/application/di/register-streaming.ts`

- [ ] **Step 1: Create `sidecar-acquisition.strategy.ts`**

```typescript
import type { AcquisitionStrategy } from './acquisition.interface.js';
import { SidecarCaptureAdapter } from '@renderer/infrastructure/adapters/devices/chromatic/sidecar/sidecar-capture.adapter.js';

export interface SidecarAcquisitionStrategyDependencies {
  sidecarAdapter: SidecarCaptureAdapter;
  getUserMediaStrategy: AcquisitionStrategy;
  isEnabled: () => boolean;
}

export class SidecarAcquisitionStrategy implements AcquisitionStrategy {
  constructor(private deps: SidecarAcquisitionStrategyDependencies) {}

  async acquire(deviceId: string): Promise<MediaStream> {
    if (!this.deps.isEnabled()) {
      return this.deps.getUserMediaStrategy.acquire(deviceId);
    }
    try {
      return await this.deps.sidecarAdapter.acquire(deviceId);
    } catch {
      return this.deps.getUserMediaStrategy.acquire(deviceId);
    }
  }

  async release(): Promise<void> {
    this.deps.sidecarAdapter.release();
    await this.deps.getUserMediaStrategy.release();
  }
}
```

(Adapt `AcquisitionStrategy` interface name to actual — grep in `acquisition.interface.ts`; if the method is `start/stop` instead of `acquire/release` use those.)

- [ ] **Step 2: Modify `acquisition.orchestrator.ts` to pick strategy by toggle**

In the existing orchestrator's `acquire()` path, branch on the sidecar toggle (read from settings service). Keep the existing behavior as default:

```typescript
// Pseudocode — adapt to actual orchestrator structure:
const strategy = this.dependencies.settings.highFidelityCaptureEnabled
  ? this.dependencies.sidecarStrategy
  : this.dependencies.getUserMediaStrategy;
return strategy.acquire(deviceId);
```

- [ ] **Step 3: Register in DI (`register-streaming.ts`)**

Add registrations for `SidecarCaptureAdapter`, `SidecarAcquisitionStrategy`. Follow existing registration patterns in the file.

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck:app`
Expected: passes.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/
git commit -m "feat(renderer): add sidecar acquisition strategy + toggle branch"
```

---

## Phase 11 — Settings UI: toggle + status chip + banner

### Task 11.1: Settings store entry for the toggle

**Files:**
- Modify: `src/renderer/infrastructure/services/settings/` (the existing settings service/store)

- [ ] **Step 1: Add toggle key to settings schema**

Grep for existing boolean settings (e.g. `cinematicMode`, `frameBlending`). Add a new key `highFidelityCaptureEnabled: boolean` with default `false` alongside them. Follow the existing persistence pattern (local-storage-backed service).

- [ ] **Step 2: Expose getter in settings service**

```typescript
get highFidelityCaptureEnabled(): boolean {
  return this.getValue('highFidelityCaptureEnabled') ?? false;
}
setHighFidelityCaptureEnabled(v: boolean): void {
  this.setValue('highFidelityCaptureEnabled', v);
  this.eventBus.emit('settings:high-fidelity-capture:changed', v);
}
```

- [ ] **Step 3: Commit**

```bash
git add src/renderer/infrastructure/services/settings/
git commit -m "feat(settings): add highFidelityCaptureEnabled toggle"
```

---

### Task 11.2: Toggle, status chip, and error banner components

**Files:**
- Create: `src/renderer/presentation/features/settings/high-fidelity-capture/high-fidelity-capture-toggle.component.ts`
- Create: `src/renderer/presentation/features/settings/high-fidelity-capture/high-fidelity-capture-status.component.ts`
- Create: `src/renderer/presentation/features/settings/high-fidelity-capture/high-fidelity-capture-banner.component.ts`
- Create: `src/renderer/presentation/features/settings/high-fidelity-capture/index.ts`
- Modify: settings feature's template/component registry (exact location from `docs/feature-map.md`)

- [ ] **Step 1: Toggle component**

```typescript
export interface HighFidelityCaptureToggleDependencies {
  settingsService: { highFidelityCaptureEnabled: boolean; setHighFidelityCaptureEnabled: (v: boolean) => void };
  platformService: { platform: NodeJS.Platform };
}

export class HighFidelityCaptureToggleComponent {
  constructor(private deps: HighFidelityCaptureToggleDependencies) {}

  render(root: HTMLElement): void {
    const isSupported = this.deps.platformService.platform === 'darwin';
    root.innerHTML = `
      <label class="setting-toggle">
        <input type="checkbox" ${this.deps.settingsService.highFidelityCaptureEnabled ? 'checked' : ''} ${!isSupported ? 'disabled' : ''}>
        <span>High-fidelity capture <em>(experimental)</em></span>
        ${!isSupported ? '<small>Not yet available on this platform.</small>' : ''}
      </label>
    `;
    const input = root.querySelector('input')!;
    input.addEventListener('change', () => {
      this.deps.settingsService.setHighFidelityCaptureEnabled(input.checked);
    });
  }
}
```

(Adjust to match the project's actual component pattern — inspect `docs/feature-map.md` and one existing settings component for structure.)

- [ ] **Step 2: Status chip component**

```typescript
import type { SidecarState } from '@main/infrastructure/capture-sidecar/index.js';

const CHIP_LABELS: Record<SidecarState, string> = {
  Disabled: 'Off',
  Starting: 'Starting',
  Idle: 'Offline',
  Capturing: 'Active',
  Stopping: 'Off',
  Crashed: 'Starting',
  Dead: 'Failed',
};

export class HighFidelityCaptureStatusComponent {
  private unsubscribe: (() => void) | null = null;
  private currentState: SidecarState = 'Disabled';
  private root: HTMLElement | null = null;

  render(root: HTMLElement): void {
    this.root = root;
    this.paint();
    this.unsubscribe = window.captureAPI.onStateChange((_from, to) => {
      this.currentState = to as SidecarState;
      this.paint();
    });
  }

  dispose(): void { this.unsubscribe?.(); }

  private paint(): void {
    if (!this.root) return;
    const label = CHIP_LABELS[this.currentState] ?? 'Off';
    this.root.innerHTML = `<span class="status-chip status-${this.currentState.toLowerCase()}">${label}</span>`;
  }
}
```

- [ ] **Step 3: Error banner component**

```typescript
import type { SidecarErrorPayload } from '@main/infrastructure/capture-sidecar/capture-sidecar.types.js';

export class HighFidelityCaptureBannerComponent {
  private root: HTMLElement | null = null;
  private cleanupError: (() => void) | null = null;
  private cleanupState: (() => void) | null = null;
  private lastError: SidecarErrorPayload | null = null;
  private visible = false;

  render(root: HTMLElement): void {
    this.root = root;
    this.cleanupError = window.captureAPI.onError((e) => { this.lastError = e as SidecarErrorPayload; });
    this.cleanupState = window.captureAPI.onStateChange((_, to) => {
      this.visible = to === 'Dead';
      this.paint();
    });
    this.paint();
  }

  dispose(): void { this.cleanupError?.(); this.cleanupState?.(); }

  private paint(): void {
    if (!this.root) return;
    if (!this.visible) { this.root.innerHTML = ''; return; }
    const scope = this.lastError?.scope;
    const isPermission = this.lastError?.variant === 'PermissionDenied';
    this.root.innerHTML = `
      <div class="banner banner-error">
        <p>High-fidelity capture couldn't start, reverted to standard capture.</p>
        <button data-action="retry">Try again</button>
        ${isPermission ? `<a href="#" data-action="open-settings">Open macOS Privacy settings</a>` : ''}
        <button data-action="details">Details</button>
      </div>
    `;
    this.root.querySelector('[data-action="retry"]')?.addEventListener('click', () => {
      window.captureAPI.start('');
    });
    this.root.querySelector('[data-action="open-settings"]')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.shellAPI?.openExternal('x-apple.systempreferences:com.apple.preference.security?Privacy_Camera');
    });
    this.root.querySelector('[data-action="details"]')?.addEventListener('click', () => {
      alert(JSON.stringify(this.lastError, null, 2));
    });
  }
}
```

- [ ] **Step 4: Register in settings feature registry**

Follow the feature-map.md pattern — add the three components to the settings feature's template + component registration.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck:app`
Expected: passes.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/presentation/features/settings/high-fidelity-capture/
git commit -m "feat(settings-ui): add high-fidelity capture toggle, status chip, banner"
```

---

## Phase 12 — Packaging: extraResources + codesign

### Task 12.1: Include sidecar in macOS bundle

**Files:**
- Modify: `package.json` (`build` block)
- Modify: `assets/entitlements.mac.plist`
- Modify: `scripts/afterPack.js`

- [ ] **Step 1: Add `extraResources` to `build.mac`**

Edit `package.json`, within the `build.mac` object:
```json
"mac": {
  "category": "public.app-category.utilities",
  ...
  "extraResources": [
    {
      "from": "dist/sidecar/",
      "to": "sidecar/",
      "filter": ["**/*"]
    }
  ]
}
```

- [ ] **Step 2: Add USB + camera entitlements to `assets/entitlements.mac.plist`**

Read the existing file first to preserve format. Add:
```xml
<key>com.apple.security.device.camera</key>
<true/>
<key>com.apple.security.device.usb</key>
<true/>
```

Also verify the Hardened Runtime entitlements are not overly restrictive (don't add `disable-library-validation` unless absolutely required).

- [ ] **Step 3: Codesign sidecar in `afterPack.js`**

Read the existing `scripts/afterPack.js` and extend it to codesign `Contents/Resources/sidecar/prismgb-capture-sidecar`:

```javascript
// Add to afterPack.js (append, preserving existing logic)
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

export default async function afterPack(context) {
  // ... existing afterPack logic ...

  if (context.electronPlatformName !== 'darwin') return;

  const appPath = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const sidecarPath = path.join(appPath, 'Contents', 'Resources', 'sidecar', 'prismgb-capture-sidecar');
  if (!existsSync(sidecarPath)) {
    console.warn('[afterPack] sidecar not found at', sidecarPath);
    return;
  }

  const identity = process.env.CSC_NAME || context.packager.config.mac?.identity;
  if (!identity) {
    console.warn('[afterPack] no signing identity, skipping sidecar codesign');
    return;
  }

  const entitlements = path.resolve('assets/entitlements.mac.plist');
  execSync(
    `codesign --force --options runtime --timestamp --entitlements "${entitlements}" --sign "${identity}" "${sidecarPath}"`,
    { stdio: 'inherit' },
  );
  console.log('[afterPack] signed sidecar binary');
}
```

Match export style (CommonMark vs ESM) to the existing file.

- [ ] **Step 4: Test packaging locally**

Run: `CSC_NAME="Developer ID Application: ..." npm run build:mac`
Expected: `.dmg` in `release/` containing `Contents/Resources/sidecar/prismgb-capture-sidecar`, and the binary is signed (`codesign -dv <path>` reports a signed identity).

- [ ] **Step 5: Commit**

```bash
git add package.json assets/entitlements.mac.plist scripts/afterPack.js
git commit -m "build(capture-sidecar): bundle + codesign sidecar in macOS app"
```

---

## Phase 13 — E2E Playwright tests

### Task 13.1: Toggle on/off flow

**Files:**
- Create: `tests/e2e/capture-sidecar.spec.ts`

- [ ] **Step 1: Create the test**

```typescript
import { test, expect, _electron as electron } from '@playwright/test';
import path from 'node:path';

test('high-fidelity capture toggle transitions to Active when Chromatic is attached', async () => {
  test.skip(process.platform !== 'darwin', 'sidecar is macOS-only in v1');

  const app = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
    env: { ...process.env, PRISMGB_FAKE_BACKEND: '1' }, // forces fake backend in sidecar
  });
  const window = await app.firstWindow();

  await window.click('[data-testid="settings-tab"]');
  const toggle = window.locator('input[data-testid="high-fidelity-capture-toggle"]');
  await toggle.check();

  const chip = window.locator('[data-testid="high-fidelity-capture-status-chip"]');
  await expect(chip).toHaveText(/Active|Starting/, { timeout: 3000 });
  await expect(chip).toHaveText('Active', { timeout: 5000 });

  await toggle.uncheck();
  await expect(chip).toHaveText('Off', { timeout: 3000 });

  await app.close();
});
```

The `data-testid` attributes must be added to the components in Phase 11 — do that as part of this step (small touch-up to `high-fidelity-capture-toggle.component.ts` and `high-fidelity-capture-status.component.ts`).

- [ ] **Step 2: Run**

Run: `npm run test:e2e -- capture-sidecar`
Expected: passes on macOS with the fake-backend env var set.

- [ ] **Step 3: Commit**

```bash
git add tests/e2e/capture-sidecar.spec.ts src/renderer/presentation/features/settings/high-fidelity-capture/
git commit -m "test(e2e): high-fidelity capture toggle flow"
```

---

### Task 13.2: Permission-denied banner path

**Files:**
- Modify: `tests/e2e/capture-sidecar.spec.ts`

- [ ] **Step 1: Add permission-denied test**

```typescript
test('permission denied surfaces banner with settings deeplink', async () => {
  test.skip(process.platform !== 'darwin', 'sidecar is macOS-only in v1');

  const app = await electron.launch({
    args: [path.join(__dirname, '../../dist/main/index.js')],
    env: { ...process.env, PRISMGB_SIDECAR_FORCE_ERROR: 'PermissionDenied' },
  });
  const window = await app.firstWindow();

  await window.click('[data-testid="settings-tab"]');
  await window.locator('input[data-testid="high-fidelity-capture-toggle"]').check();

  const banner = window.locator('[data-testid="high-fidelity-capture-banner"]');
  await expect(banner).toBeVisible({ timeout: 5000 });
  await expect(banner).toContainText('reverted to standard capture');
  await expect(banner.locator('[data-action="open-settings"]')).toBeVisible();

  await app.close();
});
```

- [ ] **Step 2: Support `PRISMGB_SIDECAR_FORCE_ERROR` in the Rust binary**

Modify `src/main.rs` after the `Ready` emit:
```rust
if let Ok(which) = std::env::var("PRISMGB_SIDECAR_FORCE_ERROR") {
    let error = match which.as_str() {
        "PermissionDenied" => SidecarError::PermissionDenied { scope: "camera".into() },
        "DeviceNotFound" => SidecarError::DeviceNotFound,
        _ => SidecarError::Internal { detail: "forced".into() },
    };
    control::send_stdout(&OutboundMessage::Error { error });
    return;
}
```

- [ ] **Step 3: Run**

Run: `npm run test:e2e -- capture-sidecar`
Expected: both tests pass.

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/capture-sidecar.spec.ts packages/prismgb-capture-sidecar/src/main.rs
git commit -m "test(e2e): permission-denied banner + force-error env hook"
```

---

## Phase 14 — CI integration

### Task 14.1: Sidecar job in GitHub Actions

**Files:**
- Modify: `.github/workflows/pr-validation.yml` (or equivalent — grep `.github/workflows/` for existing PR workflow)

- [ ] **Step 1: Add a sidecar job**

Within the PR-validation workflow, add:

```yaml
  sidecar:
    runs-on: macos-14
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable
        with:
          components: clippy, rustfmt
          targets: aarch64-apple-darwin,x86_64-apple-darwin
      - uses: Swatinem/rust-cache@v2
        with:
          workspaces: packages/prismgb-capture-sidecar
      - name: cargo fmt
        run: cargo fmt --check
        working-directory: packages/prismgb-capture-sidecar
      - name: cargo clippy
        run: cargo clippy --all-targets -- -D warnings
        working-directory: packages/prismgb-capture-sidecar
      - name: cargo test
        run: cargo test --all-features
        working-directory: packages/prismgb-capture-sidecar
      - name: cargo build (universal)
        run: node scripts/build-sidecar.js
        env:
          SIDECAR_MODE: release
      - uses: actions/upload-artifact@v4
        with:
          name: sidecar-macos-universal
          path: dist/sidecar/prismgb-capture-sidecar
```

If the existing workflow uses reusable workflows or composite actions per `docs/ci-cd-workflows.md`, wrap the above into a reusable workflow for consistency.

- [ ] **Step 2: Consume artifact in Vitest integration test job**

Add `needs: sidecar` to any job that runs integration tests requiring the binary, and download with `actions/download-artifact@v4` before running `npm run test:run`.

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/
git commit -m "ci(capture-sidecar): add sidecar build + test job"
```

---

## Phase 15 — Calibration: empirical matrix verification

### Task 15.1: Matrix calibration routine

**Files:**
- Create: `packages/prismgb-capture-sidecar/src/bin/calibrate.rs`
- Modify: `packages/prismgb-capture-sidecar/Cargo.toml`

- [ ] **Step 1: Add a second binary target to `Cargo.toml`**

```toml
[[bin]]
name = "prismgb-capture-calibrate"
path = "src/bin/calibrate.rs"
```

- [ ] **Step 2: Create `src/bin/calibrate.rs`**

```rust
//! Calibrate YCbCr→RGB matrix empirically.
//!
//! Usage: with Chromatic + FPGA test pattern (vid_tpg.v) running and displaying known RGB:
//!   prismgb-capture-calibrate --duration-s 10 --known-rgb "255,0,0;0,255,0;0,0,255"
//!
//! Samples captured YUY2, solves Y = aR + bG + cB via least squares, prints the matched matrix.

use prismgb_capture_sidecar::capture::fake::FakeBackend;
use prismgb_capture_sidecar::capture::backend::CaptureBackend;
use prismgb_capture_sidecar::recon::chroma::unpack_yuy2_bilinear;

fn main() {
    eprintln!("calibrate: expects Chromatic running known-RGB test pattern");
    eprintln!("captures 10 seconds of YUY2, solves for luma coefficients");
    eprintln!("(placeholder: full implementation requires real-device wiring — see §15 of plan)");
    // Skeleton: drive real backend, collect (Y, R, G, B) tuples, least-squares fit.
}
```

This task is a scaffold — the full implementation requires real-device loopback and is explicitly **deferred to hardware-bring-up phase** per spec §10. Ship the skeleton + a README note; actual numeric calibration runs manually once before release.

- [ ] **Step 3: Expose internal modules for binary use**

In `packages/prismgb-capture-sidecar/src/lib.rs` (new file):
```rust
pub mod capture;
pub mod error;
pub mod ipc;
pub mod pipeline;
pub mod recon;
```

And update `Cargo.toml`:
```toml
[lib]
name = "prismgb_capture_sidecar"
path = "src/lib.rs"
```

Keep `src/main.rs` as-is but change its `mod capture;` etc. to `use prismgb_capture_sidecar::*;`.

- [ ] **Step 4: Build + run (skeleton only)**

Run: `cargo build --bin prismgb-capture-calibrate`
Expected: compiles; `./target/debug/prismgb-capture-calibrate` prints the stub usage message.

- [ ] **Step 5: Commit**

```bash
git add packages/prismgb-capture-sidecar/
git commit -m "feat(capture-sidecar): scaffold calibration binary (full impl deferred to bring-up)"
```

---

## Plan self-review

Completed during drafting — findings:

**Spec coverage.** Each numbered design section in `docs/plans/2026-04-19-rust-capture-sidecar-design.md` has corresponding tasks above:
- §3 Architecture → Phase 0 + all subsequent phases
- §4.1 Rust modules → Phases 1–6
- §4.2 Main-process files → Phases 7–8
- §4.3 Renderer files → Phases 10–11
- §4.4 Shared / IPC → Phase 9
- §5 Data flow → covered by Phase 5 (end-to-end), Phase 8 (shm poll), Phase 10 (port→VideoFrame)
- §6 Lifecycle / errors → Phase 7.3 (state machine + retries)
- §7 Testing → Phase 5 integration test, Phase 7 unit tests, Phase 13 E2E
- §8 Build/distribution → Phase 12
- §9 CI → Phase 14
- §10 Calibration → Phase 15
- §9 non-goals → respected (Linux/Windows backends stubbed at Task 4.1; no audio in sidecar; no independent auto-update)

**Placeholder scan.** No "TBD" / "TODO" tokens. Task 15 explicitly scaffolds rather than implements the calibration binary; this is flagged and matches spec §10 ("resolve during implementation, not blocking design approval").

**Type consistency.** `SidecarState` values (`Disabled`/`Starting`/`Idle`/`Capturing`/`Stopping`/`Crashed`/`Dead`) used consistently across Rust (implicit, via control messages) and TS (`capture-sidecar.types.ts`, service, status component). `OutboundMessage` variants match between Rust `src/ipc/control.rs` and TS `capture-sidecar.types.ts`. `FRAME_BYTES` changed from RGB24 (69,120) to RGBX (92,160) at Task 10.2 and updated in both Rust and TS at the same task.

**Known adaptation points an executor must adjust from existing-codebase inspection:**
- Task 7.4 DI registration: exact Awilix API (`asClass`/`asFunction`/`.singleton()`) matches existing `container.ts` but function names may vary.
- Task 9.2 handler registry: add to whichever registry file exists at `src/main/ipc/`.
- Task 10.3 `AcquisitionStrategy` interface method names — verify against `acquisition.interface.ts`.
- Task 11.1 / 11.2 settings service and component registry patterns — adapt to the specific mechanisms in `docs/feature-map.md`.
- Task 12.1 `scripts/afterPack.js` export style (ESM vs CJS) — match existing.
- Task 14.1 workflow file name — grep `.github/workflows/`.
- Task 6.1 / 6.2 `objc2-av-foundation` API surface — the plan encodes the **contract** (YUY2 pixel format, sample-buffer delegate, session lifetime); actual method signatures may require tiny adaptation to the crate version pinned in Cargo.toml.

---

Plan complete and saved to `docs/plans/2026-04-19-rust-capture-sidecar-implementation.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration with two-stage review.

2. **Inline Execution** — I execute tasks in this session using executing-plans with batch checkpoints for review.

Which approach?
