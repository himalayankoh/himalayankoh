/**
 * The console's certificate-review client — **browser** code.
 *
 * The certificate file never travels in a list: it is fetched one at a time with the
 * console's own bearer token and turned into a blob URL, so a preview is a local object
 * rather than a public address. A refusal throws with the server's message, because a
 * queue that silently renders empty is exactly the failure a review screen must not
 * have.
 */

import { getAccessToken } from '@/services/wordpressAdminAuth';
import type { AdminCertificateRow } from '@/lib/wholesale/certificateReview';

export type { AdminCertificateRow };

export interface CertificateQueue {
  applications: AdminCertificateRow[];
  audit: Array<Record<string, unknown>>;
  count: number;
}

async function authHeaders(json = true): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) throw new Error('Your admin session has expired. Sign in again.');
  return json
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { Authorization: `Bearer ${token}` };
}

async function readError(response: Response): Promise<never> {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error || `The server answered HTTP ${response.status}.`);
}

/** The review queue, plus the audit rows the timeline is built from. */
export async function fetchCertificateQueue(): Promise<CertificateQueue> {
  const response = await fetch('/api/admin/wholesale/certificates', {
    headers: await authHeaders(false),
    cache: 'no-store',
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as CertificateQueue;
}

export type CertificateReviewAction = 'RECHECK' | 'REQUEST_INFO' | 'REVERIFY' | 'NOTE';

/** Records a certificate review action. Never an approval — that is `decideApplication`. */
export async function reviewCertificate(
  applicationId: number,
  action: CertificateReviewAction,
  note?: string
): Promise<{ application: AdminCertificateRow; message: string }> {
  const response = await fetch(`/api/admin/wholesale/certificates/${applicationId}`, {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ action, note: note ?? '' }),
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as { application: AdminCertificateRow; message: string };
}

export type ApplicationDecision = 'APPROVED' | 'REJECTED' | 'MORE_INFO_REQUIRED' | 'SUSPENDED';

/** Approves, rejects, asks for information or suspends — the owner's decision. */
export async function decideApplication(
  applicationId: number,
  decision: ApplicationDecision,
  note?: string
): Promise<{ certificateStatus?: string; certificateStatusRecorded?: boolean }> {
  const response = await fetch('/api/admin/wholesale/decide', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ applicationId, decision, note: note ?? '' }),
  });
  if (!response.ok) await readError(response);
  return (await response.json()) as { certificateStatus?: string; certificateStatusRecorded?: boolean };
}

/** The certificate itself, as a blob URL the review panel can display. */
export async function fetchCertificateBlob(applicationId: number): Promise<Blob> {
  const response = await fetch(`/api/admin/wholesale/certificates/${applicationId}/file`, {
    headers: await authHeaders(false),
    cache: 'no-store',
  });
  if (!response.ok) await readError(response);
  return response.blob();
}
