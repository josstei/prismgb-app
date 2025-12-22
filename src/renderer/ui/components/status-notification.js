/**
 * StatusNotificationComponent
 *
 * Centralized status message display with color-coded notifications.
 * Manages all status messages shown to the user in the UI.
 */

class StatusNotificationComponent {
  /**
   * Create status notification component
   * @param {Object} elements - DOM elements { statusMessage }
   */
  constructor(elements) {
    this.elements = elements;
    // Valid status types for CSS data-type attribute
    this.validTypes = ['info', 'success', 'warning', 'error'];
  }

  /**
   * Show status message
   * @param {string} message - Message text
   * @param {string} type - Message type: 'info' | 'success' | 'warning' | 'error'
   */
  show(message, type = 'info') {
    if (!this.elements.statusMessage) return;
    this.elements.statusMessage.textContent = message;
    // Use data attribute for CSS-driven colors
    const validType = this.validTypes.includes(type) ? type : 'info';
    this.elements.statusMessage.dataset.type = validType;
  }
}

export { StatusNotificationComponent };
