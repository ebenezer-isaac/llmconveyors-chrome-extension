// SPDX-License-Identifier: MIT
/**
 * Basics editor -- firstName, lastName, email, phone, location, website,
 * linkedin, github. Each input fires `onFieldChange` on blur so keystroke
 * churn never hits the background worker. The parent owns the Profile and
 * re-renders with a fresh composite key when storage changes.
 */

import React, { useState, useCallback } from 'react';
import type { Profile, DeepPartial } from '@/src/background/messaging/schemas/profile.schema';

export interface BasicsSectionProps {
  readonly basics: Profile['basics'];
  readonly onUpdate: (patch: DeepPartial<Profile>) => Promise<void>;
  readonly disabled?: boolean;
}

interface LocalField {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly phone: string;
  readonly website: string;
  readonly linkedin: string;
  readonly github: string;
  readonly locCity: string;
  readonly locRegion: string;
  readonly locCountryCode: string;
  readonly locPostalCode: string;
}

function seed(basics: Profile['basics']): LocalField {
  return {
    firstName: basics.firstName,
    lastName: basics.lastName,
    email: basics.email,
    phone: basics.phone,
    website: basics.website,
    linkedin: basics.linkedin,
    github: basics.github,
    locCity: basics.location.city,
    locRegion: basics.location.region,
    locCountryCode: basics.location.countryCode,
    locPostalCode: basics.location.postalCode,
  };
}

export function BasicsSection(props: BasicsSectionProps): React.ReactElement {
  const { basics, onUpdate, disabled } = props;
  const [local, setLocal] = useState<LocalField>(() => seed(basics));

  const commit = useCallback(
    async (patch: DeepPartial<Profile>): Promise<void> => {
      await onUpdate(patch);
    },
    [onUpdate],
  );

  const bind = useCallback(
    (field: keyof LocalField) =>
      (event: React.ChangeEvent<HTMLInputElement>): void => {
        setLocal((prev) => ({ ...prev, [field]: event.target.value }));
      },
    [],
  );

  const commitBasic = useCallback(
    (field: 'firstName' | 'lastName' | 'email' | 'phone' | 'website' | 'linkedin' | 'github') =>
      async (): Promise<void> => {
        await commit({ basics: { [field]: local[field] } });
      },
    [commit, local],
  );

  const commitLocation = useCallback(
    (
      field: 'city' | 'region' | 'countryCode' | 'postalCode',
      key: 'locCity' | 'locRegion' | 'locCountryCode' | 'locPostalCode',
    ) =>
      async (): Promise<void> => {
        await commit({ basics: { location: { [field]: local[key] } } });
      },
    [commit, local],
  );

  return (
    <section
      data-testid="basics-section"
      className="rounded-card border border-zinc-200 p-4 dark:border-zinc-700"
    >
      <h2 className="mb-3 text-base font-semibold">Basics</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="First name" testid="basics-firstName" value={local.firstName} onChange={bind('firstName')} onBlur={commitBasic('firstName')} disabled={disabled} />
        <Field label="Last name" testid="basics-lastName" value={local.lastName} onChange={bind('lastName')} onBlur={commitBasic('lastName')} disabled={disabled} />
        <Field label="Email" testid="basics-email" value={local.email} onChange={bind('email')} onBlur={commitBasic('email')} type="email" disabled={disabled} />
        <Field label="Phone" testid="basics-phone" value={local.phone} onChange={bind('phone')} onBlur={commitBasic('phone')} type="tel" disabled={disabled} />
        <Field label="Website" testid="basics-website" value={local.website} onChange={bind('website')} onBlur={commitBasic('website')} type="url" disabled={disabled} />
        <Field label="LinkedIn" testid="basics-linkedin" value={local.linkedin} onChange={bind('linkedin')} onBlur={commitBasic('linkedin')} type="url" disabled={disabled} />
        <Field label="GitHub" testid="basics-github" value={local.github} onChange={bind('github')} onBlur={commitBasic('github')} type="url" disabled={disabled} />
      </div>
      <h3 className="mt-4 mb-2 text-sm font-semibold text-zinc-500 dark:text-zinc-400">Location</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="City" testid="basics-location-city" value={local.locCity} onChange={bind('locCity')} onBlur={commitLocation('city', 'locCity')} disabled={disabled} />
        <Field label="Region" testid="basics-location-region" value={local.locRegion} onChange={bind('locRegion')} onBlur={commitLocation('region', 'locRegion')} disabled={disabled} />
        <Field label="Country code" testid="basics-location-countryCode" value={local.locCountryCode} onChange={bind('locCountryCode')} onBlur={commitLocation('countryCode', 'locCountryCode')} disabled={disabled} />
        <Field label="Postal code" testid="basics-location-postalCode" value={local.locPostalCode} onChange={bind('locPostalCode')} onBlur={commitLocation('postalCode', 'locPostalCode')} disabled={disabled} />
      </div>
    </section>
  );
}

interface FieldProps {
  readonly label: string;
  readonly testid: string;
  readonly value: string;
  readonly onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  readonly onBlur: () => void;
  readonly type?: string;
  readonly disabled?: boolean;
}

function Field(props: FieldProps): React.ReactElement {
  const { label, testid, value, onChange, onBlur, type, disabled } = props;
  return (
    <label className="flex flex-col text-xs text-zinc-600 dark:text-zinc-300">
      <span className="mb-1 font-medium">{label}</span>
      <input
        data-testid={testid}
        type={type ?? 'text'}
        value={value}
        onChange={onChange}
        onBlur={() => {
          void onBlur();
        }}
        disabled={disabled}
        className="rounded-card border border-zinc-200 bg-white px-2 py-1 text-sm text-zinc-900 focus:border-brand-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
      />
    </label>
  );
}
