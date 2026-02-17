# Electron 28 → 40 Upgrade + USB Library Migration

**Date:** 2026-02-16
**Status:** Approved
**Approach:** Combined upgrade (Electron bump + usb-detection → usb migration in single effort)

## Context

PrismGB runs on Electron 28 (Chromium ~120, Node ~20). The latest stable is Electron 40 (Chromium 144, Node 24, V8 14.4) — a 12 major version gap. The `usb-detection` package (v4.14.2) used for USB device monitoring is deprecated (last release March 2023) with maintainers recommending migration to the `usb` (node-usb) package.

## Decision: Combined Upgrade

Upgrade Electron and replace `usb-detection` in a single coordinated effort because:

- `usb-detection` may not compile against Node 24 (Electron 40's runtime)
- Rebuilding a deprecated package only to immediately replace it wastes effort
- The codebase uses zero removed/deprecated Electron APIs, making the version jump low-risk
- The USB migration surface is contained (4 source files + tests)

## Electron Upgrade

### Package Changes

| Package | Current | Target |
|---------|---------|--------|
| `electron` | `^28.0.0` | `^40.0.0` |
| `electron-builder` | `^26.7.0` | Latest `^26.x` |
| `vite-plugin-electron` | `^0.29.0` | Latest |
| `vite-plugin-electron-renderer` | `^0.14.6` | Latest |
| `@electron/rebuild` | N/A | Add as devDependency |

### API Compatibility

Codebase audit confirmed zero usage of APIs removed between Electron 28-40:

- No `File.path`, `ipcRenderer.sendTo`, `setTrafficLightPosition`, `desktopCapturer`
- No clipboard usage in renderer, no `renderer-process-crashed` events
- `contextBridge` already uses individual API wrappers (not raw `ipcRenderer`)
- `contextIsolation: true` and `sandbox: true` already set
- `app.commandLine` flags are lowercase (safe for Electron 36 behavior change)

### Platform Impact

- Minimum macOS raised to 12 (Monterey) — accepted
- Linux: GTK 4 default on GNOME (Electron 36)

## USB Library Migration

### Why `usb` (node-usb) Over WebUSB

The `usb` package is the official migration path from `usb-detection`. WebUSB requires a user permission gesture on first access, which would break the current seamless auto-detection UX where PrismGB detects the Chromatic automatically on plug-in.

### Adapter Abstraction

Direct coupling to USB libraries is the root cause of this migration. The design introduces an adapter abstraction following the pattern already established in the renderer (`infrastructure/adapters/`).

```
src/main/infrastructure/devices/adapters/
├── usb-monitor.interface.ts      # IUsbMonitor + UsbDeviceDescriptor
└── usb-monitor.adapter.ts        # Implements IUsbMonitor using 'usb' package
```

**`IUsbMonitor` interface:**

- `startMonitoring(): void`
- `stopMonitoring(): void`
- `onAttach(callback: (device: UsbDeviceDescriptor) => void): void`
- `onDetach(callback: (device: UsbDeviceDescriptor) => void): void`
- `removeAllListeners(): void`
- `getConnectedDevices(): UsbDeviceDescriptor[]`

**`UsbDeviceDescriptor` domain type:**

- `vendorId: number`
- `productId: number`
- `busNumber: number`
- `deviceAddress: number`
- `manufacturer: string | null`
- `serialNumber: string | null`
- `productName: string | null`

String fields are nullable because reading them requires `device.open()` which can fail (permissions, device busy). Matching only needs vendorId/productId. Display fields fall back explicitly: `device.productName ?? profile.name`.

### API Mapping

| usb-detection | usb (node-usb) via adapter |
|---------------|---------------------------|
| `startMonitoring()` | No-op (hot-plug events auto-start) |
| `stopMonitoring()` | `usb.unrefHotplugEvents()` |
| `on('add', cb)` | `usb.on('attach', cb)` |
| `on('remove', cb)` | `usb.on('detach', cb)` |
| `off('add', cb)` | `usb.off('attach', cb)` |
| `find()` | `usb.getDeviceList()` (synchronous, returns array) |

### Device Descriptor Mapping

| usb-detection | usb (node-usb) |
|---------------|----------------|
| `device.vendorId` | `device.deviceDescriptor.idVendor` |
| `device.productId` | `device.deviceDescriptor.idProduct` |
| `device.manufacturer` | String descriptor via `device.open()` |
| `device.serialNumber` | String descriptor via `device.open()` |
| `device.deviceName` | String descriptor via `device.open()` |
| `device.locationId` | `device.busNumber` + `device.deviceAddress` |

### String Descriptor Reading

The adapter handles the open/read/close cycle:

1. Read `deviceDescriptor.idVendor` / `idProduct` (synchronous, always available)
2. Attempt `device.open()` → read string descriptors → `device.close()`
3. If open/read fails, populate string fields as `null`
4. Emit `UsbDeviceDescriptor` regardless — matching only needs vendorId/productId

### Files Affected

| File | Change |
|------|--------|
| `src/main/infrastructure/devices/device.service.ts` | Replace `usb-detection` import with `IUsbMonitor` dependency |
| `src/main/infrastructure/devices/adapters/usb-monitor.interface.ts` | New: interface + domain type |
| `src/main/infrastructure/devices/adapters/usb-monitor.adapter.ts` | New: adapter implementation |
| `src/main/infrastructure/devices/index.ts` | Export new adapter types |
| `src/main/application/container.ts` | Register `UsbMonitorAdapter`, inject into `DeviceService` |
| `src/main/application/app.orchestrator.ts` | Remove 500ms usb-detection cache delay |
| `vite.config.js` | Change `usb-detection` → `usb` in Rollup externals |
| `package.json` | Remove `usb-detection`, add `usb` |
| `tests/unit/features/devices/main/device.service.test.js` | Mock `IUsbMonitor` instead of `vi.mock('usb-detection')` |
| `tests/unit/features/devices/main/usb-monitor.adapter.test.js` | New: adapter tests |

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `device.open()` fails | Log warning, emit descriptor with `null` string fields |
| `getStringDescriptor()` fails | Log warning, set that field to `null`, continue |
| `getDeviceList()` throws | Log error, return empty array |
| Hot-plug handler throws | Catch in adapter, log, don't crash monitoring |

The adapter owns all USB library error handling. `DeviceService` receives clean domain types or empty arrays.

### What Does NOT Change

- Preload scripts (no USB interaction)
- Renderer process (no USB interaction)
- IPC channels/handlers (device handler is agnostic to USB library)
- Device profiles, DeviceRegistry, DeviceProfileRegistry
- Shared device feature types

## Testing Strategy

| Layer | Strategy |
|-------|----------|
| `UsbMonitorAdapter` | Integration test with `vi.mock('usb')`. Tests mapping, string descriptor reading, error recovery. |
| `DeviceService` | Unit test with mock `IUsbMonitor` injected via constructor. No `vi.mock()` needed. |

## Migration Sequence

```
Phase 1: Package changes
Phase 2: USB adapter abstraction (interface + adapter)
Phase 3: DeviceService refactor (use IUsbMonitor)
Phase 4: DI container update (register adapter, remove delay)
Phase 5: Test updates (new adapter test, refactor service test)
Phase 6: Validation (install, lint, typecheck, test, build)
```

Git commit after each phase. All work on a feature branch.
