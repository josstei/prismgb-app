/**
 * DeviceStatusComponent Unit Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { DeviceStatusComponent } from '@renderer/ui/components/device-status.component.js';

describe('DeviceStatusComponent', () => {
  let component;
  let mockElements;

  beforeEach(() => {
    mockElements = {
      statusIndicator: {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      },
      statusText: { textContent: '' },
      deviceStatusText: {
        textContent: '',
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      },
      deviceName: { textContent: '' },
      overlayMessage: {
        textContent: '',
        classList: {
          add: vi.fn(),
          remove: vi.fn(),
          toggle: vi.fn()
        }
      },
      streamOverlay: {
        classList: {
          add: vi.fn(),
          remove: vi.fn()
        }
      }
    };

    component = new DeviceStatusComponent(mockElements);
  });

  describe('Constructor', () => {
    it('should store elements reference', () => {
      expect(component.elements).toBe(mockElements);
    });
  });

  describe('updateStatus', () => {
    it('should update UI for connected state', () => {
      component.updateStatus({ connected: true, device: { deviceName: 'Chromatic' } });

      expect(mockElements.statusIndicator.classList.add).toHaveBeenCalledWith('connected');
      expect(mockElements.statusIndicator.classList.remove).toHaveBeenCalledWith('disconnected');
      expect(mockElements.statusText.textContent).toBe('Device Connected');
      expect(mockElements.deviceStatusText.textContent).toBe('Connected');
      expect(mockElements.deviceName.textContent).toBe('Chromatic');
    });

    it('should use default device name when not provided', () => {
      component.updateStatus({ connected: true, device: {} });

      expect(mockElements.deviceName.textContent).toBe('Device');
    });

    it('should use default device name when device is undefined', () => {
      component.updateStatus({ connected: true });

      expect(mockElements.deviceName.textContent).toBe('Device');
    });

    it('should update UI for disconnected state', () => {
      component.updateStatus({ connected: false });

      expect(mockElements.statusIndicator.classList.remove).toHaveBeenCalledWith('connected');
      expect(mockElements.statusIndicator.classList.add).toHaveBeenCalledWith('disconnected');
      expect(mockElements.statusText.textContent).toBe('No Device');
      expect(mockElements.deviceStatusText.textContent).toBe('Disconnected');
      expect(mockElements.deviceName.textContent).toBe('—');
    });
  });

  describe('updateOverlayMessage', () => {
    it('should show ready state when connected', () => {
      component.updateOverlayMessage(true);

      expect(mockElements.overlayMessage.textContent).toBe('');
      expect(mockElements.overlayMessage.classList.toggle).toHaveBeenCalledWith('ready', true);
      expect(mockElements.overlayMessage.classList.toggle).toHaveBeenCalledWith('waiting', false);
    });

    it('should show waiting state when disconnected', () => {
      component.updateOverlayMessage(false);

      expect(mockElements.overlayMessage.textContent).toBe('');
      expect(mockElements.overlayMessage.classList.toggle).toHaveBeenCalledWith('ready', false);
      expect(mockElements.overlayMessage.classList.toggle).toHaveBeenCalledWith('waiting', true);
    });
  });

  describe('showError', () => {
    it('should show error message', () => {
      component.showError('Connection failed');

      expect(mockElements.overlayMessage.textContent).toBe('Error: Connection failed');
      expect(mockElements.streamOverlay.classList.remove).toHaveBeenCalledWith('hidden');
    });
  });

  describe('setOverlayVisible', () => {
    it('should show overlay when visible is true', () => {
      component.setOverlayVisible(true);

      expect(mockElements.streamOverlay.classList.remove).toHaveBeenCalledWith('hidden');
    });

    it('should hide overlay when visible is false', () => {
      component.setOverlayVisible(false);

      expect(mockElements.streamOverlay.classList.add).toHaveBeenCalledWith('hidden');
    });
  });
});
