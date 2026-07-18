/**
 * Notes Panel Toggle Regression
 *
 * Guards that a single click on the toolbar notes button opens the panel and a second click
 * closes it.
 *
 * Regression history: the notes button was double-wired. The refactor migrated notes onto the
 * declarative `data-action="notes.toggle"` dispatcher (like the settings and shader buttons),
 * but the component kept its `main`-era imperative `_setupToggleButton()` click listener. A
 * single click therefore invoked `toggle()` twice — the panel opened then immediately closed,
 * so "nothing showed up" and the log emitted a paired shown/hidden per click. The fix removes
 * the component self-wire and relies solely on the dispatcher.
 *
 * The existing component unit specs asserted the (now-removed) self-wire and never saw the
 * cross-layer duplication, which is why only an e2e catches this.
 */

import { test, expect } from './fixtures/electron.fixture.js';

function readPanelState(page) {
  return page.evaluate(() => {
    const el = document.getElementById('notesPanel');
    if (!el) return { exists: false };
    const cs = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return {
      exists: true,
      hasVisibleClass: el.classList.contains('visible'),
      opacity: cs.opacity,
      onScreen: r.width > 0 && r.right > 0 && r.x < window.innerWidth && r.bottom > 0 && r.y < window.innerHeight,
    };
  });
}

function clickNotesButton(page) {
  return page.evaluate(() => document.getElementById('notesBtn')?.click());
}

test.setTimeout(45000);

test.describe('Notes panel toggle regression', () => {
  test('opens on the first notes-button click and closes on the second', async ({
    appShell,
    chromaticDevice,
    streamPage,
    page,
  }) => {
    await appShell.waitForReady();
    await chromaticDevice.connect();
    await streamPage.start();

    const initial = await readPanelState(page);
    expect(initial.exists).toBe(true);
    expect(initial.hasVisibleClass).toBe(false);

    await clickNotesButton(page);
    await expect
      .poll(async () => {
        const state = await readPanelState(page);
        return state.hasVisibleClass && state.opacity === '1' && state.onScreen;
      }, { timeout: 4000, message: 'a single click must open and keep the notes panel visible' })
      .toBe(true);

    await clickNotesButton(page);
    await expect
      .poll(async () => {
        const state = await readPanelState(page);
        return !state.hasVisibleClass && state.opacity === '0';
      }, { timeout: 4000, message: 'a second click must close the notes panel' })
      .toBe(true);
  });
});
