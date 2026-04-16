// SPDX-License-Identifier: MIT
/**
 * Adversarial tests for SidepanelGenerationForm. Tries to trigger the
 * known failure modes of an exact-ditto-to-Next.js form: required-field
 * bypass, busy-state races, mode-toggle data loss, injection attempts,
 * max-length overflow, whitespace-only inputs.
 */

// React auto-injected
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { cleanup, render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { SidepanelGenerationForm } from '@/entrypoints/sidepanel/SidepanelGenerationForm';

type SendMessage = ReturnType<typeof vi.fn>;

function installChrome(sendMessageImpl?: (msg: unknown) => Promise<unknown>): SendMessage {
  const sendMessage = vi.fn(async (_msg: unknown) => {
    if (sendMessageImpl) return sendMessageImpl(_msg);
    return { ok: true, generationId: 'g1', sessionId: 's1' };
  });
  (globalThis as unknown as { chrome: unknown }).chrome = {
    runtime: { sendMessage },
    tabs: {
      query: async () => [{ id: 1, url: 'https://boards.greenhouse.io/acme/jobs/1' }],
      sendMessage,
    },
    sidePanel: { open: vi.fn(async () => undefined) },
  };
  return sendMessage;
}

function uninstallChrome(): void {
  delete (globalThis as { chrome?: unknown }).chrome;
}

describe('SidepanelGenerationForm adversarial', () => {
  beforeEach(() => {
    installChrome();
  });
  afterEach(() => {
    cleanup();
    uninstallChrome();
    vi.restoreAllMocks();
  });

  describe('required-field validation', () => {
    it('Generate stays disabled when all job-hunter required fields are empty', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      const submit = screen.getByTestId('sidepanel-form-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
    });

    it('Generate stays disabled when only whitespace is typed', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl="https://x.co"
        />,
      );
      const company = screen.getByTestId('sidepanel-form-company') as HTMLInputElement;
      const title = screen.getByTestId('sidepanel-form-title') as HTMLInputElement;
      const jd = screen.getByTestId('sidepanel-form-jd') as HTMLTextAreaElement;
      fireEvent.change(company, { target: { value: '   ' } });
      fireEvent.change(title, { target: { value: '\t\n' } });
      fireEvent.change(jd, { target: { value: '\r\n  \t' } });
      const submit = screen.getByTestId('sidepanel-form-submit') as HTMLButtonElement;
      // Form considers these as empty (trimmed), so button stays disabled.
      // This matches ChatInterface's validator which uses .trim().
      expect(submit.disabled).toBe(true);
    });

    it('Generate enables once all required fields are truthy after trim', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl="https://x.co"
        />,
      );
      fireEvent.change(screen.getByTestId('sidepanel-form-company'), {
        target: { value: 'Acme' },
      });
      fireEvent.change(screen.getByTestId('sidepanel-form-title'), {
        target: { value: 'Engineer' },
      });
      fireEvent.change(screen.getByTestId('sidepanel-form-jd'), {
        target: { value: 'We are hiring' },
      });
      const submit = screen.getByTestId('sidepanel-form-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(false);
    });

    it('clicking Generate with empty fields does NOT call start', async () => {
      const send = installChrome();
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      // Force-click the disabled button (simulates a malicious/accidental
      // programmatic click)
      const submit = screen.getByTestId('sidepanel-form-submit') as HTMLButtonElement;
      submit.disabled = false;
      fireEvent.submit(submit.form!);
      // Field errors should populate; no GENERATION_START should fire
      const calls = send.mock.calls.filter(
        (c) => (c[0] as { key?: string }).key === 'GENERATION_START',
      );
      expect(calls).toHaveLength(0);
    });
  });

  describe('URL normalization', () => {
    it('lowercases and strips spaces from website field on input', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      const website = screen.getByTestId('sidepanel-form-website') as HTMLInputElement;
      fireEvent.change(website, {
        target: { value: '  HTTPS://EXAMPLE.COM/path   ' },
      });
      expect(website.value).toBe('https://example.com/path');
    });

    it('normalizes cold-outreach contact email the same way', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      // Flip to cold outreach to surface email field
      const toggle = screen.getByTestId('sidepanel-form-mode-toggle');
      fireEvent.click(toggle);
      const email = screen.getByTestId(
        'sidepanel-form-contact-email',
      ) as HTMLInputElement;
      fireEvent.change(email, { target: { value: '  Jane@Example.COM  ' } });
      expect(email.value).toBe('jane@example.com');
    });
  });

  describe('max-length enforcement', () => {
    it('company input is capped at maxLength 200 (HTML attribute)', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      const company = screen.getByTestId('sidepanel-form-company') as HTMLInputElement;
      expect(company.maxLength).toBe(200);
    });

    it('job description is capped at maxLength 40000', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      const jd = screen.getByTestId('sidepanel-form-jd') as HTMLTextAreaElement;
      expect(jd.maxLength).toBe(40_000);
    });

    it('char counter reflects typed length', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      const jd = screen.getByTestId('sidepanel-form-jd') as HTMLTextAreaElement;
      fireEvent.change(jd, { target: { value: 'hello world' } });
      expect(screen.getByTestId('sidepanel-generation-form-root').textContent).toContain(
        '11 / 40,000',
      );
    });
  });

  describe('mode toggle data preservation', () => {
    it('cold -> standard folds contact fields into job description', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      const toggle = screen.getByTestId('sidepanel-form-mode-toggle');
      fireEvent.click(toggle); // -> cold_outreach
      fireEvent.change(screen.getByTestId('sidepanel-form-contact-name'), {
        target: { value: 'Jane' },
      });
      fireEvent.change(screen.getByTestId('sidepanel-form-contact-title'), {
        target: { value: 'CTO' },
      });
      fireEvent.change(screen.getByTestId('sidepanel-form-contact-email'), {
        target: { value: 'jane@example.com' },
      });
      fireEvent.click(toggle); // -> standard
      const jd = screen.getByTestId('sidepanel-form-jd') as HTMLTextAreaElement;
      expect(jd.value).toContain('Additional outreach context');
      expect(jd.value).toContain('Jane');
      expect(jd.value).toContain('CTO');
      expect(jd.value).toContain('jane@example.com');
    });

    it('toggling back to cold does NOT re-fold existing contact fields (only cold->std folds)', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      const toggle = screen.getByTestId('sidepanel-form-mode-toggle');
      fireEvent.click(toggle); // -> cold
      fireEvent.click(toggle); // -> standard (nothing to fold)
      fireEvent.click(toggle); // -> cold again
      // Contact fields are empty again; no duplicate fold
      const name = screen.getByTestId(
        'sidepanel-form-contact-name',
      ) as HTMLInputElement;
      expect(name.value).toBe('');
    });
  });

  describe('XSS / injection safety', () => {
    it('does not render HTML from company / title / JD via React text escaping', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={{hasJd: true, jdText: '<script>window.HACKED=true</script><img src=x onerror="alert(1)">', jobTitle: null, company: null}}
          tabUrl={null}
        />,
      );
      // The JD is bound to a textarea; React escapes inside value attribute
      const jd = screen.getByTestId('sidepanel-form-jd') as HTMLTextAreaElement;
      expect(jd.value).toContain('<script>');
      expect((globalThis as { HACKED?: boolean }).HACKED).toBeUndefined();
      // No script tag actually rendered into the DOM
      expect(document.querySelector('script')).toBeNull();
    });
  });

  describe('submit path', () => {
    it('b2b-sales only needs website; submit enables when website typed', () => {
      render(
        <SidepanelGenerationForm
          activeAgentId="b2b-sales"
          intent={null}
          genericIntent={null}
          tabUrl={null}
        />,
      );
      const submit = screen.getByTestId('sidepanel-form-submit') as HTMLButtonElement;
      expect(submit.disabled).toBe(true);
      fireEvent.change(screen.getByTestId('sidepanel-form-website'), {
        target: { value: 'https://example.com' },
      });
      expect(submit.disabled).toBe(false);
    });

    it('dispatches GENERATION_START with trimmed job-hunter payload', async () => {
      const send = installChrome();
      render(
        <SidepanelGenerationForm
          activeAgentId="job-hunter"
          intent={null}
          genericIntent={null}
          tabUrl="https://boards.greenhouse.io/acme/jobs/1"
        />,
      );
      fireEvent.change(screen.getByTestId('sidepanel-form-company'), {
        target: { value: '  Acme  ' },
      });
      fireEvent.change(screen.getByTestId('sidepanel-form-title'), {
        target: { value: '  Engineer  ' },
      });
      fireEvent.change(screen.getByTestId('sidepanel-form-jd'), {
        target: { value: '  JD content  ' },
      });
      await act(async () => {
        const submit = screen.getByTestId('sidepanel-form-submit') as HTMLButtonElement;
        fireEvent.submit(submit.form!);
      });
      await waitFor(() =>
        expect(
          send.mock.calls.some(
            (c) => (c[0] as { key?: string }).key === 'GENERATION_START',
          ),
        ).toBe(true),
      );
      const startCall = send.mock.calls.find(
        (c) => (c[0] as { key?: string }).key === 'GENERATION_START',
      );
      const payload = (startCall?.[0] as {
        data?: { payload?: Record<string, unknown> };
      }).data?.payload;
      expect(payload?.jobDescription).toBe('JD content');
      expect(payload?.companyName).toBe('Acme');
      expect(payload?.jobTitle).toBe('Engineer');
    });
  });
});
