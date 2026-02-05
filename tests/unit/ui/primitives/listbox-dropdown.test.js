/**
 * ListboxDropdownController Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ListboxDropdownController } from '@renderer/presentation/primitives/listbox-dropdown.class.js';
import { createMockLogger } from '../../../mocks/index.js';

describe('ListboxDropdownController', () => {
  let controller;
  let mockLogger;
  let triggerElement;
  let menuElement;
  let labelElement;
  let onChange;

  beforeEach(() => {
    mockLogger = createMockLogger();
    onChange = vi.fn();

    // Create DOM fixtures
    triggerElement = document.createElement('button');
    menuElement = document.createElement('div');
    labelElement = document.createElement('span');

    // Add options to menu
    const option1 = document.createElement('div');
    option1.setAttribute('role', 'option');
    option1.dataset.value = 'opt1';
    option1.textContent = 'Option 1';

    const option2 = document.createElement('div');
    option2.setAttribute('role', 'option');
    option2.dataset.value = 'opt2';
    option2.textContent = 'Option 2';

    menuElement.appendChild(option1);
    menuElement.appendChild(option2);

    document.body.appendChild(triggerElement);
    document.body.appendChild(menuElement);
    document.body.appendChild(labelElement);
  });

  afterEach(() => {
    controller?.dispose();
    document.body.innerHTML = '';
  });

  describe('constructor', () => {
    it('should create controller with required elements', () => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        labelElement,
        logger: mockLogger
      });

      expect(controller.triggerElement).toBe(triggerElement);
      expect(controller.menuElement).toBe(menuElement);
      expect(controller.labelElement).toBe(labelElement);
    });

    it('should use default option selector', () => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        logger: mockLogger
      });

      expect(controller.optionSelector).toBe('[role="option"]');
    });
  });

  describe('initialize', () => {
    it('should warn when trigger element is missing', () => {
      controller = new ListboxDropdownController({
        triggerElement: null,
        menuElement,
        logger: mockLogger
      });

      controller.initialize();
      expect(mockLogger.warn).toHaveBeenCalledWith('Listbox dropdown elements not found');
    });

    it('should warn when menu element is missing', () => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement: null,
        logger: mockLogger
      });

      controller.initialize();
      expect(mockLogger.warn).toHaveBeenCalledWith('Listbox dropdown elements not found');
    });

    it('should set active value on initialize', () => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        labelElement,
        logger: mockLogger
      });

      controller.initialize({ activeValue: 'opt1' });

      const option1 = menuElement.querySelector('[data-value="opt1"]');
      expect(option1.classList.contains('active')).toBe(true);
    });
  });

  describe('option click handling', () => {
    it('should call onChange when option is clicked', () => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        labelElement,
        onChange,
        logger: mockLogger
      });

      controller.initialize();

      const option2 = menuElement.querySelector('[data-value="opt2"]');
      option2.click();

      expect(onChange).toHaveBeenCalledWith('opt2', 'Option 2');
    });

    it('should update label when option is clicked', () => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        labelElement,
        onChange,
        logger: mockLogger
      });

      controller.initialize();

      const option2 = menuElement.querySelector('[data-value="opt2"]');
      option2.click();

      expect(labelElement.textContent).toBe('Option 2');
    });

    it('should ignore clicks on non-option elements', () => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        labelElement,
        onChange,
        logger: mockLogger
      });

      controller.initialize();

      // Click on menu container (not an option)
      menuElement.click();

      expect(onChange).not.toHaveBeenCalled();
    });
  });

  describe('setActive', () => {
    beforeEach(() => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        labelElement,
        logger: mockLogger
      });
      controller.initialize();
    });

    it('should update active state on options', () => {
      controller.setActive('opt2');

      const option1 = menuElement.querySelector('[data-value="opt1"]');
      const option2 = menuElement.querySelector('[data-value="opt2"]');

      expect(option1.classList.contains('active')).toBe(false);
      expect(option2.classList.contains('active')).toBe(true);
    });

    it('should update label text from option content', () => {
      controller.setActive('opt2');
      expect(labelElement.textContent).toBe('Option 2');
    });

    it('should use label override when provided', () => {
      controller.setActive('opt2', 'Custom Label');
      expect(labelElement.textContent).toBe('Custom Label');
    });

    it('should handle missing menu element gracefully', () => {
      controller.menuElement = null;
      expect(() => controller.setActive('opt1')).not.toThrow();
    });
  });

  describe('show/hide/toggle', () => {
    beforeEach(() => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        labelElement,
        logger: mockLogger
      });
      controller.initialize();
    });

    it('should show menu via disclosure', () => {
      controller.show();
      expect(menuElement.classList.contains('visible')).toBe(true);
    });

    it('should hide menu via disclosure', () => {
      controller.show();
      controller.hide();
      expect(menuElement.classList.contains('visible')).toBe(false);
    });

    it('should toggle menu state', () => {
      controller.toggle();
      expect(menuElement.classList.contains('visible')).toBe(true);

      controller.toggle();
      expect(menuElement.classList.contains('visible')).toBe(false);
    });
  });

  describe('dispose', () => {
    it('should clean up references', () => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        labelElement,
        onChange,
        logger: mockLogger
      });
      controller.initialize();

      controller.dispose();

      expect(controller.triggerElement).toBeNull();
      expect(controller.menuElement).toBeNull();
      expect(controller.labelElement).toBeNull();
      expect(controller.onChange).toBeNull();
      expect(controller.logger).toBeNull();
    });

    it('should not throw when disposing uninitialized controller', () => {
      controller = new ListboxDropdownController({
        triggerElement,
        menuElement,
        logger: mockLogger
      });

      expect(() => controller.dispose()).not.toThrow();
    });
  });
});
