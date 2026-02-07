/**
 * Download a blob as a file in the renderer process.
 */
export function downloadFile(blob, filename) {
  return new Promise<void>((resolve, reject) => {
    try {
      if (!blob || !(blob instanceof Blob)) {
        throw new Error('Invalid blob provided');
      }

      const url = window.URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);

      setTimeout(() => {
        window.URL.revokeObjectURL(url);
        resolve();
      }, 5000);
    } catch (error) {
      reject(error);
    }
  });
}
