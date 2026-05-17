import { describe, expect, it } from 'vitest';
import {
  ensureIsoDate,
  parseArgs,
  validateAllowlistWriteOptions
} from '../../../scripts/typecheck-app.js';

describe('typecheck-app', () => {
  it('parses explicit allowlist expiry options for writes', () => {
    expect(
      parseArgs([
        '--write-allowlist',
        'tmp/allowlist.json',
        '--default-expires-on',
        '2026-08-14',
        '--allow-expired-write'
      ])
    ).toMatchObject({
      allowlistPath: 'tmp/allowlist.json',
      outputPath: 'tmp/allowlist.json',
      writeAllowlist: true,
      defaultExpiresOn: '2026-08-14',
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
});
