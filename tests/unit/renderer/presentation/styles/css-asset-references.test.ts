import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const rendererRoot = path.resolve(process.cwd(), 'src/renderer');

function collectCssFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return collectCssFiles(fullPath);
    }
    return entry.name.endsWith('.css') ? [fullPath] : [];
  });
}

function relativeUrlReferences(cssPath: string): { reference: string; resolved: string }[] {
  const content = fs.readFileSync(cssPath, 'utf8');
  const matches = content.matchAll(/url\(\s*['"]?(\.{1,2}\/[^'")]+)['"]?\s*\)/g);
  return [...matches].map((match) => ({
    reference: match[1],
    resolved: path.resolve(path.dirname(cssPath), match[1])
  }));
}

describe('css relative asset references', () => {
  it('resolves every relative url() to an existing file', () => {
    const missing = collectCssFiles(rendererRoot).flatMap((cssPath) =>
      relativeUrlReferences(cssPath)
        .filter(({ resolved }) => !fs.existsSync(resolved))
        .map(({ reference }) => `${path.relative(process.cwd(), cssPath)} -> ${reference}`)
    );
    expect(missing).toEqual([]);
  });
});
