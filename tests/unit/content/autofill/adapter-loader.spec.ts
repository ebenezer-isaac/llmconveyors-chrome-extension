// SPDX-License-Identifier: MIT
/**
 * Unit tests for adapter-loader.ts. Exercises resolveAtsKind (pure
 * function) + loadAdapter (dynamic import with fake deps).
 */

import { describe, it, expect, vi } from 'vitest';
import type { Mock } from 'vitest';
import {
  resolveAtsKind,
  loadAdapter,
  type AdapterLoaderDeps,
} from '@/src/content/autofill/adapter-loader';
import type {
  AtsAdapter,
  AtsKind,
  FormModel,
  FillInstruction,
  FillResult,
} from 'ats-autofill-engine';
import type { Logger } from '@/src/background/log';

function makeFakeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeFakeAdapter(kind: AtsKind): AtsAdapter {
  return Object.freeze({
    kind,
    matchesUrl: (): boolean => true,
    scanForm: (): FormModel => ({
      url: 'https://example.com',
      title: 'Fake',
      scannedAt: '2026-04-16T00:00:00.000Z',
      fields: [],
    }),
    fillField: (instruction: FillInstruction): FillResult => ({
      ok: true,
      selector: instruction.selector,
    }),
  });
}

describe('resolveAtsKind - happy path', () => {
  it('matches canonical greenhouse boards subdomain', () => {
    expect(
      resolveAtsKind('https://boards.greenhouse.io/example/jobs/1234'),
    ).toBe('greenhouse');
  });

  it('matches greenhouse vanity subdomain', () => {
    expect(resolveAtsKind('https://example.greenhouse.io/jobs/1234')).toBe(
      'greenhouse',
    );
  });

  it('matches bare greenhouse.io', () => {
    expect(resolveAtsKind('https://greenhouse.io/jobs/1234')).toBe(
      'greenhouse',
    );
  });

  it('matches jobs.lever.co', () => {
    expect(resolveAtsKind('https://jobs.lever.co/example/abc-def')).toBe(
      'lever',
    );
  });

  it('matches workday vanity subdomain', () => {
    expect(
      resolveAtsKind(
        'https://example.wd5.myworkdayjobs.com/en-US/External/job/1234',
      ),
    ).toBe('workday');
  });

  it('is case-insensitive (uppercase host)', () => {
    expect(
      resolveAtsKind('https://BOARDS.GREENHOUSE.IO/example/jobs/1'),
    ).toBe('greenhouse');
  });
});

describe('resolveAtsKind - security (suffix not substring)', () => {
  it('rejects notgreenhouse.io.evil.com (host impersonation)', () => {
    expect(resolveAtsKind('https://notgreenhouse.io.evil.com/phish')).toBeNull();
  });

  it('rejects greenhouse.io.evil.com', () => {
    expect(resolveAtsKind('https://greenhouse.io.evil.com/phish')).toBeNull();
  });

  it('rejects evil-greenhouse.io (hyphen prefix)', () => {
    expect(resolveAtsKind('https://evil-greenhouse.io/phish')).toBeNull();
  });

  it('rejects lever.co (not jobs.lever.co)', () => {
    expect(resolveAtsKind('https://lever.co/phish')).toBeNull();
  });

  it('rejects fakemyworkdayjobs.com', () => {
    expect(resolveAtsKind('https://fakemyworkdayjobs.com/phish')).toBeNull();
  });
});

describe('resolveAtsKind - non-matching URLs', () => {
  it('returns null for LinkedIn', () => {
    expect(resolveAtsKind('https://www.linkedin.com/jobs/view/12345')).toBeNull();
  });

  it('returns null for malformed URLs', () => {
    expect(resolveAtsKind('not-a-url')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(resolveAtsKind('')).toBeNull();
  });
});

describe('loadAdapter - happy path', () => {
  it('loads greenhouse adapter via dynamic import', async () => {
    const fakeAdapter = makeFakeAdapter('greenhouse');
    const dynamicImport: Mock = vi.fn(async () => ({ adapter: fakeAdapter }));
    const deps: AdapterLoaderDeps = {
      logger: makeFakeLogger(),
      dynamicImport,
    };
    const result = await loadAdapter(
      'https://boards.greenhouse.io/example/jobs/1',
      deps,
    );
    expect(result).toBe(fakeAdapter);
    expect(dynamicImport).toHaveBeenCalledWith('ats-autofill-engine/greenhouse');
  });

  it('loads lever adapter', async () => {
    const fakeAdapter = makeFakeAdapter('lever');
    const dynamicImport: Mock = vi.fn(async () => ({ adapter: fakeAdapter }));
    const deps: AdapterLoaderDeps = {
      logger: makeFakeLogger(),
      dynamicImport,
    };
    const result = await loadAdapter(
      'https://jobs.lever.co/example/abc',
      deps,
    );
    expect(result?.kind).toBe('lever');
  });

  it('loads workday adapter', async () => {
    const fakeAdapter = makeFakeAdapter('workday');
    const dynamicImport: Mock = vi.fn(async () => ({ adapter: fakeAdapter }));
    const deps: AdapterLoaderDeps = {
      logger: makeFakeLogger(),
      dynamicImport,
    };
    const result = await loadAdapter(
      'https://example.wd5.myworkdayjobs.com/en-US/External/job/1',
      deps,
    );
    expect(result?.kind).toBe('workday');
  });
});

describe('loadAdapter - failure paths', () => {
  it('returns null for non-ATS URL without calling dynamicImport', async () => {
    const dynamicImport: Mock = vi.fn();
    const deps: AdapterLoaderDeps = {
      logger: makeFakeLogger(),
      dynamicImport,
    };
    const result = await loadAdapter('https://example.com/', deps);
    expect(result).toBeNull();
    expect(dynamicImport).not.toHaveBeenCalled();
  });

  it('returns null if dynamicImport rejects', async () => {
    const dynamicImport: Mock = vi.fn(async () => {
      throw new Error('network-error');
    });
    const logger = makeFakeLogger();
    const deps: AdapterLoaderDeps = { logger, dynamicImport };
    const result = await loadAdapter(
      'https://boards.greenhouse.io/e/jobs/1',
      deps,
    );
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns null if module has no `adapter` export', async () => {
    const dynamicImport: Mock = vi.fn(async () => ({ Other: {} }));
    const logger = makeFakeLogger();
    const deps: AdapterLoaderDeps = { logger, dynamicImport };
    const result = await loadAdapter(
      'https://boards.greenhouse.io/e/jobs/1',
      deps,
    );
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });

  it('returns null if adapter.kind does not match URL kind', async () => {
    const wrongKind = makeFakeAdapter('lever');
    const dynamicImport: Mock = vi.fn(async () => ({ adapter: wrongKind }));
    const logger = makeFakeLogger();
    const deps: AdapterLoaderDeps = { logger, dynamicImport };
    const result = await loadAdapter(
      'https://boards.greenhouse.io/e/jobs/1',
      deps,
    );
    expect(result).toBeNull();
    expect(logger.error).toHaveBeenCalled();
  });
});

describe('vendor sub-entry contract (D14 exports-map resolution)', () => {
  it('ats-autofill-engine/greenhouse exports adapter with kind=greenhouse', async () => {
    const m = await import('ats-autofill-engine/greenhouse');
    expect(m.adapter).toBeDefined();
    expect(m.adapter.kind).toBe('greenhouse');
  });

  it('ats-autofill-engine/lever exports adapter with kind=lever', async () => {
    const m = await import('ats-autofill-engine/lever');
    expect(m.adapter).toBeDefined();
    expect(m.adapter.kind).toBe('lever');
  });

  it('ats-autofill-engine/workday exports adapter with kind=workday', async () => {
    const m = await import('ats-autofill-engine/workday');
    expect(m.adapter).toBeDefined();
    expect(m.adapter.kind).toBe('workday');
  });
});
