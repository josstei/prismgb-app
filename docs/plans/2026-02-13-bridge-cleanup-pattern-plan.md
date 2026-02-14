# Bridge & IPC Cleanup Pattern Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish clean cleanup semantics: `_subscriptions` reserved for EventBus, `addCleanup()` for IPC/DOM/arbitrary cleanup. Replaces reverted Tasks 6+7 from decomposition plan.

**Architecture:** No new base classes. Uses existing `LifecycleService.addCleanup()` API. IPC services stop co-opting `_subscriptions`, bridges drop log-only `onDispose()` overrides. One small enhancement to base class enables the bridge cleanup.

**Tech Stack:** TypeScript, Vitest, @prismgb/core LifecycleService

**Design Reference:** `docs/plans/2026-02-13-bridge-cleanup-pattern-design.md`

**Test Baseline:** 120 test files, 2529 tests. Run `npm run test:run` — all must pass after every task.

---

## Task 1: Add disposal completion logging to LifecycleService

**Files:**
- Modify: `packages/prismgb-core/src/base/lifecycle-service.base.ts` (line 65-72)
- Test: `packages/prismgb-core/tests/base/lifecycle-service.test.ts`

**Step 1: Add completion log to `dispose()` method**

In `packages/prismgb-core/src/base/lifecycle-service.base.ts`, add a log line after `onDispose()` runs:

```typescript
// Current (line 65-72):
    try {
      await this.onDispose();
    } catch (error) {
      this.logger?.error(`${this._serviceName} dispose failed`, error);
    }

    this._isInitialized = false;
    this._isDisposed = true;

// After:
    try {
      await this.onDispose();
    } catch (error) {
      this.logger?.error(`${this._serviceName} dispose failed`, error);
    }

    this._isInitialized = false;
    this._isDisposed = true;
    this.logger?.info(`${this._serviceName} disposed`);
```

**Step 2: Run tests**

Run: `npm run test:run`
Expected: All 2529 tests pass. Bridges that assert "X disposed" now get it from the base class AND their `onDispose()` override, so the assertion matches regardless.

**Step 3: Commit**

```bash
git add packages/prismgb-core/src/base/lifecycle-service.base.ts && git commit -m "feat(core): add disposal completion logging to LifecycleService"
```

---

## Task 2: Migrate TranscodeService to addCleanup pattern

**Files:**
- Modify: `src/renderer/infrastructure/services/transcode/transcode.service.ts` (lines 50-59, 207-213)
- Test: `tests/unit/features/transcode/transcode.service.test.js` (lines 478-504)

**Step 1: Update `onInitialize()` — replace `_subscriptions.push` with direct calls + addCleanup**

In `src/renderer/infrastructure/services/transcode/transcode.service.ts`, replace lines 50-59:

```typescript
// Current:
  async onInitialize() {
    // Subscribe to IPC events and republish on eventBus
    // Note: No onStarted handler - the main process doesn't emit a STARTED event.
    // The started state is determined by the successful return of transcode() call.
    this._subscriptions.push(
      window.transcodeAPI.onProgress((data) => this._handleProgress(data)),
      window.transcodeAPI.onCompleted((data) => this._handleCompleted(data)),
      window.transcodeAPI.onError((data) => this._handleError(data)),
      window.transcodeAPI.onCancelled((data) => this._handleCancelled(data))
    );
  }

// After:
  async onInitialize() {
    window.transcodeAPI.onProgress((data: TranscodeProgressPayload) => this._handleProgress(data));
    window.transcodeAPI.onCompleted((data: TranscodeCompletedPayload) => this._handleCompleted(data));
    window.transcodeAPI.onError((data: TranscodeErrorPayload) => this._handleError(data));
    window.transcodeAPI.onCancelled((data: TranscodeCancelledPayload) => this._handleCancelled(data));

    this.addCleanup(() => window.transcodeAPI?.removeListeners?.());
  }
```

**Step 2: Simplify `onDispose()` — remove removeListeners call, keep state reset**

Replace lines 207-213:

```typescript
// Current:
  async onDispose() {
    window.transcodeAPI?.removeListeners?.();

    this._isTranscoding = false;
    this._activeJobId = null;
    this.logger.info('TranscodeService disposed');
  }

// After:
  async onDispose() {
    this._isTranscoding = false;
    this._activeJobId = null;
  }
```

**Step 3: Update test — remove individual unsubscribe tracking test**

In `tests/unit/features/transcode/transcode.service.test.js`, replace the "should call all unsubscribe functions" test (lines 478-490):

```javascript
// Current:
    it('should call all unsubscribe functions', async () => {
      const cleanup1 = vi.fn();
      const cleanup2 = vi.fn();
      mockTranscodeAPI.onProgress.mockReturnValue(cleanup1);
      mockTranscodeAPI.onCompleted.mockReturnValue(cleanup2);

      await service.initialize();
      await service.dispose();

      expect(cleanup1).toHaveBeenCalled();
      expect(cleanup2).toHaveBeenCalled();
    });

// After:
    it('should register IPC listeners during initialization', async () => {
      await service.initialize();

      expect(mockTranscodeAPI.onProgress).toHaveBeenCalled();
      expect(mockTranscodeAPI.onCompleted).toHaveBeenCalled();
      expect(mockTranscodeAPI.onError).toHaveBeenCalled();
      expect(mockTranscodeAPI.onCancelled).toHaveBeenCalled();
    });
```

Also remove the "TranscodeService disposed" log assertion (line 515-519) since it now comes from the base class:

```javascript
// Current:
    it('should log disposal', async () => {
      await service.initialize();
      await service.dispose();

      expect(mockLogger.info).toHaveBeenCalledWith('TranscodeService disposed');
    });

// After: KEEP this test — the base class now logs this message, so the assertion still passes.
```

**Step 4: Run tests**

Run: `npx vitest run tests/unit/features/transcode/transcode.service.test.js`
Expected: All tests pass.

Run: `npm run test:run`
Expected: All 2529 tests pass.

**Step 5: Commit**

```bash
git add src/renderer/infrastructure/services/transcode/transcode.service.ts tests/unit/features/transcode/transcode.service.test.js && git commit -m "refactor(transcode): migrate IPC cleanup to addCleanup pattern"
```

---

## Task 3: Migrate UpdateService to addCleanup pattern

**Files:**
- Modify: `src/renderer/infrastructure/services/updates/update.service.ts` (lines 53-62, 207-215)
- Test: `tests/unit/features/updates/services/update.service.test.js` (lines 370-390)

**Step 1: Update `onInitialize()` — replace `_subscriptions.push` with direct calls + addCleanup**

In `src/renderer/infrastructure/services/updates/update.service.ts`, replace lines 53-62:

```typescript
// Current:
  async onInitialize() {
    await this._loadInitialStatus();

    this._subscriptions.push(
      window.updateAPI.onAvailable((info) => this._handleAvailable(info)),
      window.updateAPI.onNotAvailable((info) => this._handleNotAvailable(info)),
      window.updateAPI.onProgress((progress) => this._handleProgress(progress)),
      window.updateAPI.onDownloaded((info) => this._handleDownloaded(info)),
      window.updateAPI.onError((error) => this._handleError(error))
    );
  }

// After:
  async onInitialize() {
    await this._loadInitialStatus();

    window.updateAPI.onAvailable((info: UpdateInfoPayload) => this._handleAvailable(info));
    window.updateAPI.onNotAvailable((info: UpdateInfoPayload) => this._handleNotAvailable(info));
    window.updateAPI.onProgress((progress: UpdateProgressPayload) => this._handleProgress(progress));
    window.updateAPI.onDownloaded((info: UpdateInfoPayload) => this._handleDownloaded(info));
    window.updateAPI.onError((error: UpdateErrorPayload) => this._handleError(error));

    this.addCleanup(() => window.updateAPI?.removeListeners?.());
  }
```

**Step 2: Simplify `onDispose()` — remove removeListeners call, keep state reset**

Replace lines 207-215:

```typescript
// Current:
  async onDispose() {
    window.updateAPI?.removeListeners();

    this._state = UpdateState.IDLE;
    this._updateInfo = null;
    this._downloadProgress = null;
    this._error = null;
    this.logger.info('UpdateService disposed');
  }

// After:
  async onDispose() {
    this._state = UpdateState.IDLE;
    this._updateInfo = null;
    this._downloadProgress = null;
    this._error = null;
  }
```

**Step 3: Update test — remove individual unsubscribe tracking test**

In `tests/unit/features/updates/services/update.service.test.js`, find and replace the "should call all unsubscribe functions" test (around line 370-384):

```javascript
// Replace:
    it('should call all unsubscribe functions', async () => {
      // ... checks individual unsubscribe return values
    });

// With:
    it('should register IPC listeners during initialization', async () => {
      await service.initialize();

      expect(mockUpdateAPI.onAvailable).toHaveBeenCalled();
      expect(mockUpdateAPI.onNotAvailable).toHaveBeenCalled();
      expect(mockUpdateAPI.onProgress).toHaveBeenCalled();
      expect(mockUpdateAPI.onDownloaded).toHaveBeenCalled();
      expect(mockUpdateAPI.onError).toHaveBeenCalled();
    });
```

Keep the "should call removeListeners" test as-is — it still works because `addCleanup` runs during `dispose()`.

**Step 4: Run tests**

Run: `npx vitest run tests/unit/features/updates/services/update.service.test.js`
Expected: All tests pass.

Run: `npm run test:run`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/renderer/infrastructure/services/updates/update.service.ts tests/unit/features/updates/services/update.service.test.js && git commit -m "refactor(updates): migrate IPC cleanup to addCleanup pattern"
```

---

## Task 4: Migrate FullscreenService to addCleanup pattern

**Files:**
- Modify: `src/renderer/infrastructure/services/settings/fullscreen.service.ts` (lines 16, 20-38, 41-43)
- Test: `tests/unit/features/settings/services/fullscreen.service.test.js` (lines 143-185)

**Step 1: Remove `_boundHandleFullscreenChange` from constructor, update `onInitialize()`**

In `src/renderer/infrastructure/services/settings/fullscreen.service.ts`:

```typescript
// Current constructor:
  constructor(dependencies) {
    super(dependencies, [...SettingsFullscreenService.dependencies], 'SettingsFullscreenService');

    this._boundHandleFullscreenChange = this._handleFullscreenChange.bind(this);
    this._isFullscreenActive = false;
  }

// After:
  constructor(dependencies) {
    super(dependencies, [...SettingsFullscreenService.dependencies], 'SettingsFullscreenService');

    this._isFullscreenActive = false;
  }
```

```typescript
// Current onInitialize():
  async onInitialize() {
    document.addEventListener('fullscreenchange', this._boundHandleFullscreenChange);

    if (window.windowAPI) {
      this._subscriptions.push(
        window.windowAPI.onEnterFullscreen(() => {
          this._handleNativeFullscreen(true);
        }),
        window.windowAPI.onLeaveFullscreen(() => {
          this._handleNativeFullscreen(false);
        }),
        window.windowAPI.onResized(() => {
          this._syncFullscreenState();
          this.eventBus.publish(EventChannels.UI.WINDOW_RESIZED);
        })
      );
    }

    await this._syncFullscreenState();
  }

// After:
  async onInitialize() {
    const boundHandleFullscreenChange = this._handleFullscreenChange.bind(this);
    document.addEventListener('fullscreenchange', boundHandleFullscreenChange);
    this.addCleanup(() => document.removeEventListener('fullscreenchange', boundHandleFullscreenChange));

    if (window.windowAPI) {
      window.windowAPI.onEnterFullscreen(() => {
        this._handleNativeFullscreen(true);
      });
      window.windowAPI.onLeaveFullscreen(() => {
        this._handleNativeFullscreen(false);
      });
      window.windowAPI.onResized(() => {
        this._syncFullscreenState();
        this.eventBus.publish(EventChannels.UI.WINDOW_RESIZED);
      });

      this.addCleanup(() => window.windowAPI?.removeListeners?.());
    }

    await this._syncFullscreenState();
  }
```

**Step 2: Remove `onDispose()`**

```typescript
// Delete entirely:
  async onDispose() {
    document.removeEventListener('fullscreenchange', this._boundHandleFullscreenChange);
  }
```

**Step 3: Update tests**

In `tests/unit/features/settings/services/fullscreen.service.test.js`, add `removeListeners` to the mock (around line 42-52):

```javascript
// Current mockWindowAPI:
    mockWindowAPI = {
      onEnterFullscreen: vi.fn((callback) => {
        enterFullscreenCallback = callback;
        return vi.fn();
      }),
      onLeaveFullscreen: vi.fn((callback) => {
        leaveFullscreenCallback = callback;
        return vi.fn();
      }),
      onResized: vi.fn(() => {
        return vi.fn();
      })
    };

// After:
    mockWindowAPI = {
      onEnterFullscreen: vi.fn((callback) => {
        enterFullscreenCallback = callback;
        return vi.fn();
      }),
      onLeaveFullscreen: vi.fn((callback) => {
        leaveFullscreenCallback = callback;
        return vi.fn();
      }),
      onResized: vi.fn(() => {
        return vi.fn();
      }),
      removeListeners: vi.fn()
    };
```

Update the dispose tests (lines 143-185):

```javascript
// Replace:
  describe('dispose', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should remove fullscreenchange event listener', async () => {
      await service.dispose();

      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'fullscreenchange',
        service._boundHandleFullscreenChange
      );
    });

    it('should unsubscribe from native fullscreen events', async () => {
      const [unsubscribeEnter, unsubscribeLeave, unsubscribeResized] = service._subscriptions;

      await service.dispose();

      expect(unsubscribeEnter).toHaveBeenCalled();
      expect(unsubscribeLeave).toHaveBeenCalled();
      expect(unsubscribeResized).toHaveBeenCalled();
      expect(service._subscriptions).toEqual([]);
    });

    it('should handle dispose when not initialized', async () => {
      const uninitializedService = new SettingsFullscreenService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      await expect(uninitializedService.dispose()).resolves.toBeUndefined();
    });

    it('should handle dispose without windowAPI', async () => {
      global.window.windowAPI = undefined;
      const serviceWithoutAPI = new SettingsFullscreenService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      await expect(serviceWithoutAPI.dispose()).resolves.toBeUndefined();
    });
  });

// With:
  describe('dispose', () => {
    beforeEach(async () => {
      await service.initialize();
    });

    it('should remove fullscreenchange event listener', async () => {
      await service.dispose();

      expect(mockDocument.removeEventListener).toHaveBeenCalledWith(
        'fullscreenchange',
        expect.any(Function)
      );
    });

    it('should call removeListeners on windowAPI', async () => {
      await service.dispose();

      expect(mockWindowAPI.removeListeners).toHaveBeenCalled();
    });

    it('should handle dispose when not initialized', async () => {
      const uninitializedService = new SettingsFullscreenService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      await expect(uninitializedService.dispose()).resolves.toBeUndefined();
    });

    it('should handle dispose without windowAPI', async () => {
      global.window.windowAPI = undefined;
      const serviceWithoutAPI = new SettingsFullscreenService({
        eventBus: mockEventBus,
        loggerFactory: mockLoggerFactory
      });

      await expect(serviceWithoutAPI.dispose()).resolves.toBeUndefined();
    });
  });
```

**Step 4: Run tests**

Run: `npx vitest run tests/unit/features/settings/services/fullscreen.service.test.js`
Expected: All tests pass.

Run: `npm run test:run`
Expected: All tests pass.

**Step 5: Commit**

```bash
git add src/renderer/infrastructure/services/settings/fullscreen.service.ts tests/unit/features/settings/services/fullscreen.service.test.js && git commit -m "refactor(settings): migrate fullscreen IPC/DOM cleanup to addCleanup pattern"
```

---

## Task 5: Remove log-only onDispose overrides from bridges

**Files:**
- Modify: `src/renderer/presentation/bridges/capture-ui.bridge.ts` (lines 31-33)
- Modify: `src/renderer/presentation/bridges/update-ui.bridge.ts` (lines 29-31)
- Modify: `src/renderer/presentation/bridges/ui-event.bridge.ts` (lines 102-104)
- Modify: `src/renderer/presentation/bridges/transcode-ui.bridge.ts` (lines 28-43)
- Test: `tests/unit/ui/orchestration/capture-ui.bridge.test.js`
- Test: `tests/unit/ui/orchestration/transcode-ui.bridge.test.js`
- Test: `tests/unit/ui/ui-event-bridge.test.js`

**Step 1: Remove log-only `onDispose()` from CaptureUIBridge**

In `src/renderer/presentation/bridges/capture-ui.bridge.ts`, delete lines 31-33:

```typescript
// Delete:
  async onDispose() {
    this.logger.info('CaptureUIBridge disposed');
  }
```

**Step 2: Remove log-only `onDispose()` from UpdateUIBridge**

In `src/renderer/presentation/bridges/update-ui.bridge.ts`, delete lines 29-31:

```typescript
// Delete:
  async onDispose() {
    this.logger.info('UpdateUIBridge disposed');
  }
```

**Step 3: Remove log-only `onDispose()` from UIEventBridge**

In `src/renderer/presentation/bridges/ui-event.bridge.ts`, delete lines 102-104:

```typescript
// Delete:
  async onDispose() {
    this.logger.info('UIEventBridge disposed');
  }
```

**Step 4: Migrate TranscodeUIBridge toast cleanup to addCleanup + remove onDispose**

In `src/renderer/presentation/bridges/transcode-ui.bridge.ts`, add `addCleanup` to `onInitialize()` and remove `onDispose()`:

```typescript
// Current onInitialize() (line 28-37):
  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.TRANSCODE.STARTED]: (data) => this._handleStarted(data),
      [EventChannels.TRANSCODE.PROGRESS]: (data) => this._handleProgress(data),
      [EventChannels.TRANSCODE.COMPLETED]: (data) => this._handleCompleted(data),
      [EventChannels.TRANSCODE.ERROR]: (data) => this._handleError(data),
      [EventChannels.TRANSCODE.CANCELLED]: () => this._handleCancelled()
    });

    this.logger.info('TranscodeUIBridge initialized');
  }

// After:
  async onInitialize() {
    this.subscribeWithCleanup({
      [EventChannels.TRANSCODE.STARTED]: (data) => this._handleStarted(data),
      [EventChannels.TRANSCODE.PROGRESS]: (data) => this._handleProgress(data),
      [EventChannels.TRANSCODE.COMPLETED]: (data) => this._handleCompleted(data),
      [EventChannels.TRANSCODE.ERROR]: (data) => this._handleError(data),
      [EventChannels.TRANSCODE.CANCELLED]: () => this._handleCancelled()
    });

    this.addCleanup(() => this._toast?.dispose());
  }

// Delete:
  async onDispose() {
    this._toast?.dispose();
    this.logger.info('TranscodeUIBridge disposed');
  }
```

**Step 5: Run tests**

Run: `npx vitest run tests/unit/ui/orchestration/capture-ui.bridge.test.js tests/unit/ui/orchestration/transcode-ui.bridge.test.js tests/unit/ui/ui-event-bridge.test.js`
Expected: All tests pass. The "should log disposal" assertions now match the base class's `${serviceName} disposed` log (same message text).

Run: `npm run test:run`
Expected: All tests pass.

**Step 6: Commit**

```bash
git add src/renderer/presentation/bridges/ && git commit -m "refactor(bridges): remove redundant onDispose overrides, use addCleanup for toast"
```

---

## Validation

After all tasks:

1. `npm run test:run` — all 2529 tests pass
2. `npm run lint` — no lint errors
3. Verify convention: grep for `_subscriptions.push` in renderer — should only appear in non-IPC contexts (e.g., BaseComponent, AppState EventBus subscriptions)

```bash
grep -rn "_subscriptions.push" src/renderer/
```

IPC services (transcode, update, fullscreen) should NOT appear in the output.
