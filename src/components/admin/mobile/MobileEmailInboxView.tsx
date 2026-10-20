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

type MobileEmailFilter = 'all' | 'inquiries' | 'leados' | 'sent' | 'starred' | 'drafts';

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
  const [activeFilter, setActiveFilter] = useState<MobileEmailFilter>('all');
  const [selectedThread, setSelectedThread] = useState<InboxThread | null>(null);

  // Computed summary counts
  const totalEmailsCount = counts ? counts.all : threads.length;
  const unreadCount = counts ? counts.allUnread : threads.filter((t) => t.unread).length;
  const starredCount = threads.filter((t) => t.starred).length;

  // Filtered threads list
  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      // Filter category
      if (activeFilter === 'sent' && !t.messages.some((m) => m.direction === 'outbound')) {
        return false;
      }
      if (activeFilter === 'starred' && !t.starred) {
        return false;
      }
      if (activeFilter === 'leados' && !t.messages.some((m) => m.leadId)) {
        return false;
      }
      if (
        activeFilter === 'inquiries' &&
        !t.subject.toLowerCase().includes('inquiry') &&
        !t.subject.toLowerCase().includes('order') &&
        !t.subject.toLowerCase().includes('quote')
      ) {
        return false;
      }

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesSubject = t.subject.toLowerCase().includes(q);
        const matchesSender = t.participants.some(
          (p) => (p.name || '').toLowerCase().includes(q) || p.email.toLowerCase().includes(q)
        );
        const snippetText = t.latestMessage?.snippet || t.latestMessage?.bodyText || '';
        const matchesSnippet = snippetText.toLowerCase().includes(q);
        if (!matchesSubject && !matchesSender && !matchesSnippet) {
          return false;
        }
      }

      return true;
    });
  }, [threads, activeFilter, searchQuery]);

  // Meaningful sender resolver (avoids generic "Himalayan Koh Administration" on all threads)
  const resolveMeaningfulSender = (thread: InboxThread) => {
    const latest = thread.latestMessage;
    if (latest && latest.direction === 'outbound') {
      const fromEmail = (latest.from?.email || '').toLowerCase();
      if (fromEmail.includes('sales')) return 'Sales Team';
      if (fromEmail.includes('support')) return 'Support Team';
      if (fromEmail.includes('salman')) return 'Salman';
      if (fromEmail.includes('accounts') || fromEmail.includes('billing')) return 'Accounts Team';
      if (fromEmail.includes('marketing')) return 'Marketing Team';
      return 'Sales Team';
    }

    const externalParticipant = thread.participants.find(
      (p) => !p.email.toLowerCase().includes('himalayankoh.com')
    );
    if (externalParticipant?.name && !externalParticipant.name.toLowerCase().includes('himalayan koh')) {
      return externalParticipant.name;
    }
    if (externalParticipant?.email) {
      return externalParticipant.email.split('@')[0];
    }

    const p0 = thread.participants[0];
    if (p0?.name && !p0.name.toLowerCase().includes('himalayan koh')) {
      return p0.name;
    }
    if (p0?.email) {
      return p0.email.split('@')[0];
    }
    return 'Sales Team';
  };

  // Color generator for avatar initials
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

  return (
    <div className="md:hidden flex flex-col space-y-4 pb-20">
      {/* ── 1. Top Overview 3-Stat Cards (Reference Image 2) ───────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Total Emails */}
        <div
          className="rounded-2xl p-3.5 flex flex-col justify-between transition-all"
          style={{
            backgroundColor: palette.cardBg,
            border: `1px solid ${palette.cardBorder}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white mb-2 shrink-0 shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
            }}
          >
            <EnvelopeSimple size={16} weight="bold" />
          </div>
          <div>
            <div className="text-xl font-black leading-tight" style={{ color: palette.textPrimary }}>
              {totalEmailsCount}
            </div>
            <div className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: palette.textSecondary }}>
              Total Emails
            </div>
          </div>
        </div>

        {/* Unread */}
        <div
          className="rounded-2xl p-3.5 flex flex-col justify-between transition-all"
          style={{
            backgroundColor: palette.cardBg,
            border: `1px solid ${palette.cardBorder}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white mb-2 shrink-0 shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
            }}
          >
            <PaperPlaneRight size={16} weight="bold" />
          </div>
          <div>
            <div className="text-xl font-black leading-tight" style={{ color: palette.textPrimary }}>
              {unreadCount}
            </div>
            <div className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: palette.textSecondary }}>
              Unread
            </div>
          </div>
        </div>

        {/* Starred */}
        <div
          className="rounded-2xl p-3.5 flex flex-col justify-between transition-all"
          style={{
            backgroundColor: palette.cardBg,
            border: `1px solid ${palette.cardBorder}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center text-white mb-2 shrink-0 shadow-sm"
            style={{
              background: 'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
            }}
          >
            <Star size={16} weight="fill" />
          </div>
          <div>
            <div className="text-xl font-black leading-tight" style={{ color: palette.textPrimary }}>
              {starredCount}
            </div>
            <div className="text-[10px] font-semibold mt-0.5 truncate" style={{ color: palette.textSecondary }}>
              Starred
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Search & Action Buttons Row (Reference Image 2) ───────────── */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-all"
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
            placeholder="Search emails..."
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

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          aria-label="Refresh inbox"
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-transform active:scale-95 cursor-pointer"
          style={{
            backgroundColor: palette.iconBtnBg,
            border: `1px solid ${palette.iconBtnBorder}`,
            color: palette.iconBtnText,
          }}
        >
          <ArrowsClockwise size={18} weight="bold" className={refreshing ? 'animate-spin' : ''} />
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

      {/* ── 3. Category Filter Chips (Reference Image 2) ─────────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {(
          [
            { id: 'all', label: 'All' },
            { id: 'inquiries', label: 'Primary' },
            { id: 'leados', label: 'LeadOS' },
            { id: 'sent', label: 'Sent' },
            { id: 'starred', label: 'Starred' },
          ] as { id: MobileEmailFilter; label: string }[]
        ).map((chip) => {
          const isActive = activeFilter === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => setActiveFilter(chip.id)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all active:scale-95 duration-150 cursor-pointer"
              style={{
                background: isActive ? palette.chipActiveBg : palette.chipInactiveBg,
                color: isActive ? palette.chipActiveText : palette.chipInactiveText,
                border: `1px solid ${isActive ? 'transparent' : palette.chipInactiveBorder}`,
                boxShadow: isActive ? palette.accentGlow : 'none',
              }}
            >
              {chip.label}
            </button>
          );
        })}
      </div>

      {/* ── 4. Email Messages List (Clear Read vs Unread Distinction) ───── */}
      <div className="space-y-2.5">
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
              No messages found
            </p>
            <p className="text-xs mt-1" style={{ color: palette.textSecondary }}>
              {searchQuery ? `No emails matching "${searchQuery}"` : 'Your inbox is completely up to date.'}
            </p>
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const latest = thread.latestMessage;
            const sender = resolveMeaningfulSender(thread);
            const initial = sender.charAt(0).toUpperCase();
            const avatarBg = getAvatarBg(sender);
            const timeStr = formatThreadTime(latest?.createdAt || thread.updatedAt);
            const hasAttachments =
              thread.hasAttachments || thread.messages.some((m) => m.attachments && m.attachments.length > 0);
            const previewText = latest?.snippet || latest?.bodyText || 'No message preview';
            const isUnread = Boolean(thread.unread);

            return (
              <div
                key={thread.threadId}
                onClick={() => setSelectedThread(thread)}
                className={`rounded-2xl p-3.5 flex items-start gap-3 transition-all duration-150 active:scale-[0.99] cursor-pointer ${
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
                {/* Unread indicator dot */}
                <div className="pt-2.5">
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

                {/* Sender, Subject, Snippet */}
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
                      {sender}
                    </span>
                    <span
                      className="text-[10px] font-medium shrink-0"
                      style={{ color: isUnread ? palette.textSecondary : palette.textMuted }}
                    >
                      {timeStr}
                    </span>
                  </div>

                  <div
                    className={`text-xs truncate mt-0.5 ${
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

      {/* ── 5. Mobile Thread Viewer (Reference Image 3 + Composer Image 2) ─ */}
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
