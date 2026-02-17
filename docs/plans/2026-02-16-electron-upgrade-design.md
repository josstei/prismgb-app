# Electron 28 → 40 Upgrade + USB Library Migration

**Date:** 2026-02-16
**Status:** Approved (v3 — revised after two rounds of quad-agent audit)
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

### Sync vs Async Semantics

`getConnectedDevices()` is **synchronous** — it wraps `usb.getDeviceList()` which returns an in-memory snapshot. String descriptors require USB I/O (`device.open()` + `getStringDescriptor()`), so `getConnectedDevices()` returns descriptors with **`null` string fields** (`manufacturer`, `serialNumber`, `productName`). This is by design:

- **`getConnectedDevices()`**: Returns immediately with numeric fields only (vendorId, productId, busNumber, deviceAddress, deviceClass). Used for initial scan and `refreshDeviceStatus()` — sufficient for profile matching since `detectDevice()` only needs vendorId/productId.
- **`onAttach()` callback**: Receives **fully enriched** descriptors with string fields populated via async open/read/close cycle. The adapter performs string descriptor reading internally before emitting the attach event.
- **`onDetach()` callback**: Receives descriptors with `null` string fields (device is already detached, cannot be opened).

This means:
1. On startup, `_scanAlreadyConnectedDevices()` matches devices but `ConnectedDeviceInfo` has empty string fields — acceptable because `configName` from the profile provides the display name.
2. On hot-plug attach, full string descriptors are available for richer logging and display.
3. `_performDeviceCheck()` (called by `refreshDeviceStatus()`) also gets null strings — again acceptable for matching.

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

### Simplification of _scanAlreadyConnectedDevices

The current implementation (lines 264-315 in `device.service.ts`) is deeply nested with try/catch/Promise/callback wrappers to handle `usb-detection.find()`'s inconsistent API (callback-based, synchronous fallback, Object.values conversion). With the adapter, this collapses to:

```typescript
private _scanAlreadyConnectedDevices(): void {
  try {
    const devices = this.usbMonitor.getConnectedDevices();
    if (devices.length === 0) {
      this.logger.debug('No devices found in initial scan');
      return;
    }
    this.logger.debug(`Found ${devices.length} device(s) in initial scan`);
    for (const device of devices) {
      const match = this.matchDevice(device);
      if (match.matched) {
        this.onDeviceConnected(device);
      }
    }
  } catch (error) {
    this.logger.error('Failed to scan for already-connected devices:', error);
  }
}
```

No longer async. No `setTimeout` delay needed. The adapter's `getConnectedDevices()` is synchronous and returns descriptors with null string fields (sufficient for profile matching). The `USB_SCAN_DELAY` constant import and the `_scanTimeoutId` field can be removed.

### Simplification of _performDeviceCheck

Similarly, `_performDeviceCheck()` (lines 411-464) simplifies:

```typescript
private async _performDeviceCheck(): Promise<boolean> {
  try {
    const devices = this.usbMonitor.getConnectedDevices();
    if (devices.length === 0) {
      this.isDeviceConnected = false;
      this.connectedDeviceInfo = null;
      return false;
    }
    for (const device of devices) {
      const match = this.matchDevice(device);
      if (match.matched && match.config) {
        this.isDeviceConnected = true;
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
        return true;
      }
    }
    this.isDeviceConnected = false;
    this.connectedDeviceInfo = null;
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    this.logger.error('Error checking for device', error);
    this.eventBus.publish(MainEventChannels.DEVICE.CHECK_ERROR, { error: errorMessage });
    return false;
  }
}
```

Key change: explicit `ConnectedDeviceInfo` construction at line `this.connectedDeviceInfo = { ... }` replaces the `{ ...device, configName }` spread pattern (previously at lines 448 and 479).

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
  manufacturer?: string | null;
  serialNumber?: string | null;
}
```

No backward compatibility shim needed — the old `locationId` and `deviceName` fields are removed cleanly since both the type and all callers are updated in the same phase. The `detectDevice()` method only uses `vendorId`/`productId` for matching; other fields are for logging via `formatDeviceInfo()`.

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

`DeviceService` is manually instantiated in `container.ts` (not auto-injected by Awilix) because its `initialize()` is async. The adapter must be explicitly resolved and passed.

**Step 1: Update `ContainerDependencies` interface** (line 39-54 in `container.ts`):

Add `usbMonitor` to the interface so Awilix can type-check the registration:

```typescript
export interface ContainerDependencies {
  // ... existing fields ...
  usbMonitor: IUsbMonitor;       // NEW — add before deviceService
  deviceService: DeviceService;
  // ... rest unchanged ...
}
```

**Step 2: Register adapter** — insert after `profileRegistry` registration (line 96-97) and before the manual DeviceService instantiation (line 106):

```typescript
// Register device components
container.register({
  profileRegistry: asClass(DeviceProfileRegistry).singleton(),
  usbMonitor: asClass(UsbMonitorAdapter).singleton()  // NEW
});
```

**Step 3: Resolve and pass to DeviceService** — add to the manual construction (line 106-110):

```typescript
const deviceService = new DeviceService({
  profileRegistry: container.resolve('profileRegistry'),
  eventBus: container.resolve('eventBus'),
  loggerFactory: container.resolve('loggerFactory'),
  usbMonitor: container.resolve('usbMonitor')  // NEW
}, profileClasses);
```

**Step 4: Add imports** at top of `container.ts`:

```typescript
import { UsbMonitorAdapter } from '@main/infrastructure/devices/adapters/usb-monitor.adapter.js';
import type { IUsbMonitor } from '@main/infrastructure/devices/adapters/usb-monitor.interface.js';
```

### Files Affected (Complete List)

| File | Change |
|------|--------|
| `src/main/infrastructure/devices/device.service.ts` | Replace `usb-detection` import with `IUsbMonitor` dependency; update `ConnectedDeviceInfo` type; construct info explicitly instead of spread (lines 448 and 479); simplify `_scanAlreadyConnectedDevices` and `_performDeviceCheck`; remove `_cleanupUSBListeners`, `USBDetectionWithLegacyOff`, `USBDetectionEvent`, `USB_SCAN_DELAY` import, `_scanTimeoutId` field |
| `src/main/infrastructure/devices/adapters/usb-monitor.interface.ts` | New: `IUsbMonitor` interface + `UsbDeviceDescriptor` type |
| `src/main/infrastructure/devices/adapters/usb-monitor.adapter.ts` | New: adapter implementation using `usb` package |
| `src/main/infrastructure/devices/device-profile.registry.ts` | Update `USBDevice` interface to accept new descriptor shape (remove `locationId`, `deviceName`; add `busNumber`, `deviceClass`, `productName`) |
| `src/main/infrastructure/devices/index.ts` | Export new adapter types (`IUsbMonitor`, `UsbDeviceDescriptor`, `UsbMonitorAdapter`) |
| `src/main/infrastructure/devices/device-bridge.service.ts` | Pass-through: no code changes needed. `DeviceStatus.device` is `Record<string, unknown>` (line 18), so the new `ConnectedDeviceInfo` shape flows through without modification |
| `src/main/ipc/handlers/device.handler.ts` | Pass-through: no code changes needed. Calls `deviceService.getStatus()` which returns `DeviceStatusPayload` — payload shape change is handled at `DeviceService` level |
| `src/main/application/container.ts` | Add `usbMonitor: IUsbMonitor` to `ContainerDependencies`; register `UsbMonitorAdapter` as singleton; resolve and inject into `DeviceService`; add imports |
| `src/main/application/app.orchestrator.ts` | Remove 500ms usb-detection cache delay (lines 108-110) |
| `src/shared/ipc/preload-api.contract.ts` | Update `DeviceInfoPayload`: replace `locationId` with `busNumber` + `deviceAddress` |
| `src/shared/utils/formatters.utils.js` | Add `productName` to name fallback chain |
| `vite.config.js` | Change `usb-detection` → `usb` in Rollup externals |
| `package.json` | Add `usb@^2.17.0`; add `usb` to `asarUnpack`; bump `electron`, `electron-builder`; add `@electron/rebuild` (Phase 1 keeps `usb-detection` — it's removed in Phase 4 after all imports are updated) |
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

### Mock IUsbMonitor Factory

All DeviceService tests use a shared mock factory (no `vi.mock('usb-detection')` or `vi.mock('usb')`):

```typescript
function createMockUsbMonitor(): IUsbMonitor {
  return {
    startMonitoring: vi.fn(),
    stopMonitoring: vi.fn(),
    onAttach: vi.fn(),
    onDetach: vi.fn(),
    removeAllListeners: vi.fn(),
    getConnectedDevices: vi.fn().mockReturnValue([])
  };
}
```

This mock is injected via the `DeviceServiceDependencies` constructor parameter, not via `vi.mock()`.

### Adapter Tests (`tests/unit/features/devices/main/adapters/usb-monitor.adapter.test.js`)

Tests with `vi.mock('usb')` at the library boundary:

**Mapping tests:**
- Should map `deviceDescriptor.idVendor` to `vendorId` (assert `descriptor.vendorId === 0x1209`)
- Should map `deviceDescriptor.idProduct` to `productId` (assert `descriptor.productId === 0x4F54`)
- Should map `deviceDescriptor.bDeviceClass` to `deviceClass`
- Should map `busNumber` and `deviceAddress` directly from Device object
- Should call `device.open(false)` then `getStringDescriptor(iManufacturer)` for non-zero index
- Should set `manufacturer` to `null` when `iManufacturer === 0`
- Should set `productName` to `null` when `iProduct === 0`
- Should set `serialNumber` to `null` when `iSerialNumber === 0`

**Lifecycle tests:**
- Should call `usb.on('attach', ...)` on first `startMonitoring()` call
- Should call `usb.unrefHotplugEvents()` and `usb.removeAllListeners()` on `stopMonitoring()`
- Should not register duplicate listeners when `startMonitoring()` called twice
- Should be a no-op when `stopMonitoring()` called before `startMonitoring()`
- Should produce clean state after `start → stop → start` cycle

**Error tests:**
- Should set all methods to no-op when `usb.INIT_ERROR` is truthy
- Should emit descriptor with `null` strings when `device.open(false)` throws `LIBUSB_ERROR_ACCESS`
- Should emit descriptor with `manufacturer: null` when `getStringDescriptor(iManufacturer)` callback has error, while `productName` is still populated if its read succeeded
- Should call `device.close()` in finally block even when all `getStringDescriptor()` calls fail
- Should return empty array from `getConnectedDevices()` when `usb.getDeviceList()` throws
- Should not crash monitoring when user-provided `attach` callback throws
- Should handle device removed during string descriptor read (device.close() throws after open succeeded)

### DeviceService Tests (`tests/unit/features/devices/main/device.service.test.js`)

Refactored to inject `createMockUsbMonitor()` via constructor:

**Existing tests (preserved):**
- Constructor, initialize, getStatus, isConnected, getConnectedDevice, DI pattern

**New tests for previously untested methods:**

`startUSBMonitoring()`:
- Should call `usbMonitor.onAttach()` and `usbMonitor.onDetach()` with callbacks
- Should call `_scanAlreadyConnectedDevices()` synchronously (no setTimeout)
- Should publish `DEVICE.CHECK_ERROR` with `{ type: 'usb-monitoring-failed', error: '...' }` when adapter throws
- Should return `false` when monitoring fails to start
- Should return `true` and set `isUsbMonitoring` flag on success
- Should be idempotent — second call returns `true` without re-registering

`stopUSBMonitoring()`:
- Should call `usbMonitor.stopMonitoring()` and `usbMonitor.removeAllListeners()`
- Should be a no-op when not monitoring (no calls to adapter)

`onDeviceConnected(device)`:
- Should construct `ConnectedDeviceInfo` with explicit field mapping (assert `info.deviceName === device.productName` when productName is set)
- Should fall back to `match.config.deviceName` when `device.productName` is `null`
- Should publish `DEVICE.CONNECTION_CHANGED` with `{ connected: true, device: info }`
- Should ignore device when `matchDevice()` returns `{ matched: false }`

`onDeviceDisconnected(device)`:
- Should clear `connectedDeviceInfo` to `null`
- Should publish `DEVICE.CONNECTION_CHANGED` with `{ connected: false, device: null }`
- Should ignore device when `matchDevice()` returns `{ matched: false }`

`matchDevice(device)`:
- Should delegate to `profileRegistry.detectDevice(device)` with vendorId/productId
- Should return `{ matched: true, config: { deviceName, vendorId, productId }, profile }` on match
- Should return `{ matched: false, config: null, profile: null }` on no match

`refreshDeviceStatus()`:
- Should call `usbMonitor.getConnectedDevices()` (assert called once)
- Should prevent concurrent checks (mutex: second call returns same promise)
- Should publish `DEVICE.CHECK_ERROR` when adapter throws

`_scanAlreadyConnectedDevices()`:
- Should call `onDeviceConnected()` for each matching device from `getConnectedDevices()`
- Should skip non-matching devices
- Should handle empty device list gracefully

### Formatter Tests

Add test cases to `tests/unit/utils/Formatters.test.js` for the full fallback chain:

```javascript
it('should use productName when deviceName is absent', () => {
  const result = formatDeviceInfo({ productName: 'Chromatic', configName: 'fallback' });
  expect(result.name).toBe('Chromatic');
});

it('should prefer deviceName over productName', () => {
  const result = formatDeviceInfo({ deviceName: 'Named', productName: 'Product' });
  expect(result.name).toBe('Named');
});

it('should fall through to configName when both deviceName and productName are absent', () => {
  const result = formatDeviceInfo({ configName: 'Config Name' });
  expect(result.name).toBe('Config Name');
});
```

## Migration Sequence

Phases are ordered so the codebase compiles after every phase. Key constraint: `usb-detection` stays in `package.json` until Phase 4 removes all imports of it.

```
Phase 1: Package additions (additive only — no removals)
├── Add usb@^2.17.0 to dependencies
├── Bump electron to ^40.0.0
├── Bump electron-builder to ^26.8.1
├── Add @electron/rebuild@^4.0.3 as devDependency
├── Add node_modules/usb/**/* to asarUnpack
├── Add 'usb' to Rollup externals in vite.config.js (keep 'usb-detection' too)
├── npm install
└── Verify: npm run typecheck (existing code still compiles)
    NOTE: usb-detection stays — DeviceService still imports it

Phase 2: USB adapter abstraction (new files only — no existing code changes)
├── Create adapters/ directory under src/main/infrastructure/devices/
├── Create usb-monitor.interface.ts (IUsbMonitor, UsbDeviceDescriptor)
├── Create usb-monitor.adapter.ts (implements IUsbMonitor using 'usb')
├── Export from devices/index.ts barrel
└── Verify: npm run typecheck (new files compile, nothing references them yet)

Phase 3: Shared type updates (safe — only types and utilities, no DeviceService yet)
├── Update DeviceInfoPayload in preload-api.contract.ts (replace locationId)
├── Update USBDevice in device-profile.registry.ts (accept new descriptor shape)
├── Update formatDeviceInfo in formatters.utils.js (add productName fallback)
└── Verify: npm run typecheck
    NOTE: DeviceInfoPayload is optional fields — consumers won't break

Phase 4: DeviceService refactor + usb-detection removal (single atomic phase)
├── Add usbMonitor to DeviceServiceDependencies interface
├── Replace usb-detection import with IUsbMonitor dependency
├── Replace _usbDetection field with usbMonitor (injected)
├── Update ConnectedDeviceInfo type (replace locationId with busNumber/deviceAddress)
├── Construct ConnectedDeviceInfo explicitly in onDeviceConnected (line 479)
├── Construct ConnectedDeviceInfo explicitly in _performDeviceCheck (line 448)
├── Simplify _scanAlreadyConnectedDevices (sync, no setTimeout)
├── Simplify _performDeviceCheck (sync getConnectedDevices, explicit construction)
├── Refactor startUSBMonitoring/stopUSBMonitoring to use adapter
├── Update matchDevice signature (UsbDeviceDescriptor instead of USBDetectionDevice)
├── Update onDeviceConnected/onDeviceDisconnected signatures
├── Remove: _cleanupUSBListeners, USBDetectionWithLegacyOff, USBDetectionEvent type
├── Remove: USB_SCAN_DELAY import, _scanTimeoutId field, _onDeviceAdd/Remove fields
├── Remove 'usb-detection' from Rollup externals in vite.config.js
├── Remove usb-detection from package.json dependencies
└── Verify: npm run typecheck (DeviceService now uses adapter exclusively)

Phase 5: DI container + orchestrator update
├── Add usbMonitor: IUsbMonitor to ContainerDependencies interface
├── Add UsbMonitorAdapter import to container.ts
├── Register UsbMonitorAdapter as singleton (alongside profileRegistry)
├── Add usbMonitor to DeviceService manual construction resolve
├── Remove 500ms usb-detection cache delay from app.orchestrator.ts (lines 108-110)
└── Verify: npm run typecheck

Phase 6: Test updates
├── Create usb-monitor.adapter.test.js (mapping, lifecycle, errors)
├── Refactor device.service.test.js (mock IUsbMonitor, add missing method coverage)
├── Add productName test case to Formatters.test.js
└── Verify: npm run test:run (all tests pass)

Phase 7: Final validation
├── npm run lint
├── npm run typecheck
├── npm run test:run
├── npm run build:vite (renderer bundle smoke check)
└── Manual: dev mode with Chromatic device connected
```

Git commit after each phase. All work on a feature branch.

## Audit Trail

**v1 (2026-02-16):** Initial design approved.

**v2 (2026-02-16):** Revised after quad-agent audit round 1 (2 Opus + 2 Sonnet). Key additions:
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

**v3 (2026-02-16):** Revised after quad-agent audit round 2 (2 Opus + 2 Sonnet). Key changes:

Critical fixes:
- `getConnectedDevices()` sync/async semantics documented: sync method returns null string fields, strings only populated via `onAttach` events. Added "Sync vs Async Semantics" section.
- Phase ordering rewritten to prevent compilation failures: Phase 1 no longer removes `usb-detection` (kept until Phase 4 removes all imports); Phase 3 type updates and Phase 4 DeviceService refactor remain separate but Phase 3 only touches types with optional fields (won't break existing code); Phase 4 is atomic (types + code + removal together)
- `ContainerDependencies` interface update explicitly added to Phase 5 with exact line references and step-by-step instructions
- `_performDeviceCheck` explicit `ConnectedDeviceInfo` construction now shown with full code (previously only referenced)

Medium fixes:
- Pass-through files (`device-bridge.service.ts`, `device.handler.ts`) added to Files Affected table with "no change needed" rationale
- `_scanAlreadyConnectedDevices` simplified implementation shown — no longer async, no setTimeout, no Promise wrapper
- `_performDeviceCheck` simplified implementation shown — explicit construction replaces `{ ...device }` spread
- `USBDevice` interface backward compatibility shim removed (unnecessary since types and callers update in same phase)
- DI container insertion point specified with exact line numbers and step-by-step instructions

Test improvements:
- Mock `IUsbMonitor` factory documented with exact code
- All test assertions made specific (exact values, exact event payloads, exact fallback behavior)
- Adapter edge case added: device removed during string descriptor read
- Formatter tests show exact test code for full fallback chain
- `stopUSBMonitoring` test clarified: no `_scanTimeoutId` to cancel post-migration (field removed)
- `package.json` change clarified: `usb-detection` removal deferred to Phase 4
