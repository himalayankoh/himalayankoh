'use client';

// ============================================================================
// LUXEDGE — Service & API keys (Admin → Settings)
//
// The Settings page never had a UI for the service credentials the server
// already knows how to read. The registry in `lib/settings/registry.ts` is the
// single source of truth for what exists, and `/api/admin/settings` reads and
// writes it — this component is the missing screen.
//
// What the fields do:
//   * a secret field is never sent to the browser once stored. The input starts
//     empty with the saved state shown as a placeholder, so typing replaces the
//     value and leaving it alone changes nothing.
//   * only fields the owner actually touched are posted, so opening this screen
//     and pressing Save elsewhere can never copy an environment value into the
//     database or wipe a stored one.
//   * Stripe gets a Test connection button. It calls the server, which reads the
//     key the server itself would use (`/api/admin/payments` action=test) — so
//     the test is the real path, not a browser-side guess.
// ============================================================================

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SETTINGS_REGISTRY, type SettingsCategory } from '../lib/settings/registry';
import { getAccessToken } from '../services/wordpressAdminAuth';

const MASKED_MARK = '\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022';

type Source = 'db' | 'env' | 'unset';

interface SettingsPayload {
  settings: Record<string, Record<string, string>>;
  sources: Record<string, Record<string, Source>>;
}

interface StripeProviderStatus {
  mode?: 'sandbox' | 'production';
  isConfigured?: boolean;
  lastTestAt?: string;
  lastTestOk?: boolean;
  lastError?: string;
}

const BADGE: Record<Source, { label: string; className: string }> = {
  db: { label: 'WordPress setting', className: 'bg-emerald-100 text-emerald-800' },
  env: { label: 'Cloudflare Worker secret', className: 'bg-blue-100 text-blue-800' },
  unset: { label: 'Not configured', className: 'bg-gray-100 text-gray-500' },
};

const LABEL = 'block text-xs font-semibold text-gray-600 mb-1';
const INPUT =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500';

function fieldKey(categoryId: string, key: string): string {
  return `${categoryId}\u0000${key}`;
}

function getCategoryStatus(
  categoryId: string,
  sources: Record<string, Source>,
  values: Record<string, string>,
  stripe?: StripeProviderStatus | null
): { label: string; className: string } {
  const sourceList = Object.values(sources);
  const anyConfigured = sourceList.some((s) => s !== 'unset');
  if (!anyConfigured) {
    return { label: 'Not configured', className: 'bg-gray-100 text-gray-600 border border-gray-200' };
  }

  if (categoryId === 'stripe') {
    if (stripe?.lastError) {
      return { label: 'Error', className: 'bg-rose-100 text-rose-800 border border-rose-200' };
    }
    const pk = values['publishable_key'] || '';
    if (pk.startsWith('pk_live_') || stripe?.mode === 'production') {
      return { label: 'Blocked (Live disabled)', className: 'bg-amber-100 text-amber-900 border border-amber-300 font-semibold' };
    }
    return { label: 'Test Sandbox', className: 'bg-sky-100 text-sky-800 border border-sky-200 font-semibold' };
  }

  return { label: 'Configured', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200' };
}

function relativeTime(iso?: string): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return '';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

export default function ServiceKeysPanel() {
  const [data, setData] = useState<SettingsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  /** `${category}\0${key}` → the exact string to save. Absent means "unchanged". */
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState('');
  const [note, setNote] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [stripe, setStripe] = useState<StripeProviderStatus | null>(null);
  const [testing, setTesting] = useState(false);
  const [testNote, setTestNote] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/admin/settings', { headers: authHeaders() });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        setLoadError(body.error || `Could not load settings (HTTP ${res.status}).`);
        return;
      }
      const payload = (await res.json()) as SettingsPayload;
      setData(payload);
      setEdits({});
    } catch (err) {
      setLoadError((err as Error).message || 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  const loadStripeStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/payments', { headers: authHeaders() });
      if (!res.ok) return;
      const body = (await res.json()) as { providers?: StripeProviderStatus[] };
      const found = body.providers?.find((p) => (p as { id?: string }).id === 'stripe');
      if (found) setStripe(found);
    } catch {
      /* the status strip is a convenience — the test button is the real check */
    }
  }, [authHeaders]);

  useEffect(() => {
    void load();
    void loadStripeStatus();
  }, [load, loadStripeStatus]);

  // Stripe first: it is the credential an owner most often comes here to set.
  const categories = useMemo<SettingsCategory[]>(() => {
    const all = SETTINGS_REGISTRY;
    const stripeCat = all.find((c) => c.id === 'stripe');
    return stripeCat ? [stripeCat, ...all.filter((c) => c.id !== 'stripe')] : all;
  }, []);

  const setEdit = (categoryId: string, key: string, value: string) => {
    setEdits((prev) => ({ ...prev, [fieldKey(categoryId, key)]: value }));
    setNote(null);
  };

  const clearField = (categoryId: string, key: string) => {
    // An empty string is how "the owner emptied this field" travels to the
    // server, which stores null rather than silently dropping the row.
    setEdit(categoryId, key, '');
  };

  const dirtyFor = (categoryId: string) =>
    Object.keys(edits).filter((k) => k.startsWith(`${categoryId}\u0000`)).length;

  const save = async (categoryId: string) => {
    const payload: Record<string, string> = {};
    for (const [compound, value] of Object.entries(edits)) {
      const [cat, key] = compound.split('\u0000');
      if (cat === categoryId) payload[key] = value;
    }
    if (Object.keys(payload).length === 0) return;

    setSaving(categoryId);
    setNote(null);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ category: categoryId, settings: payload }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string; saved?: number };
      if (!res.ok) {
        setNote({ kind: 'err', text: body.error || `Save failed (HTTP ${res.status}).` });
        return;
      }
      setNote({ kind: 'ok', text: `Saved ${body.saved ?? Object.keys(payload).length} field(s).` });
      await load();
      if (categoryId === 'stripe') await loadStripeStatus();
    } catch (err) {
      setNote({ kind: 'err', text: (err as Error).message || 'Save failed.' });
    } finally {
      setSaving('');
    }
  };

  const testStripe = async () => {
    setTesting(true);
    setTestNote(null);
    try {
      const res = await fetch('/api/admin/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ action: 'test', provider: 'stripe' }),
      });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string; error?: string };
      if (body.ok) {
        setTestNote({ kind: 'ok', text: body.message || 'Stripe connection verified.' });
      } else if (body.error && /live stripe keys are disabled/i.test(body.error)) {
        setTestNote({
          kind: 'warn',
          text: `${body.error} A live key is stored but live charging is switched off on this deployment — use a sk_test_ key to test, or allow live charging deliberately when you are ready to take real payments.`,
        });
      } else {
        setTestNote({ kind: 'err', text: body.error || 'Stripe rejected the request.' });
      }
    } catch (err) {
      setTestNote({ kind: 'err', text: (err as Error).message || 'Test failed.' });
    } finally {
      setTesting(false);
      void loadStripeStatus();
    }
  };

  if (loading) {
    return <p className="pt-5 text-sm text-gray-500">Loading service keys…</p>;
  }

  if (loadError) {
    return (
      <div className="pt-5">
        <p className="text-sm text-red-600">{loadError}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 text-white hover:bg-gray-900"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="pt-5 space-y-4">
      <p className="text-sm text-gray-500">
        These are the credentials the server uses. A secret is stored server-side and is never shown again once
        saved — the field starts empty with the saved state beside it, so leaving it alone changes nothing.
      </p>

      {note && (
        <p className={`text-sm ${note.kind === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}>{note.text}</p>
      )}

      {categories.map((category) => {
        const values = data?.settings[category.id] ?? {};
        const sources = data?.sources[category.id] ?? {};
        const dirty = dirtyFor(category.id);
        const isStripe = category.id === 'stripe';
        const status = getCategoryStatus(category.id, sources, values, stripe);

        return (
          <div key={category.id} className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-sm font-bold text-gray-800">{category.label}</h3>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${status.className}`}>
                    {status.label}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-1 max-w-2xl">{category.description}</p>
              </div>
              {category.docsHref && (
                <a
                  href={category.docsHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline"
                >
                  Where to find these keys
                </a>
              )}
            </div>

            {isStripe && (
              <div className="mt-3.5 p-3 rounded-lg border border-blue-100 bg-blue-50/60">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                  <div>
                    <span className="text-gray-500 block text-[11px]">Publishable Key:</span>
                    <span className="font-semibold text-gray-800">
                      {sources['publishable_key'] !== 'unset' ? (values['publishable_key']?.startsWith('pk_live_') ? 'Live key' : 'Test key') : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">Secret Key:</span>
                    <span className="font-semibold text-gray-800">
                      {sources['secret_key'] !== 'unset' ? 'Stored securely' : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">Webhook Secret:</span>
                    <span className="font-semibold text-gray-800">
                      {sources['webhook_secret'] !== 'unset' ? 'Stored securely' : 'Not set'}
                    </span>
                  </div>
                  <div>
                    <span className="text-gray-500 block text-[11px]">Charging Mode:</span>
                    <span className="font-semibold text-amber-900">
                      Live Disabled (Safety gate active)
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {category.fields.map((field) => {
                const compound = fieldKey(category.id, field.key);
                const stored = values[field.key] ?? '';
                const source = sources[field.key] ?? 'unset';
                const badge = BADGE[source];
                const edited = compound in edits;
                const isSecret = field.type === 'password';
                const configured = source !== 'unset';

                return (
                  <div key={field.key}>
                    <div className="flex items-center gap-2 mb-1">
                      <label className={LABEL} htmlFor={compound}>
                        {field.label}
                      </label>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge.className}`}>
                        {badge.label}
                      </span>
                    </div>
                    <input
                      id={compound}
                      className={INPUT}
                      type={isSecret ? 'password' : field.type === 'email' ? 'email' : 'text'}
                      autoComplete="off"
                      spellCheck={false}
                      value={isSecret ? (edited ? edits[compound] : '') : edited ? edits[compound] : stored}
                      placeholder={isSecret && configured ? `${MASKED_MARK} (saved — type to replace)` : field.placeholder}
                      onChange={(e) => setEdit(category.id, field.key, e.target.value)}
                    />
                    <div className="flex items-center gap-2 mt-1">
                      {field.hint && <p className="text-[11px] text-gray-400">{field.hint}</p>}
                      {isSecret && configured && (
                        <button
                          type="button"
                          onClick={() => clearField(category.id, field.key)}
                          className="text-[11px] font-semibold text-red-600 hover:text-red-800 shrink-0"
                        >
                          Clear
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex items-center gap-3 mt-4 flex-wrap">
              <button
                type="button"
                disabled={dirty === 0 || saving === category.id}
                onClick={() => void save(category.id)}
                className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-900 text-white hover:bg-black disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving === category.id ? 'Saving…' : dirty > 0 ? `Save ${dirty} change(s)` : 'Save'}
              </button>

              {isStripe && (
                <button
                  type="button"
                  disabled={testing}
                  onClick={() => void testStripe()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 bg-white text-gray-800 hover:bg-gray-100 disabled:opacity-50"
                >
                  {testing ? 'Testing…' : 'Test connection'}
                </button>
              )}

              {isStripe && stripe && (
                <span className="text-xs text-gray-500">
                  {stripe.lastTestAt
                    ? `Last test ${stripe.lastTestOk ? 'passed' : 'failed'} ${relativeTime(stripe.lastTestAt)}`
                    : 'Never tested from here'}
                  {stripe.lastError ? ` · ${stripe.lastError}` : ''}
                </span>
              )}
            </div>

            {isStripe && (
              <>
                {testNote && (
                  <p
                    className={`mt-3 text-sm ${
                      testNote.kind === 'ok'
                        ? 'text-emerald-700'
                        : testNote.kind === 'warn'
                          ? 'text-amber-700'
                          : 'text-red-600'
                    }`}
                  >
                    {testNote.text}
                  </p>
                )}
                <p className="mt-3 text-[11px] text-gray-400">
                  Test connection calls Stripe with the stored key and reads the account balance — it moves no money.
                  Test keys (<span className="font-mono">sk_test_…</span>) and test card{' '}
                  <span className="font-mono">4242 4242 4242 4242</span> are the safe way to exercise checkout. A live
                  key (<span className="font-mono">sk_live_…</span>) only charges when live charging is allowed on the
                  server; if it is switched off, checkout honestly reports payments as unavailable rather than failing
                  mid-order.
                </p>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
