# New Settings Feature Implementation Status

Tracking implementation of 4 new settings that work together:
1. Fullscreen on startup
2. Minimalist fullscreen
3. Auto-start on boot
4. Auto-stream on connect

## Branch Status

| Branch | Feature | Status | Commit |
|--------|---------|--------|--------|
| `feature/fullscreen-on-startup` | Fullscreen on startup | **COMPLETE** | `6129dc8` |
| `feature/minimalist-fullscreen` | Minimalist fullscreen | PENDING | - |
| `feature/auto-start` | Auto-start on boot | PENDING | - |
| `feature/auto-stream` | Auto-stream on connect | PENDING | - |

## Merge Order

Branch 2 depends on Branch 1 (both modify `fullscreen.service.js`):
- Branch 1 adds `enterFullscreen()`/`exitFullscreen()` methods
- Branch 2 adds minimalist mode + `settingsService` dependency

**Required order:** Branch 1 → Branch 2 → (Branch 3 and 4 in any order)

---

## Branch 1: `feature/fullscreen-on-startup` - COMPLETE

### Commit
`6129dc8` - feat(settings): add fullscreen on startup option

### Files Modified (15 total)
- `src/renderer/infrastructure/events/event-channels.js` - Added `FULLSCREEN_ON_STARTUP_CHANGED`, `PREFERENCES_LOADED`
- `src/shared/config/dom-selectors.js` - Added `SETTING_FULLSCREEN_ON_STARTUP`
- `src/renderer/features/settings/services/settings.service.js` - Added fullscreenOnStartup setting
- `src/renderer/features/settings/services/fullscreen.service.js` - Added `enterFullscreen()`/`exitFullscreen()` methods
- `src/renderer/features/settings/services/display-mode.orchestrator.js` - Added startup behavior subscription
- `src/renderer/features/settings/services/preferences.orchestrator.js` - Publishes `PREFERENCES_LOADED` event
- `src/renderer/application/app.orchestrator.js` - Fixed initialization order
- `src/renderer/container.js` - Updated DisplayModeOrchestrator dependencies
- `src/renderer/index.html` - Added checkbox
- `src/renderer/features/settings/ui/settings-menu.component.js` - Bound checkbox
- `src/renderer/ui/controller/ui.controller.js` - Added element query

### Tests Updated
- `tests/unit/features/settings/services/settings.service.test.js` - 7 new tests
- `tests/unit/features/settings/services/display-mode.orchestrator.test.js` - Updated mocks
- `tests/unit/features/settings/services/fullscreen.service.test.js` - Fixed toggle test

### Codex Review
- **Issue Found:** Initialization order bug - `PREFERENCES_LOADED` was published before `DisplayModeOrchestrator` subscribed
- **Fix Applied:** Swapped order in `app.orchestrator.js` so DisplayModeOrchestrator initializes before PreferencesOrchestrator

### Validation
- Lint: PASS
- Tests: 1977 passed
- Pushed to: `private/feature/fullscreen-on-startup`

---

## Plan File

Full implementation plan: `.claude/plans/wobbly-conjuring-platypus.md`
