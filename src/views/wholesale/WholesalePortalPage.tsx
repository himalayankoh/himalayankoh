'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useNavigate } from '@/lib/router-compat';
import {
  AlertCircle,
  Building2,
  ClipboardList,
  FileText,
  LayoutDashboard,
  Loader2,
  LogOut,
  Package,
  ShoppingCart,
  UserCog,
} from 'lucide-react';
import {
  clearWholesaleSession,
  getWholesaleSession,
  portalRequest,
  type PortalBuyerResponse,
  type PortalCatalogResponse,
  type PortalOrder,
  type PortalQuote,
} from '@/lib/wholesale/portalClient';
import PortalCatalogPanel from './PortalCatalogPanel';
import PortalQuotesOrdersPanel from './PortalQuotesOrdersPanel';

/**
 * The wholesale portal.
 *
 * ## One shell, several URLs
 *
 * The portal's tabs are real routes (`/wholesale/catalog`, `/wholesale/quote`, …) so a
 * buyer can bookmark or share them, and each route renders this shell with a
 * different `initialTab`. The data they all need — the buyer, the catalog, the
 * quotes, the orders — is loaded once here rather than per tab, so switching tabs is
 * instant and the portal cannot show two different versions of the same list.
 *
 * ## The draft survives a tab change
 *
 * A quote being assembled is kept in `sessionStorage`, not in component state: the
 * tabs are separate pages, so navigating to "Saved quotes" and back would otherwise
 * discard a half-built container. It lives for the browser session, which matches how
 * long a buyer is likely to be working on one.
 *
 * ## Nothing here decides who the buyer is
 *
 * Every request carries the stored token and the *server* answers with the identity.
 * The screen re-asks on load (`/api/wholesale/session`), so a suspended account loses
 * the portal on its next request rather than when the token happens to expire.
 */

export type PortalTab = 'dashboard' | 'catalog' | 'quote' | 'quotes' | 'orders' | 'account';

/** The tabs, in the order a buyer works through them. */
const TABS: Array<{ id: PortalTab; label: string; path: string; icon: typeof LayoutDashboard }> = [
  { id: 'dashboard', label: 'Dashboard', path: '/wholesale/portal', icon: LayoutDashboard },
  { id: 'catalog', label: 'Catalog', path: '/wholesale/catalog', icon: Package },
  { id: 'quote', label: 'Build a quote', path: '/wholesale/quote', icon: ShoppingCart },
  { id: 'quotes', label: 'My quotations', path: '/wholesale/quotes', icon: FileText },
  { id: 'orders', label: 'Orders', path: '/wholesale/orders', icon: ClipboardList },
  { id: 'account', label: 'Account', path: '/wholesale/account', icon: UserCog },
];

/** One product line in the draft quote. Either a unit count or a pallet count. */
export interface DraftLine {
  productRowId: number;
  name: string;
  wholesaleSku: string;
  units?: number;
  pallets?: number;
}

const DRAFT_KEY = 'hk_wholesale_draft';

function readDraft(): DraftLine[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.sessionStorage.getItem(DRAFT_KEY);
    const parsed = raw ? (JSON.parse(raw) as DraftLine[]) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeDraft(lines: DraftLine[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(DRAFT_KEY, JSON.stringify(lines));
  } catch {
    /* storage unavailable — the draft simply will not survive a tab change */
  }
}

/** The buyer's identity as the server last reported it. */
export interface BuyerFacts {
  accountId: number;
  ref: string;
  company: string;
  contactName: string;
  email: string;
  country: string;
  phone?: string | null;
  website?: string | null;
  businessType?: string | null;
  destinationCountry?: string | null;
  destinationPort?: string | null;
  paymentTerms?: string | null;
  status?: string;
  approvedAt?: string | null;
}

export default function WholesalePortalPage({ initialTab }: { initialTab: PortalTab }) {
  const navigate = useNavigate();
  const [tab, setTab] = useState<PortalTab>(initialTab);
  const [buyer, setBuyer] = useState<BuyerFacts | null>(null);
  const [notConfigured, setNotConfigured] = useState(false);
  const [problem, setProblem] = useState('');
  const [loading, setLoading] = useState(true);

  const [catalog, setCatalog] = useState<PortalCatalogResponse | null>(null);
  const [quotes, setQuotes] = useState<PortalQuote[]>([]);
  const [orders, setOrders] = useState<PortalOrder[]>([]);
  const [draft, setDraft] = useState<DraftLine[]>([]);

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setDraft(readDraft());
  }, []);

  const persistDraft = useCallback((lines: DraftLine[]) => {
    setDraft(lines);
    writeDraft(lines);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setProblem('');

    if (!getWholesaleSession()) {
      setLoading(false);
      setProblem('Sign in to your wholesale account to continue.');
      return;
    }

    const session = await portalRequest<PortalBuyerResponse>('/api/wholesale/session');
    if (!session.ok || !session.data?.authenticated) {
      setLoading(false);
      if (session.data && session.data.configured === false) setNotConfigured(true);
      setProblem(session.error || 'Your wholesale session is no longer valid.');
      return;
    }

    setBuyer((session.data.buyer as BuyerFacts) ?? null);

    const [catalogResult, quotesResult, ordersResult] = await Promise.all([
      portalRequest<PortalCatalogResponse>('/api/wholesale/catalog'),
      portalRequest<{ quotes: PortalQuote[] }>('/api/wholesale/quotes'),
      portalRequest<{ orders: PortalOrder[] }>('/api/wholesale/orders'),
    ]);

    if (catalogResult.ok && catalogResult.data) setCatalog(catalogResult.data);
    if (quotesResult.ok && quotesResult.data) setQuotes(quotesResult.data.quotes ?? []);
    if (ordersResult.ok && ordersResult.data) setOrders(ordersResult.data.orders ?? []);

    if (!catalogResult.ok) {
      setProblem(catalogResult.error || 'The wholesale catalog could not be read.');
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function signOut() {
    clearWholesaleSession();
    persistDraft([]);
    navigate('/wholesale/login', { replace: true });
  }

  const openQuotes = useMemo(
    () => quotes.filter((quote) => ['SUBMITTED', 'UNDER_REVIEW', 'QUOTED'].includes(quote.status)),
    [quotes]
  );

  if (notConfigured) {
    return (
      <PortalNotice
        title="The wholesale portal is not available yet"
        body="The portal has not been configured on this deployment. Please contact your account manager — your account and quotations are safe."
      />
    );
  }

  if (!loading && problem && !buyer) {
    const suspended = /not active|suspended/i.test(problem);
    return (
      <PortalNotice
        title={suspended ? 'Account not active' : 'Please sign in'}
        body={problem}
        action={suspended ? null : { href: '/wholesale/login', label: 'Go to sign-in' }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-warm-white">
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-10 md:py-14">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div>
              <p className="text-himalayan text-xs font-semibold tracking-widest uppercase mb-2">Wholesale portal</p>
              <h1 className="font-serif text-3xl md:text-4xl font-bold text-white mb-2">
                {buyer?.company || 'Your wholesale account'}
              </h1>
              <p className="text-white/65">
                {buyer ? `${buyer.contactName}${buyer.ref ? ` · ${buyer.ref}` : ''}` : 'Loading your account…'}
              </p>
            </div>
            <button
              type="button"
              onClick={signOut}
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-white/25 text-white rounded-full text-sm font-semibold hover:bg-white/10 transition-colors"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        </div>
      </div>

      <div className="border-b border-charcoal/10 bg-white sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 overflow-x-auto">
          <nav className="flex gap-1 py-2">
            {TABS.map((entry) => (
              <Link
                key={entry.id}
                href={entry.path}
                onClick={() => setTab(entry.id)}
                className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                  tab === entry.id ? 'bg-himalayan/10 text-himalayan' : 'text-charcoal-light hover:bg-charcoal/5'
                }`}
              >
                <entry.icon className="w-4 h-4" />
                {entry.label}
                {entry.id === 'quote' && draft.length ? (
                  <span className="ml-1 px-1.5 py-0.5 rounded-full bg-himalayan text-white text-[10px] font-bold">
                    {draft.length}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        {loading && !buyer ? (
          <div className="flex items-center gap-3 text-charcoal-light py-20 justify-center">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading your wholesale account…
          </div>
        ) : (
          <>
            {problem && buyer ? (
              <div
                role="alert"
                className="flex items-start gap-3 p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 mb-6"
              >
                <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                <p className="text-sm leading-relaxed">{problem}</p>
              </div>
            ) : null}

            {tab === 'dashboard' ? (
              <DashboardPanel
                buyer={buyer}
                catalogCount={catalog?.count ?? 0}
                openQuotes={openQuotes.length}
                orderCount={orders.length}
                draftLines={draft.length}
                quotes={quotes}
              />
            ) : null}

            {tab === 'catalog' || tab === 'quote' ? (
              <PortalCatalogPanel
                tab={tab}
                catalog={catalog}
                draft={draft}
                onDraftChange={persistDraft}
                buyer={buyer}
                onSubmitted={(quote) => {
                  setQuotes((current) => [quote, ...current]);
                  persistDraft([]);
                  navigate('/wholesale/quotes');
                }}
              />
            ) : null}

            {tab === 'quotes' || tab === 'orders' ? (
              <PortalQuotesOrdersPanel
                tab={tab}
                quotes={quotes}
                orders={orders}
                currency={catalog?.currency ?? 'USD'}
                onAccepted={(accepted) =>
                  setQuotes((current) => current.map((entry) => (entry.id === accepted.id ? accepted : entry)))
                }
              />
            ) : null}

            {tab === 'account' ? <AccountPanel buyer={buyer} onSignOut={signOut} /> : null}
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small panels                                                        */
/* ------------------------------------------------------------------ */

function PortalNotice({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: { href: string; label: string } | null;
}) {
  return (
    <div className="min-h-screen bg-warm-white flex items-center justify-center px-4 py-20">
      <div className="max-w-lg w-full bg-white rounded-3xl border border-charcoal/8 shadow-sm p-8 text-center">
        <div className="w-14 h-14 rounded-2xl bg-himalayan/10 flex items-center justify-center mx-auto mb-6">
          <Building2 className="w-7 h-7 text-himalayan" />
        </div>
        <h1 className="font-serif text-2xl font-bold text-charcoal mb-3">{title}</h1>
        <p className="text-charcoal-light leading-relaxed mb-6">{body}</p>
        {action ? (
          <Link
            href={action.href}
            className="inline-flex items-center justify-center px-6 py-3 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors"
          >
            {action.label}
          </Link>
        ) : null}
        <p className="text-sm text-charcoal-light mt-6">
          <Link href="/wholesale" className="text-himalayan font-semibold hover:underline">
            Back to wholesale
          </Link>
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="bg-white rounded-2xl border border-charcoal/8 p-5">
      <p className="text-xs uppercase tracking-widest text-charcoal-light mb-2">{label}</p>
      <p className="font-serif text-2xl font-bold text-charcoal">{value}</p>
      {hint ? <p className="text-xs text-charcoal-light mt-1">{hint}</p> : null}
    </div>
  );
}

function DashboardPanel({
  buyer,
  catalogCount,
  openQuotes,
  orderCount,
  draftLines,
  quotes,
}: {
  buyer: BuyerFacts | null;
  catalogCount: number;
  openQuotes: number;
  orderCount: number;
  draftLines: number;
  quotes: PortalQuote[];
}) {
  const latest = quotes[0] ?? null;

  return (
    <div className="space-y-8">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Stat label="Products available" value={catalogCount} hint="Wholesale catalog" />
        <Stat label="Open requests" value={openQuotes} hint="With our team or awaiting your decision" />
        <Stat label="Wholesale orders" value={orderCount} hint="On this account" />
        <Stat label="Lines in draft" value={draftLines} hint={draftLines ? 'Continue building your quote' : 'No quote in progress'} />
      </div>

      <div className="grid lg:grid-cols-[1.2fr_0.8fr] gap-8">
        <div className="bg-white rounded-3xl border border-charcoal/8 p-7">
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-4">Start a quotation</h2>
          <p className="text-charcoal-light leading-relaxed mb-6">
            Pick products from the wholesale catalog, set quantities in units or pallets, and see the cartons, pallets,
            kilos and container loading before you send it to us. We confirm freight and issue the firm quotation.
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/wholesale/catalog"
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-himalayan text-white rounded-full font-semibold hover:bg-himalayan-dark transition-colors"
            >
              <Package className="w-4 h-4" />
              Browse the catalog
            </Link>
            <Link
              href="/wholesale/quote"
              className="inline-flex items-center gap-2 px-5 py-2.5 border border-charcoal/15 rounded-full font-semibold text-charcoal hover:bg-charcoal/5 transition-colors"
            >
              <ShoppingCart className="w-4 h-4" />
              Build a quote
            </Link>
          </div>

          {latest ? (
            <div className="mt-7 pt-6 border-t border-charcoal/8">
              <p className="text-xs uppercase tracking-widest text-charcoal-light mb-2">Most recent request</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link href="/wholesale/quotes" className="font-semibold text-charcoal hover:text-himalayan">
                  {latest.reference || `Request ${latest.id}`}
                </Link>
                <span className="px-2.5 py-1 rounded-full bg-charcoal/5 text-charcoal-light text-xs font-semibold">
                  {latest.confidence.replace('_', ' ')}
                </span>
                {latest.totals.quotedTotal !== null ? (
                  <span className="text-sm text-charcoal-light">
                    Quoted {latest.currency} {latest.totals.quotedTotal.toLocaleString('en-US')}
                  </span>
                ) : (
                  <span className="text-sm text-charcoal-light">Awaiting our quotation</span>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <div className="bg-white rounded-3xl border border-charcoal/8 p-7">
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-4">Your account</h2>
          <dl className="space-y-3 text-sm">
            <Row label="Company" value={buyer?.company || '—'} />
            <Row label="Contact" value={buyer?.contactName || '—'} />
            <Row label="Account reference" value={buyer?.ref || '—'} />
            <Row label="Destination" value={[buyer?.destinationCountry, buyer?.destinationPort].filter(Boolean).join(' · ') || 'Not set'} />
            <Row label="Payment terms" value={buyer?.paymentTerms || 'Confirmed per order'} />
          </dl>
          <Link href="/wholesale/account" className="inline-block mt-6 text-himalayan font-semibold hover:underline text-sm">
            Account details →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-charcoal-light">{label}</dt>
      <dd className="text-charcoal font-medium text-right">{value}</dd>
    </div>
  );
}

function AccountPanel({ buyer, onSignOut }: { buyer: BuyerFacts | null; onSignOut: () => void }) {
  return (
    <div className="grid lg:grid-cols-2 gap-8">
      <div className="bg-white rounded-3xl border border-charcoal/8 p-7">
        <h2 className="font-serif text-xl font-semibold text-charcoal mb-5">Account details</h2>
        <dl className="space-y-4 text-sm">
          <Row label="Company" value={buyer?.company || '—'} />
          <Row label="Contact" value={buyer?.contactName || '—'} />
          <Row label="Email" value={buyer?.email || '—'} />
          <Row label="Phone" value={buyer?.phone || '—'} />
          <Row label="Country" value={buyer?.country || '—'} />
          <Row label="Website" value={buyer?.website || '—'} />
          <Row label="Business type" value={buyer?.businessType || '—'} />
          <Row label="Account reference" value={buyer?.ref || '—'} />
          <Row label="Approved" value={buyer?.approvedAt ? new Date(buyer.approvedAt).toLocaleDateString() : '—'} />
        </dl>
      </div>

      <div className="space-y-6">
        <div className="bg-white rounded-3xl border border-charcoal/8 p-7">
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-4">Shipment preferences</h2>
          <dl className="space-y-4 text-sm">
            <Row label="Destination country" value={buyer?.destinationCountry || 'Not set'} />
            <Row label="Destination port" value={buyer?.destinationPort || 'Not set'} />
            <Row label="Payment terms" value={buyer?.paymentTerms || 'Confirmed per order'} />
          </dl>
          <p className="text-sm text-charcoal-light mt-5 leading-relaxed">
            To change any of these, email your account manager — we keep the record here so your quotations and
            proforma invoices agree with it.
          </p>
        </div>

        <div className="bg-white rounded-3xl border border-charcoal/8 p-7">
          <h2 className="font-serif text-xl font-semibold text-charcoal mb-3">Session</h2>
          <p className="text-sm text-charcoal-light leading-relaxed mb-5">
            Signing out ends this browser’s wholesale session. Your quotations and orders stay on your account.
          </p>
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 px-5 py-2.5 border border-charcoal/15 rounded-full font-semibold text-charcoal hover:bg-charcoal/5 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}
