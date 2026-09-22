// ============================================================================
// LUXEDGE V2 — SALMAN OS BROWSER CLIENT
//
// The browser NEVER talks to Salman OS directly and NEVER sees credentials.
// It only calls Luxedge's own consolidated serverless proxy
// (/api/salman-os — ONE Vercel function with ?action= dispatch), which
// requires an admin JWT and returns safe payloads only.
//
// Contract-gated: when SALMAN_OS_BASE_URL / SALMAN_OS_TOKEN are not
// configured, the proxy answers state=WAITING and the UI shows "AI BACKEND —
// WAITING FOR SALMAN OS". All failures degrade to empty/WAITING — commerce
// never depends on this.
// ============================================================================

import type {
  SalmanOsStatus, SalmanOsIntelligenceItem, SalmanOsIntelligenceKind,
  SalmanOsJob, SalmanOsJobKind,
} from './types';
import { getAccessToken } from '../wordpressAdminAuth';

const API_BASE = '/api/salman-os';

export function getStoredSupabaseToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const k = window.localStorage.key(i);
      if (k && (k.startsWith('sb-') || k.startsWith('supabase.')) && k.includes('token')) {
        let val = window.localStorage.getItem(k);
        if (!val && window.localStorage.getItem(`${k}.0`)) {
          let combined = '';
          let idx = 0;
          while (true) {
            const chunk = window.localStorage.getItem(`${k}.${idx}`);
            if (!chunk) break;
            combined += chunk;
            idx++;
          }
          val = combined;
        }
        if (val) {
          try {
            const parsed = JSON.parse(val);
            const tok = parsed.access_token || parsed.currentSession?.access_token;
            const exp = parsed.expires_at || parsed.currentSession?.expires_at;
            if (tok && (!exp || exp * 1000 > Date.now())) {
              return tok;
            }
          } catch {}
        }
      }
    }
  } catch {}
  return null;
}

export async function getValidAccessToken(): Promise<string | null> {
  // 1. FAST PATH: Synchronous read from window.localStorage (instant on hard reload)
  const stored = getStoredSupabaseToken();
  if (stored) return stored;

  // 2. Synchronous read from the admin client (services/wordpressAdminAuth)
  const direct = getAccessToken();
  if (direct) return direct;

  // 3. Fallback: supabase.auth.getSession() with a 2-second timeout
  try {
    const { supabase } = await import('@/lib/supabase/client');
    const res = await Promise.race([
      supabase.auth.getSession(),
      new Promise<null>((r) => setTimeout(() => r(null), 2000)),
    ]);
    if (res && 'data' in res && res.data?.session?.access_token) {
      return res.data.session.access_token;
    }
  } catch {
    // ignore
  }

  return null;
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getValidAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function getJson<T>(path: string): Promise<T | null> {
  try {
    let headers = await authHeaders();
    let res = await fetch(`${API_BASE}${path}`, { headers });
    // On hard reload, Supabase session may still be hydrating during the very first tick.
    // If 401, retry quickly with fresh headers.
    if (res.status === 401) {
      for (const delay of [200, 500]) {
        await new Promise((r) => setTimeout(r, delay));
        headers = await authHeaders();
        if (headers.Authorization) {
          res = await fetch(`${API_BASE}${path}`, { headers });
          if (res.ok) break;
        }
      }
    }
    if (!res.ok) return null;
    const data = await res.json();
    return data as T;
  } catch {
    return null;
  }
}

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    let headers = await authHeaders();
    let res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
    });
    if (res.status === 401) {
      for (const delay of [200, 500]) {
        await new Promise((r) => setTimeout(r, delay));
        headers = await authHeaders();
        if (headers.Authorization) {
          res = await fetch(`${API_BASE}${path}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...headers },
            body: JSON.stringify(body),
          });
          if (res.ok) break;
        }
      }
    }
    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      throw new Error(data?.error || `Salman OS request failed (HTTP ${res.status})`);
    }
    const data = await res.json();
    return data as T;
  } catch {
    return null;
  }
}

/** Safe status — WAITING until the server-side env gates open. */
export async function fetchSalmanOsStatus(): Promise<SalmanOsStatus | null> {
  const data = await getJson<{ status: SalmanOsStatus }>('?action=status');
  return data?.status ?? null;
}

/** Intelligence items (empty when WAITING — degrade gracefully). */
export async function fetchSalmanOsIntelligence(kind?: SalmanOsIntelligenceKind): Promise<SalmanOsIntelligenceItem[]> {
  const q = kind ? `&kind=${encodeURIComponent(kind)}` : '';
  const data = await getJson<{ items: SalmanOsIntelligenceItem[] }>(`?action=intelligence${q}`);
  return data?.items ?? [];
}

/** Job list (empty when WAITING). */
export async function fetchSalmanOsJobs(): Promise<SalmanOsJob[]> {
  const data = await getJson<{ jobs: SalmanOsJob[] }>('?action=jobs');
  return data?.jobs ?? [];
}

export interface SalmanOsRunOutcome {
  ok: boolean;
  paused?: boolean;
  reason?: string | null;
  error?: string;
}

/** Run an AI module job — fails closed with a safe message when WAITING. */
export async function runSalmanOsJob(kind: SalmanOsJobKind): Promise<SalmanOsRunOutcome> {
  const data = await postJson<SalmanOsRunOutcome>('', { action: 'run_job', kind });
  if (!data) return { ok: false, error: 'AI BACKEND — WAITING FOR SALMAN OS' };
  return data;
}

/** Pause a module (contract §5 — module-level pause/resume via the run endpoint). */
export async function pauseSalmanOsJob(moduleId: string): Promise<{ ok: boolean; error?: string }> {
  const data = await postJson<{ ok: boolean; error?: string | null }>('', { action: 'pause_job', module: moduleId });
  if (!data) return { ok: false, error: 'AI BACKEND — WAITING FOR SALMAN OS' };
  return { ok: data.ok, error: data.error ?? undefined };
}

/** Resume a module. */
export async function resumeSalmanOsJob(moduleId: string): Promise<{ ok: boolean; error?: string }> {
  const data = await postJson<{ ok: boolean; error?: string | null }>('', { action: 'resume_job', module: moduleId });
  if (!data) return { ok: false, error: 'AI BACKEND — WAITING FOR SALMAN OS' };
  return { ok: data.ok, error: data.error ?? undefined };
}
