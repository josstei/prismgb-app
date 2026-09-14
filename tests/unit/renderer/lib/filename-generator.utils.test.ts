/**
 * FilenameGenerator Unit Tests
 */

import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { FilenameGenerator } from '@renderer/lib/filename-generator.utils';

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
      const timestamp: string = FilenameGenerator.timestamp();
      expect(timestamp).toBe('20250120-143022-000');
    });

    it('should pad single digit values with zeros', () => {
      vi.setSystemTime(new Date('2025-01-05T09:05:03'));
      const timestamp: string = FilenameGenerator.timestamp();
      expect(timestamp).toBe('20250105-090503-000');
    });

    it('should handle end of year', () => {
      vi.setSystemTime(new Date('2024-12-31T23:59:59'));
      const timestamp: string = FilenameGenerator.timestamp();
      expect(timestamp).toBe('20241231-235959-000');
    });

    it('should handle start of year', () => {
      vi.setSystemTime(new Date('2025-01-01T00:00:00'));
      const timestamp: string = FilenameGenerator.timestamp();
      expect(timestamp).toBe('20250101-000000-000');
    });
  });

  describe('forScreenshot', () => {
    it('should generate screenshot filename with timestamp', () => {
      const filename: string = FilenameGenerator.forScreenshot();
      expect(filename).toBe('prismgb-screenshot-20250120-143022-000.png');
    });

    it('should have .png extension', () => {
      const filename: string = FilenameGenerator.forScreenshot();
      expect(filename.endsWith('.png')).toBe(true);
    });

    it('should include prismgb-screenshot prefix', () => {
      const filename: string = FilenameGenerator.forScreenshot();
      expect(filename.startsWith('prismgb-screenshot-')).toBe(true);
    });
  });

  describe('forRecording', () => {
    it('should generate recording filename with timestamp', () => {
      const filename: string = FilenameGenerator.forRecording();
      expect(filename).toBe('prismgb-recording-20250120-143022-000.webm');
    });

    it('should have .webm extension', () => {
      const filename: string = FilenameGenerator.forRecording();
      expect(filename.endsWith('.webm')).toBe(true);
    });

    it('should include prismgb-recording prefix', () => {
      const filename: string = FilenameGenerator.forRecording();
      expect(filename.startsWith('prismgb-recording-')).toBe(true);
    });
  });

  describe('Uniqueness', () => {
    it('should generate different filenames at different times', () => {
      const filename1: string = FilenameGenerator.forScreenshot();

      vi.setSystemTime(new Date('2025-01-20T14:30:23'));
      const filename2: string = FilenameGenerator.forScreenshot();

      expect(filename1).not.toBe(filename2);
    });

    it('should generate same filename at same time', () => {
      const filename1: string = FilenameGenerator.forScreenshot();
      const filename2: string = FilenameGenerator.forScreenshot();

      expect(filename1).toBe(filename2);
    });
  });

  // README.md's File Locations section is how users find their captures, so it
  // must describe exactly what the generator emits.
  describe('README File Locations', () => {
    const readme = fs.readFileSync(path.resolve(process.cwd(), 'README.md'), 'utf8');

    function documentedCapture(label: string): { template: string; example: string } {
      const entry = readme.match(new RegExp(`^- ${label}: \`([^\`]+)\`.*, for example \`([^\`]+)\`$`, 'm'));
      expect(entry, `README.md File Locations has no "- ${label}:" entry with an example`).not.toBeNull();
      return { template: entry![1], example: entry![2] };
    }

    function templatePattern(template: string): RegExp {
      const tokens: Record<string, string> = {
        YYYYMMDD: '\\d{8}',
        HHMMSS: '\\d{6}',
        mmm: '\\d{3}',
        '<format>': '[a-z0-9]+'
      };
      const source = template
        .split(/(YYYYMMDD|HHMMSS|mmm|<format>)/)
        .map((part) => tokens[part] ?? part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('');
      return new RegExp(`^${source}$`);
    }

    beforeEach(() => {
      vi.setSystemTime(new Date('2025-01-20T14:30:22.123'));
    });

    it('documents the screenshot filename the generator emits', () => {
      const { template, example } = documentedCapture('Screenshots');
      const filename: string = FilenameGenerator.forScreenshot();
      expect(example).toBe(filename);
      expect(filename).toMatch(templatePattern(template));
    });

    it('documents the recording filename the generator emits', () => {
      const { template, example } = documentedCapture('Recordings');
      const filename: string = FilenameGenerator.forRecording();
      expect(example).toBe(filename);
      expect(filename).toMatch(templatePattern(template));
    });
  });
});
