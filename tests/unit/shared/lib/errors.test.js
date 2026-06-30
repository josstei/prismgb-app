import { describe, it, expect } from 'vitest';
import { formatErrorLabel } from '@prismgb/core';

describe('Error Classes', () => {
  describe('formatErrorLabel', () => {
    it('should format Error object', () => {
      const error = new Error('Test error');
      const label = formatErrorLabel(error);

      expect(label).toBe('Error: Test error');
    });

    it('should format string error', () => {
      const label = formatErrorLabel('Simple error string');

      expect(label).toBe('Error: Simple error string');
    });

    it('should handle null/undefined', () => {
      expect(formatErrorLabel(null)).toBe('Error: null');
      expect(formatErrorLabel(undefined)).toBe('Error: undefined');
    });

    it('should handle error without name property', () => {
      const error = { message: 'Error message' };
      const label = formatErrorLabel(error);

      expect(label).toBe('Error: Error message');
    });

    it('should handle error without message property', () => {
      const error = { name: 'CustomError' };
      const label = formatErrorLabel(error);

      // When message is undefined, it gets converted to string '[object Object]'
      expect(label).toBe('CustomError: [object Object]');
    });
  });
});
