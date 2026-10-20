'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  Star,
  Moon,
  Sun,
  DotsThreeVertical,
  ArrowUUpLeft,
  ArrowUUpRight,
  CaretDown,
  CaretUp,
  FilePdf,
  Image as ImageIcon,
  FileText,
  DownloadSimple,
  Lock,
  Paperclip,
  Eye,
  Code,
} from '@phosphor-icons/react';
import type { InboxThread, InboxMessage, InboxAttachment } from '@/lib/email/inboxStore';
import { useMobileTheme } from '@/context/MobileThemeContext';
import { getMobilePalette } from './MobileThemeTokens';
import { MobileGmailReplyComposer, RecipientChip } from './MobileGmailReplyComposer';

/**
 * Sanitizes raw HTML email content for secure, responsive rendering on mobile viewports.
 */
function sanitizeEmailHtml(rawHtml: string): string {
  if (!rawHtml) return '';
  let clean = rawHtml;
  // Remove script tags and contents
  clean = clean.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
  // Remove iframe, object, embed, form
  clean = clean.replace(/<\/?(iframe|object|embed|form)\b[^>]*>/gi, '');
  // Remove inline event handlers (onload, onclick, onerror, etc.)
  clean = clean.replace(/\son\w+="[^"]*"/gi, '');
  clean = clean.replace(/\son\w+='[^']*'/gi, '');
  clean = clean.replace(/\son\w+=\w+/gi, '');
  // Ensure target="_blank" and rel="noopener noreferrer" on all links
  clean = clean.replace(/<a\s+(?:[^>]*?\s+)?href=/gi, '<a target="_blank" rel="noopener noreferrer" href=');
  return clean;
}

/**
 * Turns plain text URLs, email addresses, and phone numbers into clickable interactive links.
 */
function renderClickableText(text: string) {
  const combinedRegex = /(https?:\/\/[^\s<>"{}|\\^`]+|[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}|\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4})/g;
  const parts = text.split(combinedRegex);
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.startsWith('http://') || part.startsWith('https://')) {
      return (
        <a
          key={i}
          href={part}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 hover:text-blue-400 underline font-medium break-all"
        >
          {part}
        </a>
      );
    }
    if (/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(part)) {
      return (
        <a
          key={i}
          href={`mailto:${part}`}
          className="text-blue-500 hover:text-blue-400 underline font-medium"
        >
          {part}
        </a>
      );
    }
    if (/^\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}$/.test(part)) {
      const cleanPhone = part.replace(/[^\d+]/g, '');
      return (
        <a
          key={i}
          href={`tel:${cleanPhone}`}
          className="text-blue-500 hover:text-blue-400 underline font-medium"
        >
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

/**
 * Dedicated Gmail Message Body Renderer:
 * - HTML Mode: Displays rich emails inside a clean white canvas with full responsive styles,
 *   preserving tables, brand colors, images, dividers, and formatted signatures.
 * - Plain Text Mode: Displays 14.5px readable text with generous line-height, clickable links,
 *   clean paragraph spacing, quote blocks, and formatted signatures.
 * - Optional mode switcher when both representations exist.
 */
function GmailMessageBodyRenderer({
  msg,
  isDark,
}: {
  msg: InboxMessage;
  isDark: boolean;
}) {
  const hasHtml = Boolean(
    msg.bodyHtml &&
      msg.bodyHtml.trim().length > 0 &&
      /<[a-z][\s\S]*>/i.test(msg.bodyHtml)
  );
  const hasText = Boolean(msg.bodyText && msg.bodyText.trim().length > 0);

  // Default to rich HTML view when HTML is present
  const [viewMode, setViewMode] = useState<'html' | 'text'>(hasHtml ? 'html' : 'text');
  const activeMode = hasHtml && viewMode === 'html' ? 'html' : 'text';

  const rawText = msg.bodyText || msg.snippet || 'No message content.';
  const paragraphs = rawText.split(/\n\n+/);

  return (
    <div className="w-full space-y-2 select-text pt-1">
      {/* View Mode Toggle Pill (Visible if rich HTML exists) */}
      {hasHtml && (
        <div className="flex items-center justify-between pb-1 px-0.5">
          <span className="text-[11px] font-semibold text-slate-400 flex items-center gap-1">
            <span>Message Content</span>
          </span>
          <div
            className="inline-flex items-center p-0.5 rounded-full text-[10px] font-bold border transition-all"
            style={{
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#F1F5F9',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
            }}
          >
            <button
              type="button"
              onClick={() => setViewMode('html')}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full transition-all cursor-pointer ${
                activeMode === 'html'
                  ? 'bg-blue-600 text-white shadow-xs font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Eye size={11} weight="bold" />
              <span>Rich View</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('text')}
              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full transition-all cursor-pointer ${
                activeMode === 'text'
                  ? 'bg-blue-600 text-white shadow-xs font-black'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Code size={11} weight="bold" />
              <span>Plain Text</span>
            </button>
          </div>
        </div>
      )}

      {/* ── Mode 1: Rich HTML Canvas (Authentic Gmail Mobile Canvas) ──────── */}
      {activeMode === 'html' && (
        <div
          className="rounded-2xl p-4 sm:p-5 shadow-sm border overflow-x-auto my-1 transition-all"
          style={{
            backgroundColor: '#FFFFFF',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#E2E8F0',
            color: '#0F172A',
          }}
        >
          <style jsx>{`
            .gmail-html-body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              font-size: 14.5px;
              line-height: 1.65;
              color: #0F172A;
              word-break: break-word;
            }
            .gmail-html-body img {
              max-width: 100% !important;
              height: auto !important;
              border-radius: 8px;
              display: block;
              margin: 12px 0;
            }
            .gmail-html-body table {
              width: 100% !important;
              max-width: 100% !important;
              border-collapse: collapse !important;
              margin: 14px 0 !important;
              font-size: 13px !important;
            }
            .gmail-html-body th, .gmail-html-body td {
              padding: 8px 10px !important;
              border: 1px solid #E2E8F0 !important;
            }
            .gmail-html-body a {
              color: #2563EB !important;
              text-decoration: underline !important;
              font-weight: 500 !important;
            }
            .gmail-html-body p {
              margin-bottom: 0.85rem !important;
            }
            .gmail-html-body p:last-child {
              margin-bottom: 0 !important;
            }
            .gmail-html-body h1, .gmail-html-body h2, .gmail-html-body h3 {
              color: #0F172A !important;
              font-weight: 800 !important;
              margin-top: 1rem !important;
              margin-bottom: 0.5rem !important;
            }
            .gmail-html-body hr {
              border: 0 !important;
              border-top: 1px solid #E2E8F0 !important;
              margin: 18px 0 !important;
            }
            .gmail-html-body ul, .gmail-html-body ol {
              padding-left: 1.25rem !important;
              margin-bottom: 0.85rem !important;
            }
            .gmail-html-body li {
              margin-bottom: 0.35rem !important;
            }
          `}</style>
          <div
            className="gmail-html-body"
            dangerouslySetInnerHTML={{
              __html: sanitizeEmailHtml(msg.bodyHtml!),
            }}
          />
        </div>
      )}

      {/* ── Mode 2: Clean Plain Text Canvas (Authentic Gmail Mobile) ──────── */}
      {activeMode === 'text' && (
        <div
          className="rounded-2xl p-4 sm:p-5 my-1 transition-all border shadow-sm font-sans"
          style={{
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.035)' : '#FFFFFF',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
            color: isDark ? '#F1F5F9' : '#0F172A',
          }}
        >
          <div className="space-y-3.5 text-[14.5px] leading-relaxed select-text font-normal">
            {paragraphs.map((paragraph, pIdx) => {
              const lines = paragraph.split('\n');
              return (
                <div key={pIdx} className="space-y-1">
                  {lines.map((line, lIdx) => {
                    const trimmed = line.trim();
                    if (!trimmed) {
                      return <div key={lIdx} className="h-1.5" />;
                    }

                    // Blockquote detection (lines starting with >)
                    if (trimmed.startsWith('>')) {
                      return (
                        <blockquote
                          key={lIdx}
                          className="border-l-2 border-slate-400/80 pl-3 py-0.5 my-1 italic text-slate-400 text-[13.5px]"
                        >
                          {renderClickableText(trimmed.replace(/^>\s*/, ''))}
                        </blockquote>
                      );
                    }

                    // Bullet item detection (lines starting with •, -, *)
                    if (/^[•\-\*]\s/.test(trimmed)) {
                      return (
                        <div key={lIdx} className="flex items-start gap-2.5 my-1 pl-1">
                          <span className="text-amber-500 font-bold shrink-0">&bull;</span>
                          <span className="flex-1">
                            {renderClickableText(trimmed.replace(/^[•\-\*]\s*/, ''))}
                          </span>
                        </div>
                      );
                    }

                    // Signature divider detection (-- or company separator)
                    if (trimmed === '--' || trimmed === '---' || trimmed.startsWith('-- ')) {
                      return (
                        <hr
                          key={lIdx}
                          className="my-3 border-t"
                          style={{
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0',
                          }}
                        />
                      );
                    }

                    return (
                      <p key={lIdx} className="break-words">
                        {renderClickableText(line)}
                      </p>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

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

  const [composerMode, setComposerMode] = useState<'reply' | 'forward' | null>(null);
  const [isStarred, setIsStarred] = useState(Boolean(thread.starred));
  // Track open state of details card per message (default: collapsed like real Gmail)
  const [expandedDetails, setExpandedDetails] = useState<Record<string, boolean>>({});

  // Touch gesture swipe-to-back state
  const touchStartRef = React.useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    // Only track single touch
    if (e.touches.length !== 1) return;
    const touch = e.touches[0];
    touchStartRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      time: Date.now(),
    };
    setIsSwiping(false);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - touchStartRef.current.x;
    const deltaY = touch.clientY - touchStartRef.current.y;

    if (!isSwiping) {
      // If user moved vertically more than horizontally, cancel swipe tracking!
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) >= Math.abs(deltaX)) {
        touchStartRef.current = null;
        return;
      }
      // If user swiped right by more than 12px and it's predominantly horizontal:
      if (deltaX > 12 && deltaX > Math.abs(deltaY) * 1.2) {
        setIsSwiping(true);
      }
    }

    if (isSwiping) {
      if (deltaX > 0) {
        // Apply smooth logarithmic dampening for wide drags
        const dampened = deltaX > 200 ? 200 + (deltaX - 200) * 0.45 : deltaX;
        setSwipeOffset(dampened);
      } else {
        setSwipeOffset(0);
      }
    }
  };

  const handleTouchEnd = () => {
    if (!touchStartRef.current) {
      setSwipeOffset(0);
      setIsSwiping(false);
      return;
    }
    const deltaX = swipeOffset;
    const timeDiff = Date.now() - touchStartRef.current.time;
    const isQuickFlick = deltaX > 40 && timeDiff < 300;

    if (isSwiping && (deltaX > 75 || isQuickFlick)) {
      setSwipeOffset(window.innerWidth || 380);
      setTimeout(() => {
        onBack();
      }, 160);
    } else {
      setSwipeOffset(0);
    }
    touchStartRef.current = null;
    setIsSwiping(false);
  };

  const handleTouchCancel = () => {
    setSwipeOffset(0);
    touchStartRef.current = null;
    setIsSwiping(false);
  };

  const messages = thread.messages && thread.messages.length > 0
    ? thread.messages
    : [thread.latestMessage].filter(Boolean);

  const latestMessage = messages[messages.length - 1];

  const handleToggleStar = () => {
    setIsStarred(!isStarred);
    onToggleStar?.(thread.threadId);
  };

  const toggleMessageDetails = (id: string) => {
    setExpandedDetails((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const formatFullDate = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      const d = new Date(timestamp);
      return d.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return timestamp;
    }
  };

  const formatShortTime = (timestamp?: string) => {
    if (!timestamp) return '';
    try {
      const d = new Date(timestamp);
      return d.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getSenderDisplay = (msg: InboxMessage) => {
    const isOutbound = msg.direction === 'outbound';
    if (isOutbound) {
      const fromEmail = (msg.from?.email || '').toLowerCase();
      if (fromEmail.includes('orders')) {
        return {
          name: msg.from.name || 'Himalayan Koh Orders',
          email: msg.from.email,
          role: 'Orders & Fulfillment',
          avatarInitial: 'O',
          bg: '#F59E0B',
        };
      }
      if (fromEmail.includes('marketing')) {
        return {
          name: msg.from.name || 'Himalayan Koh Marketing',
          email: msg.from.email,
          role: 'Livestock & B2B Wholesale',
          avatarInitial: 'M',
          bg: '#A855F7',
        };
      }
      if (fromEmail.includes('support')) {
        return {
          name: msg.from.name || 'Himalayan Koh Support',
          email: msg.from.email,
          role: 'Customer Care',
          avatarInitial: 'S',
          bg: '#10B981',
        };
      }
      if (fromEmail.includes('salman')) {
        return {
          name: msg.from.name || 'Salman Bashir',
          email: msg.from.email,
          role: 'Direct Executive',
          avatarInitial: 'S',
          bg: '#3B82F6',
        };
      }
      return {
        name: msg.from.name || 'Himalayan Koh',
        email: msg.from.email || 'info@himalayankoh.com',
        role: 'Official Team',
        avatarInitial: 'H',
        bg: '#B45309',
      };
    }

    const cleanName = msg.from.name || msg.from.email.split('@')[0];
    return {
      name: cleanName,
      email: msg.from.email,
      role: 'Inbound Customer',
      avatarInitial: cleanName.charAt(0).toUpperCase(),
      bg: '#0EA5E9',
    };
  };

  const getRecipientChips = (mode: 'reply' | 'forward'): { to: RecipientChip[]; cc: RecipientChip[] } => {
    const isOutbound = latestMessage?.direction === 'outbound';
    let targetEmail = latestMessage?.from?.email || 'customer@example.com';
    let targetName = latestMessage?.from?.name || targetEmail.split('@')[0];

    if (isOutbound && latestMessage?.to && latestMessage.to.length > 0) {
      targetEmail = latestMessage.to[0].email;
      targetName = latestMessage.to[0].name || targetEmail.split('@')[0];
    }

    const to: RecipientChip[] = [
      {
        id: '1',
        name: targetName,
        email: targetEmail,
        avatarBg: '#10B981',
        avatarInitial: targetName.charAt(0).toUpperCase(),
      },
    ];

    return { to, cc: [] };
  };

  const handleComposerSend = async ({ bodyText }: { bodyText: string; cc?: string }) => {
    if (onSendReply) {
      await onSendReply(thread.threadId, bodyText, false);
      setComposerMode(null);
    }
  };

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="fixed inset-0 z-modal flex flex-col overflow-hidden text-white transition-colors duration-200 select-none md:select-auto"
      style={{
        backgroundColor: isDark ? '#080C16' : '#F8FAFC',
        transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined,
        transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
        touchAction: 'pan-y',
        boxShadow: swipeOffset > 0 ? '-12px 0 32px rgba(0, 0, 0, 0.45)' : undefined,
      }}
    >
      {/* Floating Swipe-to-Back tactile indicator */}
      {swipeOffset > 10 && (
        <div
          className="pointer-events-none fixed left-3 top-1/2 -translate-y-1/2 z-[110] flex items-center justify-center w-10 h-10 rounded-full bg-blue-600/90 text-white shadow-xl transition-all"
          style={{
            opacity: Math.min(1, swipeOffset / 50),
            transform: `translateY(-50%) scale(${Math.min(1.15, 0.75 + swipeOffset / 100)})`,
          }}
        >
          <ArrowLeft size={20} weight="bold" />
        </div>
      )}

      {/* ── 1. Top Bar With Subject & Actions (Gmail Style) ────────────── */}
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

        <div className="flex-1 min-w-0 px-2">
          <h1
            className="text-sm font-black truncate leading-tight flex items-center gap-1.5"
            style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}
          >
            <span>{thread.subject || '(No Subject)'}</span>
            {thread.mailbox && (
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
                {thread.mailbox.split('@')[0]}
              </span>
            )}
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

      {/* ── 2. Scrollable Thread Body ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 no-scrollbar pb-28">
        {messages.map((msg, index) => {
          const isLatest = index === messages.length - 1;
          const msgKey = msg.id || String(index);
          const isDetailsOpen = Boolean(expandedDetails[msgKey]);
          const senderInfo = getSenderDisplay(msg);
          const recipientStr =
            msg.to && msg.to.length > 0
              ? msg.to.map((t) => (t.name ? `${t.name} <${t.email}>` : t.email)).join(', ')
              : 'undisclosed-recipients';

          return (
            <div
              key={msgKey}
              className="rounded-3xl p-4 space-y-3 transition-all shadow-sm"
              style={{
                backgroundColor: isDark ? '#0D1424' : '#FFFFFF',
                border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0'}`,
                color: isDark ? '#FFFFFF' : '#0F172A',
              }}
            >
              {/* Sender Header Row (Matching Gmail Exactly) */}
              <div className="flex items-start justify-between gap-2.5">
                <div className="flex items-center gap-3 min-w-0">
                  {/* Sender Avatar Circle */}
                  <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white shrink-0 shadow-sm"
                    style={{
                      background: senderInfo.bg,
                      border: '1.5px solid rgba(255, 255, 255, 0.2)',
                    }}
                  >
                    {senderInfo.avatarInitial}
                  </div>

                  <div className="min-w-0">
                    <h3
                      className="text-sm font-bold leading-tight truncate"
                      style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}
                    >
                      {senderInfo.name}
                    </h3>

                    {/* Gmail "to me ᐯ" Expandable Button */}
                    <button
                      type="button"
                      onClick={() => toggleMessageDetails(msgKey)}
                      className="inline-flex items-center gap-1 text-[11.5px] font-medium text-slate-400 hover:text-slate-200 mt-0.5 cursor-pointer active:scale-95"
                    >
                      <span>
                        to {msg.direction === 'outbound' ? (msg.to?.[0]?.name || msg.to?.[0]?.email || 'recipient') : 'me'}
                      </span>
                      {isDetailsOpen ? (
                        <CaretUp size={11} weight="bold" />
                      ) : (
                        <CaretDown size={11} weight="bold" />
                      )}
                    </button>
                  </div>
                </div>

                {/* Date / Time */}
                <span
                  className="text-[11.5px] font-medium shrink-0 pt-0.5"
                  style={{ color: isDark ? '#94A3B8' : '#64748B' }}
                >
                  {formatShortTime(msg.createdAt)}
                </span>
              </div>

              {/* ── Gmail Expandable Details Card (From, To, Date, Security) ── */}
              {isDetailsOpen && (
                <div
                  className="p-3.5 rounded-2xl space-y-2 text-xs border animate-in fade-in duration-150"
                  style={{
                    backgroundColor: isDark ? 'rgba(0, 0, 0, 0.45)' : '#F8FAFC',
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                  }}
                >
                  {/* From */}
                  <div className="flex items-start gap-3">
                    <span className="text-slate-400 font-semibold w-12 shrink-0">From</span>
                    <span
                      className="font-medium break-all"
                      style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}
                    >
                      {senderInfo.name} &bull;{' '}
                      <span className="text-blue-400">{senderInfo.email}</span>
                    </span>
                  </div>

                  {/* To */}
                  <div className="flex items-start gap-3">
                    <span className="text-slate-400 font-semibold w-12 shrink-0">To</span>
                    <span
                      className="font-medium break-all"
                      style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}
                    >
                      {recipientStr}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="flex items-start gap-3">
                    <span className="text-slate-400 font-semibold w-12 shrink-0">Date</span>
                    <span
                      className="font-medium"
                      style={{ color: isDark ? '#F1F5F9' : '#0F172A' }}
                    >
                      {formatFullDate(msg.createdAt)}
                    </span>
                  </div>

                  {/* Security / Encryption */}
                  <div
                    className="flex items-center gap-1.5 pt-2 border-t text-[11px] text-slate-300"
                    style={{
                      borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                    }}
                  >
                    <Lock size={13} weight="fill" className="text-emerald-400 shrink-0" />
                    <span>Standard encryption (TLS).</span>
                  </div>
                </div>
              )}

              {/* ── Message Content (Authentic Gmail Mobile Canvas) ── */}
              <GmailMessageBodyRenderer msg={msg} isDark={isDark} />

              {/* ── Real Message Attachments ── */}
              {msg.attachments && msg.attachments.length > 0 && (
                <div
                  className="space-y-2 pt-2 border-t"
                  style={{
                    borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0',
                  }}
                >
                  <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400">
                    <Paperclip size={13} weight="bold" />
                    <span>{msg.attachments.length} Attachment(s)</span>
                  </div>

                  <div className="grid grid-cols-1 gap-2">
                    {msg.attachments.map((att: InboxAttachment) => {
                      const isPdf = att.mimeType?.includes('pdf') || att.filename.endsWith('.pdf');
                      const isImg = att.mimeType?.includes('image');
                      const fileUrl =
                        att.filename === 'Himalayan-Koh-Wholesale-Catalog-2026.pdf'
                          ? '/Himalayan-Koh-Wholesale-Catalog-2026.pdf'
                          : att.contentBase64
                          ? `data:${att.mimeType};base64,${att.contentBase64}`
                          : '#';

                      return (
                        <a
                          key={att.id || att.filename}
                          href={fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download={att.filename}
                          className="p-3 rounded-2xl flex items-center justify-between gap-3 transition-all active:scale-[0.99] border hover:opacity-90"
                          style={{
                            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.04)' : '#F1F5F9',
                            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
                          }}
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-9 h-9 rounded-xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400 shrink-0">
                              {isPdf ? (
                                <FilePdf size={18} weight="fill" />
                              ) : isImg ? (
                                <ImageIcon size={18} weight="fill" />
                              ) : (
                                <FileText size={18} weight="fill" />
                              )}
                            </div>
                            <div className="min-w-0">
                              <p
                                className="text-xs font-semibold truncate leading-tight"
                                style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}
                              >
                                {att.filename}
                              </p>
                              <p className="text-[10px] text-slate-400 mt-0.5">
                                {formatFileSize(att.sizeBytes)}
                              </p>
                            </div>
                          </div>

                          <DownloadSimple size={16} className="text-slate-400 shrink-0" />
                        </a>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── 3. Sticky Bottom Action Pills (Matching Gmail Exactly) ───────── */}
      <div
        className="fixed bottom-0 inset-x-0 p-3.5 border-t flex items-center justify-center gap-3 shrink-0 z-30"
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
          className="flex-1 max-w-[150px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs font-extrabold transition-all active:scale-95 shadow-md cursor-pointer"
          style={{
            backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
            color: isDark ? '#FFFFFF' : '#0F172A',
            border: `1.5px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1'}`,
          }}
        >
          <ArrowUUpLeft size={16} weight="bold" />
          <span>Reply</span>
        </button>

        {/* Forward Pill */}
        <button
          type="button"
          onClick={() => setComposerMode('forward')}
          className="flex-1 max-w-[150px] flex items-center justify-center gap-2 py-2.5 px-4 rounded-full text-xs font-extrabold transition-all active:scale-95 shadow-md cursor-pointer"
          style={{
            backgroundColor: isDark ? '#1E293B' : '#E2E8F0',
            color: isDark ? '#FFFFFF' : '#0F172A',
            border: `1.5px solid ${isDark ? 'rgba(255, 255, 255, 0.12)' : '#CBD5E1'}`,
          }}
        >
          <ArrowUUpRight size={16} weight="bold" />
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
