// SPDX-License-Identifier: MIT
/**
 * Session storage adapter over chrome.storage.local.
 *
 * Matches the integration-test contract: keyed at `llmc.session.v1` with the
 * shape `{ accessToken, refreshToken, expiresAt, userId }`.
 *
 * Reads validate via StoredSessionSchema; corrupt rows are cleaned up and
 * treated as signed-out.
 */

import { StoredSessionSchema, type StoredSession } from '../messaging/schemas/auth.schema';
import { STORAGE_KEYS, LOG_SCOPES } from '../config';
import { createLogger } from './../log';

const logger = createLogger(LOG_SCOPES.session);

export async function readSession(): Promise<StoredSession | null> {
  const raw = await chrome.storage.local.get(STORAGE_KEYS.session);
  const value = raw[STORAGE_KEYS.session];
  if (value === undefined || value === null) return null;
  const parsed = StoredSessionSchema.safeParse(value);
  if (!parsed.success) {
    logger.warn('readSession: corrupt row, clearing', {
      issues: parsed.error.issues.length,
    });
    try {
      await chrome.storage.local.remove(STORAGE_KEYS.session);
    } catch (err) {
      logger.error('readSession: remove of corrupt row failed', err);
    }
    return null;
  }
  return parsed.data;
}

export async function writeSession(s: StoredSession): Promise<void> {
  const parsed = StoredSessionSchema.safeParse(s);
  if (!parsed.success) {
    throw new Error(`writeSession: invalid session shape: ${parsed.error.message}`);
  }
  await chrome.storage.local.set({ [STORAGE_KEYS.session]: parsed.data });
}

export async function clearSession(): Promise<void> {
  await chrome.storage.local.remove(STORAGE_KEYS.session);
}
