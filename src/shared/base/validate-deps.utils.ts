export function validateDependencies(
  dependencies: object,
  required: readonly string[],
  className: string
): void {
  const dependencyMap = dependencies as Record<string, unknown>;
  const missing = required.filter((dependency) => dependencyMap[dependency] === undefined);

  if (missing.length > 0) {
    throw new Error(`${className}: Missing required dependencies: ${missing.join(', ')}`);
  }
}
