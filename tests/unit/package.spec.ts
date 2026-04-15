// tests/unit/package.spec.ts
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..');
const PKG = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf-8')) as {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly dependencies?: Readonly<Record<string, string>>;
  readonly devDependencies?: Readonly<Record<string, string>>;
};

describe('A1 scaffold invariants', () => {
  test('package.json name is exactly llmconveyors-chrome-extension', () => {
    expect(PKG.name).toBe('llmconveyors-chrome-extension');
  });

  test('package.json version is 0.1.0', () => {
    expect(PKG.version).toBe('0.1.0');
  });

  test('package.json license is MIT', () => {
    expect(PKG.license).toBe('MIT');
  });

  test('description does not mention Zovo (D4 silent default)', () => {
    expect(PKG.description.toLowerCase()).not.toContain('zovo');
  });

  test('ats-autofill-engine is NOT a dependency in A1 (A5 adds it)', () => {
    const deps = { ...(PKG.dependencies ?? {}), ...(PKG.devDependencies ?? {}) };
    expect(deps).not.toHaveProperty('ats-autofill-engine');
  });

  test('llmconveyors SDK is NOT a dependency in A1 (A5 adds it)', () => {
    const deps = { ...(PKG.dependencies ?? {}), ...(PKG.devDependencies ?? {}) };
    expect(deps).not.toHaveProperty('llmconveyors');
  });

  test('LICENSE file contains Ebenezer Isaac and 2026', () => {
    const licenseText = readFileSync(resolve(ROOT, 'LICENSE'), 'utf-8');
    expect(licenseText).toContain('Ebenezer Isaac');
    expect(licenseText).toContain('2026');
    expect(licenseText.toLowerCase()).not.toContain('zovo');
  });

  test('wxt.config.ts manifest name is LLM Conveyors Job Assistant', () => {
    const cfg = readFileSync(resolve(ROOT, 'wxt.config.ts'), 'utf-8');
    expect(cfg).toContain("name: 'LLM Conveyors Job Assistant'");
  });

  test('src/background/log.ts exports createLogger and Logger type', () => {
    const src = readFileSync(resolve(ROOT, 'src/background/log.ts'), 'utf-8');
    expect(src).toMatch(/export\s+function\s+createLogger/);
    expect(src).toMatch(/export\s+interface\s+Logger/);
  });
});
