import { downloadFile } from '../../../lib/file-download.utils';

export function save(blob, filename) {
  return downloadFile(blob, filename);
}
