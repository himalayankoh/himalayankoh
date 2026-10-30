// ============================================================================
// ADSENSE EARNINGS — REAL Google AdSense data in Luxedge Admin
//
// Reads /api/adsense/* (server-side, admin-auth) which calls the official
// AdSense Management API v2 and caches results. This is REAL Google data —
// never a page-view estimate. States are honest: not connected → Connect,
// token expired → Reconnect, API down → temporary unavailable, missing reports →
// No data. Payment balance/payouts are NOT exposed by the AdSense API, so we
// link to the Google Payments page instead of fabricating a balance.
// ============================================================================
import { useEffect, useState, useCallback } from 'react';
import { getAccessToken } from '../services/wordpressAdminAuth';
import { ArrowClockwise, LinkSimple, Megaphone, CheckCircle, Warning, SpinnerGap } from '@phosphor-icons/react';

import AdSenseReportCards, { type EarningsCache } from './AdSenseReportCards';

interface Status {
  connected: boolean;
  clientConfigured: boolean;
  publisherId: string;
  site: string;
  lastSync: string | null;
  message?: string;
}

const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString() : '—';

export default function AdSenseEarnings() {
  const [status, setStatus] = useState<Status | null>(null);
  const [cache, setCache] = useState<EarningsCache | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const api = useCallback(async (path: string, init?: RequestInit) => {
    const token = getAccessToken();
    const res = await fetch(path, {
      credentials: 'same-origin',
      ...init,
      headers: { ...(init?.headers || {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    });
    return res;
  }, []);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [sRes, eRes] = await Promise.all([api('/api/adsense/status'), api('/api/adsense/earnings')]);
      if (!sRes.ok) throw new Error(`AdSense status unavailable (HTTP ${sRes.status}).`);
      const statusBody = await sRes.json() as Status;
      setStatus(statusBody);
      const e = await eRes.json() as { data?: EarningsCache | null; error?: string };
      setCache(eRes.ok ? e.data ?? null : null);
      if (!eRes.ok) setError(e.error || statusBody.message || `AdSense reports unavailable (HTTP ${eRes.status}).`);
    } catch {
      setError('Google AdSense data temporarily unavailable.');
    } finally {
      setLoading(false);
    }
  }, [api]);

  useEffect(() => { void load(); }, [load]);

  const connect = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api('/api/admin/google-auth');
      const d = await res.json() as { authUrl?: string; error?: string };
      if (d.authUrl) {
        // Same-tab navigation, matching the Settings panel. The PKCE transaction
        // cookie is single-use: a new tab would let a second "Connect" overwrite
        // the cookie while the first Google consent is still pending, so the
        // callback would exchange a code against the wrong verifier and Google
        // would reject it (invalid_grant). Same-tab makes that race impossible.
        const target = new URL(d.authUrl);
        if (target.origin !== 'https://accounts.google.com') throw new Error('Unexpected Google authorization URL.');
        window.location.assign(target.toString());
        setNote('Opening Google authorization…');
      } else {
        setError(d.error || 'Could not start Google authorization.');
      }
    } catch {
      setError('Could not start Google authorization.');
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const res = await api('/api/adsense/earnings');
      const d = await res.json() as { connected?: boolean; data?: EarningsCache | null; message?: string; error?: string };
      if (res.ok && d.data) {
        setCache(d.data);
        setNote('Synced from Google AdSense.');
      } else if (d.error === 'not-connected') {
        setNote('Not connected yet — click "Connect Google AdSense" first.');
      } else {
        setError(d.message || d.error || 'Sync failed.');
      }
    } catch {
      setError('Google AdSense data temporarily unavailable.');
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      // Google authorization is shared with Search Console. Do not silently
      // revoke both integrations from an earnings-only panel.
      window.open('https://myaccount.google.com/connections', '_blank', 'noopener,noreferrer');
      setNote('Manage the shared Google authorization privately in Google Account. Revoking it also disconnects Search Console.');
    } catch {
      setError('Could not disconnect.');
    } finally {
      setBusy(false);
    }
  };

  const connected = !!status?.connected;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <p className="text-xs font-semibold text-gray-600 flex items-center gap-1.5">
          <Megaphone size={14} className="text-blue-600" />
          Real Google AdSense — actual Google data via the AdSense Management API
          {status?.lastSync && <span className="font-normal text-gray-400">· last synced {fmtTime(status.lastSync)}</span>}
        </p>
        <div className="flex items-center gap-1.5">
          <button onClick={sync} disabled={busy || !connected}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
            <ArrowClockwise size={13} className={busy ? 'animate-spin' : ''} /> Refresh earnings
          </button>
          {connected && (
            <a href="https://www.google.com/adsense/new/u/0/pub-5473713135927706/payments" target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors">
              <LinkSimple size={13} /> Open Google AdSense Payments
            </a>
          )}
        </div>
      </div>

      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-white p-6 text-center text-sm text-gray-500">
          <SpinnerGap size={16} className="inline animate-spin mr-1.5" />Loading AdSense data…
        </div>
      ) : (
        <>
          {error && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 flex items-start gap-2">
              <Warning size={16} className="mt-0.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {note && (
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3 text-sm text-blue-800 flex items-start gap-2">
              <CheckCircle size={16} className="mt-0.5 shrink-0" />
              <span>{note}</span>
            </div>
          )}

          {!status?.clientConfigured && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Google OAuth is not configured yet. The owner must set <code className="bg-amber-100 px-1 rounded">GOOGLE_OAUTH_CLIENT_ID</code> and{' '}
              <code className="bg-amber-100 px-1 rounded">GOOGLE_OAUTH_CLIENT_SECRET</code> as wrangler secrets, then this panel becomes connectable.
            </div>
          )}

          {!connected ? (
            <div className="rounded-xl border border-gray-200 bg-white p-5 text-center">
              <p className="text-sm font-semibold text-gray-700 mb-1">Connect Google AdSense</p>
              <p className="text-xs text-gray-400 mb-3">
                Authorize once with your Google account that owns <span className="font-medium text-gray-600">{status?.publisherId || 'pub-5473713135927706'}</span>.
                Refresh tokens are stored server-side and never reach the browser.
              </p>
              <button onClick={connect} disabled={busy || !status?.clientConfigured}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 transition-colors">
                {busy ? <SpinnerGap size={15} className="animate-spin" /> : <LinkSimple size={15} />} Connect Google AdSense
              </button>
            </div>
          ) : (
            <>
              {!cache ? (
                <div className="rounded-xl border border-gray-200 bg-white p-5 text-center text-sm text-gray-500">
                  No earnings synced yet — click "Refresh earnings".
                </div>
              ) : (
                <AdSenseReportCards cache={cache} />
              )}
              <div className="flex items-center justify-between flex-wrap gap-2 pt-1">
                <p className="text-[11px] text-gray-400">
                  Data source: Google AdSense · estimated earnings · {status?.site} · {status?.publisherId} · synced {fmtTime(cache?.syncedAt)}
                </p>
                <button onClick={disconnect} disabled={busy}
                  className="text-[11px] text-gray-400 hover:text-red-600 underline underline-offset-2 disabled:opacity-40">
                  Manage shared Google authorization
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
