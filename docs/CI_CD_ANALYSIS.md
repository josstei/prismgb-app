# CI/CD Framework Implementation Guide

**Status:** Production-Ready Implementation
**Last Updated:** December 2024

This document describes the complete CI/CD framework for PrismGB, including code signing, notarization, auto-updates, and release management for macOS, Windows, and Linux.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Development Lifecycle                        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Feature Branch ──► PR Validation ──► Code Review ──► Merge        │
│        │                  │                              │          │
│        │           ┌──────┴──────┐                       │          │
│        │           │  3 Platforms │                       ▼          │
│        │           │  - Linux     │                    main         │
│        │           │  - macOS     │                      │          │
│        │           │  - Windows   │                      │          │
│        │           └─────────────┘                       │          │
│        │                                                 ▼          │
│        │                                        prepare-release     │
│        │                                                 │          │
│        │                                                 ▼          │
│        │                                            Version Tag     │
│        │                                                 │          │
│        │           ┌─────────────────────────────────────┘          │
│        │           │                                                │
│        │           ▼                                                │
│        │     Release Workflow                                       │
│        │           │                                                │
│        │           ├──► Test Suite                                  │
│        │           │                                                │
│        │           ├──► Linux Build ──► AppImage, DEB, TAR.GZ       │
│        │           │                                                │
│        │           ├──► macOS Build ──► DMG, ZIP                    │
│        │           │        │              (signed + notarized)     │
│        │           │        │                                       │
│        │           │        └──► Notarization ──► Apple Servers     │
│        │           │                                                │
│        │           └──► Windows Build ──► NSIS, Portable            │
│        │                                                            │
│        │           ▼                                                │
│        │     Smoke Tests (all platforms)                            │
│        │           │                                                │
│        │           ▼                                                │
│        │     GitHub Release (draft)                                 │
│        │           │                                                │
│        │           ▼                                                │
│        └───────────────────────────────────────────────────────────┘
│                                                                     │
│  Auto-Update Flow:                                                  │
│                                                                     │
│  Installed App ──► Check for Updates ──► Download ──► Install      │
│                          │                                          │
│                          └──► GitHub Releases (latest-*.yml)        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

## GitHub Workflows

### 1. PR Validation (`pr.yml`)

**Trigger:** Pull requests to `main` or `beta` branches

**Jobs:**
- **Cross-Platform Tests:** Runs on Linux, macOS, and Windows
- **Commit Lint:** Validates conventional commits format
- **Build Smoke Test:** Ensures Vite bundle builds successfully

**Key Features:**
- 80% code coverage threshold (Linux only)
- Integration tests on all platforms
- Security audit on production dependencies

### 2. Release (`release.yml`)

**Trigger:** Version tags (`v*`) or manual dispatch

**Jobs:**
1. **Test:** Full test suite with security audit
2. **Build (Matrix):**
   - Linux: AppImage, DEB, TAR.GZ
   - macOS: DMG, ZIP (signed + notarized)
   - Windows: NSIS installer, Portable EXE
3. **Release:** Creates GitHub release with semantic versioning

**Features:**
- Build metrics (duration, artifact size)
- SHA256 checksums
- SBOM generation
- Auto-update manifests (`latest-*.yml`)

### 3. Prepare Release (`prepare-release.yml`)

**Trigger:** Manual workflow dispatch

**Purpose:** Bumps version and creates a release tag

**Options:**
- Version type: patch, minor, major
- Dry run mode for preview

### 4. Security Audit (`security-audit.yml`)

**Trigger:** Weekly schedule (Monday 9am UTC)

**Actions:**
- Scans production dependencies
- Creates GitHub issues for vulnerabilities
- Tracks severity levels

### 5. Dependabot Auto-Merge (`dependabot-auto-merge.yml`)

**Behavior:**
- Auto-merges patch and minor updates
- Labels major updates for manual review

---

## Code Signing & Notarization

### macOS Code Signing

The application is signed using an Apple Developer certificate.

**Required Secrets:**
```
CSC_LINK              # Base64-encoded .p12 certificate
CSC_KEY_PASSWORD      # Certificate password
```

**Configuration in `package.json`:**
```json
{
  "build": {
    "mac": {
      "hardenedRuntime": true,
      "entitlements": "assets/entitlements.mac.plist",
      "entitlementsInherit": "assets/entitlements.mac.plist"
    }
  }
}
```

### macOS Notarization

Apple requires all distributed software to be notarized for macOS 10.15+.

**Required Secrets:**
```
APPLE_ID                      # Apple Developer email
APPLE_APP_SPECIFIC_PASSWORD   # App-specific password from appleid.apple.com
APPLE_TEAM_ID                 # 10-character team ID
```

**Implementation:**
- `scripts/notarize.js` - afterSign hook for electron-builder
- Uses `@electron/notarize` with notarytool

**Process:**
1. Code signing completes
2. notarize.js is called by electron-builder
3. App is uploaded to Apple's notarization service
4. Apple validates and signs the notarization ticket
5. Ticket is stapled to the app

### Windows Code Signing (Future)

Not currently configured. When ready:

**Required Secrets:**
```
WIN_CSC_LINK          # Base64-encoded .pfx certificate
WIN_CSC_KEY_PASSWORD  # Certificate password
```

---

## Auto-Update System

### Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  UpdateManager  │────►│  electron-updater │────►│ GitHub Releases │
│  (Main Process) │◄────│                  │◄────│  latest-*.yml   │
└────────┬────────┘     └──────────────────┘     └─────────────────┘
         │
         │ IPC
         ▼
┌─────────────────┐
│  Renderer UI    │
│  (Update Toast) │
└─────────────────┘
```

### Components

**UpdateManager** (`src/features/updates/update.manager.js`)
- Manages update lifecycle (check, download, install)
- Emits events for UI updates
- Configures electron-updater

**IPC Channels** (`src/infrastructure/ipc/channels.json`)
- `update:check` - Check for updates
- `update:download` - Download available update
- `update:install` - Install and restart
- `update:get-status` - Get current update state
- `update:available` - Notification of available update
- `update:progress` - Download progress updates
- `update:downloaded` - Update ready to install
- `update:error` - Error notification

### Update Flow

1. **Startup:** App checks for updates 10 seconds after launch
2. **Periodic:** Checks every hour for new versions
3. **Available:** User is notified of available update
4. **Download:** User initiates download
5. **Ready:** User prompted to restart and install
6. **Install:** App quits and installs update

### Configuration

```json
// package.json
{
  "build": {
    "publish": {
      "provider": "github",
      "owner": "josstei",
      "repo": "prismgb-app",
      "releaseType": "draft"
    }
  }
}
```

---

## Beta Channel

### Semantic Release Configuration

```json
// .releaserc.json
{
  "branches": [
    "main",
    { "name": "beta", "prerelease": true }
  ]
}
```

### Version Format

- Stable: `1.0.0`
- Beta: `1.0.0-beta.1`

### Auto-Update Behavior

The UpdateManager automatically enables pre-release updates when running a beta version:

```javascript
autoUpdater.allowPrerelease = version.includes('beta');
```

---

## Required GitHub Secrets

| Secret | Purpose | Required For |
|--------|---------|--------------|
| `CSC_LINK` | Base64-encoded macOS .p12 certificate | macOS signing |
| `CSC_KEY_PASSWORD` | Certificate password | macOS signing |
| `APPLE_ID` | Apple Developer account email | Notarization |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password | Notarization |
| `APPLE_TEAM_ID` | 10-character Apple Team ID | Notarization |
| `WIN_CSC_LINK` | Base64-encoded Windows .pfx cert | Windows signing (future) |
| `WIN_CSC_KEY_PASSWORD` | Windows certificate password | Windows signing (future) |
| `SLACK_WEBHOOK` | Slack incoming webhook URL | Notifications (optional) |

### Encoding Certificates

```bash
# macOS certificate
base64 -i certificate.p12 | tr -d '\n' > csc_link.txt

# Windows certificate
base64 -i certificate.pfx | tr -d '\n' > win_csc_link.txt

# Copy contents to GitHub Secrets
```

---

## Release Process

### Creating a Release

1. **Automatic (Recommended):**
   ```bash
   # From GitHub Actions
   # Go to Actions → Prepare Release → Run workflow
   # Select version type (patch/minor/major)
   ```

2. **Manual:**
   ```bash
   npm version patch  # or minor/major
   git push origin main --follow-tags
   ```

### Release Workflow

1. Tag push triggers `release.yml`
2. Tests run on Ubuntu
3. Parallel builds on all 3 platforms
4. Smoke tests validate each build
5. Artifacts uploaded
6. Semantic release creates draft GitHub release
7. Review and publish draft release
8. Users receive auto-update notification

---

## Build Outputs

### Linux
- `PrismGB-{version}-x64.AppImage` - Portable application
- `PrismGB-{version}-x64.deb` - Debian package
- `PrismGB-{version}-x64.tar.gz` - Archive
- `latest-linux.yml` - Auto-update manifest

### macOS
- `PrismGB-{version}-mac.dmg` - Disk image (signed + notarized)
- `PrismGB-{version}-mac.zip` - Archive (signed + notarized)
- `latest-mac.yml` - Auto-update manifest

### Windows
- `PrismGB-Setup-{version}.exe` - NSIS installer
- `PrismGB-{version}-portable.exe` - Portable executable
- `latest.yml` - Auto-update manifest

### All Platforms
- `SHA256SUMS.txt` - Checksum verification file
- `sbom.spdx.json` - Software Bill of Materials

---

## Troubleshooting

### Notarization Fails

1. **Check credentials:** Ensure all Apple secrets are correctly set
2. **Check entitlements:** Verify `assets/entitlements.mac.plist` is correct
3. **Check logs:** Review notarize.js output in workflow logs

### Code Signing Fails

1. **Certificate expired:** Generate new certificate from Apple Developer
2. **Wrong password:** Verify CSC_KEY_PASSWORD matches certificate
3. **Base64 encoding:** Ensure no newlines in encoded certificate

### Auto-Update Not Working

1. **Development mode:** Updates are skipped in dev mode
2. **Draft release:** Publish the release to enable updates
3. **Version mismatch:** Check app version matches expected update

### Build Fails

1. **Native dependencies:** Ensure platform-specific deps are installed
2. **Electron cache:** Clear electron-builder cache
3. **Node version:** Verify Node 22 is being used

---

## Security Considerations

### Code Ownership

The `.github/CODEOWNERS` file enforces review requirements:
- All code changes require owner review
- CI/CD changes require careful review
- Main process code (security-sensitive) requires owner review

### Branch Protection (Recommended)

Configure in GitHub repository settings:
- Require PR reviews before merge
- Require status checks to pass
- Require signed commits
- Disallow force pushes to main

### Supply Chain Security

- SBOM generated for each release
- Weekly security audits
- Dependabot for dependency updates
- npm audit in CI pipeline

---

## File Reference

| File | Purpose |
|------|---------|
| `.github/workflows/release.yml` | Main release workflow |
| `.github/workflows/pr.yml` | PR validation |
| `.github/workflows/prepare-release.yml` | Version bumping |
| `.github/workflows/security-audit.yml` | Security scanning |
| `.github/workflows/dependabot-auto-merge.yml` | Dependency automation |
| `.github/CODEOWNERS` | Code ownership rules |
| `.releaserc.json` | Semantic release config |
| `scripts/notarize.js` | macOS notarization hook |
| `scripts/afterPack.js` | Post-build optimizations |
| `scripts/smoke-test.js` | Build validation |
| `src/features/updates/update.manager.js` | Auto-update service |
| `src/infrastructure/ipc/channels.json` | IPC channel definitions |
| `assets/entitlements.mac.plist` | macOS entitlements |
