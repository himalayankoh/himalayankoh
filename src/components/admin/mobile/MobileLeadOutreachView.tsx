'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  ArrowLeft,
  X,
  Phone,
  EnvelopeSimple,
  Chats,
  Globe,
  FacebookLogo,
  InstagramLogo,
  WhatsappLogo,
  CheckCircle,
  PaperPlaneRight,
  ArrowsClockwise,
  Clock,
  Sparkle,
  Buildings,
  Storefront,
  Fire,
  Lightning,
  FilePdf,
  Tag,
  Paperclip,
  Trash,
  Check,
  Copy,
  WarningCircle,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react';
import type { SavedLeadRecord } from '@/lib/leados/types';
import type { InboxThread, InboxMessage, MailboxAddress } from '@/lib/email/inboxStore';
import { useMobileTheme } from '@/context/MobileThemeContext';
import { getMobilePalette } from './MobileThemeTokens';

export interface MobileLeadOutreachViewProps {
  lead: SavedLeadRecord;
  onBack: () => void;
  onUpdateStatus?: (leadId: string, newStatus: string) => Promise<void> | void;
  onRefreshLead?: () => void;
}

export type OutreachChannel = 'email' | 'facebook' | 'instagram' | 'phone' | 'website';

export type LeadCommercialCategory = 'wholesale' | 'retail' | 'livestock' | 'general';

interface EmailTemplate {
  label: string;
  subject: string;
  body: string;
  category: LeadCommercialCategory;
  attachCatalog: boolean;
  mailbox: MailboxAddress;
}

const OUTREACH_TEMPLATES: EmailTemplate[] = [
  {
    label: 'Wholesale Cattle Salt Licks (Ranches & Feed Stores)',
    category: 'wholesale',
    subject: 'Himalayan Mineral Rock Salt Licks for Cattle & Livestock — Houston Direct',
    body: `Hi {name} Team,

We supply 100% authentic solid-mined Himalayan rock salt licks and mineral bags directly from our Houston, Texas distribution center to feed stores, ranches, and agricultural operations{city}.

Key Advantages:
• Solid Mined Rock: Weather-resistant in pastures; does not dissolve or turn into mush in rain
• 84 Natural Trace Minerals: Essential iron, calcium, magnesium, and potassium for herd vitality
• Pallet & Freight Supply: Dispatched directly from Houston, TX with liftgate service available

Attached is our official 2026 Wholesale Product Catalog with complete SKU specifications and volume tier pricing.

Would you be open to receiving a complimentary 30 lb sample lick block for your ranch or store to test durability firsthand?

Best regards,
Himalayan Koh Livestock & Commercial Division
Houston Distribution Hub: 12620 FM 1960 W Ste A-4, Houston, TX 77065
Phone: (832) 224-6466 | Web: himalayankoh.com/wholesale`,
    attachCatalog: true,
    mailbox: 'marketing@himalayankoh.com',
  },
  {
    label: 'Retail Storefront Introductory Offer (5% Off Trial Order)',
    category: 'retail',
    subject: 'Authentic Himalayan Pink Salt Licks & Mineral Products — Retail Display for {name}',
    body: `Hi {name} Team,

We noticed your storefront{city} and would love to introduce our authentic hand-carved Himalayan Pink Salt licks, equine rope licks, and mineral products.

To welcome you as a retail partner, please enjoy 5% off your first retail trial order with coupon code TRIAL5 at checkout:
👉 https://himalayankoh.com/wholesale

• Individual retail-ready barcodes and durable rope packaging
• High retail margins for feed & equestrian specialty shops
• Dispatched within 24 hours from Houston, Texas

Attached is our 2026 Wholesale & Retail Catalog. Feel free to reply directly to this email or call (832) 224-6466 if you have any questions.

Warm regards,
Himalayan Koh Retail Sales Team
Phone: (832) 224-6466 | Web: himalayankoh.com`,
    attachCatalog: true,
    mailbox: 'marketing@himalayankoh.com',
  },
  {
    label: 'Complimentary Sample Rock Salt Lick Offer',
    category: 'livestock',
    subject: 'Complimentary Sample Rock Salt Lick Dispatched — Himalayan Koh',
    body: `Hi {name} Team,

We would like to send a complimentary sample block of our solid-mined Himalayan mineral rock salt lick to your operation{city}.

Our pasture licks are 100% natural mined rock with zero chemical binders, lasting 3x longer in outdoor weather than standard compressed salt bricks.

Please review the attached 2026 Wholesale Catalog for specifications. Simply reply with your preferred shipping address and we will dispatch a sample block directly to your ranch or feed store.

Sincerely,
Himalayan Koh B2B Operations
Houston, Texas | (832) 224-6466`,
    attachCatalog: true,
    mailbox: 'marketing@himalayankoh.com',
  },
];

export function MobileLeadOutreachView({
  lead,
  onBack,
  onUpdateStatus,
  onRefreshLead,
}: MobileLeadOutreachViewProps) {
  const { isDark } = useMobileTheme();
  const palette = getMobilePalette(isDark);

  const [currentStatus, setCurrentStatus] = useState<string>(lead.status || 'new');
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [statusSuccessMsg, setStatusSuccessMsg] = useState<string | null>(null);

  // Email correspondence state
  const [loadingThreads, setLoadingThreads] = useState(true);
  const [leadThreads, setLeadThreads] = useState<InboxThread[]>([]);
  const [threadError, setThreadError] = useState<string | null>(null);

  // Quick Composer State
  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [selectedMailbox, setSelectedMailbox] = useState<MailboxAddress>('marketing@himalayankoh.com');
  const [selectedTemplateIndex, setSelectedTemplateIndex] = useState<number>(0);
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [hasCatalogAttachment, setHasCatalogAttachment] = useState(true);
  const [sendingEmail, setSendingEmail] = useState(false);
  const [sendFeedback, setSendFeedback] = useState<{ ok: boolean; msg: string } | null>(null);

  // Copied alert state
  const [copiedField, setCopiedField] = useState<string | null>(null);

  // Touch gesture swipe-to-back state
  const touchStartRef = useRef<{ x: number; y: number; time: number } | null>(null);
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isSwiping, setIsSwiping] = useState(false);

  // Synchronize Android hardware back button & browser back gesture
  useEffect(() => {
    try {
      window.history.pushState({ modal: 'mobile-lead-outreach' }, '');
    } catch {
      // safe fallback
    }

    const handlePopState = () => {
      onBack();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [onBack]);

  const handleTouchStart = (e: React.TouchEvent) => {
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
      if (Math.abs(deltaY) > 8 && Math.abs(deltaY) >= Math.abs(deltaX)) {
        touchStartRef.current = null;
        return;
      }
      if (deltaX > 12 && deltaX > Math.abs(deltaY) * 1.2) {
        setIsSwiping(true);
      }
    }

    if (isSwiping && deltaX > 0) {
      const dampened = Math.min(deltaX * 0.85, window.innerWidth || 380);
      setSwipeOffset(dampened);
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

  // 1. Analyze Commercial Category: Wholesale vs Retail vs Livestock
  const commercialAnalysis = useMemo(() => {
    const text = [
      lead.businessName,
      lead.category,
      lead.notes,
      lead.research?.publicCompanyName,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();

    const isLivestock = /cattle|ranch|cow|beef|dairy|livestock|equine|horse|stable|pasture|feed & seed|feed store|feed mill/i.test(
      text
    );
    const isWholesale = /wholesale|distribut|elevator|bulk|supplier|co-op|cooperative/i.test(text);
    const isRetail = /retail|shop|market|store|boutique|tack shop|pet supplies/i.test(text);

    if (isWholesale) {
      return {
        type: 'wholesale' as LeadCommercialCategory,
        badge: 'Wholesale Bulk Buyer',
        icon: Buildings,
        color: '#6366F1',
        bg: 'rgba(99, 102, 241, 0.15)',
        border: 'rgba(99, 102, 241, 0.35)',
        products: '30 lb Cattle Licks (Pallet Supply) • 45 lb Livestock Bags',
        defaultTemplateIndex: 0,
      };
    }
    if (isLivestock) {
      return {
        type: 'livestock' as LeadCommercialCategory,
        badge: 'Livestock & Cattle Ranch',
        icon: Sparkle,
        color: '#10B981',
        bg: 'rgba(16, 185, 129, 0.15)',
        border: 'rgba(16, 185, 129, 0.35)',
        products: '30 lb Weather-Resistant Pasture Blocks • 84 Trace Minerals',
        defaultTemplateIndex: 2,
      };
    }
    if (isRetail) {
      return {
        type: 'retail' as LeadCommercialCategory,
        badge: 'Retail Storefront',
        icon: Storefront,
        color: '#F59E0B',
        bg: 'rgba(245, 158, 11, 0.15)',
        border: 'rgba(245, 158, 11, 0.35)',
        products: '2 lb Horse Licks on Rope • 16 oz Gourmet Jars • Counter Displays',
        defaultTemplateIndex: 1,
      };
    }

    return {
      type: 'general' as LeadCommercialCategory,
      badge: 'B2B Salt Prospect',
      icon: Buildings,
      color: '#38BDF8',
      bg: 'rgba(56, 189, 248, 0.15)',
      border: 'rgba(56, 189, 248, 0.35)',
      products: 'Solid Rock Salt Licks & Livestock Feed Bags',
      defaultTemplateIndex: 0,
    };
  }, [lead]);

  // 2. Compute Lead Rating & Opportunity Tier
  const opportunityScore = lead.opportunityScore ?? 75;
  const ratingTier = useMemo(() => {
    if (opportunityScore >= 80) {
      return { label: 'Hot Lead 🔥', color: '#EF4444', text: 'High Conversion Potential' };
    }
    if (opportunityScore >= 60) {
      return { label: 'Strong Prospect ⚡', color: '#F59E0B', text: 'Active Buyer Profile' };
    }
    if (opportunityScore >= 40) {
      return { label: 'Moderate Match 📊', color: '#38BDF8', text: 'Standard B2B Qualification' };
    }
    return { label: 'Early Stage 🌱', color: '#94A3B8', text: 'Research Phase' };
  }, [opportunityScore]);

  // 3. Recommended Outreach Channels (Email vs Facebook vs Instagram vs Phone)
  const channelPriority = useMemo(() => {
    const channels: { channel: OutreachChannel; label: string; value: string; recommended: boolean }[] = [];
    const hasEmail = Boolean(lead.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim()));
    const hasPhone = Boolean(lead.phone && lead.phone.replace(/[^\d]/g, '').length >= 7);
    const hasFb = Boolean(lead.facebook || lead.research?.facebook);
    const hasIg = Boolean(lead.instagram || lead.research?.instagram);

    if (hasEmail) {
      channels.push({
        channel: 'email',
        label: 'Direct Email',
        value: lead.email!,
        recommended: true,
      });
    }
    if (hasPhone) {
      channels.push({
        channel: 'phone',
        label: 'Phone / WhatsApp',
        value: lead.phone!,
        recommended: !hasEmail,
      });
    }
    if (hasFb) {
      channels.push({
        channel: 'facebook',
        label: 'Facebook DM',
        value: (lead.facebook || lead.research?.facebook)!,
        recommended: !hasEmail && !hasPhone,
      });
    }
    if (hasIg) {
      channels.push({
        channel: 'instagram',
        label: 'Instagram DM',
        value: (lead.instagram || lead.research?.instagram)!,
        recommended: !hasEmail && !hasPhone && !hasFb,
      });
    }
    if (lead.website) {
      channels.push({
        channel: 'website',
        label: 'Website Contact',
        value: lead.website,
        recommended: channels.length === 0,
      });
    }

    return channels;
  }, [lead]);

  // 4. Load Email Correspondence for this lead from `/api/admin/inbox`
  const fetchLeadEmails = useCallback(async () => {
    setLoadingThreads(true);
    setThreadError(null);
    try {
      const q = lead.email ? encodeURIComponent(lead.email.trim()) : encodeURIComponent(lead.businessName);
      const res = await fetch(`/api/admin/inbox?search=${q}&leadId=${encodeURIComponent(lead.id)}`, {
        cache: 'no-store',
      });
      if (!res.ok) {
        throw new Error(`Inbox request failed (${res.status})`);
      }
      const data = await res.json();
      if (data.ok && Array.isArray(data.threads)) {
        // Filter specifically for this lead's email or leadId
        const matched = data.threads.filter((t: InboxThread) => {
          if (t.leadId === lead.id) return true;
          if (lead.email && t.participants?.some((p) => p.email.toLowerCase() === lead.email?.toLowerCase())) {
            return true;
          }
          if (lead.email && t.messages?.some((m) => m.from.email.toLowerCase() === lead.email?.toLowerCase() || m.to.some((to) => to.email.toLowerCase() === lead.email?.toLowerCase()))) {
            return true;
          }
          return false;
        });
        setLeadThreads(matched);
      } else {
        setLeadThreads([]);
      }
    } catch (err) {
      console.warn('Failed to load email history for lead:', err);
      setThreadError(err instanceof Error ? err.message : 'Could not fetch email history');
    } finally {
      setLoadingThreads(false);
    }
  }, [lead]);

  useEffect(() => {
    void fetchLeadEmails();
  }, [fetchLeadEmails]);

  // 5. Update Status Pipeline
  const handleStageSelect = async (newStage: string) => {
    if (updatingStatus || currentStatus === newStage) return;
    setUpdatingStatus(true);
    setStatusSuccessMsg(null);
    try {
      if (onUpdateStatus) {
        await onUpdateStatus(lead.id, newStage);
      } else {
        const res = await fetch('/api/admin/leados/leads', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: lead.id, status: newStage }),
        });
        if (!res.ok) throw new Error('Status update failed');
      }
      setCurrentStatus(newStage);
      setStatusSuccessMsg(`Stage updated to "${newStage.toUpperCase()}"`);
      setTimeout(() => setStatusSuccessMsg(null), 3000);
    } catch (err) {
      console.error('Error changing stage:', err);
    } finally {
      setUpdatingStatus(false);
    }
  };

  // 6. Prepopulate Composer with Lead Details
  const handleOpenComposer = (templateIdx: number = commercialAnalysis.defaultTemplateIndex) => {
    setSelectedTemplateIndex(templateIdx);
    const tpl = OUTREACH_TEMPLATES[templateIdx] || OUTREACH_TEMPLATES[0];
    const bName = lead.research?.publicCompanyName || lead.businessName || 'Partner';
    const cityText = lead.city ? ` in ${lead.city}` : '';

    setComposeSubject(tpl.subject.replace(/\{name\}/g, bName).replace(/\{city\}/g, cityText));
    setComposeBody(tpl.body.replace(/\{name\}/g, bName).replace(/\{city\}/g, cityText));
    setSelectedMailbox(tpl.mailbox);
    setHasCatalogAttachment(tpl.attachCatalog);
    setSendFeedback(null);
    setIsComposerOpen(true);
  };

  // 7. Dispatch Email
  const handleSendEmail = async () => {
    if (!lead.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(lead.email.trim())) {
      setSendFeedback({ ok: false, msg: 'Please provide a valid recipient email address.' });
      return;
    }
    if (!composeSubject.trim() || !composeBody.trim()) {
      setSendFeedback({ ok: false, msg: 'Subject and message body cannot be empty.' });
      return;
    }

    setSendingEmail(true);
    setSendFeedback(null);
    try {
      const attachments = hasCatalogAttachment
        ? [
            {
              filename: 'Himalayan-Koh-Wholesale-Catalog-2026.pdf',
              mimeType: 'application/pdf',
              sizeBytes: 1980000,
            },
          ]
        : [];

      const res = await fetch('/api/admin/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'send',
          mailbox: selectedMailbox,
          to: lead.email.trim(),
          subject: composeSubject.trim(),
          bodyText: composeBody.trim(),
          attachments,
          leadId: lead.id,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Failed to dispatch email');
      }

      setSendFeedback({ ok: true, msg: 'Outreach email successfully dispatched via Houston mail hub!' });

      // Automatically advance status to contacted if currently new
      if (currentStatus === 'new') {
        void handleStageSelect('contacted');
      }

      // Refresh email thread
      setTimeout(() => {
        void fetchLeadEmails();
        setIsComposerOpen(false);
      }, 1200);
    } catch (err) {
      console.error('Send outreach email error:', err);
      setSendFeedback({
        ok: false,
        msg: err instanceof Error ? err.message : 'Failed to send email. Please try again.',
      });
    } finally {
      setSendingEmail(false);
    }
  };

  const handleCopy = (text: string, fieldName: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldName);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const cleanPhone = (lead.phone || '').replace(/[^\d+]/g, '').replace('+', '');
  const locationText = [lead.address, lead.city, lead.region, lead.country].filter(Boolean).join(', ') || 'USA';

  // Compute N8N / Outreach Status Details
  const allMessages = useMemo(() => {
    const msgs: InboxMessage[] = [];
    for (const t of leadThreads) {
      if (t.messages && t.messages.length > 0) {
        msgs.push(...t.messages);
      } else if (t.latestMessage) {
        msgs.push(t.latestMessage);
      }
    }
    return msgs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [leadThreads]);

  const hasOutbound = allMessages.some((m) => m.direction === 'outbound');
  const hasInbound = allMessages.some((m) => m.direction === 'inbound');
  const latestMessage = allMessages[0] || null;

  return (
    <div
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      className="fixed inset-0 z-modal flex flex-col overflow-hidden text-white transition-colors duration-200 select-none md:select-auto"
      style={{
        backgroundColor: palette.bg,
        transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined,
        transition: isSwiping ? 'none' : 'transform 0.22s cubic-bezier(0.2, 0.9, 0.3, 1)',
        touchAction: 'pan-y',
        boxShadow: swipeOffset > 0 ? '-12px 0 32px rgba(0, 0, 0, 0.45)' : undefined,
      }}
    >
      {/* ── 1. Top Fixed Navigation Header ─────────────────────────────── */}
      <header
        className="shrink-0 flex items-center justify-between px-3.5 py-3 border-b backdrop-blur-md sticky top-0 z-20"
        style={{
          backgroundColor: palette.headerBg,
          borderColor: palette.divider,
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to leads list"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95 shrink-0"
            style={{
              backgroundColor: palette.iconBtnBg,
              border: `1px solid ${palette.iconBtnBorder}`,
              color: palette.iconBtnText,
            }}
          >
            <ArrowLeft size={18} weight="bold" />
          </button>

          <div className="min-w-0 flex-1">
            <h1
              className="text-sm font-extrabold truncate leading-tight"
              style={{ color: palette.textPrimary }}
            >
              {lead.businessName}
            </h1>
            <p className="text-[11px] font-medium truncate mt-0.5" style={{ color: palette.textMuted }}>
              {lead.city ? `${lead.city}, ${lead.region || 'US'}` : 'Lead Outreach Hub'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => void fetchLeadEmails()}
            aria-label="Refresh conversation"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{
              backgroundColor: palette.iconBtnBg,
              border: `1px solid ${palette.iconBtnBorder}`,
              color: palette.accentText,
            }}
          >
            <ArrowsClockwise size={16} weight="bold" className={loadingThreads ? 'animate-spin' : ''} />
          </button>

          <button
            type="button"
            onClick={onBack}
            aria-label="Close"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-95"
            style={{
              backgroundColor: palette.iconBtnBg,
              border: `1px solid ${palette.iconBtnBorder}`,
              color: palette.textSecondary,
            }}
          >
            <X size={16} weight="bold" />
          </button>
        </div>
      </header>

      {/* ── 2. Scrollable Body Content ─────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 pb-28">
        {/* Status Toast Alert */}
        {statusSuccessMsg && (
          <div className="p-3 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold flex items-center gap-2 animate-fadeIn">
            <CheckCircle size={16} weight="fill" />
            <span>{statusSuccessMsg}</span>
          </div>
        )}

        {/* ── CARD A: Interactive Sales Pipeline Tracker ───────────────── */}
        <section
          className="rounded-3xl p-4 transition-all relative overflow-hidden"
          style={{
            backgroundColor: palette.cardBg,
            border: `1px solid ${palette.cardBorder}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b" style={{ borderColor: palette.divider }}>
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: palette.textSecondary }}>
              Sales Pipeline Status
            </span>
            <span
              className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold"
              style={{
                backgroundColor:
                  currentStatus === 'converted'
                    ? 'rgba(16, 185, 129, 0.2)'
                    : currentStatus === 'qualified'
                    ? 'rgba(168, 85, 247, 0.2)'
                    : currentStatus === 'contacted'
                    ? 'rgba(245, 158, 11, 0.2)'
                    : 'rgba(6, 182, 212, 0.2)',
                color:
                  currentStatus === 'converted'
                    ? '#34D399'
                    : currentStatus === 'qualified'
                    ? '#C084FC'
                    : currentStatus === 'contacted'
                    ? '#FBBF24'
                    : '#22D3EE',
              }}
            >
              {currentStatus.toUpperCase()}
            </span>
          </div>

          {/* 4 Interactive Pipeline Buttons */}
          <div className="grid grid-cols-4 gap-1.5">
            {[
              { id: 'new', label: '1. New' },
              { id: 'contacted', label: '2. Contacted' },
              { id: 'qualified', label: '3. Qualified' },
              { id: 'converted', label: '4. Converted 🎉' },
            ].map((step) => {
              const isSelected = currentStatus.toLowerCase() === step.id;
              return (
                <button
                  key={step.id}
                  type="button"
                  disabled={updatingStatus}
                  onClick={() => void handleStageSelect(step.id)}
                  className="py-2.5 px-1.5 rounded-xl text-[11px] font-bold transition-all text-center flex flex-col items-center justify-center gap-1 active:scale-95 disabled:opacity-50"
                  style={{
                    background: isSelected ? palette.accentGradient : palette.cardElevatedBg,
                    color: isSelected ? '#FFFFFF' : palette.textSecondary,
                    border: `1px solid ${isSelected ? 'transparent' : palette.cardBorder}`,
                    boxShadow: isSelected ? palette.accentGlow : 'none',
                  }}
                >
                  <span>{step.label}</span>
                  {isSelected && <Check size={12} weight="bold" />}
                </button>
              );
            })}
          </div>

          <p className="text-[11px] mt-2.5 text-center font-medium" style={{ color: palette.textMuted }}>
            {currentStatus === 'converted'
              ? '🏆 Closed Won — Lead placed wholesale order or established retail partnership!'
              : currentStatus === 'qualified'
              ? '⚡ High Commercial Interest — Catalog reviewed, pricing & sample discussed.'
              : currentStatus === 'contacted'
              ? '📤 Initial Outreach Dispatched — Awaiting response from buyer.'
              : '🌱 Fresh Prospect — Ready for introductory outreach & catalog delivery.'}
          </p>
        </section>

        {/* ── CARD B: Commercial Profile & Lead Rating (Retail vs Wholesale) */}
        <section
          className="rounded-3xl p-4 transition-all relative overflow-hidden"
          style={{
            backgroundColor: palette.cardBg,
            border: `1px solid ${palette.cardBorder}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold"
                  style={{
                    backgroundColor: commercialAnalysis.bg,
                    color: commercialAnalysis.color,
                    border: `1px solid ${commercialAnalysis.border}`,
                  }}
                >
                  <commercialAnalysis.icon size={14} weight="bold" />
                  <span>{commercialAnalysis.badge}</span>
                </span>

                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                  style={{
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    color: ratingTier.color,
                  }}
                >
                  {ratingTier.label}
                </span>
              </div>

              <h2 className="text-sm font-bold mt-2" style={{ color: palette.textPrimary }}>
                Target Products & Assortment
              </h2>
              <p className="text-xs mt-0.5" style={{ color: palette.textSecondary }}>
                {commercialAnalysis.products}
              </p>
            </div>

            {/* Opportunity Score Ring / Badge */}
            <div
              className="w-14 h-14 rounded-2xl flex flex-col items-center justify-center shrink-0 shadow-inner"
              style={{
                backgroundColor: palette.cardElevatedBg,
                border: `1.5px solid ${ratingTier.color}`,
              }}
            >
              <span className="text-base font-black leading-none" style={{ color: ratingTier.color }}>
                {opportunityScore}%
              </span>
              <span className="text-[9px] font-semibold text-slate-400 mt-0.5">Rating</span>
            </div>
          </div>

          {/* ICP Fit & Reachability Metrics */}
          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t" style={{ borderColor: palette.divider }}>
            <div className="p-2 rounded-xl" style={{ backgroundColor: palette.cardElevatedBg }}>
              <span className="text-[10px] font-semibold" style={{ color: palette.textMuted }}>
                ICP Fit Score
              </span>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-indigo-500"
                    style={{ width: `${Math.min(100, Math.max(30, opportunityScore))}%` }}
                  />
                </div>
                <span className="text-xs font-bold" style={{ color: palette.textPrimary }}>
                  {opportunityScore}%
                </span>
              </div>
            </div>

            <div className="p-2 rounded-xl" style={{ backgroundColor: palette.cardElevatedBg }}>
              <span className="text-[10px] font-semibold" style={{ color: palette.textMuted }}>
                Reachability
              </span>
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1.5 rounded-full bg-slate-700 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500"
                    style={{ width: lead.email && lead.phone ? '95%' : lead.email || lead.phone ? '75%' : '40%' }}
                  />
                </div>
                <span className="text-xs font-bold" style={{ color: palette.textPrimary }}>
                  {lead.email && lead.phone ? 'High' : lead.email || lead.phone ? 'Med' : 'Low'}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* ── CARD C: N8N Automation & Outreach Dispatch Status ──────────── */}
        <section
          className="rounded-3xl p-4 transition-all"
          style={{
            backgroundColor: palette.cardBg,
            border: `1px solid ${palette.cardBorder}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <div className="flex items-center justify-between pb-2 mb-2 border-b" style={{ borderColor: palette.divider }}>
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: palette.textSecondary }}>
              <Lightning size={14} weight="fill" className="text-amber-400" />
              <span>N8N Outreach & Delivery Status</span>
            </span>

            <span
              className="px-2 py-0.5 rounded-full text-[10px] font-bold"
              style={{
                backgroundColor: hasInbound
                  ? 'rgba(16, 185, 129, 0.2)'
                  : hasOutbound
                  ? 'rgba(56, 189, 248, 0.2)'
                  : 'rgba(148, 163, 184, 0.15)',
                color: hasInbound ? '#34D399' : hasOutbound ? '#38BDF8' : '#94A3B8',
              }}
            >
              {hasInbound ? 'Replied 💬' : hasOutbound ? 'Delivered 📬' : 'Not Dispatched ⏳'}
            </span>
          </div>

          <div className="space-y-2 mt-2">
            <div className="flex items-center justify-between text-xs">
              <span style={{ color: palette.textMuted }}>Automation Engine:</span>
              <span className="font-semibold text-slate-200">
                {hasOutbound ? 'N8N Workflow / Direct API Active' : 'Ready for Automated Trigger'}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span style={{ color: palette.textMuted }}>Delivery Status:</span>
              <span className="font-semibold flex items-center gap-1">
                {hasInbound ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle size={13} weight="fill" /> Customer Replied
                  </span>
                ) : hasOutbound ? (
                  <span className="text-sky-400 flex items-center gap-1">
                    <CheckCircle size={13} weight="fill" /> Delivered to Recipient
                  </span>
                ) : (
                  <span className="text-slate-400">No Outreach Dispatched Yet</span>
                )}
              </span>
            </div>

            <div className="flex items-center justify-between text-xs">
              <span style={{ color: palette.textMuted }}>Last Contact:</span>
              <span className="font-mono text-[11px] text-slate-300">
                {latestMessage ? new Date(latestMessage.createdAt).toLocaleString() : 'Never contacted'}
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-800/60 border border-slate-700/50 mt-2">
              <div className="text-[11px] font-bold text-amber-300 mb-0.5 flex items-center gap-1">
                <Clock size={13} weight="bold" />
                <span>Follow-up Recommendation:</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-snug">
                {hasInbound
                  ? 'Buyer responded! Review customer message below and send tailored freight quotation.'
                  : hasOutbound
                  ? 'Initial outreach delivered. Follow up within 48-72 hours if no reply is received.'
                  : 'Prospect is ready for introductory outreach. Dispatch Wholesale Catalog PDF and sample lick offer.'}
              </p>
            </div>
          </div>
        </section>

        {/* ── CARD D: Channel Recommendation & Quick Actions ─────────────── */}
        <section
          className="rounded-3xl p-4 transition-all"
          style={{
            backgroundColor: palette.cardBg,
            border: `1px solid ${palette.cardBorder}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: palette.textSecondary }}>
              Recommended Channels
            </span>
            <span className="text-[10px] font-semibold text-emerald-400">
              {channelPriority.length} Channel(s) Available
            </span>
          </div>

          {/* Quick Action Buttons Grid */}
          <div className="grid grid-cols-2 gap-2">
            {lead.email && (
              <button
                type="button"
                onClick={() => handleOpenComposer(commercialAnalysis.defaultTemplateIndex)}
                className="py-2.5 px-3 rounded-2xl flex items-center gap-2 text-xs font-bold transition-all text-white shadow-md active:scale-95"
                style={{ background: palette.accentGradient }}
              >
                <EnvelopeSimple size={16} weight="bold" />
                <span>Send Email (Catalog)</span>
              </button>
            )}

            {lead.phone && (
              <a
                href={`tel:${lead.phone}`}
                className="py-2.5 px-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold transition-all active:scale-95"
                style={{
                  backgroundColor: palette.cardElevatedBg,
                  color: palette.textPrimary,
                  border: `1px solid ${palette.cardBorder}`,
                }}
              >
                <Phone size={15} weight="bold" />
                <span>Call Phone</span>
              </a>
            )}

            {cleanPhone && (
              <a
                href={`https://wa.me/${cleanPhone}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-emerald-400 transition-all active:scale-95"
                style={{
                  backgroundColor: palette.cardElevatedBg,
                  border: `1px solid ${palette.cardBorder}`,
                }}
              >
                <WhatsappLogo size={16} weight="bold" />
                <span>WhatsApp</span>
              </a>
            )}

            {(lead.facebook || lead.research?.facebook) && (
              <a
                href={
                  (lead.facebook || lead.research?.facebook)!.startsWith('http')
                    ? (lead.facebook || lead.research?.facebook)!
                    : `https://${lead.facebook || lead.research?.facebook}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-sky-400 transition-all active:scale-95"
                style={{
                  backgroundColor: palette.cardElevatedBg,
                  border: `1px solid ${palette.cardBorder}`,
                }}
              >
                <FacebookLogo size={16} weight="bold" />
                <span>Facebook DM</span>
              </a>
            )}

            {(lead.instagram || lead.research?.instagram) && (
              <a
                href={
                  (lead.instagram || lead.research?.instagram)!.startsWith('http')
                    ? (lead.instagram || lead.research?.instagram)!
                    : `https://${lead.instagram || lead.research?.instagram}`
                }
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-pink-400 transition-all active:scale-95"
                style={{
                  backgroundColor: palette.cardElevatedBg,
                  border: `1px solid ${palette.cardBorder}`,
                }}
              >
                <InstagramLogo size={16} weight="bold" />
                <span>Instagram DM</span>
              </a>
            )}

            {lead.website && (
              <a
                href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2.5 px-3 rounded-2xl flex items-center justify-center gap-2 text-xs font-bold text-slate-300 transition-all active:scale-95"
                style={{
                  backgroundColor: palette.cardElevatedBg,
                  border: `1px solid ${palette.cardBorder}`,
                }}
              >
                <Globe size={15} weight="bold" />
                <span>Visit Website</span>
              </a>
            )}
          </div>
        </section>

        {/* ── CARD E: Complete Email History & Thread Conversation ───────── */}
        <section
          className="rounded-3xl p-4 transition-all"
          style={{
            backgroundColor: palette.cardBg,
            border: `1px solid ${palette.cardBorder}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <div className="flex items-center justify-between pb-2 mb-3 border-b" style={{ borderColor: palette.divider }}>
            <span className="text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5" style={{ color: palette.textSecondary }}>
              <EnvelopeSimple size={15} weight="bold" />
              <span>Correspondence Thread ({allMessages.length})</span>
            </span>

            {lead.email && (
              <button
                type="button"
                onClick={() => handleOpenComposer(commercialAnalysis.defaultTemplateIndex)}
                className="text-[11px] font-bold px-2.5 py-1 rounded-full text-indigo-400 border border-indigo-500/30 hover:bg-indigo-500/10 transition-colors"
              >
                + New Email
              </button>
            )}
          </div>

          {loadingThreads ? (
            <div className="py-8 flex flex-col items-center justify-center gap-2">
              <ArrowsClockwise size={20} weight="bold" className="animate-spin text-indigo-400" />
              <span className="text-xs text-slate-400">Loading conversation history…</span>
            </div>
          ) : allMessages.length === 0 ? (
            <div className="py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-full bg-slate-800/80 mx-auto flex items-center justify-center text-slate-400">
                <EnvelopeSimple size={22} weight="bold" />
              </div>
              <div>
                <p className="text-xs font-bold text-slate-200">No emails sent yet</p>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Send the official 2026 Wholesale Product Catalog & introductory sample offer.
                </p>
              </div>

              {lead.email ? (
                <button
                  type="button"
                  onClick={() => handleOpenComposer(commercialAnalysis.defaultTemplateIndex)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white shadow-md active:scale-95 inline-flex items-center gap-1.5"
                  style={{ background: palette.accentGradient }}
                >
                  <PaperPlaneRight size={14} weight="bold" />
                  <span>Send First Outreach Email</span>
                </button>
              ) : (
                <p className="text-[10px] text-amber-400 font-semibold">
                  No email address recorded for this lead. Use Phone or Social DM above.
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {allMessages.map((msg, idx) => {
                const isOutbound = msg.direction === 'outbound';
                return (
                  <div
                    key={msg.id || idx}
                    className="p-3.5 rounded-2xl transition-all"
                    style={{
                      backgroundColor: isOutbound ? palette.cardElevatedBg : 'rgba(16, 185, 129, 0.08)',
                      border: `1px solid ${isOutbound ? palette.cardBorder : 'rgba(16, 185, 129, 0.25)'}`,
                    }}
                  >
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <div className="flex items-center gap-1.5">
                        <span
                          className="px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase tracking-wide"
                          style={{
                            backgroundColor: isOutbound ? 'rgba(99, 102, 241, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                            color: isOutbound ? '#818CF8' : '#34D399',
                          }}
                        >
                          {isOutbound ? 'Himalayan Koh' : 'Customer Reply'}
                        </span>
                        <span className="text-xs font-bold text-slate-200 truncate">
                          {isOutbound ? `To: ${msg.to?.[0]?.email || lead.email}` : `From: ${msg.from?.email || lead.email}`}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">
                        {new Date(msg.createdAt).toLocaleDateString()}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white mb-1">{msg.subject}</h4>
                    <p className="text-[11px] text-slate-300 whitespace-pre-wrap line-clamp-4 leading-relaxed font-sans">
                      {msg.bodyText || msg.snippet}
                    </p>

                    {/* Attachments Pill */}
                    {msg.attachments && msg.attachments.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-2.5 pt-2 border-t border-slate-700/40">
                        {msg.attachments.map((att, aIdx) => (
                          <span
                            key={aIdx}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[10px] font-semibold"
                          >
                            <FilePdf size={12} weight="bold" />
                            <span>{att.filename}</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── CARD F: Lead Contact Card Details ──────────────────────────── */}
        <section
          className="rounded-3xl p-4 transition-all"
          style={{
            backgroundColor: palette.cardBg,
            border: `1px solid ${palette.cardBorder}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <span className="text-[11px] font-bold uppercase tracking-wider block mb-2" style={{ color: palette.textSecondary }}>
            Full Contact Dossier
          </span>

          <div className="space-y-2 text-xs">
            {lead.email && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40">
                <div className="flex items-center gap-2 truncate">
                  <EnvelopeSimple size={15} className="text-indigo-400 shrink-0" />
                  <span className="truncate text-slate-200">{lead.email}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(lead.email!, 'email')}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  {copiedField === 'email' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            )}

            {lead.phone && (
              <div className="flex items-center justify-between p-2 rounded-xl bg-slate-800/40">
                <div className="flex items-center gap-2 truncate">
                  <Phone size={15} className="text-emerald-400 shrink-0" />
                  <span className="truncate text-slate-200">{lead.phone}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopy(lead.phone!, 'phone')}
                  className="p-1 rounded text-slate-400 hover:text-white"
                >
                  {copiedField === 'phone' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                </button>
              </div>
            )}

            {locationText && (
              <div className="p-2 rounded-xl bg-slate-800/40 text-[11px] text-slate-300">
                <span className="text-slate-400 font-semibold block mb-0.5">Location:</span>
                {locationText}
              </div>
            )}

            {lead.notes && (
              <div className="p-2.5 rounded-xl bg-slate-800/40 text-[11px] text-slate-300">
                <span className="text-slate-400 font-semibold block mb-0.5">Notes:</span>
                {lead.notes}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* ── 3. Quick Email Composer Modal ─────────────────────────────── */}
      {isComposerOpen && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75 backdrop-blur-xs animate-fadeIn">
          <div
            className="rounded-t-3xl border-t p-4 max-h-[90vh] overflow-y-auto space-y-3"
            style={{
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              color: palette.textPrimary,
            }}
          >
            <div className="w-12 h-1 rounded-full bg-slate-600/50 mx-auto mb-2" />

            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: palette.divider }}>
              <div>
                <h3 className="text-sm font-bold text-white">Send Outreach Email</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">To: {lead.email}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsComposerOpen(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white"
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Template Selector */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Choose Email Template:
              </label>
              <select
                value={selectedTemplateIndex}
                onChange={(e) => handleOpenComposer(parseInt(e.target.value, 10))}
                className="w-full text-xs font-medium rounded-xl p-2.5 bg-slate-800 border border-slate-700 text-white outline-none"
              >
                {OUTREACH_TEMPLATES.map((tpl, i) => (
                  <option key={i} value={i}>
                    {tpl.label}
                  </option>
                ))}
              </select>
            </div>

            {/* From Mailbox */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Sender Account:
              </label>
              <select
                value={selectedMailbox}
                onChange={(e) => setSelectedMailbox(e.target.value as MailboxAddress)}
                className="w-full text-xs font-medium rounded-xl p-2 bg-slate-800 border border-slate-700 text-slate-200 outline-none"
              >
                <option value="ws@himalayankoh.com">ws@himalayankoh.com (Wholesale Department)</option>
                <option value="marketing@himalayankoh.com">marketing@himalayankoh.com (Marketing & Retail)</option>
                <option value="orders@himalayankoh.com">orders@himalayankoh.com (Orders & Logistics)</option>
                <option value="support@himalayankoh.com">support@himalayankoh.com (Customer Support)</option>
              </select>
            </div>

            {/* Subject */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Subject Line:
              </label>
              <input
                type="text"
                value={composeSubject}
                onChange={(e) => setComposeSubject(e.target.value)}
                className="w-full text-xs font-medium rounded-xl p-2.5 bg-slate-800 border border-slate-700 text-white outline-none"
              />
            </div>

            {/* Body */}
            <div>
              <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Message Body:
              </label>
              <textarea
                rows={7}
                value={composeBody}
                onChange={(e) => setComposeBody(e.target.value)}
                className="w-full text-xs font-mono rounded-xl p-2.5 bg-slate-800 border border-slate-700 text-white outline-none leading-relaxed"
              />
            </div>

            {/* 1-Tap Catalog Attachment Toggle */}
            <div className="flex items-center justify-between p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25">
              <div className="flex items-center gap-2">
                <FilePdf size={18} weight="bold" className="text-amber-400" />
                <div>
                  <span className="text-xs font-bold text-amber-300 block">Himalayan-Koh-Wholesale-Catalog-2026.pdf</span>
                  <span className="text-[10px] text-amber-200/70">1.9 MB Official Product Catalog</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setHasCatalogAttachment(!hasCatalogAttachment)}
                className="text-xs font-bold px-2.5 py-1 rounded-lg border transition-all"
                style={{
                  backgroundColor: hasCatalogAttachment ? '#F59E0B' : 'transparent',
                  color: hasCatalogAttachment ? '#000000' : '#F59E0B',
                  borderColor: '#F59E0B',
                }}
              >
                {hasCatalogAttachment ? 'Attached ✓' : '+ Attach'}
              </button>
            </div>

            {/* Feedback Alert */}
            {sendFeedback && (
              <div
                className={`p-2.5 rounded-xl text-xs font-bold flex items-center gap-2 ${
                  sendFeedback.ok
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                }`}
              >
                {sendFeedback.ok ? <CheckCircle size={15} weight="fill" /> : <WarningCircle size={15} weight="fill" />}
                <span>{sendFeedback.msg}</span>
              </div>
            )}

            {/* Dispatch Buttons */}
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                disabled={sendingEmail}
                onClick={handleSendEmail}
                className="flex-1 py-3 px-4 rounded-xl text-xs font-bold text-white shadow-lg active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
                style={{ background: palette.accentGradient }}
              >
                {sendingEmail ? (
                  <>
                    <ArrowsClockwise size={16} weight="bold" className="animate-spin" />
                    <span>Dispatching from Houston…</span>
                  </>
                ) : (
                  <>
                    <PaperPlaneRight size={16} weight="bold" />
                    <span>Send Outreach Email Now</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsComposerOpen(false)}
                className="py-3 px-4 rounded-xl text-xs font-semibold bg-slate-800 border border-slate-700 text-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
