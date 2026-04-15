// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ImportExportSection } from '@/entrypoints/options/ImportExportSection';
import type { Profile } from '@/src/background/messaging/schemas/profile.schema';

function makeProfile(): Profile {
  return {
    profileVersion: '1.0',
    updatedAtMs: 1,
    basics: {
      firstName: 'A',
      lastName: 'B',
      email: 'a@b.com',
      phone: '',
      location: { city: '', region: '', countryCode: '', postalCode: '' },
      website: '',
      linkedin: '',
      github: '',
    },
    work: [],
    education: [],
    skills: [],
  };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

function query(testid: string): HTMLElement | null {
  return container?.querySelector(`[data-testid="${testid}"]`) ?? null;
}

async function mountSection(props: {
  profile: Profile | null;
  onUpload: (raw: unknown) => Promise<void>;
}): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<ImportExportSection profile={props.profile} onUpload={props.onUpload} />);
  });
}

function makeFile(contents: string, name = 'resume.json', type = 'application/json'): File {
  return new File([contents], name, { type });
}

async function fireFileChange(input: HTMLInputElement, file: File | null): Promise<void> {
  await act(async () => {
    Object.defineProperty(input, 'files', {
      value: file === null ? [] : [file],
      configurable: true,
    });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('ImportExportSection -- upload', () => {
  it('parses a valid JSON Resume and invokes onUpload', async () => {
    const onUpload = vi.fn(async () => undefined);
    await mountSection({ profile: null, onUpload });
    const input = query('import-file-input') as HTMLInputElement;
    const file = makeFile(JSON.stringify({ basics: { name: 'A B', email: 'a@b.com' } }));
    await fireFileChange(input, file);
    expect(onUpload).toHaveBeenCalledWith(expect.objectContaining({ basics: expect.any(Object) }));
  });

  it('rejects a file larger than 10 MB', async () => {
    const onUpload = vi.fn(async () => undefined);
    await mountSection({ profile: null, onUpload });
    const big = new File([new Uint8Array(11 * 1024 * 1024)], 'big.json', { type: 'application/json' });
    const input = query('import-file-input') as HTMLInputElement;
    await fireFileChange(input, big);
    expect(onUpload).not.toHaveBeenCalled();
    const err = query('import-error');
    expect(err?.textContent).toContain('too large');
  });

  it('rejects a non-JSON file', async () => {
    const onUpload = vi.fn(async () => undefined);
    await mountSection({ profile: null, onUpload });
    const input = query('import-file-input') as HTMLInputElement;
    const bad = new File(['hello'], 'resume.txt', { type: 'text/plain' });
    await fireFileChange(input, bad);
    expect(onUpload).not.toHaveBeenCalled();
    const err = query('import-error');
    expect(err?.textContent).toContain('JSON');
  });

  it('rejects malformed JSON', async () => {
    const onUpload = vi.fn(async () => undefined);
    await mountSection({ profile: null, onUpload });
    const input = query('import-file-input') as HTMLInputElement;
    await fireFileChange(input, makeFile('{not valid}'));
    expect(onUpload).not.toHaveBeenCalled();
    const err = query('import-error');
    expect(err?.textContent).toContain('JSON');
  });

  it('is a no-op when user cancels the file picker', async () => {
    const onUpload = vi.fn(async () => undefined);
    await mountSection({ profile: null, onUpload });
    const input = query('import-file-input') as HTMLInputElement;
    await fireFileChange(input, null);
    expect(onUpload).not.toHaveBeenCalled();
  });
});

describe('ImportExportSection -- export', () => {
  it('disables the export button when profile is null', async () => {
    await mountSection({ profile: null, onUpload: async () => undefined });
    const btn = query('export-button') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it('creates a download link when export is clicked with a profile', async () => {
    const profile = makeProfile();
    // Stub URL.createObjectURL / revokeObjectURL (not on happy-dom by default)
    const createSpy = vi.fn((_blob: Blob): string => 'blob:test');
    const revokeSpy = vi.fn((_url: string): void => undefined);
    (globalThis as unknown as { URL: { createObjectURL: typeof createSpy; revokeObjectURL: typeof revokeSpy } }).URL.createObjectURL = createSpy;
    (globalThis as unknown as { URL: { createObjectURL: typeof createSpy; revokeObjectURL: typeof revokeSpy } }).URL.revokeObjectURL = revokeSpy;

    await mountSection({ profile, onUpload: async () => undefined });
    const btn = query('export-button') as HTMLButtonElement;
    await act(async () => {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(createSpy).toHaveBeenCalled();
    expect(revokeSpy).toHaveBeenCalled();
  });
});
