import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  compareDiagnosticsToAllowlist,
  ensureIsoDate,
  loadAllowlist,
  parseArgs,
  validateAllowlistWriteOptions,
  writeAllowlist
} from '../../../scripts/typecheck-app.js';

const temporaryRoots = [];

function createTempRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'prismgb-typecheck-app-'));
  temporaryRoots.push(root);
  return root;
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

describe('typecheck-app', () => {
  it('defaults allowlist writes to the current Phase 4 expiry window', () => {
    const options = parseArgs(['--write-allowlist', 'tmp/allowlist.json']);

    expect(options.defaultExpiresOn).toBe('2026-12-31');
    validateAllowlistWriteOptions(options, '2026-05-21');
  });

  it('parses explicit allowlist expiry options for writes', () => {
    expect(
      parseArgs([
        '--write-allowlist',
        'tmp/allowlist.json',
        '--default-expires-on',
        '2026-08-14',
        '--default-owner',
        'platform:renderer',
        '--allow-expired-write'
      ])
    ).toMatchObject({
      allowlistPath: 'tmp/allowlist.json',
      outputPath: 'tmp/allowlist.json',
      writeAllowlist: true,
      defaultExpiresOn: '2026-08-14',
      defaultOwner: 'platform:renderer',
      allowExpiredWrite: true
    });
  });

  it('rejects invalid calendar dates', () => {
    expect(() => ensureIsoDate('2026-02-31', 'defaultExpiresOn')).toThrow(
      'Expected a real calendar date'
    );
    expect(() => ensureIsoDate('08/14/2026', 'defaultExpiresOn')).toThrow(
      'Expected YYYY-MM-DD'
    );
  });

  it('requires write expiry dates to be current unless explicitly overridden', () => {
    const options = parseArgs([
      '--write-allowlist',
      'tmp/allowlist.json',
      '--default-expires-on',
      '2026-04-30'
    ]);

    expect(() => validateAllowlistWriteOptions(options, '2026-05-16')).toThrow(
      'Refusing to write an expired allowlist'
    );

    validateAllowlistWriteOptions(
      { ...options, allowExpiredWrite: true },
      '2026-05-16'
    );
    validateAllowlistWriteOptions(
      { ...options, defaultExpiresOn: '2026-08-14' },
      '2026-05-16'
    );
  });

  it('requires owner metadata on loaded allowlists', () => {
    const root = createTempRoot();
    const allowlistPath = path.join(root, 'allowlist.json');
    fs.writeFileSync(
      allowlistPath,
      JSON.stringify({
        version: 1,
        defaultExpiresOn: '2026-12-31',
        entries: []
      })
    );

    expect(() => loadAllowlist(allowlistPath)).toThrow('missing "defaultOwner"');

    fs.writeFileSync(
      allowlistPath,
      JSON.stringify({
        version: 1,
        defaultExpiresOn: '2026-12-31',
        defaultOwner: 'platform:type-safety',
        entries: [
          {
            file: 'src/example/sample.ts',
            code: 'TS7006',
            maxCount: 1,
            expiresOn: '2026-12-31'
          }
        ]
      })
    );

    expect(loadAllowlist(allowlistPath).entries[0]).toMatchObject({
      owner: 'platform:type-safety'
    });
  });

  it('writes owned allowlist entries with the configured default owner', () => {
    const root = createTempRoot();
    const allowlistPath = path.join(root, 'allowlist.json');

    writeAllowlist(
      allowlistPath,
      [{ file: 'src/example/sample.ts', code: 'TS7006', maxCount: 1 }],
      '2026-12-31',
      'platform:example'
    );

    const loaded = loadAllowlist(allowlistPath);
    expect(loaded.entries[0]).toMatchObject({
      owner: 'platform:example',
      expiresOn: '2026-12-31'
    });
  });

  it('treats stale allowlist buckets as reducible debt that must fail the gate', () => {
    const findings = compareDiagnosticsToAllowlist(
      new Map([['src/example/sample.ts::TS7006', 1]]),
      [
        {
          file: 'src/example/sample.ts',
          code: 'TS7006',
          maxCount: 2,
          owner: 'platform:example',
          expiresOn: '2026-12-31'
        }
      ]
    );

    expect(findings.stale).toEqual([
      {
        file: 'src/example/sample.ts',
        code: 'TS7006',
        maxCount: 2,
        actualCount: 1
      }
    ]);
  });
});
