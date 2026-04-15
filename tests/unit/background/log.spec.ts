// SPDX-License-Identifier: MIT
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createLogger, log } from '../../../src/background/log';

describe('log', () => {
  let infoSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    infoSpy = vi.spyOn(globalThis.console, 'info').mockImplementation(() => {});
    warnSpy = vi.spyOn(globalThis.console, 'warn').mockImplementation(() => {});
    errorSpy = vi.spyOn(globalThis.console, 'error').mockImplementation(() => {});
  });

  it('info includes the scope prefix', () => {
    const l = createLogger('test-scope');
    l.info('hello');
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[llmc-ext:test-scope] INFO hello'),
      expect.anything(),
    );
  });

  it('info serializes context as JSON', () => {
    const l = createLogger('s');
    l.info('msg', { tabId: 42, requestId: 'r1' });
    expect(infoSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.stringContaining('"tabId":42'),
    );
  });

  it('error passes the error object through', () => {
    const l = createLogger('s');
    l.error('failed', new TypeError('bad thing'));
    expect(errorSpy).toHaveBeenCalled();
  });

  it('error tolerates undefined err', () => {
    const l = createLogger('s');
    expect(() => l.error('failed')).not.toThrow();
  });

  it('default export `log` uses "root" scope', () => {
    log.info('x');
    expect(infoSpy).toHaveBeenCalledWith(
      expect.stringContaining('[llmc-ext:root]'),
      expect.anything(),
    );
  });

  it('warn routes through console.warn', () => {
    const l = createLogger('x');
    l.warn('warn-msg');
    expect(warnSpy).toHaveBeenCalled();
  });
});
