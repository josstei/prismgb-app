/**
 * TranscodeProgressComponent
 *
 * Shows transcode progress on the record button with a circular progress ring.
 * Transforms the record button into a progress indicator during video conversion.
 */

class TranscodeToastComponent {
  /**
   * Create transcode progress component
   * @param {Object} elements - DOM elements
   * @param {HTMLElement} elements.recordBtn - Record button element
   * @param {HTMLElement} elements.transcodeRing - Progress ring element
   * @param {HTMLElement} elements.transcodePercentLabel - Percentage label element
   */
  constructor(elements) {
    this.elements = elements;
    this._hideTimeout = null;
    this._isVisible = false;
  }

  /**
   * Show the progress indicator
   * @param {string} format - Format being converted to (e.g., 'MP4', 'MOV') - unused but kept for API compatibility
   */
  show(_format = 'MP4') {
    if (!this.elements.recordBtn) return;

    // Clear any pending hide timeout
    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }

    // Show transcoding state with spinning animation
    this.elements.recordBtn.classList.remove('transcode-success', 'transcode-error');
    this.elements.recordBtn.classList.add('transcoding');

    // Reset progress ring to 0 (prevents showing stale 100% from previous transcode)
    if (this.elements.transcodeRing) {
      this.elements.transcodeRing.style.setProperty('--progress', 0);
    }

    // Clear any previous percentage
    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = '';
    }

    this._isVisible = true;
  }

  /**
   * Update progress display
   * @param {number} percent - Progress percentage (0-100), or negative if unknown
   */
  updateProgress(percent) {
    if (!this._isVisible) return;

    // If percent is negative or zero, just keep spinning (no label update)
    if (percent <= 0) return;

    const clampedPercent = Math.min(100, Math.max(0, Math.round(percent)));

    // Update CSS custom property for conic gradient
    if (this.elements.transcodeRing) {
      this.elements.transcodeRing.style.setProperty('--progress', clampedPercent);
    }

    // Update percentage label
    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = `${clampedPercent}%`;
    }
  }

  /**
   * Show success state and hide after delay
   */
  showSuccess() {
    if (!this.elements.recordBtn) return;

    // Switch to success state
    this.elements.recordBtn.classList.remove('transcoding');
    this.elements.recordBtn.classList.add('transcode-success');

    // Show checkmark
    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = '\u2713';
    }

    // Hide after brief display
    this._hideTimeout = setTimeout(() => {
      this.hide();
    }, 1200);
  }

  /**
   * Show error state and hide after delay
   * @param {string} message - Error message (unused, kept for API compatibility)
   */
  showError(_message = 'Failed') {
    if (!this.elements.recordBtn) return;

    // Show X mark
    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = '\u2717'; // X mark
    }

    this.elements.recordBtn.classList.remove('transcoding');
    this.elements.recordBtn.classList.add('transcode-error');

    // Hide after brief display
    this._hideTimeout = setTimeout(() => {
      this.hide();
    }, 2000);
  }

  /**
   * Hide the progress indicator
   */
  hide() {
    if (!this.elements.recordBtn) return;

    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }

    this.elements.recordBtn.classList.remove('transcoding', 'transcode-success', 'transcode-error');

    // Reset elements
    if (this.elements.transcodeRing) {
      this.elements.transcodeRing.style.setProperty('--progress', 0);
    }
    if (this.elements.transcodePercentLabel) {
      this.elements.transcodePercentLabel.textContent = '';
    }

    this._isVisible = false;
  }

  /**
   * Check if progress is currently visible
   * @returns {boolean}
   */
  get isVisible() {
    return this._isVisible;
  }

  /**
   * Cleanup
   */
  dispose() {
    if (this._hideTimeout) {
      clearTimeout(this._hideTimeout);
      this._hideTimeout = null;
    }
    this.hide();
  }
}

export { TranscodeToastComponent };
