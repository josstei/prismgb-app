/**
 * BodyClassManager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BodyClassManager } from '@renderer/presentation/effects/body-class-manager';
import { PresentationModeStore } from '@renderer/presentation/state/presentation-mode.store.js';
import { signal } from '@platform/ui-base/reactive';
import { PlatformEventBus, EventChannels } from '@platform/events';

describe('BodyClassManager', () => {
  let manager;

  beforeEach(() => {
    vi.useFakeTimers();
    manager = new BodyClassManager();
    document.body.className = '';
  });

  afterEach(() => {
    manager?.dispose();
    document.body.className = '';
  });

  describe('setIdle', () => {
    it('should add app-idle class when idle is true', () => {
      manager.setIdle(true);
      expect(document.body.classList.contains('app-idle')).toBe(true);
    });

    it('should remove app-idle class when idle is false', () => {
      document.body.classList.add('app-idle');
      manager.setIdle(false);
      expect(document.body.classList.contains('app-idle')).toBe(false);
    });
  });

  describe('setHidden', () => {
    it('should add app-hidden class when hidden is true', () => {
      manager.setHidden(true);
      expect(document.body.classList.contains('app-hidden')).toBe(true);
    });

    it('should remove app-hidden class when hidden is false', () => {
      document.body.classList.add('app-hidden');
      manager.setHidden(false);
      expect(document.body.classList.contains('app-hidden')).toBe(false);
    });
  });

  describe('setAnimationsOff', () => {
    it('should add app-animations-off class when animationsOff is true', () => {
      manager.setAnimationsOff(true);
      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });

    it('should remove app-animations-off class when animationsOff is false', () => {
      document.body.classList.add('app-animations-off');
      manager.setAnimationsOff(false);
      expect(document.body.classList.contains('app-animations-off')).toBe(false);
    });
  });

  describe('areAnimationsOff', () => {
    it('should return true when animations are off', () => {
      manager.setAnimationsOff(true);
      expect(manager.areAnimationsOff()).toBe(true);
    });

    it('should return false when animations are on', () => {
      manager.setAnimationsOff(false);
      expect(manager.areAnimationsOff()).toBe(false);
    });
  });

  describe('setStreamingMode', () => {
    it('should add streaming-mode class when true', () => {
      manager.setStreamingMode(true);
      expect(document.body.classList.contains('streaming-mode')).toBe(true);
    });

    it('should remove streaming-mode class when false', () => {
      document.body.classList.add('streaming-mode');
      manager.setStreamingMode(false);
      expect(document.body.classList.contains('streaming-mode')).toBe(false);
    });
  });

  describe('setMinimalistFullscreen', () => {
    it('should add minimalist-fullscreen class when true', () => {
      manager.setMinimalistFullscreen(true);
      expect(document.body.classList.contains('minimalist-fullscreen')).toBe(true);
    });

    it('should remove minimalist-fullscreen class when false', () => {
      document.body.classList.add('minimalist-fullscreen');
      manager.setMinimalistFullscreen(false);
      expect(document.body.classList.contains('minimalist-fullscreen')).toBe(false);
    });

    it('should add transition class during transition', () => {
      manager.setMinimalistFullscreen(true);
      expect(document.body.classList.contains('minimalist-transition')).toBe(true);
    });

    it('should remove transition class after timeout', () => {
      manager.setMinimalistFullscreen(true);
      expect(document.body.classList.contains('minimalist-transition')).toBe(true);

      vi.advanceTimersByTime(500); // TIMING.MINIMALIST_TRANSITION_MS
      expect(document.body.classList.contains('minimalist-transition')).toBe(false);
    });

    it('should not re-trigger if already in same state', () => {
      document.body.classList.add('minimalist-fullscreen');
      manager.setMinimalistFullscreen(true);
      // Should not add transition class since already active
      expect(document.body.classList.contains('minimalist-transition')).toBe(false);
    });

    it('should cancel previous transition timer on rapid changes', () => {
      manager.setMinimalistFullscreen(true);
      vi.advanceTimersByTime(200);

      manager.setMinimalistFullscreen(false);
      vi.advanceTimersByTime(200);

      manager.setMinimalistFullscreen(true);
      vi.advanceTimersByTime(500);

      expect(document.body.classList.contains('minimalist-transition')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clear transition timer on dispose', () => {
      manager.setMinimalistFullscreen(true);
      expect(document.body.classList.contains('minimalist-transition')).toBe(true);

      manager.dispose();

      // Transition class should be removed immediately
      expect(document.body.classList.contains('minimalist-transition')).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        manager.dispose();
        manager.dispose();
      }).not.toThrow();
    });
  });

  describe('multiple class management', () => {
    it('should handle multiple classes simultaneously', () => {
      manager.setStreamingMode(true);
      manager.setHidden(true);
      manager.setAnimationsOff(true);

      expect(document.body.classList.contains('streaming-mode')).toBe(true);
      expect(document.body.classList.contains('app-hidden')).toBe(true);
      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });

    it('should independently manage different classes', () => {
      manager.setStreamingMode(true);
      manager.setIdle(true);

      expect(document.body.classList.contains('streaming-mode')).toBe(true);
      expect(document.body.classList.contains('app-idle')).toBe(true);

      manager.setStreamingMode(false);
      manager.setIdle(false);

      expect(document.body.classList.contains('streaming-mode')).toBe(false);
      expect(document.body.classList.contains('app-idle')).toBe(false);
    });
  });

  describe('bindPresentationMode', () => {
    let bus;
    let cinematicEnabled;
    let store;

    beforeEach(() => {
      bus = new PlatformEventBus();
      cinematicEnabled = signal(false);
      store = new PresentationModeStore({ eventBus: bus, cinematicEnabled });
      manager.bindPresentationMode(store);
    });

    it('toggles cinematic-active from the gated cinematic && streaming composite', () => {
      cinematicEnabled.value = true;
      bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });
      expect(document.body.classList.contains('cinematic-active')).toBe(true);

      bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: false });
      expect(document.body.classList.contains('cinematic-active')).toBe(false);
    });

    it('toggles fullscreen-active from the fullscreen signal', () => {
      bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
      expect(document.body.classList.contains('fullscreen-active')).toBe(true);
    });

    it('applies minimalist-fullscreen with the transition class, then clears the transition', () => {
      bus.publish(EventChannels.SETTINGS.MINIMALIST_FULLSCREEN_CHANGED, true);
      bus.publish(EventChannels.UI.FULLSCREEN_STATE, { active: true });
      bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });

      expect(document.body.classList.contains('minimalist-fullscreen')).toBe(true);
      expect(document.body.classList.contains('minimalist-transition')).toBe(true);

      vi.advanceTimersByTime(5000);
      expect(document.body.classList.contains('minimalist-transition')).toBe(false);
      expect(document.body.classList.contains('minimalist-fullscreen')).toBe(true);
    });

    it('tears down store subscriptions and bindings on dispose', () => {
      manager.dispose();
      cinematicEnabled.value = true;
      bus.publish(EventChannels.UI.STREAMING_MODE, { enabled: true });
      expect(document.body.classList.contains('cinematic-active')).toBe(false);
    });
  });
});
