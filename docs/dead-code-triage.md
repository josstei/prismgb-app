# Dead Code Triage Log

This file records the triage of findings from `knip` dead-code analysis.

## Unused Files

| File | Status | Rationale |
| --- | --- | --- |
| `packages/prismgb-gpu/src/application/index.ts` | `false-positive` | Barrel exports/scaffolding in sub-package |
| `packages/prismgb-gpu/src/domain/index.ts` | `false-positive` | Barrel exports/scaffolding in sub-package |
| `packages/prismgb-gpu/src/infrastructure/canvas2d/index.ts` | `false-positive` | Barrel exports/scaffolding in sub-package |
| `packages/prismgb-gpu/src/infrastructure/index.ts` | `false-positive` | Barrel exports/scaffolding in sub-package |
| `packages/prismgb-gpu/src/infrastructure/webgl2/index.ts` | `false-positive` | Barrel exports/scaffolding in sub-package |
| `packages/prismgb-gpu/src/infrastructure/webgpu/index.ts` | `false-positive` | Barrel exports/scaffolding in sub-package |
| `src/renderer/application/di/external-tokens.ts` | `false-positive` | Read dynamically by `scripts/generate-di.js` |

## Unused Exports (Key Triage)

| File / Export | Status | Rationale |
| --- | --- | --- |
| `packages/prismgb-devices/src/usb-device-monitor.ts` -> `toUsbDeviceInfo` | `defer` | Helper for USB device info |
| `packages/prismgb-events/src/event.manifest.ts` -> `getEventManifestScope` | `false-positive` | Internal helper exported and used inside event manifest package |
| `src/main/application/index.ts` -> `createAppContainer` | `false-positive` | Barrel export of `container.ts` function |
| `src/main/infrastructure/gpu-policy.ts` -> `detectPlatform` | `defer` | Platform-detect utility |
| `src/preload/subscription.factory.ts` -> `createSubscription` | `false-positive` | Preload bridge contract builder helper |
| `src/shared/config/storage-keys.config.ts` -> `SETTINGS_STORAGE_KEYS` | `false-positive` | Storage key definitions used dynamically/for type checking |
