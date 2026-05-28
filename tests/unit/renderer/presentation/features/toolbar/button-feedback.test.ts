// @ts-nocheck
/**
 * ButtonFeedback Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ButtonFeedback } from '@renderer/presentation/effects/button-feedback.effect.ts';

describe('ButtonFeedback', () => {
  let buttonFeedback;
  let mockRecordBtn;

  beforeEach(() => {
    mockRecordBtn = document.createElement('button');
    mockRecordBtn.id = 'recordBtn';
    document.body.appendChild(mockRecordBtn);

    buttonFeedback = new ButtonFeedback({
      elements: {
        recordBtn: mockRecordBtn
      }
    });

    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    buttonFeedback.dispose();
    document.body.innerHTML = '';
  });

  describe('triggerRecordButtonPop', () => {
    it('should add btn-pop class to record button', () => {
      buttonFeedback.triggerRecordButtonPop();

      expect(mockRecordBtn.classList.contains('btn-pop')).toBe(true);
    });

    it('should remove btn-pop class after timeout', () => {
      buttonFeedback.triggerRecordButtonPop();

      vi.advanceTimersByTime(300);

      expect(mockRecordBtn.classList.contains('btn-pop')).toBe(false);
    });
  });

  describe('triggerRecordButtonPress', () => {
    it('should add btn-press class to record button', () => {
      buttonFeedback.triggerRecordButtonPress();

      expect(mockRecordBtn.classList.contains('btn-press')).toBe(true);
    });

    it('should remove btn-press class after timeout', () => {
      buttonFeedback.triggerRecordButtonPress();

      vi.advanceTimersByTime(300);

      expect(mockRecordBtn.classList.contains('btn-press')).toBe(false);
    });
  });

  describe('triggerButtonFeedback', () => {
    it('should do nothing if element not found', () => {
      buttonFeedback.triggerButtonFeedback('nonExistent', 'test-class', 100);
      // Should not throw
    });

    it('should remove existing class before adding', () => {
      mockRecordBtn.classList.add('test-class');

      buttonFeedback.triggerButtonFeedback('recordBtn', 'test-class', 100);

      expect(mockRecordBtn.classList.contains('test-class')).toBe(true);
    });
  });

  describe('setRecordingButtonState', () => {
    it('should add recording class when active', () => {
      buttonFeedback.setRecordingButtonState(mockRecordBtn, true);

      expect(mockRecordBtn.classList.contains('recording')).toBe(true);
    });

    it('should remove recording class when not active', () => {
      mockRecordBtn.classList.add('recording');

      buttonFeedback.setRecordingButtonState(mockRecordBtn, false);

      expect(mockRecordBtn.classList.contains('recording')).toBe(false);
    });

    it('should do nothing if element is null', () => {
      expect(() => buttonFeedback.setRecordingButtonState(null, true)).not.toThrow();
    });
  });

  describe('dispose', () => {
    it('should clear all active timeouts', () => {
      buttonFeedback.triggerRecordButtonPop();
      buttonFeedback.triggerRecordButtonPress();

      buttonFeedback.dispose();

      expect(buttonFeedback._disposables.size).toBe(0);
    });

    it('should set elements to null', () => {
      buttonFeedback.dispose();

      expect(buttonFeedback.elements).toBeNull();
    });
  });
});
