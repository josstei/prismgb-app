/**
 * App Shell Template
 *
 * Root UI layout composed from shell and feature templates.
 */

import createHeaderTemplate from './header.template';
import createStreamViewerTemplate from '@renderer/presentation/features/streaming/stream-viewer.template';
import createNotesPanelTemplate from '@renderer/presentation/features/notes/notes-panel.template';
import createStatusFooterTemplate from './status-footer.template';

export function createAppShellTemplate(): string {
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
