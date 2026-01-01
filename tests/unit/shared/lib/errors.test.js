import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AppError,
  formatErrorLabel
} from '@shared/lib/errors.js';

describe('Error Classes', () => {
  describe('AppError', () => {
    it('should create an instance with message', () => {
      const error = new AppError('Test error');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Test error');
      expect(error.name).toBe('AppError');
    });

    it('should include context object', () => {
      const context = { userId: 123, action: 'test' };
      const error = new AppError('Test error', context);

      expect(error.context).toEqual(context);
      expect(error.context.userId).toBe(123);
      expect(error.context.action).toBe('test');
    });

    it('should include timestamp', () => {
      const before = Date.now();
      const error = new AppError('Test error');
      const after = Date.now();

      expect(error.timestamp).toBeGreaterThanOrEqual(before);
      expect(error.timestamp).toBeLessThanOrEqual(after);
    });

    it('should handle empty context', () => {
      const error = new AppError('Test error');

      expect(error.context).toEqual({});
    });

    it('should have proper stack trace', () => {
      const error = new AppError('Test error');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('AppError');
      expect(error.stack).toContain('Test error');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new AppError('Test error');
      }).toThrow(AppError);

      try {
        throw new AppError('Test error', { code: 'TEST' });
      } catch (e) {
        expect(e).toBeInstanceOf(AppError);
        expect(e.message).toBe('Test error');
        expect(e.context.code).toBe('TEST');
      }
    });
  });

  describe('formatErrorLabel', () => {
    it('should format Error object', () => {
      const error = new Error('Test error');
      const label = formatErrorLabel(error);

      expect(label).toBe('Error: Test error');
    });

    it('should format AppError with custom name', () => {
      const error = new AppError('Application error');
      const label = formatErrorLabel(error);

      expect(label).toBe('AppError: Application error');
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

  describe('Context Preservation', () => {
    it('should preserve all context types', () => {
      const context = {
        string: 'value',
        number: 123,
        boolean: true,
        object: { nested: 'value' },
        array: [1, 2, 3],
        null: null,
        undefined: undefined
      };

      const error = new AppError('Test', context);

      expect(error.context.string).toBe('value');
      expect(error.context.number).toBe(123);
      expect(error.context.boolean).toBe(true);
      expect(error.context.object).toEqual({ nested: 'value' });
      expect(error.context.array).toEqual([1, 2, 3]);
      expect(error.context.null).toBe(null);
      expect(error.context.undefined).toBe(undefined);
    });
  });
});
