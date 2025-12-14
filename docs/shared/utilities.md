# Shared Utilities Documentation

## 1. Overview

This document covers the shared infrastructure used across the PrismGB application, including configuration constants, utilities, base classes, and browser abstractions that provide consistent behavior throughout the codebase.

## 2. Configuration (`src/shared/config/`)

### constants.js

Centralized timing and performance constants used throughout the application:

**Timing Values:**
- `RESIZE_DEBOUNCE_MS` (100ms) - Debounce interval for window resize events
- `BUTTON_FEEDBACK_MS` (200ms) - Visual feedback duration for button interactions
- `DEVICE_ENUMERATE_COOLDOWN_MS` (300ms) - Cooldown period between device enumeration attempts
- `TARGET_FPS` (60) - Target frame rate for rendering and animations
- `UI_TIMEOUT_MS` (150ms) - Default timeout for UI state transitions

**Usage:**
```javascript
import { RESIZE_DEBOUNCE_MS, TARGET_FPS } from '@/shared/config/constants.js';

const debouncedResize = debounce(handleResize, RESIZE_DEBOUNCE_MS);
const frameInterval = 1000 / TARGET_FPS;
```

### css-classes.js

Type-safe CSS class name constants to prevent typos and enable refactoring:

**Body States:**
- `BODY_READY` - Application initialized and ready
- `CONNECTED` - Device connected
- `DISCONNECTED` - Device disconnected

**Overlay States:**
- `READY` - Overlay ready for interaction
- `WAITING` - Overlay in waiting state

**Visibility:**
- `HIDDEN` - Element hidden
- `VISIBLE` - Element visible

**Button States:**
- `RECORDING` - Recording in progress
- `ACTIVE` - Button active/pressed
- `HIDING` - Button transitioning to hidden

**Mode:**
- `CINEMATIC_ACTIVE` - Cinematic mode enabled
- `STREAMING_MODE` - Streaming mode active

**Usage:**
```javascript
import { CSS_CLASSES } from '@/shared/config/css-classes.js';

document.body.classList.add(CSS_CLASSES.CONNECTED);
overlay.classList.toggle(CSS_CLASSES.READY);
```

### dom-selectors.js

Centralized element ID constants for JavaScript DOM access:

**Usage:**
```javascript
import { DOM_SELECTORS } from '@/shared/config/dom-selectors.js';

const videoElement = document.getElementById(DOM_SELECTORS.VIDEO_ELEMENT);
const recordButton = document.getElementById(DOM_SELECTORS.RECORD_BUTTON);
```

### config-loader.js

Application and UI configuration with Joi schema validation:

**Device Configuration:**
- `DEVICE_LAUNCH_DELAY` - Delay before device initialization
- `USB_SCAN_DELAY` - Interval between USB scans
- `USB_INIT_DELAY` - Initial delay before first USB scan

**Window Configuration:**
- Window dimensions (width, height)
- Background color
- Window title
- Frame settings

**Usage:**
```javascript
import { loadConfig } from '@/shared/config/config-loader.js';

const config = loadConfig();
const launchDelay = config.device.DEVICE_LAUNCH_DELAY;
```

## 3. Utilities (`src/shared/utils/`)

### formatters.js

Data formatting utilities for consistent data representation:

**formatDeviceInfo(device)**

Normalizes device data into a consistent format:

```javascript
import { formatDeviceInfo } from '@/shared/utils/formatters.js';

const device = { vendorId: 0x1234, productId: 0x5678, label: 'Camera' };
const formatted = formatDeviceInfo(device);
// Returns: { vendorId, productId, label, ... }
```

### performance-cache.js

Caching utilities for performance optimization:

**PerformanceCache**

LRU cache with TTL (Time-To-Live) support:

```javascript
import { PerformanceCache } from '@/shared/utils/performance-cache.js';

const cache = new PerformanceCache({ maxSize: 100, ttl: 5000 });
cache.set('key', value);
const cached = cache.get('key');
cache.clear();
```

**AnimationCache**

Tracks active animation frames to prevent memory leaks:

```javascript
import { AnimationCache } from '@/shared/utils/performance-cache.js';

const animCache = new AnimationCache();
const frameId = requestAnimationFrame(callback);
animCache.track(frameId);
animCache.cancelAll(); // Cancels all tracked frames
```

### filename-generator.js

Generates consistent, timestamped filenames for captures:

**Methods:**

- `FilenameGenerator.timestamp()` - Returns `YYYYMMDD-HHMMSS-mmm` format
- `FilenameGenerator.forScreenshot()` - Returns `prismgb-screenshot-{timestamp}.png`
- `FilenameGenerator.forRecording()` - Returns `prismgb-recording-{timestamp}.webm`

**Usage:**
```javascript
import { FilenameGenerator } from '@/shared/utils/filename-generator.js';

const screenshotName = FilenameGenerator.forScreenshot();
// "prismgb-screenshot-20250107-143022-456.png"

const recordingName = FilenameGenerator.forRecording();
// "prismgb-recording-20250107-143022-456.webm"
```

## 4. Libraries (`src/shared/lib/`)

### errors.js

Error formatting utilities for consistent error display:

**formatErrorLabel(error)**

Formats error objects or strings for user-friendly display:

```javascript
import { formatErrorLabel } from '@/shared/lib/errors.js';

const errorMessage = formatErrorLabel(error);
displayError(errorMessage);
```

### file-download.js

Browser file download utilities:

**downloadFile(blob, filename)**

Triggers browser file download with automatic cleanup:

```javascript
import { downloadFile } from '@/shared/lib/file-download.js';

const blob = new Blob([data], { type: 'image/png' });
downloadFile(blob, 'screenshot.png');
// URL is automatically revoked after download
```

**Features:**
- Creates temporary object URL
- Triggers download via anchor element
- Delays URL revocation to ensure download completes
- Prevents memory leaks

## 5. Base Classes (`src/shared/base/`)

### service.js - BaseService

Base class for all service classes with dependency validation:

**Features:**
- Automatic dependency validation
- Selective property assignment (prevents pollution)
- Auto-logger creation

**Usage:**
```javascript
import { BaseService } from '@/shared/base/service.js';

export class MyService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory', 'requiredDep'], 'MyService');
    // this.eventBus, this.loggerFactory, this.requiredDep are now available
    // this.logger is automatically created
  }

  doSomething() {
    this.logger.info('Doing something');
  }
}
```

### orchestrator.js - BaseOrchestrator

Base class for orchestrators with lifecycle management:

**Features:**
- Template method lifecycle (initialize/cleanup)
- EventBus subscription tracking
- Automatic cleanup via `subscribeWithCleanup()`
- Idempotent cleanup

**Usage:**
```javascript
import { BaseOrchestrator } from '@/shared/base/orchestrator.js';

export class MyOrchestrator extends BaseOrchestrator {
  constructor(dependencies) {
    super(dependencies, ['eventBus', 'loggerFactory'], 'MyOrchestrator');
  }

  async onInitialize() {
    // Subscribe to events with automatic cleanup
    this.subscribeWithCleanup({
      'device:connected': (data) => this.handleConnect(data),
      'device:disconnected': () => this.handleDisconnect()
    });
  }

  async onCleanup() {
    // Subscriptions are automatically cleaned up
    // Add additional cleanup here if needed
  }
}
```

**Lifecycle Methods:**
- `initialize()` - Calls `onInitialize()`, can only be called once
- `cleanup()` - Calls `onCleanup()` and unsubscribes all events
- `onInitialize()` - Override in subclass for initialization logic
- `onCleanup()` - Override in subclass for cleanup logic

### dom-listener.js - DOMListenerManager

Factory for managing DOM event listeners with automatic cleanup:

**Features:**
- Centralized listener management
- Automatic cleanup to prevent memory leaks
- Listener counting for debugging

**Usage:**
```javascript
import { createDomListenerManager } from '@/shared/base/dom-listener.js';

const listeners = createDomListenerManager();

// Add listeners
listeners.add(element, 'click', handleClick);
listeners.add(window, 'resize', handleResize);

// Check listener count
console.log(listeners.count()); // 2

// Remove all listeners
listeners.removeAll();
```

### validate-deps.js

Dependency validation utility used by BaseService and BaseOrchestrator:

**validateDependencies(deps, required, className)**

Validates that all required dependencies are present:

```javascript
import { validateDependencies } from '@/shared/base/validate-deps.js';

validateDependencies(
  { eventBus, logger },
  ['eventBus', 'logger', 'missing'],
  'MyService'
);
// Throws error: MyService is missing required dependencies: missing
```

## 6. Interfaces (`src/shared/interfaces/`)

### IDeviceAdapter

Contract for device adapter implementations:

**Required Methods:**
- `connect()` - Establish device connection
- `disconnect()` - Close device connection
- `getDeviceInfo()` - Return device information
- `isConnected()` - Check connection status

**Usage:**
```javascript
// See device adapter documentation for implementation details
```

### IFallbackStrategy

Contract for fallback strategy implementations:

**Required Methods:**
- `execute(context)` - Execute fallback strategy
- `canHandle(error)` - Check if strategy can handle error

**Usage:**
```javascript
// See fallback strategy documentation for implementation details
```

### IDeviceStatusProvider

Contract for device status providers:

**Required Methods:**
- `getStatus()` - Return current device status
- `subscribe(callback)` - Subscribe to status changes
- `unsubscribe(callback)` - Unsubscribe from status changes

## 7. Browser Abstractions (`src/infrastructure/browser/`)

### storage.service.js

localStorage wrapper with quota management:

**Methods:**
- `getItem(key)` - Retrieve item from storage
- `setItem(key, value)` - Store item with quota handling
- `removeItem(key)` - Remove item from storage
- `clear()` - Clear all storage

**Usage:**
```javascript
import { StorageService } from '@/infrastructure/browser/storage.service.js';

const storage = new StorageService({ eventBus, loggerFactory });
storage.setItem('settings', { theme: 'dark' });
const settings = storage.getItem('settings');
```

**Features:**
- Automatic quota exceeded handling
- Error logging
- Event emission for storage events

### media-devices.service.js

navigator.mediaDevices wrapper for testability:

**Methods:**
- `enumerateDevices()` - List available media devices
- `getUserMedia(constraints)` - Request media stream

**Usage:**
```javascript
import { MediaDevicesService } from '@/infrastructure/browser/media-devices.service.js';

const mediaDevices = new MediaDevicesService({ loggerFactory });
const devices = await mediaDevices.enumerateDevices();
const stream = await mediaDevices.getUserMedia({ video: true });
```

**Features:**
- Abstraction for testing
- Error handling and logging
- Consistent API across browser implementations

### browser-apis.service.js

requestAnimationFrame wrapper for testability:

**Methods:**
- `requestAnimationFrame(callback)` - Schedule animation frame
- `cancelAnimationFrame(id)` - Cancel scheduled frame

**Usage:**
```javascript
import { BrowserAPIsService } from '@/infrastructure/browser/browser-apis.service.js';

const browserAPIs = new BrowserAPIsService();
const frameId = browserAPIs.requestAnimationFrame(() => {
  // Animation logic
});
browserAPIs.cancelAnimationFrame(frameId);
```

## 8. Key Files Reference Table

| Component | Location | Purpose |
|-----------|----------|---------|
| Timing constants | `src/shared/config/constants.js` | Application-wide timing values |
| CSS classes | `src/shared/config/css-classes.js` | Type-safe CSS class names |
| DOM selectors | `src/shared/config/dom-selectors.js` | Centralized element IDs |
| Config loader | `src/shared/config/config-loader.js` | Configuration with validation |
| Formatters | `src/shared/utils/formatters.js` | Data formatting utilities |
| Performance cache | `src/shared/utils/performance-cache.js` | LRU cache and animation tracking |
| Filename generator | `src/shared/utils/filename-generator.js` | Timestamped filename generation |
| Error formatting | `src/shared/lib/errors.js` | Error display formatting |
| File download | `src/shared/lib/file-download.js` | Browser download triggering |
| BaseService | `src/shared/base/service.js` | Service base class |
| BaseOrchestrator | `src/shared/base/orchestrator.js` | Orchestrator base class |
| DOM listener manager | `src/shared/base/dom-listener.js` | Event listener management |
| Dependency validator | `src/shared/base/validate-deps.js` | Dependency validation |
| Storage service | `src/infrastructure/browser/storage.service.js` | localStorage wrapper |
| Media devices service | `src/infrastructure/browser/media-devices.service.js` | mediaDevices wrapper |
| Browser APIs service | `src/infrastructure/browser/browser-apis.service.js` | requestAnimationFrame wrapper |

## Best Practices

1. **Use Constants**: Always use constants from `constants.js` and `css-classes.js` instead of magic numbers or strings
2. **Extend Base Classes**: Extend `BaseService` or `BaseOrchestrator` for consistent dependency management
3. **Manage Listeners**: Use `DOMListenerManager` for all DOM event listeners to prevent memory leaks
4. **Cache Wisely**: Use `PerformanceCache` for expensive computations with appropriate TTL
5. **Validate Dependencies**: Always specify required dependencies when extending base classes
6. **Use Browser Abstractions**: Use browser service wrappers instead of direct browser APIs for better testability
7. **Consistent Filenames**: Use `FilenameGenerator` for all capture filenames
8. **Error Formatting**: Use `formatErrorLabel()` for consistent error display
