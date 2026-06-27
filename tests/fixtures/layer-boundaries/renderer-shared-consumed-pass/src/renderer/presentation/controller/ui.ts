import { downloadFile } from '../../lib/file-download.utils';

export function bindSave(blob, filename) {
  return downloadFile(blob, filename);
}
