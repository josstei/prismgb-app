export function validateDependencies(dependencies: Record<string, unknown>, required: string[], className: string): void {
  const missing = required.filter(dep => dependencies[dep] === undefined);
  if (missing.length > 0) {
    throw new Error(`${className}: Missing required dependencies: ${missing.join(', ')}`);
  }
}
