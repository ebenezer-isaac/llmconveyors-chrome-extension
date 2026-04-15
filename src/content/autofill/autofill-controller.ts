// SPDX-License-Identifier: MIT
/**
 * AutofillController -- orchestrates the scan -> classify -> plan -> fill
 * pipeline with Workday wizard support (D6).
 *
 * Pipeline for Greenhouse + Lever (single-pass):
 *   1. ensureAdapter(url) via single-flight
 *   2. readProfile via deps.readProfile (A7 shape, D3)
 *   3. isEmptyProfile gate -> aborted profile-missing
 *   4. adapter.scanForm(document) -> FormModel
 *   5. if fields.length === 0 -> aborted no-form
 *   6. buildFillPlan({formModel, profile}) -> FillPlan
 *   7. for each instruction:
 *      - fieldType file + adapter.attachFile -> resolveFile + attachFile
 *      - otherwise -> adapter.fillField(instruction)
 *   8. aggregate filled / failed / skipped into FillRequestResponse
 *
 * Pipeline for Workday (wizard loop, D6 + keystone section 7):
 *   bootstrap:
 *     - detectCurrentStep -> this.currentStep
 *     - watchForStepChange -> on change: update + broadcast INTENT_DETECTED
 *   executeFill:
 *     - if currentStep in {review, unknown, null} -> aborted no-form
 *     - adapter.scanStep(doc, currentStep) -> FormModel
 *     - adapter.fillStep(currentStep, profile) -> FillResult[]
 *
 * Per D11 all logging goes through deps.logger. No console.* anywhere.
 * Per D20 every cross-module dep is injected. Tests pass fakes.
 */

import type {
  AtsAdapter,
  AtsKind,
  FillInstruction,
  FillResult,
  FillPlan,
  FormModel,
  WorkdayWizardStep,
} from 'ats-autofill-engine';
import { buildFillPlan } from 'ats-autofill-engine';
import type { Profile } from 'ats-autofill-engine/profile';
import type { Logger } from '@/src/background/log';
import type {
  FillRequestResponse,
  DetectedIntentPayload,
} from '@/src/background/messaging/protocol-types';
import { isEmptyProfile } from './profile-reader';

/** Abort reasons aligned with FillRequestResponseSchema. */
export type FillAbortReason =
  | 'profile-missing'
  | 'no-adapter'
  | 'no-form'
  | 'scan-failed'
  | 'plan-failed'
  | 'content-script-not-loaded'
  | 'no-tab';

export interface AutofillControllerDeps {
  /** Load adapter for URL. Returns null if no match or import fails. */
  readonly loadAdapter: (url: string) => Promise<AtsAdapter | null>;

  /** Read user profile. Returns null if missing/invalid. */
  readonly readProfile: () => Promise<Profile | null>;

  /** Resolve resume handle to File. Returns null if missing/corrupt. */
  readonly resolveFile: (handleId: string) => Promise<File | null>;

  /** Broadcast an INTENT_DETECTED payload to the background. */
  readonly broadcastIntent: (payload: DetectedIntentPayload) => void;

  /** Scoped logger. */
  readonly logger: Logger;

  /** Testable time source. */
  readonly now: () => number;

  /** Testable DOM root. */
  readonly document: Document;
}

export class AutofillController {
  private adapter: AtsAdapter | null = null;
  private adapterLoadingPromise: Promise<AtsAdapter | null> | null = null;
  private currentStep: WorkdayWizardStep | null = null;
  private stepWatcherCleanup: (() => void) | null = null;
  private isTorn = false;

  constructor(private readonly deps: AutofillControllerDeps) {}

  /**
   * Preload the adapter and, for Workday, mount the step watcher. Called
   * once from content-script main. NEVER throws.
   */
  async bootstrap(): Promise<void> {
    const url = this.deps.document.location.href;
    this.deps.logger.info('autofill bootstrap start', { url });

    const adapter = await this.ensureAdapter(url);
    if (!adapter) {
      this.deps.logger.warn('bootstrap: no adapter for URL', { url });
      return;
    }

    if (this.isTorn) {
      this.deps.logger.info('bootstrap: teardown fired during load');
      return;
    }

    if (
      adapter.kind === 'workday' &&
      typeof adapter.detectCurrentStep === 'function' &&
      typeof adapter.watchForStepChange === 'function'
    ) {
      this.mountWorkdayStepWatcher(adapter);
    }

    this.deps.logger.info('autofill bootstrap complete', {
      kind: adapter.kind,
    });
  }

  private mountWorkdayStepWatcher(adapter: AtsAdapter): void {
    const detect = adapter.detectCurrentStep;
    const watch = adapter.watchForStepChange;
    if (!detect || !watch) return;
    this.currentStep = detect(this.deps.document);
    this.deps.logger.info('workday initial step', { step: this.currentStep });

    this.stepWatcherCleanup = watch(this.deps.document, (newStep) => {
      const prev = this.currentStep;
      this.currentStep = newStep;
      this.deps.logger.info('workday step changed', {
        from: prev,
        to: newStep,
      });

      const payload: DetectedIntentPayload = {
        tabId: -1,
        url: this.deps.document.location.href,
        kind: 'workday',
        pageKind: 'application-form',
        detectedAt: this.deps.now(),
      };
      try {
        this.deps.broadcastIntent(payload);
      } catch (err: unknown) {
        this.deps.logger.warn('INTENT_DETECTED broadcast threw', {
          err: serializeError(err),
        });
      }
    });
  }

  /**
   * Execute a full fill cycle. Called from messaging when a FILL_REQUEST
   * arrives from the background. NEVER throws; every failure path
   * produces a typed FillRequestResponse.
   */
  async executeFill(): Promise<FillRequestResponse> {
    const url = this.deps.document.location.href;
    const startedAt = this.deps.now();
    this.deps.logger.info('executeFill start', { url });

    const adapter = await this.ensureAdapter(url);
    if (!adapter) {
      this.deps.logger.warn('executeFill: no adapter for URL', { url });
      return aborted('no-adapter');
    }

    const profile = await this.deps.readProfile();
    if (isEmptyProfile(profile)) {
      this.deps.logger.info('executeFill: no profile or profile empty');
      return aborted('profile-missing');
    }
    const p: Profile = profile as Profile;

    if (
      adapter.kind === 'workday' &&
      typeof adapter.scanStep === 'function' &&
      typeof adapter.fillStep === 'function'
    ) {
      return this.executeWorkdayFill(adapter, p, startedAt);
    }

    return this.executeSinglePassFill(adapter, p, startedAt);
  }

  private async executeWorkdayFill(
    adapter: AtsAdapter,
    profile: Profile,
    startedAt: number,
  ): Promise<FillRequestResponse> {
    const step = this.currentStep;
    if (
      step === null ||
      step === 'review' ||
      step === 'unknown'
    ) {
      this.deps.logger.info('workday executeFill: wizard not ready', {
        step,
      });
      return aborted('no-form');
    }

    const scanStep = adapter.scanStep;
    const fillStep = adapter.fillStep;
    if (!scanStep || !fillStep) {
      return aborted('no-adapter');
    }

    let formModel: FormModel;
    try {
      formModel = scanStep(this.deps.document, step);
    } catch (err: unknown) {
      this.deps.logger.error('workday adapter.scanStep threw', err, { step });
      return aborted('scan-failed');
    }
    this.deps.logger.debug('workday scanStep complete', {
      step,
      fieldCount: formModel.fields.length,
    });

    let fillResults: ReadonlyArray<FillResult>;
    try {
      fillResults = await fillStep(step, profile);
    } catch (err: unknown) {
      this.deps.logger.error('workday adapter.fillStep threw', err, { step });
      return aborted('plan-failed');
    }

    const planId = `plan_${this.deps.now().toString(36)}_${randomSuffix()}`;
    const filled: FilledEntry[] = [];
    const failed: FailedEntry[] = [];
    for (const r of fillResults) {
      if (r.ok) {
        filled.push({
          ok: true,
          selector: r.selector,
          value: '',
          fieldType: 'unknown',
        });
      } else {
        failed.push({ selector: r.selector, reason: r.reason });
      }
    }

    this.deps.logger.info('workday executeFill complete', {
      step,
      filled: filled.length,
      failed: failed.length,
      durationMs: this.deps.now() - startedAt,
    });

    return {
      ok: true,
      planId,
      executedAt: new Date(this.deps.now()).toISOString(),
      filled,
      skipped: [],
      failed,
      aborted: false,
    };
  }

  private async executeSinglePassFill(
    adapter: AtsAdapter,
    profile: Profile,
    startedAt: number,
  ): Promise<FillRequestResponse> {
    let formModel: FormModel;
    try {
      formModel = adapter.scanForm(this.deps.document);
    } catch (err: unknown) {
      this.deps.logger.error('adapter.scanForm threw', err, {
        kind: adapter.kind,
      });
      return aborted('scan-failed');
    }

    if (formModel.fields.length === 0) {
      this.deps.logger.info('scanForm returned empty form', {
        kind: adapter.kind,
      });
      return aborted('no-form');
    }

    let plan: FillPlan;
    try {
      plan = buildFillPlan({ formModel, profile });
    } catch (err: unknown) {
      this.deps.logger.error('buildFillPlan threw', err, {
        kind: adapter.kind,
      });
      return aborted('plan-failed');
    }

    this.deps.logger.info('plan built', {
      kind: adapter.kind,
      planId: plan.planId,
      instructionCount: plan.instructions.length,
      skippedCount: plan.skipped.length,
    });

    const filled: FilledEntry[] = [];
    const failed: FailedEntry[] = [];

    for (const instruction of plan.instructions) {
      const result = await this.executeInstruction(adapter, instruction);
      if (result.ok) {
        filled.push({
          ok: true,
          selector: instruction.selector,
          value: truncateForWire(instruction.value),
          fieldType: instruction.fieldType,
        });
      } else {
        failed.push({
          selector: instruction.selector,
          reason: result.reason,
        });
      }
    }

    const skipped: FilledEntry[] = plan.skipped.map((s) => ({
      ok: false,
      selector: s.instruction.selector,
      value: truncateForWire(s.reason),
      fieldType: s.instruction.fieldType ?? 'unknown',
    }));

    this.deps.logger.info('singlePass executeFill complete', {
      kind: adapter.kind,
      planId: plan.planId,
      filled: filled.length,
      skipped: skipped.length,
      failed: failed.length,
      durationMs: this.deps.now() - startedAt,
    });

    return {
      ok: true,
      planId: plan.planId,
      executedAt: new Date(this.deps.now()).toISOString(),
      filled,
      skipped,
      failed,
      aborted: false,
    };
  }

  private async executeInstruction(
    adapter: AtsAdapter,
    instruction: FillInstruction,
  ): Promise<FillResult> {
    // FileType handling: the engine's plan-builder currently routes file
    // fields to plan.skipped, so the file branch here is defensive only.
    if (
      instruction.fieldType === 'resume-upload' ||
      instruction.fieldType === 'cover-letter'
    ) {
      if (typeof adapter.attachFile !== 'function') {
        return {
          ok: false,
          selector: instruction.selector,
          reason: 'write-failed',
          error: 'adapter has no attachFile',
        };
      }
      const file = await this.deps.resolveFile(instruction.value);
      if (!file) {
        return {
          ok: false,
          selector: instruction.selector,
          reason: 'write-failed',
          error: 'resume handle not resolved',
        };
      }
      try {
        return await adapter.attachFile(instruction, file);
      } catch (err: unknown) {
        this.deps.logger.error('adapter.attachFile threw', err, {
          selector: instruction.selector,
        });
        return {
          ok: false,
          selector: instruction.selector,
          reason: 'write-failed',
          error: serializeError(err).message,
        };
      }
    }

    try {
      return adapter.fillField(instruction);
    } catch (err: unknown) {
      this.deps.logger.error('adapter.fillField threw', err, {
        selector: instruction.selector,
        fieldType: instruction.fieldType,
      });
      return {
        ok: false,
        selector: instruction.selector,
        reason: 'write-failed',
        error: serializeError(err).message,
      };
    }
  }

  /**
   * Single-flight adapter loader. Concurrent callers share an in-flight
   * loadingPromise; only ONE deps.loadAdapter call runs per URL +
   * controller lifetime.
   */
  private async ensureAdapter(url: string): Promise<AtsAdapter | null> {
    if (this.adapter) return this.adapter;
    if (this.adapterLoadingPromise) return this.adapterLoadingPromise;

    this.adapterLoadingPromise = this.deps
      .loadAdapter(url)
      .then((loaded) => {
        if (loaded) {
          this.adapter = loaded;
          this.deps.logger.debug('adapter cached on controller', {
            kind: loaded.kind,
          });
        }
        return loaded;
      })
      .catch((err: unknown) => {
        this.deps.logger.error('ensureAdapter: loadAdapter threw', err, {
          url,
        });
        return null;
      })
      .finally(() => {
        this.adapterLoadingPromise = null;
      });

    return this.adapterLoadingPromise;
  }

  /**
   * Unmounts the Workday step watcher, clears loading promise, sets
   * isTorn flag. Called from ctx.onInvalidated() in the entrypoint.
   */
  teardown(): void {
    this.isTorn = true;
    if (this.stepWatcherCleanup) {
      try {
        this.stepWatcherCleanup();
      } catch (err: unknown) {
        this.deps.logger.warn('stepWatcherCleanup threw', {
          err: serializeError(err),
        });
      }
      this.stepWatcherCleanup = null;
    }
    this.currentStep = null;
    this.adapter = null;
    this.adapterLoadingPromise = null;
    this.deps.logger.info('controller torn down');
  }

  /** @internal test hook */
  getCurrentStepForTests(): WorkdayWizardStep | null {
    return this.currentStep;
  }

  /** @internal test hook */
  getAdapterKindForTests(): AtsKind | null {
    return this.adapter?.kind ?? null;
  }
}

// ---- internal wire shapes matching FillRequestResponseSchema ----

interface FilledEntry {
  readonly ok: boolean;
  readonly selector: string;
  readonly value: string;
  readonly fieldType: string;
}

interface FailedEntry {
  readonly selector: string;
  readonly reason: string;
}

function aborted(reason: FillAbortReason): FillRequestResponse {
  return { ok: false, aborted: true, abortReason: reason };
}

function truncateForWire(s: string): string {
  if (s.length <= 10_000) return s;
  return s.slice(0, 10_000);
}

function randomSuffix(): string {
  return Math.floor(Math.random() * 1e9).toString(36);
}

function serializeError(err: unknown): { message: string; name?: string } {
  if (err instanceof Error) {
    return { message: err.message, name: err.name };
  }
  if (typeof err === 'string') return { message: err };
  try {
    return { message: JSON.stringify(err) };
  } catch {
    return { message: '<unserializable error>' };
  }
}
