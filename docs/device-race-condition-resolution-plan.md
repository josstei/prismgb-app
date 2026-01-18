# Device Race Condition Resolution Plan

This document provides a detailed implementation plan for resolving the race conditions identified in `docs/device-race-condition-analysis.md`.

## Design Principles

This plan follows the established architecture patterns documented in:
- `docs/naming-conventions.md` - File and identifier naming
- `docs/architecture-diagrams.md` - Service boundaries and data flow
- `CONTRIBUTING.md` - Code style and patterns

Key architectural constraints:
1. **Services** extend `BaseService` and contain business logic
2. **Orchestrators** extend `BaseOrchestrator` and coordinate services (thin coordinators)
3. **EventBus** is used for cross-service communication
4. **Adapters** abstract external/platform APIs
5. Dependency injection via `container.js`
6. Event channels defined in `event-channels.config.js`

## Overview

| Issue | Solution | New Files | Modified Files |
|-------|----------|-----------|----------------|
| Concurrent IPC device events | Operation sequencing service | `device-operation-sequencer.service.js` | `device.orchestrator.js`, `container.js` |
| Device change event bursts | Debounced event adapter | `device-change-debounce.adapter.js` | `device-media.service.js`, `container.js` |

---

## Part 1: Device Operation Sequencing Service

### Problem Statement

`DeviceOrchestrator` handles IPC events (`_handleDeviceConnectedIPC`, `_handleDeviceDisconnectedIPC`) asynchronously without coordination. Rapid connect/disconnect sequences can cause:
- Overlapping calls to `updateConnectionStatus()`
- Inconsistent state between `DeviceConnectionService.isConnected` and enumeration results
- Stale UI updates

### Solution: DeviceOperationSequencerService

Create a dedicated service that queues device operations and processes them sequentially. This follows the established pattern in `StreamingService` (`_operationPromise`) but generalized for reuse.

#### Architecture Fit

```
DeviceOrchestrator
       │
       ├─ subscribes to IPC events
       │
       └─ delegates to DeviceOperationSequencerService
                │
                ├─ queues operations
                └─ executes sequentially
                         │
                         └─ calls DeviceService methods
```

This maintains the orchestrator as a thin coordinator while encapsulating sequencing logic in a service.

#### File: `src/renderer/features/devices/services/device-operation-sequencer.service.js`

```javascript
/**
 * Device Operation Sequencer Service
 *
 * Ensures device operations (status updates, enumeration) are executed
 * sequentially to prevent race conditions from rapid IPC events.
 *
 * Follows the operation promise pattern established in StreamingService.
 */

import { BaseService } from '@shared/base/service.base.js';

/**
 * Operation types for logging and debugging
 * @readonly
 * @enum {string}
 */
const OperationType = {
  CONNECTED: 'connected',
  DISCONNECTED: 'disconnected',
  REFRESH: 'refresh'
};

export class DeviceOperationSequencerService extends BaseService {
  /**
   * @param {Object} dependencies - Injected dependencies
   * @param {DeviceService} dependencies.deviceService - Device service facade
   * @param {EventBus} dependencies.eventBus - Event publisher
   * @param {Function} dependencies.loggerFactory - Logger factory
   */
  constructor(dependencies) {
    super(dependencies, ['deviceService', 'eventBus', 'loggerFactory'], 'DeviceOperationSequencerService');

    /**
     * Promise chain for sequential operation execution
     * @private
     * @type {Promise<void>}
     */
    this._operationQueue = Promise.resolve();

    /**
     * Currently executing operation type (for debugging)
     * @private
     * @type {string|null}
     */
    this._currentOperation = null;

    /**
     * Count of queued operations (for metrics/debugging)
     * @private
     * @type {number}
     */
    this._queueDepth = 0;
  }

  /**
   * Queue a device connected operation
   * @returns {Promise<void>} Resolves when operation completes
   */
  queueConnected() {
    return this._enqueue(OperationType.CONNECTED, async () => {
      await this.deviceService.updateDeviceStatus();
      await this.deviceService.enumerateDevices();
    });
  }

  /**
   * Queue a device disconnected operation
   * @param {Function} onComplete - Callback after status update (for event publishing)
   * @returns {Promise<void>} Resolves when operation completes
   */
  queueDisconnected(onComplete) {
    return this._enqueue(OperationType.DISCONNECTED, async () => {
      await this.deviceService.updateDeviceStatus();
      if (typeof onComplete === 'function') {
        onComplete();
      }
    });
  }

  /**
   * Queue a device status refresh
   * @returns {Promise<void>} Resolves when operation completes
   */
  queueRefresh() {
    return this._enqueue(OperationType.REFRESH, async () => {
      await this.deviceService.updateDeviceStatus();
      await this.deviceService.enumerateDevices();
    });
  }

  /**
   * Get current queue depth (for testing/debugging)
   * @returns {number} Number of operations waiting
   */
  getQueueDepth() {
    return this._queueDepth;
  }

  /**
   * Enqueue an operation for sequential execution
   * @private
   * @param {string} type - Operation type for logging
   * @param {Function} operation - Async operation to execute
   * @returns {Promise<void>} Resolves when operation completes
   */
  _enqueue(type, operation) {
    this._queueDepth++;
    this.logger.debug(`Queuing ${type} operation (queue depth: ${this._queueDepth})`);

    // Chain onto existing queue
    this._operationQueue = this._operationQueue
      .then(async () => {
        this._currentOperation = type;
        this.logger.debug(`Executing ${type} operation`);

        try {
          await operation();
          this.logger.debug(`Completed ${type} operation`);
        } catch (error) {
          this.logger.error(`Error in ${type} operation:`, error);
          // Don't rethrow - allow queue to continue processing
        } finally {
          this._currentOperation = null;
          this._queueDepth--;
        }
      });

    return this._operationQueue;
  }

  /**
   * Wait for all queued operations to complete
   * Useful for testing and cleanup
   * @returns {Promise<void>}
   */
  async flush() {
    await this._operationQueue;
  }
}
```

#### Modifications to DeviceOrchestrator

**File: `src/renderer/features/devices/services/device.orchestrator.js`**

```diff
 import { BaseOrchestrator } from '@shared/base/orchestrator.base.js';
 import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

 export class DeviceOrchestrator extends BaseOrchestrator {
   constructor(dependencies) {
     super(
       dependencies,
-      ['deviceService', 'deviceIpcAdapter', 'eventBus', 'loggerFactory'],
+      ['deviceService', 'deviceIpcAdapter', 'deviceOperationSequencer', 'eventBus', 'loggerFactory'],
       'DeviceOrchestrator'
     );
     this._unsubscribeIPC = null;
   }

   async onInitialize() {
     this.deviceService.setupDeviceChangeListener();

     this._unsubscribeIPC = this.deviceIpcAdapter.subscribe(
       () => this._handleDeviceConnectedIPC(),
       () => this._handleDeviceDisconnectedIPC()
     );

-    await this.deviceService.updateDeviceStatus();
-    await this.deviceService.enumerateDevices();
+    // Queue initial status check through sequencer
+    await this.deviceOperationSequencer.queueRefresh();
   }

   isDeviceConnected() {
     return this.deviceService.isDeviceConnected();
   }

-  async _refreshDeviceInfo() {
-    await this.deviceService.updateDeviceStatus();
-  }
-
-  async _handleDeviceConnectedIPC() {
-    await this._refreshDeviceInfo();
-    await this.deviceService.enumerateDevices();
+  _handleDeviceConnectedIPC() {
+    // Fire-and-forget: sequencer handles ordering
+    this.deviceOperationSequencer.queueConnected();
   }

-  async _handleDeviceDisconnectedIPC() {
-    await this._refreshDeviceInfo();
-    this.eventBus.publish(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION);
+  _handleDeviceDisconnectedIPC() {
+    // Fire-and-forget: sequencer handles ordering
+    // Event is published after status update completes
+    this.deviceOperationSequencer.queueDisconnected(() => {
+      this.eventBus.publish(EventChannels.DEVICE.DISCONNECTED_DURING_SESSION);
+    });
   }

   async onCleanup() {
     if (typeof this._unsubscribeIPC === 'function') {
       this._unsubscribeIPC();
       this._unsubscribeIPC = null;
     }
     this.logger.info('IPC device listeners removed');

+    // Wait for pending operations before cleanup
+    await this.deviceOperationSequencer.flush();
+
     if (this.deviceService && typeof this.deviceService.dispose === 'function') {
       this.deviceService.dispose();
     }
   }
 }
```

#### Container Registration

**File: `src/renderer/container.js`**

```diff
 // Features: Devices
 import { DeviceService } from '@renderer/features/devices/services/device.service.js';
 import { DeviceConnectionService } from '@renderer/features/devices/services/device-connection.service.js';
 import { DeviceStorageService } from '@renderer/features/devices/services/device-storage.service.js';
 import { DeviceMediaService } from '@renderer/features/devices/services/device-media.service.js';
 import { DeviceOrchestrator } from '@renderer/features/devices/services/device.orchestrator.js';
+import { DeviceOperationSequencerService } from '@renderer/features/devices/services/device-operation-sequencer.service.js';
 import { DeviceIpcStatusAdapter } from '@renderer/features/devices/adapters/device-ipc-status.adapter.js';
 import { DeviceIpcAdapter } from '@renderer/features/devices/adapters/device-ipc.adapter.js';

 // ... in createRendererContainer() ...

+  // Device operation sequencing (prevents race conditions)
+  container.registerSingleton(
+    'deviceOperationSequencer',
+    function(deviceService, eventBus, loggerFactory) {
+      return new DeviceOperationSequencerService({
+        deviceService,
+        eventBus,
+        loggerFactory
+      });
+    },
+    ['deviceService', 'eventBus', 'loggerFactory']
+  );

   // Device orchestrator
   container.registerSingleton(
     'deviceOrchestrator',
-    function(deviceService, deviceIpcAdapter, eventBus, loggerFactory) {
+    function(deviceService, deviceIpcAdapter, deviceOperationSequencer, eventBus, loggerFactory) {
       return new DeviceOrchestrator({
         deviceService,
         deviceIpcAdapter,
+        deviceOperationSequencer,
         eventBus,
         loggerFactory
       });
     },
-    ['deviceService', 'deviceIpcAdapter', 'eventBus', 'loggerFactory']
+    ['deviceService', 'deviceIpcAdapter', 'deviceOperationSequencer', 'eventBus', 'loggerFactory']
   );
```

---

## Part 2: Device Change Debounce Adapter

### Problem Statement

Browser `devicechange` events can fire in rapid bursts during USB operations. The current implementation in `DeviceMediaService.setupDeviceChangeListener()` processes each event immediately, causing:
- Multiple cache invalidations mid-enumeration
- Redundant `enumerateDevices()` calls
- Potential stale results being cached

### Solution: DeviceChangeDebounceAdapter

Create an adapter that wraps the browser's `devicechange` event with debouncing. This follows the established adapter pattern (`VisibilityAdapter`, `UserActivityAdapter`, `ReducedMotionAdapter`).

#### Architecture Fit

```
BrowserMediaAdapter (existing)
       │
       └─ provides raw navigator.mediaDevices API
              │
              └─ DeviceChangeDebounceAdapter (new)
                        │
                        ├─ wraps devicechange event
                        ├─ debounces rapid events
                        └─ notifies DeviceMediaService
```

The adapter abstracts the debouncing logic, keeping `DeviceMediaService` focused on enumeration business logic.

#### File: `src/renderer/features/devices/adapters/device-change-debounce.adapter.js`

```javascript
/**
 * Device Change Debounce Adapter
 *
 * Wraps browser devicechange events with configurable debouncing
 * to prevent race conditions from rapid USB connect/disconnect sequences.
 *
 * Follows the adapter pattern established by VisibilityAdapter, UserActivityAdapter.
 */

import { TIMING } from '@shared/config/constants.config.js';

/**
 * Default debounce delay in milliseconds
 * Browser devicechange events can burst during USB operations
 * 150ms balances responsiveness with race prevention
 */
const DEFAULT_DEBOUNCE_MS = TIMING?.DEVICE_CHANGE_DEBOUNCE_MS ?? 150;

export class DeviceChangeDebounceAdapter {
  /**
   * @param {Object} options - Configuration options
   * @param {Object} options.browserMediaService - Browser media API wrapper
   * @param {Function} [options.logger] - Optional logger
   * @param {number} [options.debounceMs] - Debounce delay (default: 150ms)
   */
  constructor({ browserMediaService, logger, debounceMs = DEFAULT_DEBOUNCE_MS }) {
    if (!browserMediaService) {
      throw new Error('DeviceChangeDebounceAdapter: browserMediaService is required');
    }

    this._browserMediaService = browserMediaService;
    this._logger = logger;
    this._debounceMs = debounceMs;

    /**
     * Active debounce timer
     * @private
     * @type {number|null}
     */
    this._debounceTimer = null;

    /**
     * Bound raw event handler (for removal)
     * @private
     * @type {Function|null}
     */
    this._rawHandler = null;

    /**
     * User callback
     * @private
     * @type {Function|null}
     */
    this._callback = null;

    /**
     * Count of suppressed events (for debugging/metrics)
     * @private
     * @type {number}
     */
    this._suppressedCount = 0;
  }

  /**
   * Subscribe to debounced device change events
   * @param {Function} callback - Called after debounce window closes
   * @returns {Function} Unsubscribe function
   */
  subscribe(callback) {
    if (typeof callback !== 'function') {
      this._logger?.warn('DeviceChangeDebounceAdapter: Invalid callback');
      return () => {};
    }

    // Prevent multiple subscriptions
    if (this._rawHandler) {
      this._logger?.warn('DeviceChangeDebounceAdapter: Already subscribed');
      return () => this.unsubscribe();
    }

    this._callback = callback;
    this._suppressedCount = 0;

    // Create raw handler that implements debouncing
    this._rawHandler = () => {
      // Clear existing timer if event arrives during debounce window
      if (this._debounceTimer !== null) {
        clearTimeout(this._debounceTimer);
        this._suppressedCount++;
        this._logger?.debug(`Device change suppressed (${this._suppressedCount} total)`);
      }

      // Schedule debounced callback
      this._debounceTimer = setTimeout(() => {
        this._debounceTimer = null;

        if (this._suppressedCount > 0) {
          this._logger?.debug(`Processing device change (suppressed ${this._suppressedCount} intermediate events)`);
          this._suppressedCount = 0;
        }

        this._callback?.();
      }, this._debounceMs);
    };

    this._browserMediaService.addEventListener('devicechange', this._rawHandler);
    this._logger?.debug(`Device change listener registered (debounce: ${this._debounceMs}ms)`);

    return () => this.unsubscribe();
  }

  /**
   * Unsubscribe from device change events
   */
  unsubscribe() {
    // Clear pending debounce timer
    if (this._debounceTimer !== null) {
      clearTimeout(this._debounceTimer);
      this._debounceTimer = null;
    }

    // Remove raw event listener
    if (this._rawHandler) {
      this._browserMediaService.removeEventListener('devicechange', this._rawHandler);
      this._rawHandler = null;
    }

    this._callback = null;
    this._logger?.debug('Device change listener removed');
  }

  /**
   * Get count of suppressed events since last callback
   * Useful for testing and debugging
   * @returns {number}
   */
  getSuppressedCount() {
    return this._suppressedCount;
  }

  /**
   * Check if currently subscribed
   * @returns {boolean}
   */
  isSubscribed() {
    return this._rawHandler !== null;
  }
}
```

#### Configuration Addition

**File: `src/shared/config/constants.config.js`**

```diff
 export const TIMING = {
   // ... existing timing constants ...
   DEVICE_ENUMERATE_COOLDOWN_MS: 500,
+  DEVICE_CHANGE_DEBOUNCE_MS: 150,
   // ...
 };
```

#### Modifications to DeviceMediaService

**File: `src/renderer/features/devices/services/device-media.service.js`**

```diff
 import { BaseService } from '@shared/base/service.base.js';
 import { DeviceDetectionHelper } from '@shared/features/devices/device-detection.utils.js';
 import { TIMING } from '@shared/config/constants.config.js';
 import { EventChannels } from '@renderer/infrastructure/events/event-channels.config.js';

 class DeviceMediaService extends BaseService {
   constructor(dependencies) {
     super(dependencies, [
       'eventBus',
       'loggerFactory',
       'browserMediaService',
       'deviceConnectionService',
-      'deviceStorageService'
+      'deviceStorageService',
+      'deviceChangeDebounceAdapter'
     ], 'DeviceMediaService');

     this.videoDevices = [];
     this.hasMediaPermission = false;
     this._enumerateInFlight = null;
     this._lastEnumerateAt = 0;
     this._enumerateCooldownMs = TIMING.DEVICE_ENUMERATE_COOLDOWN_MS;
     this._lastEnumerateResult = null;
-    this._deviceChangeHandler = null;
+    this._unsubscribeDeviceChange = null;
     this._knownSupportedDeviceIds = new Set();
   }

   // ... existing methods unchanged ...

   setupDeviceChangeListener(onChange) {
-    if (this._deviceChangeHandler) {
+    if (this._unsubscribeDeviceChange) {
       return;
     }

-    this._deviceChangeHandler = async () => {
+    // Subscribe via debounce adapter - handles rapid event bursts
+    this._unsubscribeDeviceChange = this.deviceChangeDebounceAdapter.subscribe(async () => {
       this.logger.info('Device change detected');
       this.invalidateEnumerationCache();
       await onChange();
       await this.enumerateDevices();
-    };
-    this.browserMediaService.addEventListener('devicechange', this._deviceChangeHandler);
+    });
+
     this.logger.info('Device change listener set up');
   }

   // ... _checkForNewSupportedDevice unchanged ...

   dispose() {
-    if (this._deviceChangeHandler) {
-      this.browserMediaService.removeEventListener('devicechange', this._deviceChangeHandler);
-      this._deviceChangeHandler = null;
+    if (this._unsubscribeDeviceChange) {
+      this._unsubscribeDeviceChange();
+      this._unsubscribeDeviceChange = null;
     }
   }

   // ... _isMatchingDevice unchanged ...
 }
```

#### Container Registration

**File: `src/renderer/container.js`**

```diff
 // Features: Devices
 import { DeviceService } from '@renderer/features/devices/services/device.service.js';
 import { DeviceConnectionService } from '@renderer/features/devices/services/device-connection.service.js';
 import { DeviceStorageService } from '@renderer/features/devices/services/device-storage.service.js';
 import { DeviceMediaService } from '@renderer/features/devices/services/device-media.service.js';
 import { DeviceOrchestrator } from '@renderer/features/devices/services/device.orchestrator.js';
 import { DeviceOperationSequencerService } from '@renderer/features/devices/services/device-operation-sequencer.service.js';
 import { DeviceIpcStatusAdapter } from '@renderer/features/devices/adapters/device-ipc-status.adapter.js';
 import { DeviceIpcAdapter } from '@renderer/features/devices/adapters/device-ipc.adapter.js';
+import { DeviceChangeDebounceAdapter } from '@renderer/features/devices/adapters/device-change-debounce.adapter.js';

 // ... in createRendererContainer() ...

+  // Device change debounce adapter (prevents event burst races)
+  container.registerSingleton(
+    'deviceChangeDebounceAdapter',
+    function(browserMediaService, loggerFactory) {
+      return new DeviceChangeDebounceAdapter({
+        browserMediaService,
+        logger: loggerFactory.create('DeviceChangeDebounceAdapter')
+      });
+    },
+    ['browserMediaService', 'loggerFactory']
+  );

   // Device media service
   container.registerSingleton(
     'deviceMediaService',
-    function(eventBus, loggerFactory, browserMediaService, deviceConnectionService, deviceStorageService) {
+    function(eventBus, loggerFactory, browserMediaService, deviceConnectionService, deviceStorageService, deviceChangeDebounceAdapter) {
       return new DeviceMediaService({
         eventBus,
         loggerFactory,
         browserMediaService,
         deviceConnectionService,
-        deviceStorageService
+        deviceStorageService,
+        deviceChangeDebounceAdapter
       });
     },
-    ['eventBus', 'loggerFactory', 'browserMediaService', 'deviceConnectionService', 'deviceStorageService']
+    ['eventBus', 'loggerFactory', 'browserMediaService', 'deviceConnectionService', 'deviceStorageService', 'deviceChangeDebounceAdapter']
   );
```

---

## Part 3: Testing Strategy

### Unit Tests

#### DeviceOperationSequencerService Tests

**File: `tests/unit/features/devices/services/device-operation-sequencer.service.test.js`**

Test cases:
1. Sequential execution - operations complete in order
2. Queue depth tracking - correctly increments/decrements
3. Error isolation - one operation failure doesn't break queue
4. Flush behavior - waits for all pending operations
5. Callback invocation - disconnected callback called after status update
6. Concurrent calls - rapid calls are queued, not lost

```javascript
describe('DeviceOperationSequencerService', () => {
  describe('queueConnected', () => {
    it('should execute operations sequentially');
    it('should update status before enumerating');
    it('should handle errors without breaking queue');
  });

  describe('queueDisconnected', () => {
    it('should call callback after status update');
    it('should handle missing callback gracefully');
  });

  describe('queue behavior', () => {
    it('should process rapid sequential calls in order');
    it('should track queue depth correctly');
    it('should allow flush to wait for completion');
  });
});
```

#### DeviceChangeDebounceAdapter Tests

**File: `tests/unit/features/devices/adapters/device-change-debounce.adapter.test.js`**

Test cases:
1. Single event - callback fires after debounce delay
2. Burst suppression - multiple rapid events → single callback
3. Suppressed count - correctly tracks suppressed events
4. Unsubscribe - clears timer and removes listener
5. Double subscribe - warns and returns existing unsubscribe
6. Invalid callback - handles gracefully

```javascript
describe('DeviceChangeDebounceAdapter', () => {
  describe('subscribe', () => {
    it('should debounce rapid events');
    it('should call callback after debounce window');
    it('should track suppressed event count');
    it('should warn on invalid callback');
    it('should prevent double subscription');
  });

  describe('unsubscribe', () => {
    it('should clear pending debounce timer');
    it('should remove event listener');
  });
});
```

### Integration Tests

**File: `tests/integration/device-connection.test.js`**

Test cases:
1. Rapid connect/disconnect sequence - state remains consistent
2. Device change burst - single enumeration after burst
3. IPC event during enumeration - queued correctly

---

## Part 4: Event Channel Updates (Optional)

If additional observability is needed, add debug event channels:

**File: `src/renderer/infrastructure/events/event-channels.config.js`**

```diff
   DEVICE: {
     STATUS_CHANGED: 'device:status-changed',
     SUPPORTED_DEVICE_AVAILABLE: 'device:supported-device-available',
     ENUMERATION_FAILED: 'device:enumeration-failed',
-    DISCONNECTED_DURING_SESSION: 'device:disconnected-during-session'
+    DISCONNECTED_DURING_SESSION: 'device:disconnected-during-session',
+    OPERATION_QUEUED: 'device:operation-queued',      // Debug: operation added to queue
+    OPERATION_COMPLETED: 'device:operation-completed' // Debug: operation finished
   },
```

These are optional and only for debugging/metrics. The core fix does not require them.

---

## Implementation Order

### Phase 1: Operation Sequencer (High Priority)
1. Create `device-operation-sequencer.service.js`
2. Write unit tests
3. Update `device.orchestrator.js`
4. Update `container.js`
5. Run integration tests

### Phase 2: Debounce Adapter (Medium Priority)
1. Add `DEVICE_CHANGE_DEBOUNCE_MS` to constants
2. Create `device-change-debounce.adapter.js`
3. Write unit tests
4. Update `device-media.service.js`
5. Update `container.js`
6. Run integration tests

### Phase 3: Validation
1. Manual testing with rapid USB connect/disconnect
2. Verify no regressions in device detection flow
3. Check memory profile for timer leaks
4. Run full test suite with coverage

---

## Rollback Strategy

Both changes are isolated and can be reverted independently:

1. **Operation Sequencer**: Revert orchestrator to direct `await` calls
2. **Debounce Adapter**: Revert media service to direct `addEventListener`

No data migrations or breaking API changes are involved.

---

## Metrics and Observability

After implementation, monitor:
1. `DeviceOperationSequencerService.getQueueDepth()` - should rarely exceed 2
2. `DeviceChangeDebounceAdapter.getSuppressedCount()` - indicates event burst frequency
3. Console logs with `DEBUG=DeviceOperationSequencerService,DeviceChangeDebounceAdapter`

If queue depth regularly exceeds 3 or suppressed count exceeds 5, investigate USB driver behavior or adjust timing constants.
