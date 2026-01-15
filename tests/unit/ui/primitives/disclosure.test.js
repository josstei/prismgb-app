/**
 * DisclosureController Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DisclosureController } from '@renderer/ui/primitives/disclosure.js';
import { createMockLogger } from '../../../mocks/index.js';

describe('DisclosureController', () => {
  let controller;
  let mockLogger;
  let toggleElement;
  let panelElement;
  let onShow;
  let onHide;

  beforeEach(() => {
    mockLogger = createMockLogger();
    onShow = vi.fn();
    onHide = vi.fn();

    toggleElement = document.createElement('button');
    panelElement = document.createElement('div');

    document.body.appendChild(toggleElement);
    document.body.appendChild(panelElement);
  });

  afterEach(() => {
    controller?.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should store element references', () => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        logger: mockLogger
      });

      expect(controller.toggleElement).toBe(toggleElement);
      expect(controller.panelElement).toBe(panelElement);
    });

    it('should use default visible class', () => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        logger: mockLogger
      });

      expect(controller.visibleClass).toBe('visible');
    });

    it('should accept custom visible class', () => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        visibleClass: 'custom-visible',
        logger: mockLogger
      });

      expect(controller.visibleClass).toBe('custom-visible');
    });
  });

  describe('initialize', () => {
    it('should not open by default', () => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        logger: mockLogger
      });
      controller.initialize();

      expect(controller.isOpen()).toBe(false);
      expect(panelElement.classList.contains('visible')).toBe(false);
    });

    it('should open when isOpen option is true', () => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        logger: mockLogger
      });
      controller.initialize({ isOpen: true });

      expect(controller.isOpen()).toBe(true);
      expect(panelElement.classList.contains('visible')).toBe(true);
    });
  });

  describe('isOpen', () => {
    it('should return false initially', () => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        logger: mockLogger
      });
      controller.initialize();

      expect(controller.isOpen()).toBe(false);
    });

    it('should return true after show', () => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        logger: mockLogger
      });
      controller.initialize();
      controller.show();

      expect(controller.isOpen()).toBe(true);
    });
  });

  describe('toggle', () => {
    beforeEach(() => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        logger: mockLogger
      });
      controller.initialize();
    });

    it('should show when closed', () => {
      controller.toggle();
      expect(controller.isOpen()).toBe(true);
      expect(panelElement.classList.contains('visible')).toBe(true);
    });

    it('should hide when open', () => {
      controller.show();
      controller.toggle();
      expect(controller.isOpen()).toBe(false);
      expect(panelElement.classList.contains('visible')).toBe(false);
    });
  });

  describe('show', () => {
    beforeEach(() => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        onShow,
        logger: mockLogger
      });
      controller.initialize();
    });

    it('should add visible class to panel', () => {
      controller.show();
      expect(panelElement.classList.contains('visible')).toBe(true);
    });

    it('should call onShow callback', () => {
      controller.show();
      expect(onShow).toHaveBeenCalled();
    });

    it('should set aria-expanded on toggle element', () => {
      controller.show();
      expect(toggleElement.getAttribute('aria-expanded')).toBe('true');
    });

    it('should not re-show if already open', () => {
      controller.show();
      onShow.mockClear();
      controller.show();
      expect(onShow).not.toHaveBeenCalled();
    });

    it('should not show if panel element is null', () => {
      controller.panelElement = null;
      expect(() => controller.show()).not.toThrow();
    });

    it('should add toggle open class if provided', () => {
      controller.dispose();
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        toggleOpenClass: 'toggle-open',
        logger: mockLogger
      });
      controller.initialize();
      controller.show();

      expect(toggleElement.classList.contains('toggle-open')).toBe(true);
    });
  });

  describe('hide', () => {
    beforeEach(() => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        onHide,
        logger: mockLogger
      });
      controller.initialize();
      controller.show();
    });

    it('should remove visible class from panel', () => {
      controller.hide();
      expect(panelElement.classList.contains('visible')).toBe(false);
    });

    it('should call onHide callback', () => {
      controller.hide();
      expect(onHide).toHaveBeenCalled();
    });

    it('should set aria-expanded to false', () => {
      controller.hide();
      expect(toggleElement.getAttribute('aria-expanded')).toBe('false');
    });

    it('should not re-hide if already closed', () => {
      controller.hide();
      onHide.mockClear();
      controller.hide();
      expect(onHide).not.toHaveBeenCalled();
    });

    it('should not hide if panel element is null', () => {
      controller.panelElement = null;
      expect(() => controller.hide()).not.toThrow();
    });

    it('should remove toggle open class if provided', () => {
      controller.dispose();
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        toggleOpenClass: 'toggle-open',
        logger: mockLogger
      });
      controller.initialize();
      controller.show();
      controller.hide();

      expect(toggleElement.classList.contains('toggle-open')).toBe(false);
    });
  });

  describe('escape key handling', () => {
    beforeEach(() => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        closeOnEscape: true,
        logger: mockLogger
      });
      controller.initialize();
      controller.show();
    });

    it('should hide on escape key', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(controller.isOpen()).toBe(false);
    });

    it('should not hide on other keys', () => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(controller.isOpen()).toBe(true);
    });

    it('should not close when already closed', () => {
      controller.hide();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(controller.isOpen()).toBe(false);
    });
  });

  describe('click outside handling', () => {
    let outsideElement;

    beforeEach(() => {
      outsideElement = document.createElement('div');
      outsideElement.id = 'outside';
      document.body.appendChild(outsideElement);

      controller = new DisclosureController({
        toggleElement,
        panelElement,
        closeOnClickOutside: true,
        logger: mockLogger
      });
      controller.initialize();
      controller.show();
    });

    it('should hide on click outside', () => {
      outsideElement.click();
      expect(controller.isOpen()).toBe(false);
    });

    it('should not hide on click inside panel', () => {
      panelElement.click();
      expect(controller.isOpen()).toBe(true);
    });

    it('should not hide on click on toggle', () => {
      toggleElement.click();
      expect(controller.isOpen()).toBe(true);
    });

    it('should not close when already closed', () => {
      controller.hide();
      outsideElement.click();
      expect(controller.isOpen()).toBe(false);
    });
  });

  describe('ignore outside selectors', () => {
    it('should not hide when clicking ignored element', () => {
      const ignoredElement = document.createElement('div');
      ignoredElement.className = 'ignored-panel';
      document.body.appendChild(ignoredElement);

      controller = new DisclosureController({
        toggleElement,
        panelElement,
        closeOnClickOutside: true,
        ignoreOutsideSelectors: ['.ignored-panel'],
        logger: mockLogger
      });
      controller.initialize();
      controller.show();

      ignoredElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(controller.isOpen()).toBe(true);
    });

    it('should not hide when clicking inside ignored element', () => {
      const ignoredElement = document.createElement('div');
      ignoredElement.className = 'ignored-container';
      ignoredElement.id = 'ignored';
      document.body.appendChild(ignoredElement);

      controller = new DisclosureController({
        toggleElement,
        panelElement,
        closeOnClickOutside: true,
        ignoreOutsideElements: [ignoredElement],
        logger: mockLogger
      });
      controller.initialize();
      controller.show();

      ignoredElement.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      expect(controller.isOpen()).toBe(true);
    });
  });

  describe('dispose', () => {
    it('should nullify references', () => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        logger: mockLogger
      });
      controller.initialize();
      controller.dispose();

      expect(controller.toggleElement).toBeNull();
      expect(controller.panelElement).toBeNull();
    });

    it('should clear ignore arrays', () => {
      controller = new DisclosureController({
        toggleElement,
        panelElement,
        ignoreOutsideElements: [document.createElement('div')],
        ignoreOutsideSelectors: ['.test'],
        logger: mockLogger
      });
      controller.initialize();
      controller.dispose();

      expect(controller.ignoreOutsideElements).toEqual([]);
      expect(controller.ignoreOutsideSelectors).toEqual([]);
    });
  });

  describe('aria-expanded element', () => {
    it('should use separate element for aria-expanded', () => {
      const ariaElement = document.createElement('button');
      document.body.appendChild(ariaElement);

      controller = new DisclosureController({
        toggleElement,
        panelElement,
        ariaExpandedElement: ariaElement,
        logger: mockLogger
      });
      controller.initialize();
      controller.show();

      expect(ariaElement.getAttribute('aria-expanded')).toBe('true');
      expect(toggleElement.getAttribute('aria-expanded')).toBeNull();
    });
  });
});
