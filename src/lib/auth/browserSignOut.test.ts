/**
 * Ending a session in the browser, end to end.
 *
 * These assertions are about *behaviour* — which keys survive a sign-out — because
 * the defect they cover was a behaviour, not a line of code: the console cleared
 * the Supabase keys and left the admin token in place, so `/login` restored the
 * session and carried the admin back into `/admin`.
 *
 * The environment is node, so the browser is built by hand below. The storages are
 * deliberately plain objects whose enumerable keys *are* the stored entries,
 * because that is what real localStorage looks like to `Object.keys` — and
 * `clearSupabaseSession` enumerates them.
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
import { signOutOfBrowser } from './browserSignOut';

const ADMIN_SESSION: SbSession = {
  accessToken: 'signed.admin.token',
  refreshToken: '',
  expiresAt: Date.now() + 3_600_000,
  user: { id: 'admin@himalayankoh.com', email: 'admin@himalayankoh.com', name: 'Admin', role: 'admin' },
};

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
    [SUPABASE_KEY]: 'customer.session.token',
    'unrelated-preference': 'keep me',
  });
  // Supabase splits a large session across chunked keys, which an
  // `endsWith('-auth-token')` filter misses.
  sessionStorageStub = storage({ [`${SUPABASE_KEY}.0`]: 'chunked' });

  vi.stubGlobal('window', {
    localStorage: localStorageStub,
    sessionStorage: sessionStorageStub,
    location: { hostname: 'preview.himalayankoh.com' },
  });
  vi.stubGlobal('document', {
    get cookie() {
      return `sb-other-auth-token=abc; ${SUPABASE_KEY}=xyz; theme=dark`;
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

    signOutOfBrowser();

    // The admin token is the credential the old handler left behind — a live one
    // means the very next page load restores the session.
    expect(localStorageStub.getItem(SESSION_STORAGE_KEY)).toBeNull();
    expect(readStoredSession()).toBeNull();
    expect(events).toContain('SIGNED_OUT');

    // …and the customer side, from both storages.
    expect(localStorageStub.getItem(SUPABASE_KEY)).toBeNull();
    expect(sessionStorageStub.getItem(`${SUPABASE_KEY}.0`)).toBeNull();
  });

  it('expires only the auth cookies, and leaves unrelated storage alone', () => {
    signOutOfBrowser();

    expect(localStorageStub.getItem('unrelated-preference')).toBe('keep me');
    expect(cookieWrites.length).toBeGreaterThan(0);
    expect(cookieWrites.every((write) => write.startsWith('sb-'))).toBe(true);
    expect(cookieWrites.some((write) => write.includes('expires=Thu, 01 Jan 1970'))).toBe(true);
  });
});

/**
 * One owner, enforced.
 *
 * `clearSupabaseSession` is not wrong — it is just half a sign-out, and the half
 * that is easy to reach for. Restricting its call sites to the owner is what stops
 * a new screen (or a well-meaning revert) from clearing one store and leaving the
 * other, which is the whole defect.
 */
describe('sign-out ownership', () => {
  const SRC = fileURLToPath(new URL('../..', import.meta.url));

  function sourceFiles(): string[] {
    return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
      .map((entry) => entry.replace(/\\/g, '/'))
      .filter((entry) => /\.tsx?$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx'));
  }

  it('has exactly one place that clears the customer credentials', () => {
    const callers = sourceFiles().filter((entry) =>
      readFileSync(`${SRC}/${entry}`, 'utf8').includes('clearSupabaseSession()')
    );
    expect(callers).toEqual(['lib/auth/browserSignOut.ts']);
  });

  it('keeps the owner synchronous, so it finishes before any navigation', () => {
    const owner = readFileSync(`${SRC}/lib/auth/browserSignOut.ts`, 'utf8');
    // A `Promise` return would let a caller navigate first and leave the token on
    // disk — the race this whole change exists to close.
    expect(owner).toContain('export function signOutOfBrowser(): void {');
  });
});
