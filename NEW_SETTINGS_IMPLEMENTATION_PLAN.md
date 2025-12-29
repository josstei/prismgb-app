# New Settings Implementation Plan

Add 4 new settings that work seamlessly together:

1. **Fullscreen on startup** - Enter fullscreen when app window becomes visible
2. **Minimalist fullscreen** - Separate toggle for borderless/black background styling
3. **Auto-start on boot** - Start app minimized to tray, window shows when device connects
4. **Auto-stream on connect** - Automatically start streaming when device is detected

## User Flow (all settings enabled)

```
PC boots → app starts to tray (hidden)
    ↓
Device connects → window shows → fullscreen activates → stream starts
    ↓
Minimalist styling applied (if enabled)
```

---

## Branch Strategy

Each feature gets its own branch for separate PRs:

| Branch | Feature | Dependencies |
|--------|---------|--------------|
| `feature/fullscreen-on-startup` | Fullscreen on startup | None |
| `feature/minimalist-fullscreen` | Minimalist fullscreen | Branch 1* |
| `feature/auto-start` | Auto-start on boot | None (main process) |
| `feature/auto-stream` | Auto-stream on connect | None |

*Branch 2 depends on Branch 1 because both modify `fullscreen.service.js`:
- Branch 1 adds `enterFullscreen()`/`exitFullscreen()` methods
- Branch 2 adds minimalist mode + `settingsService` dependency

**Merge order:** Branch 1 → Branch 2 → (Branch 3 and 4 in any order)

Independent branches:
- Branch 3: Main process only
- Branch 4: StreamingOrchestrator

All features designed to work together when all enabled.

---

# Branch 1: `feature/fullscreen-on-startup`

## Files to Modify

| File | Changes |
|------|---------|
| `src/renderer/infrastructure/events/event-channels.js` | Add `FULLSCREEN_ON_STARTUP_CHANGED` |
| `src/shared/config/dom-selectors.js` | Add `SETTING_FULLSCREEN_ON_STARTUP` |
| `src/renderer/features/settings/services/settings.service.js` | Add setting |
| `src/renderer/features/settings/services/display-mode.orchestrator.js` | Add `enterFullscreen()` |
| `src/renderer/features/settings/services/preferences.orchestrator.js` | Call fullscreen on startup |
| `src/renderer/container.js` | Update dependencies |
| `src/renderer/index.html` | Add checkbox |
| `src/renderer/features/settings/ui/settings-menu.component.js` | Bind checkbox |

## Implementation Steps

### 1.1 Event Channel
**File:** `src/renderer/infrastructure/events/event-channels.js`

```javascript
FULLSCREEN_ON_STARTUP_CHANGED: 'settings:fullscreen-on-startup-changed'
```

### 1.2 DOM Selector
**File:** `src/shared/config/dom-selectors.js`

```javascript
SETTING_FULLSCREEN_ON_STARTUP: 'settingFullscreenOnStartup'
```

### 1.3 SettingsService
**File:** `src/renderer/features/settings/services/settings.service.js`

Add to defaults, keys, PROTECTED_STORAGE_KEYS, and add getter/setter pair.

### 1.4 FullscreenService - Add enterFullscreen()
**File:** `src/renderer/features/settings/services/fullscreen.service.js`

Add non-toggle method (currently only `toggleFullscreen()` exists):
```javascript
/**
 * Enter fullscreen mode (non-toggle)
 */
enterFullscreen() {
  if (this._isFullscreen) {
    return; // Already fullscreen
  }
  this._requestFullscreen();
}

/**
 * Exit fullscreen mode (non-toggle)
 */
exitFullscreen() {
  if (!this._isFullscreen) {
    return; // Already windowed
  }
  this._exitFullscreen();
}
```

### 1.5 DisplayModeOrchestrator - Delegate enterFullscreen()
**File:** `src/renderer/features/settings/services/display-mode.orchestrator.js`

Delegate to FullscreenService:
```javascript
/**
 * Enter fullscreen mode
 */
enterFullscreen() {
  this.fullscreenService.enterFullscreen();
}
```

### 1.6 Event-Driven Approach (Keeps AppOrchestrator Thin)

**Design Principle:** AppOrchestrator should be a "THIN coordinator" - no business logic. Use event-driven architecture instead.

#### Step 1: Add PREFERENCES_LOADED event
**File:** `src/renderer/infrastructure/events/event-channels.js`

```javascript
SETTINGS: {
  // ... existing ...
  PREFERENCES_LOADED: 'settings:preferences-loaded'
}
```

#### Step 2: PreferencesOrchestrator publishes event
**File:** `src/renderer/features/settings/services/preferences.orchestrator.js`

```javascript
async loadPreferences() {
  const preferences = this.settingsService.loadAllPreferences();

  // Publish events for individual settings
  this.eventBus.publish(EventChannels.SETTINGS.VOLUME_CHANGED, preferences.volume);
  this.eventBus.publish(EventChannels.SETTINGS.PERFORMANCE_MODE_CHANGED, preferences.performanceMode);

  // Signal that all preferences are loaded (for startup behaviors)
  this.eventBus.publish(EventChannels.SETTINGS.PREFERENCES_LOADED, preferences);

  this.logger.info('Preferences loaded');
}
```

#### Step 3: DisplayModeOrchestrator subscribes and applies fullscreen
**File:** `src/renderer/features/settings/services/display-mode.orchestrator.js`

Add `settingsService` dependency and subscribe to PREFERENCES_LOADED:

```javascript
constructor(dependencies) {
  super(dependencies, [
    'fullscreenService',
    'cinematicModeService',
    'settingsService',  // ADD
    'eventBus',         // ADD
    'loggerFactory'
  ], 'DisplayModeOrchestrator');
}

async onInitialize() {
  await this.fullscreenService.initialize();
  await this.cinematicModeService.initialize();

  // Subscribe to preferences loaded for startup behaviors
  this.subscribeWithCleanup({
    [EventChannels.SETTINGS.PREFERENCES_LOADED]: () => this._applyStartupBehaviors()
  });
}

_applyStartupBehaviors() {
  if (this.settingsService.getFullscreenOnStartup()) {
    this.fullscreenService.enterFullscreen();
  }
}
```

**Why this is better:**
- AppOrchestrator stays thin (no settingsService dependency needed for this feature)
- Event-driven = loosely coupled
- Easy to add more startup behaviors later
- Proper lifecycle via subscribeWithCleanup (auto-cleanup on dispose)

### 1.7 Container Registration
**File:** `src/renderer/container.js`

Update DisplayModeOrchestrator registration (~line 517) to include `settingsService` and `eventBus`:

```javascript
container.registerSingleton(
  'displayModeOrchestrator',
  function (fullscreenService, cinematicModeService, settingsService, eventBus, loggerFactory) {
    return new DisplayModeOrchestrator({
      fullscreenService,
      cinematicModeService,
      settingsService,
      eventBus,
      loggerFactory
    });
  },
  ['fullscreenService', 'cinematicModeService', 'settingsService', 'eventBus', 'loggerFactory']
);
```

### 1.8 HTML
**File:** `src/renderer/index.html`

Add checkbox in Display section:
```html
<label class="settings-item toggle">
  <span>Fullscreen on startup</span>
  <input type="checkbox" id="settingFullscreenOnStartup">
  <span class="toggle-slider"></span>
</label>
```

### 1.9 SettingsMenuComponent
**File:** `src/renderer/features/settings/ui/settings-menu.component.js`

Bind checkbox to settings service.

---

# Branch 2: `feature/minimalist-fullscreen`

## Files to Modify

| File | Changes |
|------|---------|
| `src/renderer/infrastructure/events/event-channels.js` | Add `MINIMALIST_FULLSCREEN_CHANGED` |
| `src/shared/config/dom-selectors.js` | Add `SETTING_MINIMALIST_FULLSCREEN` |
| `src/shared/config/css-classes.js` | Add `MINIMALIST_FULLSCREEN` |
| `src/renderer/features/settings/services/settings.service.js` | Add setting |
| `src/renderer/features/settings/services/fullscreen.service.js` | Apply CSS class |
| `src/renderer/assets/styles/states.css` | Minimalist styles |
| `src/renderer/index.html` | Add checkbox |
| `src/renderer/features/settings/ui/settings-menu.component.js` | Bind checkbox |

## Implementation Steps

### 2.1 Event Channel
```javascript
MINIMALIST_FULLSCREEN_CHANGED: 'settings:minimalist-fullscreen-changed'
```

### 2.2 DOM Selector
```javascript
SETTING_MINIMALIST_FULLSCREEN: 'settingMinimalistFullscreen'
```

### 2.3 CSS Class Constant
**File:** `src/shared/config/css-classes.js`

```javascript
MINIMALIST_FULLSCREEN: 'minimalist-fullscreen'
```

### 2.4 SettingsService
Add setting (defaults, keys, protected keys, getter/setter).

### 2.5 FullscreenService
**File:** `src/renderer/features/settings/services/fullscreen.service.js`

**Note:** FullscreenService extends BaseService and uses `initialize()` (not `onInitialize()`)

1. Add `settingsService` to constructor required dependencies
2. Add `_minimalistEnabled = false` property in constructor
3. In `initialize()` (NOT onInitialize):
```javascript
initialize() {
  // Load initial state from settings
  this._minimalistEnabled = this.settingsService.getMinimalistFullscreen();

  // Subscribe to settings changes
  this.eventBus.subscribe(
    EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED,
    (enabled) => {
      this._minimalistEnabled = enabled;
      // Re-apply if currently fullscreen
      if (this._isFullscreenActive) {
        this._applyMinimalistClass(enabled);
      }
    }
  );

  // ... existing initialization code ...
}
```

4. Update `_applyFullscreenState()`:
```javascript
_applyFullscreenState(active) {
  // ... existing code ...
  if (active) {
    document.body.classList.add(CSSClasses.FULLSCREEN_ACTIVE);
    // Apply minimalist mode if enabled
    if (this._minimalistEnabled) {
      document.body.classList.add(CSSClasses.MINIMALIST_FULLSCREEN);
    }
  } else {
    document.body.classList.remove(CSSClasses.FULLSCREEN_ACTIVE);
    document.body.classList.remove(CSSClasses.MINIMALIST_FULLSCREEN);
  }
}
```

5. Add subscription cleanup in `dispose()` (BaseService doesn't have subscribeWithCleanup):
```javascript
constructor(dependencies) {
  // ... existing ...
  this._unsubscribeMinimalist = null;  // ADD: track subscription
}

initialize() {
  // ... existing ...
  // Store unsubscribe function for cleanup
  this._unsubscribeMinimalist = this.eventBus.subscribe(
    EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED,
    (enabled) => { /* handler */ }
  );
}

dispose() {
  // Clean up minimalist subscription
  if (this._unsubscribeMinimalist) {
    this._unsubscribeMinimalist();
    this._unsubscribeMinimalist = null;
  }
  // ... existing cleanup ...
}
```

**Why manual cleanup:** BaseService doesn't have `subscribeWithCleanup()` - that's only in BaseOrchestrator. Services must manually track and clean up EventBus subscriptions.

**File:** `src/renderer/container.js`

Find FullscreenService registration (~line 501) and add `settingsService`:
```javascript
container.registerSingleton(
  'fullscreenService',
  function (uiController, eventBus, loggerFactory, settingsService) {
    return new FullscreenService({ uiController, eventBus, loggerFactory, settingsService });
  },
  ['uiController', 'eventBus', 'loggerFactory', 'settingsService']
);
```

### 2.6 CSS Styles (Complete)
**File:** `src/renderer/assets/styles/states.css`

```css
/* Minimalist fullscreen - clean, distraction-free mode */
body.fullscreen-active.minimalist-fullscreen {
  background: #000000;
}

/* Hide decorative elements */
body.fullscreen-active.minimalist-fullscreen::before,
body.fullscreen-active.minimalist-fullscreen::after {
  display: none;
}

body.fullscreen-active.minimalist-fullscreen .prismatic-orbs {
  display: none;
}

/* Stream container - borderless, centered */
body.fullscreen-active.minimalist-fullscreen .stream-container {
  border: none;
  box-shadow: none;
  border-radius: 0;
}

body.fullscreen-active.minimalist-fullscreen .stream-container::before {
  display: none;
}

/* Hide overlay particles */
body.fullscreen-active.minimalist-fullscreen .overlay-particles {
  display: none;
}

/* Hide header and footer */
body.fullscreen-active.minimalist-fullscreen .header,
body.fullscreen-active.minimalist-fullscreen .footer {
  display: none;
}

/* Keep fullscreen exit controls visible */
body.fullscreen-active.minimalist-fullscreen .fullscreen-controls {
  display: block;
}
```

### 2.7 HTML & Component
Add checkbox and bind to service.

---

# Branch 3: `feature/auto-start`

## Files to Modify

| File | Changes |
|------|---------|
| `src/shared/ipc/channels.json` | Add SETTINGS section |
| `src/main/features/settings/settings.service.js` | NEW - main process settings |
| `src/main/features/settings/ipc/settings-ipc.handler.js` | NEW - IPC handler |
| `src/main/container.js` | Register services |
| `src/main/ipc/ipc-handler.registry.js` | Register handler |
| `src/preload/index.js` | Add settingsAPI |
| `src/shared/config/dom-selectors.js` | Add selector |
| `src/renderer/index.html` | Add checkbox |
| `src/renderer/features/settings/ui/settings-menu.component.js` | Bind via IPC |

## Implementation Steps

### 3.1 IPC Channels
**File:** `src/shared/ipc/channels.json`

```json
"SETTINGS": {
  "GET_AUTO_START": "settings:get-auto-start",
  "SET_AUTO_START": "settings:set-auto-start"
}
```

### 3.2 Main Process Settings Service (NEW)
**File:** `src/main/features/settings/settings.service.js`

```javascript
class SettingsService extends BaseService {
  constructor(dependencies) {
    super(dependencies, ['loggerFactory'], 'SettingsService');
    this._settingsPath = path.join(app.getPath('userData'), 'settings.json');
  }

  getAutoStart() {
    return this._loadSettings().autoStart ?? false;
  }

  setAutoStart(enabled) {
    const settings = this._loadSettings();
    settings.autoStart = enabled;
    this._saveSettings(settings);

    app.setLoginItemSettings({
      openAtLogin: enabled,
      openAsHidden: true
    });
  }
}
```

### 3.3 IPC Handler (NEW)
**File:** `src/main/features/settings/ipc/settings-ipc.handler.js`

Handle GET_AUTO_START and SET_AUTO_START.

### 3.4 Container & Registry
Register new service and handler.

### 3.5 Preload Bridge
**File:** `src/preload/index.js`

```javascript
function isValidBoolean(value) {
  return typeof value === 'boolean';
}

const settingsAPI = {
  getAutoStart: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.GET_AUTO_START),
  setAutoStart: (enabled) => {
    if (!isValidBoolean(enabled)) {
      console.warn('settingsAPI.setAutoStart: Invalid enabled value');
      return Promise.resolve({ success: false, error: 'Invalid parameter' });
    }
    return ipcRenderer.invoke(IPC_CHANNELS.SETTINGS.SET_AUTO_START, enabled);
  }
};

contextBridge.exposeInMainWorld('settingsAPI', {
  getAutoStart: settingsAPI.getAutoStart,
  setAutoStart: settingsAPI.setAutoStart
});
```

### 3.6 UI
Add checkbox that calls `window.settingsAPI.setAutoStart()` on change.

---

# Branch 4: `feature/auto-stream`

## Files to Modify

| File | Changes |
|------|---------|
| `src/renderer/infrastructure/events/event-channels.js` | Add `AUTO_STREAM_CHANGED` |
| `src/shared/config/dom-selectors.js` | Add `SETTING_AUTO_STREAM` |
| `src/renderer/features/settings/services/settings.service.js` | Add setting |
| `src/renderer/features/streaming/services/streaming.orchestrator.js` | Handle auto-stream on device connect |
| `src/renderer/container.js` | Update StreamingOrchestrator dependencies |
| `src/renderer/index.html` | Add checkbox |
| `src/renderer/features/settings/ui/settings-menu.component.js` | Bind checkbox |

## Implementation Steps

### 4.1 Event Channel
```javascript
AUTO_STREAM_CHANGED: 'settings:auto-stream-changed'
```

### 4.2 DOM Selector
```javascript
SETTING_AUTO_STREAM: 'settingAutoStream'
```

### 4.3 SettingsService
Add setting (defaults, keys, protected keys, getter/setter).

### 4.4 StreamingOrchestrator (Event-Driven - Keeps AppOrchestrator Thin)
**File:** `src/renderer/features/streaming/services/streaming.orchestrator.js`

**Design:** StreamingOrchestrator already subscribes to device events. Add auto-stream logic there instead of AppOrchestrator.

1. Add `settingsService` dependency to constructor
2. Update device disconnection handler to include auto-stream on connect:

```javascript
constructor(dependencies) {
  super(dependencies, [
    'streamingService',
    'renderPipelineService',
    'streamViewService',
    'audioWarmupService',
    'settingsService',  // ADD
    'appState',
    'eventBus',
    'loggerFactory'
  ], 'StreamingOrchestrator');
}

async onInitialize() {
  this._wireStreamEvents();

  // Subscribe to device status for auto-stream
  this.subscribeWithCleanup({
    [EventChannels.DEVICE.STATUS_CHANGED]: (status) => this._handleDeviceStatusForAutoStream(status)
  });

  await this.renderPipelineService.initialize();
}

_handleDeviceStatusForAutoStream(status) {
  if (status.connected && this.settingsService.getAutoStream()) {
    // StreamingService.start() is idempotent - safe to call if already streaming
    this.start().catch(err => {
      this.logger.error('Auto-stream failed:', err);
    });
  }
}
```

**Why this is better:**
- AppOrchestrator stays thin (no modification needed)
- StreamingOrchestrator already owns streaming logic
- Uses subscribeWithCleanup for proper lifecycle management
- start() is idempotent - handles rapid connect/disconnect safely

### 4.5 Container
**File:** `src/renderer/container.js`

Update StreamingOrchestrator registration to include `settingsService`.

### 4.6 UI
Add checkbox and bind to service.

---

## Tests Per Branch

Each branch includes its own unit tests:

| Branch | Test Files |
|--------|------------|
| `feature/fullscreen-on-startup` | settings.service.test.js, preferences.orchestrator.test.js, display-mode.orchestrator.test.js |
| `feature/minimalist-fullscreen` | settings.service.test.js, fullscreen.service.test.js |
| `feature/auto-start` | main/settings.service.test.js (NEW), settings-menu.test.js |
| `feature/auto-stream` | settings.service.test.js, streaming.orchestrator.test.js |

## Validation

Run after each branch:
```bash
npm run lint && npm run test:run
```
