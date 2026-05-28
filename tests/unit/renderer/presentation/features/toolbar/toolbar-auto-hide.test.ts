/**
 * ToolbarAutoHide Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ToolbarAutoHide } from '@renderer/presentation/effects/toolbar-auto-hide.effect.ts';
import { installMissingMutationObserverMock } from '../../../../../support/mocks/browser-api.installers.js';
import { createCallbackMap } from '../../../../../factories/index.js';

describe('ToolbarAutoHide', () => {
  let autoHide;
  let toolbarElement;
  let callbacks;

  beforeEach(() => {
    callbacks = createCallbackMap(['onActivity', 'onHide', 'onHoverStart', 'onHoverEnd']);

    toolbarElement = document.createElement('div');
    toolbarElement.className = 'toolbar';
    document.body.appendChild(toolbarElement);
  });

  afterEach(() => {
    autoHide?.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should initialize with default state', () => {
      autoHide = new ToolbarAutoHide();
      expect(autoHide.isEnabled).toBe(false);
      expect(autoHide.isHovering).toBe(false);
    });

    it('should accept callback options', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);

      expect(callbacks.onActivity).toHaveBeenCalled();
    });
  });

  describe('enable', () => {
    it('should enable auto-hide behavior', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);

      expect(autoHide.isEnabled).toBe(true);
    });

    it('should not enable without element', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(null);

      expect(autoHide.isEnabled).toBe(false);
    });

    it('should not re-enable if already enabled', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);
      autoHide.enable(toolbarElement);

      expect(callbacks.onActivity).toHaveBeenCalledTimes(1);
    });

    it('should call onActivity callback', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);

      expect(callbacks.onActivity).toHaveBeenCalled();
    });

    it('should reset hovering state', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);

      expect(autoHide.isHovering).toBe(false);
    });
  });

  describe('disable', () => {
    it('should disable auto-hide behavior', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);
      autoHide.disable();

      expect(autoHide.isEnabled).toBe(false);
    });

    it('should show toolbar on disable', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);
      toolbarElement.classList.add('toolbar-hidden');

      autoHide.disable();

      expect(toolbarElement.classList.contains('toolbar-hidden')).toBe(false);
    });

    it('should not re-disable if already disabled', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.disable();

      // Should not throw
      expect(autoHide.isEnabled).toBe(false);
    });

    it('should clear element reference', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);
      autoHide.disable();

      expect(autoHide._element).toBeNull();
    });

    it('should reset hover and panel state', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);
      autoHide.disable();

      expect(autoHide.isHovering).toBe(false);
      expect(autoHide._panelOpenCache).toBe(false);
      expect(autoHide._panelCacheDirty).toBe(true);
    });
  });

  describe('mouse events', () => {
    beforeEach(() => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);
    });

    it('should set hovering on mouseenter', () => {
      toolbarElement.dispatchEvent(new MouseEvent('mouseenter'));
      expect(autoHide.isHovering).toBe(true);
    });

    it('should call onHoverStart on mouseenter', () => {
      toolbarElement.dispatchEvent(new MouseEvent('mouseenter'));
      expect(callbacks.onHoverStart).toHaveBeenCalled();
    });

    it('should show toolbar on mouseenter', () => {
      toolbarElement.classList.add('toolbar-hidden');
      toolbarElement.dispatchEvent(new MouseEvent('mouseenter'));

      expect(toolbarElement.classList.contains('toolbar-hidden')).toBe(false);
    });

    it('should clear hovering on mouseleave', () => {
      toolbarElement.dispatchEvent(new MouseEvent('mouseenter'));
      toolbarElement.dispatchEvent(new MouseEvent('mouseleave'));

      expect(autoHide.isHovering).toBe(false);
    });

    it('should call onHoverEnd on mouseleave when no panel open', () => {
      toolbarElement.dispatchEvent(new MouseEvent('mouseenter'));
      toolbarElement.dispatchEvent(new MouseEvent('mouseleave'));

      expect(callbacks.onHoverEnd).toHaveBeenCalled();
    });
  });

  describe('hide', () => {
    beforeEach(() => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);
    });

    it('should add toolbar-hidden class', () => {
      autoHide.hide();
      expect(toolbarElement.classList.contains('toolbar-hidden')).toBe(true);
    });

    it('should call onHide callback', () => {
      autoHide.hide();
      expect(callbacks.onHide).toHaveBeenCalled();
    });

    it('should not hide when panel is open', () => {
      const shaderPanel = document.createElement('div');
      shaderPanel.className = 'shader-panel visible';
      toolbarElement.appendChild(shaderPanel);
      autoHide.invalidatePanelCache();

      autoHide.hide();

      expect(toolbarElement.classList.contains('toolbar-hidden')).toBe(false);
    });
  });

  describe('show', () => {
    beforeEach(() => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);
    });

    it('should remove toolbar-hidden class', () => {
      toolbarElement.classList.add('toolbar-hidden');
      autoHide.show();

      expect(toolbarElement.classList.contains('toolbar-hidden')).toBe(false);
    });
  });

  describe('isPanelOpen', () => {
    beforeEach(() => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);
    });

    it('should return false when no panel is open', () => {
      expect(autoHide.isPanelOpen()).toBe(false);
    });

    it('should return true when shader panel is visible', () => {
      const shaderPanel = document.createElement('div');
      shaderPanel.className = 'shader-panel visible';
      toolbarElement.appendChild(shaderPanel);
      autoHide.invalidatePanelCache();

      expect(autoHide.isPanelOpen()).toBe(true);
    });

    it('should return true when button has panel-open class', () => {
      const button = document.createElement('button');
      button.className = 'panel-open';
      toolbarElement.appendChild(button);
      autoHide.invalidatePanelCache();

      expect(autoHide.isPanelOpen()).toBe(true);
    });

    it('should return false when element is null', () => {
      autoHide.disable();
      expect(autoHide.isPanelOpen()).toBe(false);
    });

    it('should use cached value when cache is not dirty', () => {
      autoHide.isPanelOpen(); // Populate cache

      // Add panel but don't invalidate cache
      const shaderPanel = document.createElement('div');
      shaderPanel.className = 'shader-panel visible';
      toolbarElement.appendChild(shaderPanel);

      expect(autoHide.isPanelOpen()).toBe(false); // Still returns cached value
    });
  });

  describe('invalidatePanelCache', () => {
    it('should mark cache as dirty', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);

      autoHide.isPanelOpen(); // Populate cache
      autoHide.invalidatePanelCache();

      expect(autoHide._panelCacheDirty).toBe(true);
    });
  });

  describe('panel observer', () => {
    beforeEach(() => {
      autoHide = new ToolbarAutoHide(callbacks);
    });

    it('should set up mutation observer on enable', () => {
      autoHide.enable(toolbarElement);
      expect(autoHide._panelObserver).not.toBeNull();
    });

    it('should disconnect observer on disable', () => {
      autoHide.enable(toolbarElement);
      const observer = autoHide._panelObserver;

      autoHide.disable();

      expect(autoHide._panelObserver).toBeNull();
    });

    it('should invalidate cache when panel-open class is added', async () => {
      autoHide.enable(toolbarElement);
      autoHide.isPanelOpen(); // Populate cache

      const button = document.createElement('button');
      toolbarElement.appendChild(button);

      // Trigger mutation
      button.classList.add('panel-open');

      // MutationObserver runs async
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(autoHide._panelCacheDirty).toBe(true);
    });

    it('should invalidate cache when panel-open class is removed', async () => {
      const button = document.createElement('button');
      button.classList.add('panel-open');
      toolbarElement.appendChild(button);

      autoHide.enable(toolbarElement);
      autoHide.isPanelOpen(); // Populate cache
      expect(autoHide._panelCacheDirty).toBe(false);

      button.classList.remove('panel-open');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(autoHide._panelCacheDirty).toBe(true);
    });

    it('should invalidate cache when shader-panel visible class is added', async () => {
      autoHide.enable(toolbarElement);
      autoHide.isPanelOpen(); // Populate cache

      const shaderPanel = document.createElement('div');
      shaderPanel.className = 'shader-panel';
      toolbarElement.appendChild(shaderPanel);

      shaderPanel.classList.add('visible');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(autoHide._panelCacheDirty).toBe(true);
    });

    it('should not invalidate cache for unrelated class changes', async () => {
      autoHide.enable(toolbarElement);
      autoHide.isPanelOpen(); // Populate cache

      const button = document.createElement('button');
      toolbarElement.appendChild(button);

      button.classList.add('some-other-class');

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(autoHide._panelCacheDirty).toBe(false);
    });

    it('should disconnect previous observer when re-binding', () => {
      autoHide.enable(toolbarElement);
      const firstObserver = autoHide._panelObserver;
      const disconnectSpy = vi.spyOn(firstObserver, 'disconnect');

      // Manually call _bindPanelObserver again
      autoHide._bindPanelObserver();

      expect(disconnectSpy).toHaveBeenCalled();
      expect(autoHide._panelObserver).not.toBe(firstObserver);
    });

    it('should handle MutationObserver not available', () => {
      const mutationObserverMock = installMissingMutationObserverMock();

      try {
        autoHide.enable(toolbarElement);

        expect(autoHide._panelObserver).toBeNull();
      } finally {
        mutationObserverMock.cleanup();
      }
    });

    it('should handle null element gracefully', () => {
      autoHide._element = null;

      expect(() => autoHide._bindPanelObserver()).not.toThrow();
    });

    it('should not call onHoverEnd when panel is open on mouseleave', () => {
      autoHide.enable(toolbarElement);

      // Add panel
      const shaderPanel = document.createElement('div');
      shaderPanel.className = 'shader-panel visible';
      toolbarElement.appendChild(shaderPanel);
      autoHide.invalidatePanelCache();

      toolbarElement.dispatchEvent(new MouseEvent('mouseenter'));
      toolbarElement.dispatchEvent(new MouseEvent('mouseleave'));

      expect(callbacks.onHoverEnd).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle show without element', () => {
      autoHide = new ToolbarAutoHide(callbacks);

      expect(() => autoHide.show()).not.toThrow();
    });

    it('should handle hide without element', () => {
      autoHide = new ToolbarAutoHide(callbacks);

      expect(() => autoHide.hide()).not.toThrow();
    });

    it('should use default callbacks when not provided', () => {
      autoHide = new ToolbarAutoHide();
      autoHide.enable(toolbarElement);

      // Should not throw
      expect(autoHide.isEnabled).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should call disable', () => {
      autoHide = new ToolbarAutoHide(callbacks);
      autoHide.enable(toolbarElement);

      autoHide.dispose();

      expect(autoHide.isEnabled).toBe(false);
    });
  });
});
