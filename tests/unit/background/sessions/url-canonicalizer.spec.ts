// SPDX-License-Identifier: MIT
import { describe, it, expect } from 'vitest';
import { canonicalizeUrl } from '@/src/background/sessions/url-canonicalizer';

describe('canonicalizeUrl', () => {
  it('returns null for non-http/https protocols', () => {
    expect(canonicalizeUrl('chrome://extensions')).toBeNull();
    expect(canonicalizeUrl('file:///C:/tmp')).toBeNull();
    expect(canonicalizeUrl('about:blank')).toBeNull();
    expect(canonicalizeUrl('javascript:alert(1)')).toBeNull();
    expect(canonicalizeUrl('ftp://example.com/path')).toBeNull();
  });

  it('returns null for malformed or empty input', () => {
    expect(canonicalizeUrl('')).toBeNull();
    expect(canonicalizeUrl('not a url')).toBeNull();
    expect(canonicalizeUrl('//no-protocol.example.com/path')).toBeNull();
    // Non-string input treated as null by strict guard.
    expect(canonicalizeUrl(null as unknown as string)).toBeNull();
  });

  it('strips utm_* tracking parameters', () => {
    const key = canonicalizeUrl(
      'https://example.com/job/123?utm_source=linkedin&utm_medium=social&utm_campaign=spring',
    );
    expect(key).toBe('https://example.com/job/123');
  });

  it('strips other tracking parameters (fbclid, gclid, ref, source, mc_cid, etc.)', () => {
    const key = canonicalizeUrl(
      'https://example.com/a?fbclid=abc&gclid=xyz&ref=q&source=n&mc_cid=1&mc_eid=2&cmpid=3&campaign=4&_hsenc=x&_hsmi=y&igshid=z&yclid=w',
    );
    expect(key).toBe('https://example.com/a');
  });

  it('preserves JD-identifying params like jobId', () => {
    const key = canonicalizeUrl(
      'https://workday.example.com/jobs?jobId=12345&utm_source=x',
    );
    expect(key).toBe('https://workday.example.com/jobs?jobId=12345');
  });

  it('sorts remaining params so key order does not change the output', () => {
    const k1 = canonicalizeUrl('https://example.com/p?b=2&a=1');
    const k2 = canonicalizeUrl('https://example.com/p?a=1&b=2');
    expect(k1).toBe(k2);
    expect(k1).toBe('https://example.com/p?a=1&b=2');
  });

  it('lowercases the hostname but preserves path case', () => {
    const key = canonicalizeUrl('https://ExAmPle.COM/JobPath/Listing');
    expect(key).toBe('https://example.com/JobPath/Listing');
  });

  it('drops the fragment', () => {
    const key = canonicalizeUrl('https://example.com/path#section-2');
    expect(key).toBe('https://example.com/path');
  });

  it('normalizes empty path to / and preserves other paths verbatim', () => {
    expect(canonicalizeUrl('https://example.com')).toBe('https://example.com/');
    expect(canonicalizeUrl('https://example.com/')).toBe('https://example.com/');
    expect(canonicalizeUrl('https://example.com/a/b')).toBe('https://example.com/a/b');
    expect(canonicalizeUrl('https://example.com/a/b/')).toBe('https://example.com/a/b/');
  });

  it('preserves non-default port', () => {
    const key = canonicalizeUrl('https://example.com:8443/path');
    expect(key).toBe('https://example.com:8443/path');
  });

  it('treats same logical page across many tracker variants as identical', () => {
    const base = 'https://example.com/careers/engineer?reqId=42';
    const variants = [
      `${base}&utm_source=li`,
      `${base}&utm_source=li&utm_medium=social`,
      `${base}&fbclid=abc`,
      `${base}&gclid=zzz&ref=home`,
      `${base}#apply-now`,
    ];
    const canonical = canonicalizeUrl(base);
    for (const v of variants) {
      expect(canonicalizeUrl(v)).toBe(canonical);
    }
  });

  it('strips utm even with mixed-case key names', () => {
    const key = canonicalizeUrl('https://example.com/p?UTM_Source=x&jobId=7');
    expect(key).toBe('https://example.com/p?jobId=7');
  });
});
