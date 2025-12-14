/**
 * FilenameGenerator Unit Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import FilenameGenerator from '../../../src/shared/utils/filename-generator.js';

describe('FilenameGenerator', () => {
  beforeEach(() => {
    // Mock Date to have consistent timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2025-01-20T14:30:22'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('timestamp', () => {
    it('should generate timestamp in YYYYMMDD-HHMMSS-mmm format', () => {
      const timestamp = FilenameGenerator.timestamp();
      expect(timestamp).toBe('20250120-143022-000');
    });

    it('should pad single digit values with zeros', () => {
      vi.setSystemTime(new Date('2025-01-05T09:05:03'));
      const timestamp = FilenameGenerator.timestamp();
      expect(timestamp).toBe('20250105-090503-000');
    });

    it('should handle end of year', () => {
      vi.setSystemTime(new Date('2024-12-31T23:59:59'));
      const timestamp = FilenameGenerator.timestamp();
      expect(timestamp).toBe('20241231-235959-000');
    });

    it('should handle start of year', () => {
      vi.setSystemTime(new Date('2025-01-01T00:00:00'));
      const timestamp = FilenameGenerator.timestamp();
      expect(timestamp).toBe('20250101-000000-000');
    });
  });

  describe('forScreenshot', () => {
    it('should generate screenshot filename with timestamp', () => {
      const filename = FilenameGenerator.forScreenshot();
      expect(filename).toBe('prismgb-screenshot-20250120-143022-000.png');
    });

    it('should have .png extension', () => {
      const filename = FilenameGenerator.forScreenshot();
      expect(filename.endsWith('.png')).toBe(true);
    });

    it('should include prismgb-screenshot prefix', () => {
      const filename = FilenameGenerator.forScreenshot();
      expect(filename.startsWith('prismgb-screenshot-')).toBe(true);
    });
  });

  describe('forRecording', () => {
    it('should generate recording filename with timestamp', () => {
      const filename = FilenameGenerator.forRecording();
      expect(filename).toBe('prismgb-recording-20250120-143022-000.webm');
    });

    it('should have .webm extension', () => {
      const filename = FilenameGenerator.forRecording();
      expect(filename.endsWith('.webm')).toBe(true);
    });

    it('should include prismgb-recording prefix', () => {
      const filename = FilenameGenerator.forRecording();
      expect(filename.startsWith('prismgb-recording-')).toBe(true);
    });
  });

  describe('Uniqueness', () => {
    it('should generate different filenames at different times', () => {
      const filename1 = FilenameGenerator.forScreenshot();

      vi.setSystemTime(new Date('2025-01-20T14:30:23'));
      const filename2 = FilenameGenerator.forScreenshot();

      expect(filename1).not.toBe(filename2);
    });

    it('should generate same filename at same time', () => {
      const filename1 = FilenameGenerator.forScreenshot();
      const filename2 = FilenameGenerator.forScreenshot();

      expect(filename1).toBe(filename2);
    });
  });
});
