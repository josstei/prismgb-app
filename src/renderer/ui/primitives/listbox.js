/**
 * Listbox helpers
 *
 * Shared helpers for rendering and updating listbox-style option lists.
 */

import { CSSClasses } from '@shared/config/css-classes.config.js';

function renderListboxOptions({ container, options, createOption }) {
  if (!container) return;

  container.innerHTML = '';
  options.forEach((option) => {
    const element = createOption(option);
    if (element) {
      container.appendChild(element);
    }
  });
}

function updateListboxActiveState({
  container,
  optionSelector,
  activeValue,
  activeClass = CSSClasses.ACTIVE,
  getOptionValue = (option) => option.dataset.value,
  setAriaSelected = true
}) {
  if (!container) return;

  const options = container.querySelectorAll(optionSelector);
  options.forEach((option) => {
    const isActive = getOptionValue(option) === activeValue;
    option.classList.toggle(activeClass, isActive);
    if (setAriaSelected) {
      option.setAttribute('aria-selected', isActive ? 'true' : 'false');
    }
  });
}

export { renderListboxOptions, updateListboxActiveState };
