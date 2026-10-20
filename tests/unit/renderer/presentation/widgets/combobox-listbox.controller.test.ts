import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ComboboxListboxController } from '@renderer/presentation/widgets/combobox-listbox.controller';
import { createCallbackMap, createLogger } from '../../../../factories/index.js';

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
