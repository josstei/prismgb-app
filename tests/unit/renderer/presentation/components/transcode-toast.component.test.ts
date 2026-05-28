/**
 * TranscodeToastComponent Unit Tests
 * Tests the transcode progress indicator on the record button
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TranscodeToastComponent } from '@renderer/presentation/features/transcode/transcode-toast.component.js';
import { createTranscodeToastElementsMock } from '../../../../factories/index.js';

describe('TranscodeToastComponent', () => {
  let component;
  let mockElements;

  beforeEach(() => {
    vi.useFakeTimers();

    mockElements = createTranscodeToastElementsMock();

    component = new TranscodeToastComponent(mockElements);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should store elements reference', () => {
      expect(component.elements).toBe(mockElements);
    });

    it('should initialize hideTimeout as empty', () => {
      expect(component._disposables.managed.size).toBe(0);
    });

    it('should initialize isVisible as false', () => {
      expect(component._isVisible).toBe(false);
    });
  });

  describe('show', () => {
    it('should add transcoding class to record button', () => {
      component.show('MP4');
      expect(mockElements.recordBtn.classList.add).toHaveBeenCalledWith('transcoding');
    });

    it('should remove success and error classes', () => {
      component.show('MP4');
      expect(mockElements.recordBtn.classList.remove).toHaveBeenCalledWith('transcode-success', 'transcode-error');
    });

    it('should reset progress ring to 0', () => {
      component.show('MP4');
      expect(mockElements.transcodeRing.style.setProperty).toHaveBeenCalledWith('--progress', '0');
    });

    it('should clear percentage label', () => {
      mockElements.transcodePercentLabel.textContent = '50%';
      component.show('MP4');
      expect(mockElements.transcodePercentLabel.textContent).toBe('');
    });

    it('should set isVisible to true', () => {
      component.show('MP4');
      expect(component._isVisible).toBe(true);
    });

    it('should clear pending hide timeout', () => {
      component.showSuccess();
      expect(component._disposables.managed.size).toBe(1);
      component.show('MP4');
      expect(component._disposables.managed.size).toBe(0);
    });

    it('should not throw when recordBtn is missing', () => {
      component.elements.recordBtn = null;
      expect(() => component.show('MP4')).not.toThrow();
    });

    it('should handle missing transcodeRing gracefully', () => {
      component.elements.transcodeRing = null;
      expect(() => component.show('MP4')).not.toThrow();
    });

    it('should handle missing transcodePercentLabel gracefully', () => {
      component.elements.transcodePercentLabel = null;
      expect(() => component.show('MP4')).not.toThrow();
    });

    it('should work without format parameter (defaults to MP4)', () => {
      expect(() => component.show()).not.toThrow();
      expect(component._isVisible).toBe(true);
    });
  });

  describe('updateProgress', () => {
    beforeEach(() => {
      component.show('MP4');
    });

    it('should update progress ring CSS property', () => {
      component.updateProgress(50);
      expect(mockElements.transcodeRing.style.setProperty).toHaveBeenCalledWith('--progress', '50');
    });

    it('should update percentage label', () => {
      component.updateProgress(75);
      expect(mockElements.transcodePercentLabel.textContent).toBe('75%');
    });

    it('should ignore negative values (keep spinning)', () => {
      // Clear mocks from show() call
      mockElements.transcodeRing.style.setProperty.mockClear();

      component.updateProgress(-10);
      // Negative values should be ignored (kept spinning)
      expect(mockElements.transcodeRing.style.setProperty).not.toHaveBeenCalled();
    });

    it('should clamp progress to 100 maximum', () => {
      component.updateProgress(150);
      expect(mockElements.transcodeRing.style.setProperty).toHaveBeenCalledWith('--progress', '100');
      expect(mockElements.transcodePercentLabel.textContent).toBe('100%');
    });

    it('should round progress to integer', () => {
      component.updateProgress(33.7);
      expect(mockElements.transcodeRing.style.setProperty).toHaveBeenCalledWith('--progress', '34');
      expect(mockElements.transcodePercentLabel.textContent).toBe('34%');
    });

    it('should not update when not visible', () => {
      component._isVisible = false;
      component.updateProgress(50);
      // Should not set property after initial show reset
      expect(mockElements.transcodeRing.style.setProperty).toHaveBeenCalledTimes(1); // Only from show()
    });

    it('should handle 0 percent by keeping spinner', () => {
      component.updateProgress(0);
      // 0 or negative should not update (keep spinning)
      expect(mockElements.transcodePercentLabel.textContent).toBe('');
    });

    it('should handle negative percent by keeping spinner', () => {
      component.updateProgress(-1);
      expect(mockElements.transcodePercentLabel.textContent).toBe('');
    });

    it('should handle missing transcodeRing gracefully', () => {
      component.elements.transcodeRing = null;
      expect(() => component.updateProgress(50)).not.toThrow();
    });

    it('should handle missing transcodePercentLabel gracefully', () => {
      component.elements.transcodePercentLabel = null;
      expect(() => component.updateProgress(50)).not.toThrow();
    });
  });

  describe('showSuccess', () => {
    beforeEach(() => {
      component.show('MP4');
    });

    it('should remove transcoding class', () => {
      component.showSuccess();
      expect(mockElements.recordBtn.classList.remove).toHaveBeenCalledWith('transcoding');
    });

    it('should add transcode-success class', () => {
      component.showSuccess();
      expect(mockElements.recordBtn.classList.add).toHaveBeenCalledWith('transcode-success');
    });

    it('should show checkmark in label', () => {
      component.showSuccess();
      expect(mockElements.transcodePercentLabel.textContent).toBe('\u2713');
    });

    it('should hide after 1200ms delay', () => {
      component.showSuccess();

      expect(component._isVisible).toBe(true);

      vi.advanceTimersByTime(1200);

      expect(mockElements.recordBtn.classList.remove).toHaveBeenCalledWith('transcoding', 'transcode-success', 'transcode-error');
    });

    it('should not throw when recordBtn is missing', () => {
      component.elements.recordBtn = null;
      expect(() => component.showSuccess()).not.toThrow();
    });

    it('should handle missing transcodePercentLabel gracefully', () => {
      component.elements.transcodePercentLabel = null;
      expect(() => component.showSuccess()).not.toThrow();
    });
  });

  describe('showError', () => {
    beforeEach(() => {
      component.show('MP4');
    });

    it('should remove transcoding class', () => {
      component.showError('Failed');
      expect(mockElements.recordBtn.classList.remove).toHaveBeenCalledWith('transcoding');
    });

    it('should add transcode-error class', () => {
      component.showError('Failed');
      expect(mockElements.recordBtn.classList.add).toHaveBeenCalledWith('transcode-error');
    });

    it('should show X mark in label', () => {
      component.showError('Failed');
      expect(mockElements.transcodePercentLabel.textContent).toBe('\u2717');
    });

    it('should hide after 2000ms delay', () => {
      component.showError('Failed');

      expect(component._isVisible).toBe(true);

      vi.advanceTimersByTime(2000);

      expect(mockElements.recordBtn.classList.remove).toHaveBeenCalledWith('transcoding', 'transcode-success', 'transcode-error');
    });

    it('should not throw when recordBtn is missing', () => {
      component.elements.recordBtn = null;
      expect(() => component.showError('Failed')).not.toThrow();
    });

    it('should handle missing transcodePercentLabel gracefully', () => {
      component.elements.transcodePercentLabel = null;
      expect(() => component.showError('Failed')).not.toThrow();
    });

    it('should work without message parameter', () => {
      expect(() => component.showError()).not.toThrow();
    });
  });

  describe('hide', () => {
    beforeEach(() => {
      component.show('MP4');
    });

    it('should remove all state classes', () => {
      component.hide();
      expect(mockElements.recordBtn.classList.remove).toHaveBeenCalledWith('transcoding', 'transcode-success', 'transcode-error');
    });

    it('should reset progress ring to 0', () => {
      component.hide();
      expect(mockElements.transcodeRing.style.setProperty).toHaveBeenCalledWith('--progress', '0');
    });

    it('should clear percentage label', () => {
      mockElements.transcodePercentLabel.textContent = '50%';
      component.hide();
      expect(mockElements.transcodePercentLabel.textContent).toBe('');
    });

    it('should set isVisible to false', () => {
      component.hide();
      expect(component._isVisible).toBe(false);
    });

    it('should clear pending hide timeout', () => {
      component.showSuccess();
      expect(component._disposables.managed.size).toBe(1);
      component.hide();
      expect(component._disposables.managed.size).toBe(0);
    });

    it('should not throw when recordBtn is missing', () => {
      component.elements.recordBtn = null;
      expect(() => component.hide()).not.toThrow();
    });

    it('should handle missing transcodeRing gracefully', () => {
      component.elements.transcodeRing = null;
      expect(() => component.hide()).not.toThrow();
    });

    it('should handle missing transcodePercentLabel gracefully', () => {
      component.elements.transcodePercentLabel = null;
      expect(() => component.hide()).not.toThrow();
    });
  });

  describe('isVisible getter', () => {
    it('should return false initially', () => {
      expect(component.isVisible).toBe(false);
    });

    it('should return true after show', () => {
      component.show('MP4');
      expect(component.isVisible).toBe(true);
    });

    it('should return false after hide', () => {
      component.show('MP4');
      component.hide();
      expect(component.isVisible).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clear pending timeout', () => {
      component.showSuccess();
      expect(component._disposables.managed.size).toBe(1);
      component.dispose();
      expect(component._disposables.managed.size).toBe(0);
    });

    it('should call hide', () => {
      component.show('MP4');
      component.dispose();
      expect(component._isVisible).toBe(false);
    });

    it('should be safe to call multiple times', () => {
      component.dispose();
      expect(() => component.dispose()).not.toThrow();
    });
  });

  describe('Integration - Full Workflow', () => {
    it('should handle complete success workflow', () => {
      // Start
      component.show('MP4');
      expect(component.isVisible).toBe(true);
      expect(mockElements.recordBtn.classList.add).toHaveBeenCalledWith('transcoding');

      // Progress updates
      component.updateProgress(25);
      expect(mockElements.transcodePercentLabel.textContent).toBe('25%');

      component.updateProgress(50);
      expect(mockElements.transcodePercentLabel.textContent).toBe('50%');

      component.updateProgress(100);
      expect(mockElements.transcodePercentLabel.textContent).toBe('100%');

      // Success
      component.showSuccess();
      expect(mockElements.transcodePercentLabel.textContent).toBe('\u2713');

      // Auto-hide after delay
      vi.advanceTimersByTime(1200);
      expect(component.isVisible).toBe(false);
    });

    it('should handle error workflow', () => {
      // Start
      component.show('MOV');
      expect(component.isVisible).toBe(true);

      // Progress
      component.updateProgress(30);

      // Error
      component.showError('Encoder failed');
      expect(mockElements.transcodePercentLabel.textContent).toBe('\u2717');
      expect(mockElements.recordBtn.classList.add).toHaveBeenCalledWith('transcode-error');

      // Auto-hide after delay
      vi.advanceTimersByTime(2000);
      expect(component.isVisible).toBe(false);
    });

    it('should handle cancellation workflow', () => {
      // Start
      component.show('MP4');
      component.updateProgress(45);

      // Cancelled
      component.hide();
      expect(component.isVisible).toBe(false);
      expect(mockElements.transcodePercentLabel.textContent).toBe('');
    });

    it('should handle rapid show/hide cycles', () => {
      component.show('MP4');
      component.showSuccess();
      expect(component._disposables.managed.size).toBe(1);
      component.show('MOV'); // Immediately start new transcode

      // Should clear the pending hide timeout from success
      expect(component._disposables.managed.size).toBe(0);
      expect(component.isVisible).toBe(true);
    });
  });
});
