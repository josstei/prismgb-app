/**
 * Device status helpers for E2E tests.
 *
 * Keep this helper UI-focused. Device IPC and media mocks live in the current
 * Electron fixture and Chromatic helper surfaces.
 */

/**
 * Get current device status from UI.
 *
 * @param {import('@playwright/test').Page} page - Playwright page
 * @returns {Promise<Object>} Device status info
 */
export async function getDeviceStatus(page) {
  return page.evaluate(() => {
    const indicator = document.querySelector('#statusIndicator');
    const text = document.querySelector('#statusText');

    return {
      isConnected: indicator?.classList.contains('connected') ?? false,
      statusText: text?.textContent ?? '',
      indicatorClasses: indicator ? Array.from(indicator.classList) : [],
    };
  });
}
