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
  ShoppingCart,
  CaretDown,
  Check,
  Sparkle,
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

type MobileCategoryTab =
  | 'all'
  | 'orders'
  | 'marketing'
  | 'support'
  | 'inquiries'
  | 'leados'
  | 'starred'
  | 'sent'
  | 'salman'
  | 'admin';

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
  const [activeTab, setActiveTab] = useState<MobileCategoryTab>(() => {
    if (activeFolder === 'orders') return 'orders';
    if (activeFolder === 'marketing') return 'marketing';
    if (activeFolder === 'support') return 'support';
    if (activeFolder === 'salman') return 'salman';
    if (activeFolder === 'admin') return 'admin';
    if (activeFolder === 'sent') return 'sent';
    return 'all';
  });
  const [selectedThread, setSelectedThread] = useState<InboxThread | null>(null);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);

  // Sync activeTab when parent changes activeFolder
  React.useEffect(() => {
    if (activeFolder === 'orders' && activeTab !== 'orders') setActiveTab('orders');
    else if (activeFolder === 'marketing' && activeTab !== 'marketing') setActiveTab('marketing');
    else if (activeFolder === 'support' && activeTab !== 'support') setActiveTab('support');
    else if (activeFolder === 'salman' && activeTab !== 'salman') setActiveTab('salman');
    else if (activeFolder === 'admin' && activeTab !== 'admin') setActiveTab('admin');
    else if (activeFolder === 'all' && activeTab !== 'all' && activeTab !== 'starred' && activeTab !== 'leados' && activeTab !== 'inquiries') {
      setActiveTab('all');
    }
  }, [activeFolder]);

  // Handle Tab / Mailbox Selection
  const handleSelectTab = (tab: MobileCategoryTab) => {
    setActiveTab(tab);
    setAccountMenuOpen(false);

    // Call server folder filter when appropriate
    if (tab === 'orders') onSelectFolder('orders');
    else if (tab === 'marketing') onSelectFolder('marketing');
    else if (tab === 'support') onSelectFolder('support');
    else if (tab === 'salman') onSelectFolder('salman');
    else if (tab === 'admin') onSelectFolder('admin');
    else if (tab === 'sent') onSelectFolder('sent');
    else if (tab === 'all') onSelectFolder('all');
    // Local filters (inquiries, leados, starred) operate on current pool
  };

  // Computed summary counts based on active category
  const totalEmailsCount = useMemo(() => {
    if (!counts) return threads.length;
    if (activeTab === 'orders') return counts.orders;
    if (activeTab === 'marketing') return counts.marketing;
    if (activeTab === 'support') return counts.support;
    if (activeTab === 'salman') return counts.salman;
    if (activeTab === 'admin') return counts.admin;
    if (activeTab === 'sent') return counts.sent;
    return counts.all;
  }, [counts, activeTab, threads.length]);

  const unreadCount = useMemo(() => {
    if (!counts) return threads.filter((t) => t.unread).length;
    if (activeTab === 'orders') return counts.ordersUnread;
    if (activeTab === 'marketing') return counts.marketingUnread;
    if (activeTab === 'support') return counts.supportUnread;
    if (activeTab === 'salman') return counts.salmanUnread;
    if (activeTab === 'admin') return counts.adminUnread;
    return counts.allUnread;
  }, [counts, activeTab, threads]);

  const starredCount = useMemo(() => {
    return threads.filter((t) => t.starred).length;
  }, [threads]);

  // Filtered threads list (Combining mailbox separation + tab + search)
  const filteredThreads = useMemo(() => {
    return threads.filter((t) => {
      const mailbox = (t.mailbox || '').toLowerCase();

      // Explicit mailbox isolation when selected
      if (activeTab === 'orders' && !mailbox.includes('orders')) {
        return false;
      }
      if (activeTab === 'marketing' && !mailbox.includes('marketing')) {
        return false;
      }
      if (activeTab === 'support' && !mailbox.includes('support')) {
        return false;
      }
      if (activeTab === 'salman' && !mailbox.includes('salman')) {
        return false;
      }
      if (activeTab === 'admin' && !mailbox.includes('admin')) {
        return false;
      }

      // Feature tabs
      if (activeTab === 'sent' && !t.messages.some((m) => m.direction === 'outbound')) {
        return false;
      }
      if (activeTab === 'starred' && !t.starred) {
        return false;
      }
      if (activeTab === 'leados' && !t.messages.some((m) => m.leadId)) {
        return false;
      }
      if (
        activeTab === 'inquiries' &&
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
  }, [threads, activeTab, searchQuery]);

  // Meaningful sender resolver
  const resolveMeaningfulSender = (thread: InboxThread) => {
    const latest = thread.latestMessage;
    if (latest && latest.direction === 'outbound') {
      const fromEmail = (latest.from?.email || '').toLowerCase();
      if (fromEmail.includes('orders')) return 'Orders & Fulfillment';
      if (fromEmail.includes('support')) return 'Support Team';
      if (fromEmail.includes('marketing')) return 'Marketing Team';
      if (fromEmail.includes('salman')) return 'Salman';
      if (fromEmail.includes('sales')) return 'Sales Team';
      if (fromEmail.includes('admin')) return 'Admin';
      return 'Himalayan Koh';
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

  // Active account information for Gmail-Style Switcher Header
  const currentAccountInfo = useMemo(() => {
    switch (activeTab) {
      case 'orders':
        return {
          title: 'orders@himalayankoh.com',
          subtitle: 'Orders & Store Fulfillment • Real-time Sync',
          icon: '🛒',
          pillColor: '#F59E0B',
        };
      case 'marketing':
        return {
          title: 'marketing@himalayankoh.com',
          subtitle: 'Marketing & B2B Campaigns • Live',
          icon: '📢',
          pillColor: '#A855F7',
        };
      case 'support':
        return {
          title: 'support@himalayankoh.com',
          subtitle: 'Customer Support & Inquiries',
          icon: '💬',
          pillColor: '#10B981',
        };
      case 'salman':
        return {
          title: 'salman@himalayankoh.com',
          subtitle: 'Direct Executive Inquiries',
          icon: '👤',
          pillColor: '#3B82F6',
        };
      case 'admin':
        return {
          title: 'admin@himalayankoh.com',
          subtitle: 'System Notifications & Security',
          icon: '🔒',
          pillColor: '#64748B',
        };
      default:
        return {
          title: 'All Inboxes (Combined)',
          subtitle: 'All Himalayan Koh Business Mailboxes',
          icon: '🌟',
          pillColor: '#8B5CF6',
        };
    }
  }, [activeTab]);

  return (
    <div className="md:hidden flex flex-col space-y-3.5 pb-20">
      {/* ── 1. Top Overview 3-Stat Cards ───────────────────────────────── */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Total Emails */}
        <div
          className="rounded-2xl p-3 flex flex-col justify-between transition-all"
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
              {activeTab === 'orders' ? 'Orders Total' : activeTab === 'marketing' ? 'Marketing Total' : 'Total Emails'}
            </div>
          </div>
        </div>

        {/* Unread */}
        <div
          className="rounded-2xl p-3 flex flex-col justify-between transition-all"
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
          className="rounded-2xl p-3 flex flex-col justify-between transition-all"
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

      {/* ── 2. Gmail-Style Active Account Switcher Bar ─────────────────── */}
      <div className="relative">
        <button
          type="button"
          onClick={() => setAccountMenuOpen((v) => !v)}
          className="w-full p-2.5 rounded-2xl flex items-center justify-between transition-all active:scale-[0.99] cursor-pointer"
          style={{
            backgroundColor: isDark ? 'rgba(30, 41, 59, 0.7)' : '#FFFFFF',
            border: `1.5px solid ${isDark ? 'rgba(255, 255, 255, 0.1)' : '#E2E8F0'}`,
            boxShadow: palette.cardShadow,
          }}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-lg shrink-0">{currentAccountInfo.icon}</span>
            <div className="text-left min-w-0">
              <div
                className="text-xs font-black truncate flex items-center gap-1.5"
                style={{ color: palette.textPrimary }}
              >
                <span>{currentAccountInfo.title}</span>
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <div className="text-[10px] truncate" style={{ color: palette.textSecondary }}>
                {currentAccountInfo.subtitle}
              </div>
            </div>
          </div>

          <div
            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 transition-colors"
            style={{
              backgroundColor: isDark ? 'rgba(255, 255, 255, 0.08)' : '#F1F5F9',
              color: palette.textPrimary,
            }}
          >
            <span>Switch</span>
            <CaretDown size={11} weight="bold" />
          </div>
        </button>

        {/* Dropdown Modal for Account Switching */}
        {accountMenuOpen && (
          <div
            className="absolute left-0 right-0 top-full mt-2 z-50 rounded-2xl p-2 shadow-2xl backdrop-blur-xl border animate-in fade-in duration-150"
            style={{
              backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
              borderColor: isDark ? 'rgba(255, 255, 255, 0.15)' : '#CBD5E1',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3), 0 8px 10px -6px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Select Himalayan Koh Mailbox
            </div>

            <div className="space-y-1">
              {[
                {
                  id: 'all' as MobileCategoryTab,
                  icon: '🌟',
                  email: 'All Inboxes',
                  label: 'Unified Inbox Stream',
                  count: counts?.all ?? threads.length,
                  unread: counts?.allUnread ?? 0,
                },
                {
                  id: 'orders' as MobileCategoryTab,
                  icon: '🛒',
                  email: 'orders@himalayankoh.com',
                  label: 'WooCommerce & Store Orders',
                  count: counts?.orders ?? 0,
                  unread: counts?.ordersUnread ?? 0,
                },
                {
                  id: 'marketing' as MobileCategoryTab,
                  icon: '📢',
                  email: 'marketing@himalayankoh.com',
                  label: 'B2B Wholesale & Outreach',
                  count: counts?.marketing ?? 0,
                  unread: counts?.marketingUnread ?? 0,
                },
                {
                  id: 'support' as MobileCategoryTab,
                  icon: '💬',
                  email: 'support@himalayankoh.com',
                  label: 'Customer Support & Helpdesk',
                  count: counts?.support ?? 0,
                  unread: counts?.supportUnread ?? 0,
                },
                {
                  id: 'salman' as MobileCategoryTab,
                  icon: '👤',
                  email: 'salman@himalayankoh.com',
                  label: 'Direct Executive Inquiries',
                  count: counts?.salman ?? 0,
                  unread: counts?.salmanUnread ?? 0,
                },
                {
                  id: 'admin' as MobileCategoryTab,
                  icon: '🔒',
                  email: 'admin@himalayankoh.com',
                  label: 'System & Security Logs',
                  count: counts?.admin ?? 0,
                  unread: counts?.adminUnread ?? 0,
                },
              ].map((acc) => {
                const isSelected = activeTab === acc.id;
                return (
                  <button
                    key={acc.id}
                    type="button"
                    onClick={() => handleSelectTab(acc.id)}
                    className="w-full px-3 py-2.5 rounded-xl flex items-center justify-between transition-colors text-left active:scale-[0.99] cursor-pointer"
                    style={{
                      backgroundColor: isSelected
                        ? isDark
                          ? 'rgba(59, 130, 246, 0.2)'
                          : '#EFF6FF'
                        : 'transparent',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="text-base shrink-0">{acc.icon}</span>
                      <div className="min-w-0">
                        <div
                          className={`text-xs truncate ${isSelected ? 'font-black text-blue-500' : 'font-bold'}`}
                          style={{ color: isSelected ? undefined : palette.textPrimary }}
                        >
                          {acc.email}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{acc.label}</div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {acc.unread > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                          {acc.unread}
                        </span>
                      )}
                      {isSelected && <Check size={14} weight="bold" className="text-blue-500" />}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ── 3. Search & Action Row ──────────────────────────────────────── */}
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
            placeholder={`Search ${currentAccountInfo.title}...`}
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

      {/* ── 4. Gmail-Style Horizontal Category Filter Chips ─────────────── */}
      <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
        {[
          { id: 'all' as MobileCategoryTab, label: 'All', icon: '🌟' },
          {
            id: 'orders' as MobileCategoryTab,
            label: 'Orders',
            icon: '🛒',
            badge: counts?.ordersUnread,
            badgeColor: 'bg-amber-500 text-white',
          },
          {
            id: 'marketing' as MobileCategoryTab,
            label: 'Marketing',
            icon: '📢',
            badge: counts?.marketingUnread,
            badgeColor: 'bg-purple-500 text-white',
          },
          {
            id: 'support' as MobileCategoryTab,
            label: 'Support',
            icon: '💬',
            badge: counts?.supportUnread,
            badgeColor: 'bg-emerald-500 text-white',
          },
          { id: 'inquiries' as MobileCategoryTab, label: 'Primary', icon: '💼' },
          { id: 'leados' as MobileCategoryTab, label: 'LeadOS', icon: '🎯' },
          { id: 'starred' as MobileCategoryTab, label: 'Starred', icon: '⭐' },
          { id: 'sent' as MobileCategoryTab, label: 'Sent', icon: '📤' },
          { id: 'admin' as MobileCategoryTab, label: 'Admin', icon: '🔒' },
        ].map((chip) => {
          const isActive = activeTab === chip.id;
          return (
            <button
              key={chip.id}
              type="button"
              onClick={() => handleSelectTab(chip.id)}
              className="px-3.5 py-1.5 rounded-full text-xs font-bold shrink-0 transition-all active:scale-95 duration-150 cursor-pointer flex items-center gap-1.5"
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

      {/* ── 5. Email Messages List With Distinct Mailbox Badges ─────────── */}
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
              No messages in {currentAccountInfo.title}
            </p>
            <p className="text-xs mt-1" style={{ color: palette.textSecondary }}>
              {searchQuery
                ? `No emails matching "${searchQuery}"`
                : 'Your inbox is completely up to date in real time.'}
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
            const mailboxBadge = getMailboxBadge(thread.mailbox);

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

                  {/* Gmail-Style Mailbox Badge Row */}
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {mailboxBadge && (
                      <span
                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9.5px] font-black uppercase tracking-wider"
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
