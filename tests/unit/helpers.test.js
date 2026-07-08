import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = join(__dirname, '..', '..');

describe('Dorky Unit Tests', () => {
  it('should have valid project structure', () => {
    expect(existsSync(join(rootDir, 'package.json'))).toBe(true);
    expect(existsSync(join(rootDir, 'bin', 'index.js'))).toBe(true);
    expect(existsSync(join(rootDir, 'bin', 'mcp.js'))).toBe(true);
    expect(existsSync(join(rootDir, 'vitest.config.js'))).toBe(true);
  });

  it('should have valid package.json', () => {
    const pkg = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
    expect(pkg.name).toBe('dorky');
    expect(pkg.scripts['test:unit']).toBe('vitest run tests/unit');
    expect(pkg.scripts['test']).toBe('vitest run');
  });

  it('core deps should resolve', () => {
    for (const dep of ['vitest', 'chalk', 'yargs', 'boxen', 'glob'])
      expect(() => require.resolve(dep)).not.toThrow();
  });

  it('bin/index.js should be valid CLI', () => {
    const content = readFileSync(join(rootDir, 'bin', 'index.js'), 'utf8');
    expect(content).toContain('#!/usr/bin/env node');
    expect(content).toContain('function main()');
    expect(content).toContain('function push');
    expect(content).toContain('function pull');
  });
});
