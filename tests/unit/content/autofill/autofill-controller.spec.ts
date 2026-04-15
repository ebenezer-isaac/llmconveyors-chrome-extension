// SPDX-License-Identifier: MIT
/**
 * Unit tests for AutofillController. DI-based: every cross-module dep is
 * injected via fakes; zero module-level mocks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  AutofillController,
  type AutofillControllerDeps,
} from '@/src/content/autofill/autofill-controller';
import type {
  AtsAdapter,
  AtsKind,
  FillInstruction,
  FillResult,
  FormModel,
  WorkdayWizardStep,
} from 'ats-autofill-engine';
import type { Profile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/src/background/log';

function makeFakeLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

function makeProfile(): Profile {
  return {
    profileVersion: '1.0',
    updatedAtMs: 1_713_000_000_000,
    basics: {
      firstName: 'Jane',
      lastName: 'Doe',
      email: 'jane.doe@example.com',
      phone: '+1-415-555-0101',
      website: 'https://janedoe.example.com',
      linkedin: 'https://linkedin.com/in/janedoe',
      github: 'https://github.com/janedoe',
    },
    work: [],
    education: [],
    skills: [],
  } as Profile;
}

function makeFakeDoc(hostname = 'boards.greenhouse.io'): Document {
  const doc = {
    location: {
      href: `https://${hostname}/example/jobs/1`,
      host: hostname,
    },
  } as unknown as Document;
  return doc;
}

function makeFakeAdapter(
  kind: AtsKind,
  overrides: Partial<AtsAdapter> = {},
): AtsAdapter {
  const base: AtsAdapter = {
    kind,
    matchesUrl: () => true,
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
  };
  return Object.freeze({ ...base, ...overrides });
}

function makeDeps(
  overrides: Partial<AutofillControllerDeps> = {},
): AutofillControllerDeps {
  return {
    loadAdapter: async () => makeFakeAdapter('greenhouse'),
    readProfile: async () => makeProfile(),
    resolveFile: async () => null,
    broadcastIntent: vi.fn(),
    logger: makeFakeLogger(),
    now: () => 1_713_000_000_000,
    document: makeFakeDoc(),
    ...overrides,
  };
}

describe('AutofillController.executeFill - single-pass happy path', () => {
  it('returns ok:true with filled entries when all fields succeed', async () => {
    // FormModel with three standard fields that the engine classifier can
    // resolve. The engine's scanForm would normally produce these from
    // live DOM, but we supply them directly via a fake adapter.
    const adapter = makeFakeAdapter('greenhouse', {
      scanForm: (): FormModel => ({
        url: 'https://boards.greenhouse.io/example/jobs/1',
        title: 'Apply',
        scannedAt: '2026-04-16T00:00:00.000Z',
        sourceATS: 'greenhouse',
        fields: [
          {
            selector: '#first_name',
            htmlType: 'text',
            name: 'first_name',
            id: 'first_name',
            label: 'First Name',
          },
          {
            selector: '#email',
            htmlType: 'email',
            name: 'email',
            id: 'email',
            label: 'Email',
          },
        ],
      }),
      fillField: (instruction) => ({
        ok: true,
        selector: instruction.selector,
      }),
    });

    const controller = new AutofillController(
      makeDeps({ loadAdapter: async () => adapter }),
    );
    const resp = await controller.executeFill();
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.filled.length).toBeGreaterThan(0);
      expect(resp.aborted).toBe(false);
    }
  });
});

describe('AutofillController.executeFill - abort paths', () => {
  it('returns abort no-adapter when loadAdapter returns null', async () => {
    const controller = new AutofillController(
      makeDeps({ loadAdapter: async () => null }),
    );
    const resp = await controller.executeFill();
    expect(resp).toEqual({
      ok: false,
      aborted: true,
      abortReason: 'no-adapter',
    });
  });

  it('returns abort profile-missing when profile is null', async () => {
    const controller = new AutofillController(
      makeDeps({ readProfile: async () => null }),
    );
    const resp = await controller.executeFill();
    expect(resp).toMatchObject({
      ok: false,
      aborted: true,
      abortReason: 'profile-missing',
    });
  });

  it('returns abort no-form when scanForm returns empty fields', async () => {
    const adapter = makeFakeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://example.com',
        title: 'Empty',
        scannedAt: '2026-04-16T00:00:00.000Z',
        fields: [],
      }),
    });
    const controller = new AutofillController(
      makeDeps({ loadAdapter: async () => adapter }),
    );
    const resp = await controller.executeFill();
    expect(resp).toMatchObject({
      ok: false,
      aborted: true,
      abortReason: 'no-form',
    });
  });

  it('returns abort scan-failed when adapter.scanForm throws', async () => {
    const adapter = makeFakeAdapter('greenhouse', {
      scanForm: () => {
        throw new Error('boom');
      },
    });
    const controller = new AutofillController(
      makeDeps({ loadAdapter: async () => adapter }),
    );
    const resp = await controller.executeFill();
    expect(resp).toMatchObject({
      ok: false,
      aborted: true,
      abortReason: 'scan-failed',
    });
  });
});

describe('AutofillController - single-flight adapter load', () => {
  it('calls loadAdapter exactly once across concurrent executeFill calls', async () => {
    let loadCount = 0;
    const adapter = makeFakeAdapter('greenhouse', {
      scanForm: () => ({
        url: 'https://example.com',
        title: 'Empty',
        scannedAt: '2026-04-16T00:00:00.000Z',
        fields: [],
      }),
    });
    const loadAdapter: Mock = vi.fn(async () => {
      loadCount += 1;
      return adapter;
    });

    const controller = new AutofillController(makeDeps({ loadAdapter }));
    await Promise.all([
      controller.executeFill(),
      controller.executeFill(),
      controller.executeFill(),
    ]);
    expect(loadCount).toBe(1);
  });
});

describe('AutofillController - Workday wizard orchestration', () => {
  let changeCb: ((step: WorkdayWizardStep) => void) | null = null;

  beforeEach(() => {
    changeCb = null;
  });

  function makeWorkdayAdapter(
    initialStep: WorkdayWizardStep,
    fillStepImpl?: (step: WorkdayWizardStep) => ReadonlyArray<FillResult>,
  ): AtsAdapter {
    const base: AtsAdapter = {
      kind: 'workday',
      matchesUrl: () => true,
      scanForm: (): FormModel => ({
        url: 'https://example.myworkdayjobs.com/',
        title: 'Workday',
        scannedAt: '2026-04-16T00:00:00.000Z',
        fields: [],
      }),
      fillField: (i: FillInstruction): FillResult => ({
        ok: true,
        selector: i.selector,
      }),
      detectCurrentStep: (): WorkdayWizardStep => initialStep,
      watchForStepChange: (
        _doc: Document,
        cb: (step: WorkdayWizardStep) => void,
      ): (() => void) => {
        changeCb = cb;
        return () => {
          changeCb = null;
        };
      },
      scanStep: (): FormModel => ({
        url: 'https://example.myworkdayjobs.com/',
        title: 'Workday step',
        scannedAt: '2026-04-16T00:00:00.000Z',
        fields: [],
      }),
      fillStep: async (
        step: WorkdayWizardStep,
      ): Promise<ReadonlyArray<FillResult>> => {
        if (fillStepImpl) {
          return fillStepImpl(step);
        }
        const results: ReadonlyArray<FillResult> = [
          { ok: true, selector: '#fake-1' },
          { ok: true, selector: '#fake-2' },
        ];
        return results;
      },
    };
    return Object.freeze(base);
  }

  it('mounts the step watcher on bootstrap and records initial step', async () => {
    const adapter = makeWorkdayAdapter('my-information');
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        document: makeFakeDoc('example.myworkdayjobs.com'),
      }),
    );
    await controller.bootstrap();
    expect(controller.getCurrentStepForTests()).toBe('my-information');
  });

  it('broadcasts INTENT_DETECTED when the step changes', async () => {
    const adapter = makeWorkdayAdapter('my-information');
    const broadcastIntent = vi.fn();
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        broadcastIntent,
        document: makeFakeDoc('example.myworkdayjobs.com'),
      }),
    );
    await controller.bootstrap();
    expect(changeCb).not.toBeNull();
    changeCb?.('my-experience');
    expect(controller.getCurrentStepForTests()).toBe('my-experience');
    expect(broadcastIntent).toHaveBeenCalledTimes(1);
  });

  it('aborts no-form when wizard step is review', async () => {
    const adapter = makeWorkdayAdapter('review');
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        document: makeFakeDoc('example.myworkdayjobs.com'),
      }),
    );
    await controller.bootstrap();
    const resp = await controller.executeFill();
    expect(resp).toMatchObject({
      ok: false,
      aborted: true,
      abortReason: 'no-form',
    });
  });

  it('aborts no-form when wizard step is unknown', async () => {
    const adapter = makeWorkdayAdapter('unknown');
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        document: makeFakeDoc('example.myworkdayjobs.com'),
      }),
    );
    await controller.bootstrap();
    const resp = await controller.executeFill();
    expect(resp).toMatchObject({
      ok: false,
      aborted: true,
      abortReason: 'no-form',
    });
  });

  it('calls fillStep with current step when wizard is ready', async () => {
    const fillStepSpy = vi.fn(
      async (_step: WorkdayWizardStep): Promise<ReadonlyArray<FillResult>> => [
        { ok: true, selector: '#wd-first-name' },
        { ok: true, selector: '#wd-email' },
      ],
    );
    const adapter = Object.freeze({
      kind: 'workday' as const,
      matchesUrl: () => true,
      scanForm: (): FormModel => ({
        url: 'https://example.myworkdayjobs.com/',
        title: 'Workday',
        scannedAt: '2026-04-16T00:00:00.000Z',
        fields: [],
      }),
      fillField: (i: FillInstruction): FillResult => ({
        ok: true,
        selector: i.selector,
      }),
      detectCurrentStep: () => 'my-information' as WorkdayWizardStep,
      watchForStepChange: () => () => undefined,
      scanStep: (): FormModel => ({
        url: 'https://example.myworkdayjobs.com/',
        title: 'Workday step',
        scannedAt: '2026-04-16T00:00:00.000Z',
        fields: [],
      }),
      fillStep: fillStepSpy,
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        document: makeFakeDoc('example.myworkdayjobs.com'),
      }),
    );
    await controller.bootstrap();
    const resp = await controller.executeFill();
    expect(fillStepSpy).toHaveBeenCalledWith('my-information', expect.any(Object));
    expect(resp.ok).toBe(true);
    if (resp.ok) {
      expect(resp.filled).toHaveLength(2);
    }
  });

  it('returns plan-failed when fillStep throws', async () => {
    const adapter = makeWorkdayAdapter('my-information', () => {
      throw new Error('wd-step-error');
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        document: makeFakeDoc('example.myworkdayjobs.com'),
      }),
    );
    await controller.bootstrap();
    const resp = await controller.executeFill();
    expect(resp).toMatchObject({
      ok: false,
      aborted: true,
      abortReason: 'plan-failed',
    });
  });
});

describe('AutofillController.teardown', () => {
  it('runs the step watcher cleanup function', async () => {
    const cleanup = vi.fn();
    const adapter = Object.freeze({
      kind: 'workday' as const,
      matchesUrl: () => true,
      scanForm: (): FormModel => ({
        url: 'https://example.myworkdayjobs.com/',
        title: 'Workday',
        scannedAt: '2026-04-16T00:00:00.000Z',
        fields: [],
      }),
      fillField: (i: FillInstruction): FillResult => ({
        ok: true,
        selector: i.selector,
      }),
      detectCurrentStep: () => 'my-information' as WorkdayWizardStep,
      watchForStepChange: () => cleanup,
    });
    const controller = new AutofillController(
      makeDeps({
        loadAdapter: async () => adapter,
        document: makeFakeDoc('example.myworkdayjobs.com'),
      }),
    );
    await controller.bootstrap();
    controller.teardown();
    expect(cleanup).toHaveBeenCalledTimes(1);
    expect(controller.getCurrentStepForTests()).toBeNull();
  });
});
