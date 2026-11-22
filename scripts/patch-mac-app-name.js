import fs from 'fs';
import path from 'path';
import { createRequire } from 'node:module';

const APP_NAME = 'PrismGB';
const require = createRequire(import.meta.url);

const updatePlistValue = (plistContent, key, value) => {
  const pattern = new RegExp(`(<key>${key}</key>\\s*<string>)([^<]+)(</string>)`);
  if (pattern.test(plistContent)) {
    return plistContent.replace(pattern, `$1${value}$3`);
  }

  // If the key doesn't exist, insert it before the closing dict
  return plistContent.replace(
    /<\/dict>\s*<\/plist>/,
    `  <key>${key}</key>\n  <string>${value}</string>\n</dict>\n</plist>`
  );
};

const main = () => {
  if (process.platform !== 'darwin') {
    return;
  }

  // Electron 42+ downloads its binary on first use rather than during npm ci.
  const electronPath = require('electron');
  const plistPath = path.resolve(path.dirname(electronPath), '..', 'Info.plist');
  if (!fs.existsSync(plistPath)) {
    console.warn(`[patch-mac-app-name] Info.plist not found at ${plistPath}`);
    return;
  }

  const original = fs.readFileSync(plistPath, 'utf8');
  let updated = original;

  updated = updatePlistValue(updated, 'CFBundleName', APP_NAME);
  updated = updatePlistValue(updated, 'CFBundleDisplayName', APP_NAME);

  if (updated !== original) {
    fs.writeFileSync(plistPath, updated);
    console.log('[patch-mac-app-name] Updated macOS menu/title to PrismGB for dev Electron binary');
  }
};

main();
