/**
 * Listbox helpers Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderListboxOptions, updateListboxActiveState } from '@renderer/presentation/primitives/listbox.utils.js';

describe('listbox helpers', () => {
  let container;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('renderListboxOptions', () => {
    it('should render options into container', () => {
      const options = [{ id: '1', label: 'Option 1' }, { id: '2', label: 'Option 2' }];
      const createOption = (opt) => {
        const el = document.createElement('div');
        el.textContent = opt.label;
        el.dataset.value = opt.id;
        return el;
      };

      renderListboxOptions({ container, options, createOption });

      expect(container.children.length).toBe(2);
      expect(container.children[0].textContent).toBe('Option 1');
      expect(container.children[1].textContent).toBe('Option 2');
    });

    it('should clear container before rendering', () => {
      container.innerHTML = '<div>existing</div>';

      const options = [{ id: '1', label: 'New' }];
      const createOption = (opt) => {
        const el = document.createElement('div');
        el.textContent = opt.label;
        return el;
      };

      renderListboxOptions({ container, options, createOption });

      expect(container.children.length).toBe(1);
      expect(container.children[0].textContent).toBe('New');
    });

    it('should handle null container', () => {
      expect(() => renderListboxOptions({ container: null, options: [], createOption: () => null })).not.toThrow();
    });

    it('should skip null elements from createOption', () => {
      const options = [{ id: '1' }, { id: '2' }, { id: '3' }];
      const createOption = (opt) => {
        if (opt.id === '2') return null;
        const el = document.createElement('div');
        el.dataset.value = opt.id;
        return el;
      };

      renderListboxOptions({ container, options, createOption });

      expect(container.children.length).toBe(2);
    });
  });

  describe('updateListboxActiveState', () => {
    beforeEach(() => {
      container.innerHTML = `
        <div class="option" data-value="a">A</div>
        <div class="option" data-value="b">B</div>
        <div class="option" data-value="c">C</div>
      `;
    });

    it('should set active class on matching option', () => {
      updateListboxActiveState({
        container,
        optionSelector: '.option',
        activeValue: 'b'
      });

      expect(container.querySelector('[data-value="a"]').classList.contains('active')).toBe(false);
      expect(container.querySelector('[data-value="b"]').classList.contains('active')).toBe(true);
      expect(container.querySelector('[data-value="c"]').classList.contains('active')).toBe(false);
    });

    it('should set aria-selected on options', () => {
      updateListboxActiveState({
        container,
        optionSelector: '.option',
        activeValue: 'a'
      });

      expect(container.querySelector('[data-value="a"]').getAttribute('aria-selected')).toBe('true');
      expect(container.querySelector('[data-value="b"]').getAttribute('aria-selected')).toBe('false');
    });

    it('should use custom activeClass', () => {
      updateListboxActiveState({
        container,
        optionSelector: '.option',
        activeValue: 'c',
        activeClass: 'selected'
      });

      expect(container.querySelector('[data-value="c"]').classList.contains('selected')).toBe(true);
    });

    it('should use custom getOptionValue', () => {
      container.innerHTML = '<div class="option" id="opt-x">X</div>';

      updateListboxActiveState({
        container,
        optionSelector: '.option',
        activeValue: 'opt-x',
        getOptionValue: (opt) => opt.id
      });

      expect(container.querySelector('.option').classList.contains('active')).toBe(true);
    });

    it('should skip aria-selected when setAriaSelected is false', () => {
      updateListboxActiveState({
        container,
        optionSelector: '.option',
        activeValue: 'a',
        setAriaSelected: false
      });

      expect(container.querySelector('[data-value="a"]').hasAttribute('aria-selected')).toBe(false);
    });

    it('should handle null container', () => {
      expect(() => updateListboxActiveState({
        container: null,
        optionSelector: '.option',
        activeValue: 'a'
      })).not.toThrow();
    });
  });
});
