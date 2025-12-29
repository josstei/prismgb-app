/**
 * Download a blob as a file
 *
 * The URL is revoked after a delay to ensure the browser has time to
 * initiate the download. Immediate revocation can cause download failures.
 *
 * @param {Blob} blob - The blob to download
 * @param {string} filename - The filename to save as
 * @returns {Promise<void>} Resolves after download is initiated
 */
export function downloadFile(blob, filename) {
  return new Promise((resolve) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);

    // Delay URL revocation to ensure download has started
    // Browser needs time to read the blob URL before it's revoked
    setTimeout(() => {
      window.URL.revokeObjectURL(url);
      resolve();
    }, 5000);
  });
}
