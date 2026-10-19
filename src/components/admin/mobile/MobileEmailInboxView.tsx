'use client';

import React, { useState, useMemo } from 'react';
import {
  EnvelopeSimple,
  PaperPlaneRight,
  Star,
  MagnifyingGlass,
  Paperclip,
  ArrowsClockwise,
  ArrowLeft,
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
  const [quickReplyText, setQuickReplyText] = useState('');
  const [replyAll, setReplyAll] = useState(false);

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

  // Color generator for avatar initials
  const getAvatarBg = (name: string) => {
    const colors = [
      'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
      'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
      'linear-gradient(135deg, #EC4899 0%, #BE185D 100%)',
      'linear-gradient(135deg, #F59E0B 0%, #D97706 100%)',
      'linear-gradient(135deg, #10B981 0%, #047857 100%)',
      'linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)',
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

  const handleSendReply = async () => {
    if (!selectedThread || !quickReplyText.trim() || !onSendReply) return;
    try {
      await onSendReply(selectedThread.threadId, quickReplyText.trim(), replyAll);
      setQuickReplyText('');
    } catch {
      // Error handled by parent
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
          <div className="w-8 h-8 rounded-xl bg-blue-500/20 text-blue-400 flex items-center justify-center mb-2">
            <EnvelopeSimple size={18} weight="fill" />
          </div>
          <div>
            <div className="text-xl font-extrabold tracking-tight" style={{ color: palette.textPrimary }}>
              {totalEmailsCount}
            </div>
            <div className="text-[10px] font-semibold mt-0.5" style={{ color: palette.textSecondary }}>
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
          <div className="w-8 h-8 rounded-xl bg-violet-500/20 text-violet-400 flex items-center justify-center mb-2">
            <PaperPlaneRight size={18} weight="fill" />
          </div>
          <div>
            <div className="text-xl font-extrabold tracking-tight" style={{ color: palette.textPrimary }}>
              {unreadCount}
            </div>
            <div className="text-[10px] font-semibold mt-0.5" style={{ color: palette.textSecondary }}>
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
          <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-2">
            <Star size={18} weight="fill" />
          </div>
          <div>
            <div className="text-xl font-extrabold tracking-tight" style={{ color: palette.textPrimary }}>
              {starredCount}
            </div>
            <div className="text-[10px] font-semibold mt-0.5" style={{ color: palette.textSecondary }}>
              Starred
            </div>
          </div>
        </div>
      </div>

      {/* ── 2. Search Bar + Refresh (Reference Image 2) ────────────────── */}
      <div className="flex items-center gap-2">
        <div
          className="flex-1 rounded-2xl flex items-center gap-2.5 px-3.5 py-2.5 transition-all"
          style={{
            backgroundColor: palette.searchBg,
            border: `1px solid ${palette.searchBorder}`,
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.2)' : '0 1px 3px rgba(0,0,0,0.04)',
          }}
        >
          <MagnifyingGlass size={17} style={{ color: palette.searchPlaceholder }} className="shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search emails..."
            className="w-full bg-transparent text-xs font-medium outline-none"
            style={{
              color: palette.textPrimary,
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-1 text-slate-400 hover:text-slate-200"
            >
              <X size={14} weight="bold" />
            </button>
          )}
        </div>

        {/* Refresh Button */}
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          aria-label="Refresh inbox"
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
          style={{
            backgroundColor: palette.searchBg,
            border: `1px solid ${palette.searchBorder}`,
            color: palette.textSecondary,
          }}
        >
          <ArrowsClockwise size={18} className={refreshing ? 'animate-spin' : ''} />
        </button>

        {/* Compose Floating Icon */}
        <button
          type="button"
          onClick={onOpenCompose}
          aria-label="Compose new email"
          className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 text-white transition-all active:scale-95 cursor-pointer shadow-md"
          style={{
            background: palette.accentGradient,
          }}
        >
          <PencilSimple size={18} weight="bold" />
        </button>
      </div>

      {/* ── 3. Horizontal Filter Chips (Reference Image 2) ─────────────── */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-0.5">
        {[
          { key: 'all', label: 'All' },
          { key: 'inquiries', label: 'Primary' },
          { key: 'leados', label: 'LeadOS' },
          { key: 'sent', label: 'Sent' },
          { key: 'starred', label: 'Starred' },
          { key: 'drafts', label: 'Drafts' },
        ].map((chip) => {
          const isActive = activeFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setActiveFilter(chip.key as MobileEmailFilter)}
              className="px-4 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all active:scale-95 duration-150"
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

      {/* ── 4. Email Message List (Reference Image 2) ──────────────────── */}
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
              No messages found
            </p>
            <p className="text-xs mt-1" style={{ color: palette.textSecondary }}>
              {searchQuery ? `No emails matching "${searchQuery}"` : 'Your inbox is completely up to date.'}
            </p>
          </div>
        ) : (
          filteredThreads.map((thread) => {
            const latest = thread.latestMessage;
            const sender = thread.participants[0]?.name || thread.participants[0]?.email || 'Sender';
            const initial = sender.charAt(0).toUpperCase();
            const avatarBg = getAvatarBg(sender);
            const timeStr = formatThreadTime(latest?.createdAt || thread.updatedAt);
            const hasAttachments = thread.hasAttachments || thread.messages.some((m) => m.attachments && m.attachments.length > 0);
            const previewText = latest?.snippet || latest?.bodyText || 'No message preview';

            return (
              <div
                key={thread.threadId}
                onClick={() => setSelectedThread(thread)}
                className="rounded-2xl p-3.5 flex items-start gap-3 transition-all duration-150 active:scale-[0.99] cursor-pointer"
                style={{
                  backgroundColor: palette.cardBg,
                  border: `1px solid ${palette.cardBorder}`,
                  boxShadow: palette.cardShadow,
                }}
              >
                {/* Unread indicator dot */}
                <div className="pt-2.5">
                  <span
                    className="block w-2 h-2 rounded-full transition-opacity"
                    style={{
                      backgroundColor: thread.unread ? '#3B82F6' : 'transparent',
                      boxShadow: thread.unread ? '0 0 8px #3B82F6' : 'none',
                    }}
                  />
                </div>

                {/* Avatar initial circle */}
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 shadow-sm"
                  style={{
                    background: avatarBg,
                    border: '1.5px solid rgba(255, 255, 255, 0.15)',
                  }}
                >
                  {initial}
                </div>

                {/* Sender, Subject, Snippet */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-1.5">
                    <span
                      className="text-xs font-bold truncate leading-tight"
                      style={{ color: palette.textPrimary }}
                    >
                      {sender}
                    </span>
                    <span className="text-[10px] font-medium shrink-0" style={{ color: palette.textMuted }}>
                      {timeStr}
                    </span>
                  </div>

                  <div
                    className="text-xs font-semibold truncate mt-0.5"
                    style={{
                      color: thread.unread ? palette.textPrimary : palette.textSecondary,
                    }}
                  >
                    {thread.subject || '(No Subject)'}
                  </div>

                  <p
                    className="text-[11px] truncate mt-0.5 line-clamp-1"
                    style={{ color: palette.textMuted }}
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
                    className="p-1 rounded-md text-amber-400 hover:text-amber-300 transition-colors"
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

      {/* ── 5. Mobile Thread Viewer (Full Sheet) ────────────────────────── */}
      {selectedThread && (
        <div className="fixed inset-0 z-modal flex flex-col justify-end">
          <div
            className="absolute inset-0 bg-black/70 backdrop-blur-xs"
            onClick={() => setSelectedThread(null)}
          />

          <div
            className="relative rounded-t-3xl border-t shadow-2xl flex flex-col max-h-[92vh] overflow-hidden"
            style={{
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              color: palette.textPrimary,
            }}
          >
            {/* Header */}
            <div
              className="p-4 border-b flex items-center justify-between gap-3 shrink-0"
              style={{ borderColor: palette.divider }}
            >
              <button
                type="button"
                onClick={() => setSelectedThread(null)}
                className="w-9 h-9 rounded-full flex items-center justify-center transition-colors cursor-pointer"
                style={{
                  backgroundColor: palette.iconBtnBg,
                  color: palette.iconBtnText,
                }}
              >
                <ArrowLeft size={18} weight="bold" />
              </button>

              <div className="flex-1 min-w-0">
                <h3 className="text-xs font-bold truncate" style={{ color: palette.textPrimary }}>
                  {selectedThread.subject || '(No Subject)'}
                </h3>
                <p className="text-[10px] truncate" style={{ color: palette.textSecondary }}>
                  {selectedThread.messages.length} message{selectedThread.messages.length !== 1 ? 's' : ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onToggleStar?.(selectedThread.threadId)}
                className="p-2 text-amber-400"
              >
                <Star size={18} weight={selectedThread.starred ? 'fill' : 'regular'} />
              </button>
            </div>

            {/* Conversation Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {selectedThread.messages.map((msg) => {
                return (
                  <div
                    key={msg.id}
                    className="rounded-2xl p-3.5 space-y-2"
                    style={{
                      backgroundColor: palette.cardElevatedBg,
                      border: `1px solid ${palette.cardBorder}`,
                    }}
                  >
                    <div className="flex items-center justify-between gap-2 border-b pb-2" style={{ borderColor: palette.divider }}>
                      <div className="flex items-center gap-2 truncate">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                          style={{ background: getAvatarBg(msg.from.name || msg.from.email) }}
                        >
                          {(msg.from.name || msg.from.email).charAt(0).toUpperCase()}
                        </div>
                        <div className="truncate">
                          <span className="text-xs font-bold block truncate" style={{ color: palette.textPrimary }}>
                            {msg.from.name || msg.from.email}
                          </span>
                          <span className="text-[10px] block truncate" style={{ color: palette.textMuted }}>
                            To: {msg.to.map((t) => t.name || t.email).join(', ')}
                          </span>
                        </div>
                      </div>
                      <span className="text-[10px] shrink-0" style={{ color: palette.textMuted }}>
                        {formatThreadTime(msg.createdAt)}
                      </span>
                    </div>

                    {/* Body */}
                    <div
                      className="text-xs whitespace-pre-wrap leading-relaxed py-1"
                      style={{ color: palette.textPrimary }}
                    >
                      {msg.bodyText || 'No text content'}
                    </div>

                    {/* Attachments */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="pt-2 border-t flex flex-wrap gap-1.5" style={{ borderColor: palette.divider }}>
                        {msg.attachments.map((att) => (
                          <div
                            key={att.filename}
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[10px] font-semibold"
                            style={{
                              backgroundColor: palette.cardBg,
                              border: `1px solid ${palette.cardBorder}`,
                            }}
                          >
                            <Paperclip size={12} />
                            <span className="truncate max-w-[140px]">{att.filename}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Bottom Quick Reply */}
            {onSendReply && (
              <div
                className="p-3 border-t flex items-center gap-2 shrink-0"
                style={{
                  backgroundColor: palette.cardBg,
                  borderColor: palette.divider,
                }}
              >
                <input
                  type="text"
                  value={quickReplyText}
                  onChange={(e) => setQuickReplyText(e.target.value)}
                  placeholder="Quick reply..."
                  className="flex-1 rounded-xl px-3 py-2 text-xs font-medium outline-none"
                  style={{
                    backgroundColor: palette.cardElevatedBg,
                    border: `1px solid ${palette.cardBorder}`,
                    color: palette.textPrimary,
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendReply();
                    }
                  }}
                />

                <button
                  type="button"
                  onClick={handleSendReply}
                  disabled={sendingReply || !quickReplyText.trim()}
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white shrink-0 transition-transform active:scale-95 disabled:opacity-40"
                  style={{ background: palette.accentGradient }}
                >
                  <PaperPlaneRight size={16} weight="bold" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
