'use client';

import React, { useState, useMemo } from 'react';
import {
  EnvelopeSimple,
  PaperPlaneRight,
  Star,
  MagnifyingGlass,
  Paperclip,
  ArrowsClockwise,
  X,
  PencilSimple,
  CaretDown,
  Check,
  Tray,
} from '@phosphor-icons/react';
import type {
  InboxThread,
  InboxFolderCounts,
  InboxFilterFolder,
} from '@/lib/email/inboxStore';
import { useMobileTheme } from '@/context/MobileThemeContext';
import { getMobilePalette } from './MobileThemeTokens';
import { MobileEmailThreadView } from './MobileEmailThreadView';

interface MobileEmailInboxViewProps {
  threads: InboxThread[];
  counts: InboxFolderCounts | null;
  activeFolder: InboxFilterFolder;
  onSelectFolder: (f: InboxFilterFolder) => void;
  onRefresh: () => void;
  refreshing: boolean;
  onToggleStar?: (threadId: string) => void;
  onOpenCompose: () => void;
  onSendReply?: (threadId: string, replyText: string, replyAll: boolean) => Promise<void>;
  sendingReply?: boolean;
}

export type MobileFolderMode = 'inbox' | 'sent' | 'starred';

export type MobileMailboxFilter =
  | 'all'
  | 'orders'
  | 'marketing'
  | 'support'
  | 'salman'
  | 'admin'
  | 'leados';

export function MobileEmailInboxView({
  threads,
  counts,
  activeFolder,
  onSelectFolder,
  onRefresh,
  refreshing,
  onToggleStar,
  onOpenCompose,
  onSendReply,
  sendingReply = false,
}: MobileEmailInboxViewProps) {
  const { isDark } = useMobileTheme();
  const palette = getMobilePalette(isDark);

  const [searchQuery, setSearchQuery] = useState('');
  const [folderMode, setFolderMode] = useState<MobileFolderMode>(() => {
    return activeFolder === 'sent' ? 'sent' : 'inbox';
  });
  const [mailboxFilter, setMailboxFilter] = useState<MobileMailboxFilter>(() => {
    if (activeFolder === 'orders') return 'orders';
    if (activeFolder === 'marketing') return 'marketing';
    if (activeFolder === 'support') return 'support';
    if (activeFolder === 'salman') return 'salman';
    if (activeFolder === 'admin') return 'admin';
    return 'all';
  });
  const [selectedThread, setSelectedThread] = useState<InboxThread | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Sync state if parent changes activeFolder externally
  React.useEffect(() => {
    if (activeFolder === 'sent') {
      setFolderMode('sent');
    } else {
      if (activeFolder === 'orders') setMailboxFilter('orders');
      else if (activeFolder === 'marketing') setMailboxFilter('marketing');
      else if (activeFolder === 'support') setMailboxFilter('support');
      else if (activeFolder === 'salman') setMailboxFilter('salman');
      else if (activeFolder === 'admin') setMailboxFilter('admin');
      else if (activeFolder === 'all') setMailboxFilter('all');
    }
  }, [activeFolder]);

  // Handle Switching between Inbox, Sent, and Starred
  const handleSelectFolderMode = (mode: MobileFolderMode) => {
    setFolderMode(mode);
    if (mode === 'sent') {
      onSelectFolder('sent');
    } else if (mode === 'inbox') {
      if (mailboxFilter === 'orders') onSelectFolder('orders');
      else if (mailboxFilter === 'marketing') onSelectFolder('marketing');
      else if (mailboxFilter === 'support') onSelectFolder('support');
      else if (mailboxFilter === 'salman') onSelectFolder('salman');
      else if (mailboxFilter === 'admin') onSelectFolder('admin');
      else onSelectFolder('all');
    }
  };

  // Handle Switching Mailbox Account
  const handleSelectMailbox = (mb: MobileMailboxFilter) => {
    setMailboxFilter(mb);
    setAccountMenuOpen(false);

    if (folderMode === 'sent') {
      // In Sent mode, keep sent query active on server, filter mailbox locally
      onSelectFolder('sent');
    } else {
      // In Inbox mode, query selected server mailbox
      if (mb === 'orders') onSelectFolder('orders');
      else if (mb === 'marketing') onSelectFolder('marketing');
      else if (mb === 'support') onSelectFolder('support');
      else if (mb === 'salman') onSelectFolder('salman');
      else if (mb === 'admin') onSelectFolder('admin');
      else onSelectFolder('all');
    }
  };

  // Filtered threads list (Strict Gmail-style filtering)
  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const mailbox = (t.mailbox || '').toLowerCase();
      const latestMsg = t.latestMessage;
      const isOutbound = latestMsg?.direction === 'outbound' || t.messages.some((m) => m.direction === 'outbound');

      // 1. Primary Folder Mode Filter
      if (folderMode === 'sent') {
        if (!isOutbound && !t.messages.some((m) => m.folder === 'sent')) {
          return false;
        }
      } else if (folderMode === 'inbox') {
        // When in Inbox view, if we're not explicitly in Sent, require incoming or non-sent
        if (activeFolder === 'sent' && isOutbound) {
          // If server returned sent pool, allow viewing
        } else if (isOutbound && t.messages.every((m) => m.direction === 'outbound')) {
          // Pure sent threads belong in Sent folder
          return false;
        }
      } else if (folderMode === 'starred') {
        if (!t.starred) return false;
      }

      // 2. Mailbox Account Filter
      if (mailboxFilter === 'orders' && !mailbox.includes('orders')) {
        return false;
      }
      if (mailboxFilter === 'marketing' && !mailbox.includes('marketing')) {
        return false;
      }
      if (mailboxFilter === 'support' && !mailbox.includes('support')) {
        return false;
      }
      if (mailboxFilter === 'salman' && !mailbox.includes('salman')) {
        return false;
      }
      if (mailboxFilter === 'admin' && !mailbox.includes('admin')) {
        return false;
      }
      if (mailboxFilter === 'leados' && !t.messages.some((m) => m.leadId)) {
        return false;
      }

      // 3. Search Query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSubject = t.subject.toLowerCase().includes(q);
        const matchesSender = t.participants.some(
          (p) => (p.name || '').toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
        );
        const snippetText = latestMsg?.snippet || latestMsg?.bodyText || '';
        const matchesSnippet = snippetText.toLowerCase().includes(q);
        if (!matchesSubject && !matchesSender && !matchesSnippet) {
          return false;
        }
      }

      return true;
    });
  }, [threads, folderMode, mailboxFilter, searchQuery, activeFolder]);

  // Meaningful recipient / sender resolver for Gmail list
  const resolveListParticipant = (thread: InboxThread) => {
    const latest = thread.latestMessage;
    const isOutbound = folderMode === 'sent' || latest?.direction === 'outbound';

    // In Sent mode: Show "To: recipient"
    if (isOutbound) {
      const externalTo = latest?.to?.find((p) => !p.email.toLowerCase().includes('himalayankoh.com'));
      if (externalTo?.name && !externalTo.name.toLowerCase().includes('himalayan koh')) {
        return `To: ${externalTo.name}`;
      }
      if (externalTo?.email) {
        return `To: ${externalTo.email}`;
      }
      const firstTo = latest?.to?.[0];
      if (firstTo?.name) return `To: ${firstTo.name}`;
      if (firstTo?.email) return `To: ${firstTo.email}`;
      return 'To: Recipient';
    }

    // In Inbox mode: Show incoming sender
    const externalFrom = thread.participants.find(
      (p) => !p.email.toLowerCase().includes('himalayankoh.com')
    );
    if (externalFrom?.name && !externalFrom.name.toLowerCase().includes('himalayan koh')) {
      return externalFrom.name;
    }
    if (externalFrom?.email) {
      return externalFrom.email.split('@')[0];
    }

    const p0 = thread.participants[0];
    if (p0?.name && !p0.name.toLowerCase().includes('himalayan koh')) {
      return p0.name;
    }
    if (p0?.email) {
      return p0.email.split('@')[0];
    }
    return 'Customer Inquiry';
  };

  // Mailbox Visual Badge Config (Gmail-Style)
  const getMailboxBadge = (mailbox?: string) => {
    const m = (mailbox || '').toLowerCase();
    if (m.includes('orders')) {
      return {
        label: 'Orders',
        icon: '🛒',
        bg: isDark ? 'rgba(245, 158, 11, 0.18)' : '#FEF3C7',
        text: isDark ? '#FBBF24' : '#B45309',
        border: isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
      };
    }
    if (m.includes('marketing')) {
      return {
        label: 'Marketing',
        icon: '📢',
        bg: isDark ? 'rgba(168, 85, 247, 0.18)' : '#F3E8FF',
        text: isDark ? '#C084FC' : '#7E22CE',
        border: isDark ? 'rgba(168, 85, 247, 0.35)' : '#E9D5FF',
      };
    }
    if (m.includes('support')) {
      return {
        label: 'Support',
        icon: '💬',
        bg: isDark ? 'rgba(16, 185, 129, 0.18)' : '#D1FAE5',
        text: isDark ? '#34D399' : '#047857',
        border: isDark ? 'rgba(16, 185, 129, 0.35)' : '#A7F3D0',
      };
    }
    if (m.includes('salman')) {
      return {
        label: 'Direct',
        icon: '👤',
        bg: isDark ? 'rgba(59, 130, 246, 0.18)' : '#DBEAFE',
        text: isDark ? '#60A5FA' : '#1D4ED8',
        border: isDark ? 'rgba(59, 130, 246, 0.35)' : '#BFDBFE',
      };
    }
    if (m.includes('admin')) {
      return {
        label: 'Admin',
        icon: '🔒',
        bg: isDark ? 'rgba(148, 163, 184, 0.18)' : '#F1F5F9',
        text: isDark ? '#94A3B8' : '#475569',
        border: isDark ? 'rgba(148, 163, 184, 0.35)' : '#CBD5E1',
      };
    }
    return null;
  };

  const getAvatarBg = (name: string) => {
    const colors = [
      'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
      'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
      'linear-gradient(135deg, #10B981 0%, #047857 100%)',
      'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      'linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)',
      'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)',
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % colors.length;
    return colors[idx];
  };

  const formatThreadTime = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      const now = new Date();
      const isToday =
        date.getDate() === now.getDate() &&
        date.getMonth() === now.getMonth() &&
        date.getFullYear() === now.getFullYear();

      if (isToday) {
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      }

      const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) return 'Yesterday';
      if (diffDays < 7) return `${diffDays} days ago`;
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    } catch {
      return '';
    }
  };

  const currentMailboxLabel = useMemo(() => {
    switch (mailboxFilter) {
      case 'orders':
        return { name: 'orders@himalayankoh.com', icon: '🛒', tag: 'Orders' };
      case 'marketing':
        return { name: 'marketing@himalayankoh.com', icon: '📢', tag: 'Marketing' };
      case 'support':
        return { name: 'support@himalayankoh.com', icon: '💬', tag: 'Support' };
      case 'salman':
        return { name: 'salman@himalayankoh.com', icon: '👤', tag: 'Direct' };
      case 'admin':
        return { name: 'admin@himalayankoh.com', icon: '🔒', tag: 'Admin' };
      default:
        return { name: 'All Inboxes', icon: '🌟', tag: 'All' };
    }
  }, [mailboxFilter]);

  return (
    <div className="md:hidden flex flex-col space-y-3 pb-20">
      {/* ── 1. Gmail-Style Floating Search & Action Row ───────────────── */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-all shadow-xs"
          style={{
            backgroundColor: palette.searchBg,
            borderColor: palette.searchBorder,
          }}
        >
          <MagnifyingGlass size={16} weight="bold" style={{ color: palette.textMuted }} />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search ${folderMode === 'sent' ? 'sent emails' : currentMailboxLabel.tag}...`}
            aria-label="Search emails"
            className="w-full bg-transparent text-xs outline-none font-medium"
            style={{
              color: palette.textPrimary,
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-0.5 text-slate-400 hover:text-white"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        {/* Refresh with Real-Time Indicator */}
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh inbox"
          title="Real-time sync"
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer relative"
          style={{
            backgroundColor: palette.iconBtnBg,
            border: `1px solid ${palette.iconBtnBorder}`,
            color: palette.iconBtnText,
          }}
        >
          <ArrowsClockwise size={18} weight="bold" className={refreshing ? 'animate-spin' : ''} />
          {!refreshing && (
            <span className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-emerald-500 ring-1 ring-white/50" />
          )}
        </button>

        {/* Compose Button in Violet Accent */}
        <button
          type="button"
          onClick={onOpenCompose}
          aria-label="Compose new email"
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white shrink-0 transition-transform active:scale-95 cursor-pointer shadow-md"
          style={{
            background: palette.accentGradient,
            boxShadow: palette.accentGlow,
          }}
        >
          <PencilSimple size={18} weight="bold" />
        </button>
      </div>

      {/* ── 2. Gmail Standard Folders Bar (Inbox vs Sent vs Starred) ──── */}
      <div
        className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl border"
        style={{
          backgroundColor: isDark ? 'rgba(15, 23, 42, 0.6)' : '#F1F5F9',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
        }}
      >
        {/* Inbox Tab */}
        <button
          type="button"
          onClick={() => handleSelectFolderMode('inbox')}
          className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
            folderMode === 'inbox'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Tray size={15} weight={folderMode === 'inbox' ? 'fill' : 'bold'} />
          <span>Inbox</span>
          {Boolean(counts?.allUnread && counts.allUnread > 0) && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                folderMode === 'inbox' ? 'bg-white text-blue-700' : 'bg-blue-500 text-white'
              }`}
            >
              {counts?.allUnread}
            </span>
          )}
        </button>

        {/* Sent Tab */}
        <button
          type="button"
          onClick={() => handleSelectFolderMode('sent')}
          className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
            folderMode === 'sent'
              ? 'bg-violet-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <PaperPlaneRight size={15} weight={folderMode === 'sent' ? 'fill' : 'bold'} />
          <span>Sent</span>
          {Boolean(counts?.sent && counts.sent > 0) && (
            <span
              className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${
                folderMode === 'sent' ? 'bg-white text-violet-700' : 'bg-slate-700 text-slate-300'
              }`}
            >
              {counts?.sent}
            </span>
          )}
        </button>

        {/* Starred Tab */}
        <button
          type="button"
          onClick={() => handleSelectFolderMode('starred')}
          className={`py-2 px-3 rounded-xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all active:scale-95 cursor-pointer ${
            folderMode === 'starred'
              ? 'bg-amber-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          <Star size={15} weight={folderMode === 'starred' ? 'fill' : 'bold'} />
          <span>Starred</span>
        </button>
      </div>

      {/* ── 3. Gmail Account Filter Pills Row ─────────────────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {[
          { id: 'all' as MobileMailboxFilter, label: 'All Accounts', icon: '🌟' },
          {
            id: 'orders' as MobileMailboxFilter,
            label: 'Orders',
            icon: '🛒',
            badge: counts?.ordersUnread,
            badgeColor: 'bg-amber-500 text-white',
          },
          {
            id: 'marketing' as MobileMailboxFilter,
            label: 'Marketing',
            icon: '📢',
            badge: counts?.marketingUnread,
            badgeColor: 'bg-purple-500 text-white',
          },
          {
            id: 'support' as MobileMailboxFilter,
            label: 'Support',
            icon: '💬',
            badge: counts?.supportUnread,
            badgeColor: 'bg-emerald-500 text-white',
          },
          { id: 'salman' as MobileMailboxFilter, label: 'Direct', icon: '👤' },
          { id: 'admin' as MobileMailboxFilter, label: 'Admin', icon: '🔒' },
          { id: 'leados' as MobileMailboxFilter, label: 'LeadOS', icon: '🎯' },
        ].map((chip) => {
          const isActive = mailboxFilter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleSelectMailbox(chip.id)}
              className="px-3 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all active:scale-95 duration-150 cursor-pointer flex items-center gap-1.5"
              style={{
                background: isActive ? palette.chipActiveBg : palette.chipInactiveBg,
                color: isActive ? palette.chipActiveText : palette.chipInactiveText,
                border: `1px solid ${isActive ? 'transparent' : palette.chipInactiveBorder}`,
                boxShadow: isActive ? palette.accentGlow : 'none',
              }}
            >
              <span>{chip.icon}</span>
              <span>{chip.label}</span>
              {Boolean(chip.badge && chip.badge > 0) && (
                <span className={`px-1.5 py-0.2 rounded-full text-[9px] font-black ${chip.badgeColor}`}>
                  {chip.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── 4. Compact Gmail Mailbox Header Indicator ─────────────────── */}
      <div className="flex items-center justify-between px-1 text-[11px] font-bold">
        <div className="flex items-center gap-1.5 text-slate-400">
          <span>{currentMailboxLabel.icon}</span>
          <span style={{ color: palette.textPrimary }}>{currentMailboxLabel.name}</span>
          <span className="text-slate-500">&bull;</span>
          <span className="capitalize text-blue-400">{folderMode}</span>
        </div>
        <span className="text-slate-400 font-semibold">{filteredThreads.length} conversation(s)</span>
      </div>

      {/* ── 5. Email Messages List ─────────────────────────────────────── */}
      <div className="space-y-2">
        {filteredThreads.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{
              backgroundColor: palette.cardBg,
              border: `1px solid ${palette.cardBorder}`,
            }}
          >
            <EnvelopeSimple size={32} className="mx-auto mb-2 text-slate-500" />
            <p className="text-sm font-bold" style={{ color: palette.textPrimary }}>
              No {folderMode} emails in {currentMailboxLabel.tag}
            </p>
            <p className="text-xs mt-1" style={{ color: palette.textSecondary }}>
              {searchQuery
                ? `No emails matching "${searchQuery}"`
                : folderMode === 'sent'
                ? 'No sent messages recorded for this mailbox.'
                : 'Your inbox is completely up to date in real time.'}
            </p>
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const latest = thread.latestMessage;
            const participantLabel = resolveListParticipant(thread);
            const initial = participantLabel.replace(/^To:\s*/i, '').charAt(0).toUpperCase();
            const avatarBg = getAvatarBg(participantLabel);
            const timeStr = formatThreadTime(latest?.createdAt || thread.updatedAt);
            const hasAttachments =
              thread.hasAttachments || thread.messages.some((m) => m.attachments && m.attachments.length > 0);
            const previewText = latest?.snippet || latest?.bodyText || 'No message preview';
            const isUnread = Boolean(thread.unread && folderMode !== 'sent');
            const mailboxBadge = getMailboxBadge(thread.mailbox);
            const isOutbound = folderMode === 'sent' || latest?.direction === 'outbound';

            return (
              <div
                key={thread.threadId}
                onClick={() => setSelectedThread(thread)}
                className={`rounded-2xl p-3 flex items-start gap-3 transition-all duration-150 active:scale-[0.99] cursor-pointer ${
                  isUnread ? 'shadow-md' : 'opacity-90 hover:opacity-100'
                }`}
                style={{
                  backgroundColor: isUnread
                    ? isDark
                      ? '#111827'
                      : '#FFFFFF'
                    : isDark
                    ? 'rgba(19, 25, 41, 0.45)'
                    : 'rgba(241, 245, 249, 0.7)',
                  border: isUnread
                    ? `1.5px solid ${isDark ? 'rgba(59, 130, 246, 0.4)' : '#BFDBFE'}`
                    : `1px solid ${isDark ? 'rgba(255, 255, 255, 0.05)' : '#E2E8F0'}`,
                }}
              >
                {/* Unread dot / Status indicator */}
                <div className="pt-2">
                  <span
                    className="block w-2.5 h-2.5 rounded-full transition-opacity"
                    style={{
                      backgroundColor: isUnread ? '#3B82F6' : 'transparent',
                      boxShadow: isUnread ? '0 0 10px #3B82F6' : 'none',
                    }}
                  />
                </div>

                {/* Avatar initial circle */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm"
                  style={{
                    background: avatarBg,
                    border: '1.5px solid rgba(255, 255, 255, 0.15)',
                    opacity: isUnread ? 1 : 0.85,
                  }}
                >
                  {initial}
                </div>

                {/* Sender/Recipient, Subject, Snippet */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1.5">
                    <span
                      className={`text-xs truncate leading-tight ${
                        isUnread ? 'font-extrabold' : 'font-semibold'
                      }`}
                      style={{
                        color: isUnread
                          ? palette.textPrimary
                          : isDark
                          ? '#94A3B8'
                          : '#475569',
                      }}
                    >
                      {participantLabel}
                    </span>
                    <span
                      className="text-[10px] font-medium shrink-0"
                      style={{ color: isUnread ? palette.textSecondary : palette.textMuted }}
                    >
                      {timeStr}
                    </span>
                  </div>

                  {/* Gmail Mailbox & Status Badges */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {mailboxBadge && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider"
                        style={{
                          backgroundColor: mailboxBadge.bg,
                          color: mailboxBadge.text,
                          border: `1px solid ${mailboxBadge.border}`,
                        }}
                      >
                        <span>{mailboxBadge.icon}</span>
                        <span>{mailboxBadge.label}</span>
                      </span>
                    )}

                    {isOutbound && (
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-violet-500/15 text-violet-400 border border-violet-500/25">
                        <PaperPlaneRight size={10} weight="bold" />
                        <span>Sent</span>
                      </span>
                    )}

                    {thread.messages.some((m) => m.leadId) && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        LeadOS
                      </span>
                    )}
                  </div>

                  <div
                    className={`text-xs truncate mt-1 ${
                      isUnread ? 'font-bold' : 'font-normal'
                    }`}
                    style={{
                      color: isUnread
                        ? palette.textPrimary
                        : isDark
                        ? '#CBD5E1'
                        : '#334155',
                    }}
                  >
                    {thread.subject || '(No Subject)'}
                  </div>

                  <p
                    className="text-[11px] truncate mt-0.5 line-clamp-1"
                    style={{ color: isUnread ? palette.textSecondary : palette.textMuted }}
                  >
                    {previewText}
                  </p>
                </div>

                {/* Right: Star & Attachment */}
                <div className="flex flex-col items-end justify-between self-stretch shrink-0 gap-1.5 pl-1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleStar?.(thread.threadId);
                    }}
                    className="p-1 rounded-md text-amber-400 hover:text-amber-300 transition-colors cursor-pointer"
                  >
                    <Star size={16} weight={thread.starred ? 'fill' : 'regular'} />
                  </button>

                  {hasAttachments && (
                    <span className="text-slate-400">
                      <Paperclip size={14} weight="bold" />
                    </span>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── 6. Mobile Thread Viewer ─────────────────────────────────────── */}
      {selectedThread && (
        <MobileEmailThreadView
          thread={selectedThread}
          onBack={() => setSelectedThread(null)}
          onToggleStar={onToggleStar}
          onSendReply={onSendReply}
          sendingReply={sendingReply}
        />
      )}
    </div>
  );
}
