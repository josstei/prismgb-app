/**
 * Template Registry
 *
 * Central export of all HTML templates and a renderer utility.
 */

import createHeaderTemplate from './header.template.js';
import createStreamViewerTemplate from './stream-viewer.template.js';
import createNotesPanelTemplate from './notes-panel.template.js';
import createStatusFooterTemplate from './status-footer.template.js';

// Re-export individual templates
export {
  createHeaderTemplate,
  createStreamViewerTemplate,
  createNotesPanelTemplate,
  createStatusFooterTemplate
};

/**
 * Render all templates into the app container
 * @param {HTMLElement} container - The .app-container element
 */
export function renderAppTemplates(container) {
  container.innerHTML = `
    ${createHeaderTemplate()}
    <main class="main-content">
      <section class="stream-section">
        ${createStreamViewerTemplate()}
      </section>
    </main>
    ${createNotesPanelTemplate()}
    ${createStatusFooterTemplate()}
  `;
}
