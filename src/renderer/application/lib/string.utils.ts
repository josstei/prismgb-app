/**
 * String manipulation utilities
 */

/**
 * HTML entity mapping for escaping
 */
const HTML_ENTITIES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/**
 * Escape HTML special characters to prevent XSS
 * @param {string} str - String to escape
 * @returns {string} Escaped string safe for HTML insertion
 */
function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, char => HTML_ENTITIES[char]);
}

/**
 * Generate a unique entity ID
 * @param {string} prefix - Prefix for the ID (e.g., 'note', 'item')
 * @returns {string} Unique identifier
 */
function generateEntityId(prefix = 'id') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

export {
  escapeHtml,
  generateEntityId
};
