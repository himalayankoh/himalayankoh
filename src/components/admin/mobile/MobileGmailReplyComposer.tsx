'use client';

import React, { useState } from 'react';
import {
  ArrowLeft,
  PaperPlaneRight,
  Paperclip,
  Camera,
  TextB,
  TextItalic,
  TextUnderline,
  ListBullets,
  ListNumbers,
  LinkSimple,
  X,
  CaretDown,
} from '@phosphor-icons/react';
import { useMobileTheme } from '@/context/MobileThemeContext';
import { getMobilePalette } from './MobileThemeTokens';

export interface RecipientChip {
  id: string;
  name: string;
  email: string;
  avatarBg?: string;
  avatarInitial?: string;
}

interface MobileGmailReplyComposerProps {
  onClose: () => void;
  onSend: (payload: {
    to: string;
    cc?: string;
    subject: string;
    bodyText: string;
    attachments?: File[];
  }) => Promise<void>;
  initialTo?: RecipientChip[];
  initialCc?: RecipientChip[];
  initialSubject?: string;
  mode?: 'reply' | 'reply-all' | 'forward';
  sending?: boolean;
}

export function MobileGmailReplyComposer({
  onClose,
  onSend,
  initialTo = [],
  initialCc = [],
  initialSubject = '',
  mode = 'reply',
  sending = false,
}: MobileGmailReplyComposerProps) {
  const { isDark } = useMobileTheme();
  const palette = getMobilePalette(isDark);

  const [toChips, setToChips] = useState<RecipientChip[]>(
    initialTo.length > 0
      ? initialTo
      : [{ id: '1', name: 'Sales Team', email: 'sales@himalayankoh.com', avatarBg: '#10B981', avatarInitial: 'S' }]
  );

  const [ccChips, setCcChips] = useState<RecipientChip[]>(
    initialCc.length > 0
      ? initialCc
      : mode === 'reply-all'
      ? [
          { id: 'cc1', name: 'Salman', email: 'salman@himalayankoh.com', avatarBg: '#6366F1', avatarInitial: 'S' },
          { id: 'cc2', name: 'Support Team', email: 'support@himalayankoh.com', avatarBg: '#F97316', avatarInitial: 'S' },
        ]
      : []
  );

  const [subject, setSubject] = useState(
    initialSubject || (mode === 'forward' ? 'Fwd: Inquiry' : 'Re: Product Pricing for Livestock')
  );

  const [bodyText, setBodyText] = useState(
    mode === 'forward'
      ? ''
      : 'Hi,\n\nThank you for the updated pricing. This looks good.\n\nPlease also share the delivery timeline to Houston and if there are any bulk discounts for 10+ pallets.\n\nRegards,\nSalman'
  );

  const [selectedFont, setSelectedFont] = useState('Sans');
  const [isBold, setIsBold] = useState(false);
  const [isItalic, setIsItalic] = useState(false);
  const [isUnderline, setIsUnderline] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRemoveTo = (id: string) => {
    setToChips((prev) => prev.filter((c) => c.id !== id));
  };

  const handleRemoveCc = (id: string) => {
    setCcChips((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSend = async () => {
    if (toChips.length === 0) {
      setErrorMsg('Please specify at least one recipient in "To"');
      return;
    }
    if (!bodyText.trim()) {
      setErrorMsg('Please write a message before sending');
      return;
    }

    setErrorMsg(null);
    try {
      await onSend({
        to: toChips.map((c) => c.email).join(', '),
        cc: ccChips.map((c) => c.email).join(', '),
        subject,
        bodyText,
        attachments,
      });
      onClose();
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Failed to send email');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setAttachments((prev) => [...prev, ...Array.from(e.target.files!)]);
    }
  };

  return (
    <div
      className="fixed inset-0 z-modal flex flex-col overflow-hidden text-white transition-colors duration-200"
      style={{
        backgroundColor: isDark ? '#080C16' : '#F8FAFC',
      }}
    >
      {/* ── Top App Bar (Reference Image 2) ─────────────────────────────── */}
      <div
        className="px-4 py-3 border-b flex items-center justify-between shrink-0"
        style={{
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
          backgroundColor: isDark ? '#0B0E17' : '#FFFFFF',
        }}
      >
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            aria-label="Back to thread"
            className="w-10 h-10 rounded-full flex items-center justify-center transition-all active:scale-95 cursor-pointer"
            style={{
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
              color: isDark ? '#FFFFFF' : '#0F172A',
            }}
          >
            <ArrowLeft size={18} weight="bold" />
          </button>
          <h2
            className="text-base font-bold capitalize"
            style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}
          >
            {mode === 'reply-all' ? 'Reply All' : mode === 'forward' ? 'Forward' : 'Reply'}
          </h2>
        </div>

        {/* Primary Send Button with glowing gradient */}
        <button
          type="button"
          onClick={handleSend}
          disabled={sending}
          aria-label="Send email"
          className="w-11 h-11 rounded-2xl flex items-center justify-center text-white transition-all active:scale-95 cursor-pointer disabled:opacity-40"
          style={{
            background: 'linear-gradient(135deg, #2563EB 0%, #7C3AED 100%)',
            boxShadow: '0 4px 16px -2px rgba(124, 58, 237, 0.5)',
          }}
        >
          <PaperPlaneRight size={18} weight="fill" className={sending ? 'animate-pulse' : ''} />
        </button>
      </div>

      {errorMsg && (
        <div className="mx-4 mt-2 p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold">
          {errorMsg}
        </div>
      )}

      {/* ── Fields Section (To / Cc / Subject) ───────────────────────────── */}
      <div
        className="px-4 py-2 border-b space-y-2 shrink-0 text-xs"
        style={{
          borderColor: isDark ? 'rgba(255, 255, 255, 0.06)' : '#E2E8F0',
        }}
      >
        {/* "To" Field */}
        <div className="flex items-center gap-3 py-1">
          <span
            className="w-12 font-medium shrink-0"
            style={{ color: isDark ? '#94A3B8' : '#64748B' }}
          >
            To
          </span>
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
            {toChips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-semibold"
                style={{
                  backgroundColor: isDark ? '#131B2E' : '#E2E8F0',
                  color: isDark ? '#FFFFFF' : '#0F172A',
                  border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1'}`,
                }}
              >
                <span
                  className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ backgroundColor: chip.avatarBg || '#10B981' }}
                >
                  {chip.avatarInitial || chip.name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate max-w-[120px]">{chip.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemoveTo(chip.id)}
                  aria-label={`Remove ${chip.name}`}
                  className="p-0.5 text-slate-400 hover:text-white"
                >
                  <X size={12} weight="bold" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* "Cc" Field */}
        <div className="flex items-center gap-3 py-1">
          <span
            className="w-12 font-medium shrink-0"
            style={{ color: isDark ? '#94A3B8' : '#64748B' }}
          >
            Cc
          </span>
          <div className="flex flex-wrap items-center gap-1.5 flex-1 min-w-0">
            {ccChips.length > 0 ? (
              ccChips.map((chip) => (
                <span
                  key={chip.id}
                  className="inline-flex items-center gap-1.5 pl-1.5 pr-2 py-1 rounded-full text-xs font-semibold"
                  style={{
                    backgroundColor: isDark ? '#131B2E' : '#E2E8F0',
                    color: isDark ? '#FFFFFF' : '#0F172A',
                    border: `1px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#CBD5E1'}`,
                  }}
                >
                  <span
                    className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                    style={{ backgroundColor: chip.avatarBg || '#8B5CF6' }}
                  >
                    {chip.avatarInitial || chip.name.charAt(0).toUpperCase()}
                  </span>
                  <span className="truncate max-w-[120px]">{chip.name}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveCc(chip.id)}
                    aria-label={`Remove ${chip.name}`}
                    className="p-0.5 text-slate-400 hover:text-white"
                  >
                    <X size={12} weight="bold" />
                  </button>
                </span>
              ))
            ) : (
              <span className="text-slate-500 text-xs italic">No CC recipients</span>
            )}
          </div>
        </div>

        {/* "Subject" Field */}
        <div className="flex items-center gap-3 py-1">
          <span
            className="w-12 font-medium shrink-0"
            style={{ color: isDark ? '#94A3B8' : '#64748B' }}
          >
            Subject
          </span>
          <input
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            className="flex-1 bg-transparent text-xs font-semibold outline-none truncate"
            style={{ color: isDark ? '#FFFFFF' : '#0F172A' }}
            placeholder="Subject..."
          />
        </div>
      </div>

      {/* ── Main Message Body Textarea ───────────────────────────────────── */}
      <div className="flex-1 p-4 overflow-y-auto">
        <textarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          placeholder="Compose reply..."
          className="w-full h-full bg-transparent outline-none resize-none text-xs leading-relaxed font-sans"
          style={{
            color: isDark ? '#FFFFFF' : '#0F172A',
            fontWeight: isBold ? 'bold' : 'normal',
            fontStyle: isItalic ? 'italic' : 'normal',
            textDecoration: isUnderline ? 'underline' : 'none',
          }}
        />
      </div>

      {/* ── Uploaded Attachments preview ─────────────────────────────────── */}
      {attachments.length > 0 && (
        <div
          className="px-4 py-2 border-t flex flex-wrap gap-2 shrink-0"
          style={{ borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0' }}
        >
          {attachments.map((file, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-[11px] font-medium"
              style={{
                backgroundColor: isDark ? '#131B2E' : '#E2E8F0',
                color: isDark ? '#FFFFFF' : '#0F172A',
              }}
            >
              <Paperclip size={12} />
              <span className="truncate max-w-[120px]">{file.name}</span>
              <button
                type="button"
                onClick={() => setAttachments((prev) => prev.filter((_, idx) => idx !== i))}
                className="text-slate-400 hover:text-white"
              >
                <X size={10} weight="bold" />
              </button>
            </span>
          ))}
        </div>
      )}

      {/* ── Rich Formatting & Attachment Toolbar (Reference Image 2) ────── */}
      <div
        className="p-3 border-t flex flex-col gap-2 shrink-0"
        style={{
          borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#E2E8F0',
          backgroundColor: isDark ? '#0B0E17' : '#FFFFFF',
          paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))',
        }}
      >
        {/* Formatting row */}
        <div
          className="flex items-center justify-between px-3 py-1.5 rounded-2xl border"
          style={{
            backgroundColor: isDark ? '#131B2E' : '#F1F5F9',
            borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1',
          }}
        >
          {/* Font dropdown */}
          <button
            type="button"
            className="flex items-center gap-1 text-xs font-semibold text-slate-300 hover:text-white"
          >
            <span>{selectedFont}</span>
            <CaretDown size={12} weight="bold" />
          </button>

          <div className="h-4 w-px bg-slate-700/60" />

          {/* Bold */}
          <button
            type="button"
            onClick={() => setIsBold(!isBold)}
            className={`p-1 rounded-lg text-xs font-bold transition-colors ${
              isBold ? 'text-blue-400 bg-white/10' : 'text-slate-400 hover:text-white'
            }`}
          >
            <TextB size={16} weight="bold" />
          </button>

          {/* Italic */}
          <button
            type="button"
            onClick={() => setIsItalic(!isItalic)}
            className={`p-1 rounded-lg text-xs font-bold transition-colors ${
              isItalic ? 'text-blue-400 bg-white/10' : 'text-slate-400 hover:text-white'
            }`}
          >
            <TextItalic size={16} weight="bold" />
          </button>

          {/* Underline */}
          <button
            type="button"
            onClick={() => setIsUnderline(!isUnderline)}
            className={`p-1 rounded-lg text-xs font-bold transition-colors ${
              isUnderline ? 'text-blue-400 bg-white/10' : 'text-slate-400 hover:text-white'
            }`}
          >
            <TextUnderline size={16} weight="bold" />
          </button>

          <div className="h-4 w-px bg-slate-700/60" />

          {/* Bullet List */}
          <button
            type="button"
            className="p-1 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
          >
            <ListBullets size={16} weight="bold" />
          </button>

          {/* Number List */}
          <button
            type="button"
            className="p-1 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
          >
            <ListNumbers size={16} weight="bold" />
          </button>

          {/* Link */}
          <button
            type="button"
            className="p-1 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
          >
            <LinkSimple size={16} weight="bold" />
          </button>
        </div>

        {/* Attachment Pill & Camera Button */}
        <div className="flex items-center gap-2">
          <label
            className="flex-1 flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border text-xs font-medium cursor-pointer transition-colors active:scale-95"
            style={{
              backgroundColor: isDark ? '#131B2E' : '#F1F5F9',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1',
              color: isDark ? '#94A3B8' : '#475569',
            }}
          >
            <Paperclip size={16} weight="bold" />
            <span>Attach files</span>
            <input type="file" multiple onChange={handleFileChange} className="hidden" />
          </label>

          <label
            aria-label="Take or attach photo"
            className="w-11 h-11 rounded-2xl flex items-center justify-center border text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0 active:scale-95"
            style={{
              backgroundColor: isDark ? '#131B2E' : '#F1F5F9',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#CBD5E1',
            }}
          >
            <Camera size={18} weight="bold" />
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
