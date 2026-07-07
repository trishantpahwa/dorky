import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import { EOL } from 'os';

// Replicate the pure helper functions from bin/index.js for isolated testing.
// These are the same implementations but imported here so unit tests can
// exercise them without the CLI harness or cloud SDKs.

const toPosix = (p) => p ? p.replace(/\\/g, '/') : p;

const normalizeKeys = (obj) => {
  if (!obj) return {};
  const out = {};
  for (const k of Object.keys(obj)) out[toPosix(k)] = obj[k];
  return out;
};

// ---------------------------------------------------------------------------
// toPosix
// ---------------------------------------------------------------------------
describe('toPosix', () => {
  it('converts Windows backslashes to forward slashes', () => {
    expect(toPosix('src\\lib\\utils')).toBe('src/lib/utils');
  });

  it('leaves forward-slash paths unchanged', () => {
    expect(toPosix('src/lib/utils')).toBe('src/lib/utils');
  });

  it('handles mixed separators', () => {
    expect(toPosix('src\\lib/utils')).toBe('src/lib/utils');
  });

  it('returns empty string for empty input', () => {
    expect(toPosix('')).toBe('');
  });

  it('returns undefined / null as-is', () => {
    expect(toPosix(null)).toBe(null);
    expect(toPosix(undefined)).toBe(undefined);
  });
});

// ---------------------------------------------------------------------------
// normalizeKeys
// ---------------------------------------------------------------------------
describe('normalizeKeys', () => {
  it('converts keys to POSIX paths', () => {
    expect(normalizeKeys({ 'src\\lib\\utils': 1 })).toEqual({ 'src/lib/utils': 1 });
  });

  it('leaves POSIX keys unchanged', () => {
    expect(normalizeKeys({ 'src/lib/utils': 1 })).toEqual({ 'src/lib/utils': 1 });
  });

  it('handles empty objects', () => {
    expect(normalizeKeys({})).toEqual({});
  });

  it('handles null / undefined', () => {
    expect(normalizeKeys(null)).toEqual({});
    expect(normalizeKeys(undefined)).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// readJson / writeJson (integration-style, but fast)
// ---------------------------------------------------------------------------
describe('readJson / writeJson helpers', () => {
  const tmpDir = path.join(__dirname, '..', '..', '.dorky-test-tmp');

  const readJson = (p) => existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : {};
  const writeJson = (p, d) => writeFileSync(p, JSON.stringify(d, null, 2));

  beforeAll(() => {
    if (!existsSync(tmpDir)) mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    if (existsSync(tmpDir)) rmSync(tmpDir, { recursive: true, force: true });
  });

  it('writeJson creates a file and readJson reads it back', () => {
    const file = path.join(tmpDir, 'test.json');
    writeJson(file, { hello: 'world' });
    const data = readJson(file);
    expect(data).toEqual({ hello: 'world' });
  });

  it('readJson returns {} for a missing file', () => {
    const data = readJson(path.join(tmpDir, 'nope.json'));
    expect(data).toEqual({});
  });

  it('writeJson overwrites existing data', () => {
    const file = path.join(tmpDir, 'overwrite.json');
    writeJson(file, { a: 1 });
    writeJson(file, { b: 2 });
    expect(readJson(file)).toEqual({ b: 2 });
  });
});
