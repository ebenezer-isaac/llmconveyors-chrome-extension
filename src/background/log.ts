// src/background/log.ts
/**
 * Structured logger for the extension.
 *
 * Phase A1 ships this skeleton so every subsequent phase can import `createLogger`
 * from day 1. A5 wires the real transport (JSON-formatted console output prefixed
 * with `[llmc-ext:<scope>]`). A1 ships a minimal but real implementation that
 * routes to `globalThis.console` so the surface works end-to-end immediately.
 *
 * D11 invariant: extension code must never call `console.*` directly. Use
 * `createLogger('<scope>')` and call `logger.info/warn/error/debug` instead.
 * Enforced by `scripts/check-no-console.sh` and `scripts/validate-grep-gates.ts`.
 */

export interface LogContext {
  readonly tabId?: number;
  readonly requestId?: string;
  readonly [k: string]: unknown;
}

export interface Logger {
  info(msg: string, ctx?: LogContext): void;
  warn(msg: string, ctx?: LogContext): void;
  error(msg: string, err?: unknown, ctx?: LogContext): void;
  debug(msg: string, ctx?: LogContext): void;
}

const IS_DEV =
  (import.meta as unknown as { env?: { MODE?: string } }).env?.MODE !== 'production';

function format(
  scope: string,
  level: string,
  msg: string,
  ctx?: LogContext,
): readonly [string, string] {
  const prefix = `[llmc-ext:${scope}] ${level.toUpperCase()} ${msg}`;
  const ctxJson = ctx && Object.keys(ctx).length > 0 ? JSON.stringify(ctx) : '';
  return [prefix, ctxJson] as const;
}

export function createLogger(scope: string): Logger {
  // Sole authorized `globalThis.console` reference in the extension.
  // Extension code must call createLogger() instead of touching console directly.
  const sink = globalThis.console;
  return Object.freeze({
    info(msg: string, ctx?: LogContext): void {
      const [p, c] = format(scope, 'info', msg, ctx);
      sink.info(p, c);
    },
    warn(msg: string, ctx?: LogContext): void {
      const [p, c] = format(scope, 'warn', msg, ctx);
      sink.warn(p, c);
    },
    error(msg: string, err?: unknown, ctx?: LogContext): void {
      const [p, c] = format(scope, 'error', msg, ctx);
      sink.error(p, c, err ?? '');
    },
    debug(msg: string, ctx?: LogContext): void {
      if (!IS_DEV) return;
      const [p, c] = format(scope, 'debug', msg, ctx);
      sink.debug(p, c);
    },
  });
}

export const log: Logger = createLogger('root');
