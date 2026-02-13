/**
 * DOM Helpers for Testing
 *
 * Custom queries that work with the app's DOMSelectors pattern.
 * Provides Testing Library-style queries for element IDs.
 */

import { DOMSelectors } from '@renderer/presentation/config/dom-selectors.config.js';

/**
 * Get element by DOMSelector key
 * Throws if not found (like getBy* queries)
 *
 * @param {HTMLElement} container - Container to search in
 * @param {string} selectorKey - Key from DOMSelectors (e.g., 'STATUS_INDICATOR')
 * @returns {HTMLElement}
 */
export function getBySelectorId(container, selectorKey) {
  const id = DOMSelectors[selectorKey];
  if (!id) {
    throw new Error(
      `Unknown DOMSelector key: "${selectorKey}". ` +
        `Available keys: ${Object.keys(DOMSelectors).join(', ')}`
    );
  }

  const element = container.querySelector(`#${id}`);
  if (!element) {
    throw new Error(
      `Unable to find element with id "${id}" (DOMSelectors.${selectorKey})\n\n` +
        `Container HTML:\n${container.innerHTML.slice(0, 500)}${container.innerHTML.length > 500 ? '...' : ''}`
    );
  }

  return element;
}

/**
 * Query element by DOMSelector key
 * Returns null if not found (like queryBy* queries)
 *
 * @param {HTMLElement} container - Container to search in
 * @param {string} selectorKey - Key from DOMSelectors (e.g., 'STATUS_INDICATOR')
 * @returns {HTMLElement|null}
 */
export function queryBySelectorId(container, selectorKey) {
  const id = DOMSelectors[selectorKey];
  if (!id) {
    throw new Error(
      `Unknown DOMSelector key: "${selectorKey}". ` +
        `Available keys: ${Object.keys(DOMSelectors).join(', ')}`
    );
  }

  return container.querySelector(`#${id}`);
}

/**
 * Get all elements matching DOMSelector keys
 *
 * @param {HTMLElement} container - Container to search in
 * @param {string[]} selectorKeys - Array of keys from DOMSelectors
 * @returns {Object} Map of selectorKey -> element (only includes found elements)
 */
export function getAllBySelectorIds(container, selectorKeys) {
  const elements = {};
  for (const key of selectorKeys) {
    const element = queryBySelectorId(container, key);
    if (element) {
      elements[key] = element;
    }
  }
  return elements;
}

/**
 * Get element refs in the format expected by components
 * Maps DOMSelector keys to their camelCase ID values
 *
 * @param {HTMLElement} container - Container to search in
 * @param {string[]} selectorKeys - Array of keys from DOMSelectors
 * @returns {Object} Map of camelCase id -> element
 */
export function getElementRefs(container, selectorKeys) {
  const refs = {};
  for (const key of selectorKeys) {
    const id = DOMSelectors[key];
    if (!id) continue;

    const element = container.querySelector(`#${id}`);
    if (element) {
      refs[id] = element;
    }
  }
  return refs;
}

/**
 * Wait for element by DOMSelector key
 * Polls until element appears or timeout
 *
 * @param {HTMLElement} container - Container to search in
 * @param {string} selectorKey - Key from DOMSelectors
 * @param {Object} options - Wait options
 * @param {number} options.timeout - Max wait time in ms (default: 1000)
 * @param {number} options.interval - Poll interval in ms (default: 50)
 * @returns {Promise<HTMLElement>}
 */
export async function waitForSelectorId(container, selectorKey, options = {}) {
  const { timeout = 1000, interval = 50 } = options;
  const id = DOMSelectors[selectorKey];

  if (!id) {
    throw new Error(`Unknown DOMSelector key: "${selectorKey}"`);
  }

  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const element = container.querySelector(`#${id}`);
    if (element) {
      return element;
    }
    await new Promise((resolve) => setTimeout(resolve, interval));
  }

  throw new Error(
    `Timed out waiting for element with id "${id}" (DOMSelectors.${selectorKey})`
  );
}

/**
 * Assert element has specific classes
 *
 * @param {HTMLElement} element - Element to check
 * @param {string[]} classNames - Expected class names
 */
export function expectClasses(element, classNames) {
  for (const className of classNames) {
    if (!element.classList.contains(className)) {
      throw new Error(
        `Expected element to have class "${className}", ` +
          `but it has: "${Array.from(element.classList).join(', ')}"`
      );
    }
  }
}

/**
 * Assert element does not have specific classes
 *
 * @param {HTMLElement} element - Element to check
 * @param {string[]} classNames - Class names that should not be present
 */
export function expectNoClasses(element, classNames) {
  for (const className of classNames) {
    if (element.classList.contains(className)) {
      throw new Error(
        `Expected element NOT to have class "${className}", ` +
          `but it does. Classes: "${Array.from(element.classList).join(', ')}"`
      );
    }
  }
}

/**
 * Create a bound set of helpers for a specific container
 * Useful for repeated queries on the same container
 *
 * @param {HTMLElement} container - Container to bind queries to
 * @returns {Object} Bound query functions
 */
export function bindToContainer(container) {
  return {
    getBySelectorId: (key) => getBySelectorId(container, key),
    queryBySelectorId: (key) => queryBySelectorId(container, key),
    getAllBySelectorIds: (keys) => getAllBySelectorIds(container, keys),
    getElementRefs: (keys) => getElementRefs(container, keys),
    waitForSelectorId: (key, opts) => waitForSelectorId(container, key, opts),
  };
}

/**
 * Export DOMSelectors for convenience in tests
 */
export { DOMSelectors };
