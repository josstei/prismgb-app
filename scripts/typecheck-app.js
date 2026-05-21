#!/usr/bin/env node
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const DEFAULT_ALLOWLIST_PATH = 'scripts/type-debt-allowlist.json';
const DEFAULT_EXPIRY_DATE = '2026-12-31';
const DEFAULT_OWNER = 'platform:type-safety';

function parseArgs(argv) {
  const options = {
    allowlistPath: DEFAULT_ALLOWLIST_PATH,
    writeAllowlist: false,
    outputPath: DEFAULT_ALLOWLIST_PATH,
    defaultExpiresOn: DEFAULT_EXPIRY_DATE,
    defaultOwner: DEFAULT_OWNER,
    allowExpiredWrite: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allowlist') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --allowlist');
      }
      options.allowlistPath = value;
      index += 1;
      continue;
    }

    if (arg === '--write-allowlist') {
      options.writeAllowlist = true;
      const maybePath = argv[index + 1];
      if (maybePath && !maybePath.startsWith('--')) {
        options.outputPath = maybePath;
        options.allowlistPath = maybePath;
        index += 1;
      } else {
        options.outputPath = options.allowlistPath;
      }
      continue;
    }

    if (arg === '--default-expires-on') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --default-expires-on');
      }
      options.defaultExpiresOn = value;
      index += 1;
      continue;
    }

    if (arg === '--default-owner') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error('Missing value for --default-owner');
      }
      options.defaultOwner = value;
      index += 1;
      continue;
    }

    if (arg === '--allow-expired-write') {
      options.allowExpiredWrite = true;
    }
  }

  return options;
}

function normalizeRelativePath(value) {
  return value.split(path.sep).join('/');
}

function parseDiagnostics(outputText, cwd) {
  const lines = outputText.split(/\r?\n/).filter(Boolean);
  const diagnostics = [];
  const linePattern = /^(.+)\((\d+),(\d+)\): error TS(\d+): (.+)$/;

  for (const line of lines) {
    const match = line.match(linePattern);
    if (!match) {
      continue;
    }

    const [, filePath, lineText, columnText, code, message] = match;
    const absolutePath = path.isAbsolute(filePath) ? filePath : path.resolve(cwd, filePath);
    const relativeFile = normalizeRelativePath(path.relative(cwd, absolutePath));

    diagnostics.push({
      file: relativeFile,
      code: `TS${code}`,
      line: Number(lineText),
      column: Number(columnText),
      message
    });
  }

  return diagnostics;
}

function aggregateDiagnostics(diagnostics) {
  const totals = new Map();
  for (const diagnostic of diagnostics) {
    const key = `${diagnostic.file}::${diagnostic.code}`;
    totals.set(key, (totals.get(key) || 0) + 1);
  }

  return [...totals.entries()]
    .map(([key, count]) => {
      const [file, code] = key.split('::');
      return { file, code, maxCount: count };
    })
    .sort((a, b) => {
      if (a.file !== b.file) {
        return a.file.localeCompare(b.file);
      }
      return a.code.localeCompare(b.code);
    });
}

function runTypeScript() {
  const result = spawnSync(
    process.execPath,
    [
      './node_modules/typescript/bin/tsc',
      '-p',
      'tsconfig.app.json',
      '--noEmit',
      '--pretty',
      'false'
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8'
    }
  );

  return {
    status: typeof result.status === 'number' ? result.status : 1,
    stdout: result.stdout || '',
    stderr: result.stderr || ''
  };
}

function readTsStrictness(projectRoot) {
  const tsconfigPath = path.join(projectRoot, 'tsconfig.app.json');
  const raw = fs.readFileSync(tsconfigPath, 'utf8');
  const parsed = JSON.parse(raw);
  const compilerOptions = parsed.compilerOptions || {};
  return {
    strict: Boolean(compilerOptions.strict),
    noImplicitAny: Boolean(compilerOptions.noImplicitAny),
    strictNullChecks: Boolean(compilerOptions.strictNullChecks)
  };
}

function assertStrictEnabled(strictness) {
  const missing = [];
  if (!strictness.strict) {
    missing.push('strict=true');
  }
  if (!strictness.noImplicitAny) {
    missing.push('noImplicitAny=true');
  }
  if (!strictness.strictNullChecks) {
    missing.push('strictNullChecks=true');
  }

  if (missing.length > 0) {
    throw new Error(`Strict-mode gate misconfigured in tsconfig.app.json: missing ${missing.join(', ')}`);
  }
}

function ensureIsoDate(value, fieldName) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${fieldName} "${value}". Expected YYYY-MM-DD.`);
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ${fieldName} "${value}". Expected a real calendar date.`);
  }
}

function getTodayIsoDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function validateAllowlistWriteOptions(options, today = getTodayIsoDate()) {
  ensureIsoDate(options.defaultExpiresOn, 'defaultExpiresOn');
  if (!String(options.defaultOwner || '').trim()) {
    throw new Error('Type debt allowlist writes require --default-owner.');
  }

  if (!options.allowExpiredWrite && options.defaultExpiresOn < today) {
    throw new Error(
      `Refusing to write an expired allowlist. ` +
        `--default-expires-on ${options.defaultExpiresOn} is before today (${today}). ` +
        `Pass a future date or use --allow-expired-write for historical reproduction.`
    );
  }
}

function writeAllowlist(
  outputPath,
  entries,
  defaultExpiresOn = DEFAULT_EXPIRY_DATE,
  defaultOwner = DEFAULT_OWNER
) {
  const normalizedDefaultOwner = String(defaultOwner || '').trim();
  if (!normalizedDefaultOwner) {
    throw new Error('Type debt allowlist writes require defaultOwner.');
  }

  const absolutePath = path.isAbsolute(outputPath)
    ? outputPath
    : path.resolve(process.cwd(), outputPath);

  const payload = {
    version: 1,
    generatedAt: new Date().toISOString(),
    defaultExpiresOn,
    defaultOwner: normalizedDefaultOwner,
    entries: entries.map((entry) => ({
      ...entry,
      owner: entry.owner || normalizedDefaultOwner,
      expiresOn: defaultExpiresOn
    }))
  };

  fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
  fs.writeFileSync(absolutePath, `${JSON.stringify(payload, null, 2)}\n`);

  return absolutePath;
}

function loadAllowlist(allowlistPath) {
  const absolutePath = path.isAbsolute(allowlistPath)
    ? allowlistPath
    : path.resolve(process.cwd(), allowlistPath);

  if (!fs.existsSync(absolutePath)) {
    throw new Error(`Allowlist file not found: ${absolutePath}`);
  }

  const parsed = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const defaultExpiresOn = parsed.defaultExpiresOn || DEFAULT_EXPIRY_DATE;
  const defaultOwner = String(parsed.defaultOwner || '').trim();

  ensureIsoDate(defaultExpiresOn, 'defaultExpiresOn');
  if (!defaultOwner) {
    throw new Error('Allowlist file is missing "defaultOwner".');
  }

  const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
  const normalized = entries.map((entry) => {
    if (!entry || typeof entry !== 'object') {
      throw new Error('Allowlist entry must be an object.');
    }

    const file = String(entry.file || '').trim();
    const code = String(entry.code || '').trim();
    const maxCount = Number(entry.maxCount);
    const expiresOn = String(entry.expiresOn || defaultExpiresOn);
    const owner = String(entry.owner || defaultOwner).trim();

    if (!file) {
      throw new Error('Allowlist entry is missing "file".');
    }

    if (!/^TS\d+$/.test(code)) {
      throw new Error(`Invalid allowlist diagnostic code "${code}" for ${file}.`);
    }

    if (!Number.isInteger(maxCount) || maxCount < 0) {
      throw new Error(`Invalid maxCount for ${file} ${code}. Expected non-negative integer.`);
    }

    if (!owner) {
      throw new Error(`Allowlist entry ${file} ${code} is missing "owner".`);
    }

    ensureIsoDate(expiresOn, `expiresOn for ${file} ${code}`);

    return {
      file: normalizeRelativePath(file),
      code,
      maxCount,
      owner,
      expiresOn
    };
  });

  return {
    path: absolutePath,
    entries: normalized
  };
}

function compareDiagnosticsToAllowlist(diagnosticsByKey, allowlistEntries) {
  const today = new Date().toISOString().slice(0, 10);
  const allowlistMap = new Map();
  const expired = [];

  for (const entry of allowlistEntries) {
    const key = `${entry.file}::${entry.code}`;
    allowlistMap.set(key, entry);
    if (entry.expiresOn < today) {
      expired.push(entry);
    }
  }

  const unexpected = [];
  const overflow = [];

  for (const [key, count] of diagnosticsByKey.entries()) {
    const entry = allowlistMap.get(key);
    const [file, code] = key.split('::');
    if (!entry) {
      unexpected.push({ file, code, count });
      continue;
    }

    if (count > entry.maxCount) {
      overflow.push({ file, code, count, maxCount: entry.maxCount });
    }
  }

  const stale = [];
  for (const entry of allowlistEntries) {
    const key = `${entry.file}::${entry.code}`;
    const actualCount = diagnosticsByKey.get(key) || 0;
    if (actualCount < entry.maxCount) {
      stale.push({
        file: entry.file,
        code: entry.code,
        maxCount: entry.maxCount,
        actualCount
      });
    }
  }

  return {
    unexpected,
    overflow,
    stale,
    expired
  };
}

function sortFindings(entries) {
  return [...entries].sort((a, b) => {
    if (a.file !== b.file) {
      return a.file.localeCompare(b.file);
    }
    return a.code.localeCompare(b.code);
  });
}

function printFindingSummary(title, entries, formatter) {
  if (entries.length === 0) {
    return;
  }

  console.error(`${title} (${entries.length}):`);
  for (const entry of entries.slice(0, 20)) {
    console.error(`  - ${formatter(entry)}`);
  }
  if (entries.length > 20) {
    console.error(`  ... ${entries.length - 20} more`);
  }
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const strictness = readTsStrictness(process.cwd());
  assertStrictEnabled(strictness);

  const result = runTypeScript();
  const diagnostics = parseDiagnostics(`${result.stdout}\n${result.stderr}`, process.cwd());
  const aggregated = aggregateDiagnostics(diagnostics);
  const diagnosticsByKey = new Map(
    aggregated.map((entry) => [`${entry.file}::${entry.code}`, entry.maxCount])
  );

  if (options.writeAllowlist) {
    validateAllowlistWriteOptions(options);
    const outputPath = writeAllowlist(
      options.outputPath,
      aggregated,
      options.defaultExpiresOn,
      options.defaultOwner
    );
    console.log(`Wrote type debt allowlist: ${outputPath}`);
    console.log(`- tracked diagnostic buckets: ${aggregated.length}`);
    console.log(`- total strict diagnostics: ${diagnostics.length}`);
    process.exit(0);
  }

  const allowlist = loadAllowlist(options.allowlistPath);
  const findings = compareDiagnosticsToAllowlist(diagnosticsByKey, allowlist.entries);

  const unexpected = sortFindings(findings.unexpected);
  const overflow = sortFindings(findings.overflow);
  const expired = sortFindings(findings.expired);
  const stale = sortFindings(findings.stale);

  console.log('Strict Typecheck Gate');
  console.log(`- allowlist: ${normalizeRelativePath(path.relative(process.cwd(), allowlist.path))}`);
  console.log(`- strict diagnostics: ${diagnostics.length}`);
  console.log(`- tracked buckets: ${aggregated.length}`);
  console.log(`- stale buckets: ${stale.length}`);

  if (stale.length > 0) {
    console.log('  stale debt buckets (can be reduced):');
    for (const entry of stale.slice(0, 10)) {
      console.log(`  - ${entry.file} ${entry.code}: max ${entry.maxCount}, actual ${entry.actualCount}`);
    }
    if (stale.length > 10) {
      console.log(`  ... ${stale.length - 10} more`);
    }
  }

  const hasFailures = unexpected.length > 0 || overflow.length > 0 || expired.length > 0 || stale.length > 0;

  printFindingSummary(
    'Unexpected strict diagnostics (not allowlisted)',
    unexpected,
    (entry) => `${entry.file} ${entry.code}: ${entry.count}`
  );
  printFindingSummary(
    'Strict diagnostics exceeding allowlist maxCount',
    overflow,
    (entry) => `${entry.file} ${entry.code}: ${entry.count} > ${entry.maxCount}`
  );
  printFindingSummary(
    'Expired allowlist entries',
    expired,
    (entry) => `${entry.file} ${entry.code}: expiresOn=${entry.expiresOn}`
  );
  printFindingSummary(
    'Stale strict diagnostics allowlist entries',
    stale,
    (entry) => `${entry.file} ${entry.code}: max ${entry.maxCount}, actual ${entry.actualCount}`
  );

  if (hasFailures) {
    process.exit(1);
  }

  process.exit(0);
}

const invokedScript = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedScript) {
  main();
}

export {
  aggregateDiagnostics,
  compareDiagnosticsToAllowlist,
  ensureIsoDate,
  getTodayIsoDate,
  loadAllowlist,
  parseArgs,
  parseDiagnostics,
  validateAllowlistWriteOptions,
  writeAllowlist
};
