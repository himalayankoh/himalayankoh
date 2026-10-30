'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Building2,
  CheckCircle2,
  ExternalLink,
  FileWarning,
  MailCheck,
  RefreshCw,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserX,
} from 'lucide-react';
import {
  ADMIN_TD,
  AdminButton,
  AdminChip,
  AdminField,
  AdminNotice,
  AdminModal,
  AdminPageHeader,
  AdminPanel,
  AdminTable,
  AdminTableSkeleton,
  AdminTabs,
} from '@/components/admin/AdminUI';
import { MICRO_LABEL, TEXTAREA } from '@/components/admin/adminTheme';
import {
  decideApplication,
  fetchCertificateBlob,
  fetchCertificateQueue,
  reviewCertificate,
  type AdminCertificateRow,
  type ApplicationDecision,
} from '@/lib/admin/wholesaleCertificateApi';
import { CERTIFICATE_STATUS_LABELS, type CertificateStatus } from '@/lib/wholesale/resaleCertificate/verify';
import { STATE_AUTHORITIES } from '@/lib/wholesale/resaleCertificate/states';

/**
 * Wholesale Customers — applications, resale certificates and the decisions on them.
 *
 * Every action on this screen writes an audit row, and the screen shows the trail:
 * approving a business is a commercial decision the owner has to be able to explain
 * later. That is also why the certificate preview is a blob fetched with the console
 * session rather than a link — a public URL to somebody's tax document is the one
 * mistake this page must not make.
 */

type Filter = 'pending' | 'info' | 'approved' | 'rejected' | 'suspended' | 'all';

const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'All applications' },
  { id: 'pending', label: 'Pending review' },
  { id: 'approved', label: 'Approved' },
  { id: 'info', label: 'Needs information' },
  { id: 'rejected', label: 'Rejected' },
  { id: 'suspended', label: 'Suspended' },
];

const CHIP_TONE: Record<string, 'success' | 'warning' | 'danger' | 'info' | 'muted' | 'neutral'> = {
  APPROVED: 'success',
  AUTOMATED_CHECKS_COMPLETED: 'success',
  PENDING_CERTIFICATE_REVIEW: 'warning',
  PENDING_EMAIL_VERIFICATION: 'warning',
  ADDITIONAL_INFO_REQUIRED: 'warning',
  REVERIFICATION_REQUIRED: 'warning',
  REJECTED: 'danger',
  SUSPENDED: 'danger',
  MORE_INFO_REQUIRED: 'warning',
  PENDING: 'info',
};

function statusLabel(value: string): string {
  const known = CERTIFICATE_STATUS_LABELS[value as CertificateStatus];
  if (known) return known;
  return value ? value.replace(/_/g, ' ') : 'Unknown';
}

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const parsed = Date.parse(value.includes('T') ? value : value.replace(' ', 'T') + 'Z');
  if (Number.isNaN(parsed)) return value;
  return new Date(parsed).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

function outcomeTone(outcome: string): 'success' | 'warning' | 'danger' | 'muted' {
  if (outcome === 'pass') return 'success';
  if (outcome === 'warn') return 'warning';
  if (outcome === 'fail') return 'danger';
  return 'muted';
}

function matchesFilter(row: AdminCertificateRow, filter: Filter): boolean {
  const app = row.status;
  const cert = row.certificate.status;
  switch (filter) {
    case 'approved':
      return app === 'APPROVED' || cert === 'APPROVED';
    case 'rejected':
      return app === 'REJECTED' || cert === 'REJECTED';
    case 'suspended':
      return app === 'SUSPENDED' || cert === 'SUSPENDED';
    case 'info':
      return app === 'MORE_INFO_REQUIRED' || cert === 'ADDITIONAL_INFO_REQUIRED';
    case 'pending':
      return (
        app === 'PENDING' &&
        ['PENDING_CERTIFICATE_REVIEW', 'PENDING_EMAIL_VERIFICATION', 'AUTOMATED_CHECKS_COMPLETED', ''].includes(cert)
      );
    case 'all':
    default:
      return true;
  }
}

export default function WholesaleCustomersPage() {
  const [rows, setRows] = useState<AdminCertificateRow[]>([]);
  const [audit, setAudit] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [pendingDecision, setPendingDecision] = useState<ApplicationDecision | null>(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const queue = await fetchCertificateQueue();
      setRows(queue.applications);
      setAudit(queue.audit);
      setSelectedId((current) => {
        if (current && queue.applications.some((row) => row.id === current)) return current;
        return queue.applications[0]?.id ?? null;
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'The review queue could not be read.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(() => rows.find((row) => row.id === selectedId) ?? null, [rows, selectedId]);

  const counts = useMemo(() => {
    return {
      pending: rows.filter((r) => matchesFilter(r, 'pending')).length,
      info: rows.filter((r) => matchesFilter(r, 'info')).length,
      approved: rows.filter((r) => matchesFilter(r, 'approved')).length,
      rejected: rows.filter((r) => matchesFilter(r, 'rejected')).length,
      suspended: rows.filter((r) => matchesFilter(r, 'suspended')).length,
      all: rows.length,
    };
  }, [rows]);

  const tabsWithCounts = useMemo(() => {
    return FILTERS.map((f) => ({
      id: f.id,
      label: `${f.label} (${counts[f.id]})`,
    }));
  }, [counts]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((row) => {
      if (!matchesFilter(row, filter)) return false;
      if (!needle) return true;
      return [row.company, row.dba, row.email, row.reference, row.contactName, row.address?.city, row.address?.state]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, filter, query]);

  const timeline = useMemo(() => {
    if (!selected) return [];
    return audit
      .filter((entry) => Number(entry.entity_id) === selected.id)
      .slice()
      .sort((left, right) => String(right.at ?? '').localeCompare(String(left.at ?? '')))
      .slice(0, 25);
  }, [audit, selected]);

  async function runReview(action: 'RECHECK' | 'REQUEST_INFO' | 'REVERIFY' | 'NOTE') {
    if (!selected) return;
    if (action === 'NOTE' && !note.trim()) {
      setError('Type the note before saving it.');
      return;
    }
    setBusy(action);
    setError('');
    setNotice('');
    try {
      const result = await reviewCertificate(selected.id, action, note.trim() || undefined);
      setNotice(result.message);
      if (action === 'NOTE') setNote('');
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'The review could not be recorded.');
    } finally {
      setBusy('');
    }
  }

  async function runDecision(decision: ApplicationDecision, confirmed = false) {
    if (!selected) return;
    if (!confirmed) { setPendingDecision(decision); return; }
    setPendingDecision(null);
    setBusy(decision);
    setError('');
    setNotice('');
    try {
      const result = await decideApplication(selected.id, decision, note.trim() || undefined);
      setNotice(
        result.certificateStatusRecorded === false
          ? 'The decision was recorded, but the certificate review status could not be updated. Run a recheck.'
          : 'The decision was recorded.'
      );
      if (decision === 'REJECTED' || decision === 'MORE_INFO_REQUIRED') setNote('');
      await load();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : 'The decision could not be recorded.');
    } finally {
      setBusy('');
    }
  }

  async function openCertificate(row: AdminCertificateRow) {
    const tab = window.open('about:blank', '_blank');
    setBusy('FILE');
    setError('');
    try {
      const blob = await fetchCertificateBlob(row.id);
      const url = URL.createObjectURL(blob);
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch (fileError) {
      tab?.close();
      setError(fileError instanceof Error ? fileError.message : 'The certificate could not be opened.');
    } finally {
      setBusy('');
    }
  }

  const state = selected ? STATE_AUTHORITIES[selected.certificate.state] : undefined;

  return (
    <div className="space-y-5">
      <AdminPageHeader
        eyebrow="Wholesale"
        title="Wholesale Customers"
        description="Applications, resale certificates and the decisions recorded against them. Wholesale pricing activates only when the owner approves an account."
        actions={
          <AdminButton variant="secondary" icon={RefreshCw} onClick={() => void load()} disabled={loading}>
            {loading ? 'Reading…' : 'Refresh'}
          </AdminButton>
        }
      />

      {error ? (
        <AdminNotice tone="danger" title="That did not work">
          {error}
        </AdminNotice>
      ) : null}
      {notice ? (
        <AdminNotice tone="info" title="Recorded">
          {notice}
        </AdminNotice>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <AdminPanel
          title="Applications"
          description={`${visible.length} of ${rows.length} application${rows.length === 1 ? '' : 's'}`}
          bodyClassName="p-0"
        >
          <div className="border-b border-admin-line px-4 py-3 space-y-3">
            <AdminTabs tabs={tabsWithCounts} active={filter} onChange={(id) => setFilter(id as Filter)} />
            <label className="flex items-center gap-2 rounded-lg border border-admin-line bg-admin-surface px-3 py-2">
              <Search size={15} className="text-admin-muted" aria-hidden />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search business, email or reference"
                className="w-full bg-transparent text-sm text-admin-ink outline-none placeholder:text-admin-muted"
                aria-label="Search applications"
              />
            </label>
          </div>

          <AdminTable
            columns={[
              { key: 'business', label: 'Business' },
              { key: 'state', label: 'State' },
              { key: 'status', label: 'Certificate' },
            ]}
            minWidth="480px"
          >
            {loading ? (
              <AdminTableSkeleton rows={5} columns={3} />
            ) : visible.length ? (
              visible.map((row) => (
                <tr
                  key={row.id}
                  className={`cursor-pointer transition-colors ${
                    row.id === selectedId ? 'bg-himalayan-lighter/60' : 'hover:bg-admin-canvas/60'
                  }`}
                  onClick={() => {
                    setSelectedId(row.id);
                    setNote('');
                    setNotice('');
                    setError('');
                  }}
                >
                  <td className={ADMIN_TD}>
                    <div className="font-semibold text-admin-ink">{row.company || 'Unnamed business'}</div>
                    <div className="text-xs text-admin-muted">{row.email}</div>
                    <div className="text-[11px] text-admin-muted font-mono">{row.reference}</div>
                  </td>
                  <td className={ADMIN_TD}>{row.certificate?.state || row.address?.state || '—'}</td>
                  <td className={ADMIN_TD}>
                    <AdminChip tone={CHIP_TONE[row.certificate.status] ?? 'neutral'}>
                      {statusLabel(row.certificate.status)}
                    </AdminChip>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className={ADMIN_TD} colSpan={3}>
                  <div className="py-8 text-center text-sm text-admin-muted">
                    No application matches this filter.
                  </div>
                </td>
              </tr>
            )}
          </AdminTable>
        </AdminPanel>

        {selected ? (
          <div className="space-y-5">
            <AdminPanel
              title={
                <span className="flex items-center gap-2">
                  <Building2 size={17} className="text-himalayan" aria-hidden />
                  {selected.company || 'Unnamed business'}
                </span>
              }
              description={`${selected.reference} · applied ${formatDate(selected.createdAt)}`}
              action={
                <div className="flex flex-wrap gap-2">
                  <AdminChip tone={CHIP_TONE[selected.status] ?? 'neutral'}>
                    Application: {selected.status.replace(/_/g, ' ')}
                  </AdminChip>
                  <AdminChip tone={CHIP_TONE[selected.certificate.status] ?? 'neutral'}>
                    Certificate: {statusLabel(selected.certificate.status)}
                  </AdminChip>
                </div>
              }
            >
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <p className={MICRO_LABEL}>Contact</p>
                  <p className="text-sm text-admin-ink">{selected.contactName || '—'}</p>
                  <p className="text-sm text-admin-muted">{selected.email}</p>
                  <p className="text-sm text-admin-muted">{selected.phone || 'No phone'}</p>
                  {selected.website ? (
                    <a
                      href={selected.website.startsWith('http') ? selected.website : `https://${selected.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-sm text-himalayan hover:underline"
                    >
                      {selected.website} <ExternalLink size={12} aria-hidden />
                    </a>
                  ) : null}
                </div>
                <div className="space-y-1">
                  <p className={MICRO_LABEL}>Business address</p>
                  <p className="text-sm text-admin-ink">{selected.address?.line1 || '—'}</p>
                  {selected.address?.line2 ? <p className="text-sm text-admin-ink">{selected.address.line2}</p> : null}
                  <p className="text-sm text-admin-muted">
                    {[selected.address?.city, selected.address?.state, selected.address?.zip].filter(Boolean).join(', ') || '—'}
                  </p>
                  <p className="text-sm text-admin-muted">{selected.address?.country || 'United States'}</p>
                </div>
                <div className="space-y-1">
                  <p className={MICRO_LABEL}>Email verification</p>
                  {selected.emailVerifiedAt ? (
                    <p className="text-sm text-emerald-700 flex items-center gap-1.5">
                      <MailCheck size={14} aria-hidden /> Verified {formatDate(selected.emailVerifiedAt)}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-800 flex items-center gap-1.5">
                      <AlertTriangle size={14} aria-hidden /> Not verified yet
                    </p>
                  )}
                </div>
                <div className="space-y-1">
                  <p className={MICRO_LABEL}>Declaration</p>
                  {selected.declaration ? (
                    <p className="text-sm text-admin-ink">
                      Signed &ldquo;{selected.declaration.name}&rdquo; on {selected.declaration.at || '—'}
                    </p>
                  ) : (
                    <p className="text-sm text-amber-800">No electronic signature on file</p>
                  )}
                </div>
                {selected.shippingAddress?.line1 ? (
                  <div className="space-y-1 sm:col-span-2">
                    <p className={MICRO_LABEL}>Shipping address</p>
                    <p className="text-sm text-admin-ink">
                      {[
                        selected.shippingAddress.line1,
                        selected.shippingAddress.line2,
                        selected.shippingAddress.city,
                        selected.shippingAddress.state,
                        selected.shippingAddress.zip,
                      ]
                        .filter(Boolean)
                        .join(', ')}
                    </p>
                  </div>
                ) : null}
              </div>
            </AdminPanel>

            <AdminPanel
              title="Resale certificate"
              description={
                selected.certificate.state
                  ? `${selected.certificate.state} · ${selected.certificate.type.replace(/_/g, ' ').toLowerCase()}`
                  : 'No certificate on file'
              }
              action={
                selected.certificate.hasFile ? (
                  <AdminButton icon={BadgeCheck} onClick={() => void openCertificate(selected)} disabled={busy === 'FILE'}>
                    {busy === 'FILE' ? 'Opening…' : 'View certificate'}
                  </AdminButton>
                ) : (
                  <AdminChip tone="danger">No file</AdminChip>
                )
              }
            >
              <div className="grid gap-4 sm:grid-cols-2 mb-4">
                <div>
                  <p className={MICRO_LABEL}>Certificate number</p>
                  <p className="text-sm font-mono text-admin-ink">{selected.certificate.number || '—'}</p>
                </div>
                <div>
                  <p className={MICRO_LABEL}>Holder on certificate</p>
                  <p className="text-sm text-admin-ink">{selected.certificate.holder || '—'}</p>
                </div>
                <div>
                  <p className={MICRO_LABEL}>Expiry</p>
                  <p className="text-sm text-admin-ink">{selected.certificate.expires || 'No expiry supplied'}</p>
                </div>
                <div>
                  <p className={MICRO_LABEL}>File</p>
                  <p className="text-sm text-admin-ink">
                    {selected.certificate.fileName || '—'}
                    {selected.certificate.fileSize
                      ? ` · ${(selected.certificate.fileSize / 1024).toFixed(0)} KB`
                      : ''}
                  </p>
                </div>
              </div>

              {selected.certificate.verification ? (
                <div className="space-y-2">
                  <p className={MICRO_LABEL}>Automated checks</p>
                  <ul className="space-y-1.5">
                    {selected.certificate.verification.checks.map((check) => (
                      <li key={check.id} className="flex items-start gap-2 text-sm">
                        <AdminChip tone={outcomeTone(check.outcome)}>{check.outcome.replace('_', ' ')}</AdminChip>
                        <span className="text-admin-ink">
                          <span className="font-medium">{check.label}.</span>{' '}
                          <span className="text-admin-muted">{check.detail}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="text-xs text-admin-muted pt-1">
                    Runs at {formatDate(selected.certificate.verification.evaluatedAt)}. These checks never approve an
                    account — the owner&apos;s decision below does.
                  </p>
                </div>
              ) : (
                <AdminNotice tone="warning" title="No automated checks recorded">
                  This application has no stored verification evidence. Run a recheck, or review the certificate by eye.
                </AdminNotice>
              )}

              {selected.certificate.verification?.missing.length ? (
                <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
                  <p className="text-xs font-semibold text-amber-900 mb-1">Waiting on the applicant</p>
                  <ul className="list-disc pl-5 text-sm text-amber-900/90 space-y-0.5">
                    {selected.certificate.verification.missing.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap items-center gap-3">
                <a
                  href={state?.lookupUrl ?? selected.certificate.officialUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-semibold text-himalayan hover:underline"
                >
                  {state ? state.authority : 'Official authority'} — verify by hand
                  <ExternalLink size={13} aria-hidden />
                </a>
                {state ? <span className="text-xs text-admin-muted">{state.notes}</span> : null}
              </div>
            </AdminPanel>

            <AdminPanel title="Review actions" description="Every action below is written to the audit trail.">
              <AdminField label="Reviewer note" hint="Kept on the certificate record and shown to the team only." htmlFor="review-note">
                <textarea
                  id="review-note"
                  className={TEXTAREA}
                  rows={3}
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="e.g. Checked the Texas Comptroller permit lookup on 22 Oct; number active and name matches."
                />
              </AdminField>

              <div className="mt-4 flex flex-wrap gap-2">
                <AdminButton
                  variant="primary"
                  icon={ShieldCheck}
                  onClick={() => void runDecision('APPROVED')}
                  disabled={Boolean(busy)}
                >
                  Approve buyer
                </AdminButton>
                <AdminButton
                  icon={FileWarning}
                  onClick={() => void runDecision('MORE_INFO_REQUIRED')}
                  disabled={Boolean(busy)}
                >
                  Request information
                </AdminButton>
                <AdminButton
                  icon={UserX}
                  onClick={() => void runDecision('SUSPENDED')}
                  disabled={Boolean(busy)}
                >
                  Suspend
                </AdminButton>
                <AdminButton
                  variant="danger"
                  icon={ShieldAlert}
                  onClick={() => void runDecision('REJECTED')}
                  disabled={Boolean(busy)}
                >
                  Reject
                </AdminButton>
                <AdminButton icon={RefreshCw} onClick={() => void runReview('RECHECK')} disabled={Boolean(busy)}>
                  Recheck checks
                </AdminButton>
                <AdminButton onClick={() => void runReview('REVERIFY')} disabled={Boolean(busy)}>
                  Request renewal
                </AdminButton>
                <AdminButton variant="ghost" onClick={() => void runReview('NOTE')} disabled={Boolean(busy)}>
                  Save note
                </AdminButton>
              </div>

              {selected.certificate.notes ? (
                <div className="mt-4 rounded-xl bg-admin-canvas p-3">
                  <p className={MICRO_LABEL}>Last saved note</p>
                  <p className="text-sm text-admin-ink whitespace-pre-wrap">{selected.certificate.notes}</p>
                  <p className="text-xs text-admin-muted mt-1">
                    {selected.certificate.reviewedBy || '—'} · {formatDate(selected.certificate.reviewedAt)}
                  </p>
                </div>
              ) : null}
            </AdminPanel>

            <AdminPanel title="Activity" description="Every recorded action on this application." bodyClassName="p-0">
              <AdminTable columns={[{ key: 'at', label: 'When' }, { key: 'action', label: 'Action' }, { key: 'actor', label: 'Actor' }]} minWidth="420px">
                {timeline.length ? (
                  timeline.map((entry, index) => (
                    <tr key={`${entry.id ?? index}`}>
                      <td className={ADMIN_TD}>{formatDate(String(entry.at ?? ''))}</td>
                      <td className={ADMIN_TD}>{String(entry.action ?? '').replace(/_/g, ' ')}</td>
                      <td className={ADMIN_TD}>{String(entry.actor ?? '—')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className={ADMIN_TD} colSpan={3}>
                      <div className="py-6 text-center text-sm text-admin-muted">No activity recorded yet.</div>
                    </td>
                  </tr>
                )}
              </AdminTable>
            </AdminPanel>
          </div>
        ) : (
          <AdminPanel title="Select an application">
            <div className="py-16 text-center text-sm text-admin-muted">
              <CheckCircle2 size={28} className="mx-auto mb-3 text-admin-muted/60" aria-hidden />
              Choose an application on the left to review its certificate and record a decision.
            </div>
          </AdminPanel>
        )}
      </div>
      {pendingDecision && selected ? <AdminModal title="Confirm buyer decision" onClose={() => setPendingDecision(null)} footer={<>
        <AdminButton variant="secondary" onClick={() => setPendingDecision(null)}>Cancel</AdminButton>
        <AdminButton onClick={() => void runDecision(pendingDecision, true)}>Confirm decision</AdminButton>
      </>}>
        <p className="text-sm text-admin-ink break-words">{selected.company} — {pendingDecision.replaceAll('_', ' ')}.</p>
        <p className="mt-3 text-sm text-admin-muted">This updates wholesale access and records your identity and review note in the audit trail. It does not verify a government record or take payment.</p>
        {note.trim() ? <p className="mt-3 text-sm whitespace-pre-wrap break-words">Review note: {note}</p> : null}
      </AdminModal> : null}
    </div>
  );
}
