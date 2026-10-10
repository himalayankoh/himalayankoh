import { openGoogleOAuthValue } from '@/lib/auth/googleOAuth';
import { getSettingsForCategoryWithStatus } from '@/lib/settings/serverSettings';

export const SEARCH_CONSOLE_PROPERTY = 'sc-domain:himalayankoh.com';

export class SearchConsoleError extends Error {
  constructor(public code: string, message: string, public status = 502) { super(message); }
}

export interface SearchConsoleRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

/** Shared encrypted Google connection for the already-authorized read-only scopes. */
export async function googleAccessToken(): Promise<string> {
  const settings = await getSettingsForCategoryWithStatus('google_oauth');
  if (!settings.ok) throw new SearchConsoleError('SETTINGS_UNAVAILABLE', 'Google connection settings could not be read. Try again.', 503);
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim() || settings.values.client_id;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim() || settings.values.client_secret;
  if (!clientId || !clientSecret) throw new SearchConsoleError('NOT_CONFIGURED', 'Configure the Google OAuth client on the server.', 503);
  const encrypted = settings.values.refresh_token_encrypted;
  const refreshToken = encrypted ? await openGoogleOAuthValue(encrypted, 'refresh-token') : null;
  if (!refreshToken) throw new SearchConsoleError('AUTHORIZATION_REQUIRED', 'Connect Google Search Console from Settings and grant read-only access.', 409);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' }),
    signal: AbortSignal.timeout(15_000), cache: 'no-store',
  });
  if (!response.ok) throw new SearchConsoleError('AUTHORIZATION_FAILED', 'Google authorization could not be refreshed. Reconnect Google.', response.status === 400 || response.status === 401 ? 409 : 502);
  const data = await response.json() as { access_token?: unknown };
  if (typeof data.access_token !== 'string' || !data.access_token) throw new SearchConsoleError('AUTHORIZATION_FAILED', 'Google did not return a usable access token. Reconnect Google.', 409);
  return data.access_token;
}

async function googleJson<T>(url: string, token: string, body?: object): Promise<T> {
  const response = await fetch(url, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15_000), cache: 'no-store',
  });
  if (!response.ok) throw new SearchConsoleError(
    response.status === 403 ? 'GOOGLE_ACCESS_DENIED' : 'GOOGLE_API_ERROR',
    response.status === 403 ? 'Google denied access. Check the Search Console API, property permissions and read-only consent.' : 'The Google Search Console API request failed. Try again.',
    response.status === 403 ? 403 : 502,
  );
  return response.json() as Promise<T>;
}

// Search Console dates use Pacific time. Query only finalized days; an empty
// successful response means no available rows, not a disconnected integration.
export function searchConsoleDateRange(days: number, now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  const today = Date.UTC(Number(value('year')), Number(value('month')) - 1, Number(value('day')));
  return { startDate: new Date(today - days * 86_400_000).toISOString().slice(0, 10), endDate: new Date(today - 86_400_000).toISOString().slice(0, 10) };
}

export async function readSearchConsole(days: number) {
  const token = await googleAccessToken();
  const sites = await googleJson<{ siteEntry?: Array<{ siteUrl: string; permissionLevel: string }> }>('https://www.googleapis.com/webmasters/v3/sites', token);
  const site = sites.siteEntry?.find(s => s.siteUrl === SEARCH_CONSOLE_PROPERTY && s.permissionLevel !== 'siteUnverifiedUser');
  if (!site) throw new SearchConsoleError('PROPERTY_ACCESS_REQUIRED', 'The connected Google account cannot access sc-domain:himalayankoh.com.', 403);
  const range = searchConsoleDateRange(days);
  const data = await googleJson<{ rows?: SearchConsoleRow[] }>(
    `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(SEARCH_CONSOLE_PROPERTY)}/searchAnalytics/query`, token,
    { ...range, dimensions: ['query', 'page'], type: 'web', dataState: 'final', rowLimit: 1000 },
  );
  const rows = data.rows ?? [];
  return {
    status: rows.length ? 'CONNECTED' : 'CONNECTED_NO_DATA', connected: true,
    property: SEARCH_CONSOLE_PROPERTY, permissionLevel: site.permissionLevel, ...range,
    dimensions: ['query', 'page'], dataState: 'final', rowLimit: 1000,
    coverage: 'Top available query/page rows; not a complete site total.',
    rows, fetchedAt: new Date().toISOString(),
    message: rows.length ? 'Search Console data retrieved from Google.' : 'Google connection works. Google returned no rows for this date range; reports may still be processing or have no recorded search activity.',
  };
}
