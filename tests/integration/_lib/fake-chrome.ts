// SPDX-License-Identifier: MIT
import { fakeBrowser } from '@webext-core/fake-browser';

/**
 * Return a fresh fake-browser instance with storage pre-cleared and no cookies.
 * Call this in `beforeEach` for every integration test; state is process-local
 * so cross-test leakage is impossible when each test resets.
 */
export function createFakeChrome(): typeof fakeBrowser {
  fakeBrowser.reset();
  return fakeBrowser;
}

/**
 * Seed a canonical value into chrome.storage.local. Helper for tests that
 * need a pre-existing profile / session before they start.
 */
export async function seedStorage(key: string, value: unknown): Promise<void> {
  await fakeBrowser.storage.local.set({ [key]: value });
}

/**
 * Read a specific key back from chrome.storage.local. Returns undefined if unset.
 */
export async function readStorage<T>(key: string): Promise<T | undefined> {
  const out = await fakeBrowser.storage.local.get(key);
  return out[key] as T | undefined;
}

/**
 * Dispatch a runtime message as if from a specific tab. Returns the handler response.
 * Wraps the fake-browser message loop so tests can await responses naturally.
 */
export async function sendMessageFromTab(
  tabId: number,
  message: unknown,
): Promise<unknown> {
  void tabId;
  return fakeBrowser.runtime.sendMessage(message);
}
