/**
 * App Shell Template
 *
 * Root UI layout composed from shell and feature templates.
 */

import createHeaderTemplate from './header.template.js';
import createStreamViewerTemplate from '@renderer/ui/features/streaming/stream-viewer.template.js';
import createNotesPanelTemplate from '@renderer/ui/features/notes/notes-panel.template.js';
import createStatusFooterTemplate from './status-footer.template.js';

export function createAppShellTemplate() {
  return `
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
