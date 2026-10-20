import { describe, it, expect, beforeEach } from 'vitest';
import { DeviceStatusComponent } from '@renderer/presentation/shell/device-status.component';
import { DeviceStatusStore } from '@renderer/presentation/shell/device-status.store';
import { createDeviceStatusElementsMock, createEventBus } from '../../../../factories/index.js';
import { EventChannels } from '@renderer/lib/events/event-channels';

describe('DeviceStatusComponent', () => {
  let mockElements;
  let mockEventBus;
  let store;
  let component;

  beforeEach(() => {
    mockElements = createDeviceStatusElementsMock();
    mockEventBus = createEventBus();

    store = new DeviceStatusStore({ eventBus: mockEventBus });

    component = new DeviceStatusComponent({
      elements: mockElements,
      store
    });
  });

  describe('Constructor / Bindings', () => {
    it('should start disconnected', () => {
      expect(mockElements.statusText.textContent).toBe('No Device');
      expect(mockElements.deviceStatusText.textContent).toBe('Disconnected');
      expect(mockElements.deviceName.textContent).toBe('—');
    });

    it('should bind connection status updates', () => {
      mockEventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, {
        state: 'connected',
        connected: true,
        device: { name: 'Mod Retro Chromatic' },
        updatedAt: 1
      });

      expect(mockElements.statusIndicator.classList.toggle).toHaveBeenCalledWith('connected', true);
      expect(mockElements.statusIndicator.classList.toggle).toHaveBeenCalledWith('disconnected', false);
      expect(mockElements.statusText.textContent).toBe('Device Connected');
      expect(mockElements.deviceStatusText.textContent).toBe('Connected');
      expect(mockElements.deviceName.textContent).toBe('Mod Retro Chromatic');
    });

    it('should use default device name when not provided', () => {
      mockEventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, {
        state: 'connected',
        connected: true,
        device: {},
        updatedAt: 1
      });

      expect(mockElements.deviceName.textContent).toBe('Device');
    });

    it('should update UI for disconnected state', () => {
      mockEventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, {
        state: 'connected',
        connected: true,
        device: { name: 'Mod Retro Chromatic' },
        updatedAt: 1
      });
      mockEventBus.publish(EventChannels.DEVICE.STATUS_CHANGED, {
        state: 'disconnected',
        connected: false,
        device: null,
        updatedAt: 2
      });

      expect(mockElements.statusIndicator.classList.toggle).toHaveBeenCalledWith('connected', false);
      expect(mockElements.statusIndicator.classList.toggle).toHaveBeenCalledWith('disconnected', true);
      expect(mockElements.statusText.textContent).toBe('No Device');
      expect(mockElements.deviceStatusText.textContent).toBe('Disconnected');
      expect(mockElements.deviceName.textContent).toBe('—');
    });

    it('should bind overlay message updates', () => {
      mockEventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: true });

      expect(mockElements.overlayMessage.textContent).toBe('');
      expect(mockElements.overlayMessage.classList.toggle).toHaveBeenCalledWith('ready', true);
      expect(mockElements.overlayMessage.classList.toggle).toHaveBeenCalledWith('waiting', false);
    });

    it('should bind overlay waiting updates', () => {
      mockEventBus.publish(EventChannels.UI.OVERLAY_MESSAGE, { deviceConnected: false });

      expect(mockElements.overlayMessage.textContent).toBe('');
      expect(mockElements.overlayMessage.classList.toggle).toHaveBeenCalledWith('ready', false);
      expect(mockElements.overlayMessage.classList.toggle).toHaveBeenCalledWith('waiting', true);
    });

    it('should bind overlay visibility updates', () => {
      mockEventBus.publish(EventChannels.UI.OVERLAY_VISIBLE, { visible: false });
      expect(mockElements.streamOverlay.classList.toggle).toHaveBeenCalledWith('hidden', true);

      mockEventBus.publish(EventChannels.UI.OVERLAY_VISIBLE, { visible: true });
      expect(mockElements.streamOverlay.classList.toggle).toHaveBeenCalledWith('hidden', false);
    });

    it('should bind overlay errors', () => {
      mockEventBus.publish(EventChannels.UI.OVERLAY_ERROR, { message: 'Connection failed' });

      expect(mockElements.overlayMessage.textContent).toBe('Error: Connection failed');
      expect(mockElements.streamOverlay.classList.toggle).toHaveBeenCalledWith('hidden', false);
    });
  });
});
