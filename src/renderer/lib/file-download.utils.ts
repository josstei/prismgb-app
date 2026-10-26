type DownloadLifecycle = {
  expect(url: string): Promise<unknown>;
  cancel(url: string): Promise<unknown>;
};

/** Register the blob download with its owner before handing it to the browser. */
export async function downloadFile(blob: Blob, filename: string, lifecycle: DownloadLifecycle): Promise<void> {
  if (!blob || !(blob instanceof Blob)) throw new Error('Invalid blob provided');
  const url = window.URL.createObjectURL(blob);
  let anchor: HTMLAnchorElement | null = null;
  let registered = false;
  try {
    await lifecycle.expect(url);
    registered = true;
    anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
  } catch (error) {
    if (registered) await lifecycle.cancel(url);
    throw error;
  } finally {
    anchor?.remove();
    setTimeout(() => window.URL.revokeObjectURL(url), 5000);
  }
}
