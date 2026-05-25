import { expect } from 'vitest';
import { diffSortedValues } from '../../scripts/lib/manifest-drift.js';

function flattenStringLeaves(node, path = []) {
  if (typeof node === 'string') {
    return [{ path, value: node }];
  }

  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return [];
  }

  return Object.entries(node).flatMap(([key, value]) =>
    flattenStringLeaves(value, [...path, key])
  );
}

function flattenStringValues(node) {
  return flattenStringLeaves(node).map((leaf) => leaf.value);
}

function compareSortedValues(expected, actual) {
  const { missing, extra } = diffSortedValues(expected, actual);
  return { missing, extra };
}

function expectNoDrift(expected, actual) {
  const drift = compareSortedValues(expected, actual);
  expect(drift).toEqual({ missing: [], extra: [] });
}

export {
  compareSortedValues,
  expectNoDrift,
  flattenStringLeaves,
  flattenStringValues
};
