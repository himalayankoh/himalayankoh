export interface EarningsRange {
  earnings: number | null;
  pageViews: number | null;
  impressions: number | null;
  clicks: number | null;
  pageRpm: number | null;
  impressionRpm: number | null;
}

export interface EarningsCache {
  syncedAt: string;
  currency: string | null;
  ranges: Partial<Record<'today' | 'yesterday' | 'last7' | 'thisMonth' | 'prevMonth', EarningsRange | null>> | null;
}

function formatMetric(value: number | null | undefined, currency?: string | null): string {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return 'No data';
  if (currency === undefined) return value.toLocaleString('en-US');
  if (!currency) return 'No data';
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(value);
  } catch {
    return 'No data';
  }
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-100 bg-white p-3 shadow-sm">
      <p className="text-[10px] uppercase tracking-wider text-gray-400 mb-1">{label}</p>
      <p className="text-lg font-bold text-gray-900 tabular-nums">{value}</p>
    </div>
  );
}

export default function AdSenseReportCards({ cache }: { cache: EarningsCache }) {
  const month = cache.ranges?.thisMonth;
  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5">
        {([
          ['today', 'Today'], ['yesterday', 'Yesterday'], ['last7', 'Last 7 days'],
          ['thisMonth', 'This month'], ['prevMonth', 'Previous month'],
        ] as const).map(([key, label]) => (
          <Metric key={key} label={label} value={formatMetric(cache.ranges?.[key]?.earnings, cache.currency)} />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
        <Metric label="Page views" value={formatMetric(month?.pageViews)} />
        <Metric label="Ad impressions" value={formatMetric(month?.impressions)} />
        <Metric label="Clicks" value={formatMetric(month?.clicks)} />
        <Metric label="Page RPM" value={formatMetric(month?.pageRpm, cache.currency)} />
        <Metric label="Impression RPM" value={formatMetric(month?.impressionRpm, cache.currency)} />
      </div>
    </>
  );
}
