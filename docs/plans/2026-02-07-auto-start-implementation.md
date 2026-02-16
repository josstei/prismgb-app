# Auto-Start on Login — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a "Launch on startup" toggle that registers PrismGB as an OS login item, starting minimized to system tray.

**Architecture:** Main process `LoginItemService` wraps Electron's `app.setLoginItemSettings()`. IPC handler exposes get/set to renderer via preload bridge. `WindowService` accepts a hidden launch flag to suppress window display on startup. Settings UI adds a toggle wired through `SettingsService` to the IPC bridge.

**Tech Stack:** Electron 28 (`app.setLoginItemSettings`), Vitest, happy-dom

**Design Doc:** `docs/plans/2026-02-07-auto-start-design.md`

---

## Task 1: IPC Channel Definitions + Storage Key

**Files:**
- Modify: `src/shared/ipc/channels.json:1-43`
- Modify: `src/shared/config/storage-keys.config.ts:1-38`
- Modify: `src/shared/ipc/preload-api.contract.ts:126-154`

**Step 1: Add LOGIN_ITEM channels to channels.json**

Add after the `PERFORMANCE` block (line 33):

```json
"LOGIN_ITEM": {
  "GET": "login-item:get",
  "SET": "login-item:set"
},
```

**Step 2: Add storage key**

In `storage-keys.config.ts`, add to `SettingsStorageKeys` (after line 15):

```typescript
LAUNCH_ON_LOGIN: 'launchOnLogin'
```

Add to `PROTECTED_STORAGE_KEYS` array (after line 36):

```typescript
SettingsStorageKeys.LAUNCH_ON_LOGIN
```

**Step 3: Add IPC contract types**

In `preload-api.contract.ts`, add after `ShellOpenExternalResponse` (line 128):

```typescript
export type LoginItemGetResponse = boolean;
export type LoginItemSetResponse = IpcActionResult;
```

**Step 4: Verify lint passes**

Run: `npm run lint`
Expected: PASS (no errors)

**Step 5: Commit**

```bash
git add src/shared/ipc/channels.json src/shared/config/storage-keys.config.ts src/shared/ipc/preload-api.contract.ts
git commit -m "feat(auto-start): add IPC channels, storage key, and contract types"
```

---

## Task 2: LoginItemService

**Files:**
- Create: `src/main/infrastructure/platform/login-item.service.ts`
- Modify: `src/main/infrastructure/platform/index.ts:1-9`
- Create: `tests/unit/main/infrastructure/platform/login-item.service.test.js`

**Step 1: Write the failing tests**

Create `tests/unit/main/infrastructure/platform/login-item.service.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mockApp = {
  setLoginItemSettings: vi.fn(),
  getLoginItemSettings: vi.fn(() => ({ openAtLogin: false, wasOpenedAsHidden: false }))
};

vi.mock('electron', () => ({
  app: mockApp
}));

import { LoginItemService } from '@main/infrastructure/platform/login-item.service.js';

describe('LoginItemService', () => {
  let service;
  let mockLoggerFactory;
  let originalPlatform;

  beforeEach(() => {
    vi.clearAllMocks();
    originalPlatform = process.platform;

    mockLoggerFactory = {
      create: () => ({
        info: vi.fn(),
        debug: vi.fn(),
        warn: vi.fn(),
        error: vi.fn()
      })
    };

    service = new LoginItemService({ loggerFactory: mockLoggerFactory });
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
  });

  describe('isEnabled', () => {
    it('should return false when login item is not set', () => {
      mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: false });
      expect(service.isEnabled()).toBe(false);
    });

    it('should return true when login item is set', () => {
      mockApp.getLoginItemSettings.mockReturnValue({ openAtLogin: true });
      expect(service.isEnabled()).toBe(true);
    });
  });

  describe('setEnabled', () => {
    it('should enable login item on macOS with openAsHidden', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      service.setEnabled(true);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        openAsHidden: true
      });
    });

    it('should enable login item on Windows with --hidden arg', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      service.setEnabled(true);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden']
      });
    });

    it('should enable login item on Linux with --hidden arg', () => {
      Object.defineProperty(process, 'platform', { value: 'linux' });
      service.setEnabled(true);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith({
        openAtLogin: true,
        args: ['--hidden']
      });
    });

    it('should disable login item', () => {
      service.setEnabled(false);

      expect(mockApp.setLoginItemSettings).toHaveBeenCalledWith(
        expect.objectContaining({ openAtLogin: false })
      );
    });
  });

  describe('wasLaunchedAsHidden', () => {
    it('should return true on macOS when wasOpenedAsHidden is true', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockApp.getLoginItemSettings.mockReturnValue({
        openAtLogin: true,
        wasOpenedAsHidden: true
      });

      expect(service.wasLaunchedAsHidden()).toBe(true);
    });

    it('should return false on macOS when wasOpenedAsHidden is false', () => {
      Object.defineProperty(process, 'platform', { value: 'darwin' });
      mockApp.getLoginItemSettings.mockReturnValue({
        openAtLogin: true,
        wasOpenedAsHidden: false
      });

      expect(service.wasLaunchedAsHidden()).toBe(false);
    });

    it('should return true on Windows when --hidden arg is present', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const originalArgv = process.argv;
      process.argv = ['electron', '.', '--hidden'];

      expect(service.wasLaunchedAsHidden()).toBe(true);

      process.argv = originalArgv;
    });

    it('should return false on Windows when --hidden arg is absent', () => {
      Object.defineProperty(process, 'platform', { value: 'win32' });
      const originalArgv = process.argv;
      process.argv = ['electron', '.'];

      expect(service.wasLaunchedAsHidden()).toBe(false);

      process.argv = originalArgv;
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/main/infrastructure/platform/login-item.service.test.js`
Expected: FAIL — `LoginItemService` does not exist

**Step 3: Write the implementation**

Create `src/main/infrastructure/platform/login-item.service.ts`:

```typescript
import { app } from 'electron';
import { BaseService } from '@shared/base/service.base.js';

interface LoginItemServiceDependencies {
  loggerFactory: {
    create: (name: string) => {
      info: (message: string) => void;
      debug: (message: string) => void;
      warn: (message: string) => void;
      error: (message: string) => void;
    };
  };
}

class LoginItemService extends BaseService {

  constructor(dependencies: LoginItemServiceDependencies) {
    super(dependencies, ['loggerFactory'], 'LoginItemService');
  }

  setEnabled(enabled: boolean): void {
    const settings = process.platform === 'darwin'
      ? { openAtLogin: enabled, openAsHidden: true }
      : { openAtLogin: enabled, args: ['--hidden'] };

    app.setLoginItemSettings(settings);
    this.logger.info(`Login item ${enabled ? 'enabled' : 'disabled'} (platform: ${process.platform})`);
  }

  isEnabled(): boolean {
    return app.getLoginItemSettings().openAtLogin;
  }

  wasLaunchedAsHidden(): boolean {
    if (process.platform === 'darwin') {
      return app.getLoginItemSettings().wasOpenedAsHidden ?? false;
    }
    return process.argv.includes('--hidden');
  }
}

export { LoginItemService };
export type { LoginItemServiceDependencies };
```

**Step 4: Update barrel export**

In `src/main/infrastructure/platform/index.ts`, add:

```typescript
export { LoginItemService, type LoginItemServiceDependencies } from './login-item.service.js';
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/main/infrastructure/platform/login-item.service.test.js`
Expected: PASS

**Step 6: Commit**

```bash
git add src/main/infrastructure/platform/login-item.service.ts src/main/infrastructure/platform/index.ts tests/unit/main/infrastructure/platform/login-item.service.test.js
git commit -m "feat(auto-start): implement LoginItemService with platform-aware login item management"
```

---

## Task 3: IPC Handler

**Files:**
- Create: `src/main/ipc/handlers/login-item.handler.ts`
- Modify: `src/main/ipc/handlers/index.ts:1-26`
- Modify: `src/main/ipc/ipc-handler.registry.ts:1-146`
- Create: `tests/unit/main/ipc/handlers/login-item.handler.test.js`

**Step 1: Write the failing tests**

Create `tests/unit/main/ipc/handlers/login-item.handler.test.js`:

```javascript
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('electron', () => ({
  app: {
    getLoginItemSettings: vi.fn(() => ({ openAtLogin: false })),
    setLoginItemSettings: vi.fn()
  }
}));

vi.mock('@shared/ipc/channels.config.js', () => ({
  channels: {
    LOGIN_ITEM: {
      GET: 'login-item:get',
      SET: 'login-item:set'
    }
  }
}));

import { registerLoginItemHandlers } from '@main/ipc/handlers/login-item.handler.js';

describe('LoginItem IPC Handlers', () => {
  let mockRegisterHandler;
  let mockLoginItemService;
  let mockLogger;
  let handlers;

  beforeEach(() => {
    handlers = {};
    mockRegisterHandler = vi.fn((channel, handler) => {
      handlers[channel] = handler;
    });

    mockLoginItemService = {
      isEnabled: vi.fn(() => false),
      setEnabled: vi.fn()
    };

    mockLogger = {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    };

    registerLoginItemHandlers({
      registerHandler: mockRegisterHandler,
      loginItemService: mockLoginItemService,
      logger: mockLogger
    });
  });

  it('should register two handlers', () => {
    expect(mockRegisterHandler).toHaveBeenCalledTimes(2);
  });

  describe('login-item:get', () => {
    it('should return login item state', async () => {
      mockLoginItemService.isEnabled.mockReturnValue(true);

      const result = await handlers['login-item:get']({});
      expect(result).toBe(true);
      expect(mockLoginItemService.isEnabled).toHaveBeenCalled();
    });
  });

  describe('login-item:set', () => {
    it('should enable login item', async () => {
      const result = await handlers['login-item:set']({}, true);

      expect(mockLoginItemService.setEnabled).toHaveBeenCalledWith(true);
      expect(result).toEqual({ success: true });
    });

    it('should disable login item', async () => {
      const result = await handlers['login-item:set']({}, false);

      expect(mockLoginItemService.setEnabled).toHaveBeenCalledWith(false);
      expect(result).toEqual({ success: true });
    });
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/main/ipc/handlers/login-item.handler.test.js`
Expected: FAIL — module not found

**Step 3: Write the handler**

Create `src/main/ipc/handlers/login-item.handler.ts`:

```typescript
import type { IpcMainInvokeEvent } from 'electron';
import type { Logger } from '@main/infrastructure/logging/logger.interface.js';
import { channels as IPC_CHANNELS } from '@shared/ipc/channels.config.js';
import type { LoginItemSetResponse } from '@shared/ipc/preload-api.contract.js';

interface LoginItemService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}

interface RegisterHandler {
  (channel: string, handler: (event: IpcMainInvokeEvent, ...args: unknown[]) => Promise<unknown> | unknown): void;
}

export interface LoginItemHandlerDependencies {
  registerHandler: RegisterHandler;
  loginItemService: LoginItemService;
  logger: Logger;
}

export function registerLoginItemHandlers({ registerHandler, loginItemService, logger }: LoginItemHandlerDependencies): void {
  registerHandler(IPC_CHANNELS.LOGIN_ITEM.GET, async () => {
    return loginItemService.isEnabled();
  });

  registerHandler(IPC_CHANNELS.LOGIN_ITEM.SET, async (event: IpcMainInvokeEvent, enabled: boolean) => {
    logger.debug(`Setting login item: ${enabled}`);
    loginItemService.setEnabled(enabled);
    return { success: true } as LoginItemSetResponse;
  });
}
```

**Step 4: Update barrel export**

In `src/main/ipc/handlers/index.ts`, add:

```typescript
export { registerLoginItemHandlers } from './login-item.handler.js';
export type { LoginItemHandlerDependencies } from './login-item.handler.js';
```

**Step 5: Wire into IpcHandlerRegistry**

In `src/main/ipc/ipc-handler.registry.ts`:

Add to imports (after line 24):
```typescript
registerLoginItemHandlers
```

Add `LoginItemService` interface (after line 53):
```typescript
interface LoginItemService {
  isEnabled(): boolean;
  setEnabled(enabled: boolean): void;
}
```

Add to `IpcHandlerRegistryDependencies` (after line 60):
```typescript
loginItemService: LoginItemService;
```

Add to constructor required deps array (line 72) — add `'loginItemService'` after `'transcodeService'`.

Add property assignment in constructor (after line 76):
```typescript
this.loginItemService = dependencies.loginItemService;
```

Add private field (after line 68):
```typescript
private readonly loginItemService: LoginItemService;
```

Add handler registration in `registerHandlers()` (after line 125):
```typescript
registerLoginItemHandlers({
  registerHandler: this._registerHandler.bind(this),
  loginItemService: this.loginItemService,
  logger: this.logger
});
```

**Step 6: Run tests to verify they pass**

Run: `npx vitest run tests/unit/main/ipc/handlers/login-item.handler.test.js`
Expected: PASS

**Step 7: Commit**

```bash
git add src/main/ipc/handlers/login-item.handler.ts src/main/ipc/handlers/index.ts src/main/ipc/ipc-handler.registry.ts tests/unit/main/ipc/handlers/login-item.handler.test.js
git commit -m "feat(auto-start): add login-item IPC handler and wire into registry"
```

---

## Task 4: DI Container + Hidden Launch in AppOrchestrator

**Files:**
- Modify: `src/main/application/container.ts:1-135`
- Modify: `src/main/application/app.orchestrator.ts:1-185`

**Step 1: Register LoginItemService in container**

In `src/main/application/container.ts`:

Add import (after line 22):
```typescript
import { LoginItemService } from '@main/infrastructure/platform/index.js';
```

Add to `ContainerDependencies` interface (after line 51):
```typescript
loginItemService: LoginItemService;
```

Add registration in `createAppContainer()` — in the core services block (after line 88):
```typescript
loginItemService: asClass(LoginItemService).singleton(),
```

**Step 2: Wire LoginItemService into AppOrchestrator**

In `src/main/application/app.orchestrator.ts`:

Add import (after line 17):
```typescript
import type { LoginItemService } from '@main/infrastructure/platform/index.js';
```

Add private field (after line 45):
```typescript
private _loginItemService: LoginItemService | null = null;
```

In `onInitialize()`, resolve the service (after line 74):
```typescript
this._loginItemService = this.container.resolve('loginItemService');
```

**Step 3: Add hidden launch detection**

In `onInitialize()`, after resolving `_loginItemService` and before creating the window (before line 110 `this._windowService.createWindow()`):

```typescript
const isHiddenLaunch = this._loginItemService.wasLaunchedAsHidden();
if (isHiddenLaunch) {
  this.logger.info('Hidden launch detected - starting in system tray');
}
```

Change the `createWindow()` call (line 110) to:
```typescript
this._windowService.createWindow({ hidden: isHiddenLaunch });
```

In `onCleanup()`, add to null assignments (after line 170):
```typescript
this._loginItemService = null;
```

**Step 4: Verify lint passes**

Run: `npm run lint`
Expected: PASS

**Step 5: Commit**

```bash
git add src/main/application/container.ts src/main/application/app.orchestrator.ts
git commit -m "feat(auto-start): register LoginItemService in DI and detect hidden launch"
```

---

## Task 5: WindowService Hidden Launch Support

**Files:**
- Modify: `src/main/infrastructure/window/window.service.ts:1-294`

**Step 1: Add CreateWindowOptions interface**

After line 42 (`AppWithQuitFlag`), add:

```typescript
interface CreateWindowOptions {
  hidden?: boolean;
}
```

**Step 2: Update createWindow signature**

Change `createWindow()` (line 60) to accept options:

```typescript
createWindow(options: CreateWindowOptions = {}): BrowserWindow {
```

**Step 3: Store hidden flag**

Add private field (after line 51):
```typescript
private _isHiddenLaunch: boolean = false;
```

At the start of `createWindow()`, after the existing window check (after line 64):
```typescript
this._isHiddenLaunch = options.hidden ?? false;
```

**Step 4: Conditionally show window on ready-to-show**

Replace the `ready-to-show` handler (lines 153-155):

```typescript
this.mainWindow.once('ready-to-show', () => {
  if (!this._isHiddenLaunch) {
    this._forceWindowToForeground();
  } else {
    this.logger.info('Window created in hidden mode - awaiting tray click');
  }
});
```

**Step 5: Reset hidden flag when window is shown via tray**

In `showWindow()` (line 239), add at the start:
```typescript
this._isHiddenLaunch = false;
```

**Step 6: Verify lint passes**

Run: `npm run lint`
Expected: PASS

**Step 7: Commit**

```bash
git add src/main/infrastructure/window/window.service.ts
git commit -m "feat(auto-start): add hidden launch support to WindowService"
```

---

## Task 6: Preload Bridge

**Files:**
- Modify: `src/preload/index.js:1-156`

**Step 1: Add loginItemAPI**

After the `gpuAPI` definition (after line 83), add:

```javascript
const loginItemAPI = {
  get: async () => {
    try {
      return await ipcRenderer.invoke(IPC_CHANNELS.LOGIN_ITEM.GET);
    } catch (error) {
      console.warn('loginItemAPI.get: IPC error:', error);
      return false;
    }
  },
  set: (enabled) => {
    if (typeof enabled !== 'boolean') {
      console.warn('loginItemAPI.set: Invalid parameter - expected boolean');
      return Promise.resolve({ success: false, error: 'Invalid parameter' });
    }
    return ipcRenderer.invoke(IPC_CHANNELS.LOGIN_ITEM.SET, enabled);
  }
};
```

**Step 2: Expose via contextBridge**

After the `gpuAPI` exposure (after line 144), add:

```javascript
contextBridge.exposeInMainWorld('loginItemAPI', {
  get: loginItemAPI.get,
  set: loginItemAPI.set
});
```

**Step 3: Verify lint passes**

Run: `npm run lint`
Expected: PASS

**Step 4: Commit**

```bash
git add src/preload/index.js
git commit -m "feat(auto-start): expose loginItemAPI via preload bridge"
```

---

## Task 7: Renderer SettingsService

**Files:**
- Modify: `src/renderer/infrastructure/services/settings/settings.service.ts:1-264`
- Modify: `tests/unit/features/settings/services/settings.service.test.js`

**Step 1: Write the failing tests**

Add to `tests/unit/features/settings/services/settings.service.test.js`, after the last `describe` block:

```javascript
describe('getLaunchOnLogin', () => {
  it('should call loginItemAPI.get when available', async () => {
    window.loginItemAPI = { get: vi.fn(() => Promise.resolve(true)), set: vi.fn() };

    const result = await service.getLaunchOnLogin();
    expect(result).toBe(true);
    expect(window.loginItemAPI.get).toHaveBeenCalled();

    delete window.loginItemAPI;
  });

  it('should fall back to localStorage when loginItemAPI is unavailable', async () => {
    localStorageMock.store['launchOnLogin'] = 'true';

    const result = await service.getLaunchOnLogin();
    expect(result).toBe(true);
  });

  it('should return false by default', async () => {
    const result = await service.getLaunchOnLogin();
    expect(result).toBe(false);
  });
});

describe('setLaunchOnLogin', () => {
  it('should call loginItemAPI.set when available', async () => {
    window.loginItemAPI = { get: vi.fn(), set: vi.fn(() => Promise.resolve({ success: true })) };

    await service.setLaunchOnLogin(true);
    expect(window.loginItemAPI.set).toHaveBeenCalledWith(true);

    delete window.loginItemAPI;
  });

  it('should cache value in localStorage', async () => {
    window.loginItemAPI = { get: vi.fn(), set: vi.fn(() => Promise.resolve({ success: true })) };

    await service.setLaunchOnLogin(true);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('launchOnLogin', 'true');

    delete window.loginItemAPI;
  });

  it('should log the change', async () => {
    window.loginItemAPI = { get: vi.fn(), set: vi.fn(() => Promise.resolve({ success: true })) };

    await service.setLaunchOnLogin(true);
    expect(mockLogger.debug).toHaveBeenCalledWith('Launch on login enabled');

    delete window.loginItemAPI;
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/unit/features/settings/services/settings.service.test.js`
Expected: FAIL — methods not found

**Step 3: Add getter/setter to SettingsService**

In `src/renderer/infrastructure/services/settings/settings.service.ts`:

Add default (after line 32):
```javascript
launchOnLogin: false
```

Add methods after `setAutoStreamOnConnect` (after line 229):

```javascript
  /**
   * Get launch on login preference
   * Queries main process for OS-level state, falls back to localStorage cache
   * @returns {Promise<boolean>} True if launch on login is enabled
   */
  async getLaunchOnLogin() {
    try {
      if (window.loginItemAPI?.get) {
        const enabled = await window.loginItemAPI.get();
        this.storageService?.setItem(this.keys.LAUNCH_ON_LOGIN, enabled.toString());
        return enabled;
      }
    } catch (error) {
      this.logger.warn('Failed to query login item state from main process');
    }

    const saved = this.storageService?.getItem(this.keys.LAUNCH_ON_LOGIN);
    return saved !== null ? saved === 'true' : this.defaults.launchOnLogin;
  }

  /**
   * Set launch on login preference
   * Updates OS-level login item via main process and caches locally
   * @param {boolean} enabled - Enable launch on login
   */
  async setLaunchOnLogin(enabled) {
    try {
      if (window.loginItemAPI?.set) {
        await window.loginItemAPI.set(enabled);
      }
    } catch (error) {
      this.logger.error('Failed to set login item state in main process');
    }

    this.storageService?.setItem(this.keys.LAUNCH_ON_LOGIN, enabled.toString());
    this.logger.debug(`Launch on login ${enabled ? 'enabled' : 'disabled'}`);
  }
```

**Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/unit/features/settings/services/settings.service.test.js`
Expected: PASS

**Step 5: Commit**

```bash
git add src/renderer/infrastructure/services/settings/settings.service.ts tests/unit/features/settings/services/settings.service.test.js
git commit -m "feat(auto-start): add launch-on-login getter/setter to SettingsService"
```

---

## Task 8: UI Toggle + DOM Wiring

**Files:**
- Modify: `src/renderer/presentation/config/dom-selectors.config.ts:50-62`
- Modify: `src/renderer/presentation/primitives/dom-bindings.utils.js:71-91`
- Modify: `src/renderer/presentation/features/settings/settings-menu.template.js:18-28`
- Modify: `src/renderer/presentation/features/settings/settings-menu.component.js`
- Modify: `tests/unit/features/settings/ui/settings-menu.test.js`

**Step 1: Add DOM selector**

In `dom-selectors.config.ts`, add after `SETTING_AUTO_STREAM_ON_CONNECT` (line 57):

```typescript
SETTING_LAUNCH_ON_LOGIN: 'settingLaunchOnLogin',
```

**Step 2: Add DOM binding**

In `dom-bindings.utils.js`, add to the `settings` block (after line 76):

```javascript
settingLaunchOnLogin: DOMSelectors.SETTING_LAUNCH_ON_LOGIN,
```

**Step 3: Add toggle to template**

In `settings-menu.template.js`, insert before the "Show Status Bar" toggle (before line 19, inside `<section class="settings-section settings-main">`):

```html
          <label class="settings-item toggle settings-item-with-hint">
            <span class="settings-item-text">
              <span class="settings-item-title">Launch on startup</span>
              <span class="settings-item-hint" id="launchOnLoginHint">
                Start PrismGB when your computer turns on.
              </span>
            </span>
            <input type="checkbox" id="settingLaunchOnLogin" aria-describedby="launchOnLoginHint">
            <span class="toggle-slider"></span>
          </label>
```

**Step 4: Wire in component — store element reference**

In `settings-menu.component.js`, in `initialize()` method, add after `this.autoStreamOnConnectCheckbox` (after line 40):

```javascript
this.launchOnLoginCheckbox = elements.settingLaunchOnLogin;
```

**Step 5: Wire in component — bind event**

In `_bindEvents()`, add after the fullscreen on startup toggle block (after line 122):

```javascript
    if (this.launchOnLoginCheckbox) {
      this._domListeners.add(this.launchOnLoginCheckbox, 'change', () => {
        this.settingsService.setLaunchOnLogin(this.launchOnLoginCheckbox.checked);
      });
    }
```

**Step 6: Wire in component — load current setting**

In `_loadCurrentSettings()`, the method needs to become async to handle the async `getLaunchOnLogin()`.

Change `_loadCurrentSettings()` (line 162) to:
```javascript
  async _loadCurrentSettings() {
```

Add after the existing setting loads (after line 168, before the checkbox assignments):

```javascript
    const launchOnLoginEnabled = await this.settingsService.getLaunchOnLogin?.() ?? false;
```

Add checkbox assignment (after line 188):

```javascript
    if (this.launchOnLoginCheckbox) {
      this.launchOnLoginCheckbox.checked = launchOnLoginEnabled;
    }
```

**Step 7: Write the UI tests**

Add to `tests/unit/features/settings/ui/settings-menu.test.js`:

In the `beforeEach` that creates mock elements, add:
```javascript
settingLaunchOnLogin: (() => { const el = document.createElement('input'); el.type = 'checkbox'; return el; })(),
```

Add to the mock `settingsService`:
```javascript
getLaunchOnLogin: vi.fn(() => Promise.resolve(false)),
setLaunchOnLogin: vi.fn(() => Promise.resolve()),
```

Add test block:
```javascript
describe('launch on login toggle', () => {
  it('should call setLaunchOnLogin when checkbox changes', () => {
    mockElements.settingLaunchOnLogin.checked = true;
    mockElements.settingLaunchOnLogin.dispatchEvent(new Event('change'));

    expect(mockSettingsService.setLaunchOnLogin).toHaveBeenCalledWith(true);
  });

  it('should load saved state on initialization', async () => {
    mockSettingsService.getLaunchOnLogin.mockResolvedValue(true);
    await component._loadCurrentSettings();

    expect(mockElements.settingLaunchOnLogin.checked).toBe(true);
  });
});
```

**Step 8: Run tests**

Run: `npx vitest run tests/unit/features/settings/ui/settings-menu.test.js`
Expected: PASS

**Step 9: Verify lint passes**

Run: `npm run lint`
Expected: PASS

**Step 10: Commit**

```bash
git add src/renderer/presentation/config/dom-selectors.config.ts src/renderer/presentation/primitives/dom-bindings.utils.js src/renderer/presentation/features/settings/settings-menu.template.js src/renderer/presentation/features/settings/settings-menu.component.js tests/unit/features/settings/ui/settings-menu.test.js
git commit -m "feat(auto-start): add launch-on-startup toggle to settings UI"
```

---

## Task 9: Display Mode Orchestrator — Defer Fullscreen on Hidden Launch

**Files:**
- Modify: `src/renderer/application/orchestrators/display-mode.orchestrator.ts:1-75`

**Step 1: Add window visibility check**

The display mode orchestrator needs to know if the window is currently hidden. The simplest approach: check `document.hidden` — when the window is created with `show: false`, the page visibility API reports `hidden`.

Modify `_applyStartupBehaviors()` (lines 34-38):

```javascript
  _applyStartupBehaviors() {
    if (this.settingsService.getFullscreenOnStartup()) {
      if (document.hidden) {
        const onVisible = () => {
          document.removeEventListener('visibilitychange', onVisible);
          this.fullscreenService.enterFullscreen();
        };
        document.addEventListener('visibilitychange', onVisible);
      } else {
        this.fullscreenService.enterFullscreen();
      }
    }
  }
```

**Step 2: Verify lint passes**

Run: `npm run lint`
Expected: PASS

**Step 3: Commit**

```bash
git add src/renderer/application/orchestrators/display-mode.orchestrator.ts
git commit -m "feat(auto-start): defer fullscreen-on-startup when window is hidden"
```

---

## Task 10: Full Test Suite Validation

**Step 1: Run full test suite**

Run: `npm run test:run`
Expected: PASS — all existing tests pass, new tests pass

**Step 2: Run linter**

Run: `npm run lint`
Expected: PASS

**Step 3: Verify test count increased**

Expected: ~15-20 new tests added (LoginItemService: 8, IPC handler: 4, SettingsService: 6, UI: 2)

**Step 4: Final commit (if any fixes needed)**

If test/lint fixes were needed, commit them:
```bash
git add -A
git commit -m "fix(auto-start): resolve test/lint issues from full validation"
```

---

## Dependency Graph

```
Task 1 (shared contracts)
  ├── Task 2 (LoginItemService)     ─── depends on Task 1
  │     └── Task 3 (IPC Handler)    ─── depends on Task 2
  │           └── Task 4 (DI + Orchestrator) ─── depends on Task 3
  │                 └── Task 5 (WindowService) ─── depends on Task 4
  ├── Task 6 (Preload)              ─── depends on Task 1
  └── Task 7 (SettingsService)      ─── depends on Task 1
        └── Task 8 (UI Toggle)      ─── depends on Task 7
              └── Task 9 (Display Mode) ─── depends on Task 5, Task 8
                    └── Task 10 (Validation) ─── depends on all
```

## Parallelization Opportunities

- **Batch 1**: Task 1 (shared contracts)
- **Batch 2**: Tasks 2, 6, 7 (independent — LoginItemService, Preload, SettingsService)
- **Batch 3**: Tasks 3, 8 (IPC Handler, UI Toggle)
- **Batch 4**: Task 4 (DI Container)
- **Batch 5**: Task 5 (WindowService)
- **Batch 6**: Task 9 (Display Mode)
- **Batch 7**: Task 10 (Full Validation)
