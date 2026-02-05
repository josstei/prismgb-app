/**
 * Validate that all required dependencies are present.
 * @throws Error if any required dependency is missing
 */
export function validateDependencies(
  dependencies: Record<string, unknown>,
  requiredDeps: string[],
  serviceName: string
): void {
  for (const dep of requiredDeps) {
    if (dependencies[dep] === undefined || dependencies[dep] === null) {
      throw new Error(`${serviceName}: missing required dependency: ${dep}`);
    }
  }
}
