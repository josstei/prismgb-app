/**
 * VolumeControl Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VolumeControl } from '@ui/components/volume-control.js';

describe('VolumeControl', () => {
  let volumeControl;
  let mockElements;
  let mockVolumeWave1;
  let mockVolumeWave2;

  beforeEach(() => {
    // Mock DOM elements with classList for CSS-class-based visibility
    mockVolumeWave1 = {
      classList: {
        add: vi.fn(),
        remove: vi.fn()
      }
    };
    mockVolumeWave2 = {
      classList: {
        add: vi.fn(),
        remove: vi.fn()
      }
    };

    mockElements = {
      volumeSlider: { value: 70 },
      volumePercentage: { textContent: '70%' },
      volumeSliderContainer: {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      },
      streamVideo: { volume: 0.7 },
      volumeWave1: mockVolumeWave1,
      volumeWave2: mockVolumeWave2
    };

    // Mock document.getElementById
    global.document = {
      getElementById: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    };

    volumeControl = new VolumeControl(mockElements);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should initialize with elements', () => {
      expect(volumeControl.elements).toBe(mockElements);
    });

    it('should use provided volume wave elements', () => {
      expect(volumeControl.volumeWave1).toBe(mockVolumeWave1);
      expect(volumeControl.volumeWave2).toBe(mockVolumeWave2);
    });
  });

  describe('updateIcon', () => {
    it('should hide both waves when muted (volume = 0)', () => {
      volumeControl.updateIcon(0);

      expect(mockVolumeWave1.classList.add).toHaveBeenCalledWith('hidden');
      expect(mockVolumeWave2.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should show only wave1 for low volume (< 50)', () => {
      volumeControl.updateIcon(30);

      expect(mockVolumeWave1.classList.remove).toHaveBeenCalledWith('hidden');
      expect(mockVolumeWave2.classList.add).toHaveBeenCalledWith('hidden');
    });

    it('should show both waves for high volume (>= 50)', () => {
      volumeControl.updateIcon(75);

      expect(mockVolumeWave1.classList.remove).toHaveBeenCalledWith('hidden');
      expect(mockVolumeWave2.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should show both waves at exactly 50', () => {
      volumeControl.updateIcon(50);

      expect(mockVolumeWave1.classList.remove).toHaveBeenCalledWith('hidden');
      expect(mockVolumeWave2.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should show both waves at 100', () => {
      volumeControl.updateIcon(100);

      expect(mockVolumeWave1.classList.remove).toHaveBeenCalledWith('hidden');
      expect(mockVolumeWave2.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should show wave1 only at 49', () => {
      volumeControl.updateIcon(49);

      expect(mockVolumeWave1.classList.remove).toHaveBeenCalledWith('hidden');
      expect(mockVolumeWave2.classList.add).toHaveBeenCalledWith('hidden');
    });
  });

  describe('updateDisplay', () => {
    it('should update slider value', () => {
      volumeControl.updateDisplay(50);
      expect(mockElements.volumeSlider.value).toBe(50);
    });

    it('should update percentage text', () => {
      volumeControl.updateDisplay(85);
      expect(mockElements.volumePercentage.textContent).toBe('85%');
    });

    it('should call updateIcon', () => {
      const spy = vi.spyOn(volumeControl, 'updateIcon');
      volumeControl.updateDisplay(60);
      expect(spy).toHaveBeenCalledWith(60);
    });
  });

  describe('applyToVideo', () => {
    it('should set video volume (normalized to 0-1)', () => {
      volumeControl.applyToVideo(50);
      expect(mockElements.streamVideo.volume).toBe(0.5);
    });

    it('should set video volume to 0 for muted', () => {
      volumeControl.applyToVideo(0);
      expect(mockElements.streamVideo.volume).toBe(0);
    });

    it('should set video volume to 1 for max', () => {
      volumeControl.applyToVideo(100);
      expect(mockElements.streamVideo.volume).toBe(1);
    });

    it('should handle missing video element', () => {
      volumeControl.elements.streamVideo = null;
      expect(() => volumeControl.applyToVideo(50)).not.toThrow();
    });
  });

  describe('setVolume', () => {
    it('should update display and apply to video', () => {
      const displaySpy = vi.spyOn(volumeControl, 'updateDisplay');
      const applySpy = vi.spyOn(volumeControl, 'applyToVideo');

      volumeControl.setVolume(75);

      expect(displaySpy).toHaveBeenCalledWith(75);
      expect(applySpy).toHaveBeenCalledWith(75);
    });
  });

  describe('hideSlider', () => {
    it('should hide the slider container', () => {
      volumeControl.hideSlider();

      expect(mockElements.volumeSliderContainer.classList.remove).toHaveBeenCalledWith('visible');
    });
  });

  describe('showSlider', () => {
    it('should show the slider container', () => {
      volumeControl.showSlider();

      expect(mockElements.volumeSliderContainer.classList.add).toHaveBeenCalledWith('visible');
    });
  });

  describe('setupClickOutside', () => {
    it('should add click event listener to document via manager', () => {
      volumeControl.setupClickOutside();

      expect(document.addEventListener).toHaveBeenCalledWith('click', expect.any(Function), undefined);
      expect(volumeControl._domListeners.count()).toBe(1);
    });

    it('should hide slider when clicking outside volume-control', () => {
      volumeControl.setupClickOutside();
      const hideSpy = vi.spyOn(volumeControl, 'hideSlider');

      // Get the handler that was registered
      const handler = document.addEventListener.mock.calls[0][1];

      // Simulate click outside
      const mockEvent = {
        target: {
          closest: vi.fn(() => null)
        }
      };
      handler(mockEvent);

      expect(hideSpy).toHaveBeenCalled();
    });

    it('should not hide slider when clicking inside volume-control', () => {
      volumeControl.setupClickOutside();
      const hideSpy = vi.spyOn(volumeControl, 'hideSlider');

      // Get the handler that was registered
      const handler = document.addEventListener.mock.calls[0][1];

      // Simulate click inside (returns a truthy value to indicate match found)
      const mockEvent = {
        target: {
          closest: vi.fn(() => ({ className: 'volume-control' }))
        }
      };
      handler(mockEvent);

      expect(hideSpy).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should remove all listeners via manager', () => {
      volumeControl.setupClickOutside();
      expect(volumeControl._domListeners.count()).toBe(1);

      volumeControl.dispose();

      expect(document.removeEventListener).toHaveBeenCalledWith('click', expect.any(Function), undefined);
      expect(volumeControl._domListeners.count()).toBe(0);
    });

    it('should handle dispose when not set up', () => {
      expect(() => volumeControl.dispose()).not.toThrow();
    });
  });
});
