# Settings and Preferences System

## 1. Overview

The settings system manages user preferences with localStorage persistence and event-driven updates. It provides a centralized way to store and retrieve application settings while maintaining UI-agnostic service logic.

Key capabilities:
- Persistent user preferences via localStorage
- Event-driven updates across the application
- Browser storage abstraction for testability
- Graceful quota management
- Display mode controls (fullscreen, volume, cinematic mode)

## 2. SettingsService

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/features/settings/services/settings.service.js`

Centralized localStorage management for user preferences. 100% UI-agnostic - emits events when settings change.

### Default Settings

```javascript
{
  gameVolume: 70,           // Volume level (0-100)
  statusStripVisible: false, // Status strip visibility
  renderPreset: 'vivid'     // Render preset ID
}
```

### Storage Keys

```javascript
{
  VOLUME: 'gameVolume',
  STATUS_STRIP: 'statusStripVisible',
  RENDER_PRESET: 'renderPreset'
}
```

### Methods

#### loadAllPreferences()
```javascript
loadAllPreferences() → { volume, statusStripVisible }
```
Loads all saved preferences from storage and returns them as an object.

#### getVolume()
```javascript
getVolume() → number (0-100)
```
Retrieves the saved volume preference. Returns default (70) if not set.

#### setVolume(volume)
```javascript
setVolume(volume: number)
```
Saves volume preference with automatic clamping to 0-100 range. Emits `settings:volume-changed` event.

#### getStatusStripVisible()
```javascript
getStatusStripVisible() → boolean
```
Retrieves the saved status strip visibility preference. Returns default (false) if not set.

#### setStatusStripVisible(visible)
```javascript
setStatusStripVisible(visible: boolean)
```
Saves status strip visibility preference. Emits `settings:status-strip-changed` event.

#### getRenderPreset()
```javascript
getRenderPreset() → string
```
Retrieves the saved render preset preference. Returns default ('vivid') if not set.

#### setRenderPreset(presetId)
```javascript
setRenderPreset(presetId: string)
```
Saves render preset preference. Emits `settings:render-preset-changed` event.

### Events Emitted

| Event | Payload | Description |
|-------|---------|-------------|
| `settings:volume-changed` | `number` | Volume changed (0-100) |
| `settings:status-strip-changed` | `boolean` | Status strip visibility changed |
| `settings:render-preset-changed` | `string` | Render preset changed |

## 3. PreferencesOrchestrator

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/features/settings/services/preferences.orchestrator.js`

Coordinates preferences loading and state management on application startup.

### Responsibilities

- Load user preferences from SettingsService
- Apply preferences to AppState
- Publish preference events for UI updates

### Lifecycle

#### onInitialize()
```javascript
async onInitialize()
```
Called during app startup. Loads all preferences and applies them.

#### loadPreferences()
```javascript
async loadPreferences()
```
Internal method that:
1. Loads all preferences via `SettingsService.loadAllPreferences()`
2. Publishes `ui:volume-level` event with volume preference
3. Status strip visibility is applied by SettingsMenuComponent on initialize

### Event Flow

```
App Startup
    ↓
PreferencesOrchestrator.onInitialize()
    ↓
loadPreferences()
    ↓
SettingsService.loadAllPreferences()
    ↓
Publish ui:volume-level event
    ↓
SettingsMenuComponent applies status strip
```

## 4. DisplayModeOrchestrator

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/features/settings/services/display-mode.orchestrator.js`

Coordinates display modes and UI controls including fullscreen, volume slider, and cinematic mode.

### Methods

#### toggleFullscreen()
```javascript
toggleFullscreen()
```
Enters or exits fullscreen mode using the browser Fullscreen API. Publishes `ui:fullscreen-state` event with the new state.

Error handling: Shows status message if fullscreen request fails.

#### toggleVolumeSlider(event)
```javascript
toggleVolumeSlider(e: Event)
```
Toggles volume slider visibility. Stops event propagation to prevent unwanted clicks. Publishes `ui:volume-slider-visible` event.

#### handleVolumeSliderChange()
```javascript
handleVolumeSliderChange()
```
Processes volume slider input:
1. Parses slider value as float
2. Clamps to valid range (0-1 for HTML5 audio/video)
3. Publishes `ui:volume-level` event
4. Persists via `SettingsService.setVolume()`

#### toggleCinematicMode()
```javascript
toggleCinematicMode()
```
Toggles cinematic mode:
1. Updates AppState
2. Publishes `ui:cinematic-mode` event
3. Shows status message

### Events Emitted

| Event | Payload | Description |
|-------|---------|-------------|
| `ui:fullscreen-state` | `{ active: boolean }` | Fullscreen state changed |
| `ui:volume-slider-visible` | `{ visible: boolean }` | Volume slider visibility toggled |
| `ui:volume-level` | `{ level: number }` | Volume level changed (0-1) |
| `ui:cinematic-mode` | `{ enabled: boolean }` | Cinematic mode toggled |
| `ui:status-message` | `{ message: string, type?: string }` | Status message to display |

## 5. SettingsMenuComponent

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/features/settings/ui/settings-menu.js`

UI component for the settings dropdown menu. Follows the VolumeControl pattern for popup behavior.

### Features

- Status strip toggle checkbox
- Disclaimer section (expandable/collapsible)
- External links (GitHub, website, Mod Retro)
- App version display
- Click-outside-to-close behavior
- Escape key handling
- Proper cleanup via DOM listener manager

### Initialization

```javascript
initialize(elements)
```

Receives DOM element references and:
1. Binds event handlers
2. Loads current settings from SettingsService
3. Sets up click-outside-to-close behavior
4. Sets up escape key handler
5. Sets app version from Vite define (`__APP_VERSION__`)

### Public Methods

#### toggle()
```javascript
toggle()
```
Toggles menu visibility between shown and hidden states.

#### show()
```javascript
show()
```
Shows the settings menu:
- Adds `visible` CSS class
- Sets `aria-expanded="true"` on toggle button
- Updates internal state

#### hide()
```javascript
hide()
```
Hides the settings menu:
- Removes `visible` CSS class
- Sets `aria-expanded="false"` on toggle button
- Collapses disclaimer if expanded
- Updates internal state

#### dispose()
```javascript
dispose()
```
Cleans up all DOM event listeners via the DOM listener manager.

### Event Handlers

#### Status Strip Toggle
Listens to checkbox `change` event:
1. Reads checkbox state
2. Calls `SettingsService.setStatusStripVisible()`
3. Applies visibility to footer element

#### Disclaimer Expand/Collapse
Listens to disclaimer button click:
1. Toggles expanded state
2. Updates CSS classes and ARIA attributes

#### External Links
Handles external link clicks:
1. Prevents default behavior
2. Uses Electron's `shell.openExternal` via preload API if available
3. Falls back to `window.open()` with security flags

### Click-Outside Behavior

Listens to document clicks:
- Ignores clicks inside the menu container
- Ignores clicks on the toggle button
- Closes menu for all other clicks

### Escape Key Handling

Listens to document keydown events:
- Closes menu when Escape key is pressed while visible

## 6. StorageService

**Location:** `/Users/josstei/Development/prismgb-workspace/prismgb-app/src/infrastructure/browser/storage.service.js`

Browser storage abstraction layer that provides a testable interface for localStorage operations.

### Features

- Graceful error handling
- Quota exceeded management
- Automatic cleanup on storage full
- Testable interface

### Methods

#### getItem(key)
```javascript
getItem(key: string) → string | null
```
Retrieves item from localStorage with error handling.

#### setItem(key, value)
```javascript
setItem(key: string, value: string) → boolean
```
Stores item in localStorage:
- Returns `true` on success
- Returns `false` on quota exceeded (even after cleanup)
- Automatically attempts cleanup on quota error

#### removeItem(key)
```javascript
removeItem(key: string)
```
Removes item from localStorage with error handling.

### Quota Management

When storage quota is exceeded:
1. Logs warning
2. Calls `_cleanupOldEntries()`
3. Retries the set operation
4. Returns `false` if still failing

The cleanup strategy:
- Skips keys starting with `_critical_`
- Removes half of non-critical entries
- Handles removal errors gracefully

## 7. Data Flow Diagrams

### Settings Load on Startup

```
App Startup
    ↓
PreferencesOrchestrator.onInitialize()
    ↓
SettingsService.loadAllPreferences()
    ↓
StorageService.getItem('gameVolume')
StorageService.getItem('statusStripVisible')
    ↓
Publish ui:volume-level event
    ↓
SettingsMenuComponent._loadCurrentSettings()
    ↓
Apply to UI elements
```

### User Changes Volume

```
User adjusts volume slider
    ↓
DisplayModeOrchestrator.handleVolumeSliderChange()
    ↓
Parse and clamp value
    ↓
Publish ui:volume-level event
    ↓
SettingsService.setVolume()
    ↓
StorageService.setItem('gameVolume', value)
    ↓
Publish settings:volume-changed event
```

### User Toggles Status Strip

```
User clicks checkbox in settings menu
    ↓
SettingsMenuComponent handler
    ↓
SettingsService.setStatusStripVisible(visible)
    ↓
StorageService.setItem('statusStripVisible', visible)
    ↓
Publish settings:status-strip-changed event
    ↓
SettingsMenuComponent._applyStatusStripVisibility()
    ↓
Add/remove CSS class on footer
```

## 8. Event Channels

Settings-related events are defined in `EventChannels`:

```javascript
EventChannels.SETTINGS = {
  VOLUME_CHANGED: 'settings:volume-changed',
  STATUS_STRIP_CHANGED: 'settings:status-strip-changed',
  RENDER_PRESET_CHANGED: 'settings:render-preset-changed'
}

EventChannels.UI = {
  FULLSCREEN_STATE: 'ui:fullscreen-state',
  VOLUME_SLIDER_VISIBLE: 'ui:volume-slider-visible',
  VOLUME_LEVEL: 'ui:volume-level',
  CINEMATIC_MODE: 'ui:cinematic-mode',
  STATUS_MESSAGE: 'ui:status-message'
}
```

## 9. Testing Considerations

The settings system is designed for testability:

1. **StorageService** - Abstracts localStorage for easy mocking
2. **SettingsService** - UI-agnostic, pure business logic
3. **Event-driven** - Easy to verify event emissions
4. **Dependency injection** - All dependencies injected via constructor

Example test structure:

```javascript
describe('SettingsService', () => {
  it('should save and retrieve volume preference', () => {
    const mockStorage = { setItem: vi.fn(), getItem: vi.fn() };
    const service = new SettingsService({ storageService: mockStorage });

    service.setVolume(85);

    expect(mockStorage.setItem).toHaveBeenCalledWith('gameVolume', '85');
  });
});
```

## 10. Key Files Reference

| File | Description |
|------|-------------|
| `src/features/settings/services/settings.service.js` | Core settings service with localStorage management |
| `src/features/settings/services/preferences.orchestrator.js` | Coordinates preferences loading on startup |
| `src/features/settings/services/display-mode.orchestrator.js` | Manages display modes and UI controls |
| `src/features/settings/ui/settings-menu.js` | Settings dropdown menu component |
| `src/infrastructure/browser/storage.service.js` | Browser storage abstraction |
| `src/infrastructure/events/event-channels.js` | Event channel definitions |
| `src/shared/config/dom-selectors.js` | DOM element selector constants |
| `src/shared/config/css-classes.js` | CSS class name constants |

## 11. Adding New Settings

To add a new setting to the system:

1. **Update SettingsService defaults:**
   ```javascript
   this.defaults = {
     gameVolume: 70,
     statusStripVisible: false,
     renderPreset: 'vivid',
     newSetting: 'defaultValue' // Add here
   };
   ```

2. **Add storage key:**
   ```javascript
   this.keys = {
     VOLUME: 'gameVolume',
     STATUS_STRIP: 'statusStripVisible',
     RENDER_PRESET: 'renderPreset',
     NEW_SETTING: 'newSetting' // Add here
   };
   ```

3. **Add getter/setter methods:**
   ```javascript
   getNewSetting() {
     const saved = this.storageService?.getItem(this.keys.NEW_SETTING);
     return saved !== null ? saved : this.defaults.newSetting;
   }

   setNewSetting(value) {
     this.storageService?.setItem(this.keys.NEW_SETTING, value);
     this.eventBus.publish(EventChannels.SETTINGS.NEW_SETTING_CHANGED, value);
   }
   ```

4. **Add event channel:**
   ```javascript
   // In event-channels.js
   EventChannels.SETTINGS = {
     // ...
     NEW_SETTING_CHANGED: 'settings:new-setting-changed'
   };
   ```

5. **Update UI component** (if applicable) to load and display the setting

6. **Update PreferencesOrchestrator** to load the setting on startup
