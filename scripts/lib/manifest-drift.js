function countValues(values) {
  return values.reduce((counts, value) => counts.set(value, (counts.get(value) || 0) + 1), new Map());
}

export function diffSortedValues(expected, actual) {
  const expectedValues = [...expected].sort();
  const actualValues = [...actual].sort();
  const expectedCounts = countValues(expectedValues);
  const actualCounts = countValues(actualValues);
  const missing = [];
  const extra = [];

  for (const key of [...new Set([...expectedCounts.keys(), ...actualCounts.keys()])].sort()) {
    const delta = (expectedCounts.get(key) || 0) - (actualCounts.get(key) || 0);
    if (delta !== 0) {
      (delta > 0 ? missing : extra).push(...Array.from({ length: Math.abs(delta) }, () => key));
    }
  }

  return { expectedValues, actualValues, missing, extra };
}

export function compareSortedValues({ name, expected, actual }) {
  const { expectedValues, actualValues, missing, extra } = diffSortedValues(expected, actual);

  return { name, status: missing.length === 0 && extra.length === 0 ? 'pass' : 'fail',
    expectedCount: expectedValues.length, actualCount: actualValues.length, missing, extra };
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
