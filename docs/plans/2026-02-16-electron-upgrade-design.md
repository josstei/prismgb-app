# Electron 28 → 40 Upgrade + USB Library Migration

**Date:** 2026-02-16
**Status:** Approved (v4 — revised after three rounds of quad-agent audit)
**Approach:** Combined upgrade (Electron bump + usb-detection → usb migration in single effort)

## Context

PrismGB runs on Electron 28 (Chromium ~120, Node ~20). The latest stable is Electron 40 (Chromium 144, Node 24, V8 14.4) — a 12 major version gap. The `usb-detection` package (v4.14.2) used for USB device monitoring is deprecated (last release March 2023) with maintainers recommending migration to the `usb` (node-usb) package.

## Decision: Combined Upgrade

Upgrade Electron and replace `usb-detection` in a single coordinated effort because:

- `usb-detection` may not compile against Node 24 (Electron 40's runtime)
- Rebuilding a deprecated package only to immediately replace it wastes effort
- The codebase uses zero removed Electron APIs; one deprecated API (`console-message` event signature) is updated as part of this effort

## Electron Upgrade

### Package Changes

| Package | Current | Target |
|---------|---------|--------|
| `electron` | `^28.0.0` | `^40.0.0` |
| `electron-builder` | `^26.7.0` | `^26.8.1` (review 26.7→26.8 changelog before adopting — same-day release; pin `^26.7.0` initially if changelog reveals risk) |
| `vite-plugin-electron` | `^0.29.0` | `^0.29.1` (patch update available) |
| `vite-plugin-electron-renderer` | `^0.14.6` | `^0.14.6` (already latest) |
| `@electron/rebuild` | N/A | `^4.0.3` (devDependency — requires Node.js v22.12.0+) |

### API Compatibility

Codebase audit confirmed zero usage of APIs **removed** between Electron 28-40:

- No `File.path`, `ipcRenderer.sendTo`, `setTrafficLightPosition`, `desktopCapturer`
- No clipboard usage in renderer, no `renderer-process-crashed` events
- `contextBridge` already uses individual API wrappers (not raw `ipcRenderer`)
- `contextIsolation: true` and `sandbox: true` already set (explicit in `window.service.ts:97-101`)
- `app.commandLine` flags are lowercase (safe for Electron 36 behavior change)

One **deprecated** API requires update:

- **`console-message` event signature** (Electron 35): `window.service.ts:147-158` uses the deprecated positional-parameter signature `(event, level, message, _line, _sourceId)`. Electron 35+ uses an object-based signature `({ level, message })` and `level` changes from a numeric index to a string enum (`'info'`, `'warning'`, `'error'`, `'debug'`). Updated in Phase 3 of this plan.

One **Node.js syntax change** requires update:

- **`import ... assert` → `import ... with`** (Node 24): `container.ts:9` uses `import pkg from '../../../package.json' assert { type: 'json' }`. Node 22 deprecated `assert` in favor of `with` for import attributes; Node 24 (Electron 40's runtime) removes `assert` support entirely. Other files (e.g., `window.service.ts:11`) already use `with`. Updated in Phase 5 of this plan.

### Platform Impact

- Minimum macOS raised to 12 (Monterey) — accepted
- Linux: GTK 4 default on GNOME (Electron 36); `--gtk-version` flag available to force GTK 3 if needed

### Node.js 20 → 24 Compatibility

Electron 40 ships Node 24 (up from Node ~20 in Electron 28). This is a significant runtime jump. Audit of main-process Node.js API usage:

- **`fs`/`path`**: Standard usage (readFile, writeFile, join, resolve). No removed APIs.
- **`crypto`**: Not used directly (Electron handles TLS).
- **`buffer`**: Standard usage. No breaking changes.
- **`child_process`**: Used by FFmpeg transcoding (`spawn`). No breaking changes.
- **`net`/`http`**: Not used directly.
- **Import assertions**: `assert { type: 'json' }` syntax removed in Node 24 — addressed above.
- **V8 14.4**: No direct V8 API usage in app code.

No Node.js runtime API breaking changes affect this codebase.

### Native Module C++20 Requirement

Electron 33+ requires native modules to be compiled with C++20 or later. The `usb` package ships prebuilt binaries via `prebuildify`/`node-gyp-build`. Verify in Phase 1 that prebuilds are available for Electron 40's Node ABI. If prebuilds are unavailable for a target platform, `@electron/rebuild` will compile from source — ensure the build toolchain supports C++20 (Xcode 14+ on macOS, GCC 11+ on Linux, MSVC 2022+ on Windows).

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

- `startMonitoring(): void` — registers attach/detach event listeners with the USB library
- `stopMonitoring(): void` — unrefs hot-plug events and removes all listeners
- `onAttach(callback: (device: UsbDeviceDescriptor) => void): void` — callback receives **fully enriched** descriptors (string fields populated)
- `onDetach(callback: (device: UsbDeviceDescriptor) => void): void` — callback receives descriptors with **null string fields** (device already detached)
- `removeAllListeners(): void`
- `getConnectedDevices(): UsbDeviceDescriptor[]` — **synchronous snapshot** returning descriptors with **null string fields** (manufacturer, serialNumber, productName will be null). String descriptors are only populated in `onAttach()` callbacks. JSDoc on the interface method must document this contract.

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
| `startMonitoring()` | Adapter registers `usb.on('attach', handler)` and `usb.on('detach', handler)`. No separate `usb.startMonitoring()` call needed — node-usb auto-starts hot-plug detection when the first listener is added via its internal `newListener` handler. |
| `stopMonitoring()` | `usb.unrefHotplugEvents()` + `usb.removeAllListeners()` |
| `on('add', cb)` | `usb.on('attach', cb)` |
| `on('remove', cb)` | `usb.on('detach', cb)` |
| `off('add', cb)` | `usb.off('attach', cb)` (standard EventEmitter API) |
| `find()` | `usb.getDeviceList()` (synchronous, returns `Device[]`) |

Note: node-usb also emits `attachIds`/`detachIds` events (providing only `{ idVendor, idProduct }`), but `attach`/`detach` with full `Device` objects is preferred because we need `busNumber`/`deviceAddress` and the ability to read string descriptors.

**Platform fallback consideration:** On systems without native libusb hotplug support, node-usb uses a polling fallback that may only emit `attachIds`/`detachIds` (without full `Device` objects). macOS and modern Linux have native hotplug support, so `attach`/`detach` events fire with full `Device` objects on PrismGB's target platforms. The adapter should log a warning if it detects the polling fallback is active (i.e., `attachIds` fires but `attach` does not) and fall back to calling `getDeviceList()` to resolve the full device object from vendor/product IDs.

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

The adapter must check `usb.INIT_ERROR` (type: `number` — `0` means no error, non-zero is a libusb error code; checking truthiness works correctly) on construction or first `startMonitoring()` call. If libusb fails to initialize (no USB controller, VM environment, CI), the adapter should:
- Log a warning with the specific error
- Degrade gracefully: `getConnectedDevices()` returns empty array, no events fire
- Not throw — `DeviceService` handles the "no devices found" case naturally

### locationId Strategy

The current `ConnectedDeviceInfo` has a `locationId: number` field. The `usb` package has no direct equivalent. Strategy: **construct `ConnectedDeviceInfo` explicitly** from `UsbDeviceDescriptor` fields instead of using `{ ...device }` spread. Replace `locationId` with `busNumber`; `deviceAddress` already exists in both types and is **preserved unchanged**:

- `ConnectedDeviceInfo`: remove `locationId: number`, add `busNumber: number` (keep existing `deviceAddress: number`)
- `DeviceInfoPayload` (IPC contract): remove `locationId?: number`, add `busNumber?: number` (keep existing `deviceAddress?: number`)
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

### @electron/rebuild Usage

The `@electron/rebuild` package rebuilds native Node modules against Electron's Node headers. The `usb` package ships prebuilt binaries via `prebuildify` for common platforms/ABIs. If prebuilds are available for Electron 40's Node ABI, no rebuild is needed. If prebuilds are unavailable (uncommon platform or new ABI), run:

```bash
npx @electron/rebuild -m node_modules/usb
```

Phase 1 includes a pre-flight check to verify prebuild availability. No `postinstall` script is added — `@electron/rebuild` is invoked manually only if needed.

### console-message Event Signature Update

`window.service.ts:147-158` uses the deprecated positional-parameter `console-message` event handler:

**Before:**
```typescript
this._consoleMessageListener = (
  event: Event,
  level: number,
  message: string,
  _line: number,
  _sourceId: string
) => {
  const levels = ['DEBUG', 'INFO', 'WARN', 'ERROR'];
  console.log(`[Renderer ${levels[level] || level}] ${message}`);
};
```

**After (Electron 35+ object-based signature):**
```typescript
this._consoleMessageListener = ({ level, message }: { level: string; message: string }) => {
  console.log(`[Renderer ${level.toUpperCase()}] ${message}`);
};
```

The `ConsoleMessageListener` type alias at lines 28-34 must also be updated to match the new signature. The `level` parameter changes from a numeric index to a string enum (`'info'`, `'warning'`, `'error'`, `'debug'`).

### Import Assertion Syntax Update

`container.ts:9` uses the deprecated `assert` keyword for import attributes:

**Before:**
```typescript
import pkg from '../../../package.json' assert { type: 'json' };
```

**After (Node 24 `with` syntax):**
```typescript
import pkg from '../../../package.json' with { type: 'json' };
```

All other JSON imports in the codebase already use `with` (e.g., `window.service.ts:11`). A codebase-wide grep for `assert { type:` must confirm no other occurrences remain after this change.

### USB_SCAN_DELAY Config Cleanup

After the migration, `USB_SCAN_DELAY` becomes dead code since the adapter's `getConnectedDevices()` is synchronous (no delay needed). Remove from:

- `src/shared/config/config-loader.utils.js`: remove `USB_SCAN_DELAY: 1000` from the `app` config object (line 13) and its Joi validation `USB_SCAN_DELAY: Joi.number().integer().min(0).required()` (line 34)
- `tests/unit/config/ConfigLoader.test.js`: remove assertions for `USB_SCAN_DELAY`
- `tests/fixtures/settings.fixture.js`: remove `USB_SCAN_DELAY: 500` (line 128)

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
| `src/main/application/container.ts` | Add `usbMonitor: IUsbMonitor` to `ContainerDependencies`; register `UsbMonitorAdapter` as singleton; resolve and inject into `DeviceService`; add imports; change `assert { type: 'json' }` → `with { type: 'json' }` (line 9) |
| `src/main/application/app.orchestrator.ts` | Remove 500ms usb-detection cache delay (lines 108-110). Note: `refreshDeviceStatus()` called afterwards works correctly without warm-up because the adapter's `getConnectedDevices()` is synchronous |
| `src/main/infrastructure/window/window.service.ts` | Update `console-message` event handler (lines 147-158) from deprecated positional-parameter signature to Electron 35+ object-based signature; update `ConsoleMessageListener` type alias (lines 28-34) |
| `src/shared/ipc/preload-api.contract.ts` | Update `DeviceInfoPayload`: remove `locationId`, add `busNumber` (keep existing `deviceAddress`) |
| `src/shared/utils/formatters.utils.js` | Add `productName` to name fallback chain |
| `src/shared/config/config-loader.utils.js` | Remove dead `USB_SCAN_DELAY` config property and its Joi validation schema |
| `src/types/preload-api.d.ts` | Pass-through: no code changes needed. Imports `DeviceInfoPayload` from contract — auto-updates when source type changes |
| `vite.config.js` | Change `usb-detection` → `usb` in Rollup externals |
| `package.json` | Add `usb@^2.17.0`; add `usb` to `asarUnpack`; bump `electron`, `electron-builder`, `vite-plugin-electron`; add `@electron/rebuild` (Phase 1 keeps `usb-detection` — it's removed in Phase 4b after all imports are updated) |
| `tests/unit/features/devices/main/device.service.test.js` | Expand coverage for untested methods; mock `IUsbMonitor` instead of `vi.mock('usb-detection')` |
| `tests/unit/features/devices/main/adapters/usb-monitor.adapter.test.js` | New: adapter tests (mirroring source directory structure) |
| `tests/unit/config/ConfigLoader.test.js` | Remove `USB_SCAN_DELAY` assertions |
| `tests/fixtures/settings.fixture.js` | Remove `USB_SCAN_DELAY: 500` (line 128) |
| `tests/integration/devices/device-service-usb-integration.test.js` | New: integration test validating DeviceService + UsbMonitorAdapter work together |

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
| `src/types/preload-api.d.ts:35-36` | `DeviceInfoPayload` import for `onDeviceConnected`/`onDeviceDisconnected` callbacks | **No change** — imports from contract, auto-updates when source type changes |

The renderer does not read `locationId` from the payload. No renderer code changes are needed.

**Type flow note:** `DeviceService.getStatus()` returns local `DeviceStatus` (containing `ConnectedDeviceInfo`), while the IPC layer types it as `DeviceStatusPayload` (containing `DeviceInfoPayload`). These are separate types: `ConnectedDeviceInfo` has required fields, `DeviceInfoPayload` has all optional fields. This is structurally compatible in TypeScript (required is assignable to optional), and `device-bridge.service.ts` uses `Record<string, unknown>` as the bridge type, so the shape flows through without issue.

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
- Should respond to attach events by constructing `ConnectedDeviceInfo` and publishing `DEVICE.CONNECTION_CHANGED` (callback simulation: invoke the callback passed to `onAttach` with a test descriptor, then assert event publication)
- Should respond to detach events by clearing state and publishing disconnect (callback simulation: invoke the callback passed to `onDetach`)

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

`_performDeviceCheck()` (8th untested method — tested indirectly via `refreshDeviceStatus()`):
- Should construct `ConnectedDeviceInfo` with explicit field mapping when device matches
- Should clear state when no matching device found
- Should handle adapter errors gracefully

### Formatter Tests

Add test cases to `tests/unit/utils/Formatters.test.js` for the full fallback chain:

```javascript
it('should use productName when deviceName is absent', () => {
  const result = formatDeviceInfo({ productName: 'Chromatic', configName: 'fallback' });
  expect(result.name).toBe('Chromatic');
});

it('should prefer deviceName over productName', () => {
  const result = formatDeviceInfo({ deviceName: 'Named', productName: 'Product', configName: 'Config' });
  expect(result.name).toBe('Named');
});

it('should use productName when deviceName is null', () => {
  const result = formatDeviceInfo({ deviceName: null, productName: 'Product', configName: 'Config' });
  expect(result.name).toBe('Product');
});

it('should fall through to configName when both deviceName and productName are absent', () => {
  const result = formatDeviceInfo({ configName: 'Config Name' });
  expect(result.name).toBe('Config Name');
});

it('should fall through entire chain to name', () => {
  const result = formatDeviceInfo({ deviceName: null, productName: null, configName: null, name: 'Last Resort' });
  expect(result.name).toBe('Last Resort');
});
```

### Integration Tests (`tests/integration/devices/device-service-usb-integration.test.js`)

Tests with `vi.mock('usb')` at the library boundary only — real adapter, real service, mocked USB library:

- Should detect device via adapter on simulated hot-plug attach event
- Should clear device state via adapter on simulated hot-plug detach event
- Should handle `getConnectedDevices()` returning descriptors with null string fields (verify service handles gracefully)
- Should handle adapter error (e.g., `LIBUSB_ERROR_ACCESS` during open) without crashing service
- Should match device from initial scan via `getDeviceList()` → adapter → service

## Migration Sequence

Phases are ordered so the codebase **compiles** after every phase. Key constraints:
- `usb-detection` stays in `package.json` until Phase 4b removes all imports
- Phases 4a+4b+5 must be committed together if runtime-runnable state is required between commits (Phase 4a compiles but DeviceService expects `usbMonitor` not yet wired in the container until Phase 5)
- Do NOT push to remote until Phase 8 validation completes — all phases must be completed locally before creating PR

```
Phase 1: Package additions (additive only — no removals)
├── PRE-FLIGHT: Verify usb@2.17.0 compatibility with Node 24:
│   ├── npm info usb@2.17.0 engines
│   ├── npm view usb@2.17.0 peerDependencies
│   └── Verify usb prebuildify binaries exist for Electron 40's Node ABI
├── Add usb@^2.17.0 to dependencies
├── Bump electron to ^40.0.0
├── Bump electron-builder to ^26.8.1 (after reviewing 26.7→26.8 changelog)
├── Bump vite-plugin-electron to ^0.29.1
├── Add @electron/rebuild@^4.0.3 as devDependency
├── Add node_modules/usb/**/* to asarUnpack
├── Add 'usb' to Rollup externals in vite.config.js (keep 'usb-detection' too)
├── npm install (note: package-lock.json regeneration will be substantial)
└── Verify: npm run typecheck (existing code still compiles)
    NOTE: usb-detection stays — DeviceService still imports it

Phase 2: USB adapter abstraction (new files only — no existing code changes)
├── Create adapters/ directory under src/main/infrastructure/devices/
├── Create usb-monitor.interface.ts (IUsbMonitor with JSDoc contracts, UsbDeviceDescriptor)
├── Create usb-monitor.adapter.ts (implements IUsbMonitor using 'usb')
├── Export from devices/index.ts barrel
└── Verify: npm run typecheck (new files compile, nothing references them yet)

Phase 3: Shared type + Electron API updates (safe — only types, utilities, and deprecated API signatures)
├── Update DeviceInfoPayload in preload-api.contract.ts (remove locationId, add busNumber)
├── Verify: grep -r "locationId" src/renderer/ src/preload/ returns zero results
├── Update USBDevice in device-profile.registry.ts (accept new descriptor shape)
├── Update formatDeviceInfo in formatters.utils.js (add productName fallback)
├── Update console-message handler in window.service.ts (Electron 35+ object-based signature)
├── Update ConsoleMessageListener type alias in window.service.ts
└── Verify: npm run typecheck
    NOTE: DeviceInfoPayload is optional fields — consumers won't break

Phase 4a: DeviceService refactor (code changes — keep usb-detection in package.json)
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
└── Verify: npm run typecheck (DeviceService compiles with new interface)
    NOTE: usb-detection still in package.json, not imported by DeviceService anymore

Phase 4b: Remove usb-detection from dependencies
├── Remove 'usb-detection' from Rollup externals in vite.config.js
├── Remove usb-detection from package.json dependencies
├── npm install (regenerate lockfile)
└── Verify: npm run typecheck && npm run build:vite

Phase 5: DI container + orchestrator + config cleanup
├── Add usbMonitor: IUsbMonitor to ContainerDependencies interface
├── Add UsbMonitorAdapter import to container.ts
├── Register UsbMonitorAdapter as singleton (alongside profileRegistry)
├── Add usbMonitor to DeviceService manual construction resolve
├── Change `import ... assert { type: 'json' }` to `import ... with { type: 'json' }` in container.ts
├── Grep codebase for remaining `assert { type:` — confirm zero other occurrences
├── Remove 500ms usb-detection cache delay from app.orchestrator.ts (lines 108-110)
├── Remove USB_SCAN_DELAY from config-loader.utils.js (config object + Joi schema)
└── Verify: npm run typecheck

Phase 6: Unit test updates
├── Create usb-monitor.adapter.test.js (mapping, lifecycle, errors)
├── Refactor device.service.test.js (mock IUsbMonitor, add missing method coverage including callback simulation)
├── Add productName test cases to Formatters.test.js (full fallback chain)
├── Update ConfigLoader.test.js (remove USB_SCAN_DELAY assertions)
├── Update settings.fixture.js (remove USB_SCAN_DELAY)
└── Verify: npm run test:unit (all unit tests pass)

Phase 7: Integration tests
├── Create tests/integration/devices/device-service-usb-integration.test.js
├── Test: Hot-plug attach/detach flows through adapter to service
├── Test: getConnectedDevices() with null string fields handled gracefully
├── Test: Adapter error handling doesn't crash service
└── Verify: npm run test:run (all tests pass — unit + integration)

Phase 8: Final validation
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

**v4 (2026-02-16):** Revised after quad-agent audit round 3 (2 Opus + 2 Sonnet). Key changes:

Critical fixes:
- `import ... assert { type: 'json' }` in `container.ts:9` will break under Node 24 (Electron 40's runtime) — must change to `with`. Added to Phase 5 and API Compatibility section.
- `console-message` event handler in `window.service.ts:147-158` uses deprecated positional-parameter signature (Electron 35+). Added "console-message Event Signature Update" section and update to Phase 3.
- `USB_SCAN_DELAY` in `config-loader.utils.js` becomes dead code after migration. Added "USB_SCAN_DELAY Config Cleanup" section; `config-loader.utils.js`, `ConfigLoader.test.js`, and `settings.fixture.js` added to Files Affected table and Phase 5.

Medium fixes:
- Node.js 20→24 compatibility gap addressed. Added "Node.js 20 → 24 Compatibility" section (audit found no breaking changes for this codebase).
- Native module C++20 requirement (Electron 33+) documented. Added "Native Module C++20 Requirement" section.
- `attachIds`/`detachIds` platform fallback risk documented — adapter should handle both event types or detect polling fallback.
- `startMonitoring()` API mapping corrected — not a "no-op" but "registers event listeners" (no separate `usb.startMonitoring()` call needed).
- Phase 4 split into 4a (code changes) and 4b (dependency removal) to prevent intermediate state where removed package is still referenced.
- `preload-api.d.ts` added to renderer impact analysis (auto-updates, no code change needed).
- DeviceService test strategy expanded with callback simulation tests (invoke `onAttach`/`onDetach` callbacks and verify event publication).
- `_performDeviceCheck` explicitly listed as 8th untested method (tested indirectly via `refreshDeviceStatus()`).
- Integration test phase added (Phase 7) — tests DeviceService + UsbMonitorAdapter with mocked USB library.
- Type flow note added to renderer impact analysis documenting `DeviceStatus` → `DeviceStatusPayload` structural compatibility.
- `deviceAddress` narrative clarified: preserved in `DeviceInfoPayload` (not added — already exists).

Low fixes:
- `electron-builder` ^26.8.1 flagged as same-day release; changelog review step added to Phase 1.
- `vite-plugin-electron` updated from ^0.29.0 to ^0.29.1 (patch available).
- `@electron/rebuild` usage instructions added — section documents prebuild verification and manual rebuild fallback.
- `usb.INIT_ERROR` type clarified as `number` (not boolean).
- `package-lock.json` regeneration scope noted for PR reviewers.
- Phase 1 pre-flight checks added for `usb` package Node 24 compatibility.
- "Do not push to remote until Phase 8" note added to migration sequence.
- IUsbMonitor interface method descriptions expanded with sync/async contract details and JSDoc requirement.
- Formatter tests expanded to cover full fallback chain (5 test cases including null and chain-through scenarios).
- GTK 4 `--gtk-version` fallback flag noted in Platform Impact.
