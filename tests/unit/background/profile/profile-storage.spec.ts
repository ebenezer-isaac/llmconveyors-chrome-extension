// SPDX-License-Identifier: MIT
import { describe, it, expect, vi } from 'vitest';
import {
  createProfileStorage,
  createEmptyProfile,
  PROFILE_STORAGE_KEY,
  type ChromeStorageLocal,
  type ProfileStorage,
} from '../../../../src/background/profile/profile-storage';
import type { Profile } from '../../../../src/background/messaging/schemas/profile.schema';

function makeFakeStorage(initial: Record<string, unknown> = {}): {
  storage: ChromeStorageLocal;
  backing: Record<string, unknown>;
} {
  const backing: Record<string, unknown> = { ...initial };
  const storage: ChromeStorageLocal = {
    get: vi.fn(async (key: string) => {
      if (key in backing) return { [key]: backing[key] };
      return {};
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      Object.assign(backing, items);
    }),
    remove: vi.fn(async (key: string) => {
      delete backing[key];
    }),
  };
  return { storage, backing };
}

function makeLogger(): {
  info: ReturnType<typeof vi.fn>;
  warn: ReturnType<typeof vi.fn>;
  error: ReturnType<typeof vi.fn>;
  debug: ReturnType<typeof vi.fn>;
} {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };
}

function sampleProfile(nowMs = 1_713_000_000_000): Profile {
  return {
    profileVersion: '1.0',
    updatedAtMs: nowMs,
    basics: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+1-415-555-0101',
      location: { city: 'SF', region: 'CA', countryCode: 'US', postalCode: '94103' },
      website: 'https://janedoe.example.com',
      linkedin: 'https://linkedin.com/in/janedoe',
      github: 'https://github.com/janedoe',
    },
    work: [],
    education: [],
    skills: [],
  };
}

function makeAdapter(opts?: {
  readonly initial?: Record<string, unknown>;
  readonly now?: number;
}): { adapter: ProfileStorage; storage: ChromeStorageLocal; backing: Record<string, unknown> } {
  const { storage, backing } = makeFakeStorage(opts?.initial ?? {});
  const adapter = createProfileStorage({
    storage,
    logger: makeLogger(),
    now: () => opts?.now ?? 1_700_000_000_000,
  });
  return { adapter, storage, backing };
}

describe('profile-storage read', () => {
  it('returns null for empty storage', async () => {
    const { adapter } = makeAdapter();
    expect(await adapter.read()).toBeNull();
  });

  it('returns a valid stored profile unchanged', async () => {
    const p = sampleProfile();
    const { adapter } = makeAdapter({ initial: { [PROFILE_STORAGE_KEY]: p } });
    const read = await adapter.read();
    expect(read).toEqual(p);
  });

  it('returns null for corrupt JSON (wrong shape)', async () => {
    const { adapter } = makeAdapter({
      initial: { [PROFILE_STORAGE_KEY]: { foo: 'bar' } },
    });
    expect(await adapter.read()).toBeNull();
  });

  it('returns null when profileVersion is unsupported', async () => {
    const p = { ...sampleProfile(), profileVersion: '9.9' };
    const { adapter } = makeAdapter({ initial: { [PROFILE_STORAGE_KEY]: p } });
    expect(await adapter.read()).toBeNull();
  });

  it('returns null when stored value is an array', async () => {
    const { adapter } = makeAdapter({ initial: { [PROFILE_STORAGE_KEY]: [1, 2, 3] } });
    expect(await adapter.read()).toBeNull();
  });

  it('returns null when storage.get throws', async () => {
    const { storage } = makeFakeStorage();
    storage.get = vi.fn(async () => {
      throw new Error('storage offline');
    });
    const adapter = createProfileStorage({
      storage,
      logger: makeLogger(),
      now: () => 1,
    });
    expect(await adapter.read()).toBeNull();
  });
});

describe('profile-storage write', () => {
  it('stamps updatedAtMs with now() on every write', async () => {
    const { adapter, backing } = makeAdapter({ now: 1_999_000_000_000 });
    await adapter.write(sampleProfile(1));
    const stored = backing[PROFILE_STORAGE_KEY] as Profile;
    expect(stored.updatedAtMs).toBe(1_999_000_000_000);
  });

  it('rejects a profile with an off-schema email', async () => {
    const { adapter } = makeAdapter();
    const bad = { ...sampleProfile(), basics: { ...sampleProfile().basics, email: 'not-an-email' } };
    await expect(adapter.write(bad)).rejects.toThrow(/schema/);
  });

  it('rejects a profile with a forbidden key injected', async () => {
    const { adapter } = makeAdapter();
    const clean = sampleProfile();
    const poisoned = JSON.parse(
      '{"__proto__": {"evil": true},' +
        JSON.stringify(clean).slice(1),
    );
    await expect(adapter.write(poisoned as Profile)).rejects.toThrow(/__proto__/);
  });

  it('rejects an unsupported-version profile on write', async () => {
    const { adapter } = makeAdapter();
    const bad = { ...sampleProfile(), profileVersion: '9.9' } as unknown as Profile;
    await expect(adapter.write(bad)).rejects.toThrow();
  });

  it('returns the stamped profile on success', async () => {
    const { adapter } = makeAdapter({ now: 2_000_000 });
    const result = await adapter.write(sampleProfile(1));
    expect(result.updatedAtMs).toBe(2_000_000);
    expect(result.basics.email).toBe('jane.doe@example.com');
  });

  it('round-trips a valid profile through write + read', async () => {
    const { adapter } = makeAdapter({ now: 12_345 });
    await adapter.write(sampleProfile());
    const read = await adapter.read();
    expect(read?.updatedAtMs).toBe(12_345);
  });

  it('serialises two concurrent writes deterministically', async () => {
    const { adapter, backing } = makeAdapter({ now: 7 });
    await Promise.all([
      adapter.write(sampleProfile(100)),
      adapter.write({ ...sampleProfile(200), basics: { ...sampleProfile().basics, firstName: 'Concurrent' } }),
    ]);
    const stored = backing[PROFILE_STORAGE_KEY] as Profile;
    expect(['Jane', 'Concurrent']).toContain(stored.basics.firstName);
  });

  it('surfaces storage.set errors to the caller', async () => {
    const { storage } = makeFakeStorage();
    storage.set = vi.fn(async () => {
      throw new Error('quota exceeded');
    });
    const adapter = createProfileStorage({
      storage,
      logger: makeLogger(),
      now: () => 1,
    });
    await expect(adapter.write(sampleProfile())).rejects.toThrow(/quota/);
  });
});

describe('profile-storage update', () => {
  it('creates an empty profile when nothing is stored', async () => {
    const { adapter, backing } = makeAdapter({ now: 500 });
    await adapter.update({ basics: { firstName: 'New' } });
    const stored = backing[PROFILE_STORAGE_KEY] as Profile;
    expect(stored.basics.firstName).toBe('New');
    expect(stored.profileVersion).toBe('1.0');
  });

  it('deep-merges a nested location patch', async () => {
    const { adapter, backing } = makeAdapter({
      initial: { [PROFILE_STORAGE_KEY]: sampleProfile() },
    });
    await adapter.update({ basics: { location: { city: 'NYC' } } });
    const stored = backing[PROFILE_STORAGE_KEY] as Profile;
    expect(stored.basics.location.city).toBe('NYC');
    expect(stored.basics.location.region).toBe('CA');
  });

  it('rejects an update patch with __proto__ at any depth', async () => {
    const { adapter } = makeAdapter();
    const poisoned = JSON.parse('{"basics": {"__proto__": {"evil": true}}}');
    await expect(adapter.update(poisoned as never)).rejects.toThrow(/__proto__/);
  });

  it('rejects an update patch with constructor injection', async () => {
    const { adapter } = makeAdapter();
    const poisoned = JSON.parse('{"constructor": {"prototype": {"evil": true}}}');
    await expect(adapter.update(poisoned as never)).rejects.toThrow(/constructor/);
  });

  it('rejects an update that would produce an off-schema profile', async () => {
    const { adapter } = makeAdapter({
      initial: { [PROFILE_STORAGE_KEY]: sampleProfile() },
    });
    await expect(
      adapter.update({ basics: { email: 'bad-email' } }),
    ).rejects.toThrow(/schema/);
  });

  it('stamps updatedAtMs on every update', async () => {
    const { adapter, backing } = makeAdapter({ now: 42, initial: { [PROFILE_STORAGE_KEY]: sampleProfile() } });
    await adapter.update({ basics: { phone: '+1-000-000-0000' } });
    const stored = backing[PROFILE_STORAGE_KEY] as Profile;
    expect(stored.updatedAtMs).toBe(42);
    expect(stored.basics.phone).toBe('+1-000-000-0000');
  });
});

describe('profile-storage clear', () => {
  it('removes the record and returns undefined', async () => {
    const { adapter, backing } = makeAdapter({
      initial: { [PROFILE_STORAGE_KEY]: sampleProfile() },
    });
    await adapter.clear();
    expect(PROFILE_STORAGE_KEY in backing).toBe(false);
  });

  it('surfaces storage.remove errors', async () => {
    const { storage } = makeFakeStorage();
    storage.remove = vi.fn(async () => {
      throw new Error('denied');
    });
    const adapter = createProfileStorage({
      storage,
      logger: makeLogger(),
      now: () => 1,
    });
    await expect(adapter.clear()).rejects.toThrow(/denied/);
  });
});

describe('createEmptyProfile', () => {
  it('produces a schema-valid empty profile', async () => {
    const empty = createEmptyProfile(1_234);
    const { adapter, backing } = makeAdapter();
    await adapter.write(empty);
    expect(backing[PROFILE_STORAGE_KEY]).toBeDefined();
  });

  it('uses the nowMs argument as updatedAtMs', () => {
    expect(createEmptyProfile(99).updatedAtMs).toBe(99);
  });
});
