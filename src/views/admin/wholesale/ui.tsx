'use client';

import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Info,
  Loader2,
  Plus,
  Save,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/* Value sanitizers & readers                                          */
/* ------------------------------------------------------------------ */

export function text(value: unknown, fallback = ''): string {
  if (value === null || value === undefined) return fallback;
  return typeof value === 'string' ? value : String(value);
}

export function numberValue(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const raw = text(value).replace(/,/g, '').trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

/** A record id as an integer, or null when the row has none. */
export function rowId(row: Record<string, unknown> | null | undefined): number | null {
  const value = numberValue(row?.id);
  return value === null ? null : Math.trunc(value);
}

export function money(value: unknown, currency = 'USD'): string {
  const parsed = numberValue(value);
  if (parsed === null) return '—';
  return `${currency} ${parsed.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function date(value: unknown): string {
  const raw = text(value);
  if (!raw) return '—';
  const parsed = Date.parse(raw);
  return Number.isNaN(parsed) ? raw : new Date(parsed).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

/* ------------------------------------------------------------------ */
/* Unified Status Badge System                                         */
/* ------------------------------------------------------------------ */

export type StatusTone = 'emerald' | 'amber' | 'sky' | 'indigo' | 'stone' | 'rose';

export function resolveStatusConfig(rawStatus: string): {
  tone: StatusTone;
  label: string;
  dotColor: string;
  className: string;
} {
  const norm = String(rawStatus || '').toUpperCase().trim();

  switch (norm) {
    case 'ACTIVE':
    case 'APPROVED':
    case 'ACCEPTED':
    case 'PAID':
    case 'LIVE':
    case 'LIVE API':
    case 'DELIVERED':
    case 'CONFIRMED':
    case 'READY':
      return {
        tone: 'emerald',
        label: rawStatus.replace(/_/g, ' '),
        dotColor: 'bg-emerald-500',
        className: 'bg-emerald-50 text-emerald-800 border-emerald-200/90 shadow-xs',
      };

    case 'PENDING':
    case 'SUBMITTED':
    case 'AWAITING_DEPOSIT':
    case 'WARNING':
    case 'WARN':
      return {
        tone: 'amber',
        label: rawStatus.replace(/_/g, ' '),
        dotColor: 'bg-amber-500',
        className: 'bg-amber-50 text-amber-800 border-amber-200/90 shadow-xs',
      };

    case 'UNDER_REVIEW':
    case 'MORE_INFO_REQUIRED':
    case 'IN_PRODUCTION':
    case 'QUOTED':
    case 'STAGING':
      return {
        tone: 'sky',
        label: rawStatus.replace(/_/g, ' '),
        dotColor: 'bg-sky-500',
        className: 'bg-sky-50 text-sky-800 border-sky-200/90 shadow-xs',
      };

    case 'CONVERTED':
    case 'CONVERTED_TO_ORDER':
    case 'MANUAL':
    case 'FALLBACK':
      return {
        tone: 'indigo',
        label: rawStatus.replace(/_/g, ' '),
        dotColor: 'bg-indigo-500',
        className: 'bg-indigo-50 text-indigo-800 border-indigo-200/90 shadow-xs',
      };

    case 'DRAFT':
    case 'TEST':
    case 'SHIPPED':
    case 'OFF':
    case 'DIRECT':
      return {
        tone: 'stone',
        label: rawStatus.replace(/_/g, ' '),
        dotColor: 'bg-stone-400',
        className: 'bg-stone-100 text-stone-700 border-stone-200 shadow-xs',
      };

    case 'REJECTED':
    case 'SUSPENDED':
    case 'CANCELLED':
    case 'EXPIRED':
    case 'ERROR':
    case 'BLOCKED':
      return {
        tone: 'rose',
        label: rawStatus.replace(/_/g, ' '),
        dotColor: 'bg-rose-500',
        className: 'bg-rose-50 text-rose-800 border-rose-200/90 shadow-xs',
      };

    default:
      return {
        tone: 'stone',
        label: rawStatus.replace(/_/g, ' ') || 'Unset',
        dotColor: 'bg-charcoal/40',
        className: 'bg-charcoal/5 text-charcoal-light border-charcoal/10',
      };
  }
}

export function StatusBadge({
  status,
  label,
  pulse = false,
  size = 'md',
}: {
  status: string;
  label?: string;
  pulse?: boolean;
  size?: 'sm' | 'md';
}) {
  const conf = resolveStatusConfig(status);
  const textLabel = label ?? conf.label;

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-[10px]' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold border whitespace-nowrap transition-colors ${sizeClasses} ${conf.className}`}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full shrink-0 ${conf.dotColor} ${
          pulse || status === 'LIVE' || status === 'PENDING' ? 'animate-pulse' : ''
        }`}
      />
      <span>{textLabel}</span>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Layout & Panels                                                     */
/* ------------------------------------------------------------------ */

export function Panel({
  title,
  description,
  actions,
  children,
  badge,
  className = '',
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  badge?: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white rounded-2xl border border-charcoal/10 shadow-[0_2px_8px_rgba(0,0,0,0.02)] transition-shadow duration-200 hover:shadow-[0_4px_16px_rgba(0,0,0,0.04)] ${className}`}>
      <header className="flex flex-wrap items-start justify-between gap-4 p-4 md:p-5 border-b border-charcoal/8 bg-admin-canvas/40 rounded-t-2xl">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-serif text-lg font-bold text-charcoal tracking-tight">{title}</h2>
            {badge ? <div>{badge}</div> : null}
          </div>
          {description ? <p className="text-xs md:text-sm text-charcoal-light mt-1 max-w-3xl leading-relaxed">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="p-5 md:p-6">{children}</div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Buttons                                                             */
/* ------------------------------------------------------------------ */

export function Button({
  onClick,
  children,
  variant = 'primary',
  disabled,
  type = 'button',
  busy,
  size = 'md',
  className = '',
}: {
  onClick?: () => void;
  children: ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline';
  disabled?: boolean;
  type?: 'button' | 'submit';
  busy?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const base =
    'inline-flex items-center justify-center gap-2 min-h-10 rounded-lg font-semibold transition-all duration-150 disabled:opacity-50 disabled:pointer-events-none select-none focus:outline-none focus:ring-2 focus:ring-offset-1';

  const sizeStyles =
    size === 'sm'
      ? 'px-3 py-1 text-xs'
      : size === 'lg'
        ? 'px-6 py-3 text-base'
        : 'px-4 py-2 text-sm';

  const variantStyles =
    variant === 'primary'
      ? 'bg-[#B86452] text-white hover:bg-[#8D4133] focus:ring-[#B86452]/40 shadow-xs'
      : variant === 'secondary'
        ? 'bg-[#3F6550] text-white hover:bg-[#2e4c3c] focus:ring-[#3F6550]/40 shadow-xs'
        : variant === 'danger'
          ? 'bg-rose-50 border border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300 focus:ring-rose-500/40'
          : variant === 'outline'
            ? 'border border-charcoal/20 bg-white text-charcoal hover:bg-[#FAF8F5] focus:ring-charcoal/30'
            : 'border border-transparent text-charcoal hover:bg-charcoal/5 focus:ring-charcoal/20';

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || busy}
      className={`${base} ${sizeStyles} ${variantStyles} ${className}`}
    >
      {busy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : null}
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Form Fields & Inputs                                                */
/* ------------------------------------------------------------------ */

export function Field({
  label,
  hint,
  children,
  wide,
  required,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  wide?: boolean;
  required?: boolean;
}) {
  return (
    <label className={wide ? 'sm:col-span-2 block' : 'block'}>
      <span className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-charcoal/80 mb-1.5">
        <span>
          {label}
          {required ? <span className="text-[#B86452] ml-1">*</span> : null}
        </span>
      </span>
      {children}
      {hint ? <span className="block text-xs text-charcoal-light mt-1.5 leading-normal">{hint}</span> : null}
    </label>
  );
}

const INPUT_STYLE =
  'w-full px-3.5 py-2 rounded-xl border border-charcoal/15 bg-white text-charcoal text-sm transition-all focus:outline-none focus:ring-2 focus:ring-[#B86452]/30 focus:border-[#B86452] hover:border-charcoal/25 disabled:bg-charcoal/5 disabled:opacity-60';

/**
 * Bring a panel's editor into view.
 *
 * Every panel in this console renders its editor *above* its table, so opening one from a
 * row's pencil while the owner is scrolled down at the table looks like the click did
 * nothing at all — the form has opened off-screen. The editor mounts on the same commit as
 * the click, so the lookup waits one frame for it to exist.
 */
export function scrollToEditor(elementId: string) {
  requestAnimationFrame(() => {
    document.getElementById(elementId)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });
}

export function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  disabled,
  className = '',
  name,
}: {
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
  disabled?: boolean;
  className?: string;
  /** Lets a form address this box directly, e.g. to read a value back at save time. */
  name?: string;
}) {
  return (
    <input
      type={type}
      disabled={disabled}
      className={`${INPUT_STYLE} ${className}`}
      value={value}
      placeholder={placeholder}
      name={name}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function TextArea({
  value,
  onChange,
  rows = 3,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  placeholder?: string;
  disabled?: boolean;
}) {
  return (
    <textarea
      rows={rows}
      disabled={disabled}
      className={INPUT_STYLE}
      value={value}
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  disabled?: boolean;
}) {
  return (
    <select disabled={disabled} className={INPUT_STYLE} value={value} onChange={(event) => onChange(event.target.value)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-sm font-medium transition-colors select-none ${
        checked ? 'border-[#B86452] bg-[#B86452]/10 text-[#B86452]' : 'border-charcoal/15 text-charcoal-light hover:bg-charcoal/5'
      }`}
    >
      <span
        className={`w-4 h-4 rounded flex items-center justify-center transition-colors ${
          checked ? 'bg-[#B86452] text-white' : 'border border-charcoal/30 bg-white'
        }`}
      >
        {checked ? <Check className="w-3 h-3 stroke-[2.5]" /> : null}
      </span>
      <span>{label}</span>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Feedback & Alerts                                                   */
/* ------------------------------------------------------------------ */

export function Notice({
  kind,
  children,
  title,
  className,
}: {
  kind: 'error' | 'success' | 'info' | 'warn';
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  const styles =
    kind === 'error'
      ? 'bg-rose-50/90 border-rose-200 text-rose-900'
      : kind === 'success'
        ? 'bg-emerald-50/90 border-emerald-200 text-emerald-900'
        : kind === 'warn'
          ? 'bg-amber-50/90 border-amber-200 text-amber-900'
          : 'bg-sky-50/90 border-sky-200 text-sky-900';

  const Icon =
    kind === 'error'
      ? XCircle
      : kind === 'success'
        ? CheckCircle2
        : kind === 'warn'
          ? AlertCircle
          : Info;

  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 p-4 rounded-xl border text-sm shadow-xs ${styles} ${className ?? ''}`}>
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="leading-relaxed flex-1">
        {title ? <p className="font-bold mb-1">{title}</p> : null}
        {children}
      </div>
    </div>
  );
}

export function useWriter() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');

  async function run<T>(action: () => Promise<T>, successMessage: string): Promise<T | null> {
    setSaving(true);
    setError('');
    setSaved('');
    try {
      const result = await action();
      setSaved(successMessage);
      return result;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'That did not work.');
      return null;
    } finally {
      setSaving(false);
    }
  }

  return {
    saving,
    error,
    saved,
    run,
    setError,
    setSaved,
    clear: () => {
      setError('');
      setSaved('');
    },
  };
}

/* ------------------------------------------------------------------ */
/* KPI & Stat Cards                                                    */
/* ------------------------------------------------------------------ */

export function KpiCard({
  label,
  value,
  hint,
  tone = 'plain',
  icon: Icon,
  badge,
}: {
  label: string;
  value: string | number;
  hint?: ReactNode;
  tone?: 'plain' | 'good' | 'warn' | 'info' | 'accent';
  icon?: React.ComponentType<{ className?: string }>;
  badge?: ReactNode;
}) {
  const borderTone =
    tone === 'good'
      ? 'border-t-2 border-t-emerald-500'
      : tone === 'warn'
        ? 'border-t-2 border-t-amber-500'
        : tone === 'accent'
          ? 'border-t-2 border-t-[#B86452]'
          : tone === 'info'
            ? 'border-t-2 border-t-sky-500'
            : 'border-t-2 border-t-charcoal/20';

  const textTone =
    tone === 'good'
      ? 'text-emerald-700'
      : tone === 'warn'
        ? 'text-amber-700'
        : tone === 'accent'
          ? 'text-[#B86452]'
          : tone === 'info'
            ? 'text-sky-700'
            : 'text-charcoal';

  return (
    <div className={`bg-white rounded-xl border border-admin-line shadow-[0_2px_8px_rgba(0,0,0,0.02)] p-5 transition-all hover:shadow-[0_4px_16px_rgba(0,0,0,0.05)] ${borderTone}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-charcoal-light">{label}</p>
        {Icon ? (
          <div className="w-7 h-7 rounded-lg bg-[#FAF8F5] border border-charcoal/8 flex items-center justify-center text-charcoal/70">
            <Icon className="w-3.5 h-3.5" />
          </div>
        ) : badge ? (
          <div>{badge}</div>
        ) : null}
      </div>
      <p className={`font-serif text-2xl font-bold tracking-tight ${textTone}`}>{value}</p>
      {hint ? <div className="text-xs text-charcoal-light mt-1.5 leading-normal">{hint}</div> : null}
    </div>
  );
}

export const Stat = KpiCard;

/* ------------------------------------------------------------------ */
/* Visual Charts (Zero dependencies, pure SVG & CSS)                   */
/* ------------------------------------------------------------------ */

/**
 * Proportional Financial Waterfall bar showing allocation of revenue.
 * Built strictly from server numbers, never guessed.
 */
export function FinancialWaterfallBar({
  revenue,
  productCost,
  freightCost,
  otherCost,
  dealerCommission,
  hkNetProfit,
  currency = 'USD',
}: {
  revenue: number;
  productCost: number;
  freightCost: number;
  otherCost: number;
  dealerCommission: number;
  hkNetProfit: number;
  currency?: string;
}) {
  if (!revenue || revenue <= 0) {
    return (
      <div className="bg-[#FAF8F5] rounded-xl p-4 text-xs text-charcoal-light text-center border border-charcoal/8">
        No revenue data to chart yet.
      </div>
    );
  }

  const pCostPct = Math.max(0, Math.min(100, (productCost / revenue) * 100));
  const fCostPct = Math.max(0, Math.min(100, (freightCost / revenue) * 100));
  const oCostPct = Math.max(0, Math.min(100, (otherCost / revenue) * 100));
  const dCommPct = Math.max(0, Math.min(100, (dealerCommission / revenue) * 100));
  const netMarginPct = Math.max(0, Math.min(100, (hkNetProfit / revenue) * 100));

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between text-xs text-charcoal font-medium">
        <span>Revenue Allocation ({currency} {revenue.toLocaleString('en-US', { minimumFractionDigits: 2 })})</span>
        <span className="text-emerald-700 font-bold">{netMarginPct.toFixed(1)}% HK Net Margin</span>
      </div>

      {/* Segmented bar */}
      <div className="w-full h-4 rounded-full bg-stone-100 flex overflow-hidden border border-charcoal/10 shadow-inner">
        {pCostPct > 0 && (
          <div
            style={{ width: `${pCostPct}%` }}
            title={`Factory Goods: ${pCostPct.toFixed(1)}%`}
            className="bg-stone-500 transition-all hover:opacity-90"
          />
        )}
        {fCostPct > 0 && (
          <div
            style={{ width: `${fCostPct}%` }}
            title={`Ocean Freight: ${fCostPct.toFixed(1)}%`}
            className="bg-sky-500 transition-all hover:opacity-90"
          />
        )}
        {oCostPct > 0 && (
          <div
            style={{ width: `${oCostPct}%` }}
            title={`Other Costs: ${oCostPct.toFixed(1)}%`}
            className="bg-amber-400 transition-all hover:opacity-90"
          />
        )}
        {dCommPct > 0 && (
          <div
            style={{ width: `${dCommPct}%` }}
            title={`Dealer Commission: ${dCommPct.toFixed(1)}%`}
            className="bg-[#C98745] transition-all hover:opacity-90"
          />
        )}
        {netMarginPct > 0 && (
          <div
            style={{ width: `${netMarginPct}%` }}
            title={`HK Net Profit: ${netMarginPct.toFixed(1)}%`}
            className="bg-emerald-600 transition-all hover:opacity-90"
          />
        )}
      </div>

      {/* Legend */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] pt-1 text-charcoal">
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-stone-500 shrink-0" />
          <span className="truncate">Goods: {pCostPct.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-sky-500 shrink-0" />
          <span className="truncate">Freight: {fCostPct.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-amber-400 shrink-0" />
          <span className="truncate">Other: {oCostPct.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-xs bg-[#C98745] shrink-0" />
          <span className="truncate">Dealer: {dCommPct.toFixed(1)}%</span>
        </div>
        <div className="flex items-center gap-1.5 font-bold text-emerald-800">
          <span className="w-2.5 h-2.5 rounded-xs bg-emerald-600 shrink-0" />
          <span className="truncate">HK Net: {netMarginPct.toFixed(1)}%</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Visual conversion pipeline bar from application to booked order.
 */
export function ConversionFunnelBar({
  applications,
  approvedAccounts,
  quotes,
  orders,
}: {
  applications: number;
  approvedAccounts: number;
  quotes: number;
  orders: number;
}) {
  const steps = [
    { label: 'Applications', count: applications, color: 'bg-stone-500' },
    { label: 'Approved Buyers', count: approvedAccounts, color: 'bg-sky-500' },
    { label: 'Quotations', count: quotes, color: 'bg-[#C98745]' },
    { label: 'Booked Orders', count: orders, color: 'bg-emerald-600' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      {steps.map((step, idx) => (
        <div
          key={step.label}
          className="bg-white rounded-xl p-3.5 border border-charcoal/8 shadow-xs flex flex-col justify-between"
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase font-bold tracking-wider text-charcoal-light">Stage {idx + 1}</span>
            <span className={`w-2 h-2 rounded-full ${step.color}`} />
          </div>
          <p className="font-serif text-xl font-bold text-charcoal">{step.count}</p>
          <p className="text-xs text-charcoal/80 font-medium mt-0.5">{step.label}</p>
        </div>
      ))}
    </div>
  );
}

/**
 * Container utilization dual gauge for weight & CBM.
 */
export function UtilizationGauge({
  weightPct,
  volumePct,
  limitingFactor,
}: {
  weightPct: number;
  volumePct: number;
  limitingFactor?: string;
}) {
  const getBarColor = (pct: number) => {
    if (pct > 100) return 'bg-rose-600';
    if (pct >= 90) return 'bg-amber-500';
    return 'bg-emerald-600';
  };

  return (
    <div className="space-y-4">
      {/* Weight Gauge */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
          <span className="text-charcoal flex items-center gap-1.5">
            Weight Utilization
            {limitingFactor === 'WEIGHT' ? (
              <span className="px-1.5 py-0.2 rounded-sm bg-amber-100 text-amber-800 text-[10px] font-bold">
                LIMITING
              </span>
            ) : null}
          </span>
          <span className={`font-mono font-bold ${weightPct > 100 ? 'text-rose-700' : 'text-charcoal'}`}>
            {weightPct}%
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-stone-100 overflow-hidden border border-charcoal/10">
          <div
            style={{ width: `${Math.min(100, weightPct)}%` }}
            className={`h-full transition-all duration-300 ${getBarColor(weightPct)}`}
          />
        </div>
      </div>

      {/* Volume Gauge */}
      <div>
        <div className="flex items-center justify-between text-xs mb-1.5 font-medium">
          <span className="text-charcoal flex items-center gap-1.5">
            Volume Utilization (CBM)
            {limitingFactor === 'VOLUME' ? (
              <span className="px-1.5 py-0.2 rounded-sm bg-amber-100 text-amber-800 text-[10px] font-bold">
                LIMITING
              </span>
            ) : null}
          </span>
          <span className={`font-mono font-bold ${volumePct > 100 ? 'text-rose-700' : 'text-charcoal'}`}>
            {volumePct}%
          </span>
        </div>
        <div className="w-full h-2.5 rounded-full bg-stone-100 overflow-hidden border border-charcoal/10">
          <div
            style={{ width: `${Math.min(100, volumePct)}%` }}
            className={`h-full transition-all duration-300 ${getBarColor(volumePct)}`}
          />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Data Table                                                          */
/* ------------------------------------------------------------------ */

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

export function DataTable<T>({
  columns,
  rows,
  empty,
  rowKey,
}: {
  columns: Array<Column<T>>;
  rows: T[];
  empty: string;
  rowKey: (row: T, index: number) => string;
}) {
  if (!rows.length) {
    return (
      <div className="py-12 px-4 text-center bg-[#FAF8F5]/40 rounded-xl border border-dashed border-charcoal/15 my-2">
        <p className="text-sm font-medium text-charcoal-light">{empty}</p>
      </div>
    );
  }

  return (
    <div role="region" aria-label="Scrollable wholesale table" tabIndex={0} className="max-w-full overflow-x-auto overscroll-x-contain rounded-xl border border-admin-line">
      <table className="w-full text-sm border-collapse bg-white">
        <thead>
          <tr className="bg-[#FAF8F5] border-b border-charcoal/10 text-charcoal/70 text-[11px] font-bold uppercase tracking-wider select-none">
            {columns.map((column) => (
              <th
                key={column.key}
                className={`py-3 px-3.5 whitespace-nowrap ${
                  column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                }`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-charcoal/6">
          {rows.map((row, index) => (
            <tr
              key={rowKey(row, index)}
              className="hover:bg-[#FAF8F5]/70 transition-colors duration-150 align-middle"
            >
              {columns.map((column) => (
                <td
                  key={column.key}
                  className={`py-3.5 px-3.5 ${
                    column.align === 'right' ? 'text-right' : column.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Action Buttons                                                      */
/* ------------------------------------------------------------------ */

export function DeleteRowButton({ label, onDelete }: { label: string; onDelete: () => void }) {
  const [confirming, setConfirming] = useState(false);

  useEffect(() => {
    if (!confirming) return;
    const timer = setTimeout(() => setConfirming(false), 4000);
    return () => clearTimeout(timer);
  }, [confirming]);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="p-1.5 rounded-lg text-charcoal/50 hover:bg-rose-50 hover:text-rose-700 transition-colors"
        aria-label={`Delete ${label}`}
        title={`Delete ${label}`}
      >
        <Trash2 className="w-4 h-4" />
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 bg-rose-50 p-0.5 rounded-lg border border-rose-200">
      <button
        type="button"
        onClick={onDelete}
        className="px-2.5 py-1 rounded-md bg-rose-600 text-white text-xs font-bold hover:bg-rose-700 transition-colors shadow-xs"
      >
        Confirm
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="p-1 rounded-md text-charcoal/60 hover:bg-white transition-colors"
        aria-label="Cancel"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  );
}

export function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button onClick={onClick} variant="outline" size="sm">
      <Plus className="w-3.5 h-3.5" />
      {label}
    </Button>
  );
}

export function SaveButton({ onClick, busy, label = 'Save' }: { onClick: () => void; busy?: boolean; label?: string }) {
  return (
    <Button onClick={onClick} busy={busy} variant="primary" size="sm">
      <Save className="w-3.5 h-3.5" />
      {label}
    </Button>
  );
}
