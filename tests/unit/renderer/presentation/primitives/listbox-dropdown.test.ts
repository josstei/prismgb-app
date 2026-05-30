import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ListboxDropdownController } from '@renderer/presentation/primitives/listbox-dropdown.class.js';
import { ComboboxListboxController } from '@renderer/presentation/primitives/combobox-listbox.class.js';
import { createCallbackMap, createLogger } from '../../../../factories/index.js';

describe('ListboxDropdownController', () => {
  let fixture;
  let controller;

  function createFixture() {
    const triggerElement = document.createElement('button');
    const menuElement = document.createElement('div');
    const labelElement = document.createElement('span');
    const mockLogger = createLogger();
    const onChange = vi.fn();
    [
      ['opt1', 'Option 1'],
      ['opt2', 'Option 2']
    ].forEach(([value, label]) => {
      const option = document.createElement('div');
      option.setAttribute('role', 'option');
      option.dataset.value = value;
      option.textContent = label;
      menuElement.appendChild(option);
    });
    document.body.append(triggerElement, menuElement, labelElement);
    return {
      triggerElement,
      menuElement,
      labelElement,
      mockLogger,
      onChange,
      createController(overrides = {}) {
        return new ListboxDropdownController({
          triggerElement,
          menuElement,
          labelElement,
          onChange,
          logger: mockLogger,
          ...overrides
        });
      }
    };
  }

  beforeEach(() => {
    fixture = createFixture();
  });

  afterEach(() => {
    controller?.dispose();
    document.body.innerHTML = '';
  });

  it('stores constructor dependencies and default selector', () => {
    controller = fixture.createController();
    expect(controller.triggerElement).toBe(fixture.triggerElement);
    expect(controller.menuElement).toBe(fixture.menuElement);
    expect(controller.labelElement).toBe(fixture.labelElement);
    expect(controller.optionSelector).toBe('[role="option"]');
  });

  it('warns when required elements are missing', () => {
    [
      { triggerElement: null, menuElement: fixture.menuElement },
      { triggerElement: fixture.triggerElement, menuElement: null }
    ].forEach((overrides) => {
      controller = fixture.createController(overrides);
      controller.initialize();
      expect(fixture.mockLogger.warn).toHaveBeenLastCalledWith('Listbox dropdown elements not found');
    });
  });

  it('initializes active value, selects options, updates label, and ignores non-option clicks', () => {
    controller = fixture.createController();
    controller.initialize({ activeValue: 'opt1' });
    expect(fixture.menuElement.querySelector('[data-value="opt1"]').classList.contains('active')).toBe(true);

    controller.show();
    fixture.menuElement.querySelector('[data-value="opt2"]').click();
    expect(fixture.onChange).toHaveBeenCalledWith('opt2', 'Option 2');
    expect(fixture.labelElement.textContent).toBe('Option 2');
    expect(controller.isOpen()).toBe(false);
    expect(document.activeElement).toBe(fixture.triggerElement);

    fixture.menuElement.click();
    expect(fixture.onChange).toHaveBeenCalledTimes(1);
  });

  it('updates active option state and supports label overrides', () => {
    controller = fixture.createController();
    controller.initialize();
    controller.setActive('opt2');

    expect(fixture.menuElement.querySelector('[data-value="opt1"]').classList.contains('active')).toBe(false);
    expect(fixture.menuElement.querySelector('[data-value="opt2"]').classList.contains('active')).toBe(true);
    expect(fixture.labelElement.textContent).toBe('Option 2');

    controller.setActive('opt2', 'Custom Label');
    expect(fixture.labelElement.textContent).toBe('Custom Label');

    controller.menuElement = null;
    expect(() => controller.setActive('opt1')).not.toThrow();
  });

  it('manages open/closed state, roving tabindex, callbacks, and outside pointerdown close', () => {
    const onShow = vi.fn();
    const onHide = vi.fn();
    controller = fixture.createController({
      outsideEvent: 'pointerdown',
      onShow,
      onHide
    });
    controller.initialize();

    const option1 = fixture.menuElement.querySelector('[data-value="opt1"]');
    const option2 = fixture.menuElement.querySelector('[data-value="opt2"]');
    expect(fixture.menuElement.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.menuElement.hasAttribute('inert')).toBe(true);
    expect(option1.tabIndex).toBe(-1);
    expect(option2.tabIndex).toBe(-1);

    controller.toggle();
    expect(fixture.menuElement.classList.contains('visible')).toBe(true);
    expect(fixture.menuElement.getAttribute('aria-hidden')).toBe('false');
    expect(fixture.menuElement.hasAttribute('inert')).toBe(false);
    expect(option1.tabIndex).toBe(0);
    expect(option2.tabIndex).toBe(-1);
    expect(onShow).toHaveBeenCalledTimes(1);

    controller.setActive('opt2');
    expect(option1.tabIndex).toBe(-1);
    expect(option2.tabIndex).toBe(0);

    document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    expect(fixture.menuElement.classList.contains('visible')).toBe(false);
    expect(fixture.menuElement.getAttribute('aria-hidden')).toBe('true');
    expect(fixture.menuElement.hasAttribute('inert')).toBe(true);
    expect(option1.tabIndex).toBe(-1);
    expect(option2.tabIndex).toBe(-1);
    expect(onHide).toHaveBeenCalledTimes(1);
  });

  it('handles trigger and menu keyboard interactions when enabled', () => {
    controller = fixture.createController({ enableTriggerKeyboard: true });
    controller.initialize({ activeValue: 'opt2' });

    fixture.triggerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(controller.isOpen()).toBe(true);
    fixture.triggerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(controller.isOpen()).toBe(false);

    fixture.triggerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    const activeOption = fixture.menuElement.querySelector('[data-value="opt2"]');
    const firstOption = fixture.menuElement.querySelector('[data-value="opt1"]');
    expect(document.activeElement).toBe(activeOption);

    activeOption.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }));
    expect(document.activeElement).toBe(firstOption);
    firstOption.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(document.activeElement).toBe(activeOption);
    activeOption.dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    expect(document.activeElement).toBe(firstOption);

    firstOption.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(controller.isOpen()).toBe(false);
    expect(document.activeElement).toBe(fixture.triggerElement);

    fixture.triggerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    firstOption.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    expect(fixture.onChange).toHaveBeenCalledWith('opt1', 'Option 1');
    expect(controller.isOpen()).toBe(false);
  });

  it('does not close on Escape when closeOnEscape is false', () => {
    const bubbleSpy = vi.fn();
    document.addEventListener('keydown', bubbleSpy);
    controller = fixture.createController({ closeOnEscape: false, enableTriggerKeyboard: true });
    controller.initialize();
    fixture.triggerElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));

    const firstOption = fixture.menuElement.querySelector('[data-value="opt1"]');
    firstOption.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(controller.isOpen()).toBe(true);
    expect(document.activeElement).toBe(firstOption);
    expect(bubbleSpy).toHaveBeenCalled();
    document.removeEventListener('keydown', bubbleSpy);
  });

  it('cleans up references and tolerates disposing before initialize', async () => {
    controller = fixture.createController();
    controller.initialize();
    controller.show();
    await controller.dispose();

    expect(fixture.menuElement.classList.contains('visible')).toBe(false);
    expect(fixture.triggerElement.getAttribute('aria-expanded')).toBe('false');
    expect(controller.triggerElement).toBeNull();
    expect(controller.menuElement).toBeNull();
    expect(controller.labelElement).toBeNull();
    expect(controller.onChange).toBeNull();
    expect(controller.logger).toBeNull();

    const uninitializedController = fixture.createController();
    await expect(uninitializedController.dispose()).resolves.not.toThrow();
  });
});

describe('ComboboxListboxController', () => {
  let controller;
  let inputElement;
  let listboxElement;
  let callbacks;
  beforeEach(() => {
    vi.useFakeTimers();
    inputElement = document.createElement('input');
    listboxElement = document.createElement('div');
    listboxElement.id = 'test-listbox';
    document.body.append(inputElement, listboxElement);
    callbacks = createCallbackMap(['onInput', 'onSelect', 'onEnter', 'onEscape', 'onBlur', 'onFocus']);
    controller = new ComboboxListboxController({
      logger: createLogger(),
      optionSelector: '.test-option',
      optionClassName: 'test-option',
      optionIdPrefix: 'test-option',
      debounceMs: 100,
      blurDelayMs: 150,
      listboxAriaLabel: 'Test suggestions',
      getOptions: () => ['Alpha', 'Beta'],
      onInput: callbacks.onInput,
      onSelect: callbacks.onSelect,
      onEnter: callbacks.onEnter,
      onEscape: callbacks.onEscape,
      onBlur: callbacks.onBlur,
      onFocus: callbacks.onFocus
    });
    controller.initialize({ inputElement, listboxElement });
  });
  afterEach(() => {
    controller?.dispose();
    document.body.innerHTML = '';
    vi.useRealTimers();
  });
  it('selects highlighted options by keyboard and updates ARIA state', () => {
    inputElement.value = 'a';
    inputElement.dispatchEvent(new Event('input'));
    expect(callbacks.onInput).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(100);
    expect(controller.isVisible()).toBe(true);
    expect(inputElement.getAttribute('role')).toBe('combobox');
    expect(inputElement.getAttribute('aria-expanded')).toBe('true');
    expect(listboxElement.getAttribute('role')).toBe('listbox');
    expect(listboxElement.getAttribute('aria-hidden')).toBe('false');
    expect(listboxElement.hasAttribute('inert')).toBe(false);
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }));
    expect(controller.getHighlightedIndex()).toBe(0);
    expect(inputElement.getAttribute('aria-activedescendant')).toBe('test-option-0');
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(callbacks.onSelect).toHaveBeenCalledWith('Alpha');
    expect(callbacks.onEnter).not.toHaveBeenCalled();
    expect(inputElement.value).toBe('Alpha');
    expect(controller.isVisible()).toBe(false);
    expect(listboxElement.getAttribute('aria-hidden')).toBe('true');
    expect(listboxElement.hasAttribute('inert')).toBe(true);
  });
  it('calls onEnter without a highlighted option', () => {
    inputElement.dispatchEvent(new Event('input'));
    vi.advanceTimersByTime(100);
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(callbacks.onEnter).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelect).not.toHaveBeenCalled();
  });
  it('does not reopen after Escape cancels a pending debounced show', () => {
    inputElement.value = 'a';
    inputElement.dispatchEvent(new Event('input'));
    inputElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    vi.advanceTimersByTime(100);
    expect(controller.isVisible()).toBe(false);
    expect(callbacks.onEscape).toHaveBeenCalledTimes(1);
  });
  it('selects once for pointer activation', () => {
    controller.show();
    const option = listboxElement.querySelector('.test-option');
    option.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }));
    option.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(callbacks.onSelect).toHaveBeenCalledTimes(1);
    expect(callbacks.onSelect).toHaveBeenCalledWith('Alpha');
  });
  it('delays blur hide and cancels pending hide when focus returns', () => {
    inputElement.dispatchEvent(new Event('focus'));
    expect(controller.isVisible()).toBe(true);
    inputElement.dispatchEvent(new Event('blur'));
    vi.advanceTimersByTime(149);
    expect(controller.isVisible()).toBe(true);
    inputElement.dispatchEvent(new Event('focus'));
    vi.advanceTimersByTime(155);
    expect(controller.isVisible()).toBe(true);
    expect(callbacks.onBlur).not.toHaveBeenCalled();
    expect(callbacks.onFocus).toHaveBeenCalledTimes(2);
  });
});
