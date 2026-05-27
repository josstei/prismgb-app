# Codebase Size Reduction Status

Date: 2026-05-27

This status reflects the current workspace. The overall program is not complete: production source cleanup is still active, and test cleanup remains intentionally deferred until the source architecture work is accepted.

## Accomplished

- Wrote the primary findings and execution plan:
  - `CODEBASE_SIZE_REDUCTION_FINDINGS.md` captures the long-term reduction findings.
  - `CODEBASE_SIZE_REDUCTION_IMPLEMENTATION_PLAN.md` structures the work into phased implementation paths and records audited source slices.

- Established the enforcement spine:
  - Source size reporting and thresholds.
  - Architecture scorecard and layer-boundary checks.
  - Phase 1 drift report for IPC, events, templates, devices, settings, docs, aliases, and platforms.
  - Strict app typecheck with zero current strict diagnostics.
  - Runtime source JS cutover enforcement.

- Completed major source modernization:
  - Reached zero `src/**/*.js` files and set app typechecking to `allowJs: false`.
  - Retired the stale IPC channel JSON in favor of manifest-derived `IPC_CHANNELS`.
  - Moved renderer event channels and event payload aliases toward manifest-derived ownership.
  - Kept `@prismgb/gpu` as the renderer backend owner and removed renderer shader duplication.
  - Migrated presentation and service cleanup toward `DisposableBag`, `BaseOrchestrator`, and `PresentationComponent`.

- Advanced IPC, preload, and bridge ownership:
  - Preload invoke and subscription method descriptors are marker-generated from the IPC manifest.
  - Preload bootstrap factory coverage is closed against the generated `PreloadApiName` union.
  - Subscription payload-validator names/labels and custom invoke validation/fallback metadata live in the IPC manifest.
  - Default generated preload invoke methods now apply manifest argument validators before IPC dispatch.
  - Renderer preload bridge descriptors derive API names, method lists, lifecycle owner metadata, and forwarded EventBus channel mappings from `ipc.manifest.json`.
  - `DeviceIpcAdapter` forwards manifest-backed device connect/disconnect events through EventBus while cleanup is lifecycle-owned.

- Advanced settings ownership:
  - `SettingsDefinitions` owns storage/default/validation/event policy, external-source metadata, UI metadata, refs, and listbox options.
  - Startup preference event publication derives from settings metadata instead of hard-coded EventChannels.
  - Setting event payloads are validated against the renderer event manifest.

- Advanced device manifest ownership:
  - Device registry metadata derives from `device.manifest.json`.
  - Chromatic runtime config derives USB IDs, display geometry, media constraints, USB identifier variants, label patterns, and supported scale bounds from the device manifest.
  - Main and renderer Chromatic registration keys derive from `chromaticConfig.id`.
  - Enabled manifest profiles define required profile initialization.

- Advanced generated UI/template ownership:
  - Template refs and actions are tracked through generated template DOM contracts.
  - Core/deferred UI component IDs, element slices, and generated registry aggregate are owned in `template-dom.generated.ts`.
  - UI component catalog no longer owns generated `id` or `stage` metadata, and drift checks reject reintroduction.

- Audited completed source slices with GPT-5.5 subagents:
  - DI/storage/status and update-section lifecycle slices.
  - Bridge lifecycle and descriptor slices.
  - Generated template DOM, UI registry, and UI catalog ownership slices.
  - Device preload event mapping and bridge payload slices.
  - Settings startup-event ownership.
  - Preload invoke validation.
  - Chromatic/device manifest metadata cleanup.

- Last verified source gates passed:
  - `npm run typecheck:app`
  - `npm run lint`
  - `npm run codebase:phase1 -- --json`
  - `npm run codebase:size -- --enforce-thresholds`
  - `npm run architecture:scorecard -- --enforce-thresholds`
  - `npm run build:vite`
  - `npm run dev:smoke`
  - `git diff --check`
  - Targeted preload contract check: `npm run test:run -- tests/unit/preload/preload-api.invoke-contract.test.js`

## Current Uncommitted Source Slice

The current worktree contains source and documentation changes across 25 files. The active source slice includes:

- Device preload event mapping through manifest-owned bridge descriptors.
- Settings startup preference event ownership and payload validation.
- Preload default invoke validation through manifest metadata.
- Chromatic/device manifest metadata cleanup.
- Drift-report hardening for preload invoke validation, bridge payload aliases, settings startup events, generated UI catalog metadata, and docs.
- `.gitignore` update for `.antigravitycli/` local tool artifacts so size gates remain stable.

## Outstanding Source Work

- IPC/preload/event contract generation:
  - Generate or centralize preload global declarations, runtime validators, request/response schemas, handler metadata, mocks, and contract tests from one authoritative contract.
  - Replace remaining hand-authored validator surfaces where schema generation can own them.

- Main IPC handler catalog:
  - Move from manifest-aware descriptor registration to generated or contract-owned handler descriptors with request schema, response shape, dependency tokens, and error policy.
  - Enforce that new handlers cannot bypass descriptors.

- Renderer preload bridge runtime automation:
  - Generate more bridge runtime and payload-mapper descriptors where it deletes real source code.
  - Preserve service-owned state machines such as device sequencing while moving repetitive subscription wiring out of services.

- Template/component code generation:
  - Continue from generated refs/actions/component IDs toward fuller generated template/component ownership.
  - Finish async-safe reinitialization cleanup where delayed disposal can interact with new refs.

- Device manifest generation:
  - Generate more adapter/profile metadata, CSS variables, fixture data, Playwright serialized fixture data, mock stream settings, docs tables, and enforcement around copied device constants.

- Settings definition completion:
  - Decide whether `loadAllPreferencesShape` stays as an intentionally small startup subset or becomes generated from all definitions.
  - Add table-driven settings coverage after source cleanup is accepted.

- Presentation and lifecycle cleanup:
  - Continue removing lower-priority sync-only local lifecycle contracts.
  - Measure deleted lifecycle code and guard focus/keyboard behavior as component generation expands.

- Tooling and docs:
  - Continue consolidating shared script utilities only where reuse is proven.
  - Keep generated docs blocks in sync with architecture/device/settings manifests.

- Deferred test cleanup:
  - Update stale lifecycle, selector/action, and drift expectations after production source is fully completed and cleaned.
  - Continue moving tests toward canonical factories, explicit installers, generated contract tests, manifest-generated device/settings cases, and Testing Library workflows.

## Remaining Completion Criteria

The full objective is only complete when:

- Every numbered finding in `CODEBASE_SIZE_REDUCTION_FINDINGS.md` has been either remediated or explicitly reclassified with current evidence.
- Each remediation has a corresponding source gate and GPT-5.5 audit result.
- The implementation plan is updated to reflect the true current state.
- Test cleanup has been completed after source cleanup.
- A final exhaustive audit is run against the implementation document and current repository state.
- Any final gaps from that audit are resolved or recorded as outstanding with a concrete next phase.
