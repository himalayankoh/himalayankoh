// ============================================================================
// HIMALAYAN KOH ADMIN — Gift Drop
//
// Manages the real $0 giveaway: campaign configuration, live inventory, and
// every claim. Actions persist server-side through /api/admin/gift-drop (admin JWT).
// Note: ClaimView retains petType/petName/petSize fields for DB compatibility
// with the legacy gift-drop claim form schema — do not remove these columns.
// ============================================================================
import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';
import { getAccessToken } from '../services/wordpressAdminAuth';

interface ClaimView {
  id: string;
  orderNumber: string;
  email: string;
  name: string;
  status: string;
  createdAt: string;
  address: { line1?: string; line2?: string; city?: string; state?: string; zip?: string; country?: string };
  petType: string;
  petName: string;
  petSize: string;
  petInterest: string;
  giftName: string;
  payment: string;
  isTest: boolean;
  emailSent: boolean;
  emailNote: string;
  tracking: { carrier?: string; number?: string } | null;
  totalCents?: number;
  marketingOptIn?: boolean;
}

interface CampaignView {
  title: string;
  message: string;
  giftName: string;
  giftValueCents: number;
  totalQuantity: number;
  active: boolean;
  startsAt: string | null;
  endsAt: string | null;
}

const STATUS_UI: Record<string, { label: string; chip: string }> = {
  pending: { label: 'Claimed', chip: 'bg-amber-100 text-amber-800' },
  processing: { label: 'Confirmed · Preparing', chip: 'bg-blue-100 text-blue-800' },
  shipped: { label: 'Shipped', chip: 'bg-sky-100 text-sky-800' },
  delivered: { label: 'Delivered', chip: 'bg-emerald-100 text-emerald-800' },
  cancelled: { label: 'Cancelled', chip: 'bg-gray-200 text-gray-600' },
};
const NEXT_LABEL: Record<string, string> = {
  pending: 'Confirm & prepare',
  processing: 'Mark shipped',
  shipped: 'Mark delivered',
};

const chip = (s: string) => {
  const c = STATUS_UI[s];
  return c ? `${c.chip} text-[11px] font-bold px-2 py-0.5 rounded-full capitalize` : 'bg-gray-100 text-gray-600 text-[11px] px-2 py-0.5 rounded-full capitalize';
};

export default function GiftDropAdmin() {
  const [campaign, setCampaign] = useState<CampaignView | null>(null);
  const [claims, setClaims] = useState<ClaimView[]>([]);
  const [remaining, setRemaining] = useState<number>(-1);
  const [loaded, setLoaded] = useState(false);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [showTests, setShowTests] = useState(true);
  const [trackingDraft, setTrackingDraft] = useState<Record<string, { carrier: string; number: string }>>({});
  const [cfgDraft, setCfgDraft] = useState<CampaignView | null>(null);

  const load = () => {
    const token = getAccessToken();
    if (!token) return;
    fetch('/api/admin/gift-drop', { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
      .then((d) => {
        setCampaign(d.campaign || null);
        setCfgDraft(d.campaign || null);
        setClaims(Array.isArray(d.claims) ? d.claims : []);
        setRemaining(typeof d.stats?.remaining === 'number' ? d.stats.remaining : -1);
      })
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        if (/401|403|JWT|unauthorized|auth/i.test(msg)) {
          setErr('auth-error');
        } else if (/404|not found|no campaign/i.test(msg)) {
          setErr('not-configured');
        } else {
          setErr(msg || 'Could not load Gift Drop. Please verify admin session.');
        }
      })
      .finally(() => setLoaded(true));
  };

  useEffect(load, []);

  const post = async (action: string, extra: Record<string, unknown> | CampaignView = {}) => {
    const token = getAccessToken();
    if (!token) return;
    setBusy(true);
    try {
      const r = await fetch('/api/admin/gift-drop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, ...extra }),
      });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'Request failed');
      load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const saveCfg = async () => {
    if (!cfgDraft) return;
    await post('campaign', { ...cfgDraft, totalQuantity: Math.max(Math.trunc(Number(cfgDraft.totalQuantity)) || 0, 0) });
  };

  const initDefaultCampaign = async () => {
    const defaultCampaign: CampaignView = {
      title: 'Himalayan Koh Welcome Gift Drop',
      message: 'Complimentary authentic Himalayan Pink Salt sample for our community.',
      giftName: 'Himalayan Pink Salt Sample Pouch',
      giftValueCents: 500,
      totalQuantity: 100,
      active: true,
      startsAt: new Date().toISOString(),
      endsAt: null,
    };
    setCfgDraft(defaultCampaign);
    await post('campaign', defaultCampaign);
  };

  const setField = (k: keyof CampaignView, v: string | number | boolean) =>
    setCfgDraft((c) => (c ? { ...c, [k]: v } : c));

  const live = claims.filter((c) => c.status !== 'cancelled' && c.status !== 'failed' && !c.isTest);
  const visible = showTests ? claims : claims.filter((c) => !c.isTest);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold text-gray-900">Gift Drop</h1>
          <p className="text-xs text-gray-500">
            Real $0 promotional giveaway — claims are verified promotional gift drops.
            No payment method is ever collected.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs">
          <button onClick={load} className="rounded-lg border border-gray-200 bg-white px-3 py-1.5 font-medium text-gray-700 hover:bg-gray-50">Refresh</button>
          {campaign && (
            <span className={`rounded-full px-3 py-1 font-bold ${campaign.active ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-500'}`}>
              {campaign.active ? '● Live' : '○ Paused'}
            </span>
          )}
        </div>
      </div>

      {!loaded && (
        <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
          Loading Gift Drop…
        </div>
      )}

      {loaded && err === 'auth-error' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-sm">
          <h3 className="font-semibold text-amber-900 mb-1">Admin session required</h3>
          <p className="text-amber-800">Gift Drop requires an active admin session. Sign in and return to this page.</p>
        </div>
      )}

      {loaded && err === 'not-configured' && (
        <div className="rounded-xl border border-gray-200 bg-white p-6 space-y-3 text-sm">
          <h3 className="font-semibold text-gray-900">No Gift Drop campaign configured</h3>
          <p className="text-gray-600">Create a campaign to start accepting gift claim requests. No campaign row exists in the database yet.</p>
          <button
            onClick={initDefaultCampaign}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium"
          >
            Create Default Campaign
          </button>
        </div>
      )}

      {loaded && err && err !== 'auth-error' && err !== 'not-configured' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-xs text-red-800 flex items-center justify-between">
          <span>{err}</span>
          <button onClick={() => setErr('')} className="text-red-600 hover:underline">Dismiss</button>
        </div>
      )}

      {/* Campaign settings */}
      <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-bold text-gray-900">Active Campaign Settings</h2>
        {campaign && cfgDraft && (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-semibold text-gray-600">
              Campaign title
              <input className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm" value={cfgDraft.title} onChange={(e) => setField('title', e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Gift description (shown on the landing page)
              <input className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm" value={cfgDraft.giftName} onChange={(e) => setField('giftName', e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Total real gifts
              <input type="number" min={0} className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm" value={cfgDraft.totalQuantity} onChange={(e) => setField('totalQuantity', e.target.value)} />
            </label>
            <label className="block text-xs font-semibold text-gray-600">
              Gift value (cents, for reporting)
              <input type="number" min={0} className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm" value={cfgDraft.giftValueCents} onChange={(e) => setField('giftValueCents', e.target.value)} />
            </label>
            <div className="sm:col-span-2">
              <label className="block text-xs font-semibold text-gray-600">
                Message
                <textarea className="mt-1 w-full rounded-lg border border-gray-200 px-2.5 py-2 text-sm" rows={2} value={cfgDraft.message} onChange={(e) => setField('message', e.target.value)} />
              </label>
            </div>
            <div className="flex flex-wrap items-end gap-4">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-gray-700">
                <input type="checkbox" className="h-4 w-4 accent-emerald-600" checked={cfgDraft.active} onChange={(e) => setField('active', e.target.checked)} />
                Accepting claims (active)
              </label>
              <button onClick={saveCfg} disabled={busy} className="rounded-lg bg-gray-900 px-4 py-2 text-xs font-bold text-white hover:bg-gray-700 disabled:opacity-50">
                Save campaign
              </button>
            </div>
          </div>
        )}
        {loaded && !campaign && (
          <div className="mt-3 rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500 space-y-3">
            <p>No active Gift Drop campaign configured yet.</p>
            <button
              onClick={initDefaultCampaign}
              disabled={busy}
              className="px-4 py-2 bg-[#1b1f27] hover:bg-black text-white text-xs font-semibold rounded-lg shadow-sm transition-colors"
            >
              Initialize Default Gift Drop Campaign
            </button>
          </div>
        )}
      </div>

      {/* Inventory + claims */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-sm">
          {campaign ? (
            <>
              <span className="rounded-xl bg-gray-900 px-3 py-1.5 font-black text-white">{live.length}<span className="font-medium text-gray-300"> claimed</span></span>
              <span className="rounded-xl bg-emerald-50 px-3 py-1.5 font-black text-emerald-700">{remaining >= 0 ? remaining : '…'}<span className="font-medium text-emerald-500"> real gifts left</span></span>
              <span className="text-xs text-gray-400">of {campaign.totalQuantity ?? 0} total</span>
            </>
          ) : (
            <span className="text-xs text-gray-400">No campaign configured</span>
          )}
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-gray-500">
          <input type="checkbox" className="h-4 w-4 accent-amber-500" checked={showTests} onChange={(e) => setShowTests(e.target.checked)} />
          Show TEST claims
        </label>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {visible.map((c) => (
          <div key={c.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-gray-900">{c.name} <span className="font-mono text-[10px] font-normal text-gray-400">#{c.orderNumber}</span></p>
                <p className="truncate text-xs text-gray-500">{c.email}</p>
              </div>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${c.isTest ? 'bg-orange-100 text-orange-700' : chip(c.status)}`}>{c.isTest ? 'TEST' : STATUS_UI[c.status]?.label || c.status}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-gray-500">
              <span>🎁 {(c.giftName || '').slice(0, 32)}</span>
              <span>🏷️ {c.petType || c.giftName || 'Gift Item'}</span>
              <span className="col-span-2">📍 {[c.address.line1, c.address.city, c.address.zip].filter(Boolean).join(', ')}</span>
              <span className="col-span-2">💵 {c.payment} · ${Number(c.totalCents ?? 0) / 100}</span>
            </div>
            <GiftActions claim={c} busy={busy} post={post} trackingDraft={trackingDraft} setTrackingDraft={setTrackingDraft} />
          </div>
        ))}
        {loaded && !visible.length && <p className="rounded-xl border border-dashed border-gray-200 p-6 text-center text-sm text-gray-400">No gift-drop claims yet.</p>}
      </div>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm lg:block">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-gray-100 text-[10px] uppercase tracking-wider text-gray-400">
              <th className="px-3 py-2.5">Customer</th>
              <th className="px-3 py-2.5">Gift Details</th>
              <th className="px-3 py-2.5">Gift Item</th>
              <th className="px-3 py-2.5">Ship to</th>
              <th className="px-3 py-2.5">Status</th>
              <th className="px-3 py-2.5">Claimed</th>
              <th className="px-3 py-2.5">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((c) => (
              <tr key={c.id} className="border-b border-gray-50 align-top">
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-gray-800">{c.name}{c.isTest && <span className="ml-1.5 rounded bg-orange-100 px-1 py-0.5 text-[9px] font-black text-orange-700">TEST</span>}</p>
                  <p className="text-gray-400">{c.email}</p>
                  <p className="font-mono text-[10px] text-gray-300">#{c.orderNumber}</p>
                </td>
                <td className="px-3 py-2.5">
                  <p className="capitalize text-gray-700">{c.giftName || c.petType || 'Sample Gift'}</p>
                  <p className="text-gray-400">{[c.petSize, c.petInterest].filter(Boolean).join(' · ')}</p>
                </td>
                <td className="max-w-[180px] px-3 py-2.5">
                  <p className="text-gray-700">{c.giftName || 'Complimentary gift'}</p>
                  <p className="text-[10px] text-emerald-600">${Number(c.totalCents ?? 0) / 100} · {c.payment}</p>
                </td>
                <td className="max-w-[190px] px-3 py-2.5 text-gray-500">
                  {c.address.line1}{c.address.line2 ? `, ${c.address.line2}` : ''}, {c.address.city} {c.address.state} {c.address.zip}
                </td>
                <td className="px-3 py-2.5"><span className={chip(c.status)}>{STATUS_UI[c.status]?.label || c.status}</span></td>
                <td className="px-3 py-2.5 text-gray-400">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="px-3 py-2.5">
                  <GiftActions claim={c} busy={busy} post={post} trackingDraft={trackingDraft} setTrackingDraft={setTrackingDraft} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function GiftActions({
  claim,
  busy,
  post,
  trackingDraft,
  setTrackingDraft,
}: {
  claim: ClaimView;
  busy: boolean;
  post: (a: string, e?: Record<string, unknown>) => Promise<void>;
  trackingDraft: Record<string, { carrier: string; number: string }>;
  setTrackingDraft: Dispatch<SetStateAction<Record<string, { carrier: string; number: string }>>>;
}) {
  const td = trackingDraft[claim.id] || { carrier: '', number: '' };
  const setTd = (patch: Partial<{ carrier: string; number: string }>) =>
    setTrackingDraft((m) => ({ ...m, [claim.id]: { ...td, ...patch } }));
  const next = NEXT_LABEL[claim.status];
  if (claim.status === 'cancelled' || claim.status === 'delivered') {
    return (
      <div className="flex flex-wrap items-center gap-2 pt-1.5 text-[10px] text-gray-400">
        {claim.tracking?.number && <span>Tracking: {claim.tracking.carrier ? `${claim.tracking.carrier} · ` : ''}{claim.tracking.number}</span>}
        {claim.status === 'delivered' && <span className="font-semibold text-emerald-600">Done ✓</span>}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5 pt-2">
      {next && (
        <button
          disabled={busy}
          onClick={() => post('update-status', { id: claim.id, status: claim.status === 'pending' ? 'processing' : claim.status === 'processing' ? 'shipped' : 'delivered' })}
          className="rounded-lg bg-blue-600 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {next}
        </button>
      )}
      {claim.status === 'pending' && (
        <button
          disabled={busy}
          onClick={() => { if (window.confirm(`Cancel claim ${claim.orderNumber}? Its gift slot goes back to the pool.`)) post('cancel', { id: claim.id }); }}
          className="rounded-lg border border-gray-200 px-2.5 py-1.5 text-[11px] font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50"
        >
          Cancel
        </button>
      )}
      <div className="flex items-center gap-1">
        <input placeholder="Carrier" value={td.carrier} onChange={(e) => setTd({ carrier: e.target.value })} className="w-20 rounded-md border border-gray-200 px-1.5 py-1 text-[11px]" />
        <input placeholder="Tracking #" value={td.number} onChange={(e) => setTd({ number: e.target.value })} className="w-28 rounded-md border border-gray-200 px-1.5 py-1 text-[11px]" />
        <button
          disabled={busy || !td.number}
          onClick={() => post('tracking', { id: claim.id, carrier: td.carrier, number: td.number })}
          className="rounded-lg bg-gray-800 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-gray-700 disabled:opacity-40"
        >
          Save
        </button>
      </div>
    </div>
  );
}
