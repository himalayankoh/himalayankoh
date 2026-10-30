'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  EnvelopeSimple,
  ShieldCheck,
  CheckCircle,
  WarningCircle,
  ArrowsClockwise,
  Key,
  PaperPlaneRight,
  Globe,
  Sliders,
  Check,
  X,
  Lock,
} from '@phosphor-icons/react';
import { getAccessToken } from '@/services/wordpressAdminAuth';
import type { ClientMailboxView, MailboxEmail } from '@/lib/email/accountConfig';

interface TestResult {
  ok: boolean;
  status: string;
  serverGreeting?: string;
  serverReply?: string;
  error?: string;
}

export default function EmailAccountsPanel() {
  const [accounts, setAccounts] = useState<ClientMailboxView[]>([]);
  const [loading, setLoading] = useState(true);
  const [edits, setEdits] = useState<Record<string, { smtpUser?: string; smtpPass?: string; imapUser?: string; imapPass?: string; smtpHost?: string; smtpPort?: string; imapHost?: string; imapPort?: string }>>({});
  const [expandedAdvanced, setExpandedAdvanced] = useState<Record<string, boolean>>({});
  const [testingSmtp, setTestingSmtp] = useState<Record<string, boolean>>({});
  const [testingImap, setTestingImap] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [testResults, setTestResults] = useState<Record<string, { smtp?: TestResult; imap?: TestResult }>>({});
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err' | 'warn'; text: string } | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token = getAccessToken();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }, []);

  const loadAccounts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/email/accounts', {
        headers: authHeaders(),
        cache: 'no-store',
      });
      const data = await res.json();
      if (data.ok && Array.isArray(data.accounts)) {
        setAccounts(data.accounts);
      } else {
        setNotice({ kind: 'err', text: data.error || 'Failed to load email accounts.' });
      }
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : 'Error loading email accounts.' });
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  const setField = (mailbox: string, field: string, val: string) => {
    setEdits((prev) => ({
      ...prev,
      [mailbox]: {
        ...(prev[mailbox] || {}),
        [field]: val,
      },
    }));
  };

  const handleTestSmtp = async (mailbox: MailboxEmail) => {
    setTestingSmtp((prev) => ({ ...prev, [mailbox]: true }));
    setNotice(null);
    const mailboxEdits = edits[mailbox] || {};

    try {
      const res = await fetch('/api/admin/email/test-smtp', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          mailbox,
          user: mailboxEdits.smtpUser,
          pass: mailboxEdits.smtpPass,
          host: mailboxEdits.smtpHost,
          port: mailboxEdits.smtpPort,
        }),
      });
      const data: TestResult = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [mailbox]: { ...(prev[mailbox] || {}), smtp: data },
      }));

      if (data.ok) {
        setNotice({
          kind: 'ok',
          text: `[${mailbox}] SMTPS Port 465 Authentication Passed! ${data.serverReply || ''}`,
        });
        await loadAccounts();
      } else {
        setNotice({
          kind: 'err',
          text: `[${mailbox}] SMTPS Authentication Failed: ${data.error || 'Check mailbox password.'}`,
        });
      }
    } catch (err) {
      setNotice({
        kind: 'err',
        text: `[${mailbox}] Network error during SMTP test: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTestingSmtp((prev) => ({ ...prev, [mailbox]: false }));
    }
  };

  const handleTestImap = async (mailbox: MailboxEmail) => {
    setTestingImap((prev) => ({ ...prev, [mailbox]: true }));
    setNotice(null);
    const mailboxEdits = edits[mailbox] || {};

    try {
      const res = await fetch('/api/admin/email/test-imap', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          mailbox,
          user: mailboxEdits.imapUser || mailboxEdits.smtpUser,
          pass: mailboxEdits.imapPass || mailboxEdits.smtpPass,
          host: mailboxEdits.imapHost,
          port: mailboxEdits.imapPort,
        }),
      });
      const data: TestResult = await res.json();
      setTestResults((prev) => ({
        ...prev,
        [mailbox]: { ...(prev[mailbox] || {}), imap: data },
      }));

      if (data.ok) {
        setNotice({
          kind: 'ok',
          text: `[${mailbox}] IMAPS Port 993 Connection Passed! ${data.serverReply || ''}`,
        });
        await loadAccounts();
      } else {
        setNotice({
          kind: 'err',
          text: `[${mailbox}] IMAPS Connection Failed: ${data.error || 'Check mailbox password.'}`,
        });
      }
    } catch (err) {
      setNotice({
        kind: 'err',
        text: `[${mailbox}] Network error during IMAP test: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setTestingImap((prev) => ({ ...prev, [mailbox]: false }));
    }
  };

  const handleSave = async (mailbox: MailboxEmail) => {
    setSaving((prev) => ({ ...prev, [mailbox]: true }));
    setNotice(null);
    const mailboxEdits = edits[mailbox] || {};

    try {
      const res = await fetch('/api/admin/email/accounts', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          mailbox,
          smtpUser: mailboxEdits.smtpUser,
          smtpPass: mailboxEdits.smtpPass,
          imapUser: mailboxEdits.imapUser || mailboxEdits.smtpUser,
          imapPass: mailboxEdits.imapPass || mailboxEdits.smtpPass,
          smtpHost: mailboxEdits.smtpHost,
          smtpPort: mailboxEdits.smtpPort,
          imapHost: mailboxEdits.imapHost,
          imapPort: mailboxEdits.imapPort,
        }),
      });
      const data = await res.json();

      if (data.ok && data.account) {
        setNotice({ kind: 'ok', text: `Credentials for ${mailbox} saved securely in server store.` });
        // Clear local edits for this mailbox
        setEdits((prev) => {
          const next = { ...prev };
          delete next[mailbox];
          return next;
        });
        await loadAccounts();
      } else {
        setNotice({ kind: 'err', text: data.error || 'Failed to save credentials.' });
      }
    } catch (err) {
      setNotice({ kind: 'err', text: err instanceof Error ? err.message : 'Error saving credentials.' });
    } finally {
      setSaving((prev) => ({ ...prev, [mailbox]: false }));
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700">
              <EnvelopeSimple weight="fill" className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-950">Email Accounts &amp; Mailbox Authentication</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure authenticated business mailboxes for Himalayan Koh. Passwords remain server-side and are never exposed to browser bundles.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={loadAccounts}
            disabled={loading}
            className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
          >
            <ArrowsClockwise className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Accounts
          </button>
        </div>

        {/* Global Infrastructure Indicators */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-slate-100 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Outbound SMTPS</span>
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              premium164:465 TLS
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Inbound IMAPS</span>
            <div className="flex items-center gap-1.5 font-bold text-slate-900">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              premium164:993 TLS
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Incoming MX Cluster</span>
            <div className="flex items-center gap-1.5 font-bold text-slate-900 truncate" title="mx1-hosting.jellyfish.systems">
              <span className="w-2 h-2 rounded-full bg-indigo-500" />
              jellyfish.systems
            </div>
          </div>
          <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">SPF &bull; DKIM &bull; DMARC</span>
            <div className="flex items-center gap-1.5 font-bold text-emerald-700">
              <ShieldCheck weight="fill" className="w-3.5 h-3.5 text-emerald-600" />
              DNS Authenticated
            </div>
          </div>
        </div>
      </div>

      {/* Global Alerts / Notices */}
      {notice && (
        <div
          className={`p-4 rounded-xl border flex items-start gap-3 text-xs ${
            notice.kind === 'ok'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : notice.kind === 'warn'
              ? 'bg-amber-50 border-amber-200 text-amber-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          {notice.kind === 'ok' ? (
            <CheckCircle weight="fill" className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          ) : (
            <WarningCircle weight="fill" className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          )}
          <div className="flex-1 font-medium">{notice.text}</div>
          <button type="button" onClick={() => setNotice(null)} className="p-1 hover:opacity-75">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Mailbox Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {accounts.map((acc) => {
          const mailboxEdits = edits[acc.mailbox] || {};
          const isTestingSmtp = testingSmtp[acc.mailbox];
          const isTestingImap = testingImap[acc.mailbox];
          const isSaving = saving[acc.mailbox];
          const isAdvExpanded = expandedAdvanced[acc.mailbox];
          const res = testResults[acc.mailbox];

          const hasPassword = acc.hasSmtpPass || Boolean(mailboxEdits.smtpPass);

          return (
            <div
              key={acc.mailbox}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4 flex flex-col justify-between"
            >
              <div className="space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-bold text-slate-950">{acc.mailbox}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                        {acc.label}
                      </span>
                    </div>
                    <span className="text-xs text-slate-500 block mt-0.5">{acc.displayName}</span>
                  </div>

                  {/* Badges */}
                  <div className="flex flex-col items-end gap-1">
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        acc.smtpStatus === 'authenticated'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : acc.hasSmtpPass
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      SMTP: {acc.smtpStatus === 'authenticated' ? 'Authenticated' : acc.hasSmtpPass ? 'Configured' : 'Unset'}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border ${
                        acc.imapStatus === 'authenticated'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : acc.hasImapPass
                          ? 'bg-blue-50 text-blue-700 border-blue-200'
                          : 'bg-slate-100 text-slate-500 border-slate-200'
                      }`}
                    >
                      IMAP: {acc.imapStatus === 'authenticated' ? 'Connected' : acc.hasImapPass ? 'Configured' : 'Unset'}
                    </span>
                  </div>
                </div>

                {/* Form Fields */}
                <div className="space-y-3 text-xs">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Mailbox Username / Address
                    </label>
                    <input
                      type="text"
                      value={mailboxEdits.smtpUser ?? acc.smtpUser}
                      onChange={(e) => setField(acc.mailbox, 'smtpUser', e.target.value)}
                      placeholder={acc.mailbox}
                      className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900 bg-slate-50/50"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1">
                      cPanel Mailbox Password
                    </label>
                    <div className="relative">
                      <input
                        type="password"
                        value={mailboxEdits.smtpPass ?? (acc.hasSmtpPass ? '••••••••' : '')}
                        onChange={(e) => setField(acc.mailbox, 'smtpPass', e.target.value)}
                        placeholder="Enter mailbox password created in cPanel"
                        className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono text-xs text-slate-900 bg-white"
                      />
                      {acc.hasSmtpPass && (
                        <span className="absolute right-3 top-2.5 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                          Stored Securely
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-0.5 block">
                      The dedicated password created for {acc.mailbox} in cPanel &rarr; Email Accounts.
                    </span>
                  </div>

                  {/* Advanced Toggle */}
                  <div>
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedAdvanced((prev) => ({
                          ...prev,
                          [acc.mailbox]: !prev[acc.mailbox],
                        }))
                      }
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Sliders className="w-3 h-3" />
                      {isAdvExpanded ? 'Hide Advanced Server Details' : 'Show Advanced Host & Ports'}
                    </button>

                    {isAdvExpanded && (
                      <div className="p-3 mt-2 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] font-bold text-slate-600 block">SMTP Host</span>
                            <input
                              type="text"
                              value={mailboxEdits.smtpHost ?? acc.smtpHost}
                              onChange={(e) => setField(acc.mailbox, 'smtpHost', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-600 block">SMTP Port (SMTPS)</span>
                            <input
                              type="number"
                              value={mailboxEdits.smtpPort ?? acc.smtpPort}
                              onChange={(e) => setField(acc.mailbox, 'smtpPort', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <span className="text-[10px] font-bold text-slate-600 block">IMAP Host</span>
                            <input
                              type="text"
                              value={mailboxEdits.imapHost ?? acc.imapHost}
                              onChange={(e) => setField(acc.mailbox, 'imapHost', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] font-bold text-slate-600 block">IMAP Port (IMAPS)</span>
                            <input
                              type="number"
                              value={mailboxEdits.imapPort ?? acc.imapPort}
                              onChange={(e) => setField(acc.mailbox, 'imapPort', e.target.value)}
                              className="w-full px-2 py-1.5 rounded-lg border border-slate-300 text-xs font-mono bg-white"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Inline Test Result Alert */}
                {res && (
                  <div className="space-y-1.5 pt-1">
                    {res.smtp && (
                      <div
                        className={`p-2 rounded-lg text-[11px] font-mono flex items-center justify-between ${
                          res.smtp.ok
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        <span>SMTP (465): {res.smtp.ok ? 'AUTH SUCCESS' : 'AUTH FAILED'}</span>
                        <span className="text-[10px] truncate max-w-[200px]" title={res.smtp.serverReply || res.smtp.error}>
                          {res.smtp.serverReply || res.smtp.error}
                        </span>
                      </div>
                    )}
                    {res.imap && (
                      <div
                        className={`p-2 rounded-lg text-[11px] font-mono flex items-center justify-between ${
                          res.imap.ok
                            ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                            : 'bg-rose-50 text-rose-800 border border-rose-200'
                        }`}
                      >
                        <span>IMAP (993): {res.imap.ok ? 'LOGIN SUCCESS' : 'LOGIN FAILED'}</span>
                        <span className="text-[10px] truncate max-w-[200px]" title={res.imap.serverReply || res.imap.error}>
                          {res.imap.serverReply || res.imap.error}
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleTestSmtp(acc.mailbox)}
                    disabled={isTestingSmtp || !hasPassword}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                    title="Test SMTP Authentication against port 465 TLS"
                  >
                    <Key className={`w-3.5 h-3.5 ${isTestingSmtp ? 'animate-spin' : ''}`} />
                    Test SMTP
                  </button>

                  <button
                    type="button"
                    onClick={() => handleTestImap(acc.mailbox)}
                    disabled={isTestingImap || !hasPassword}
                    className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-semibold flex items-center gap-1 transition cursor-pointer disabled:opacity-40"
                    title="Test IMAP Incoming Access against port 993 TLS"
                  >
                    <Globe className={`w-3.5 h-3.5 ${isTestingImap ? 'animate-spin' : ''}`} />
                    Test Incoming (IMAP)
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleSave(acc.mailbox)}
                  disabled={isSaving}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold flex items-center gap-1 shadow-2xs transition cursor-pointer disabled:opacity-50"
                >
                  <Lock weight="bold" className={`w-3.5 h-3.5 ${isSaving ? 'animate-spin' : ''}`} />
                  Save Securely
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
