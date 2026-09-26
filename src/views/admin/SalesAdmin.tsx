'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  CurrencyDollar,
  TrendUp,
  Receipt,
  ArrowClockwise,
  DownloadSimple,
  MagnifyingGlass,
  Plus,
  Trash,
  CheckCircle,
  Warning,
  Clock,
  CaretDown,
  CaretUp,
  BuildingOffice,
  ShoppingBag,
} from '@phosphor-icons/react';
import { getFreshAccessToken } from '../../services/wordpressAdminAuth';
import { getErrorMessage } from '../../lib/errors';
import type {
  SalesDashboardData,
  SalesPeriod,
  SalesChannel,
  ManualExpense,
  ExpenseCategory,
} from '../../lib/sales/types';
import { EXPENSE_CATEGORY_LABELS } from '../../lib/sales/types';

const PERIOD_LABELS: Record<SalesPeriod, string> = {
  today: 'Today',
  '7d': 'Last 7 Days',
  '30d': 'Last 30 Days',
  '90d': 'Last 90 Days',
  '12m': 'Last 12 Months',
  ytd: 'Year to Date',
  all: 'All Time',
};

const EXPENSE_STORAGE_KEY = 'hk_sales_manual_expenses_v1';

export default function SalesAdmin() {
  const [data, setData] = useState<SalesDashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<SalesPeriod>('30d');
  const [activeTab, setActiveTab] = useState<'overview' | 'orders' | 'reconciliation' | 'expenses' | 'reports'>('overview');
  const [channelFilter, setChannelFilter] = useState<SalesChannel>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [expandedOrder, setExpandedOrder] = useState<string | null>(null);

  // Manual Expenses state
  const [expenses, setExpenses] = useState<ManualExpense[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const saved = localStorage.getItem(EXPENSE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [showAddExpense, setShowAddExpense] = useState(false);
  const [newExpCategory, setNewExpCategory] = useState<ExpenseCategory>('shipping');
  const [newExpDesc, setNewExpDesc] = useState('');
  const [newExpAmount, setNewExpAmount] = useState('');
  const [newExpDate, setNewExpDate] = useState(() => new Date().toISOString().slice(0, 10));

  const saveExpenses = (newExpenses: ManualExpense[]) => {
    setExpenses(newExpenses);
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(EXPENSE_STORAGE_KEY, JSON.stringify(newExpenses));
      } catch {
        // Storage might fail if full
      }
    }
  };

  const handleAddExpense = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(newExpAmount);
    if (!amt || amt <= 0 || !newExpDesc.trim()) return;

    const newExp: ManualExpense = {
      id: `exp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      date: newExpDate,
      category: newExpCategory,
      description: newExpDesc.trim(),
      amount: amt,
      currency: 'USD',
      recurring: false,
      createdAt: new Date().toISOString(),
    };

    saveExpenses([newExp, ...expenses]);
    setNewExpDesc('');
    setNewExpAmount('');
    setShowAddExpense(false);
  };

  const handleDeleteExpense = (id: string) => {
    saveExpenses(expenses.filter(e => e.id !== id));
  };

  // Fetch dashboard data
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getFreshAccessToken();
      const headers: Record<string, string> = {};
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }

      const res = await fetch(`/api/admin/sales?period=${period}`, {
        headers,
        cache: 'no-store',
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}: Failed to fetch sales data`);
      }

      const result: SalesDashboardData = await res.json();
      setData(result);
    } catch (err) {
      setError(getErrorMessage(err, 'Failed to load sales information'));
    } finally {
      setLoading(false);
    }
  }, [period]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Filtered orders for table
  const filteredOrders = useMemo(() => {
    if (!data?.orders) return [];
    return data.orders.filter(order => {
      // Channel filter
      if (channelFilter !== 'all' && order.channel !== channelFilter) return false;
      // Status filter
      if (statusFilter !== 'all') {
        if (statusFilter === 'paid' && order.paymentStatus !== 'paid') return false;
        if (statusFilter === 'pending' && order.paymentStatus !== 'pending' && order.paymentStatus !== 'partially_paid') return false;
        if (statusFilter === 'refunded' && order.paymentStatus !== 'refunded') return false;
      }
      // Search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesNumber = order.orderNumber.toLowerCase().includes(q);
        const matchesCustomer = order.customerName.toLowerCase().includes(q);
        const matchesEmail = order.customerEmail.toLowerCase().includes(q);
        const matchesItems = order.items.some(it => it.productName.toLowerCase().includes(q) || (it.sku && it.sku.toLowerCase().includes(q)));
        return matchesNumber || matchesCustomer || matchesEmail || matchesItems;
      }
      return true;
    });
  }, [data?.orders, channelFilter, statusFilter, searchQuery]);

  // Expenses in current period
  const periodExpensesTotal = useMemo(() => {
    if (!data?.dateRange) return 0;
    const from = data.dateRange.from;
    const to = data.dateRange.to;
    return expenses
      .filter(e => e.date >= from && e.date <= to)
      .reduce((sum, e) => sum + e.amount, 0);
  }, [expenses, data?.dateRange]);

  // Adjusted Net Profit including client-side manual expenses
  const adjustedProfit = useMemo(() => {
    if (!data) return { grossProfit: 0, netProfit: 0, netMargin: 0 };
    const grossProfit = data.revenue.netRevenue - data.costs.cogs;
    const totalCosts = data.costs.totalCosts + periodExpensesTotal;
    const netProfit = data.revenue.netRevenue - totalCosts;
    const netMargin = data.revenue.netRevenue > 0 ? (netProfit / data.revenue.netRevenue) * 100 : 0;
    return {
      grossProfit: Math.round(grossProfit * 100) / 100,
      netProfit: Math.round(netProfit * 100) / 100,
      netMargin: Math.round(netMargin * 10) / 10,
    };
  }, [data, periodExpensesTotal]);

  // CSV Export utility
  const handleExportCSV = (scope: 'orders' | 'revenue' | 'expenses') => {
    if (!data) return;
    let csvContent = '';
    const filename = `himalayan-koh-sales-${scope}-${period}.csv`;

    if (scope === 'orders') {
      const headers = ['Order Number', 'Date', 'Channel', 'Customer', 'Status', 'Payment Status', 'Subtotal', 'Shipping', 'Tax', 'Discount', 'Total', 'Refunded', 'Net Total', 'Payment Method'];
      const rows = filteredOrders.map(o => [
        o.orderNumber,
        o.date,
        o.channel.toUpperCase(),
        `"${o.customerName.replace(/"/g, '""')}"`,
        o.status,
        o.paymentStatus,
        o.subtotal.toFixed(2),
        o.shipping.toFixed(2),
        o.tax.toFixed(2),
        o.discount.toFixed(2),
        o.total.toFixed(2),
        o.refundedAmount.toFixed(2),
        o.netTotal.toFixed(2),
        `"${(o.paymentMethod || 'None').replace(/"/g, '""')}"`,
      ]);
      csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    } else if (scope === 'revenue') {
      const rows = [
        ['Metric', 'Amount (USD)'],
        ['Gross Revenue (Paid Orders)', data.revenue.grossRevenue.toFixed(2)],
        ['Refunds Issued', data.revenue.refunds.toFixed(2)],
        ['Net Revenue', data.revenue.netRevenue.toFixed(2)],
        ['Paid Orders Count', data.revenue.orderCount],
        ['Average Order Value (AOV)', data.revenue.aov.toFixed(2)],
        ['Shipping Collected', data.revenue.shippingRevenue.toFixed(2)],
        ['Tax Collected', data.revenue.taxCollected.toFixed(2)],
        ['Estimated Gateway Fees', data.costs.gatewayFees.toFixed(2)],
        ['Manual Business Expenses', periodExpensesTotal.toFixed(2)],
        ['Adjusted Net Profit', adjustedProfit.netProfit.toFixed(2)],
        ['Net Profit Margin %', `${adjustedProfit.netMargin}%`],
        ['Wholesale Total Booked', data.wholesaleSummary.totalBooked.toFixed(2)],
        ['Wholesale Cash Collected', data.wholesaleSummary.totalCollected.toFixed(2)],
        ['Wholesale Pending Balance', data.wholesaleSummary.pendingBalance.toFixed(2)],
      ];
      csvContent = rows.map(r => r.join(',')).join('\n');
    } else if (scope === 'expenses') {
      const headers = ['Date', 'Category', 'Description', 'Amount', 'Currency'];
      const rows = expenses.map(e => [
        e.date,
        `"${EXPENSE_CATEGORY_LABELS[e.category] || e.category}"`,
        `"${e.description.replace(/"/g, '""')}"`,
        e.amount.toFixed(2),
        e.currency,
      ]);
      csvContent = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    }

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-[#e6edf3] p-4 md:p-8 space-y-6">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[#30363d] pb-6">
        <div>
          <div className="flex items-center gap-3">
            <span className="w-3 h-3 rounded-full bg-[#238636] animate-pulse" />
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              Himalayan Koh Sales
            </h1>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#238636]/20 text-[#3fb950] border border-[#238636]/40 font-medium">
              Authoritative
            </span>
          </div>
          <p className="text-sm text-[#8b949e] mt-1">
            Real-time financial metrics, paid revenue, profit margins, and reconciliation. No unverified estimates.
          </p>
        </div>

        {/* Period Selector & Refresh */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-lg bg-[#161b22] border border-[#30363d] p-1">
            {(['today', '7d', '30d', '90d', '12m', 'ytd', 'all'] as SalesPeriod[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  period === p
                    ? 'bg-[#238636] text-white shadow-sm'
                    : 'text-[#8b949e] hover:text-[#e6edf3] hover:bg-[#21262d]'
                }`}
              >
                {PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          <button
            onClick={() => fetchData()}
            disabled={loading}
            className="p-2 rounded-lg bg-[#21262d] border border-[#30363d] text-[#c9d1d9] hover:bg-[#30363d] transition-colors disabled:opacity-50"
            title="Refresh Data"
          >
            <ArrowClockwise className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 rounded-xl bg-[#da3633]/10 border border-[#da3633]/30 text-[#f85149] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Warning className="w-5 h-5 flex-shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={() => fetchData()}
            className="text-xs underline font-semibold hover:text-white"
          >
            Retry
          </button>
        </div>
      )}

      {/* Owner Quick Answer KPIs — 1-second view */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1: Today's Real Paid Sales */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-[#161b22] to-[#1c2128] border border-[#30363d] shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-[#8b949e] text-xs font-semibold uppercase tracking-wider">
            <span>Today&apos;s Real Paid Sale</span>
            <span className="p-1.5 rounded-lg bg-[#238636]/10 text-[#3fb950]">
              <CurrencyDollar className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-extrabold text-white">
              ${data ? data.todayKpis.paidRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
            </div>
            <div className="text-xs text-[#8b949e] mt-1 flex items-center gap-1.5">
              <span className="text-[#3fb950] font-medium">{data?.todayKpis.orderCount ?? 0} paid orders</span>
              {data && data.todayKpis.refunds > 0 && (
                <span className="text-[#f85149]">(-${data.todayKpis.refunds.toFixed(2)} refunded)</span>
              )}
            </div>
          </div>
        </div>

        {/* KPI 2: Period Net Revenue */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-[#161b22] to-[#1c2128] border border-[#30363d] shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-[#8b949e] text-xs font-semibold uppercase tracking-wider">
            <span>Net Revenue ({PERIOD_LABELS[period]})</span>
            <span className="p-1.5 rounded-lg bg-[#1f6feb]/10 text-[#58a6ff]">
              <TrendUp className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-extrabold text-[#58a6ff]">
              ${data ? data.revenue.netRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
            </div>
            <div className="text-xs text-[#8b949e] mt-1">
              Gross: ${data?.revenue.grossRevenue.toFixed(2) ?? '0.00'} · Refunds: ${data?.revenue.refunds.toFixed(2) ?? '0.00'}
            </div>
          </div>
        </div>

        {/* KPI 3: Adjusted Net Profit & Margin */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-[#161b22] to-[#1c2128] border border-[#30363d] shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-[#8b949e] text-xs font-semibold uppercase tracking-wider">
            <span>Estimated Net Profit</span>
            <span className="p-1.5 rounded-lg bg-[#d29922]/10 text-[#e3b341]">
              <Receipt className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-extrabold text-[#e3b341]">
              ${adjustedProfit.netProfit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
            </div>
            <div className="text-xs text-[#8b949e] mt-1 flex items-center gap-1.5">
              <span className="px-1.5 py-0.5 rounded bg-[#d29922]/20 text-[#e3b341] font-semibold">
                {adjustedProfit.netMargin}% Margin
              </span>
              <span>after fees & expenses</span>
            </div>
          </div>
        </div>

        {/* KPI 4: Wholesale Pending Balance */}
        <div className="p-5 rounded-xl bg-gradient-to-br from-[#161b22] to-[#1c2128] border border-[#30363d] shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-[#8b949e] text-xs font-semibold uppercase tracking-wider">
            <span>Wholesale Balance Due</span>
            <span className="p-1.5 rounded-lg bg-[#a371f7]/10 text-[#bc8cff]">
              <BuildingOffice className="w-4 h-4" />
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl md:text-3xl font-extrabold text-[#bc8cff]">
              ${data ? data.wholesaleSummary.pendingBalance.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '0.00'}
            </div>
            <div className="text-xs text-[#8b949e] mt-1">
              Collected: ${data?.wholesaleSummary.totalCollected.toFixed(2) ?? '0.00'} of ${data?.wholesaleSummary.totalBooked.toFixed(2) ?? '0.00'}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-[#30363d] space-x-6 text-sm font-medium">
        {([
          { key: 'overview' as const, label: 'Executive Overview' },
          { key: 'orders' as const, label: `Orders (${filteredOrders.length})` },
          { key: 'reconciliation' as const, label: 'Payment Reconciliation' },
          { key: 'expenses' as const, label: `Expenses & Costs (${expenses.length})` },
          { key: 'reports' as const, label: 'Reports & Export' },
        ]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`pb-3 border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-[#238636] text-white font-semibold'
                : 'border-transparent text-[#8b949e] hover:text-[#e6edf3]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* TAB 1: EXECUTIVE OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* Financial Breakdown Formula Bar */}
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-wrap items-center justify-between gap-4 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className="text-[#8b949e]">Gross Revenue:</span>
              <span className="font-bold text-white">${data?.revenue.grossRevenue.toFixed(2) ?? '0.00'}</span>
            </div>
            <span className="text-[#8b949e] font-bold">-</span>
            <div className="flex items-center gap-2">
              <span className="text-[#8b949e]">Refunds:</span>
              <span className="font-bold text-[#f85149]">${data?.revenue.refunds.toFixed(2) ?? '0.00'}</span>
            </div>
            <span className="text-[#8b949e] font-bold">=</span>
            <div className="flex items-center gap-2">
              <span className="text-[#8b949e]">Net Revenue:</span>
              <span className="font-bold text-[#58a6ff]">${data?.revenue.netRevenue.toFixed(2) ?? '0.00'}</span>
            </div>
            <span className="text-[#8b949e] font-bold">-</span>
            <div className="flex items-center gap-2">
              <span className="text-[#8b949e]">Est Gateway Fees:</span>
              <span className="font-bold text-[#e3b341]">${data?.costs.gatewayFees.toFixed(2) ?? '0.00'}</span>
            </div>
            <span className="text-[#8b949e] font-bold">-</span>
            <div className="flex items-center gap-2">
              <span className="text-[#8b949e]">Expenses:</span>
              <span className="font-bold text-[#e3b341]">${periodExpensesTotal.toFixed(2)}</span>
            </div>
            <span className="text-[#8b949e] font-bold">=</span>
            <div className="flex items-center gap-2">
              <span className="text-[#8b949e]">Net Profit:</span>
              <span className="font-bold text-[#3fb950]">${adjustedProfit.netProfit.toFixed(2)}</span>
            </div>
          </div>

          {/* Daily Trend Sparkline / Bar Chart */}
          <div className="p-6 rounded-xl bg-[#161b22] border border-[#30363d]">
            <h3 className="text-sm font-semibold text-white mb-4 flex items-center justify-between">
              <span>Daily Revenue Timeline ({PERIOD_LABELS[period]})</span>
              <span className="text-xs text-[#8b949e] font-normal">
                {data?.dailySeries.length ?? 0} data points
              </span>
            </h3>

            {data && data.dailySeries.length > 0 ? (
              <div className="h-48 flex items-end gap-1 sm:gap-2 pt-6 overflow-x-auto">
                {(() => {
                  const maxRev = Math.max(...data.dailySeries.map(d => d.revenue), 1);
                  return data.dailySeries.map((point, idx) => {
                    const heightPct = Math.round((point.revenue / maxRev) * 100);
                    return (
                      <div
                        key={point.date}
                        className="flex-1 min-w-[20px] max-w-[40px] flex flex-col items-center group relative"
                      >
                        {/* Tooltip */}
                        <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                          <div className="bg-[#21262d] border border-[#30363d] rounded-md px-2 py-1 text-[11px] text-white whitespace-nowrap shadow-xl">
                            <div className="font-bold">{point.date}</div>
                            <div className="text-[#3fb950]">Revenue: ${point.revenue.toFixed(2)}</div>
                            <div className="text-[#8b949e]">Orders: {point.orders}</div>
                            {point.refunds > 0 && (
                              <div className="text-[#f85149]">Refunds: ${point.refunds.toFixed(2)}</div>
                            )}
                          </div>
                        </div>

                        {/* Bar */}
                        <div className="w-full flex flex-col justify-end h-36">
                          <div
                            style={{ height: `${Math.max(heightPct, 4)}%` }}
                            className={`w-full rounded-t transition-all ${
                              point.revenue > 0
                                ? 'bg-gradient-to-t from-[#238636] to-[#3fb950] group-hover:opacity-80'
                                : 'bg-[#30363d]/40'
                            }`}
                          />
                        </div>
                        {/* Label (sampled) */}
                        <span className="text-[9px] text-[#8b949e] mt-1.5 truncate max-w-full">
                          {idx % Math.ceil(data.dailySeries.length / 10) === 0 ? point.date.slice(5) : ''}
                        </span>
                      </div>
                    );
                  });
                })()}
              </div>
            ) : (
              <div className="h-32 flex items-center justify-center text-sm text-[#8b949e]">
                No sales recorded in this period
              </div>
            )}
          </div>

          {/* 2-Column: Channels & Top Products */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Channel Breakdown */}
            <div className="p-6 rounded-xl bg-[#161b22] border border-[#30363d]">
              <h3 className="text-sm font-semibold text-white mb-4">Sales by Channel</h3>
              <div className="space-y-4">
                {/* Retail */}
                <div className="p-4 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-lg bg-[#1f6feb]/20 text-[#58a6ff]">
                      <ShoppingBag className="w-5 h-5" />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-white">Retail Web Store</div>
                      <div className="text-xs text-[#8b949e]">WooCommerce direct checkouts</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-white">
                      ${data ? data.revenue.netRevenue.toFixed(2) : '0.00'}
                    </div>
                    <div className="text-xs text-[#8b949e]">
                      {data?.revenue.orderCount ?? 0} orders · AOV: ${data?.revenue.aov.toFixed(2) ?? '0.00'}
                    </div>
                  </div>
                </div>

                {/* Wholesale */}
                <div className="p-4 rounded-lg bg-[#21262d] border border-[#30363d] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="p-2 rounded-lg bg-[#a371f7]/20 text-[#bc8cff]">
                      <BuildingOffice className="w-5 h-5" />
                    </span>
                    <div>
                      <div className="text-sm font-bold text-white">Wholesale / B2B</div>
                      <div className="text-xs text-[#8b949e]">B2B quotes & contracts</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-bold text-[#bc8cff]">
                      ${data ? data.wholesaleSummary.totalCollected.toFixed(2) : '0.00'} collected
                    </div>
                    <div className="text-xs text-[#8b949e]">
                      ${data?.wholesaleSummary.pendingBalance.toFixed(2) ?? '0.00'} pending · {data?.wholesaleSummary.orderCount ?? 0} orders
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Top Products */}
            <div className="p-6 rounded-xl bg-[#161b22] border border-[#30363d]">
              <h3 className="text-sm font-semibold text-white mb-4">Top Performing Products (Paid)</h3>
              {data && data.topProducts.length > 0 ? (
                <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
                  {data.topProducts.slice(0, 6).map((prod, i) => (
                    <div
                      key={prod.name + i}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-[#21262d]/60 border border-[#30363d]/60 text-xs"
                    >
                      <div className="flex items-center gap-3 truncate mr-2">
                        <span className="w-5 h-5 rounded-full bg-[#30363d] text-[#8b949e] flex items-center justify-center font-bold text-[10px]">
                          {i + 1}
                        </span>
                        <div className="truncate">
                          <div className="font-semibold text-white truncate">{prod.name}</div>
                          {prod.sku && <div className="text-[10px] text-[#8b949e]">SKU: {prod.sku}</div>}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <div className="font-bold text-[#3fb950]">${prod.revenue.toFixed(2)}</div>
                        <div className="text-[10px] text-[#8b949e]">{prod.quantity} sold</div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="h-32 flex items-center justify-center text-sm text-[#8b949e]">
                  No product sales in this period
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: ORDERS TABLE (Google Sheets Simplicity) */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          {/* Table Filters & Search */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-[#161b22] p-4 rounded-xl border border-[#30363d]">
            <div className="flex flex-wrap items-center gap-3">
              {/* Search */}
              <div className="relative min-w-[220px]">
                <MagnifyingGlass className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#8b949e]" />
                <input
                  type="text"
                  placeholder="Search order #, customer, SKU..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg pl-9 pr-3 py-1.5 text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-[#238636]"
                />
              </div>

              {/* Channel */}
              <select
                value={channelFilter}
                onChange={e => setChannelFilter(e.target.value as SalesChannel)}
                className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#238636]"
              >
                <option value="all">All Channels</option>
                <option value="retail">Retail Only</option>
                <option value="wholesale">Wholesale Only</option>
              </select>

              {/* Payment Status */}
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#238636]"
              >
                <option value="all">All Payment Statuses</option>
                <option value="paid">Paid Only</option>
                <option value="pending">Pending / Partial</option>
                <option value="refunded">Refunded</option>
              </select>
            </div>

            {/* Export Button */}
            <button
              onClick={() => handleExportCSV('orders')}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] text-xs font-medium text-white transition-colors"
            >
              <DownloadSimple className="w-4 h-4" />
              <span>Export CSV</span>
            </button>
          </div>

          {/* Orders Table */}
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs whitespace-nowrap">
                <thead className="bg-[#21262d] text-[#8b949e] border-b border-[#30363d] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Channel</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Payment</th>
                    <th className="py-3 px-4 text-right">Subtotal</th>
                    <th className="py-3 px-4 text-right">Shipping</th>
                    <th className="py-3 px-4 text-right">Total</th>
                    <th className="py-3 px-4 text-right">Net</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {filteredOrders.length > 0 ? (
                    filteredOrders.map(order => {
                      const isExpanded = expandedOrder === order.id;
                      const isPaid = order.paymentStatus === 'paid';
                      const isRefunded = order.paymentStatus === 'refunded';

                      return (
                        <React.Fragment key={order.id}>
                          <tr className="hover:bg-[#21262d]/50 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-white">
                              {order.orderNumber}
                            </td>
                            <td className="py-3 px-4 text-[#8b949e]">
                              {order.date ? order.date.slice(0, 10) : '—'}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                                  order.channel === 'wholesale'
                                    ? 'bg-[#a371f7]/20 text-[#bc8cff]'
                                    : 'bg-[#1f6feb]/20 text-[#58a6ff]'
                                }`}
                              >
                                {order.channel}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <div className="font-medium text-white">{order.customerName}</div>
                              {order.customerEmail && (
                                <div className="text-[10px] text-[#8b949e]">{order.customerEmail}</div>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span className="text-[11px] text-[#c9d1d9] capitalize">{order.status}</span>
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                                  isPaid
                                    ? 'bg-[#238636]/20 text-[#3fb950]'
                                    : isRefunded
                                    ? 'bg-[#da3633]/20 text-[#f85149]'
                                    : 'bg-[#d29922]/20 text-[#e3b341]'
                                }`}
                              >
                                {isPaid ? (
                                  <CheckCircle className="w-3 h-3" />
                                ) : isRefunded ? (
                                  <Warning className="w-3 h-3" />
                                ) : (
                                  <Clock className="w-3 h-3" />
                                )}
                                {order.paymentStatus}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right text-[#c9d1d9]">
                              ${order.subtotal.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right text-[#8b949e]">
                              ${order.shipping.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-white">
                              ${order.total.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-right font-bold text-[#3fb950]">
                              ${order.netTotal.toFixed(2)}
                            </td>
                            <td className="py-3 px-4 text-center">
                              <button
                                onClick={() => setExpandedOrder(isExpanded ? null : order.id)}
                                className="text-xs text-[#58a6ff] hover:underline inline-flex items-center gap-1 font-medium"
                              >
                                {isExpanded ? <CaretUp className="w-3.5 h-3.5" /> : <CaretDown className="w-3.5 h-3.5" />}
                                <span>{isExpanded ? 'Hide' : 'Details'}</span>
                              </button>
                            </td>
                          </tr>

                          {/* Expanded Items & Financial Breakdown Row */}
                          {isExpanded && (
                            <tr className="bg-[#1c2128]/90 border-b border-[#30363d]">
                              <td colSpan={11} className="p-5">
                                <div className="space-y-4">
                                  {/* Order Financial Audit Bar */}
                                  <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3 p-3.5 rounded-xl bg-[#161b22] border border-[#30363d] text-xs">
                                    <div>
                                      <div className="text-[10px] text-[#8b949e] uppercase font-semibold">Order Channel</div>
                                      <div className="font-bold text-white capitalize mt-0.5">{order.channel}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-[#8b949e] uppercase font-semibold">Payment Status</div>
                                      <div className="font-bold text-[#3fb950] capitalize mt-0.5">{order.paymentStatus}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-[#8b949e] uppercase font-semibold">Payment Method</div>
                                      <div className="font-mono text-white mt-0.5">{order.paymentMethod || 'bacs / direct'}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-[#8b949e] uppercase font-semibold">Shipping Charged</div>
                                      <div className="font-bold text-white mt-0.5">${order.shipping.toFixed(2)}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-[#8b949e] uppercase font-semibold">Tax Collected</div>
                                      <div className="font-bold text-white mt-0.5">${order.tax.toFixed(2)}</div>
                                    </div>
                                    <div>
                                      <div className="text-[10px] text-[#8b949e] uppercase font-semibold">Net Received</div>
                                      <div className="font-bold text-[#3fb950] mt-0.5">${order.netTotal.toFixed(2)}</div>
                                    </div>
                                  </div>

                                  {/* Line Items or Wholesale Contract View */}
                                  <div>
                                    <div className="text-xs font-semibold text-[#8b949e] mb-2 uppercase tracking-wider flex items-center justify-between">
                                      <span>Items in Order ({order.items.length})</span>
                                      {order.channel === 'wholesale' && (
                                        <span className="text-[10px] text-[#bc8cff] font-mono">Wholesale B2B Contract Allocation</span>
                                      )}
                                    </div>
                                    {order.items.length > 0 ? (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                        {order.items.map((it, idx) => (
                                          <div
                                            key={idx}
                                            className="p-3.5 rounded-lg bg-[#161b22] border border-[#30363d] flex justify-between items-start"
                                          >
                                            <div>
                                              <div className="font-semibold text-white">{it.productName}</div>
                                              <div className="text-[11px] font-mono text-[#8b949e] mt-0.5">SKU: {it.sku || 'N/A'}</div>
                                              <div className="text-[11px] text-[#8b949e] mt-0.5">Qty: <span className="font-bold text-white">{it.quantity}</span></div>
                                            </div>
                                            <div className="text-right flex-shrink-0">
                                              <div className="font-bold text-[#3fb950] text-sm">${it.lineTotal.toFixed(2)}</div>
                                              <div className="text-[10px] text-[#8b949e]">${it.unitPrice.toFixed(2)} ea</div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="p-4 rounded-lg bg-[#161b22] border border-[#30363d] text-xs text-[#8b949e] flex items-center justify-between">
                                        <span>Bulk wholesale contract purchase — order line items tracked through wholesale quote pallet manifests.</span>
                                        <span className="font-bold text-white">${order.total.toFixed(2)} USD</span>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={11} className="py-12 text-center text-sm text-[#8b949e]">
                        No orders match the current filter criteria
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PAYMENT RECONCILIATION */}
      {activeTab === 'reconciliation' && (
        <div className="space-y-6">
          <div className="p-4 rounded-xl bg-[#161b22] border border-[#30363d] flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-white">Payment Status & Gateway Fees</h3>
              <p className="text-xs text-[#8b949e]">
                Every transaction matched against expected totals. Unmatched or refunded transactions are flagged.
              </p>
            </div>
            <div className="text-right">
              <span className="text-xs text-[#8b949e]">Est. Total Gateway Fees: </span>
              <span className="text-sm font-bold text-[#e3b341]">
                ${data?.costs.gatewayFees.toFixed(2) ?? '0.00'}
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[850px] text-left text-xs whitespace-nowrap">
                <thead className="bg-[#21262d] text-[#8b949e] border-b border-[#30363d] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Order #</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Payment Method</th>
                    <th className="py-3 px-4">Transaction ID</th>
                    <th className="py-3 px-4 text-right">Expected</th>
                    <th className="py-3 px-4 text-right">Received</th>
                    <th className="py-3 px-4 text-right">Gateway Fee</th>
                    <th className="py-3 px-4 text-right">Net Received</th>
                    <th className="py-3 px-4 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {data && data.payments.length > 0 ? (
                    data.payments.map((p, idx) => (
                      <tr key={p.orderId || idx} className="hover:bg-[#21262d]/50">
                        <td className="py-3 px-4 font-mono font-bold text-white">{p.orderNumber}</td>
                        <td className="py-3 px-4 text-[#8b949e]">{p.date ? p.date.slice(0, 10) : '—'}</td>
                        <td className="py-3 px-4 text-[#c9d1d9]">{p.paymentMethod}</td>
                        <td className="py-3 px-4 font-mono text-[11px] text-[#8b949e]">
                          {p.transactionId || '—'}
                        </td>
                        <td className="py-3 px-4 text-right text-white">${p.expectedAmount.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-medium text-[#3fb950]">
                          ${p.receivedAmount.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-right text-[#e3b341]">-${p.gatewayFee.toFixed(2)}</td>
                        <td className="py-3 px-4 text-right font-bold text-white">
                          ${p.netReceived.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              p.status === 'matched'
                                ? 'bg-[#238636]/20 text-[#3fb950]'
                                : p.status === 'partial'
                                ? 'bg-[#d29922]/20 text-[#e3b341]'
                                : 'bg-[#da3633]/20 text-[#f85149]'
                            }`}
                          >
                            {p.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-sm text-[#8b949e]">
                        No payment records found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: EXPENSES & COSTS */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-[#161b22] border border-[#30363d]">
            <div>
              <h3 className="text-sm font-semibold text-white">Business Expenses & COGS Tracking</h3>
              <p className="text-xs text-[#8b949e]">
                Record manual freight, packaging, supplier payments, and overhead to deduct from gross revenue.
              </p>
            </div>
            <button
              onClick={() => setShowAddExpense(!showAddExpense)}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-xs font-semibold text-white transition-colors"
            >
              <Plus className="w-4 h-4" />
              <span>{showAddExpense ? 'Cancel' : 'Add Expense'}</span>
            </button>
          </div>

          {/* Add Expense Form */}
          {showAddExpense && (
            <form onSubmit={handleAddExpense} className="p-5 rounded-xl bg-[#21262d] border border-[#30363d] space-y-4">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider">Record New Expense</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs text-[#8b949e] mb-1 font-medium">Category</label>
                  <select
                    value={newExpCategory}
                    onChange={e => setNewExpCategory(e.target.value as ExpenseCategory)}
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#238636]"
                  >
                    {Object.entries(EXPENSE_CATEGORY_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-[#8b949e] mb-1 font-medium">Description</label>
                  <input
                    type="text"
                    placeholder="e.g. Ocean freight for Batch #12"
                    value={newExpDesc}
                    onChange={e => setNewExpDesc(e.target.value)}
                    required
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-[#238636]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#8b949e] mb-1 font-medium">Amount (USD)</label>
                  <input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newExpAmount}
                    onChange={e => setNewExpAmount(e.target.value)}
                    required
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white placeholder-[#8b949e] focus:outline-none focus:border-[#238636]"
                  />
                </div>

                <div>
                  <label className="block text-xs text-[#8b949e] mb-1 font-medium">Date</label>
                  <input
                    type="date"
                    value={newExpDate}
                    onChange={e => setNewExpDate(e.target.value)}
                    required
                    className="w-full bg-[#0d1117] border border-[#30363d] rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-[#238636]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddExpense(false)}
                  className="px-3 py-1.5 rounded-lg bg-[#30363d] text-xs font-medium text-white hover:bg-[#3d444d]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-lg bg-[#238636] hover:bg-[#2ea043] text-xs font-semibold text-white"
                >
                  Save Expense
                </button>
              </div>
            </form>
          )}

          {/* Expenses Table */}
          <div className="rounded-xl border border-[#30363d] bg-[#161b22] overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#21262d] text-[#8b949e] border-b border-[#30363d] font-semibold uppercase tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Category</th>
                    <th className="py-3 px-4">Description</th>
                    <th className="py-3 px-4 text-right">Amount</th>
                    <th className="py-3 px-4 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#30363d]">
                  {expenses.length > 0 ? (
                    expenses.map(exp => (
                      <tr key={exp.id} className="hover:bg-[#21262d]/50">
                        <td className="py-3 px-4 text-[#8b949e]">{exp.date}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded bg-[#30363d] text-[#c9d1d9] font-medium text-[11px]">
                            {EXPENSE_CATEGORY_LABELS[exp.category] || exp.category}
                          </span>
                        </td>
                        <td className="py-3 px-4 font-medium text-white">{exp.description}</td>
                        <td className="py-3 px-4 text-right font-bold text-[#e3b341]">
                          ${exp.amount.toFixed(2)}
                        </td>
                        <td className="py-3 px-4 text-center">
                          <button
                            onClick={() => handleDeleteExpense(exp.id)}
                            className="text-[#f85149] hover:text-[#ff7b72] p-1"
                            title="Delete Expense"
                          >
                            <Trash className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="py-12 text-center text-sm text-[#8b949e]">
                        No manual expenses recorded yet. Click &quot;Add Expense&quot; to track freight, packaging, or marketing costs.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: REPORTS & EXPORT */}
      {activeTab === 'reports' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Card 1: Orders CSV */}
            <div className="p-6 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-col justify-between space-y-4">
              <div>
                <div className="p-3 rounded-lg bg-[#1f6feb]/10 text-[#58a6ff] w-fit mb-3">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-white">Orders & Line Items Export</h4>
                <p className="text-xs text-[#8b949e] mt-1">
                  Complete spreadsheet of all orders in current filter ({PERIOD_LABELS[period]}) with subtotals, shipping, taxes, and customer details.
                </p>
              </div>
              <button
                onClick={() => handleExportCSV('orders')}
                className="w-full py-2 px-4 rounded-lg bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
              >
                <DownloadSimple className="w-4 h-4" />
                <span>Download Orders CSV</span>
              </button>
            </div>

            {/* Card 2: Financial Summary CSV */}
            <div className="p-6 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-col justify-between space-y-4">
              <div>
                <div className="p-3 rounded-lg bg-[#238636]/10 text-[#3fb950] w-fit mb-3">
                  <TrendUp className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-white">Revenue & Profit Statement</h4>
                <p className="text-xs text-[#8b949e] mt-1">
                  Executive financial summary matching UI figures: Gross revenue, refunds, net revenue, margins, and wholesale metrics.
                </p>
              </div>
              <button
                onClick={() => handleExportCSV('revenue')}
                className="w-full py-2 px-4 rounded-lg bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
              >
                <DownloadSimple className="w-4 h-4" />
                <span>Download P&L Summary</span>
              </button>
            </div>

            {/* Card 3: Expenses Journal CSV */}
            <div className="p-6 rounded-xl bg-[#161b22] border border-[#30363d] flex flex-col justify-between space-y-4">
              <div>
                <div className="p-3 rounded-lg bg-[#d29922]/10 text-[#e3b341] w-fit mb-3">
                  <Receipt className="w-6 h-6" />
                </div>
                <h4 className="text-base font-bold text-white">Expense Journal Export</h4>
                <p className="text-xs text-[#8b949e] mt-1">
                  Itemized record of all logged operating expenses, categorized by freight, supplier payments, packaging, and overhead.
                </p>
              </div>
              <button
                onClick={() => handleExportCSV('expenses')}
                className="w-full py-2 px-4 rounded-lg bg-[#21262d] border border-[#30363d] hover:bg-[#30363d] text-xs font-semibold text-white flex items-center justify-center gap-2 transition-colors"
              >
                <DownloadSimple className="w-4 h-4" />
                <span>Download Expenses CSV</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
