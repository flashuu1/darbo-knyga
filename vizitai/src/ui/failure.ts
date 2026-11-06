import { t } from '../i18n/lt';
import { ui } from './store';

/**
 * A write that fails must never fail silently: she would think an amount or a booking was saved when it was not. Every place that
 * writes goes through `attempt` / `saveFailed`: a red toast says "Nepavyko išsaugoti" (or why: "Telefone nepakanka vietos"), the
 * thing she was doing stays as it was, and "Bandyti dar kartą" runs it again. `installFailureNet` catches what slips through.
 * This file is the ONLY place that logs an error to the console (a test keeps it so; `logError` is for what is already shown otherwise).
 */
let toastId = 1_000_000;
let timer = 0;
const SHOWN_FOR_MS = 9000;
const QUOTA = new Set(['QuotaExceededError', 'NS_ERROR_DOM_QUOTA_REACHED']);
// what the browser's storage (IndexedDB, through Dexie) throws
const STORAGE = new Set(['QuotaExceededError', 'AbortError', 'ConstraintError', 'DatabaseClosedError', 'OpenFailedError', 'InvalidStateError', 'TransactionInactiveError', 'UnknownError',
  'DataError', 'ReadOnlyError', 'VersionError', 'DataCloneError', 'NotFoundError', 'BulkError', 'ModifyError', 'MissingAPIError', 'SchemaError', 'IndexSizeError']);

type Named = { name?: string; inner?: Named };
export const isQuota = (e: unknown) => !!e && typeof e === 'object' && (QUOTA.has((e as Named).name ?? '') || QUOTA.has((e as Named).inner?.name ?? ''));
export const looksLikeStorage = (e: unknown) => !!e && typeof e === 'object' && (e instanceof DOMException || STORAGE.has((e as Named).name ?? '') || STORAGE.has((e as Named).inner?.name ?? ''));

/** For an error that is already shown to her another way (or is background work): written to the console only. */
export function logError(e: unknown) { console.error(e); }

export type Failure = 'save' | 'open' | 'read';
/** Shows that something did not work, with a way to try again. `retry` runs the same thing once more (and may fail again, and say so again). */
export function saveFailed(e: unknown, retry?: () => unknown, what: Failure = 'save') {
  console.error(e);
  const again = retry && (() => {
    ui.set({ toast: null });
    try { const r = retry(); if (r instanceof Promise) r.catch((x) => saveFailed(x, retry, what)); } catch (x) { saveFailed(x, retry, what); }
  });
  clearTimeout(timer);
  ui.set({ toast: { id: ++toastId, text: isQuota(e) ? t('fail.quota') : t(`fail.${what}`), error: true, ...(again ? { retry: again } : {}) } });
  timer = window.setTimeout(() => ui.set({ toast: null }), SHOWN_FOR_MS);
}

/** Runs a write; if it fails, says so with a retry that runs it again. Resolves to the result, or undefined when it failed. */
export async function attempt<T>(fn: () => Promise<T>, what: Failure = 'save'): Promise<T | undefined> {
  try { return await fn(); } catch (e) { saveFailed(e, () => attempt(fn, what), what); return undefined; }
}

/** What slips through (a write nobody wrapped) still shows up: any rejected promise that is the storage failing. */
export function installFailureNet() {
  window.addEventListener('unhandledrejection', (ev) => {
    if (!looksLikeStorage(ev.reason)) return;
    ev.preventDefault();
    saveFailed(ev.reason);
  });
}
let readShown = 0;
/** A live query (what is on screen) failed: said once in a while, not for every screen. */
export function readFailed(e: unknown) {
  console.error(e);
  if (Date.now() - readShown < 15_000) return;
  readShown = Date.now();
  saveFailed(e, undefined, 'read');
}
