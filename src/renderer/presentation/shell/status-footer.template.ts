/**
 * Status Footer Template
 *
 * Footer with status strip and metrics display.
 */

export default function createStatusFooterTemplate(): string {
  return `
    <footer class="footer status-hidden" data-ref="footer">
      <div class="footer-right">
        <div class="status-strip" aria-live="polite">
          <div class="status-message" id="statusMessage" data-ref="statusMessage" role="status"></div>
          <div class="status-metrics" aria-label="Stream details">
            <div class="metric-chip" id="deviceStatusText" data-ref="deviceStatusText">Disconnected</div>
            <div class="metric-chip">
              <span class="metric-label">Device</span>
              <span class="metric-value" id="deviceName" data-ref="deviceName">—</span>
            </div>
            <div class="metric-chip">
              <span class="metric-label">Resolution</span>
              <span class="metric-value" id="currentResolution" data-ref="currentResolution">—</span>
            </div>
            <div class="metric-chip">
              <span class="metric-label">FPS</span>
              <span class="metric-value" id="currentFPS" data-ref="currentFPS">—</span>
            </div>
          </div>
        </div>
      </div>
    </footer>
  `;
}
