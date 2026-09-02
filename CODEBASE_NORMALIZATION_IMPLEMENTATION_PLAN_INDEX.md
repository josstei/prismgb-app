# Codebase Normalization Implementation Plan Index

## Outcome

The normalization/reduction program is decomposed into eight macro-phase implementation plans. Every plan has:

- a closed file-ownership manifest;
- explicit checkpoint dependencies and rollback boundaries;
- validation commands and evidence requirements;
- an adversarial P0/P1 audit record;
- a clean Maestro `validate_plan` result with zero structural violations.

This index is the execution entrypoint. The governing analysis remains [`CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md`](CODEBASE_NORMALIZATION_AND_REDUCTION_ANALYSIS.md), SHA-256 `0c6a4ccbe48b9b12e4c58bd153ae6f5c04bed82fb489c5a2402d21934b4c8fba`.

### Forward-correction precedence

The analysis is frozen as the provenance input that was audited before the later executable-provider inspection. Two historical recommendations are superseded:

- Analysis Section 9.1's recommendation to keep `ffmpeg-static` does not authorize retaining the observed executable. Phase 1.11 and Phase 7 are authoritative: retain means only an exact, all-target, approved replacement whose provider/license/provenance and runtime evidence pass.
- Analysis Phase 7's “optional” label means its product-dependent *reduction branch* may be declined. The checksum-bound decision and release disposition are mandatory. If Phase 1 produces a provider-rejected handoff, release requires either remediating and rerunning Phase 1 to an all-approved provider before selecting retain, or Phase 7 selecting and proving WebM-only or signed on-demand. Unresolved/native-design-required remains release-blocking.

This forward correction deliberately does not rewrite the analysis and invalidate its hash-bound plan chain.

## Validated plan chain

| Macro phase | Scope | Subphases / batches / max concurrency | Plan SHA-256 | Plan |
| --- | --- | --- | --- | --- |
| 0 | Reproducible baselines, acceptance tooling, immutable evidence, product decision contract | 8 / 7 / 2 | `0e4a76b781fa6384c73aea8d11ff257f2b127d46a2446f19873108fff3f008c3` | [Phase 0](docs/maestro/plans/2026-07-09-codebase-normalization-phase-0-baselines-impl-plan.md) |
| 1 | Lifecycle truth, dead surfaces, assets, packaging, native-provider policy | 12 / 10 / 2 | `2056400a507dc4d2af66dc463aa15a695f51970d52e3e743a3760c8b9c45f4fd` | [Phase 1](docs/maestro/plans/2026-07-10-codebase-normalization-phase-1-lifecycle-dead-surfaces-packaging-impl-plan.md) |
| 2 | Typed main/renderer composition roots and DI removal | 8 / 6 / 2 | `1e4e2a8882ed75bef8c7f10dbe9c64732a4f3e4934590d4419aab1e813f1ac6a` | [Phase 2](docs/maestro/plans/2026-07-10-codebase-normalization-phase-2-composition-roots-impl-plan.md) |
| 3 | Canonical schema/contracts, strict boundary inputs, typed test support | 10 / 8 / 3 | `3225870d09dd17f0bdb6e346a68e41f725fd84303848023c9221da01f43a202d` | [Phase 3](docs/maestro/plans/2026-07-10-codebase-normalization-phase-3-contracts-strict-tests-impl-plan.md) |
| 4 | Vertical renderer feature state and relay deletion | 7 / 7 / 1 | `e4ddf61af2d7f7149cd13c6ba2300438c655cdb1f86618e7bbd95186c3a019e4` | [Phase 4](docs/maestro/plans/2026-07-10-codebase-normalization-phase-4-vertical-feature-state-impl-plan.md) |
| 5 | GPU ownership, canvas/controller cutover, evidence-gated hot-path caching | 7 / 7 / 1 | `5b8835b6388faa4ede658264135163910788fbe2084950d06bb4af411267fd2f` | [Phase 5](docs/maestro/plans/2026-07-10-codebase-normalization-phase-5-gpu-ownership-hot-path-impl-plan.md) |
| 6 | UI descriptors/visibility/CSS plus production-backed test infrastructure and generated aliases | 7 / 7 / 1 | `1484544f64d45ebadce037f9c033e556842c51fc39bf46099f1b074437889d19` | [Phase 6](docs/maestro/plans/2026-07-10-codebase-normalization-phase-6-ui-test-infrastructure-impl-plan.md) |
| 7 | Product-dependent device model and media runtime reductions | 8 / 7 / 2 | `4a3d52d23bc034a7e48dfc81648b68696dab0434fa5f87e4cb0010e2d46001b8` | [Phase 7](docs/maestro/plans/2026-07-10-codebase-normalization-phase-7-product-dependent-reductions-impl-plan.md) |

Each plan's front matter binds the exact predecessor hash above. A predecessor edit invalidates every downstream hash and requires a new cascade before execution.

## Execution order and release states

Execute Phases 0 through 7 in order, checkpointing after each subphase and running that subphase's focused gate before continuing.

Phase 1 has three accepted implementation handoffs:

1. `complete` — common work and every required provider/package gate pass.
2. `complete-with-transcode-slice-blocked` — Phase 0's FFprobe/progress decision remains unresolved; the exact slice is unchanged and named.
3. `complete-with-media-provider-release-blocked` — common source/behavior/lifecycle work passes, but required FFmpeg or decision-retained FFprobe rows are target-complete and rejected. No production package, checksum, upload, or smoke success exists.

The third state allows Phases 2–6 to perform non-packaging architectural work. It never authorizes a release. Phase 7 must resolve it through an all-approved retained provider, complete WebM-only deletion, or an approved signed on-demand replacement.

## Product decisions required by Phase 7

The two axes are independent and checksum-bound.

### Device axis

- `approved-multi-device / typed-definitions`
- `approved-chromatic-only / chromatic-profile`
- `unresolved / no-source-change`

Both approved branches preserve multiple physical cameras, hotplug/reconnect, stored physical `MediaDeviceInfo.deviceId` values, group-paired audio, and acquisition fallback. The Chromatic-only choice removes generic *model* extensibility, not physical-device enumeration.

### Media axis

- `retain-phase1-approved / bundled-target-native`
- `approved-webm-only / no-media-runtime`
- `approved-signed-on-demand / signed-cache-provider`
- `native-provider-design-required / no-source-change`
- `unresolved / no-source-change`

“Retain” is valid only for the exact all-approved Phase 1 FFmpeg and decision-retained FFprobe identities. The currently observed local macOS-arm64 artifact is not an allowed retained provider. Native-provider-design-required and unresolved authorize zero media changes and remain release-blocking.

## Verified critical controls

- Renderer input cannot supply FFmpeg argv, URLs, executable paths, output paths, or unknown fields.
- Main derives the only normal/interrupted input modes, constrains local protocols, enforces a decision-bound byte ceiling, and writes one validated no-clobber Downloads child.
- A provider failure cannot delete the last recoverable recording; the original WebM is saved exactly once when requested output cannot complete.
- Provider policy binds target, digest, byte count, runtime output, source/build correspondence, license/notice disposition, review identity, and final packaged/cached execution.
- Five-target evidence covers `linux-x64`, `linux-arm64`, `macos-x64`, `macos-arm64`, and `windows-x64`.
- Retained/on-demand evidence executes every configured format in normal and interrupted modes and checks container/streams, playback, no-clobber, cancellation, and partial-output cleanup.
- Device fixture metadata and every `DeviceFixture*` type leave production; test values are test-owned.
- Generated aliases are changed by one sequential authority only, and evidence is captured after the alias/source identity is stable.
- Reduction claims compare exact immutable scopes and final target artifacts; installed package trees and raw binaries are not installer savings.

## Audit and validation record

- The root analysis was independently audited for architecture, duplication, lifecycle, performance, packaging, and test-infrastructure accuracy.
- Each macro plan received grounding audits and a final P0/P1-only adversarial pass.
- Corrected blockers received focused rechecks only; no broad refinement loop remained.
- Phase 7's final focused audits were clean for device ownership, media/provider security, independent-axis execution, buildable test/strict cutovers, alias ordering, documentation closure, and ownership arithmetic.
- Maestro validated every current macro plan with zero violations. Phase 7 validates as eight subphases, seven batches, maximum concurrency two, with 157 path assignments and 139 unique paths; its largest subphase owns 49 paths.

## Workspace note

`docs/maestro/` is ignored by the current repository configuration, so these plans exist as local workspace artifacts and do not appear in ordinary `git status`. This root index and the governing root analysis are visible at the application root. Committing the plan set later requires an explicit repository decision about the ignored Maestro directory; this analysis/planning task does not change that policy.

No production implementation was performed while authoring these plans.
