// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  useAutofillHistory,
  recordAutofillResult,
  type AutofillHistoryEntry,
} from '@/entrypoints/sidepanel/useAutofillHistory';

type ChangeListener = (
  changes: Record<string, { newValue?: unknown; oldValue?: unknown }>,
  areaName: string,
) => void;

interface FakeStorage {
  session: {
    data: Record<string, unknown>;
    get: (key: string) => Promise<Record<string, unknown>>;
    set: (items: Record<string, unknown>) => Promise<void>;
  };
  onChanged: {
    addListener: (fn: ChangeListener) => void;
    removeListener: (fn: ChangeListener) => void;
  };
}

function install(): { storage: FakeStorage; listeners: ChangeListener[] } {
  const data: Record<string, unknown> = {};
  const listeners: ChangeListener[] = [];
  const storage: FakeStorage = {
    session: {
      data,
      get: async (key) => (key in data ? { [key]: data[key] } : {}),
      set: async (items) => {
        for (const [k, v] of Object.entries(items)) data[k] = v;
      },
    },
    onChanged: {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => {
        const i = listeners.indexOf(fn);
        if (i !== -1) listeners.splice(i, 1);
      },
    },
  };
  (globalThis as unknown as { chrome: { storage: FakeStorage } }).chrome = { storage };
  return { storage, listeners };
}

let container: HTMLDivElement | null = null;
let root: Root | null = null;
let capture: { current: ReturnType<typeof useAutofillHistory> | null } = {
  current: null,
};

function Probe({ tabId }: { tabId: number | null }): React.ReactElement {
  capture.current = useAutofillHistory(tabId);
  return <div />;
}

beforeEach(() => {
  delete (globalThis as unknown as { chrome?: unknown }).chrome;
  container = document.createElement('div');
  document.body.appendChild(container);
  capture = { current: null };
});

afterEach(() => {
  act(() => {
    root?.unmount();
  });
  container?.remove();
  container = null;
  root = null;
});

async function mount(tabId: number | null): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<Probe tabId={tabId} />);
  });
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('useAutofillHistory', () => {
  it('starts empty when storage has no entries', async () => {
    install();
    await mount(9);
    await flush();
    expect(capture.current?.loading).toBe(false);
    expect(capture.current?.history).toEqual([]);
  });

  it('loads entries from session storage on mount', async () => {
    const { storage } = install();
    const entries: AutofillHistoryEntry[] = [
      { at: 10, atsKind: 'greenhouse', fieldsFilled: 4, fieldsSkipped: 0 },
    ];
    storage.session.data['llmc.autofill-history.5'] = entries;
    await mount(5);
    await flush();
    expect(capture.current?.history).toEqual(entries);
  });

  it('appends via recordAutofillResult and reflects after reload', async () => {
    const { storage } = install();
    await recordAutofillResult(12, {
      at: 100,
      atsKind: 'workday',
      fieldsFilled: 2,
      fieldsSkipped: 1,
      stepLabel: 'myInformation',
    });
    await recordAutofillResult(12, {
      at: 200,
      atsKind: 'workday',
      fieldsFilled: 1,
      fieldsSkipped: 0,
      stepLabel: 'myExperience',
    });
    const raw = storage.session.data['llmc.autofill-history.12'] as AutofillHistoryEntry[];
    expect(raw.length).toBe(2);
    // Most recent first.
    expect(raw[0]?.at).toBe(200);
    expect(raw[1]?.at).toBe(100);
  });

  it('caps history at 20 entries per tab', async () => {
    const { storage } = install();
    for (let i = 0; i < 25; i++) {
      await recordAutofillResult(1, {
        at: i,
        atsKind: 'greenhouse',
        fieldsFilled: i,
        fieldsSkipped: 0,
      });
    }
    const raw = storage.session.data['llmc.autofill-history.1'] as AutofillHistoryEntry[];
    expect(raw.length).toBe(20);
    // Most recent first; newest at should be 24.
    expect(raw[0]?.at).toBe(24);
    expect(raw[raw.length - 1]?.at).toBe(5);
  });

  it('updates when storage.onChanged fires for the bound tab', async () => {
    const { listeners } = install();
    await mount(4);
    await flush();
    const newEntries: AutofillHistoryEntry[] = [
      { at: 5_000, atsKind: 'lever', fieldsFilled: 3, fieldsSkipped: 0 },
    ];
    await act(async () => {
      for (const fn of listeners) {
        fn(
          { 'llmc.autofill-history.4': { newValue: newEntries } },
          'session',
        );
      }
      await Promise.resolve();
    });
    expect(capture.current?.history).toEqual(newEntries);
  });

  it('rejects malformed entries when loading', async () => {
    const { storage } = install();
    storage.session.data['llmc.autofill-history.8'] = [
      { at: 1, atsKind: 'greenhouse', fieldsFilled: 1, fieldsSkipped: 0 },
      { at: 'no', atsKind: 'greenhouse', fieldsFilled: 1, fieldsSkipped: 0 },
      { at: 1, atsKind: 'bogus', fieldsFilled: 1, fieldsSkipped: 0 },
      { at: 1, atsKind: 'greenhouse', fieldsFilled: -1, fieldsSkipped: 0 },
      { at: 1, atsKind: 'greenhouse', fieldsFilled: 1, fieldsSkipped: Number.NaN },
    ];
    await mount(8);
    await flush();
    expect(capture.current?.history.length).toBe(1);
  });
});
