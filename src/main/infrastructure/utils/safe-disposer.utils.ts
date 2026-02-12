/**
 * Safe Disposer Utility
 *
 * Provides safe resource cleanup with error handling.
 * Continues cleanup even if individual resources fail.
 */

/**
 * Safely dispose of a resource, logging errors without throwing
 * @param {Object} logger - Logger instance
 * @param {string} name - Resource name for error messages
 * @param {Object} resource - Resource to dispose
 * @param {string} [method='dispose'] - Method name to call
 * @returns {Promise<void>}
 */
export async function safeDispose(logger, name, resource, method = 'dispose') {
  if (!resource) return;

  try {
    const fn = resource[method];
    if (typeof fn === 'function') {
      await fn.call(resource);
    }
  } catch (error) {
    logger.error(`Error disposing ${name}:`, error);
  }
}

/**
 * Safely dispose of multiple resources
 * @param {Object} logger - Logger instance
 * @param {Array<[string, Object, string?]>} resources - Array of [name, resource, method?]
 * @returns {Promise<void>}
 */
export async function safeDisposeAll(logger, resources) {
  for (const [name, resource, method] of resources) {
    await safeDispose(logger, name, resource, method);
  }
}
