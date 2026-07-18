/**
 * Recursive filesystem walk shared by gate scripts.
 */
import fs from 'node:fs';
import path from 'node:path';

export function walkPaths(rootDirectory) {
  if (!fs.existsSync(rootDirectory)) {
    return [];
  }

  return fs.readdirSync(rootDirectory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(rootDirectory, entry.name);
    if (entry.isDirectory()) {
      return [absolutePath, ...walkPaths(absolutePath)];
    }
    return [absolutePath];
  });
}
