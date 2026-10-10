import { useEffect, useState } from 'react';
import { getFreshAccessToken } from '@/services/wordpressAdminAuth';
import type { SearchConsoleRow } from '@/lib/google/searchConsole';

type Report = { message: string; coverage?: string; startDate?: string; endDate?: string; rows?: SearchConsoleRow[] };

export default function SearchConsoleTraffic() {
  const [days, setDays] = useState(28);
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setReport(null);
    void (async () => {
      try {
        const token = await getFreshAccessToken();
        if (!token) throw new Error('Sign in as admin to view Google search traffic.');
        const response = await fetch(`/api/admin/search-console?days=${days}`, { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' });
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || 'Could not load Google search traffic.');
        if (!cancelled) setReport(body);
      } catch (error) {
        if (!cancelled) setReport({ message: error instanceof Error ? error.message : 'Could not load Google search traffic.' });
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [days, refresh]);
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm" aria-label="Google search traffic">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold">Google Search Console</h2>
        <div className="flex gap-2">
          <select aria-label="Google search date range" value={days} onChange={e => setDays(Number(e.target.value))} className="rounded-lg border p-2 text-sm">
            {[7, 28, 90].map(d => <option key={d} value={d}>Last {d} days</option>)}
          </select>
          <button disabled={loading} onClick={() => setRefresh(n => n + 1)} className="rounded-lg border px-3 text-sm disabled:opacity-50">Refresh search</button>
        </div>
      </div>
      <p role="status" className="mt-3 text-sm text-gray-600">{loading ? 'Checking Google search traffic…' : report?.message}</p>
      <a href="/admin/settings" className="mt-2 inline-block text-sm text-blue-700 underline">Google connection settings</a>
      {!!report?.rows?.length && (
        <>
          <p className="mt-3 text-xs text-gray-500">{report.startDate} – {report.endDate}. {report.coverage} Showing the first 10 rows.</p>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr>{['Query', 'Page', 'Clicks', 'Impressions', 'CTR', 'Position'].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead>
              <tbody>{report.rows.slice(0, 10).map((row, i) => <tr key={i} className="border-t"><td className="p-2">{row.keys[0]}</td><td className="max-w-xs break-words p-2">{row.keys[1]}</td><td className="p-2">{row.clicks}</td><td className="p-2">{row.impressions}</td><td className="p-2">{(row.ctr * 100).toFixed(1)}%</td><td className="p-2">{row.position.toFixed(1)}</td></tr>)}</tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}
