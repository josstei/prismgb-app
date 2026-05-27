/**
 * Component Test Utilities
 *
 * Helpers to render templates and instantiate components for testing
 * using Testing Library patterns.
 */

import { queries, within } from '@testing-library/dom';

/**
 * Render HTML into a container and return Testing Library queries
 *
 * @param {string} html - Template HTML string
 * @returns {{ container: HTMLElement, cleanup: Function, ...queries }}
 */
export function renderTemplate(html) {
  const container = document.createElement('div');
  container.innerHTML = html;
  document.body.appendChild(container);

  // Get all Testing Library queries bound to this container
  const boundQueries = {};
  for (const [name, fn] of Object.entries(queries)) {
    if (typeof fn === 'function') {
      boundQueries[name] = (...args) => fn(container, ...args);
    }
  }

  return {
    container,
    ...boundQueries,
    // Within helper for nested queries
    within: (element) => within(element),
    // Cleanup function - MUST be called in afterEach
    cleanup: () => {
      container.remove();
    },
  };
}

/**
 * Gather element references by ID from a container
 * Follows the app's selector-id pattern
 *
 * @param {HTMLElement} container - Container to search in
 * @param {string[]} selectorIds - Array of element IDs to find
 * @returns {Object} - Map of id -> element
 */
export function gatherElements(container, selectorIds) {
  const elements = {};
  for (const id of selectorIds) {
    const element = container.querySelector(`#${id}`);
    if (element) {
      elements[id] = element;
    }
  }
  return elements;
}

/**
 * Render a template and instantiate a component with gathered element refs
 *
 * @param {string} html - Template HTML string
 * @param {Function} ComponentClass - Component class constructor
 * @param {string[]} elementIds - IDs of elements to gather
 * @param {Object} [extraDeps={}] - Additional dependencies to inject
 * @returns {{ component: Object, container: HTMLElement, elements: Object, cleanup: Function, ...queries }}
 */
export function renderComponent(html, ComponentClass, elementIds, extraDeps = {}) {
  const { container, cleanup: cleanupTemplate, ...queries } = renderTemplate(html);

  // Gather element references
  const elements = gatherElements(container, elementIds);

  // Instantiate component with elements and extra deps
  const component = new ComponentClass({ ...elements, ...extraDeps });

  return {
    component,
    container,
    elements,
    ...queries,
    cleanup: () => {
      // Call component dispose if available
      if (typeof component.dispose === 'function') {
        component.dispose();
      }
      cleanupTemplate();
    },
  };
}

/**
 * Create a minimal HTML fixture for testing a component
 * Generates empty elements with the required IDs
 *
 * @param {Object} selectorIds - Object mapping semantic IDs to element IDs (e.g., { STATUS_INDICATOR: 'statusIndicator' })
 * @returns {string} HTML string with empty elements for each ID
 */
export function createMinimalFixture(selectorIds) {
  const ids = Object.values(selectorIds);
  return ids.map((id) => `<div id="${id}"></div>`).join('\n');
}

/**
 * Setup helper that returns cleanup function for use in beforeEach/afterEach
 *
 * @param {Function} setupFn - Function that returns { cleanup, ...rest }
 * @returns {Object} The result of setupFn with managed cleanup
 */
export function setupWithCleanup(setupFn) {
  let cleanupFn = null;

  const result = setupFn();
  if (result && typeof result.cleanup === 'function') {
    cleanupFn = result.cleanup;
  }

  return {
    ...result,
    runCleanup: () => {
      if (cleanupFn) {
        cleanupFn();
        cleanupFn = null;
      }
    },
  };
}
