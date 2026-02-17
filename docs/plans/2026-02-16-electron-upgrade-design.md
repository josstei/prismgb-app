# Electron 28 → 40 Upgrade + USB Library Migration

**Date:** 2026-02-16
**Status:** Approved (v2 — revised after quad-agent audit)
**Approach:** Combined upgrade (Electron bump + usb-detection → usb migration in single effort)

## Context

PrismGB runs on Electron 28 (Chromium ~120, Node ~20). The latest stable is Electron 40 (Chromium 144, Node 24, V8 14.4) — a 12 major version gap. The `usb-detection` package (v4.14.2) used for USB device monitoring is deprecated (last release March 2023) with maintainers recommending migration to the `usb` (node-usb) package.

## Decision: Combined Upgrade

Upgrade Electron and replace `usb-detection` in a single coordinated effort because:

- `usb-detection` may not compile against Node 24 (Electron 40's runtime)
- Rebuilding a deprecated package only to immediately replace it wastes effort
- The codebase uses zero removed/deprecated Electron APIs, making the version jump low-risk

## Electron Upgrade

### Package Changes

| Package | Current | Target |
|---------|---------|--------|
| `electron` | `^28.0.0` | `^40.0.0` |
| `electron-builder` | `^26.7.0` | `^26.8.1` |
| `vite-plugin-electron` | `^0.29.0` | `^0.29.0` (already latest) |
| `vite-plugin-electron-renderer` | `^0.14.6` | `^0.14.6` (already latest) |
| `@electron/rebuild` | N/A | `^4.0.3` (devDependency) |

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
- `deviceClass: number`
- `manufacturer: string | null`
- `serialNumber: string | null`
- `productName: string | null`

`deviceClass` mapped from `device.deviceDescriptor.bDeviceClass` — required by `formatDeviceInfo` for diagnostic logging.

String fields are nullable because reading them requires `device.open()` which can fail (permissions, device busy, udev rules on Linux). Matching only needs vendorId/productId. Display fields fall back explicitly: `device.productName ?? profile.name`.

### API Mapping

| usb-detection | usb (node-usb) via adapter |
|---------------|---------------------------|
| `startMonitoring()` | No-op (hot-plug auto-starts on first listener via `newListener` event) |
| `stopMonitoring()` | `usb.unrefHotplugEvents()` + `usb.removeAllListeners()` |
| `on('add', cb)` | `usb.on('attach', cb)` |
| `on('remove', cb)` | `usb.on('detach', cb)` |
| `off('add', cb)` | `usb.off('attach', cb)` (standard EventEmitter API) |
| `find()` | `usb.getDeviceList()` (synchronous, returns `Device[]`) |

Note: node-usb also emits `attachIds`/`detachIds` events (providing only `{ idVendor, idProduct }`), but `attach`/`detach` with full `Device` objects is preferred because we need `busNumber`/`deviceAddress` and the ability to read string descriptors.

### Device Descriptor Mapping

| usb-detection | usb (node-usb) |
|---------------|----------------|
| `device.vendorId` | `device.deviceDescriptor.idVendor` |
| `device.productId` | `device.deviceDescriptor.idProduct` |
| `device.deviceClass` | `device.deviceDescriptor.bDeviceClass` |
| `device.manufacturer` | String descriptor via `device.open()` + `getStringDescriptor(iManufacturer)` |
| `device.serialNumber` | String descriptor via `device.open()` + `getStringDescriptor(iSerialNumber)` |
| `device.deviceName` | String descriptor via `device.open()` + `getStringDescriptor(iProduct)` |
| `device.locationId` | No direct equivalent — see locationId strategy below |

### String Descriptor Reading

The adapter handles the open/read/close cycle. The `deviceDescriptor` fields `iManufacturer`, `iProduct`, `iSerialNumber` are **integer indices** into the USB string descriptor table, not strings themselves.

1. Read `deviceDescriptor.idVendor` / `idProduct` / `bDeviceClass` (synchronous, always available)
2. Check string descriptor indices — index `0` means "not provided" (short-circuit to `null`)
3. Call `device.open(false)` — use `false` to skip configuration selection (avoids unnecessary interface claiming and reduces `LIBUSB_ERROR_ACCESS` risk)
4. Call `getStringDescriptor(index, callback)` for each non-zero index (callback-based: `(error?: LibUSBException, value?: string) => void`)
5. Call `device.close()` in a `finally` block — **must be guaranteed** even if descriptor reads fail, to prevent handle leaks
6. If `open()` throws or any `getStringDescriptor()` fails, set that field to `null`
7. Emit `UsbDeviceDescriptor` regardless — matching only needs vendorId/productId

### Libusb Initialization

The adapter must check `usb.INIT_ERROR` on construction or first `startMonitoring()` call. If libusb fails to initialize (no USB controller, VM environment, CI), the adapter should:
- Log a warning with the specific error
- Degrade gracefully: `getConnectedDevices()` returns empty array, no events fire
- Not throw — `DeviceService` handles the "no devices found" case naturally

### locationId Strategy

The current `ConnectedDeviceInfo` has a `locationId: number` field. The `usb` package has no direct equivalent. Strategy: **construct `ConnectedDeviceInfo` explicitly** from `UsbDeviceDescriptor` fields instead of using `{ ...device }` spread. Replace `locationId` with `busNumber` and `deviceAddress` as separate fields throughout the chain:

- `ConnectedDeviceInfo`: replace `locationId: number` with `busNumber: number` + `deviceAddress: number`
- `DeviceInfoPayload` (IPC contract): replace `locationId?: number` with `busNumber?: number` + `deviceAddress?: number`
- Renderer `device-status.component.js`: does not read `locationId` (confirmed by audit) — no renderer change needed for this field

### ConnectedDeviceInfo Type Update

The current `ConnectedDeviceInfo` in `device.service.ts` uses `{ ...device }` spread from usb-detection's `Device` type. This must change to explicit construction:

**Before:**
```typescript
this.connectedDeviceInfo = { ...device, configName: match.config.deviceName };
```

**After:**
```typescript
this.connectedDeviceInfo = {
  vendorId: device.vendorId,
  productId: device.productId,
  busNumber: device.busNumber,
  deviceAddress: device.deviceAddress,
  deviceName: device.productName ?? match.config.deviceName,
  manufacturer: device.manufacturer ?? '',
  serialNumber: device.serialNumber ?? '',
  configName: match.config.deviceName
};
```

The `ConnectedDeviceInfo` interface keeps `deviceName` as its field name (not `productName`) because it represents the display-ready device name. The mapping `device.productName ?? profile.name` happens at this point.

### IPC Contract: DeviceInfoPayload

The `DeviceInfoPayload` in `src/shared/ipc/preload-api.contract.ts` must be updated:

**Before:**
```typescript
export interface DeviceInfoPayload {
  locationId?: number;
  vendorId?: number;
  productId?: number;
  deviceName?: string;
  manufacturer?: string;
  serialNumber?: string;
  deviceAddress?: number;
  configName?: string;
}
```

**After:**
```typescript
export interface DeviceInfoPayload {
  vendorId?: number;
  productId?: number;
  busNumber?: number;
  deviceAddress?: number;
  deviceName?: string;
  manufacturer?: string;
  serialNumber?: string;
  configName?: string;
}
```

The `deviceName` field is preserved in the payload because the renderer reads it (`device-status.component.js` line 37: `device?.deviceName || device?.configName || 'Device'`). The value is populated from `device.productName ?? profile.name` in `ConnectedDeviceInfo` construction above, so the renderer receives a meaningful name without change.

### USBDevice Interface in DeviceProfileRegistry

The local `USBDevice` interface in `device-profile.registry.ts` must be updated to accept `UsbDeviceDescriptor`:

**Before:**
```typescript
interface USBDevice {
  vendorId: number;
  productId: number;
  locationId?: number;
  deviceName?: string;
  manufacturer?: string;
  serialNumber?: string;
  deviceAddress?: number;
}
```

**After:**
```typescript
interface USBDevice {
  vendorId: number;
  productId: number;
  busNumber?: number;
  deviceAddress?: number;
  deviceClass?: number;
  productName?: string | null;
  deviceName?: string;
  manufacturer?: string | null;
  serialNumber?: string | null;
  configName?: string;
}
```

This accepts both the old shape (for backward compatibility during migration) and the new `UsbDeviceDescriptor` shape. The `detectDevice()` method only uses `vendorId`/`productId` for matching, so the other fields are for logging only.

### formatDeviceInfo Update

The `formatDeviceInfo` utility in `src/shared/utils/formatters.utils.js` must add `productName` to its name fallback chain:

**Before:**
```javascript
name: device.deviceName || device.configName || device.name || 'Unknown',
```

**After:**
```javascript
name: device.deviceName || device.productName || device.configName || device.name || 'Unknown',
```

This ensures the utility works with both old `usb-detection` shapes (during tests) and new `UsbDeviceDescriptor` shapes.

### Build Configuration: asarUnpack

The `usb` package uses `node-gyp-build` to load prebuilt native `.node` binaries. These cannot be loaded from inside an asar archive. Add to `package.json` build config:

```json
"asarUnpack": [
  "node_modules/ffmpeg-static/**/*",
  "node_modules/ffprobe-static/**/*",
  "node_modules/usb/**/*"
]
```

### DI Container Wiring

`DeviceService` is manually instantiated in `container.ts` (not auto-injected by Awilix) because its `initialize()` is async. The adapter must be explicitly resolved and passed:

```typescript
// Register adapter
container.register({
  usbMonitor: asClass(UsbMonitorAdapter).singleton()
});

// Resolve and pass to manually-constructed DeviceService
const deviceService = new DeviceService({
  profileRegistry: container.resolve('profileRegistry'),
  eventBus: container.resolve('eventBus'),
  loggerFactory: container.resolve('loggerFactory'),
  usbMonitor: container.resolve('usbMonitor')  // explicitly resolved
}, profileClasses);
```

### Files Affected (Complete List)

| File | Change |
|------|--------|
| `src/main/infrastructure/devices/device.service.ts` | Replace `usb-detection` import with `IUsbMonitor` dependency; update `ConnectedDeviceInfo` type; construct info explicitly instead of spread; remove `USBDetectionWithLegacyOff` type; remove `_cleanupUSBListeners` |
| `src/main/infrastructure/devices/adapters/usb-monitor.interface.ts` | New: `IUsbMonitor` interface + `UsbDeviceDescriptor` type |
| `src/main/infrastructure/devices/adapters/usb-monitor.adapter.ts` | New: adapter implementation using `usb` package |
| `src/main/infrastructure/devices/device-profile.registry.ts` | Update `USBDevice` interface to accept new descriptor shape |
| `src/main/infrastructure/devices/index.ts` | Export new adapter types |
| `src/main/application/container.ts` | Register `UsbMonitorAdapter`; resolve and inject into `DeviceService` |
| `src/main/application/app.orchestrator.ts` | Remove 500ms usb-detection cache delay (line 108-110) |
| `src/shared/ipc/preload-api.contract.ts` | Update `DeviceInfoPayload`: replace `locationId` with `busNumber` + `deviceAddress` |
| `src/shared/utils/formatters.utils.js` | Add `productName` to name fallback chain |
| `vite.config.js` | Change `usb-detection` → `usb` in Rollup externals |
| `package.json` | Remove `usb-detection`; add `usb`; add `usb` to `asarUnpack`; bump `electron`, `electron-builder`; add `@electron/rebuild` |
| `tests/unit/features/devices/main/device.service.test.js` | Expand coverage for untested methods; mock `IUsbMonitor` instead of `vi.mock('usb-detection')` |
| `tests/unit/features/devices/main/adapters/usb-monitor.adapter.test.js` | New: adapter tests (mirroring source directory structure) |

### Error Handling

| Scenario | Behavior |
|----------|----------|
| `usb.INIT_ERROR` set (no USB controller) | Log warning, degrade gracefully (empty lists, no events) |
| `device.open(false)` fails (permissions, busy) | Log warning, emit descriptor with `null` string fields |
| `getStringDescriptor()` callback has error | Log warning, set that field to `null`, continue with remaining fields |
| `getStringDescriptor()` returns undefined/empty | Map to `null` in descriptor |
| `device.close()` fails after successful open | Swallow error in finally block, log debug |
| `getDeviceList()` throws | Log error, return empty array |
| Hot-plug event handler throws | Catch in adapter, log error, don't crash monitoring loop |

The adapter owns all USB library error handling. `DeviceService` receives clean `UsbDeviceDescriptor` objects or empty arrays.

### Renderer Impact Analysis

Confirmed via grep — renderer consumers of device data:

| File | Field Used | Impact |
|------|-----------|--------|
| `presentation/shared/device-status.component.js:37` | `device?.deviceName \|\| device?.configName \|\| 'Device'` | **No change** — `deviceName` preserved in `DeviceInfoPayload` |
| `infrastructure/adapters/devices/device-ipc-status.adapter.ts` | `DeviceStatusPayload` type import | **No change** — type updated at source |
| `presentation/config/dom-selectors.config.ts:45` | `DEVICE_NAME: 'deviceName'` | **No change** — DOM element ID, not data field |

The renderer does not read `locationId` from the payload. No renderer code changes are needed.

### What Does NOT Change

- Preload scripts (no USB interaction, no `locationId` usage)
- Renderer components (device status reads `deviceName` which is preserved)
- IPC channel names/routing (only payload shape changes)
- Device profiles, DeviceRegistry (matching criteria unchanged)
- `formatDeviceInfo` return shape (only input fallback chain updated)

## Testing Strategy

### Adapter Tests (`tests/unit/features/devices/main/adapters/usb-monitor.adapter.test.js`)

Tests with `vi.mock('usb')` at the library boundary:

**Mapping tests:**
- Should map `deviceDescriptor.idVendor`/`idProduct` to `vendorId`/`productId`
- Should map `deviceDescriptor.bDeviceClass` to `deviceClass`
- Should map `busNumber`/`deviceAddress` from Device object
- Should read string descriptors via `getStringDescriptor()` for non-zero indices
- Should set string fields to `null` for index 0 (not provided)

**Lifecycle tests:**
- Should register `attach`/`detach` listeners on first `startMonitoring()` call
- Should call `unrefHotplugEvents()` + `removeAllListeners()` on `stopMonitoring()`
- Should be idempotent: calling `startMonitoring()` multiple times is safe
- Should be safe: calling `stopMonitoring()` before `startMonitoring()` is a no-op
- Should handle restart: `start → stop → start` produces clean state

**Error tests:**
- Should degrade gracefully when `usb.INIT_ERROR` is set
- Should emit descriptor with `null` strings when `device.open(false)` throws
- Should emit descriptor with `null` for specific field when `getStringDescriptor()` fails
- Should call `device.close()` even when `getStringDescriptor()` fails
- Should return empty array when `getDeviceList()` throws
- Should not crash monitoring when `attach` handler throws

### DeviceService Tests (`tests/unit/features/devices/main/device.service.test.js`)

Refactored to inject mock `IUsbMonitor` via constructor (no `vi.mock()` for USB library):

**Existing tests (preserved):**
- Constructor, initialize, getStatus, isConnected, getConnectedDevice, DI pattern

**New tests for previously untested methods:**
- `startUSBMonitoring()` — calls adapter `onAttach`/`onDetach`; publishes `CHECK_ERROR` on failure
- `stopUSBMonitoring()` — calls adapter `stopMonitoring`/`removeAllListeners`; cancels scan timeout
- `onDeviceConnected()` — matches device via ProfileRegistry; publishes `CONNECTION_CHANGED`; constructs `ConnectedDeviceInfo` correctly
- `onDeviceDisconnected()` — matches device; clears state; publishes `CONNECTION_CHANGED`
- `matchDevice()` — delegates to ProfileRegistry; returns correct `DeviceMatch` shape
- `refreshDeviceStatus()` — calls adapter `getConnectedDevices`; mutex prevents concurrent checks; publishes `CHECK_ERROR` on error
- `_scanAlreadyConnectedDevices()` — iterates adapter results; triggers connection events for matches

### Formatter Tests

- Add test case to `tests/unit/utils/Formatters.test.js` for `productName` fallback

## Migration Sequence

```
Phase 1: Package changes
├── Remove usb-detection from dependencies
├── Add usb@^2.17.0 to dependencies
├── Bump electron to ^40.0.0
├── Bump electron-builder to ^26.8.1
├── Add @electron/rebuild@^4.0.3 as devDependency
├── Add node_modules/usb/**/* to asarUnpack
└── Update Rollup externals (usb-detection → usb) in vite.config.js

Phase 2: USB adapter abstraction
├── Create usb-monitor.interface.ts (IUsbMonitor, UsbDeviceDescriptor)
├── Create usb-monitor.adapter.ts (implements IUsbMonitor using 'usb')
└── Export from devices/index.ts barrel

Phase 3: Type updates
├── Update ConnectedDeviceInfo in device.service.ts (replace locationId with busNumber/deviceAddress)
├── Update USBDevice in device-profile.registry.ts (accept new descriptor shape)
├── Update DeviceInfoPayload in preload-api.contract.ts (replace locationId)
└── Update formatDeviceInfo in formatters.utils.js (add productName fallback)

Phase 4: DeviceService refactor
├── Add usbMonitor to DeviceServiceDependencies interface
├── Replace usb-detection import and _usbDetection field with IUsbMonitor dependency
├── Refactor startUSBMonitoring/stopUSBMonitoring to use adapter
├── Refactor _scanAlreadyConnectedDevices to use adapter.getConnectedDevices()
├── Refactor _performDeviceCheck to use adapter.getConnectedDevices()
├── Construct ConnectedDeviceInfo explicitly in onDeviceConnected/onDeviceDisconnected
├── Remove _cleanupUSBListeners (adapter owns listener lifecycle)
└── Remove USBDetectionWithLegacyOff type

Phase 5: DI container update
├── Register UsbMonitorAdapter as singleton
├── Resolve and inject into DeviceService constructor
└── Remove 500ms usb-detection cache delay from app.orchestrator.ts

Phase 6: Test updates
├── Create usb-monitor.adapter.test.js (mapping, lifecycle, errors)
├── Refactor device.service.test.js (mock IUsbMonitor, add missing method coverage)
├── Add productName test case to Formatters.test.js
└── Verify all existing tests pass

Phase 7: Validation
├── npm install (rebuild native modules)
├── npm run lint
├── npm run typecheck
├── npm run test:run
├── npm run build:vite (renderer bundle smoke check)
└── Manual: dev mode with Chromatic device connected
```

Git commit after each phase. All work on a feature branch.

## Audit Trail

**v1 (2026-02-16):** Initial design approved.

**v2 (2026-02-16):** Revised after quad-agent audit (2 Opus + 2 Sonnet). Key additions:
- `ConnectedDeviceInfo` explicit construction (was using `...device` spread)
- `DeviceInfoPayload` IPC contract update (was incorrectly listed as "no change")
- `USBDevice` interface in ProfileRegistry update (was listed as "no change")
- `UsbDeviceDescriptor` gains `deviceClass` field (was missing, breaks `formatDeviceInfo` logging)
- `locationId` → `busNumber` + `deviceAddress` strategy defined
- `formatDeviceInfo` update for `productName` fallback
- `usb.INIT_ERROR` handling added
- `device.open(false)` specified (skip config selection)
- `device.close()` must be in `finally` block
- `getStringDescriptor()` is callback-based with index semantics documented
- Test strategy expanded: 8 untested DeviceService methods identified and scoped
- Adapter test file path corrected to mirror source structure (`adapters/`)
- `asarUnpack` for `usb` native binaries added
- DI wiring clarified (manual resolve, not auto-inject)
- Renderer impact analysis added (confirmed no renderer changes needed)
- Package versions pinned: `electron-builder@^26.8.1`, `@electron/rebuild@^4.0.3`
- `vite-plugin-electron` and `vite-plugin-electron-renderer` confirmed already at latest
