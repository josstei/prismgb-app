type HtmlEscapableValue = string | number | bigint | boolean | null | undefined;
type HtmlEscapableCharacter = '&' | '<' | '>' | '"' | "'";

const HTML_ENTITIES: Record<HtmlEscapableCharacter, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value: HtmlEscapableValue): string {
  if (!value) {
    return '';
  }

  return String(value).replace(/[&<>"']/g, (char) => HTML_ENTITIES[char as HtmlEscapableCharacter]);
}

export function generateEntityId(prefix: string = 'id'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}
