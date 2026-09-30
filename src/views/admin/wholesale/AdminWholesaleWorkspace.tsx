'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  BadgePercent,
  Boxes,
  Building2,
  ClipboardList,
  Coins,
  Container,
  FileText,
  History,
  Loader2,
  Package,
  Radar,
  Ship,
  SlidersHorizontal,
  Users,
  Warehouse,
  Anchor,
} from 'lucide-react';
import {
  fetchWholesaleConsole,
  type WholesaleOverview,
  type WholesaleWorkspace,
} from '@/lib/admin/wholesaleConsoleApi';
import { Notice, Panel } from './ui';
import {
  ApplicationsPanel,
  AccountsPanel,
  AuditPanel,
  OrdersPanel,
  OverviewPanel,
  QuotesPanel,
} from './BusinessPanels';
import {
  ContainerProfilesPanel,
  CostProfilesPanel,
  FreightRatesPanel,
  OriginsPanel,
  PortChargesPanel,
  ProductsPanel,
  SuppliersPanel,
} from './ConfigPanels';
import { ContainerQuotePanel, PalletCalculatorPanel } from './CalculatorPanel';
import ProfitPanel from './ProfitPanel';

/**
 * The wholesale workspace — one console destination, fourteen views inside it.
 *
 * ## One sidebar item, as asked
 *
 * The retail rail already lists twenty-odd screens; adding fourteen wholesale ones
 * would bury Products and Orders under a second business. So `Wholesale` is a single
 * rail entry, and this workspace owns its own tab set — the same shape the LeadOS and
 * Hermes screens already use.
 *
 * ## Loaded once, then kept honest
 *
 * Every tab reads the same snapshot taken on entry, and a write refetches it. That
 * matters more than it sounds: a freight rate added on one tab must appear in the
 * quote builder's dropdown immediately, or the owner will type it twice and wonder
 * which one is real.
 *
 * ## Retail is untouched
 *
 * Nothing here reads or writes a WooCommerce order, a customer, a cart or a retail
 * product price. The only retail fact a wholesale row holds is a product *reference*,
 * which is read-only from this side.
 */

type Tab =
  | 'overview'
  | 'applications'
  | 'accounts'
  | 'products'
  | 'pallet'
  | 'container'
  | 'quotes'
  | 'orders'
  | 'profit'
  | 'costs'
  | 'freight'
  | 'ports'
  | 'partners'
  | 'containers'
  | 'audit';

const TABS: Array<{ id: Tab; label: string; icon: typeof Package }> = [
  { id: 'overview', label: 'Overview', icon: Radar },
  { id: 'applications', label: 'Applications', icon: Users },
  { id: 'accounts', label: 'Wholesale accounts', icon: Building2 },
  { id: 'products', label: 'Products & pricing', icon: Package },
  { id: 'pallet', label: 'Pallet calculator', icon: Boxes },
  { id: 'container', label: 'Container & quote builder', icon: Container },
  { id: 'quotes', label: 'Quotations', icon: FileText },
  { id: 'orders', label: 'Orders', icon: ClipboardList },
  { id: 'profit', label: 'Margin & profit', icon: Coins },
  { id: 'costs', label: 'Cost profiles', icon: SlidersHorizontal },
  { id: 'freight', label: 'Ocean freight', icon: Ship },
  { id: 'ports', label: 'Ports & charges', icon: Anchor },
  { id: 'partners', label: 'Suppliers & origins', icon: Warehouse },
  { id: 'containers', label: 'Container profiles', icon: Container },
  { id: 'audit', label: 'Audit trail', icon: History },
];

export default function AdminWholesaleWorkspace() {
  const [workspace, setWorkspace] = useState<WholesaleWorkspace | null>(null);
  const [overview, setOverview] = useState<WholesaleOverview | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [focusQuoteId, setFocusQuoteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { workspace: data, overview: counts } = await fetchWholesaleConsole();
      setWorkspace(data);
      setOverview(counts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The wholesale workspace could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  const reload = useCallback(async () => {
    try {
      const { workspace: data, overview: counts } = await fetchWholesaleConsole();
      setWorkspace(data);
      setOverview(counts);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'The wholesale workspace could not be refreshed.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (loading && !workspace) {
    return (
      <div className="flex items-center gap-3 text-charcoal-light py-20 justify-center">
        <Loader2 className="w-5 h-5 animate-spin" />
        Loading the wholesale workspace…
      </div>
    );
  }

  if (!workspace) {
    return (
      <div className="space-y-4">
        <Panel title="Wholesale">
          <p className="text-sm text-charcoal-light mb-4">
            The wholesale workspace could not be read. Nothing has been changed.
          </p>
          <Notice kind="error">{error || 'No answer from the server.'}</Notice>
          <button
            type="button"
            onClick={() => void load()}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-full bg-himalayan text-white text-sm font-semibold"
          >
            Try again
          </button>
        </Panel>
      </div>
    );
  }

  const pendingApplications = workspace.applications.filter((row) => String(row.status ?? '') === 'PENDING').length;

  return (
    <div className="wholesale-workspace space-y-5 min-w-0">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-bold text-charcoal">Wholesale</h1>
          <p className="text-charcoal-light mt-1">
            B2B buyers, volume pricing and container planning — separate from the retail catalogue and its orders.
            {workspace.vocabulary.pluginVersion ? ` Plugin ${workspace.vocabulary.pluginVersion}.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="px-3 py-1.5 rounded-full bg-white border border-charcoal/10 text-charcoal-light">
            {workspace.products.length} wholesale products
          </span>
          <span className="px-3 py-1.5 rounded-full bg-white border border-charcoal/10 text-charcoal-light">
            {workspace.accounts.length} accounts
          </span>
          <span
            className={`px-3 py-1.5 rounded-full border ${
              pendingApplications ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-white border-charcoal/10 text-charcoal-light'
            }`}
          >
            {pendingApplications} application{pendingApplications === 1 ? '' : 's'} to review
          </span>
        </div>
      </div>

      {error ? <Notice kind="error">{error}</Notice> : null}

      {/*
        A table the plugin could not create is worth saying out loud: every screen
        below still renders, and the only other sign would be a write answering
        "the record could not be stored" with no reason.
      */}
      {workspace.vocabulary.missingTables.length ? (
        <Notice kind="error">
          The wholesale plugin is installed but could not create its
          {' '}
          {workspace.vocabulary.missingTables.join(', ')}
          {' '}
          store{workspace.vocabulary.missingTables.length === 1 ? '' : 's'} on this WordPress site
          {workspace.vocabulary.schemaError ? ` (${workspace.vocabulary.schemaError})` : ''}. Writes to those
          screens will fail until it is fixed — the retail shop is unaffected.
        </Notice>
      ) : null}

      <div className="bg-white rounded-xl border border-admin-line p-2">
        <nav aria-label="Wholesale sections" className="grid grid-cols-1 min-[375px]:grid-cols-2 xl:grid-cols-3 gap-1">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setTab(entry.id)}
              aria-pressed={tab === entry.id}
              className={`inline-flex items-center gap-2 px-3 py-2 min-h-10 rounded-lg text-sm text-left font-medium transition-colors ${
                tab === entry.id ? 'bg-himalayan-lighter text-himalayan-dark' : 'text-charcoal-light hover:bg-charcoal/5'
              }`}
            >
              <entry.icon className="w-4 h-4 shrink-0" />
              {entry.label}
            </button>
          ))}
        </nav>
      </div>

      {tab === 'overview' ? <OverviewPanel overview={overview} /> : null}

      {tab === 'applications' ? (
        <ApplicationsPanel applications={workspace.applications} reload={reload} />
      ) : null}

      {tab === 'accounts' ? <AccountsPanel accounts={workspace.accounts} reload={reload} /> : null}

      {tab === 'products' ? (
        <ProductsPanel
          workspace={{
            products: workspace.products,
            tiers: workspace.tiers,
            origins: workspace.origins,
            suppliers: workspace.suppliers,
          }}
          reload={reload}
        />
      ) : null}

      {tab === 'pallet' ? (
        <PalletCalculatorPanel
          workspace={{
            products: workspace.products,
            containerProfiles: workspace.containerProfiles,
            costProfiles: workspace.costProfiles,
            freightRates: workspace.freightRates,
          }}
        />
      ) : null}

      {tab === 'container' ? (
        <ContainerQuotePanel
          workspace={{
            products: workspace.products,
            containerProfiles: workspace.containerProfiles,
            costProfiles: workspace.costProfiles,
            freightRates: workspace.freightRates,
            quotes: workspace.quotes,
          }}
          accounts={workspace.accounts}
          focusQuoteId={focusQuoteId}
          onChanged={reload}
        />
      ) : null}

      {tab === 'quotes' ? (
        <QuotesPanel
          quotes={workspace.quotes}
          accounts={workspace.accounts}
          vocabulary={{ quoteStatuses: workspace.vocabulary.quoteStatuses }}
          reload={reload}
          onPrice={(quoteId) => {
            setFocusQuoteId(quoteId);
            setTab('container');
          }}
        />
      ) : null}

      {tab === 'orders' ? (
        <OrdersPanel
          orders={workspace.orders}
          accounts={workspace.accounts}
          quotes={workspace.quotes}
          vocabulary={{ orderStatuses: workspace.vocabulary.orderStatuses }}
          reload={reload}
        />
      ) : null}

      {tab === 'profit' ? <ProfitPanel orders={workspace.orders} /> : null}

      {tab === 'costs' ? (
        <CostProfilesPanel
          workspace={{
            costProfiles: workspace.costProfiles,
            origins: workspace.origins,
            suppliers: workspace.suppliers,
          }}
          reload={reload}
        />
      ) : null}

      {tab === 'freight' ? (
        <FreightRatesPanel rows={workspace.freightRates} reload={reload} provider={workspace.freightProvider} />
      ) : null}
      {tab === 'ports' ? <PortChargesPanel rows={workspace.portCharges} reload={reload} /> : null}

      {tab === 'partners' ? (
        <div className="wholesale-workspace space-y-5 min-w-0">
          <SuppliersPanel rows={workspace.suppliers} reload={reload} />
          <OriginsPanel rows={workspace.origins} reload={reload} />
        </div>
      ) : null}

      {tab === 'containers' ? <ContainerProfilesPanel rows={workspace.containerProfiles} reload={reload} /> : null}

      {tab === 'audit' ? <AuditPanel rows={workspace.audit} /> : null}

      {['quotes', 'orders'].includes(tab) && !workspace.quotes.length && !workspace.orders.length ? (
        <Panel title="Nothing commercial yet">
          <p className="text-sm text-charcoal-light">
            <BadgePercent className="w-4 h-4 inline mr-1 text-himalayan" />
            Wholesale quotations come from approved buyers in the portal, or from you in the container builder. Approve
            an application, then price a mix to create the first one.
          </p>
        </Panel>
      ) : null}
    </div>
  );
}
