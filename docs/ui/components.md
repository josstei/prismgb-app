# UI Component System

## 1. Overview

The UI component system provides centralized management of all user interface elements through a factory pattern and registry architecture. This design eliminates global window pollution, ensures proper dependency injection, and provides clean lifecycle management.

**Key Design Principles:**

- Factory pattern for component creation with dependency injection
- Registry pattern for centralized component lifecycle management
- Facade pattern (UIController) for unified UI operations
- Event-driven communication between business logic and UI
- Separation of concerns between components, effects, and coordination

## 2. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                     UIOrchestrator                          │
│                (Application Bootstrap)                      │
└────────────────┬────────────────────────────────────────────┘
                 │
                 ├── Initializes
                 │
    ┌────────────▼─────────────────────────────────────┐
    │             UIController (Facade)                │
    │                                                   │
    │  • Caches DOM element references                 │
    │  • Delegates to registry & effects               │
    │  • Manages DOM event listeners                   │
    │  • Provides unified API for UI operations        │
    └────┬─────────────────────────────┬────────────────┘
         │                             │
         │ Delegates                   │ Delegates
         │                             │
    ┌────▼──────────────────┐    ┌────▼──────────────┐
    │ UIComponentRegistry   │    │    UIEffects      │
    │                       │    │                   │
    │ • Component storage   │    │ • Shutter flash   │
    │ • Lifecycle mgmt      │    │ • Button pop      │
    │ • Lazy initialization │    │ • Animations      │
    └────┬──────────────────┘    └───────────────────┘
         │
         │ Creates via Factory
         │
    ┌────▼──────────────────┐
    │  UIComponentFactory   │
    │                       │
    │ • DI configuration    │
    │ • Component creation  │
    └────┬──────────────────┘
         │
         │ Creates
         │
    ┌────▼─────────────────────────────────────────────┐
    │              Individual Components               │
    │                                                   │
    │  StatusNotificationComponent                     │
    │  DeviceStatusComponent                           │
    │  StreamControlsComponent                         │
    │  VolumeControl                                   │
    │  SettingsMenuComponent (lazy)                    │
    │  ShaderSelectorComponent (lazy)                  │
    └──────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│              Event Bridge (UIEventHandler)                  │
│                                                             │
│  EventBus ──► UIEventHandler ──► UIController ──► UI       │
│                                                             │
│  Decouples business logic from UI manipulation             │
└─────────────────────────────────────────────────────────────┘
```

## 3. UIController (Facade)

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/controller.js`

The UIController serves as the central facade for all UI operations, providing a clean, unified API that abstracts away the complexity of component management.

### Responsibilities

1. **DOM Element Caching:** Initializes and stores references to all DOM elements using centralized DOMSelectors configuration
2. **Component Delegation:** Delegates UI operations to appropriate components via UIComponentRegistry
3. **Effect Delegation:** Delegates visual effects to UIEffects
4. **Event Listener Management:** Tracks and cleans up DOM event listeners
5. **Lazy Initialization:** Supports lazy initialization of optional components (settings menu, shader selector)

### Key Elements Managed

#### Status and Header
- `statusIndicator` - Connection status indicator dot
- `statusText` - Connection status text
- `statusMessage` - Notification message display

#### Video Display
- `streamVideo` - HTMLVideoElement for video stream
- `streamCanvas` - HTMLCanvasElement for WebGL rendering
- `streamOverlay` - Overlay for no-device state
- `overlayMessage` - Message shown in overlay

#### Control Buttons
- `settingsBtn` - Settings menu toggle
- `screenshotBtn` - Capture screenshot
- `recordBtn` - Start/stop recording
- `fullscreenBtn` - Toggle fullscreen
- `volumeBtn` - Volume control toggle
- `cinematicBtn` - Cinematic mode toggle
- `shaderBtn` - Shader selector toggle

#### Volume Controls
- `volumeSlider` - Volume slider input
- `volumeSliderContainer` - Slider popup container
- `volumePercentage` - Volume percentage display
- `volumeWave1` - Volume icon wave 1
- `volumeWave2` - Volume icon wave 2

#### Device Information
- `deviceName` - Connected device name
- `deviceStatusText` - Device connection status
- `currentResolution` - Stream resolution display
- `currentFPS` - Stream FPS display

#### Settings Menu
- `settingsMenuContainer` - Settings dropdown container
- `settingCinematic` - Cinematic mode setting
- `settingStatusStrip` - Status strip visibility setting
- `settingRenderPreset` - Render preset setting
- `disclaimerBtn` - Disclaimer expand button
- `disclaimerContent` - Disclaimer content

### API Examples

```javascript
// Initialize components
uiController.initializeComponents();

// Initialize lazy components
uiController.initSettingsMenu({ settingsService, eventBus, logger });
uiController.initShaderSelector({ settingsService, logger });

// Update status
uiController.updateStatusMessage('Recording started', 'success');
uiController.updateDeviceStatus({ connected: true, device: { deviceName: 'Chromatic' } });

// Control volume
uiController.setVolume(75);
uiController.toggleVolumeSlider(true);

// Control streaming
uiController.setStreamingMode(true);
uiController.updateStreamInfo({ width: 160, height: 144, frameRate: 60 });

// Trigger effects
uiController.triggerShutterFlash();
uiController.triggerRecordButtonPop();

// Add tracked event listeners
uiController.on('settingsBtn', 'click', handleSettingsClick);

// Cleanup
uiController.dispose();
```

## 4. UIComponentFactory

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/component.factory.js`

Factory class that creates UI components with proper dependency injection, ensuring all components receive necessary services.

### Factory Methods

#### `createStatusNotificationComponent(config)`
Creates the status message notification display.
- **Config:** `{ statusMessage: HTMLElement }`
- **Returns:** `StatusNotificationComponent`

#### `createDeviceStatusComponent(config)`
Creates the device connection status manager.
- **Config:** `{ statusIndicator, statusText, deviceName, deviceStatusText, streamOverlay, overlayMessage }`
- **Returns:** `DeviceStatusComponent`

#### `createStreamControlsComponent(config)`
Creates the streaming controls manager.
- **Config:** `{ cinematicBtn, currentResolution, currentFPS, screenshotBtn, recordBtn, streamOverlay }`
- **Returns:** `StreamControlsComponent`

#### `createVolumeControl(config)`
Creates the volume control UI.
- **Config:** `{ volumeSlider, volumePercentage, volumeSliderContainer, streamVideo, volumeButton }`
- **Returns:** `VolumeControl`

#### `createSettingsMenuComponent(config)`
Creates the settings menu dropdown (lazy initialization).
- **Config:** `{ settingsService, eventBus, logger }`
- **Returns:** `SettingsMenuComponent`

#### `createShaderSelectorComponent(config)`
Creates the shader preset selector dropdown (lazy initialization).
- **Config:** `{ settingsService, logger }`
- **Returns:** `ShaderSelectorComponent`

### Usage Example

```javascript
const factory = new UIComponentFactory({ eventBus });

const statusNotification = factory.createStatusNotificationComponent({
  statusMessage: document.getElementById('statusMessage')
});

const volumeControl = factory.createVolumeControl({
  volumeSlider: document.getElementById('volumeSlider'),
  volumePercentage: document.getElementById('volumePercentage'),
  volumeSliderContainer: document.getElementById('volumeSliderContainer'),
  streamVideo: document.getElementById('streamVideo'),
  volumeButton: document.getElementById('volumeBtn')
});
```

## 5. UIComponentRegistry

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/component.registry.js`

Manages the lifecycle of all UI components, providing centralized storage, initialization, and cleanup.

### Lifecycle Methods

#### `initialize(elements)`
Creates and initializes all immediate-load components:
1. StatusNotificationComponent
2. DeviceStatusComponent
3. StreamControlsComponent
4. VolumeControl

Sets up click-outside behavior for volume control.

#### `initSettingsMenu(dependencies)`
Lazy initialization for settings menu component.
- **Dependencies:** `{ settingsService, eventBus, logger }`

#### `initShaderSelector(dependencies)`
Lazy initialization for shader selector component.
- **Dependencies:** `{ settingsService, logger }`

#### `get(name)`
Retrieves a component by name from the registry.
- **Returns:** Component instance or `undefined`

#### `dispose()`
Calls `dispose()` on all components that implement it and clears the registry.

### Component Names

- `statusNotificationComponent`
- `deviceStatusComponent`
- `streamControlsComponent`
- `volumeControl`
- `settingsMenuComponent` (lazy)
- `shaderSelectorComponent` (lazy)

### Usage Example

```javascript
const registry = new UIComponentRegistry({
  uiComponentFactory: factory,
  eventBus,
  loggerFactory
});

// Initialize immediate components
registry.initialize(elements);

// Initialize lazy components
registry.initSettingsMenu({ settingsService, eventBus, logger });

// Get component
const volumeControl = registry.get('volumeControl');
volumeControl.setVolume(50);

// Cleanup
registry.dispose();
```

## 6. Component Inventory

### StatusNotificationComponent

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/status-notification.js`

**Responsibility:** Displays color-coded status messages to the user.

**API:**
- `show(message, type)` - Show status message
  - `type`: `'info'` | `'success'` | `'warning'` | `'error'`

**Implementation:**
- Uses data attribute `data-type` for CSS-driven styling
- Validates message type against allowed types
- Simple, stateless component

**Example:**
```javascript
statusNotification.show('Device connected successfully', 'success');
statusNotification.show('Failed to start recording', 'error');
```

---

### DeviceStatusComponent

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/device-status.js`

**Responsibility:** Manages device connection status display and overlay visibility.

**API:**
- `updateStatus({ connected, device })` - Update connection status
- `updateOverlayMessage(deviceConnected)` - Update overlay state
- `showError(message)` - Show error overlay
- `setOverlayVisible(visible)` - Show/hide overlay

**Implementation:**
- Updates status indicator dot (connected/disconnected classes)
- Updates device name display
- Manages overlay visibility for no-device state
- Uses CSS classes from centralized CSSClasses config

**Example:**
```javascript
deviceStatus.updateStatus({
  connected: true,
  device: { deviceName: 'Chromatic', configName: 'Mod Retro Chromatic' }
});

deviceStatus.updateOverlayMessage(true);
deviceStatus.setOverlayVisible(false);
```

---

### StreamControlsComponent

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/stream-controls.js`

**Responsibility:** Manages streaming-related controls (resolution, FPS, cinematic mode, button states).

**API:**
- `setCinematicMode(enabled)` - Toggle cinematic mode
- `setStreamingMode(isStreaming)` - Update streaming state
- `updateStreamInfo({ width, height, frameRate })` - Update stream info display

**Implementation:**
- Manages cinematic mode button state and body class
- Handles streaming mode with animated transitions (150ms delay)
- Updates resolution and FPS displays
- Enables/disables screenshot and record buttons
- Cleans up animation timeouts on dispose

**Example:**
```javascript
streamControls.setCinematicMode(true);
streamControls.setStreamingMode(true);
streamControls.updateStreamInfo({ width: 160, height: 144, frameRate: 60 });
```

---

### VolumeControl

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/volume-control.js`

**Responsibility:** Manages volume slider, volume icon states, and click-outside behavior.

**API:**
- `setVolume(volume)` - Set volume (0-100)
- `updateDisplay(volume)` - Update UI display
- `updateIcon(volume)` - Update volume icon waves
- `applyToVideo(volume)` - Apply to HTMLVideoElement
- `showSlider()` - Show volume slider popup
- `hideSlider()` - Hide volume slider popup
- `setupClickOutside()` - Enable click-outside-to-close

**Implementation:**
- Volume icon displays 0, 1, or 2 waves based on level
- Slider popup with click-outside behavior
- Applies volume directly to video element
- Uses DomListenerManager for cleanup

**Example:**
```javascript
volumeControl.setVolume(75);
volumeControl.showSlider();
volumeControl.setupClickOutside();
```

---

### SettingsMenuComponent

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/features/settings/ui/settings-menu.js`

**Responsibility:** Settings dropdown menu with checkboxes, links, and disclaimer section.

**Features:**
- Status strip visibility toggle
- External link handlers (GitHub, website, Mod Retro)
- Disclaimer expand/collapse
- App version display
- Click-outside and Escape key to close

**API:**
- `initialize(elements)` - Setup component with DOM elements
- `toggle()` - Toggle menu visibility
- `show()` - Show menu
- `hide()` - Hide menu

**Implementation:**
- Lazy initialization (created when needed)
- Loads current settings from SettingsService
- Applies settings to footer visibility
- Handles external links via Electron shell.openExternal
- Auto-collapses disclaimer on menu close

**Example:**
```javascript
settingsMenu.initialize(elements);
settingsMenu.toggle();
```

---

### ShaderSelectorComponent

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/shader-selector.js`

**Responsibility:** Dropdown for selecting shader rendering presets.

**Features:**
- Loads shader presets from render.presets.js
- Displays preset name and description
- Highlights currently selected preset
- Click-outside and Escape key to close
- Listens for preset changes from other sources

**API:**
- `initialize(elements)` - Setup component with DOM elements
- `toggle()` - Toggle dropdown visibility
- `show()` - Show dropdown
- `hide()` - Hide dropdown

**Implementation:**
- Lazy initialization (created when needed)
- Dynamically renders preset list
- Syncs with SettingsService
- Subscribes to `SETTINGS.RENDER_PRESET_CHANGED` events
- Uses active class for selected preset

**Example:**
```javascript
shaderSelector.initialize(elements);
shaderSelector.toggle();
```

## 7. Event-to-UI Bridge (UIEventHandler)

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/event-handler.js`

The UIEventHandler bridges EventBus events to UIController methods, decoupling business logic from direct UI manipulation.

### Event Subscriptions

#### Status & Messages
- `ui:status-message` - Update status message
- `ui:device-status` - Update device connection status
- `ui:overlay-message` - Update overlay message
- `ui:overlay-visible` - Show/hide overlay
- `ui:overlay-error` - Show error overlay

#### Streaming
- `ui:streaming-mode` - Enable/disable streaming mode
- `ui:stream-info` - Update resolution/FPS display

#### Visual Effects
- `ui:shutter-flash` - Trigger screenshot flash
- `ui:record-button-pop` - Trigger record button pop
- `ui:record-button-press` - Trigger record button press
- `ui:button-feedback` - Generic button feedback animation

#### Controls
- `ui:recording-state` - Update recording button state
- `ui:volume-level` - Set volume level
- `ui:volume-slider-visible` - Show/hide volume slider
- `ui:cinematic-mode` - Toggle cinematic mode
- `ui:fullscreen-state` - Update fullscreen button

### Usage Pattern

```javascript
// In business logic (orchestrator or service)
eventBus.publish('ui:status-message', { message: 'Recording started', type: 'success' });
eventBus.publish('ui:streaming-mode', { enabled: true });
eventBus.publish('ui:shutter-flash');

// UIEventHandler automatically delegates to UIController
// Business logic never touches UIController directly
```

### Benefits

1. **Decoupling:** Business logic doesn't depend on UIController
2. **Testability:** Easy to test without UI
3. **Maintainability:** UI changes don't affect business logic
4. **Flexibility:** Multiple UI implementations possible

## 8. Dependency Injection Flow

```
Container (ServiceContainer)
  │
  ├─► UIComponentFactory (eventBus)
  │
  ├─► UIComponentRegistry (uiComponentFactory, eventBus, loggerFactory)
  │
  ├─► UIEffects (elements, logger)
  │
  ├─► UIController (uiComponentRegistry, uiEffects, loggerFactory)
  │
  └─► UIEventHandler (eventBus, uiController)
```

All components receive their dependencies through constructor injection, making them:
- Testable (dependencies can be mocked)
- Flexible (dependencies can be swapped)
- Explicit (dependencies are visible in constructor)

## 9. Lifecycle Management

### Initialization Order

1. **UIComponentFactory** created first
2. **UIComponentRegistry** created with factory
3. **UIEffects** created
4. **UIController** created with registry and effects
5. **UIController.initializeComponents()** called
   - Registry creates immediate components
   - Volume control click-outside setup
6. **UIEventHandler** created and initialized
7. **Lazy components** initialized when needed:
   - Settings menu on first settings button click
   - Shader selector on first shader button click

### Cleanup Order

1. **UIEventHandler.dispose()** - Unsubscribe from all events
2. **UIController.dispose()** - Clean DOM listeners and registry
   - **UIComponentRegistry.dispose()** - Dispose all components
     - Each component's `dispose()` called
   - **DomListenerManager.removeAll()** - Remove tracked listeners

## 10. Key Files

### Core System
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/controller.js` - UIController facade
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/component.factory.js` - Component factory
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/component.registry.js` - Component registry
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/event-handler.js` - Event-to-UI bridge
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/effects.js` - Visual effects

### Components
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/status-notification.js`
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/device-status.js`
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/stream-controls.js`
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/volume-control.js`
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/ui/components/shader-selector.js`
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/features/settings/ui/settings-menu.js`

### Supporting Infrastructure
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/shared/config/dom-selectors.js` - Centralized DOM element IDs
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/shared/config/css-classes.js` - Centralized CSS class names
- `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/shared/base/dom-listener.js` - DOM event listener manager

## 11. Design Patterns Used

### Facade Pattern
**UIController** provides a simplified, unified interface to the complex subsystem of components and effects.

### Factory Pattern
**UIComponentFactory** encapsulates component creation logic and dependency injection.

### Registry Pattern
**UIComponentRegistry** provides centralized storage and lifecycle management for components.

### Observer Pattern
**UIEventHandler** subscribes to EventBus events and updates UI accordingly.

### Service Locator Pattern
Components are stored in registry by name and retrieved via `get(name)`.

## 12. Best Practices

### When to Create a New Component

Create a new component when you have:
- A cohesive set of UI elements that work together
- Shared state or behavior
- Multiple methods operating on the same elements
- Need for setup/teardown logic

### When to Use UIController Methods

Add methods to UIController when:
- The operation spans multiple components
- You need to coordinate UI updates
- You want a high-level API for common operations

### When to Use Events

Publish UI events when:
- Business logic needs to update UI
- You want loose coupling between layers
- Multiple listeners might need the same update

### Component Guidelines

1. **Single Responsibility:** Each component manages one cohesive aspect of UI
2. **Dependency Injection:** All dependencies through constructor
3. **Cleanup:** Implement `dispose()` for event listeners and timeouts
4. **No Globals:** Never access window globals; pass dependencies
5. **Stateless When Possible:** Minimize internal state
6. **CSS-Driven:** Use classes for styling, data attributes for state

## 13. Testing Strategy

### Unit Testing Components

```javascript
import { StatusNotificationComponent } from './status-notification.js';

describe('StatusNotificationComponent', () => {
  let component;
  let mockElement;

  beforeEach(() => {
    mockElement = {
      textContent: '',
      dataset: {}
    };
    component = new StatusNotificationComponent({
      statusMessage: mockElement
    });
  });

  it('should show message with type', () => {
    component.show('Test message', 'success');

    expect(mockElement.textContent).toBe('Test message');
    expect(mockElement.dataset.type).toBe('success');
  });
});
```

### Integration Testing UIController

```javascript
import { UIController } from './controller.js';

describe('UIController', () => {
  let controller;
  let mockRegistry;
  let mockEffects;

  beforeEach(() => {
    mockRegistry = {
      initialize: vi.fn(),
      get: vi.fn(),
      dispose: vi.fn()
    };

    controller = new UIController({
      uiComponentRegistry: mockRegistry,
      uiEffects: mockEffects,
      loggerFactory
    });
  });

  it('should delegate to registry', () => {
    controller.initializeComponents();
    expect(mockRegistry.initialize).toHaveBeenCalled();
  });
});
```

## 14. Migration Guide

If migrating from direct DOM manipulation to this component system:

1. **Identify UI Operations:** List all places you manipulate UI
2. **Group by Concern:** Group related operations (status, volume, etc.)
3. **Create Components:** Implement components for each group
4. **Update Factory:** Add factory methods for new components
5. **Register Components:** Add to registry initialization
6. **Publish Events:** Replace direct UI calls with event publishing
7. **Update UIEventHandler:** Add event subscriptions
8. **Test:** Verify all UI updates work through new system

## 15. Troubleshooting

### Component Not Updating

1. Check component is initialized: `registry.get('componentName')`
2. Verify DOM elements exist in controller.elements
3. Check event is being published: Add debug logging
4. Verify UIEventHandler subscription exists

### Memory Leaks

1. Ensure `dispose()` called on all components
2. Verify event listeners are tracked in DomListenerManager
3. Check for forgotten subscriptions in UIEventHandler
4. Clear animation timeouts in component dispose()

### Element Not Found

1. Verify DOMSelectors has correct ID
2. Check HTML has element with matching ID
3. Ensure initialization timing (DOM ready)
4. Check for typos in element key names
