/**
 * BodyClassManager Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { BodyClassManager } from '@renderer/ui/effects/body-class.class.js';

describe('BodyClassManager', () => {
  let manager;

  beforeEach(() => {
    manager = new BodyClassManager();
    document.body.className = '';
  });

  afterEach(() => {
    document.body.className = '';
  });

  describe('setStreaming', () => {
    it('should add app-streaming class when streaming is true', () => {
      manager.setStreaming(true);
      expect(document.body.classList.contains('app-streaming')).toBe(true);
    });

    it('should remove app-idle class when streaming is true', () => {
      document.body.classList.add('app-idle');
      manager.setStreaming(true);
      expect(document.body.classList.contains('app-idle')).toBe(false);
    });

    it('should remove app-streaming class when streaming is false', () => {
      document.body.classList.add('app-streaming');
      manager.setStreaming(false);
      expect(document.body.classList.contains('app-streaming')).toBe(false);
    });
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

  describe('multiple class management', () => {
    it('should handle multiple classes simultaneously', () => {
      manager.setStreaming(true);
      manager.setHidden(true);
      manager.setAnimationsOff(true);

      expect(document.body.classList.contains('app-streaming')).toBe(true);
      expect(document.body.classList.contains('app-hidden')).toBe(true);
      expect(document.body.classList.contains('app-animations-off')).toBe(true);
    });

    it('should independently manage different classes', () => {
      manager.setStreaming(true);
      // Note: setStreaming(true) removes app-idle, so we need to set idle after streaming

      expect(document.body.classList.contains('app-streaming')).toBe(true);
      expect(document.body.classList.contains('app-idle')).toBe(false);

      manager.setStreaming(false);
      manager.setIdle(true);

      expect(document.body.classList.contains('app-streaming')).toBe(false);
      expect(document.body.classList.contains('app-idle')).toBe(true);
    });
  });
});
