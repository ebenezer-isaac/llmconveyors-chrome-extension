// SPDX-License-Identifier: MIT
(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BasicsSection } from '@/entrypoints/options/BasicsSection';
import type { Profile, DeepPartial } from '@/src/background/messaging/schemas/profile.schema';

const BASICS: Profile['basics'] = {
  firstName: 'Ada',
  lastName: 'Lovelace',
  email: 'ada@example.com',
  phone: '+44-20',
  location: { city: 'London', region: '', countryCode: 'GB', postalCode: '' },
  website: '',
  linkedin: '',
  github: '',
};

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

async function mountSection(
  onUpdate: (patch: DeepPartial<Profile>) => Promise<void>,
): Promise<void> {
  await act(async () => {
    root = createRoot(container!);
    root.render(<BasicsSection basics={BASICS} onUpdate={onUpdate} />);
  });
}

async function typeInto(el: HTMLInputElement, value: string): Promise<void> {
  // React tracks the previous value to decide whether to fire onChange. Clearing
  // the tracked value before mutating the input ensures React sees the new
  // value as a change (classic happy-dom/jsdom pattern for React inputs).
  await act(async () => {
    const tracker = (el as unknown as { _valueTracker?: { setValue(v: string): void } })._valueTracker;
    tracker?.setValue('');
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    )?.set;
    setter?.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function blur(el: HTMLElement): Promise<void> {
  await act(async () => {
    // React 19 delegates events at the root; blur is a focusout equivalent on
    // the delegated listener. Fire both to cover happy-dom's dispatch matrix.
    el.dispatchEvent(new Event('blur', { bubbles: false }));
    el.dispatchEvent(new Event('focusout', { bubbles: true }));
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('BasicsSection', () => {
  it('renders every field with initial value', async () => {
    await mountSection(async () => undefined);
    const firstName = query('basics-firstName') as HTMLInputElement;
    expect(firstName.value).toBe('Ada');
    expect((query('basics-email') as HTMLInputElement).value).toBe('ada@example.com');
    expect((query('basics-location-city') as HTMLInputElement).value).toBe('London');
  });

  it('commits firstName change on blur', async () => {
    const onUpdate = vi.fn(async () => undefined);
    await mountSection(onUpdate);
    const field = query('basics-firstName') as HTMLInputElement;
    await typeInto(field, 'Grace');
    await blur(field);
    expect(onUpdate).toHaveBeenCalledWith({ basics: { firstName: 'Grace' } });
  });

  it('commits nested location change on blur', async () => {
    const onUpdate = vi.fn(async () => undefined);
    await mountSection(onUpdate);
    const field = query('basics-location-city') as HTMLInputElement;
    await typeInto(field, 'NYC');
    await blur(field);
    expect(onUpdate).toHaveBeenCalledWith({
      basics: { location: { city: 'NYC' } },
    });
  });

  it('does not commit while typing (only on blur)', async () => {
    const onUpdate = vi.fn(async () => undefined);
    await mountSection(onUpdate);
    const field = query('basics-firstName') as HTMLInputElement;
    await typeInto(field, 'Typing');
    expect(onUpdate).not.toHaveBeenCalled();
  });

  it('commits email as a separate patch', async () => {
    const onUpdate = vi.fn(async () => undefined);
    await mountSection(onUpdate);
    const field = query('basics-email') as HTMLInputElement;
    await typeInto(field, 'new@example.com');
    await blur(field);
    expect(onUpdate).toHaveBeenCalledWith({ basics: { email: 'new@example.com' } });
  });

  it('disables inputs when disabled prop is true', async () => {
    await act(async () => {
      root = createRoot(container!);
      root.render(<BasicsSection basics={BASICS} onUpdate={async () => undefined} disabled />);
    });
    const field = query('basics-firstName') as HTMLInputElement;
    expect(field.disabled).toBe(true);
  });
});
