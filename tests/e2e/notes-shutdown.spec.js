import { test, expect } from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { launchTestApp } from './fixtures/electron.fixture.js';
import { AppShellPage } from './pages/app-shell.page.js';

async function quitApplication(application) {
  const closed = application.waitForEvent('close');
  await application.evaluate(({ app }) => app.quit());
  await closed;
}

test('quitting flushes a pending note edit before the renderer closes', async () => {
  test.setTimeout(60000);
  const profile = await mkdtemp(path.join(os.tmpdir(), 'prismgb-notes-shutdown-'));
  const applications = new Set();
  const title = 'Saved while quitting';
  const content = 'The final route change must survive without waiting for autosave.';

  try {
    const first = await launchTestApp(profile);
    applications.add(first);
    first.on('close', () => applications.delete(first));
    const page = await first.firstWindow();
    await new AppShellPage(page).waitForReady();
    await page.evaluate(() => {
      document.getElementById('notesBtn').click();
      document.getElementById('notesNewBtn').click();
    });
    await expect(page.locator('#notesTitleInput')).toHaveValue('Untitled Note');

    // Keep autosave pending deterministically. IPC still runs while browser timers
    // are paused, so only the application's shutdown flush can persist this edit.
    await page.clock.install();
    await page.clock.pauseAt(new Date());
    const beforeQuit = await page.evaluate(({ title, content }) => {
      const titleInput = document.getElementById('notesTitleInput');
      const contentArea = document.getElementById('notesContentArea');
      titleInput.value = title;
      contentArea.value = content;
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      contentArea.dispatchEvent(new Event('input', { bubbles: true }));
      return JSON.parse(localStorage.getItem('userNotes'));
    }, { title, content });
    expect(beforeQuit).toHaveLength(1);
    expect(beforeQuit[0]).toMatchObject({ title: 'Untitled Note', content: '' });

    await quitApplication(first);

    const reopened = await launchTestApp(profile);
    applications.add(reopened);
    reopened.on('close', () => applications.delete(reopened));
    const reopenedPage = await reopened.firstWindow();
    await new AppShellPage(reopenedPage).waitForReady();
    await reopenedPage.evaluate(() => document.getElementById('notesBtn').click());
    await expect(reopenedPage.locator('.note-list-item-title')).toHaveText(title);
    await reopenedPage.evaluate(() => document.querySelector('.note-list-item').click());
    await expect(reopenedPage.locator('#notesTitleInput')).toHaveValue(title);
    await expect(reopenedPage.locator('#notesContentArea')).toHaveValue(content);
    await quitApplication(reopened);
  } finally {
    for (const application of applications) {
      await application.close();
    }
    await rm(profile, { recursive: true, force: true });
  }
});
