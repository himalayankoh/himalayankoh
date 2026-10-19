'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  EnvelopeSimple,
  PaperPlaneRight,
  PencilSimple,
  Trash,
  Archive,
  WarningCircle,
  CheckCircle,
  Star,
  ArrowsClockwise,
  MagnifyingGlass,
  Plus,
  X,
  CaretRight,
  CaretDown,
  Paperclip,
  ArrowBendUpLeft,
  ArrowBendDoubleUpLeft,
  ArrowSquareOut,
  ShieldCheck,
  Tag,
  User,
  Buildings,
  ArrowLeft,
  Check,
} from '@phosphor-icons/react';
import type {
  InboxMessage,
  InboxThread,
  InboxFolderCounts,
  InboxFilterFolder,
  MailboxAddress,
  InboxInfrastructureStatus,
  MailboxStatusInfo,
} from '@/lib/email/inboxStore';

export default function EmailInboxAdmin() {
  const [activeFolder, setActiveFolder] = useState<InboxFilterFolder>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'leados' | 'inquiries'>('all');

  const [threads, setThreads] = useState<InboxThread[]>([]);
  const [counts, setCounts] = useState<InboxFolderCounts | null>(null);
  const [mailboxes, setMailboxes] = useState<MailboxStatusInfo[]>([]);
  const [infrastructure, setInfrastructure] = useState<InboxInfrastructureStatus | null>(null);
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);

  // Progressive Mobile Navigation States
  const [mobileView, setMobileView] = useState<'list' | 'thread'>('list');
  const [mobileMailboxDrawerOpen, setMobileMailboxDrawerOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Compose Modal State
  const [isComposeOpen, setIsComposeOpen] = useState(false);
  const [composeMailbox, setComposeMailbox] = useState<MailboxAddress>('sales@himalayankoh.com');
  const [composeTo, setComposeTo] = useState('');
  const [composeCc, setComposeCc] = useState('');
  const [showCc, setShowCc] = useState(false);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeAttachments, setComposeAttachments] = useState<
    Array<{ filename: string; mimeType: string; sizeBytes: number; contentBase64?: string }>
  >([]);
  const [sendingDraft, setSendingDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [composeError, setComposeError] = useState<string | null>(null);
  const [composeSuccess, setComposeSuccess] = useState<string | null>(null);

  // Inline Reply State
  const [quickReplyBody, setQuickReplyBody] = useState('');
  const [sendingQuickReply, setSendingQuickReply] = useState(false);

  const getAuthToken = (): string => {
    try {
      const stored = localStorage.getItem('luxedge_sb_session');
      if (!stored) return '';
      const parsed = JSON.parse(stored);
      return parsed.accessToken || parsed.token || '';
    } catch {
      return '';
    }
  };

  const fetchInbox = useCallback(
    async (forceSync = false) => {
      if (forceSync) setRefreshing(true);
      setError(null);
      try {
        const token = getAuthToken();
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const params = new URLSearchParams({
          folder: activeFolder,
          ...(searchQuery ? { search: searchQuery } : {}),
          ...(forceSync ? { sync: 'true' } : {}),
        });

        const res = await fetch(`/api/admin/inbox?${params.toString()}`, {
          headers,
          credentials: 'include',
        });
        const data = await res.json();
        if (!res.ok || !data.ok) {
          throw new Error(data.error || 'Failed to load inbox');
        }

        setThreads(data.threads || []);
        setCounts(data.counts || null);
        setMailboxes(data.mailboxes || []);
        setInfrastructure(data.infrastructure || null);

        // On desktop, auto-select first thread if none is selected
        if (data.threads && data.threads.length > 0) {
          setSelectedThreadId((prev) => {
            const exists = data.threads.some((t: InboxThread) => t.threadId === prev);
            return exists ? prev : (typeof window !== 'undefined' && window.innerWidth >= 768 ? data.threads[0].threadId : prev);
          });
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to connect to email inbox');
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [activeFolder, searchQuery]
  );

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const selectedThread = useMemo(() => {
    return threads.find((t) => t.threadId === selectedThreadId) || null;
  }, [threads, selectedThreadId]);

  const filteredThreads = useMemo(() => {
    if (filterType === 'leados') {
      return threads.filter((t) =>
        t.messages.some((m) => m.leadId || m.labels?.includes('LeadOS Prospect'))
      );
    }
    if (filterType === 'inquiries') {
      return threads.filter((t) =>
        t.messages.some((m) => m.labels?.includes('Website Inquiry') || m.leadStage === 'inquiry')
      );
    }
    return threads;
  }, [threads, filterType]);

  const handleMessageOperation = async (operation: string, targetFolder?: string) => {
    if (!selectedThread) return;
    try {
      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/inbox', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'update_message',
          threadId: selectedThread.threadId,
          operation,
          targetFolder,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Operation failed');
      }
      if (typeof window !== 'undefined' && window.innerWidth < 768) {
        setMobileView('list');
      }
      fetchInbox();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Operation failed');
    }
  };

  const handleSendCompose = async (isDraft = false) => {
    if (isDraft) {
      setSavingDraft(true);
    } else {
      setSendingDraft(true);
    }
    setComposeError(null);
    setComposeSuccess(null);

    if (!isDraft && !composeTo.trim()) {
      setComposeError('Recipient email is required.');
      setSendingDraft(false);
      return;
    }

    try {
      const token = getAuthToken();
      const action = isDraft ? 'save_draft' : 'send';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/inbox', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action,
          mailbox: composeMailbox,
          to: composeTo,
          cc: composeCc || undefined,
          subject: composeSubject,
          bodyText: composeBody,
          attachments: composeAttachments,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || (isDraft ? 'Failed to save draft' : 'Failed to send email'));
      }

      setComposeSuccess(isDraft ? 'Draft saved in Drafts folder.' : 'Email sent successfully via Namecheap cPanel infrastructure.');
      setTimeout(() => {
        setIsComposeOpen(false);
        setComposeTo('');
        setComposeCc('');
        setComposeSubject('');
        setComposeBody('');
        setComposeAttachments([]);
        setComposeSuccess(null);
        fetchInbox();
      }, 1000);
    } catch (err) {
      setComposeError(err instanceof Error ? err.message : 'Failed to process email');
    } finally {
      setSavingDraft(false);
      setSendingDraft(false);
    }
  };

  const handleSendQuickReply = async () => {
    if (!selectedThread || !quickReplyBody.trim()) return;
    setSendingQuickReply(true);
    try {
      const lastMsg = selectedThread.messages[selectedThread.messages.length - 1];
      const replyTo =
        lastMsg.direction === 'inbound'
          ? lastMsg.from.email
          : lastMsg.to[0]?.email || 'sales@himalayankoh.com';

      const token = getAuthToken();
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = `Bearer ${token}`;

      const res = await fetch('/api/admin/inbox', {
        method: 'POST',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          action: 'reply',
          threadId: selectedThread.threadId,
          replyToMessageId: lastMsg.id,
          mailbox: lastMsg.mailbox || 'sales@himalayankoh.com',
          to: replyTo,
          subject: lastMsg.subject.startsWith('Re:') ? lastMsg.subject : `Re: ${lastMsg.subject}`,
          bodyText: quickReplyBody,
          leadId: selectedThread.messages.find((m) => m.leadId)?.leadId || null,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to dispatch reply');
      }

      setQuickReplyBody('');
      fetchInbox();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to send reply');
    } finally {
      setSendingQuickReply(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.size > 2 * 1024 * 1024) {
        alert(`File "${file.name}" exceeds the 2MB size limit.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        const base64 = (event.target?.result as string)?.split(',')[1] || '';
        setComposeAttachments((prev) => [
          ...prev,
          {
            filename: file.name,
            mimeType: file.type || 'application/octet-stream',
            sizeBytes: file.size,
            contentBase64: base64,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }
  };

  const selectFolder = (folder: InboxFilterFolder) => {
    setActiveFolder(folder);
    setMobileMailboxDrawerOpen(false);
    setMobileView('list');
  };

  const getFolderLabel = (f: InboxFilterFolder): string => {
    switch (f) {
      case 'all': return 'All Inboxes';
      case 'salman': return 'Salman';
      case 'sales': return 'Sales & Wholesale';
      case 'support': return 'Support';
      case 'admin': return 'Admin';
      case 'unread': return 'Unread';
      case 'sent': return 'Sent';
      case 'drafts': return 'Drafts';
      case 'spam': return 'Spam';
      case 'archive': return 'Archive';
      case 'trash': return 'Trash';
      default: return f;
    }
  };

  const renderMailboxAndFoldersList = () => (
    <div className="flex flex-col h-full select-none text-sm">
      <div className="p-4 border-b border-slate-800 hidden md:block">
        <button
          onClick={() => {
            setIsComposeOpen(true);
            setComposeError(null);
            setComposeSuccess(null);
          }}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold py-2.5 px-4 shadow-lg shadow-amber-500/20 transition-all cursor-pointer"
        >
          <PencilSimple size={18} weight="bold" />
          <span>Compose Email</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1">
        <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Mailboxes
        </div>
        <button
          onClick={() => selectFolder('all')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'all'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <EnvelopeSimple size={16} />
            All Inboxes
          </span>
          {counts && counts.allUnread > 0 && (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-500 text-slate-950">
              {counts.allUnread}
            </span>
          )}
        </button>

        <button
          onClick={() => selectFolder('salman')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'salman'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <User size={16} />
            Salman
          </span>
          {counts && counts.salmanUnread > 0 && (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-500 text-slate-950">
              {counts.salmanUnread}
            </span>
          )}
        </button>

        <button
          onClick={() => selectFolder('sales')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'sales'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Buildings size={16} />
            Sales & Wholesale
          </span>
          {counts && counts.salesUnread > 0 && (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-500 text-slate-950">
              {counts.salesUnread}
            </span>
          )}
        </button>

        <button
          onClick={() => selectFolder('support')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'support'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <ShieldCheck size={16} />
            Support
          </span>
          {counts && counts.supportUnread > 0 && (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-500 text-slate-950">
              {counts.supportUnread}
            </span>
          )}
        </button>

        <button
          onClick={() => selectFolder('admin')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'admin'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <User size={16} />
            Admin
          </span>
          {counts && counts.adminUnread > 0 && (
            <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-amber-500 text-slate-950">
              {counts.adminUnread}
            </span>
          )}
        </button>

        <div className="pt-3 pb-1 px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Folders
        </div>

        <button
          onClick={() => selectFolder('unread')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'unread'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <span className="w-2 h-2 rounded-full bg-amber-400" />
            Unread
          </span>
          {counts && counts.unread > 0 && (
            <span className="text-[11px] text-slate-400">{counts.unread}</span>
          )}
        </button>

        <button
          onClick={() => selectFolder('sent')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'sent'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <PaperPlaneRight size={16} />
            Sent
          </span>
          {counts && counts.sent > 0 && <span className="text-[11px] text-slate-400">{counts.sent}</span>}
        </button>

        <button
          onClick={() => selectFolder('drafts')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'drafts'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <PencilSimple size={16} />
            Drafts
          </span>
          {counts && counts.drafts > 0 && (
            <span className="text-[11px] text-slate-400">{counts.drafts}</span>
          )}
        </button>

        <button
          onClick={() => selectFolder('archive')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'archive'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Archive size={16} />
            Archive
          </span>
        </button>

        <button
          onClick={() => selectFolder('spam')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'spam'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <WarningCircle size={16} />
            Spam
          </span>
        </button>

        <button
          onClick={() => selectFolder('trash')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg transition-colors text-xs ${
            activeFolder === 'trash'
              ? 'bg-amber-500/15 text-amber-300 font-semibold'
              : 'text-slate-300 hover:bg-slate-800/60'
          }`}
        >
          <span className="flex items-center gap-2.5">
            <Trash size={16} />
            Trash
          </span>
        </button>
      </div>

      {/* Domain Email & cPanel Status Footer Card */}
      {infrastructure && (
        <div className="p-3 border-t border-slate-800 text-xs text-slate-400 space-y-2 bg-slate-950/60">
          <div className="font-semibold text-slate-300 flex items-center justify-between">
            <span>Domain Email Status</span>
            <span className="flex items-center gap-1 text-emerald-400 font-mono text-[11px]">
              <CheckCircle size={13} weight="fill" /> Active
            </span>
          </div>
          <div className="space-y-1 font-mono text-[11px]">
            <div className="flex justify-between">
              <span>SPF</span>
              <span className="text-emerald-400">{infrastructure.spf.status}</span>
            </div>
            <div className="flex justify-between">
              <span>DKIM</span>
              <span className="text-emerald-400">{infrastructure.dkim.status}</span>
            </div>
            <div className="flex justify-between">
              <span>DMARC</span>
              <span className="text-emerald-400">{infrastructure.dmarc.status}</span>
            </div>
          </div>
          <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-800/60 truncate" title={infrastructure.primaryMx}>
            MX: {infrastructure.primaryMx}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex h-[calc(100vh-5rem)] w-full overflow-hidden bg-slate-950 text-slate-100 relative">
      {/* 1. LEFT PANE — DESKTOP ONLY */}
      <div className="hidden md:flex md:w-64 flex-shrink-0 flex-col border-r border-slate-800 bg-slate-900/90 select-none">
        {renderMailboxAndFoldersList()}
      </div>

      {/* MOBILE MAILBOX DRAWER / BOTTOM SHEET */}
      {mobileMailboxDrawerOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-xs">
          <div className="absolute inset-0" onClick={() => setMobileMailboxDrawerOpen(false)} />
          <div className="relative bg-slate-900 border-t border-slate-700 rounded-t-2xl max-h-[80vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-3 border-b border-slate-800 flex items-center justify-between bg-slate-950">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Select Mailbox / Folder
              </span>
              <button
                onClick={() => setMobileMailboxDrawerOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white"
              >
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {renderMailboxAndFoldersList()}
            </div>
          </div>
        </div>
      )}

      {/* 2. CENTER PANE — THREAD / MESSAGE LIST */}
      <div
        className={`w-full md:w-80 lg:w-96 flex-shrink-0 flex flex-col border-r border-slate-800 bg-slate-900/40 ${
          mobileView === 'thread' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {/* Mobile Header Bar */}
        <div className="md:hidden p-3 border-b border-slate-800 bg-slate-900 flex items-center justify-between gap-2 shrink-0">
          <button
            onClick={() => setMobileMailboxDrawerOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold hover:bg-slate-700 transition-colors"
          >
            <EnvelopeSimple size={16} className="text-amber-400" />
            <span className="truncate max-w-[130px]">{getFolderLabel(activeFolder)}</span>
            {counts && counts.allUnread > 0 && activeFolder === 'all' && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500 text-slate-950 font-bold">
                {counts.allUnread}
              </span>
            )}
            <CaretDown size={12} className="text-slate-400" />
          </button>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMobileSearchOpen(!mobileSearchOpen)}
              className={`p-2 rounded-lg text-slate-300 hover:text-white transition-colors ${
                mobileSearchOpen ? 'bg-amber-500/20 text-amber-300' : 'bg-slate-800'
              }`}
              aria-label="Toggle search"
            >
              <MagnifyingGlass size={16} />
            </button>
            <button
              onClick={() => fetchInbox(true)}
              disabled={refreshing}
              className="p-2 rounded-lg bg-slate-800 text-slate-300 hover:text-white disabled:opacity-50 transition-colors"
              aria-label="Refresh"
            >
              <ArrowsClockwise size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={() => {
                setIsComposeOpen(true);
                setComposeError(null);
                setComposeSuccess(null);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-semibold text-xs shadow-md shadow-amber-500/20 active:scale-95 transition-transform"
            >
              <PencilSimple size={14} weight="bold" />
              <span>Compose</span>
            </button>
          </div>
        </div>

        {/* Search & Refresh Toolbar (Desktop always, mobile conditionally) */}
        <div className={`p-3 border-b border-slate-800 space-y-2 ${mobileSearchOpen ? 'block' : 'hidden md:block'}`}>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MagnifyingGlass
                size={16}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                placeholder="Search messages..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-slate-950/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-200 placeholder:text-slate-400 focus:outline-none focus:border-amber-500"
              />
            </div>
            <button
              onClick={() => fetchInbox(true)}
              disabled={refreshing}
              title="Sync & Refresh Inbox"
              className="hidden md:flex p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-50 transition-colors"
            >
              <ArrowsClockwise size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
          </div>
        </div>

        {/* Filter Pills */}
        <div className="px-3 py-2 border-b border-slate-800/80 flex items-center gap-1.5 text-xs overflow-x-auto no-scrollbar">
          <button
            onClick={() => setFilterType('all')}
            className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors ${
              filterType === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            All ({threads.length})
          </button>
          <button
            onClick={() => setFilterType('leados')}
            className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors ${
              filterType === 'leados'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            LeadOS Prospects
          </button>
          <button
            onClick={() => setFilterType('inquiries')}
            className={`px-2.5 py-1 rounded-full text-[11px] whitespace-nowrap transition-colors ${
              filterType === 'inquiries'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            Inquiries
          </button>
        </div>

        {/* Thread List */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/60 pb-20 md:pb-0">
          {loading ? (
            <div className="p-8 text-center text-sm text-slate-400">Loading messages...</div>
          ) : error ? (
            <div className="p-6 text-center text-sm text-red-400 space-y-2">
              <p>{error}</p>
              <button
                onClick={() => fetchInbox()}
                className="text-xs text-amber-400 underline hover:text-amber-300"
              >
                Retry
              </button>
            </div>
          ) : filteredThreads.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-400 space-y-1">
              <p>No messages in this folder.</p>
              <p className="text-xs text-slate-400">Sync to fetch real LeadOS and CRM activity.</p>
            </div>
          ) : (
            filteredThreads.map((thread) => {
              const latestMsg = thread.messages[thread.messages.length - 1];
              const isSelected = thread.threadId === selectedThreadId;
              const hasLead = Boolean(latestMsg.leadId || latestMsg.leadBusinessName);

              return (
                <div
                  key={thread.threadId}
                  onClick={() => {
                    setSelectedThreadId(thread.threadId);
                    setMobileView('thread');
                  }}
                  className={`p-3.5 cursor-pointer transition-colors relative ${
                    isSelected
                      ? 'bg-slate-800/80 md:border-l-4 md:border-amber-500'
                      : 'hover:bg-slate-800/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2 truncate">
                      {thread.unreadCount > 0 && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                      )}
                      <span
                        className={`text-xs truncate ${
                          thread.unreadCount > 0
                            ? 'font-bold text-slate-100'
                            : 'font-medium text-slate-300'
                        }`}
                      >
                        {latestMsg.direction === 'outbound'
                          ? `To: ${latestMsg.to[0]?.name || latestMsg.to[0]?.email || 'Recipient'}`
                          : latestMsg.from.name || latestMsg.from.email}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 flex-shrink-0">
                      {new Date(latestMsg.createdAt).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                      })}
                    </span>
                  </div>

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <div
                      className={`text-xs truncate ${
                        thread.unreadCount > 0 ? 'font-semibold text-slate-200' : 'text-slate-400'
                      }`}
                    >
                      {thread.subject || '(No subject)'}
                    </div>
                    {thread.messageCount > 1 && (
                      <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-800 text-slate-400 font-mono">
                        {thread.messageCount}
                      </span>
                    )}
                  </div>

                  <p className="mt-1 text-[11px] text-slate-400 line-clamp-1">
                    {latestMsg.snippet || latestMsg.bodyText}
                  </p>

                  <div className="mt-2 flex items-center gap-1.5 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-400">
                      {latestMsg.mailbox.split('@')[0]}
                    </span>
                    {hasLead && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/20 text-amber-300 flex items-center gap-1">
                        <Buildings size={11} /> {latestMsg.leadBusinessName || 'LeadOS Prospect'}
                      </span>
                    )}
                    {latestMsg.attachments && latestMsg.attachments.length > 0 && (
                      <span className="text-slate-400" title="Has attachment">
                        <Paperclip size={12} />
                      </span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* 3. RIGHT PANE — THREAD VIEW & COMPOSER */}
      <div
        className={`flex-1 flex flex-col bg-slate-950 overflow-hidden w-full ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}
      >
        {selectedThread ? (
          <div className="flex-1 flex flex-col h-full overflow-hidden">
            {/* Thread Header Toolbar (Compact Gmail style) */}
            <div className="p-2.5 md:p-3 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-900/80 shrink-0">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setMobileView('list')}
                  className="md:hidden flex items-center gap-1.5 text-xs text-amber-400 font-semibold px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors shrink-0"
                  aria-label="Back to inbox list"
                >
                  <ArrowLeft size={16} weight="bold" />
                  <span>Inbox</span>
                </button>

                <span className="hidden md:inline-flex px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300">
                  {selectedThread.mailbox}
                </span>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-1 text-slate-400 shrink-0">
                <button
                  onClick={() => handleMessageOperation('move_folder', 'archive')}
                  title="Archive thread"
                  className="p-2 rounded-lg hover:bg-slate-800 hover:text-slate-200 transition-colors"
                >
                  <Archive size={17} />
                </button>
                <button
                  onClick={() => handleMessageOperation('move_folder', 'spam')}
                  title="Mark as Spam"
                  className="p-2 rounded-lg hover:bg-slate-800 hover:text-amber-400 transition-colors"
                >
                  <WarningCircle size={17} />
                </button>
                <button
                  onClick={() => handleMessageOperation('move_folder', 'trash')}
                  title="Move to Trash"
                  className="p-2 rounded-lg hover:bg-slate-800 hover:text-red-400 transition-colors"
                >
                  <Trash size={17} />
                </button>
              </div>
            </div>

            {/* Dedicated Full-Width Subject Bar with Word-Wrap (Gmail mobile layout) */}
            <div className="px-3.5 py-2.5 md:px-5 md:py-3 border-b border-slate-800/80 bg-slate-950 shrink-0">
              <h1 className="text-sm md:text-base font-bold text-slate-100 break-words leading-snug">
                {selectedThread.subject || '(No subject)'}
              </h1>
              <div className="text-[11px] text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                <span className="md:hidden font-mono text-[10px] bg-slate-800/80 px-1.5 py-0.5 rounded text-slate-300">
                  {selectedThread.mailbox}
                </span>
                <span>{selectedThread.messages.length} message{selectedThread.messages.length > 1 ? 's' : ''}</span>
              </div>
            </div>

            {/* Linked LeadOS Prospect Banner (if applicable) */}
            {selectedThread.messages.some((m) => m.leadId || m.leadBusinessName) && (
              <div className="px-4 py-2 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between text-xs shrink-0">
                <div className="flex items-center gap-2 text-amber-200 truncate">
                  <Buildings size={16} className="text-amber-400 shrink-0" />
                  <span className="truncate">
                    LeadOS:{' '}
                    <strong>
                      {selectedThread.messages.find((m) => m.leadBusinessName)?.leadBusinessName ||
                        'Verified Prospect'}
                    </strong>
                  </span>
                </div>
                <a
                  href={`/admin/leados?tab=library&search=${encodeURIComponent(
                    selectedThread.messages.find((m) => m.leadBusinessName)?.leadBusinessName || ''
                  )}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-amber-400 hover:text-amber-300 font-medium underline shrink-0 text-[11px]"
                >
                  <span>View in LeadOS</span>
                  <ArrowSquareOut size={12} />
                </a>
              </div>
            )}

            {/* Thread Messages Stream */}
            <div className="flex-1 overflow-y-auto p-3 md:p-4 space-y-3 md:space-y-4">
              {selectedThread.messages.map((msg) => {
                const isOutbound = msg.direction === 'outbound';
                return (
                  <div
                    key={msg.id}
                    className={`rounded-xl border p-3.5 md:p-4 transition-all ${
                      isOutbound
                        ? 'bg-slate-900/80 border-slate-800 ml-2 md:ml-6'
                        : 'bg-slate-900/40 border-slate-800/80 mr-2 md:mr-6'
                    }`}
                  >
                    {/* Header */}
                    <div className="flex items-start justify-between gap-2 pb-2.5 border-b border-slate-800/60">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold text-xs md:text-sm text-slate-100 truncate">
                            {msg.from.name || msg.from.email}
                          </span>
                          <span className="text-[10px] md:text-xs text-slate-400 font-mono truncate">
                            &lt;{msg.from.email}&gt;
                          </span>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] md:text-[10px] font-semibold ${
                              isOutbound
                                ? 'bg-amber-500/20 text-amber-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {isOutbound ? 'OUTBOUND' : 'INBOUND'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 truncate">
                          To:{' '}
                          {msg.to.map((t) => `${t.name ? `${t.name} ` : ''}<${t.email}>`).join(', ')}
                        </div>
                      </div>

                      <div className="text-right text-[11px] text-slate-400 flex-shrink-0">
                        <div>
                          {new Date(msg.createdAt).toLocaleDateString(undefined, {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </div>
                        <div className="font-mono text-[10px] text-slate-400 mt-0.5">
                          {new Date(msg.createdAt).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                    </div>

                    {/* Body */}
                    <div className="pt-2.5 text-xs md:text-sm text-slate-200 leading-relaxed whitespace-pre-wrap font-sans break-words">
                      {msg.bodyText}
                    </div>

                    {/* Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-slate-800/60 space-y-1.5">
                        <div className="text-[11px] font-semibold text-slate-400 flex items-center gap-1.5">
                          <Paperclip size={13} />
                          Attachments ({msg.attachments.length})
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {msg.attachments.map((att) => (
                            <div
                              key={att.id}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-2 text-xs"
                            >
                              <span className="font-medium text-slate-300">{att.filename}</span>
                              <span className="text-slate-400 font-mono text-[10px]">
                                ({Math.round(att.sizeBytes / 1024)} KB)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Quick Reply Box */}
            <div className="p-3 md:p-4 border-t border-slate-800 bg-slate-900/90 shrink-0 pb-16 md:pb-4">
              <div className="space-y-2">
                <textarea
                  value={quickReplyBody}
                  onChange={(e) => setQuickReplyBody(e.target.value)}
                  placeholder="Type your reply here..."
                  rows={2}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-xs md:text-sm text-slate-100 placeholder:text-slate-400 focus:outline-none focus:border-amber-500 resize-none"
                />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-[11px] text-slate-400 truncate">
                    Replying as: <strong className="text-slate-300">{selectedThread.mailbox}</strong>
                  </div>
                  <button
                    onClick={handleSendQuickReply}
                    disabled={sendingQuickReply || !quickReplyBody.trim()}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs disabled:opacity-50 transition-all cursor-pointer shrink-0"
                  >
                    <PaperPlaneRight size={15} weight="bold" />
                    <span>{sendingQuickReply ? 'Sending...' : 'Send Reply'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-400 space-y-3">
            <EnvelopeSimple size={48} className="text-slate-700" />
            <h3 className="text-base font-semibold text-slate-300">Select an Email Thread</h3>
            <p className="text-xs text-slate-400 max-w-sm">
              View full correspondence histories, linked B2B LeadOS prospects, and reply securely using
              verified company identities.
            </p>
          </div>
        )}
      </div>

      {/* 4. COMPOSE EMAIL MODAL (Responsive: Full-screen on mobile, centered modal on desktop) */}
      {isComposeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full h-full md:h-auto md:max-w-2xl bg-slate-900 border-0 md:border md:border-slate-800 md:rounded-2xl shadow-2xl flex flex-col md:max-h-[90vh] overflow-hidden">
            {/* Modal Header */}
            <div className="px-4 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/90 shrink-0">
              <div className="flex items-center gap-2">
                <PencilSimple size={18} className="text-amber-400" />
                <h3 className="font-semibold text-slate-100 text-sm">New Message</h3>
              </div>
              <button
                onClick={() => {
                  if (composeSubject || composeBody) {
                    if (confirm('Discard unsaved email draft?')) {
                      setIsComposeOpen(false);
                    }
                  } else {
                    setIsComposeOpen(false);
                  }
                }}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 flex-1 overflow-y-auto space-y-3 text-xs">
              {composeError && (
                <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-300">
                  {composeError}
                </div>
              )}
              {composeSuccess && (
                <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                  {composeSuccess}
                </div>
              )}

              {/* From Selector */}
              <div className="flex items-center gap-2">
                <label className="w-14 text-slate-400 font-medium shrink-0">From:</label>
                <select
                  value={composeMailbox}
                  onChange={(e) => setComposeMailbox(e.target.value as MailboxAddress)}
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                >
                  <option value="sales@himalayankoh.com">
                    Commercial Sales &lt;sales@himalayankoh.com&gt;
                  </option>
                  <option value="salman@himalayankoh.com">
                    Salman &lt;salman@himalayankoh.com&gt;
                  </option>
                  <option value="support@himalayankoh.com">
                    Customer Support &lt;support@himalayankoh.com&gt;
                  </option>
                  <option value="admin@himalayankoh.com">
                    Administration &lt;admin@himalayankoh.com&gt;
                  </option>
                </select>
              </div>

              {/* To Input */}
              <div className="flex items-center gap-2">
                <label className="w-14 text-slate-400 font-medium shrink-0">To:</label>
                <input
                  type="email"
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="recipient@example.com"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={() => setShowCc(!showCc)}
                  className="text-slate-400 hover:text-slate-200 text-xs px-2 shrink-0"
                >
                  Cc
                </button>
              </div>

              {/* Collapsible CC */}
              {showCc && (
                <div className="flex items-center gap-2">
                  <label className="w-14 text-slate-400 font-medium shrink-0">Cc:</label>
                  <input
                    type="text"
                    value={composeCc}
                    onChange={(e) => setComposeCc(e.target.value)}
                    placeholder="colleague@example.com"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                  />
                </div>
              )}

              {/* Subject */}
              <div className="flex items-center gap-2">
                <label className="w-14 text-slate-400 font-medium shrink-0">Subject:</label>
                <input
                  type="text"
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  placeholder="Himalayan Mineral Salt Inquiry"
                  className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-500"
                />
              </div>

              {/* Body */}
              <div className="pt-1">
                <textarea
                  rows={8}
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  placeholder="Write your email message..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs text-slate-200 focus:outline-none focus:border-amber-500 resize-none font-sans leading-relaxed"
                />
              </div>

              {/* Attachments List & Upload */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 cursor-pointer">
                  <Paperclip size={15} />
                  <span>Attach File (Max 2MB)</span>
                  <input
                    type="file"
                    onChange={handleFileUpload}
                    className="hidden"
                    multiple
                  />
                </label>
                <div className="text-[11px] text-slate-400 font-mono">
                  {composeAttachments.length} attachment(s)
                </div>
              </div>

              {composeAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-1">
                  {composeAttachments.map((att, idx) => (
                    <div
                      key={idx}
                      className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] flex items-center gap-2"
                    >
                      <span className="text-slate-300">{att.filename}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setComposeAttachments((prev) => prev.filter((_, i) => i !== idx))
                        }
                        className="text-slate-400 hover:text-red-400"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="px-4 py-3 border-t border-slate-800 flex items-center justify-between bg-slate-950/90 shrink-0 pb-6 md:pb-3">
              <button
                type="button"
                onClick={() => handleSendCompose(true)}
                disabled={savingDraft || sendingDraft}
                className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium disabled:opacity-50 transition-all cursor-pointer"
              >
                {savingDraft ? 'Saving Draft...' : 'Save Draft'}
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (composeSubject || composeBody) {
                      if (confirm('Discard unsaved draft?')) {
                        setIsComposeOpen(false);
                      }
                    } else {
                      setIsComposeOpen(false);
                    }
                  }}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => handleSendCompose(false)}
                  disabled={sendingDraft || savingDraft}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold shadow-lg shadow-amber-500/20 disabled:opacity-50 transition-all cursor-pointer"
                >
                  <PaperPlaneRight size={15} weight="bold" />
                  <span>{sendingDraft ? 'Sending...' : 'Send Email'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
