# Auto-Start on Login — Design Document

**Date**: 2026-02-07
**Branch**: `feature/auto_start`
**Status**: Draft

## Overview

Add a "Launch on startup" toggle to the settings menu that registers PrismGB as a login item on macOS, Windows, and Linux. When enabled, PrismGB starts automatically when the OS boots, running silently in the system tray with no visible window or taskbar entry.

## Approach

Use Electron's built-in `app.setLoginItemSettings()` API. No third-party dependencies.

- **macOS**: Registers a Login Item via `openAtLogin`, uses `openAsHidden: true` for hidden launch
- **Windows**: Writes a Registry entry, passes `--hidden` CLI argument for hidden launch
- **Linux**: Creates a `.desktop` file in `~/.config/autostart/`, passes `--hidden` CLI argument for hidden launch

## Architecture

### Main Process

#### LoginItemService

**Location**: `src/main/infrastructure/platform/login-item.service.ts`

Wraps Electron's login item API behind a clean interface. Extends `BaseService`.

**Dependencies**: `loggerFactory`

**Methods**:
- `setEnabled(enabled: boolean)` — Calls `app.setLoginItemSettings()` with platform-aware options:
  - macOS: `{ openAtLogin: enabled, openAsHidden: true }`
  - Windows/Linux: `{ openAtLogin: enabled, args: ['--hidden'] }`
- `isEnabled(): boolean` — Returns `app.getLoginItemSettings().openAtLogin`

#### IPC Handler

**Location**: `src/main/ipc/handlers/login-item.handler.ts`

Two channels:
- `login-item:get` — Returns `loginItemService.isEnabled()`
- `login-item:set` — Accepts boolean, calls `loginItemService.setEnabled(enabled)`

Registered in `handler-registry.ts`. Receives `LoginItemService` as a dependency.

#### Hidden Launch Detection

**Location**: `src/main/application/app.orchestrator.ts` and `src/main/index.ts`

Determines whether the app was launched hidden:
- macOS: `app.getLoginItemSettings().wasOpenedAsHidden`
- Windows/Linux: `process.argv.includes('--hidden')`

The hidden flag is passed to `WindowService` during initialization.

#### WindowService Changes

**Location**: `src/main/infrastructure/window/window.service.ts`

When the hidden flag is active, `WindowService` skips the `show()` call on `ready-to-show`. The `BrowserWindow` is created with `show: false` (existing behavior), but remains hidden until the user clicks the tray icon.

The tray click handler already calls `windowService.showWindow()`, so no tray changes are needed.

### IPC Layer

#### Channel Definitions

**Location**: `shared/ipc/channels.json`

```json
{
  "loginItem": {
    "get": "login-item:get",
    "set": "login-item:set"
  }
}
```

#### Preload Bridge

**Location**: `src/preload/index.js`

Exposes `window.loginItemAPI`:
- `get()` — Invokes `login-item:get`, returns `Promise<boolean>`
- `set(enabled: boolean)` — Invokes `login-item:set`

Follows the same `contextBridge.exposeInMainWorld()` pattern as `windowAPI`, `shellAPI`, etc.

### Renderer

#### Storage Key

**Location**: `src/shared/config/storage-keys.config.ts`

```typescript
LAUNCH_ON_LOGIN: 'launchOnLogin'
```

Used as a renderer-side cache. The OS state is the source of truth.

#### SettingsService

**Location**: `src/renderer/infrastructure/services/settings/settings.service.ts`

- `getLaunchOnLogin(): Promise<boolean>` — Calls `window.loginItemAPI.get()`. Falls back to localStorage cache if IPC fails.
- `setLaunchOnLogin(enabled: boolean): void` — Calls `window.loginItemAPI.set(enabled)`, caches in localStorage, logs the change.

The getter is async (unlike other settings) because it queries the main process for OS-level state.

#### UI Toggle

**Location**: `src/renderer/presentation/features/settings/settings-menu.template.js`

```html
<label class="settings-item toggle">
  <span>Launch on startup</span>
  <input type="checkbox" id="settingLaunchOnLogin">
  <span class="toggle-slider"></span>
</label>
```

Placed at the top of the settings list — system-level behavior above streaming/display settings.

#### Component Wiring

**Location**: `src/renderer/presentation/features/settings/settings-menu.component.js`

- `initialize()` — Stores checkbox element reference
- `_bindEvents()` — On `change`, calls `settingsService.setLaunchOnLogin(checked)`
- `_loadCurrentSettings()` — Awaits the async getter, sets `checked` state

#### DOM Selector

**Location**: `src/renderer/presentation/config/dom-selectors.config.ts`

```typescript
SETTING_LAUNCH_ON_LOGIN: 'settingLaunchOnLogin'
```

Wired in the DOM bindings utility.

#### No Event Channel Needed

This setting does not trigger reactive behavior elsewhere in the renderer. It is a fire-and-forget to the main process.

### Display Mode Interaction

**Location**: `src/renderer/application/orchestrators/display-mode.orchestrator.ts`

When the app starts hidden, "Fullscreen on startup" must defer until the window is actually shown (tray click). The `_applyStartupBehaviors()` method checks whether the window is currently visible before entering fullscreen.

## Hidden Launch Flow

1. OS starts PrismGB with `--hidden` arg (Windows/Linux) or as a hidden Login Item (macOS)
2. `main/index.ts` determines the hidden flag via `wasOpenedAsHidden` or `process.argv`
3. `AppOrchestrator.initialize()` passes the flag to `WindowService`
4. `WindowService.createWindow()` creates the `BrowserWindow` with `show: false` and skips `show()` on `ready-to-show`
5. `TrayService.createTray()` creates the system tray icon as usual
6. The renderer process loads normally (ready for instant display)
7. User clicks tray icon — `windowService.showWindow()` brings the app to the foreground

## Source of Truth

The OS is the source of truth for login item state. A user can disable the login item from macOS System Settings or Windows Task Manager outside of PrismGB. The renderer queries the main process (`loginItemAPI.get()`) when the settings panel loads, ensuring the toggle always reflects reality. localStorage serves only as a fallback cache.

## File Summary

| File | Action | Purpose |
|------|--------|---------|
| `src/main/infrastructure/platform/login-item.service.ts` | Create | LoginItemService wrapping Electron API |
| `src/main/ipc/handlers/login-item.handler.ts` | Create | IPC handler for get/set |
| `src/main/ipc/handler-registry.ts` | Edit | Register the new handler |
| `src/main/application/container.ts` | Edit | Register LoginItemService in DI |
| `src/main/application/app.orchestrator.ts` | Edit | Hidden launch flag detection and propagation |
| `src/main/infrastructure/window/window.service.ts` | Edit | Suppress show on hidden launch |
| `src/shared/ipc/channels.json` | Edit | Add login-item channels |
| `src/shared/config/storage-keys.config.ts` | Edit | Add LAUNCH_ON_LOGIN key |
| `src/preload/index.js` | Edit | Expose loginItemAPI |
| `src/renderer/infrastructure/services/settings/settings.service.ts` | Edit | Add getter/setter |
| `src/renderer/presentation/features/settings/settings-menu.template.js` | Edit | Add toggle |
| `src/renderer/presentation/features/settings/settings-menu.component.js` | Edit | Wire toggle to service |
| `src/renderer/presentation/config/dom-selectors.config.ts` | Edit | Add selector |
| `src/renderer/application/orchestrators/display-mode.orchestrator.ts` | Edit | Defer fullscreen when hidden |
| `tests/unit/main/platform/login-item.service.test.js` | Create | Service tests |
| `tests/unit/main/ipc/login-item.handler.test.js` | Create | Handler tests |
| `tests/unit/features/settings/services/settings.service.test.js` | Edit | Add login setting tests |
| `tests/unit/features/settings/ui/settings-menu.test.js` | Edit | Add toggle tests |

**6 new files** (including tests), **12 edits** to existing files.

## Testing Strategy

**Main process:**
- `LoginItemService` — Mock `electron.app`. Verify platform-aware arguments. Verify `isEnabled()` returns OS state.
- `login-item.handler` — Verify IPC delegates to service.
- Hidden launch detection — Verify `process.argv` parsing and `wasOpenedAsHidden` check. Verify `WindowService` suppresses `show()`.

**Renderer:**
- `SettingsService` — Test IPC bridge call and localStorage fallback. Test setter calls IPC and caches.
- `SettingsMenuComponent` — Test toggle binds to service. Test async load. Test checked state reflects value.

**Estimated test count**: ~15-20 new tests.
