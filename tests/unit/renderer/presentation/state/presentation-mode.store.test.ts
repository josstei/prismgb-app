import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { PresentationModeStore } from '../../../../../src/renderer/presentation/state/presentation-mode.store.js';
import { signal, type Signal } from '@platform/ui-base/reactive';
import { SharedEventBus, EventChannels } from '@platform/events';

describe('PresentationModeStore', () => {
  let bus: SharedEventBus;
  let cinematicEnabled: Signal<boolean>;
  let store: PresentationModeStore;

  beforeEach(() => {
    bus = new SharedEventBus();
    cinematicEnabled = signal(false);
    store = new PresentationModeStore({ eventBus: bus, cinematicEnabled });
  });

  afterEach(() => {
    store.dispose();
  });

  it('gates cinematicActive on cinematicEnabled AND streaming', () => {
    expect(store.cinematicActive.value).toBe(false);

    cinematicEnabled.value = true;
    expect(store.cinematicActive.value).toBe(false);

    bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });
    expect(store.cinematicActive.value).toBe(true);

    bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });
    expect(store.cinematicActive.value).toBe(false);
  });

  it('gates minimalistActive on minimalist AND fullscreen AND streaming', () => {
    bus.publish(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, true);
    bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
    expect(store.minimalistActive.value).toBe(false);

    bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });
    expect(store.minimalistActive.value).toBe(true);

    bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
    expect(store.minimalistActive.value).toBe(false);
  });

  it('reflects fullscreen state on the single-input signal', () => {
    expect(store.fullscreenActive.value).toBe(false);
    bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
    expect(store.fullscreenActive.value).toBe(true);
  });

  it('ignores malformed payloads', () => {
    bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: 'yes' });
    bus.publish(EventChannels.UI.FULLSCREEN_STATE, {});
    bus.publish(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, 'true');
    expect(store.fullscreenActive.value).toBe(false);
    cinematicEnabled.value = true;
    expect(store.cinematicActive.value).toBe(false);
  });

  it('stops reacting after dispose', () => {
    store.dispose();
    cinematicEnabled.value = true;
    bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });
    expect(store.cinematicActive.value).toBe(false);
  });
});
