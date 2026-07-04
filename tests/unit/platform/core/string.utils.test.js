/**
 * String Utils Unit Tests
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeHtml, generateEntityId } from '@platform/core';

describe('String Utils', () => {
  describe('escapeHtml', () => {
    it.each([
      ['ampersand', 'foo & bar', 'foo &amp; bar'],
      ['less than', 'foo < bar', 'foo &lt; bar'],
      ['greater than', 'foo > bar', 'foo &gt; bar'],
      ['double quotes', 'foo "bar" baz', 'foo &quot;bar&quot; baz'],
      ['single quotes', "foo 'bar' baz", 'foo &#39;bar&#39; baz'],
      ['multiple special characters', '<script>alert("xss")</script>', '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'],
      ['all special characters in one string', '&<>"\'', '&amp;&lt;&gt;&quot;&#39;']
    ])('should escape %s', (_label, input, expected) => {
      expect(escapeHtml(input)).toBe(expected);
    });

    it.each([
      ['null', null],
      ['undefined', undefined],
      ['empty string', ''],
      ['falsy number', 0],
      ['falsy boolean', false]
    ])('should return empty string for %s input', (_label, input) => {
      expect(escapeHtml(input)).toBe('');
    });

    it('should convert numbers to string before escaping', () => {
      expect(escapeHtml(123)).toBe('123');
    });

    it('should handle string with no special characters', () => {
      expect(escapeHtml('hello world')).toBe('hello world');
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

    it.each([
      ['default prefix', undefined, /^id_\d+_[a-z0-9]+$/],
      ['custom prefix', 'note', /^note_\d+_[a-z0-9]+$/]
    ])('should generate id with %s', (_label, prefix, pattern) => {
      expect(generateEntityId(prefix)).toMatch(pattern);
    });

    it('should include timestamp in id', () => {
      const timestamp = Date.now();
      const id = generateEntityId('test');
      expect(id).toContain(`test_${timestamp}_`);
    });

    it('should generate unique ids', () => {
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
      expect(parts[2].length).toBe(7);
    });
  });
});
