/**
 * Ending a session in the browser, end to end.
 *
 * These assertions are about *behaviour* — which keys survive a sign-out — because
 * the defect they cover was a behaviour, not a line of code: the console cleared
 * one store and left the admin token in place, so `/login` restored the session and
 * carried the admin back into `/admin`.
 *
 * The environment is node, so the browser is built by hand below. The storages are
 * deliberately plain objects whose enumerable keys *are* the stored entries,
 * because that is what real localStorage looks like to `Object.keys`.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  SESSION_STORAGE_KEY,
  onAuthStateChange,
  readStoredSession,
  type SbSession,
} from '../../services/wordpressAdminAuth';
import {
  CUSTOMER_SESSION_STORAGE_KEY,
  getCustomerSession,
  type CustomerSession,
} from './customerClient';
import { signOutOfBrowser } from './browserSignOut';

const ADMIN_SESSION: SbSession = {
  accessToken: 'signed.admin.token',
  refreshToken: '',
  expiresAt: Date.now() + 3_600_000,
  user: { id: 'admin@himalayankoh.com', email: 'admin@himalayankoh.com', name: 'Admin', role: 'admin' },
};

const CUSTOMER_SESSION: CustomerSession = {
  accessToken: 'signed.customer.token',
  expiresAt: Date.now() + 3_600_000,
  user: { id: 42, email: 'ada@example.com', name: 'Ada Lovelace', role: 'customer' },
};

/** A legacy Supabase key: another store's data, which this module must not touch. */
const SUPABASE_KEY = 'sb-timpjroyxoafhkwpxiuk-auth-token';

type StorageStub = Record<string, unknown> & { getItem: (key: string) => string | null };

function storage(entries: Record<string, string>): StorageStub {
  const store: Record<string, unknown> = { ...entries };
  Object.defineProperties(store, {
    getItem: { value: (key: string) => (key in store ? String(store[key]) : null) },
    setItem: { value: (key: string, value: string) => { store[key] = value; } },
    removeItem: { value: (key: string) => { delete store[key]; } },
    key: { value: (index: number) => Object.keys(store)[index] ?? null },
    clear: { value: () => { for (const key of Object.keys(store)) delete store[key]; } },
  });
  return store as StorageStub;
}

let localStorageStub: StorageStub;
let sessionStorageStub: StorageStub;
let cookieWrites: string[];

beforeEach(() => {
  cookieWrites = [];
  localStorageStub = storage({
    [SESSION_STORAGE_KEY]: JSON.stringify(ADMIN_SESSION),
    [CUSTOMER_SESSION_STORAGE_KEY]: JSON.stringify(CUSTOMER_SESSION),
    [SUPABASE_KEY]: 'legacy.session.token',
    'unrelated-preference': 'keep me',
  });
  sessionStorageStub = storage({ [`${SUPABASE_KEY}.0`]: 'chunked' });

  vi.stubGlobal('window', {
    localStorage: localStorageStub,
    sessionStorage: sessionStorageStub,
    location: { hostname: 'preview.himalayankoh.com' },
  });
  vi.stubGlobal('document', {
    get cookie() {
      return `theme=dark`;
    },
    set cookie(value: string) {
      cookieWrites.push(value);
    },
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('signOutOfBrowser', () => {
  it('ends the admin session and the customer session together', () => {
    const events: string[] = [];
    onAuthStateChange((event) => events.push(event));

    expect(readStoredSession()).not.toBeNull();
    expect(getCustomerSession()).not.toBeNull();

    signOutOfBrowser();

    // The admin token is the credential the old handler left behind — a live one
    // means the very next page load restores the session.
    expect(localStorageStub.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(readStoredSession()).toBeNull();
    expect(events).toContain('SIGNED_OUT');

    // …and the customer session, so a leftover customer identity cannot survive
    // either.
    expect(localStorageStub.getItem(CUSTOMER_SESSION_STORAGE_KEY)).toBeNull();
    expect(getCustomerSession()).toBeNull();
  });

  it('touches only the two stores it owns, and no other storage', () => {
    signOutOfBrowser();

    expect(localStorageStub.getItem('unrelated-preference')).toBe('keep me');
    // A Supabase session is not this app's to clear any more: the store belonged to
    // a client that is gone, and wiping keys this module does not own is how a
    // sign-out breaks something else.
    expect(localStorageStub.getItem(SUPABASE_KEY)).toBe('legacy.session.token');
    expect(sessionStorageStub.getItem(`${SUPABASE_KEY}.0`)).toBe('chunked');
    expect(cookieWrites).toEqual([]);
  });
});

/**
 * One owner, enforced.
 *
 * Clearing one store and leaving the other is the whole defect, and the easy
 * mistake — a new screen reaching for whichever `clear…` it finds first. Exactly
 * one module is allowed to clear each store, and nothing but that module may reach
 * past it.
 */
describe('sign-out ownership', () => {
  const SRC = fileURLToPath(new URL('../..', import.meta.url));

  function sourceFiles(): string[] {
    return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .map((entry) => entry.replace(/\\/g, '/'))
      .filter((entry) => /\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx'));
  }

  it('has exactly one place that ends every credential together', () => {
    // The *call*, not the definition or the import: `customerClient` owns the
    // store, and this module owns ending it.
    const callers = sourceFiles().filter((entry) =>
      readFileSync(`${SRC}/${entry}`, 'utf8').includes('clearStoredCustomerSession();')
    );

    expect(callers).toEqual(['lib/auth/browserSignOut.ts']);
  });

  it('clears no Supabase session anywhere', () => {
    // Prose may still explain what this replaced. A *call* may not exist: the
    // Supabase store is not this app's to clear, and reaching for it is how a
    // sign-out ends up clearing the wrong one.
    const callers = sourceFiles().filter((entry) =>
      readFileSync(`${SRC}/${entry}`, 'utf8').includes('clearSupabaseSession()'),
    );

    expect(callers).toEqual([]);
  });

  it('keeps the owner synchronous, so it finishes before any navigation', () => {
    const owner = readFileSync(`${SRC}/lib/auth/browserSignOut.ts`, 'utf8');
    // A `Promise` return would let a caller navigate first and leave the token on
    // disk — the race this whole change exists to close.
    expect(owner).toContain('export function signOutOfBrowser(): void {');
  });
});
