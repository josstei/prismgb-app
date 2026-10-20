import { describe, it, expect } from 'vitest';
import { escapeHtml } from '@renderer/presentation/primitives/html-escape.utils';

type EscapeHtmlInput = Parameters<typeof escapeHtml>[0];
type EscapeCase = readonly [label: string, input: EscapeHtmlInput, expected: string];
type EmptyEscapeCase = readonly [label: string, input: EscapeHtmlInput];

describe('escapeHtml', () => {
  const escapeCases: EscapeCase[] = [
    ['ampersand', 'foo & bar', 'foo &amp; bar'],
    ['less than', 'foo < bar', 'foo &lt; bar'],
    ['greater than', 'foo > bar', 'foo &gt; bar'],
    ['double quotes', 'foo "bar" baz', 'foo &quot;bar&quot; baz'],
    ['single quotes', "foo 'bar' baz", 'foo &#39;bar&#39; baz'],
    ['multiple special characters', '<script>alert("xss")</script>', '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'],
    ['all special characters in one string', '&<>"\'', '&amp;&lt;&gt;&quot;&#39;']
  ];

  it.each(escapeCases)('should escape %s', (_label, input, expected) => {
    expect(escapeHtml(input)).toBe(expected);
  });

  const emptyInputCases: EmptyEscapeCase[] = [
    ['null', null],
    ['undefined', undefined],
    ['empty string', ''],
    ['falsy number', 0],
    ['falsy boolean', false]
  ];

  it.each(emptyInputCases)('should return empty string for %s input', (_label, input) => {
    expect(escapeHtml(input)).toBe('');
  });

  it('should convert numbers to string before escaping', () => {
    expect(escapeHtml(123)).toBe('123');
  });

  it('should handle string with no special characters', () => {
    expect(escapeHtml('hello world')).toBe('hello world');
  });
});
