/**
 * Validate Dependencies Utility
 *
 * Shared validation logic for both BaseService and BaseOrchestrator
 * to eliminate code duplication.
 */

/**
 * Validate that all required dependencies are provided
 * @param {Object} dependencies - Provided dependencies
 * @param {string[]} required - Required dependency names
 * @param {string} className - Class name for error messages
 * @throws {Error} If any required dependency is missing
 */
export function validateDependencies(dependencies, required, className) {
  const missing = required.filter(dep => dependencies[dep] === undefined);
  if (missing.length > 0) {
    throw new Error(`${className}: Missing required dependencies: ${missing.join(', ')}`);
  }
}
