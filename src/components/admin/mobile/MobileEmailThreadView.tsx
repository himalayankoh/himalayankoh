'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  Star,
  Moon,
  Sun,
  DotsThreeVertical,
  ArrowUUpLeft,
  ArrowsLeftRight,
  ArrowUUpRight,
  DotsThree,
  CaretDown,
  CaretUp,
  FilePdf,
  DownloadSimple,
} from '@phosphor-icons/react';
import type { InboxThread, InboxMessage } from '@/lib/email/inboxStore';
import { useMobileTheme } from '@/context/MobileThemeContext';
import { getMobilePalette } from './MobileThemeTokens';
import { MobileGmailReplyComposer, RecipientChip } from './MobileGmailReplyComposer';

interface MobileEmailThreadViewProps {
  thread: InboxThread;
  onBack: () => void;
  onToggleStar?: (threadId: string) => void;
  onSendReply?: (threadId: string, replyText: string, replyAll: boolean) => Promise<void>;
  sendingReply?: boolean;
}

export function MobileEmailThreadView({
  thread,
  onBack,
  onToggleStar,
  onSendReply,
  sendingReply = false,
}: MobileEmailThreadViewProps) {
  const { isDark, toggleTheme } = useMobileTheme();
  const palette = getMobilePalette(isDark);

  const [composerMode, setComposerMode] = useState<'reply' | 'reply-all' | 'forward' | null>(null);
  const [showQuoted, setShowQuoted] = useState(true);
  const [isStarred, setIsStarred] = useState(Boolean(thread.starred));

  // Determine sender identity logic
  const getSenderDisplay = (msg: InboxMessage) => {
    if (msg.direction === 'outbound') {
      const email = msg.from.email.toLowerCase();
      if (email.includes('sales')) return { name: 'Sales Team', role: 'Himalayan Koh Sales', avatarInitial: 'S', bg: '#10B981' };
      if (email.includes('support')) return { name: 'Support Team', role: 'Customer Success', avatarInitial: 'S', bg: '#F97316' };
      if (email.includes('salman')) return { name: 'Salman', role: 'Owner & Operator', avatarInitial: 'S', bg: '#6366F1' };
      return { name: msg.from.name || 'Admin Team', role: 'Himalayan Koh', avatarInitial: 'A', bg: '#3B82F6' };
    }
    const cleanName = msg.from.name || msg.from.email.split('@')[0];
    return {
      name: cleanName,
      role: 'Buyer / Prospect',
      avatarInitial: cleanName.charAt(0).toUpperCase(),
      bg: '#06B6D4',
    };
  };

  const messages = thread.messages || [];
  const latestMessage = messages[messages.length - 1];
  const previousMessages = messages.slice(0, -1);

  const latestSender = latestMessage ? getSenderDisplay(latestMessage) : { name: 'Salman', role: 'Himalayan Koh', avatarInitial: 'S', bg: '#6366F1' };

  const handleToggleStar = () => {
    setIsStarred(!isStarred);
    onToggleStar?.(thread.threadId);
  };

  const handleComposerSend = async ({ bodyText, cc }: { bodyText: string; cc?: string }) => {
    if (onSendReply) {
      const isReplyAll = composerMode === 'reply-all';
      await onSendReply(thread.threadId, bodyText, isReplyAll);
    }
  };

  const getRecipientChips = (mode: 'reply' | 'reply-all' | 'forward'): { to: RecipientChip[]; cc: RecipientChip[] } => {
    const to: RecipientChip[] = [
      {
        id: '1',
        name: latestMessage?.direction === 'inbound' ? latestMessage.from.name || latestMessage.from.email : 'Support Team',
        email: latestMessage?.direction === 'inbound' ? latestMessage.from.email : 'support@himalayankoh.com',
        avatarBg: '#10B981',
        avatarInitial: 'S',
      },
    ];

    const cc: RecipientChip[] =
      mode === 'reply-all'
        ? [
            { id: 'cc1', name: 'Salman', email: 'salman@himalayankoh.com', avatarBg: '#6366F1', avatarInitial: 'S' },
            { id: 'cc2', name: 'Support Team', email: 'support@himalayankoh.com', avatarBg: '#F97316', avatarInitial: 'S' },
          ]
        : [];

    return { to, cc };
  };

  return (
    <div
      className="fixed inset-0 z-modal flex flex-col overflow-hidden text-white transition-colors duration-200"
      style={{
        backgroundColor: isDark ? '#080C16' : '#F8FAFC',
      }}
    >
      {/* ── 1. Top Bar with Subject & Actions (Reference Image 3) ──────── */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between gap-2 shrink-0"
        style={{
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
          backgroundColor: isDark ? '#0B0E17' : '#FFFFFF',
        }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to inbox"
          className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer shrink-0"
          style={{
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
            color: isDark ? '#FFFFFF' : '#0F172A',
          }}
        >
          <ArrowLeft size={18} weight="bold" />
        </button>

        <div className="flex-1 min-w-0 px-1">
          <h1
            className="text-sm font-bold truncate leading-tight"
            style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}
          >
            {thread.subject || 'Re: Product Pricing for Livestock'}
          </h1>
        </div>

        {/* Action icons: Star + Theme Toggle + More */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleToggleStar}
            aria-label="Toggle starred"
            className="p-2 text-amber-400 hover:text-amber-300 transition-colors"
          >
            <Star size={18} weight={isStarred ? 'fill' : 'regular'} />
          </button>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="p-2 text-slate-300 hover:text-white transition-colors"
          >
            {isDark ? <Moon size={18} weight="fill" /> : <Sun size={18} weight="bold" className="text-violet-600" />}
          </button>

          <button
            type="button"
            aria-label="More options"
            className="p-2 text-slate-300 hover:text-white transition-colors"
          >
            <DotsThreeVertical size={18} weight="bold" />
          </button>
        </div>
      </div>

      {/* ── 2. Scrollable Thread Body (Reference Image 3) ───────────────── */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 no-scrollbar pb-24">
        {/* Latest Active Message Card */}
        <div
          className="rounded-3xl p-4.5 space-y-3.5 transition-all shadow-sm"
          style={{
            backgroundColor: isDark ? '#0D1424' : '#FFFFFF',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'}`,
            color: isDark ? '#FFFFFF' : '#0F172A',
          }}
        >
          {/* Sender Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              {/* Avatar */}
              <div
                className="w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm"
                style={{
                  background: latestSender.bg,
                  border: '1.5px solid rgba(255, 255, 255, 0.2)',
                }}
              >
                {latestSender.avatarInitial}
              </div>

              <div>
                <h3 className="text-sm font-bold leading-tight" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                  {latestSender.name}
                </h3>
                <p className="text-[11px] mt-0.5" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                  to {latestMessage?.direction === 'outbound' ? latestMessage.to.map((t) => t.name || t.email).join(', ') : 'Sales Team'}
                </p>
              </div>
            </div>

            <span className="text-[11px] font-medium shrink-0" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
              Today, 9:12 AM
            </span>
          </div>

          {/* Message Body */}
          <div
            className="text-xs leading-relaxed whitespace-pre-wrap py-1"
            style={{ color: isDark ? '#E2E8F0' : '#1E293B' }}
          >
            {latestMessage?.bodyText ||
              'Thanks for the updated pricing. This looks good.\nPlease also share the delivery timeline to Houston and if there are any bulk discounts for 10+ pallets.\n\nRegards,\nSalman'}
          </div>

          {/* Show Quoted Messages Button */}
          {previousMessages.length > 0 && (
            <button
              type="button"
              onClick={() => setShowQuoted(!showQuoted)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
              style={{
                backgroundColor: isDark ? 'rgba(255, 255, 255, 0.03)' : '#F1F5F9',
              }}
            >
              <span>Show quoted messages ({previousMessages.length})</span>
              {showQuoted ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
            </button>
          )}

          {/* Action Buttons Row (Reply, Reply All, Forward, More) */}
          <div className="pt-2 flex items-center justify-around gap-2 border-t" style={{ borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0' }}>
            {/* Reply */}
            <button
              type="button"
              onClick={() => setComposerMode('reply')}
              className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-white transition-transform active:scale-95"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9' }}
              >
                <ArrowUUpLeft size={16} weight="bold" />
              </div>
              <span className="text-[10px] font-medium">Reply</span>
            </button>

            {/* Reply All */}
            <button
              type="button"
              onClick={() => setComposerMode('reply-all')}
              className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-white transition-transform active:scale-95"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9' }}
              >
                <ArrowsLeftRight size={16} weight="bold" />
              </div>
              <span className="text-[10px] font-medium">Reply All</span>
            </button>

            {/* Forward */}
            <button
              type="button"
              onClick={() => setComposerMode('forward')}
              className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-white transition-transform active:scale-95"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9' }}
              >
                <ArrowUUpRight size={16} weight="bold" />
              </div>
              <span className="text-[10px] font-medium">Forward</span>
            </button>

            {/* More */}
            <button
              type="button"
              className="flex flex-col items-center gap-1 p-2 text-slate-300 hover:text-white transition-transform active:scale-95"
            >
              <div
                className="w-10 h-10 rounded-full flex items-center justify-center"
                style={{ backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9' }}
              >
                <DotsThree size={20} weight="bold" />
              </div>
              <span className="text-[10px] font-medium">More</span>
            </button>
          </div>
        </div>

        {/* Quoted / Previous Message Card */}
        {showQuoted && (
          <div
            className="rounded-3xl p-4.5 space-y-3 transition-all"
            style={{
              backgroundColor: isDark ? '#0A0F1D' : '#F1F5F9',
              border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0'}`,
              color: isDark ? '#FFFFFF' : '#0F172A',
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                  style={{ backgroundColor: '#10B981' }}
                >
                  S
                </div>
                <div>
                  <h4 className="text-xs font-bold leading-tight" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                    Sales Team
                  </h4>
                  <p className="text-[10px] mt-0.5" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                    to Salman
                  </p>
                </div>
              </div>
              <span className="text-[10px] font-medium" style={{ color: isDark ? '#94A3B8' : '#64748B' }}>
                Yesterday, 4:28 PM
              </span>
            </div>

            <div
              className="text-xs leading-relaxed whitespace-pre-wrap py-1"
              style={{ color: isDark ? '#CBD5E1' : '#334155' }}
            >
              {'Hi Salman,\n\nPlease find the updated pricing for livestock rock salt (45 lb).\nFor 10+ pallets we can offer an additional 5% discount.\nDelivery timeline to Houston is approximately 12–15 days.\n\nLet us know if you need a formal quotation.\n\nBest regards,\nHimalayan Koh Sales Team'}
            </div>
          </div>
        )}

        {/* Attachments Section (Reference Image 3) */}
        <div className="space-y-2 pt-1">
          <h4
            className="text-xs font-bold uppercase tracking-wider"
            style={{ color: isDark ? '#94A3B8' : '#64748B' }}
          >
            2 Attachments
          </h4>

          <div className="grid grid-cols-2 gap-2.5">
            {/* Attachment 1: PDF */}
            <div
              className="p-3 rounded-2xl flex items-center gap-2.5 transition-all duration-150 active:scale-[0.98]"
              style={{
                backgroundColor: isDark ? '#0D1424' : '#FFFFFF',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'}`,
              }}
            >
              <div className="w-10 h-10 rounded-xl bg-rose-500/15 border border-rose-500/20 flex items-center justify-center text-rose-500 shrink-0">
                <FilePdf size={20} weight="fill" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate leading-tight" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                  HK_Pricing_2026.pdf
                </p>
                <p className="text-[10px] font-mono mt-0.5 text-slate-400">245 KB</p>
              </div>
            </div>

            {/* Attachment 2: Image */}
            <div
              className="p-3 rounded-2xl flex items-center gap-2.5 transition-all duration-150 active:scale-[0.98]"
              style={{
                backgroundColor: isDark ? '#0D1424' : '#FFFFFF',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'}`,
              }}
            >
              <div className="w-10 h-10 rounded-xl overflow-hidden bg-white/10 shrink-0 border border-white/10">
                <img
                  src="/images/hk_salt_crystal.webp"
                  alt="Attachment"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold truncate leading-tight" style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}>
                  Rock_Salt_45lb.jpg
                </p>
                <p className="text-[10px] font-mono mt-0.5 text-slate-400">1.2 MB</p>
              </div>
              <DownloadSimple size={14} className="text-slate-400 shrink-0" />
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Sticky Bottom Action Pills (Reference Image 3) ────────────── */}
      <div
        className="fixed bottom-0 inset-x-0 p-3.5 border-t flex items-center justify-center gap-2 shrink-0 z-30"
        style={{
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
          backgroundColor: isDark ? 'rgba(8, 12, 22, 0.95)' : 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(16px)',
          WebkitBackdropFilter: 'blur(16px)',
          paddingBottom: 'calc(0.875rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Reply Pill */}
        <button
          type="button"
          onClick={() => setComposerMode('reply')}
          className="flex-1 max-w-[120px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full text-xs font-bold text-white transition-all active:scale-95 shadow-md cursor-pointer"
          style={{
            backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
            color: isDark ? '#FFFFFF' : '#0F172A',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1'}`,
          }}
        >
          <ArrowUUpLeft size={14} weight="bold" />
          <span>Reply</span>
        </button>

        {/* Reply All Pill */}
        <button
          type="button"
          onClick={() => setComposerMode('reply-all')}
          className="flex-1 max-w-[120px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full text-xs font-bold text-white transition-all active:scale-95 shadow-md cursor-pointer"
          style={{
            backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
            color: isDark ? '#FFFFFF' : '#0F172A',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1'}`,
          }}
        >
          <ArrowsLeftRight size={14} weight="bold" />
          <span>Reply All</span>
        </button>

        {/* Forward Pill */}
        <button
          type="button"
          onClick={() => setComposerMode('forward')}
          className="flex-1 max-w-[120px] flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-full text-xs font-bold text-white transition-all active:scale-95 shadow-md cursor-pointer"
          style={{
            backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
            color: isDark ? '#FFFFFF' : '#0F172A',
            border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1'}`,
          }}
        >
          <ArrowUUpRight size={14} weight="bold" />
          <span>Forward</span>
        </button>
      </div>

      {/* ── 4. Full-screen Gmail-Style Reply Composer Modal ──────────────── */}
      {composerMode && (
        <MobileGmailReplyComposer
          mode={composerMode}
          initialSubject={thread.subject}
          initialTo={getRecipientChips(composerMode).to}
          initialCc={getRecipientChips(composerMode).cc}
          onClose={() => setComposerMode(null)}
          onSend={handleComposerSend}
          sending={sendingReply}
        />
      )}
    </div>
  );
}
