/**
 * UpdateSectionComponent Unit Tests
 *
 * The section UI binds to update-state/version/progress/badge signals fed by the UPDATE.* bus.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UpdateSectionComponent } from '@renderer/presentation/features/updates/update-section.component.js';
import { UpdateState } from '@platform/config';
import { createEventBus, createLoggerFactory } from '../../../../../factories/index.js';
import { EventChannels } from '@platform/events';

function createElements() {
  const make = (tag = 'div') => document.createElement(tag);
  return {
    section: make(),
    currentVersion: make('span'),
    statusIndicator: make(),
    statusText: make('span'),
    progressContainer: make(),
    progressFill: make(),
    progressText: make('span'),
    actionBtn: document.createElement('button'),
    badge: make()
  };
}

describe('UpdateSectionComponent', () => {
  let component;
  let eventBus;
  let updateService;
  let status;
  let elements;

  beforeEach(() => {
    vi.useFakeTimers();
    eventBus = createEventBus();
    status = { state: UpdateState.IDLE, updateInfo: null };
    updateService = {
      getStatus: vi.fn(() => status),
      checkForUpdates: vi.fn().mockResolvedValue(undefined),
      downloadUpdate: vi.fn().mockResolvedValue(undefined),
      installUpdate: vi.fn().mockResolvedValue(undefined)
    };
    elements = createElements();
    component = new UpdateSectionComponent({
      updateService,
      eventBus,
      loggerFactory: createLoggerFactory()
    });
    component.initialize(elements);
  });

  afterEach(() => {
    component.dispose();
    vi.useRealTimers();
  });

  it('renders the idle state on init', () => {
    expect(elements.statusText.textContent).toBe('Up to date');
    expect(elements.actionBtn.textContent).toBe('Check for Updates');
    expect(elements.progressContainer.classList.contains('hidden')).toBe(true);
  });

  it('reflects an available update', () => {
    eventBus.publish(EventChannels.UPDATE.STATE_CHANGED, {
      state: UpdateState.AVAILABLE,
      updateInfo: { version: '2.0.0' }
    });

    expect(elements.statusText.textContent).toBe('v2.0.0 available');
    expect(elements.statusText.classList.contains('highlight')).toBe(true);
    expect(elements.statusIndicator.classList.contains('available')).toBe(true);
    expect(elements.section.classList.contains('update-available')).toBe(true);
    expect(elements.actionBtn.textContent).toBe('Download Update');
  });

  it('shows downloading state, progress, and disables the button', () => {
    eventBus.publish(EventChannels.UPDATE.STATE_CHANGED, { state: UpdateState.DOWNLOADING, updateInfo: null });
    expect(elements.actionBtn.textContent).toBe('Downloading...');
    expect(elements.actionBtn.disabled).toBe(true);
    expect(elements.progressContainer.classList.contains('hidden')).toBe(false);

    eventBus.publish(EventChannels.UPDATE.PROGRESS, { percent: 42.6 });
    expect(elements.progressFill.style.width).toBe('42.6%');
    expect(elements.progressText.textContent).toBe('43%');
  });

  it('marks the downloaded state as install-ready', () => {
    eventBus.publish(EventChannels.UPDATE.STATE_CHANGED, {
      state: UpdateState.DOWNLOADED,
      updateInfo: { version: '2.0.0' }
    });

    expect(elements.actionBtn.textContent).toBe('Install & Restart');
    expect(elements.actionBtn.classList.contains('btn-install')).toBe(true);
    expect(elements.statusIndicator.classList.contains('downloaded')).toBe(true);
  });

  it('toggles the badge from BADGE_SHOW / BADGE_HIDE', () => {
    eventBus.publish(EventChannels.UPDATE.BADGE_SHOW);
    expect(elements.badge.classList.contains('hidden')).toBe(false);

    eventBus.publish(EventChannels.UPDATE.BADGE_HIDE);
    expect(elements.badge.classList.contains('hidden')).toBe(true);
  });

  it('flashes success when returning to up-to-date', () => {
    eventBus.publish(EventChannels.UPDATE.STATE_CHANGED, { state: UpdateState.CHECKING, updateInfo: null });
    eventBus.publish(EventChannels.UPDATE.STATE_CHANGED, { state: UpdateState.NOT_AVAILABLE, updateInfo: null });

    expect(elements.statusText.classList.contains('flash-success')).toBe(true);
    vi.advanceTimersByTime(1500);
    expect(elements.statusText.classList.contains('flash-success')).toBe(false);
  });

  it('routes the action click to the update service for the current state', async () => {
    status = { state: UpdateState.AVAILABLE, updateInfo: { version: '2.0.0' } };
    eventBus.publish(EventChannels.UPDATE.STATE_CHANGED, status);

    await component._handleActionClick();
    expect(updateService.downloadUpdate).toHaveBeenCalled();
  });
});
