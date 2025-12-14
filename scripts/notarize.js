/**
 * macOS Notarization Script
 * This script is called by electron-builder after code signing.
 * It notarizes the app with Apple's notarization service.
 *
 * Required environment variables:
 * - APPLE_ID: Apple Developer account email
 * - APPLE_APP_SPECIFIC_PASSWORD: App-specific password from appleid.apple.com
 * - APPLE_TEAM_ID: 10-character Apple Developer Team ID
 */

import { notarize } from '@electron/notarize';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../package.json');

export default async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;

  // Only notarize macOS builds
  if (electronPlatformName !== 'darwin') {
    console.log('Skipping notarization: not a macOS build');
    return;
  }

  // Check for required environment variables
  const appleId = process.env.APPLE_ID;
  const appleIdPassword = process.env.APPLE_APP_SPECIFIC_PASSWORD;
  const teamId = process.env.APPLE_TEAM_ID;

  if (!appleId || !appleIdPassword || !teamId) {
    console.log('Skipping notarization: missing Apple credentials');
    console.log('  APPLE_ID:', appleId ? 'set' : 'missing');
    console.log('  APPLE_APP_SPECIFIC_PASSWORD:', appleIdPassword ? 'set' : 'missing');
    console.log('  APPLE_TEAM_ID:', teamId ? 'set' : 'missing');
    return;
  }

  const appName = context.packager.appInfo.productFilename;
  const appPath = `${appOutDir}/${appName}.app`;

  console.log(`Notarizing ${pkg.build.appId} at ${appPath}...`);
  console.log('This may take several minutes...');

  const startTime = Date.now();

  try {
    await notarize({
      tool: 'notarytool',
      appPath,
      appleId,
      appleIdPassword,
      teamId
    });

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log(`Notarization complete in ${duration}s`);
  } catch (error) {
    console.error('Notarization failed:', error.message);
    // Re-throw to fail the build
    throw error;
  }
}
