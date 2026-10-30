import { getAccessToken } from '@/services/wordpressAdminAuth';

async function authHeaders(): Promise<Record<string, string> | null> {
  const token = getAccessToken();
  if (!token) return null;
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

export interface HubspotSyncLeadInput {
  email: string;
  name?: string | null;
  phone?: string | null;
  company?: string | null;
  status?: string | null;
  notes?: string | null;
}

/** Whether HubSpot is configured (token present in DB or env). */
export async function fetchHubspotStatus(): Promise<boolean> {
  try {
    const headers = await authHeaders();
    if (!headers) return false;
    const res = await fetch('/api/admin/hubspot/status', { headers });
    if (!res.ok) return false;
    const data = (await res.json()) as { configured?: boolean };
    return Boolean(data.configured);
  } catch {
    return false;
  }
}

/**
 * Best-effort push of a lead to HubSpot. Never throws — returns an error
 * string on failure so the caller can surface a soft warning without
 * blocking the CRM write that already succeeded.
 */
export async function syncLeadToHubspot(
  input: HubspotSyncLeadInput,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const headers = await authHeaders();
    if (!headers) return { ok: false, error: 'Not authenticated.' };
    const res = await fetch('/api/admin/hubspot/sync-lead', {
      method: 'POST',
      headers,
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as { error?: string };
      return { ok: false, error: err.error || `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'HubSpot sync failed.' };
  }
}

/** Import HubSpot contacts into the CRM. Throws on failure (caller shows toast). */
export async function importFromHubspot(): Promise<{ imported: number; skipped: number }> {
  const headers = await authHeaders();
  if (!headers) throw new Error('Not authenticated.');
  const res = await fetch('/api/admin/hubspot/import', { method: 'POST', headers });
  if (!res.ok) {
    const err = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const data = (await res.json()) as { imported: number; skipped: number };
  return data;
}
