/**
 * Download a blob as a file in the renderer process.
 */
export function downloadFile(blob: Blob, filename: string): Promise<void> {
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
      }, 5000);

      resolve();
    } catch (error) {
      reject(error);
    }
  });
}
