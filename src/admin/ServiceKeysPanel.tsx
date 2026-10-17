'use client';

// ============================================================================
// LUXEDGE — Service & API keys (Admin → Settings)
//
// The Settings page never had a UI for the service credentials the server
// already knows how to read. The registry in `lib/settings/registry.ts` is the
// single source of truth for what exists, and `/api/admin/settings` reads and
// writes it — this component is the missing screen.
//
// One request opens it. The Stripe badge beside the fields used to arrive from
// `/api/admin/payments` in a second authenticated read, which fetched the `stripe`
// category this screen already holds; the settings read answers the badge now, from
// the row in hand, and `stripe` is the only one of its fields sent. Writes are
// unchanged, and the connection test still goes to the route that owns it.
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
  /**
   * Categories the WordPress store could not answer for, with the reason.
   *
   * An empty `settings` object means two very different things, and the badge used to
   * collapse them into "Not configured". This is what separates them: a category in
   * here was *not read*, so its badge must say so rather than asking the owner to
   * paste a key that is already saved.
   */
  unavailable?: Record<string, { message: string; status: number | null }>;
  /** The Stripe badge, answered by the same read. Null when the store could not say. */
  stripe?: StripeProviderStatus | null;
}

/** The Omnisend connection states, as `/api/omnisend/status` names them. */
type OmnisendState =
  | 'connected'
  | 'configured_unverified'
  | 'invalid_key'
  | 'insufficient_permissions'
  | 'provider_unavailable'
  | 'wordpress_unavailable'
  | 'deployment_unconfigured'
  | 'missing';

interface OmnisendStatusPayload {
  state: OmnisendState;
  connected: boolean;
  configured: boolean;
  source: 'wordpress' | 'env' | null;
  message: string;
  action: string | null;
  retryable: boolean;
  brandID: string | null;
  accountName: string | null;
  website: string | null;
  domainVerified: boolean | null;
  contactsCount: number | null;
  subscribedCount: number | null;
  unsubscribedCount: number | null;
  campaignsDraftCount: number | null;
  lastChecked: string;
}

const OMNISEND_TONE: Record<OmnisendState, { label: string; className: string }> = {
  connected: { label: 'Connected', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200' },
  configured_unverified: { label: 'Configured — verification pending', className: 'bg-amber-100 text-amber-900 border border-amber-300' },
  invalid_key: { label: 'Invalid key', className: 'bg-rose-100 text-rose-800 border border-rose-200' },
  insufficient_permissions: { label: 'Insufficient permissions', className: 'bg-rose-100 text-rose-800 border border-rose-200' },
  provider_unavailable: { label: 'Provider temporarily unavailable', className: 'bg-amber-100 text-amber-900 border border-amber-300' },
  wordpress_unavailable: { label: 'WordPress settings unavailable', className: 'bg-amber-100 text-amber-900 border border-amber-300' },
  deployment_unconfigured: { label: 'Deployment not configured', className: 'bg-rose-100 text-rose-800 border border-rose-200' },
  missing: { label: 'Configuration missing', className: 'bg-gray-100 text-gray-600 border border-gray-200' },
};

/**
 * The Stripe facts this screen shows, as the settings read sends them.
 *
 * Deliberately narrow: `mode`, the last test, and the first blocker. No key material,
 * not even the masked form the payments screen shows — a badge has no use for it.
 */
interface StripeProviderStatus {
  mode?: 'sandbox' | 'production';
  isConfigured?: boolean;
  enabled?: boolean;
  ready?: boolean;
  stageLabel?: string;
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
  stripe?: StripeProviderStatus | null,
  unavailableMessage?: string
): { label: string; className: string } {
  // Checked before anything else: if the store did not answer, this category has no
  // verdict at all — and "Not configured" is a verdict.
  if (unavailableMessage) {
    return {
      label: 'WordPress settings unavailable',
      className: 'bg-amber-100 text-amber-900 border border-amber-300',
    };
  }

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
      return stripe?.ready
        ? { label: 'Live ready', className: 'bg-emerald-100 text-emerald-800 border border-emerald-200' }
        : { label: 'Live readiness unconfirmed', className: 'bg-amber-100 text-amber-900 border border-amber-300 font-semibold' };
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
  const [googleConnecting, setGoogleConnecting] = useState(false);
  const [googleTesting, setGoogleTesting] = useState(false);
  const [googleNote, setGoogleNote] = useState('');
  const [testNote, setTestNote] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);
  const [omnisend, setOmnisend] = useState<OmnisendStatusPayload | null>(null);
  const [omnisendBusy, setOmnisendBusy] = useState(false);
  const [omnisendNote, setOmnisendNote] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  }, []);

  /**
   * The provider's own answer, asked separately from the settings read.
   *
   * Settings can say "a key is stored"; only Omnisend can say the key authenticates.
   * Keeping the two apart is what lets this screen distinguish "saved, unverified"
   * from "saved and working", and `fresh` is what makes a just-saved key judged on
   * its own behalf rather than on a cached negative.
   */
  const loadOmnisend = useCallback(async (fresh = false) => {
    setOmnisendBusy(true);
    try {
      const res = await fetch(`/api/omnisend/status${fresh ? '?fresh=1' : ''}`, {
        headers: authHeaders(),
        cache: 'no-store',
      });
      const body = (await res.json().catch(() => null)) as (OmnisendStatusPayload & { error?: string }) | null;
      if (!res.ok || !body || !body.state) {
        setOmnisendNote({ kind: 'err', text: body?.error || `Could not read the Omnisend connection (HTTP ${res.status}).` });
        return;
      }
      setOmnisend(body);
      if (fresh) {
        setOmnisendNote(
          body.connected
            ? { kind: 'ok', text: 'Connection verified against Omnisend.' }
            : { kind: body.state === 'missing' ? 'warn' : 'err', text: body.message },
        );
      }
    } catch (err) {
      setOmnisendNote({ kind: 'err', text: (err as Error).message || 'Could not read the Omnisend connection.' });
    } finally {
      setOmnisendBusy(false);
    }
  }, [authHeaders]);

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
      setStripe(payload.stripe ?? null);
      setEdits({});
      // One extra request, and only for the card whose state a settings read cannot
      // answer on its own.
      void loadOmnisend();
    } catch (err) {
      setLoadError((err as Error).message || 'Could not load settings.');
    } finally {
      setLoading(false);
    }
  }, [authHeaders, loadOmnisend]);

  useEffect(() => {
    void load();
  }, [load]);

  const connectGoogle = async (searchConsoleOnly = false) => {
    setGoogleConnecting(true);
    setNote(null);
    try {
      const response = await fetch(`/api/admin/google-auth${searchConsoleOnly ? '?service=search-console' : ''}`, { headers: authHeaders(), credentials: 'same-origin' });
      const body = await response.json() as { authUrl?: string; error?: string };
      if (!response.ok || !body.authUrl) {
        setNote({ kind: 'err', text: body.error || 'Google authorization could not start.' });
        return;
      }
      const target = new URL(body.authUrl);
      if (target.origin !== 'https://accounts.google.com') throw new Error('Unexpected Google authorization URL.');
      window.location.assign(target.toString());
    } catch {
      setNote({ kind: 'err', text: 'Google authorization could not start.' });
    } finally { setGoogleConnecting(false); }
  };

  const testSearchConsole = async () => {
    setGoogleTesting(true);
    setGoogleNote('');
    try {
      const response = await fetch('/api/admin/search-console?days=28', { headers: authHeaders(), cache: 'no-store' });
      const body = await response.json() as { message?: string; error?: string };
      setGoogleNote(response.ok ? body.message || 'Search Console connection verified.' : body.error || 'Search Console could not be read.');
    } catch { setGoogleNote('Search Console could not be read. Try again.'); }
    finally { setGoogleTesting(false); }
  };

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
      const body = (await res.json().catch(() => ({}))) as { error?: string; saved?: number; verified?: boolean };
      if (!res.ok) {
        setNote({ kind: 'err', text: body.error || `Save failed (HTTP ${res.status}).` });
        return;
      }
      // The route reads the category back before answering, so `verified` is the
      // difference between "the POST was accepted" and "WordPress holds this value".
      setNote({
        kind: body.verified === false ? 'err' : 'ok',
        text:
          body.verified === false
            ? 'Saved, but the value could not be confirmed. Reload and check the badge before relying on it.'
            : `Saved ${body.saved ?? Object.keys(payload).length} field(s) and confirmed by reading it back.`,
      });
      // A full reload, because the badge beside these fields is part of the same read.
      await load();
      if (categoryId === 'omnisend') await loadOmnisend(true);
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
      const body = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        message?: string;
        error?: string;
        stripe?: StripeProviderStatus;
      };
      // The test just changed what the badge says, and the route answers with the
      // updated one — so refreshing it is not a second request.
      if (body.stripe) setStripe(body.stripe);
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
        const unavailableMessage = data?.unavailable?.[category.id]?.message;
        const status = getCategoryStatus(category.id, sources, values, stripe, unavailableMessage);

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

            {category.id === 'google_oauth' && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" disabled={googleConnecting} onClick={() => void connectGoogle()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-gray-800 text-white disabled:opacity-50">
                  {googleConnecting ? 'Opening Google…' : 'Authorize Google Search Console & AdSense'}
                </button>
                <button type="button" disabled={googleConnecting} onClick={() => void connectGoogle(true)} className="px-3 py-2 text-sm rounded-lg border border-blue-200 text-blue-700 disabled:opacity-50">
                  Connect Search Console only
                </button>
                <button type="button" disabled={googleTesting} onClick={() => void testSearchConsole()} className="px-3 py-2 text-sm rounded-lg border border-gray-300 disabled:opacity-50">
                  {googleTesting ? 'Checking Google…' : 'Test Search Console'}
                </button>
                {googleNote && <p role="status" className="w-full text-sm text-gray-700">{googleNote}</p>}
              </div>
            )}

            {category.id === 'omnisend' && (
              <div className="mt-3.5 p-3 rounded-lg border border-emerald-100 bg-emerald-50/50">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                        omnisend ? OMNISEND_TONE[omnisend.state].className : 'bg-gray-100 text-gray-600 border border-gray-200'
                      }`}
                    >
                      {omnisend ? OMNISEND_TONE[omnisend.state].label : omnisendBusy ? 'Checking…' : 'Not checked'}
                    </span>
                    {omnisend?.source && (
                      <span className="text-[11px] text-gray-500">
                        key from {omnisend.source === 'wordpress' ? 'WordPress settings' : 'Worker secret'}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void loadOmnisend(true)}
                      disabled={omnisendBusy}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold border border-emerald-300 text-emerald-800 bg-white hover:bg-emerald-50 disabled:opacity-50"
                    >
                      {omnisendBusy ? 'Testing…' : 'Test connection'}
                    </button>
                    <a
                      href="https://app.omnisend.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-emerald-700 underline"
                    >
                      Omnisend portal
                    </a>
                  </div>
                </div>

                <p className="text-xs text-gray-700 mt-2">{omnisend?.message || 'Checking the saved key with Omnisend…'}</p>
                {omnisend?.action && <p className="text-xs text-amber-800 mt-1">Next: {omnisend.action}</p>}
                {omnisendNote && (
                  <p
                    role="status"
                    className={`text-xs mt-1 ${omnisendNote.kind === 'ok' ? 'text-emerald-700' : omnisendNote.kind === 'warn' ? 'text-amber-800' : 'text-red-600'}`}
                  >
                    {omnisendNote.text}
                  </p>
                )}

                {omnisend?.connected && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs mt-2.5">
                    <div>
                      <span className="text-gray-500 block text-[11px]">Account</span>
                      <span className="font-semibold text-gray-800">{omnisend.accountName ?? 'Not available'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[11px]">Brand ID</span>
                      <span className="font-mono text-[11px] text-gray-700 break-all">{omnisend.brandID ?? 'Not available'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[11px]">Contacts</span>
                      <span className="font-semibold text-gray-800">
                        {omnisend.contactsCount ?? 'Not available'}
                        {omnisend.subscribedCount !== null && omnisend.unsubscribedCount !== null && (
                          <span className="font-normal text-gray-500">
                            {' '}({omnisend.subscribedCount} subscribed · {omnisend.unsubscribedCount} unsubscribed)
                          </span>
                        )}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[11px]">Sending domain</span>
                      <span className={`font-semibold ${omnisend.domainVerified ? 'text-emerald-700' : 'text-amber-800'}`}>
                        {omnisend.domainVerified === null ? 'Not available' : omnisend.domainVerified ? 'Verified' : 'Not verified'}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[11px]">Campaign drafts</span>
                      <span className="font-semibold text-gray-800">{omnisend.campaignsDraftCount ?? 'Not available'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 block text-[11px]">Last checked</span>
                      <span className="text-gray-700">{relativeTime(omnisend.lastChecked) || 'just now'}</span>
                    </div>
                  </div>
                )}
              </div>
            )}

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
                      {stripe?.ready ? 'Ready' : stripe?.lastError || 'Readiness unconfirmed'}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/*
              Switches render above the credential fields and full width. A toggle is
              a decision, not a credential, and burying it in a two-column grid of
              key inputs made it read as one more value to paste.
            */}
            {category.fields.some((field) => field.type === 'toggle') && (
              <div className="mt-4 space-y-3">
                {category.fields
                  .filter((field) => field.type === 'toggle')
                  .map((field) => {
                    const compound = fieldKey(category.id, field.key);
                    const stored = values[field.key] ?? '';
                    const source = sources[field.key] ?? 'unset';
                    const on = (compound in edits ? edits[compound] : stored) === 'true';
                    const edited = compound in edits;

                    return (
                      <div
                        key={field.key}
                        className={`rounded-lg border p-3 ${
                          on ? 'border-amber-300 bg-amber-50/70' : 'border-gray-200 bg-white'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-3 flex-wrap">
                          <div className="min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-bold text-gray-800">{field.label}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                                  on ? 'bg-amber-500 text-white' : 'bg-gray-200 text-gray-600'
                                }`}
                              >
                                {on ? 'ON' : 'OFF'}
                              </span>
                              {on && field.key === 'staging_simulator' && (
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide bg-rose-100 text-rose-700">
                                  STAGING ONLY
                                </span>
                              )}
                            </div>
                            {field.hint && (
                              <p className="text-[11px] text-gray-500 mt-1 max-w-2xl">{field.hint}</p>
                            )}
                            <p className="text-[11px] text-gray-400 mt-1">
                              {source === 'db'
                                ? 'Stored in WordPress settings'
                                : source === 'env'
                                  ? 'Set by the deployment (Cloudflare Worker variable)'
                                  : field.key === 'staging_simulator' ? 'Not set — staging defaults it on, every other origin refuses it' : 'Not configured'}
                              {edited ? ' · edited, press Save to apply' : ''}
                            </p>
                          </div>
                          <button
                            type="button"
                            role="switch"
                            aria-checked={on}
                            aria-label={field.label}
                            onClick={() => setEdit(category.id, field.key, on ? 'false' : 'true')}
                            className={`shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                              on ? 'bg-amber-500' : 'bg-gray-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                                on ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {category.fields.filter((field) => field.type !== 'toggle').map((field) => {
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
