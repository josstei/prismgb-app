# UI Refactor Plan

## Goals
- Clarify ownership boundaries between app shell, feature UI, templates, and styles.
- Reduce duplicated UI behaviors (show/hide, escape, click-outside, listbox rendering).
- Make UI domains more scalable: each feature owns its markup + styles + logic.
- Centralize DOM access and avoid ad-hoc `document.getElementById` in components.

## Current Hotspots (Observed)
- Templates live in `src/renderer/ui/templates/*` while behavior lives in `src/renderer/features/*/ui/*`.
- DOM access is duplicated: IDs live in `src/shared/config/dom-selectors.config.js`, elements are fetched in `src/renderer/ui/controller/ui.controller.js`, and some components still query the DOM directly (for example `src/renderer/features/updates/ui/update-section.component.js`).
- Repeated UI patterns: show/hide/toggle + escape + click-outside and listbox-style rendering across settings, shader panel, notes filter, and autocomplete.
- CSS is global and flat (`src/renderer/assets/styles/*.css`) even when feature-specific.
- `src/renderer/index.html` and `src/renderer/index.js` split app shell vs bootstrapping responsibilities.

## Target Architecture (High Level)
- App shell owns only the global layout; feature templates are owned by feature domains.
- Feature UI folders contain: template, styles, and components for that feature.
- UI primitives provide shared behaviors and reduce repetition.
- DOM element lookup is centralized and injected into components.

## Proposed Structure (Example)
```
src/renderer/
  ui/
    shell/
      app-shell.template.js
      shell.renderer.js
    primitives/
      disclosure.js
      listbox.js
      dom-bindings.js
    components/
      status-notification.component.js
      device-status.component.js
      transcode-toast.component.js
  features/
    settings/
      ui/
        settings-menu.component.js
        settings-menu.template.js
        settings-menu.css
    streaming/
      ui/
        stream-viewer.template.js
        shader-panel.template.js
        streaming-controls.component.js
        streaming-shader-selector.component.js
        streaming-ui.css
    notes/
      ui/
        notes-panel.component.js
        notes-panel.template.js
        notes.css
```

## Phased Refactor Plan

### Phase 0 - Baseline and Inventory
- Capture current UI/DOM dependencies for each feature (notes, settings, streaming, updates).
- Document which elements are required by each component.
- Validate existing behavior after each phase (manual smoke tests).

### Phase 1 - Shared UI Primitives
- Add `src/renderer/ui/primitives/disclosure.js` for toggle/show/hide + escape + click-outside.
- Add `src/renderer/ui/primitives/listbox.js` for:
  - rendering options
  - active/aria selection
  - keyboard navigation hooks
- Refactor to use primitives:
  - `src/renderer/features/settings/ui/settings-menu.component.js`
  - `src/renderer/features/streaming/ui/streaming-shader-selector.component.js`
  - `src/renderer/features/notes/ui/game-filter.component.js`
  - `src/renderer/features/notes/ui/game-autocomplete.component.js`

### Phase 2 - Template Ownership Per Feature
- Move settings menu template into `src/renderer/features/settings/ui/`.
- Move stream viewer templates into `src/renderer/features/streaming/ui/`.
- Move notes panel template into `src/renderer/features/notes/ui/`.
- Replace `src/renderer/ui/templates/index.js` with an app shell renderer that imports feature templates.

### Phase 3 - Centralized DOM Bindings
- Introduce `src/renderer/ui/primitives/dom-bindings.js` (or similar) to build typed element maps.
- Split DOM selectors by domain (notes/settings/streaming) and pass maps to components.
- Remove direct DOM queries from components (for example `UpdateSectionComponent`).

### Phase 4 - CSS Domain Grouping
- Move feature-specific CSS into feature folders (notes/settings/streaming) with dedicated entry files.
- Keep global styles in `assets/styles` (tokens, base, layout, utilities, states).
- Update `src/renderer/assets/styles/styles.css` to import grouped feature CSS once.

### Phase 5 - App Shell and Entry Point Cleanup
- Reduce responsibilities in `src/renderer/index.js` to bootstrapping only.
- Keep `src/renderer/index.html` as minimal shell.
- Optional: move critical CSS to a dedicated file (or clearly mark it as shell-only CSS).

## Risks and Mitigations
- Risk: Template moves can break element IDs. Mitigate by validating `DOMSelectors` coverage per phase.
- Risk: UI primitives can change behavior. Mitigate with manual regression checks for menus/filters/autocomplete.
- Risk: CSS moves can shift specificity. Mitigate by keeping class names stable and using the same import order.

## Acceptance Criteria
- Each feature owns its template, styles, and UI components.
- No feature component queries the DOM directly; all DOM elements are injected.
- UI show/hide and listbox logic come from shared primitives.
- `styles.css` cleanly separates global vs feature CSS.
- Entry point and app shell concerns are clearly separated.
