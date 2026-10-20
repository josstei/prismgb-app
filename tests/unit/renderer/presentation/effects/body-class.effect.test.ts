import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { signal } from '@preact/signals-core';
import { BodyClassEffect } from '@renderer/presentation/effects/body-class.effect';
import { PresentationModeStore } from '@renderer/presentation/state/presentation-mode.store';
import { EventChannels } from '@renderer/lib/events/event-channels';
import { EventBus } from '@renderer/lib/events/event-bus';
import { TIMING } from '@renderer/lib/timing.config';

describe('BodyClassEffect', () => {
  let bus: EventBus;
  let cinematicEnabled: ReturnType<typeof signal<boolean>>;
  let effect: BodyClassEffect;

  const has = (className: string) => document.body.classList.contains(className);
  const enterMinimalist = () => {
    bus.publish(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, true);
    bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
    bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });
  };

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.className = '';
    bus = new EventBus();
    cinematicEnabled = signal(false);
    effect = new BodyClassEffect(new PresentationModeStore({ eventBus: bus, cinematicEnabled }));
  });

  afterEach(async () => {
    await effect.dispose();
    vi.useRealTimers();
    document.body.className = '';
  });

  describe('imperative classes', () => {
    it.each([
      ['setIdle', 'app-idle'],
      ['setHidden', 'app-hidden'],
      ['setAnimationsOff', 'app-animations-off'],
      ['setStreamingMode', 'streaming-mode']
    ] as const)('%s toggles %s', (method, className) => {
      effect[method](true);
      expect(has(className)).toBe(true);

      effect[method](false);
      expect(has(className)).toBe(false);
    });

    it('reports whether animations are off', () => {
      effect.setAnimationsOff(true);
      expect(effect.areAnimationsOff()).toBe(true);

      effect.setAnimationsOff(false);
      expect(effect.areAnimationsOff()).toBe(false);
    });

    it('manages classes independently', () => {
      effect.setStreamingMode(true);
      effect.setIdle(true);
      effect.setIdle(false);

      expect(has('streaming-mode')).toBe(true);
      expect(has('app-idle')).toBe(false);
    });
  });

  describe('presentation mode', () => {
    it('toggles cinematic-active only while cinematic mode is enabled and streaming', () => {
      bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });
      expect(has('cinematic-active')).toBe(false);

      cinematicEnabled.value = true;
      expect(has('cinematic-active')).toBe(true);

      bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });
      expect(has('cinematic-active')).toBe(false);
    });

    it('toggles fullscreen-active from the fullscreen state', () => {
      bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
      expect(has('fullscreen-active')).toBe(true);

      bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
      expect(has('fullscreen-active')).toBe(false);
    });

    it('requires minimalist, fullscreen and streaming together', () => {
      bus.publish(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, true);
      bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
      expect(has('minimalist-fullscreen')).toBe(false);

      bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });
      expect(has('minimalist-fullscreen')).toBe(true);

      bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
      expect(has('minimalist-fullscreen')).toBe(false);
    });

    it('runs the minimalist transition class for its duration on each change', () => {
      enterMinimalist();
      expect(has('minimalist-transition')).toBe(true);

      vi.advanceTimersByTime(TIMING.MINIMALIST_TRANSITION_MS - 1);
      expect(has('minimalist-transition')).toBe(true);
      vi.advanceTimersByTime(1);
      expect(has('minimalist-transition')).toBe(false);
      expect(has('minimalist-fullscreen')).toBe(true);

      bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });
      expect(has('minimalist-transition')).toBe(true);
      expect(has('minimalist-fullscreen')).toBe(false);
    });

    it('restarts the transition timer on rapid changes', () => {
      enterMinimalist();
      vi.advanceTimersByTime(200);
      bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });
      vi.advanceTimersByTime(200);

      expect(has('minimalist-transition')).toBe(true);
      vi.advanceTimersByTime(TIMING.MINIMALIST_TRANSITION_MS - 200);
      expect(has('minimalist-transition')).toBe(false);
    });

    it('skips the transition when the class already matches', () => {
      document.body.classList.add('minimalist-fullscreen');

      enterMinimalist();

      expect(has('minimalist-transition')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('removes the transition class and stops the bindings', async () => {
      enterMinimalist();

      await effect.dispose();
      expect(has('minimalist-transition')).toBe(false);

      cinematicEnabled.value = true;
      bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: false });
      expect(has('cinematic-active')).toBe(false);
      expect(has('fullscreen-active')).toBe(true);
      expect(has('minimalist-fullscreen')).toBe(true);
    });

    it('is safe to call twice', async () => {
      await effect.dispose();
      await expect(Promise.resolve(effect.dispose())).resolves.toBeUndefined();
    });
  });
});
