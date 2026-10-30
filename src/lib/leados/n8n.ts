import { publicCompanyUrl } from './intelligence';

export function outreachReadiness() {
  const blockers: string[] = [];
  const endpoint = process.env.LEADOS_N8N_WEBHOOK_URL || '';
  if (process.env.LEADOS_OUTREACH_ENABLED !== 'true') blockers.push('Outbound outreach is disabled.');
  if (!endpoint.startsWith('https://') || !publicCompanyUrl(endpoint)) blockers.push('Authenticated public HTTPS n8n webhook is not configured.');
  if (!process.env.LEADOS_N8N_TOKEN || !process.env.LEADOS_EVENT_TOKEN) blockers.push('Dispatch/event authentication is not configured.');
  const verifiedAt = Date.parse(process.env.LEADOS_SENDER_VERIFIED_AT || '');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.LEADOS_SENDER_EMAIL || '') || !Number.isFinite(verifiedAt) || verifiedAt > Date.now() || Date.now() - verifiedAt > 30 * 86400000) blockers.push('Recent sender verification is required.');
  if (!process.env.LEADOS_POSTAL_ADDRESS || process.env.LEADOS_OPTOUT_VERIFIED !== 'true') blockers.push('Verified postal address and working opt-out handling are required.');
  return { ready: blockers.length === 0, blockers };
}

export async function dispatchApprovedDraft(draft: { id: string; recipient: string; subject: string; message: string }) {
  const ready = outreachReadiness();
  if (!ready.ready) return { state: 'blocked', error: ready.blockers.join(' ') };
  try {
    const res = await fetch(process.env.LEADOS_N8N_WEBHOOK_URL!, {
      method: 'POST', redirect: 'error', headers: { Authorization: `Bearer ${process.env.LEADOS_N8N_TOKEN}`, 'Content-Type': 'application/json', 'Idempotency-Key': draft.id },
      body: JSON.stringify({ dispatchId: draft.id, recipient: draft.recipient, subject: draft.subject, message: draft.message, sender: process.env.LEADOS_SENDER_EMAIL, postalAddress: process.env.LEADOS_POSTAL_ADDRESS }),
      signal: AbortSignal.timeout(15000), cache: 'no-store',
    });
    // A 2xx response only acknowledges queue acceptance; delivery needs an event.
    return res.ok ? { state: 'queued' } : { state: 'unknown', error: `n8n returned HTTP ${res.status}; review before retrying.` };
  } catch { return { state: 'unknown', error: 'Dispatch outcome unknown; automatic retry is disabled to avoid duplicate mail.' }; }
}
