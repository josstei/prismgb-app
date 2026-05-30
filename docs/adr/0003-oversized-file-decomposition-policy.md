# ADR-0003: Oversized-file decomposition policy

**Status:** Accepted

## Context

The 2026-05-29 reduction work (finding #12) flagged seven files over ~450 LOC and split them.
Review found the splits were mostly **cosmetic**: extractions of 8–43 lines that left 5 of 7 files
still over 450, and one task (`device.service.ts`, "move USB monitoring out") that was a net-zero
no-op — the file is byte-identical and the USB methods never moved. The execution summary nonetheless
claimed it "slimmed down all files exceeding the 450 LOC limit," which is false, and there is no 450
"limit" in this project to begin with.

The source analysis was explicit that this is the wrong success metric: *"LOC is a proxy, not a
verdict. The oversized-file list flags candidates for review, not mandatory splits,"* and *"large
isn't automatically wrong (GPU/audio pipelines are inherently complex)."*

A cosmetic split is strictly worse than no split: it adds an indirection layer (a 50-line helper) while
leaving the file's responsibilities entangled, so it raises navigation cost without improving
separation — and it lets a line count masquerade as a design improvement.

## Decision

We will treat file size as a **review trigger, not a mandate**, governed by these rules:

1. **No file is split solely to cross a line count.** A high LOC count prompts the question "does this
   file hold more than one responsibility?" — nothing more.

2. **Split only at a genuine mixed-responsibility seam** — two concerns that change for different
   reasons — and only **behind an explicit interface or an injected collaborator**, never an inline
   helper that leaves the responsibilities entangled. The extracted unit must stand on its own with its
   own tests.

3. **Inherently-cohesive pipeline files may remain large.** Their size reflects domain complexity, not
   poor separation. They are accepted, not flagged.

4. **Cosmetic splits are forbidden, and size reductions must be reported honestly.** "Extracted a helper
   to lower a number" is not a refactor and must never be described as one.

### Per-file disposition (finding #12)

| File | LOC (after) | Disposition |
| --- | ---: | --- |
| `listbox-dropdown.class.ts` | 310 | **Decomposed (done).** Genuinely held two classes; `ComboboxListboxController` split out. |
| `device.service.ts` (main) | 483 | **Decompose (this ADR).** Real seam: USB-monitoring *orchestration* vs device-status/matching. See below. |
| `gpu-renderer.service.ts` | 655 | **Accepted as cohesive.** Hot-path GPU pipeline; the setup/capability extraction already done is sufficient. Size is domain complexity. |
| `render-pipeline.service.ts` | 521 | **Accepted as cohesive.** Central pipeline coordinator; event handlers already extracted. |
| `audio-pipeline.service.ts` | 504 | **Accepted as cohesive.** Pure gain math already extracted to tested utils. |
| `notes-panel.component.ts` | 470 | **Accepted.** Sub-components already separate; wiring already extracted. |
| `streaming.service.ts` | 439 | **Accepted.** Track-monitoring already extracted; under threshold. |

### `device.service.ts` — the one genuine decomposition

`device.service.ts` mixes (a) **USB-monitoring orchestration** (`startUSBMonitoring`,
`stopUSBMonitoring`, the initial-scan timeout, listener-lifecycle, monitoring failure events) and
(b) **device status/matching** (`matchDevice`, `refreshDeviceStatus`, `onDeviceConnected/Disconnected`,
`getStatus`). These change for different reasons and are a real seam.

The original plan said to "fold the USB methods into `usb-device-monitor.ts`." **We reject that**:
`usb-device-monitor.ts` is the low-level *hardware adapter* over the native `usb` library; the
orchestration depends on `eventBus` and profile matching, so folding it into the adapter would invert
the dependency (a layer/responsibility violation). Instead we extract a dedicated
**`UsbMonitoringController`** collaborator that *uses* the hardware adapter and calls back into a small
`DeviceConnectionHandler` interface that `DeviceService` implements. `DeviceService` delegates
`startUSBMonitoring`/`stopUSBMonitoring` to it.

Because the USB-monitoring behavior was **untested**, characterization tests are written **first**
(guarding the extraction and paying down main-process coverage debt), then the extraction is performed
behind those tests.

## Consequences

- **Honest closure of #12:** one real decomposition (`device.service`), six files consciously accepted
  as cohesive — not six cosmetic splits papering over a line count.
- **Forward rule:** a future "this file is too long" change must demonstrate a real mixed-responsibility
  seam and extract behind a contract, or be rejected. Reviewers reject cosmetic splits.
- **New collaborator:** `UsbMonitoringController` with a `DeviceConnectionHandler` interface; covered by
  new characterization tests.

## Alternatives considered

- **Force every file under 450.** Rejected — contradicts the analysis ("LOC is not a verdict") and would
  fragment cohesive pipelines into artificial pieces, raising navigation cost.
- **Fold USB orchestration into `usb-device-monitor.ts`** (the original plan's wording). Rejected —
  inverts the dependency by pushing `eventBus`/profile-matching concerns into the hardware adapter.
- **Accept `device.service` as-is too.** Rejected — unlike the pipelines, it holds two genuinely distinct
  responsibilities with a clean seam, so it meets the bar for decomposition.
