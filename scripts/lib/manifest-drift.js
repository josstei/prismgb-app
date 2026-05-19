export function compareSortedValues({ name, expected, actual }) {
  const expectedValues = [...expected].sort();
  const actualValues = [...actual].sort();
  const missing = expectedValues.filter((value) => !actualValues.includes(value));
  const extra = actualValues.filter((value) => !expectedValues.includes(value));

  return {
    name,
    status: missing.length === 0 && extra.length === 0 ? 'pass' : 'fail',
    expectedCount: expectedValues.length,
    actualCount: actualValues.length,
    missing,
    extra
  };
}

export function flattenStringLeaves(node) {
  if (typeof node === 'string') {
    return [node];
  }

  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return [];
  }

  return Object.values(node).flatMap((value) => flattenStringLeaves(value));
}

