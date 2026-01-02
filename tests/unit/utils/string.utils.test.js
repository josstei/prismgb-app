/**
 * String Utils Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeHtml, generateEntityId } from '../../../src/shared/utils/string.utils.js';

describe('String Utils', () => {
  describe('escapeHtml', () => {
    it('should escape ampersand', () => {
      expect(escapeHtml('foo & bar')).toBe('foo &amp; bar');
    });

    it('should escape less than', () => {
      expect(escapeHtml('foo < bar')).toBe('foo &lt; bar');
    });

    it('should escape greater than', () => {
      expect(escapeHtml('foo > bar')).toBe('foo &gt; bar');
    });

    it('should escape double quotes', () => {
      expect(escapeHtml('foo "bar" baz')).toBe('foo &quot;bar&quot; baz');
    });

    it('should escape single quotes', () => {
      expect(escapeHtml("foo 'bar' baz")).toBe('foo &#39;bar&#39; baz');
    });

    it('should escape multiple special characters', () => {
      expect(escapeHtml('<script>alert("xss")</script>'))
        .toBe('&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;');
    });

    it('should return empty string for null input', () => {
      expect(escapeHtml(null)).toBe('');
    });

    it('should return empty string for undefined input', () => {
      expect(escapeHtml(undefined)).toBe('');
    });

    it('should return empty string for empty string input', () => {
      expect(escapeHtml('')).toBe('');
    });

    it('should convert numbers to string before escaping', () => {
      expect(escapeHtml(123)).toBe('123');
    });

    it('should handle string with no special characters', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
    });

    it('should handle all special characters in one string', () => {
      expect(escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    });
  });

  describe('generateEntityId', () => {
    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should generate id with default prefix', () => {
      const id = generateEntityId();
      expect(id).toMatch(/^id_\d+_[a-z0-9]+$/);
    });

    it('should generate id with custom prefix', () => {
      const id = generateEntityId('note');
      expect(id).toMatch(/^note_\d+_[a-z0-9]+$/);
    });

    it('should include timestamp in id', () => {
      const timestamp = Date.now();
      const id = generateEntityId('test');
      expect(id).toContain(`test_${timestamp}_`);
    });

    it('should generate unique ids', () => {
      // Restore real timers for uniqueness test
      vi.useRealTimers();

      const ids = new Set();
      for (let i = 0; i < 100; i++) {
        ids.add(generateEntityId('item'));
      }
      expect(ids.size).toBe(100);
    });

    it('should generate id with random suffix of correct length', () => {
      const id = generateEntityId('prefix');
      const parts = id.split('_');
      expect(parts).toHaveLength(3);
      expect(parts[2].length).toBe(7); // substring(2, 9) = 7 chars
    });
  });
});
