import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  AppError,
  DeviceError,
  StreamingError,
  CaptureError,
  ConfigError,
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

  describe('DeviceError', () => {
    it('should extend AppError', () => {
      const error = new DeviceError('Device not found');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(DeviceError);
      expect(error.name).toBe('DeviceError');
    });

    it('should include device domain in context', () => {
      const error = new DeviceError('Device not found');

      expect(error.context.domain).toBe('device');
    });

    it('should merge provided context with domain', () => {
      const error = new DeviceError('Device not found', {
        deviceId: 'chromatic-001',
        vendorId: '0x1234'
      });

      expect(error.context.domain).toBe('device');
      expect(error.context.deviceId).toBe('chromatic-001');
      expect(error.context.vendorId).toBe('0x1234');
    });

    it('should preserve timestamp from AppError', () => {
      const error = new DeviceError('Device error');

      expect(error.timestamp).toBeDefined();
      expect(typeof error.timestamp).toBe('number');
    });
  });

  describe('StreamingError', () => {
    it('should extend AppError', () => {
      const error = new StreamingError('Stream failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(StreamingError);
      expect(error.name).toBe('StreamingError');
    });

    it('should include streaming domain in context', () => {
      const error = new StreamingError('Stream failed');

      expect(error.context.domain).toBe('streaming');
    });

    it('should merge provided context with domain', () => {
      const error = new StreamingError('Stream failed', {
        streamId: 'stream-123',
        format: 'h264',
        resolution: '160x144'
      });

      expect(error.context.domain).toBe('streaming');
      expect(error.context.streamId).toBe('stream-123');
      expect(error.context.format).toBe('h264');
      expect(error.context.resolution).toBe('160x144');
    });
  });

  describe('CaptureError', () => {
    it('should extend AppError', () => {
      const error = new CaptureError('Capture failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(CaptureError);
      expect(error.name).toBe('CaptureError');
    });

    it('should include capture domain in context', () => {
      const error = new CaptureError('Capture failed');

      expect(error.context.domain).toBe('capture');
    });

    it('should merge provided context with domain', () => {
      const error = new CaptureError('Screenshot failed', {
        filepath: '/path/to/screenshot.png',
        format: 'png',
        reason: 'insufficient_permissions'
      });

      expect(error.context.domain).toBe('capture');
      expect(error.context.filepath).toBe('/path/to/screenshot.png');
      expect(error.context.format).toBe('png');
      expect(error.context.reason).toBe('insufficient_permissions');
    });
  });

  describe('ConfigError', () => {
    it('should extend AppError', () => {
      const error = new ConfigError('Invalid config');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(AppError);
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.name).toBe('ConfigError');
    });

    it('should include config domain in context', () => {
      const error = new ConfigError('Invalid config');

      expect(error.context.domain).toBe('config');
    });

    it('should merge provided context with domain', () => {
      const error = new ConfigError('Invalid value', {
        key: 'renderPreset',
        value: 'invalid-preset',
        expectedValues: ['default', 'crt', 'lcd']
      });

      expect(error.context.domain).toBe('config');
      expect(error.context.key).toBe('renderPreset');
      expect(error.context.value).toBe('invalid-preset');
      expect(error.context.expectedValues).toEqual(['default', 'crt', 'lcd']);
    });
  });

  describe('Error Hierarchy', () => {
    it('should allow catching base class', () => {
      const errors = [
        new DeviceError('Device error'),
        new StreamingError('Stream error'),
        new CaptureError('Capture error'),
        new ConfigError('Config error')
      ];

      errors.forEach(error => {
        try {
          throw error;
        } catch (e) {
          expect(e).toBeInstanceOf(AppError);
        }
      });
    });

    it('should allow catching specific error types', () => {
      try {
        throw new DeviceError('Test');
      } catch (e) {
        if (e instanceof DeviceError) {
          expect(e.context.domain).toBe('device');
        }
      }
    });

    it('should differentiate between error types', () => {
      const deviceError = new DeviceError('Device error');
      const streamError = new StreamingError('Stream error');

      expect(deviceError instanceof DeviceError).toBe(true);
      expect(deviceError instanceof StreamingError).toBe(false);
      expect(streamError instanceof StreamingError).toBe(true);
      expect(streamError instanceof DeviceError).toBe(false);
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

    it('should format DeviceError', () => {
      const error = new DeviceError('Device not found');
      const label = formatErrorLabel(error);

      expect(label).toBe('DeviceError: Device not found');
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
    it('should not mutate original context object', () => {
      const originalContext = { userId: 123 };
      const error = new DeviceError('Test', originalContext);

      expect(originalContext.domain).toBeUndefined();
      expect(error.context.domain).toBe('device');
    });

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
