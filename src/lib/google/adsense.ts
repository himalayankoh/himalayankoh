import { googleAccessToken, SearchConsoleError } from './searchConsole';

export const ADSENSE_PUBLISHER = 'pub-5473713135927706';
const ACCOUNT = `accounts/${ADSENSE_PUBLISHER}`;
const METRICS = ['ESTIMATED_EARNINGS', 'PAGE_VIEWS', 'IMPRESSIONS', 'CLICKS', 'PAGE_VIEWS_RPM', 'IMPRESSIONS_RPM'] as const;
const FIELDS = ['earnings', 'pageViews', 'impressions', 'clicks', 'pageRpm', 'impressionRpm'] as const;
interface Report {
  headers?: Array<{ name?: string; currencyCode?: string }>;
  rows?: Array<{ cells?: Array<{ value?: string }> }>;
  totals?: { cells?: Array<{ value?: string }> };
  warnings?: string[];
}
export class AdSenseError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}

/** Missing or malformed metrics are unavailable, not $0.00. */
export function parseAdSenseReport(report: Report) {
  const cells = report.totals?.cells ?? report.rows?.[0]?.cells;
  // Google legitimately answers some valid ranges with no body at all — YESTERDAY on
  // an account whose latest day has not closed yet returns neither rows nor totals.
  // That is "no data for this range", not a broken report: null values here keep
  // every other range readable instead of rejecting the whole payload.
  if (!report.headers || !cells) return { values: null, currency: null, warnings: report.warnings ?? [] };
  const pairs = METRICS.map((metric, index) => {
    const column = report.headers!.findIndex(header => header.name === metric);
    const raw = column < 0 ? undefined : cells[column]?.value;
    const value = raw?.trim() ? Number(raw) : NaN;
    if (!Number.isFinite(value) || value < 0) return [FIELDS[index], null];
    return [FIELDS[index], value];
  });
  const currency = report.headers.find(header => header.name === 'ESTIMATED_EARNINGS')?.currencyCode || null;
  return { values: Object.fromEntries(pairs), currency, warnings: report.warnings ?? [] };
}

async function googleJson<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`https://adsense.googleapis.com/v2/${path}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new AdSenseError(response.status === 403 ? 'GOOGLE_ACCESS_DENIED' : 'GOOGLE_API_ERROR',
    response.status === 403 ? 'Grant AdSense read-only consent and verify the AdSense Management API and publisher account access.' : 'Google AdSense could not be read. Try again.',
    response.status === 403 ? 403 : response.status === 429 ? 429 : 502);
  return response.json() as Promise<T>;
}

export async function readAdSenseConnection() {
  const token = await googleAccessToken();
  // The configured publisher must match an account the owner actually granted.
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const params = new URLSearchParams({ pageSize: '100' });
    if (pageToken) params.set('pageToken', pageToken);
    const accounts = await googleJson<{ accounts?: Array<{ name?: string; timeZone?: { id?: string } }>; nextPageToken?: string }>(`accounts?${params}`, token);
    const account = accounts.accounts?.find(item => item.name === ACCOUNT);
    if (account) return { token, timeZone: account.timeZone?.id };
    if (!accounts.nextPageToken) break;
    pageToken = accounts.nextPageToken;
  }
  throw new AdSenseError('PUBLISHER_ACCESS_REQUIRED', 'The connected Google account cannot access the configured AdSense publisher.', 403);
}

export function previousAdSenseMonth(timeZone: string, now = new Date()): URLSearchParams {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: 'numeric' }).formatToParts(now);
  const year = Number(parts.find(p => p.type === 'year')!.value);
  const month = Number(parts.find(p => p.type === 'month')!.value);
  const start = new Date(Date.UTC(year, month - 2, 1));
  const end = new Date(Date.UTC(year, month - 1, 0));
  return new URLSearchParams({ dateRange: 'CUSTOM',
    'startDate.year': String(start.getUTCFullYear()), 'startDate.month': String(start.getUTCMonth() + 1), 'startDate.day': '1',
    'endDate.year': String(end.getUTCFullYear()), 'endDate.month': String(end.getUTCMonth() + 1), 'endDate.day': String(end.getUTCDate()) });
}

export async function readAdSenseEarnings() {
  const { token, timeZone } = await readAdSenseConnection();
  if (!timeZone) throw new AdSenseError('REPORT_UNAVAILABLE', 'Google did not identify the publisher account timezone.');
  const ranges = { today: new URLSearchParams({ dateRange: 'TODAY' }), yesterday: new URLSearchParams({ dateRange: 'YESTERDAY' }),
    last7: new URLSearchParams({ dateRange: 'LAST_7_DAYS' }), thisMonth: new URLSearchParams({ dateRange: 'MONTH_TO_DATE' }),
    prevMonth: previousAdSenseMonth(timeZone) };
  const reports = await Promise.all(Object.entries(ranges).map(async ([key, params]) => {
    for (const metric of METRICS) params.append('metrics', metric);
    return { key, ...parseAdSenseReport(await googleJson<Report>(`${ACCOUNT}/reports:generate?${params}`, token)) };
  }));
  // A currency from any populated range serves all of them; ranges with no data
  // carried null and only a genuine disagreement between populated ones is an error.
  const currency = reports.find(r => r.currency)?.currency ?? null;
  if (reports.some(r => r.currency && r.currency !== currency)) throw new AdSenseError('REPORT_UNAVAILABLE', 'Google returned inconsistent report currencies.');
  return { syncedAt: new Date().toISOString(), currency, ranges: Object.fromEntries(reports.map(r => [r.key, r.values])),
    warnings: reports.flatMap(r => r.warnings), estimated: true, timeZone };
}

export function adSenseFailure(error: unknown) {
  if (error instanceof AdSenseError || error instanceof SearchConsoleError) return { status: error.status, code: error.code, message: error.message };
  return { status: 502, code: 'GOOGLE_API_ERROR', message: 'Google AdSense could not be read. Try again.' };
}
