/**
 * Status Footer Template
 *
 * Footer with status strip and metrics display.
 */

/**
 * Create status footer HTML
 * @returns {string} Footer HTML string
 */
export default function createStatusFooterTemplate() {
  return `
    <footer class="footer status-hidden">
      <div class="footer-right">
        <div class="status-strip" aria-live="polite">
          <div class="status-message sr-only" id="statusMessage" role="status">Checking device...</div>
          <div class="status-metrics" aria-label="Stream details">
            <div class="metric-chip" id="deviceStatusText">Disconnected</div>
            <div class="metric-chip">
              <span class="metric-label">Device</span>
              <span class="metric-value" id="deviceName">—</span>
            </div>
            <div class="metric-chip">
              <span class="metric-label">Resolution</span>
              <span class="metric-value" id="currentResolution">—</span>
            </div>
            <div class="metric-chip">
              <span class="metric-label">FPS</span>
              <span class="metric-value" id="currentFPS">—</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  `;
}

/**
 * DOM selectors for footer elements
 */
export const selectors = {
  statusMessage: 'statusMessage',
  deviceStatusText: 'deviceStatusText',
  deviceName: 'deviceName',
  currentResolution: 'currentResolution',
  currentFPS: 'currentFPS'
};
