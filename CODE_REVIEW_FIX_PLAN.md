# Code Review Fix Plan

**Branch:** fix/code-review-findings
**Started:** 2025-12-29
**Status:** MOSTLY COMPLETE (Phase 3 deferred)

---

## Phase 1: Critical Fixes (HIGH Priority)

### 1.1 UISetupOrchestrator Horizontal Coupling ✅
- [x] Create UI command event channels
- [x] Replace direct orchestrator calls with event publications
- [x] Add event subscriptions in target orchestrators
- **Files:** `ui-setup.orchestrator.js`, `event-channels.js`, `capture.orchestrator.js`, `display-mode.orchestrator.js`, `streaming.orchestrator.js`

### 1.2 FullscreenService DOM Manipulation ✅
- [x] Move classList manipulation to UIEffects
- [x] Service emits state change events only
- **Files:** `fullscreen.service.js`, `ui-effects.manager.js`, `ui-event.bridge.js`, `ui.controller.js`

### 1.3 Missing DI Dependencies ✅
- [x] Add `storageService` to SettingsService requiredDeps
- [x] Add `loggerFactory` to UpdateUiService requiredDeps
- **Files:** `settings.service.js`, `update-ui.service.js`

---

## Phase 2: Performance Fixes (HIGH Impact) ✅

### 2.1 GPU Recording Scale Calculation ✅
- [x] Cache scale calculation result
- [x] Early return when dimensions unchanged
- **Files:** `gpu-recording.service.js`

### 2.2 User Activity Throttling ✅
- [x] Add adapter-level throttling for high-frequency events (100ms throttle)
- **Files:** `user-activity.adapter.js`

### 2.3 Viewport Service DOM Measurements ✅
- [x] Cache computed style values
- [x] Only recalculate on actual resize
- **Files:** `viewport.service.js`

### 2.4 Recording Canvas Clearing ✅
- [x] Track clearing state
- [x] Only clear when dimensions change
- **Files:** `gpu-recording.service.js`

---

## Phase 3: Architecture Improvements (MEDIUM Priority) ⏳ DEFERRED

### 3.1 Cross-Feature Imports
- [ ] SettingsMenuComponent - compose at UIController level
- [ ] AdapterFactory - register adapters via DI bootstrap
- **Files:** `settings-menu.component.js`, `adapter.factory.js`, `container.js`
- **Status:** Deferred - requires more extensive architectural changes

### 3.2 Thick Orchestrator Methods
- [ ] Extract StreamingOrchestrator._handleStreamStarted audio logic
- [ ] Extract CaptureOrchestrator source selection logic
- **Files:** `streaming.orchestrator.js`, `capture.orchestrator.js`
- **Status:** Deferred - requires careful refactoring

---

## Phase 4: Error Handling (MEDIUM Priority) ✅

### 4.1 Add Debug Logging to Silent Catches ✅
- [x] device-media.service.js:158 - added debug logging
- [x] device-storage.service.js:23, 32 - added debug logging
- [x] streaming.service.js:374 - already had warn logging
- **Files:** `device-media.service.js`, `device-storage.service.js`

### 4.2 Add Logger Injection ⏳ DEFERRED
- [ ] DeviceIPCAdapter - add optional logger
- **Files:** `device-ipc.adapter.js`
- **Status:** Deferred - low impact

---

## Phase 5: Code Cleanup (LOW Priority) ✅ PARTIAL

### 5.1 Remove Unused Exports ✅
- [x] Remove container.js re-exports (EventBus, RendererLogger)
- [ ] Consider removing unused error classes - deferred
- **Files:** `container.js`

### 5.2 DI Cleanup ✅ PARTIAL
- [x] Remove redundant manual assignments in CaptureOrchestrator
- [ ] Remove redundant assignments in PerformanceStateService - uses different naming convention (underscore prefix)
- [ ] Remove redundant assignment in PerformanceMetricsService - uses different naming convention
- **Files:** `capture.orchestrator.js`

---

## Progress Log

| Date | Phase | Item | Status |
|------|-------|------|--------|
| 2025-12-29 | Setup | Created branch fix/code-review-findings | DONE |
| 2025-12-29 | Setup | Created tracking plan | DONE |
| 2025-12-29 | 1.1 | UISetupOrchestrator decoupling | DONE |
| 2025-12-29 | 1.2 | FullscreenService DOM to UIEffects | DONE |
| 2025-12-29 | 1.3 | Missing DI dependencies | DONE |
| 2025-12-29 | 2.1 | GPU Recording scale caching | DONE |
| 2025-12-29 | 2.2 | User Activity throttling | DONE |
| 2025-12-29 | 2.3 | Viewport DOM caching | DONE |
| 2025-12-29 | 2.4 | Recording canvas clearing | DONE |
| 2025-12-29 | 4.1 | Debug logging to silent catches | DONE |
| 2025-12-29 | 5.1 | Remove unused exports | DONE |
| 2025-12-29 | 5.2 | Remove redundant assignments (partial) | DONE |
| | | | |

---

## Notes

- Run `npm run test:run` after each phase
- Run `npm run lint` to verify no lint errors
- Commit after each logical group of changes
