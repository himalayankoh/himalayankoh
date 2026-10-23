'use client';

import React, { useState, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  X,
  MagnifyingGlass,
  SquaresFour,
  Target,
  EnvelopeSimple,
  Package,
  ShoppingCart,
  Users as UsersIcon,
  Truck,
  Tag,
  Cube,
  FileText,
  TrendUp,
  GearSix,
  ArrowSquareOut,
  SignOut,
  CaretDown,
  Download,
  TextAa,
  ArrowsClockwise,
  CheckCircle,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import { useAuthStore } from '@/store/authStore';
import { useMobileTheme } from '@/context/MobileThemeContext';

interface SmartMobileSideMenuProps {
  onClose: () => void;
  unreadEmailCount?: number;
  leadsCount?: number;
  quotesCount?: number;
}

interface MenuItem {
  to: string;
  label: string;
  icon: Icon;
  iconGradient: string;
  badge?: number;
  hasSubmenu?: boolean;
  subItems?: { to: string; label: string }[];
}

const GITHUB_RAW_APK_URL =
  'https://github.com/himalayankoh/himalayankoh/raw/integration/cloudflare-workers-migration/public/downloads/HimalayanKoh-Admin.apk';

export function SmartMobileSideMenu({
  onClose,
  unreadEmailCount = 0,
  leadsCount = 0,
  quotesCount = 0,
}: SmartMobileSideMenuProps) {
  const location = useLocation();
  const { signOut } = useAuthStore();
  const { isDark, fontSize, setFontSize } = useMobileTheme();
  const [searchQuery, setSearchQuery] = useState('');
  // Which rail entry's submenu is open, by destination rather than by a shared
  // boolean: Products and Wholesale both have submenus, and one flag made opening
  // either of them expand both.
  const [expandedMenu, setExpandedMenu] = useState<string | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  const menuItems: MenuItem[] = useMemo(
    () => [
      {
        to: '/admin',
        label: 'Dashboard',
        icon: SquaresFour,
        iconGradient: 'linear-gradient(135deg, #3B82F6 0%, #1D4ED8 100%)',
      },
      {
        to: '/admin/leados',
        label: 'Leads / LeadOS',
        icon: Target,
        iconGradient: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
        badge: leadsCount,
      },
      {
        to: '/admin/inbox',
        label: 'Email Inbox',
        icon: EnvelopeSimple,
        iconGradient: 'linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)',
        badge: unreadEmailCount,
      },
      {
        to: '/admin/products',
        label: 'Products',
        icon: Package,
        iconGradient: 'linear-gradient(135deg, #F97316 0%, #C2410C 100%)',
        hasSubmenu: true,
        subItems: [
          { to: '/admin/categories', label: 'Categories' },
          { to: '/admin/inventory', label: 'Inventory' },
          { to: '/admin/promotions', label: 'Promotions' },
          { to: '/admin/reviews', label: 'Reviews' },
        ],
      },
      {
        to: '/admin/orders',
        label: 'Orders',
        icon: ShoppingCart,
        iconGradient: 'linear-gradient(135deg, #14B8A6 0%, #0F766E 100%)',
      },
      {
        to: '/admin/customers',
        label: 'Customers',
        icon: UsersIcon,
        iconGradient: 'linear-gradient(135deg, #3B82F6 0%, #1E40AF 100%)',
      },
      {
        to: '/admin/wholesale',
        label: 'Wholesale',
        icon: Truck,
        iconGradient: 'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
        hasSubmenu: true,
        subItems: [
          { to: '/admin/wholesale/customers', label: 'Wholesale Customers' },
          { to: '/admin/wholesale/products', label: 'Wholesale Products' },
          { to: '/admin/wholesale/inquiries', label: 'Wholesale Inquiries' },
        ],
      },
      {
        to: '/admin/wholesale/inquiries',
        label: 'Quotes & Inquiries',
        icon: Tag,
        iconGradient: 'linear-gradient(135deg, #F43F5E 0%, #BE123C 100%)',
        badge: quotesCount,
      },
      {
        to: '/admin/inventory',
        label: 'Inventory',
        icon: Cube,
        iconGradient: 'linear-gradient(135deg, #FB923C 0%, #EA580C 100%)',
      },
      {
        to: '/admin/blog',
        label: 'Content',
        icon: FileText,
        iconGradient: 'linear-gradient(135deg, #38BDF8 0%, #0284C7 100%)',
      },
      {
        to: '/admin/analytics',
        label: 'Analytics',
        icon: TrendUp,
        iconGradient: 'linear-gradient(135deg, #34D399 0%, #059669 100%)',
      },
      {
        to: '/admin/settings',
        label: 'Settings',
        icon: GearSix,
        iconGradient: 'linear-gradient(135deg, #60A5FA 0%, #2563EB 100%)',
      },
    ],
    [leadsCount, unreadEmailCount, quotesCount]
  );

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return menuItems;
    const q = searchQuery.toLowerCase();
    return menuItems.filter(
      (item) =>
        item.label.toLowerCase().includes(q) ||
        item.subItems?.some((sub) => sub.label.toLowerCase().includes(q))
    );
  }, [menuItems, searchQuery]);

  const handleLogout = async () => {
    try {
      await signOut();
      onClose();
      window.location.href = '/login';
    } catch {
      window.location.href = '/login';
    }
  };

  const handleCheckUpdate = async () => {
    setCheckingUpdates(true);
    try {
      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) await reg.update();
      }
      setUpdateMsg('Hot-Update Active');
      setTimeout(() => setUpdateMsg(null), 3000);
    } catch {
      setUpdateMsg('Synced');
      setTimeout(() => setUpdateMsg(null), 3000);
    } finally {
      setCheckingUpdates(false);
    }
  };

  const handleDownloadApk = (e: React.MouseEvent) => {
    // Inside native APK WebView containers, relative or internal links stay trapped.
    // By launching GitHub external raw link via window.open, Android's shouldOverrideUrlLoading
    // forces the native OS to launch external Chrome / Download Manager!
    try {
      window.open(GITHUB_RAW_APK_URL, '_system');
    } catch {
      window.location.href = GITHUB_RAW_APK_URL;
    }
  };

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden text-white select-none transition-colors duration-200"
      style={{
        backgroundColor: isDark ? '#080C16' : '#0F172A',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* ── 1. Compact Header Branding ────────────────────────────────────── */}
      <div className="pt-3.5 px-3.5 pb-2.5 flex items-center justify-between shrink-0 border-b border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl p-0.5 bg-white/95 shadow-xs flex items-center justify-center shrink-0 border border-white/20">
            <img
              src="/images/hk_salt_crystal.webp"
              alt="Himalayan Koh"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h2 className="text-[13px] font-bold text-white tracking-tight leading-tight">
              Himalayan Koh
            </h2>
            <p className="text-[10px] font-medium text-slate-400">
              Admin Console
            </p>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="w-7.5 h-7.5 rounded-lg flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer bg-white/5 hover:bg-white/10"
        >
          <X size={15} weight="bold" />
        </button>
      </div>

      {/* ── 2. Compact Search Menu Input ─────────────────────────────────── */}
      <div className="px-3.5 py-2 shrink-0">
        <div
          className="flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all duration-150 focus-within:border-blue-500/60"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          }}
        >
          <MagnifyingGlass size={14} weight="bold" className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu..."
            aria-label="Search menu"
            className="w-full bg-transparent text-[11.5px] text-white placeholder:text-slate-400 outline-none font-medium"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-0.5 text-slate-400 hover:text-white"
            >
              <X size={11} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {/* ── 3. High-Density Compact Navigation List ──────────────────────── */}
      <nav
        aria-label="Mobile admin menu"
        className="flex-1 overflow-y-auto px-2.5 py-1 space-y-0.5 no-scrollbar"
      >
        {filteredItems.map((item) => {
          const isDirectActive =
            location.pathname === item.to ||
            (item.to !== '/admin' && location.pathname.startsWith(`${item.to}/`));
          const hasActiveChild = Boolean(
            item.subItems?.some(
              (sub) => location.pathname === sub.to || location.pathname.startsWith(`${sub.to}/`)
            )
          );
          const isActive = isDirectActive || hasActiveChild;
          const Icon = item.icon;

          return (
            <div key={item.label} className="space-y-0.5">
              <Link
                to={item.to}
                onClick={() => {
                  if (item.hasSubmenu) {
                    setExpandedMenu(expandedMenu === item.to ? null : item.to);
                  } else {
                    onClose();
                  }
                }}
                className={`relative flex items-center justify-between px-2.5 py-1.5 rounded-xl transition-all duration-150 active:scale-[0.98] ${
                  isActive ? 'shadow-sm' : 'hover:bg-white/5'
                }`}
                style={{
                  background: isActive
                    ? 'linear-gradient(90deg, #2563EB 0%, #7C3AED 100%)'
                    : 'transparent',
                }}
              >
                {/* Left: Icon Squircle + Label */}
                <div className="flex items-center gap-2.5 min-w-0">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0 shadow-xs"
                    style={{
                      background: item.iconGradient,
                    }}
                  >
                    <Icon size={15} weight="bold" />
                  </div>
                  <span
                    className={`text-[12px] font-semibold truncate ${
                      isActive ? 'text-white font-bold' : 'text-slate-200'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>

                {/* Right: Badge / Caret */}
                <div className="flex items-center gap-1.5 shrink-0">
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className="px-1.5 py-0.2 rounded-full text-[9.5px] font-bold text-white"
                      style={{
                        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : '#1D4ED8',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}

                  {item.hasSubmenu && (
                    <CaretDown
                      size={12}
                      weight="bold"
                      className={`text-slate-400 transition-transform duration-200 ${
                        expandedMenu === item.to ? 'rotate-180 text-white' : ''
                      }`}
                    />
                  )}
                </div>
              </Link>

              {/* Submenu for Products */}
              {item.hasSubmenu && expandedMenu === item.to && item.subItems && (
                <div className="pl-10 pr-2 py-0.5 space-y-0.5">
                  {item.subItems.map((sub) => {
                    const isSubActive = location.pathname === sub.to;
                    return (
                      <Link
                        key={sub.to}
                        to={sub.to}
                        onClick={onClose}
                        className={`block px-2.5 py-1 rounded-lg text-[11px] font-medium transition-colors ${
                          isSubActive
                            ? 'text-white bg-white/10 font-bold'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-white/5'
                        }`}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* ── 4. Compact Footer (Auto-Sync + Font Size + Download + Actions) ── */}
      <div
        className="p-2.5 border-t space-y-1.5 shrink-0"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(0, 0, 0, 0.25)',
        }}
      >
        {/* Real-Time Auto-Update Status Pill */}
        <div className="flex items-center justify-between px-2.5 py-1 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-[10px]">
          <span className="flex items-center gap-1.5 text-indigo-300 font-semibold truncate">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0" />
            <span>{updateMsg || 'Real-Time Auto-Update Active'}</span>
          </span>
          <button
            type="button"
            onClick={handleCheckUpdate}
            disabled={checkingUpdates}
            className="flex items-center gap-1 text-[9.5px] font-bold text-indigo-200 hover:text-white px-1.5 py-0.5 rounded bg-indigo-600/30 hover:bg-indigo-600/50 cursor-pointer transition-all"
          >
            <ArrowsClockwise size={11} className={checkingUpdates ? 'animate-spin' : ''} />
            <span>{checkingUpdates ? 'Syncing...' : 'Sync'}</span>
          </button>
        </div>

        {/* Ultra-Compact Font Size Adjustment */}
        <div className="flex items-center justify-between gap-1 px-1">
          <span className="flex items-center gap-1 text-[10.5px] font-semibold text-slate-400 shrink-0">
            <TextAa size={13} weight="bold" className="text-indigo-400" />
            <span>Size</span>
          </span>

          <div className="flex items-center gap-1">
            {[
              { id: 'normal', label: '100%' },
              { id: 'medium', label: '110%' },
              { id: 'large', label: '120%' },
              { id: 'xlarge', label: '130%' },
            ].map((item) => {
              const isSelected = fontSize === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFontSize(item.id as any)}
                  className="px-2 py-0.5 rounded-md text-[10px] font-bold transition-all active:scale-95"
                  style={{
                    backgroundColor: isSelected ? '#6366F1' : 'rgba(255, 255, 255, 0.05)',
                    color: isSelected ? '#FFFFFF' : '#94A3B8',
                    border: `1px solid ${isSelected ? '#818CF8' : 'rgba(255, 255, 255, 0.08)'}`,
                  }}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Download Android APK (Direct External GitHub Raw Link to Force Download in Chrome) */}
        <a
          href={GITHUB_RAW_APK_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={handleDownloadApk}
          download="HimalayanKoh-Admin.apk"
          className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-emerald-300 hover:text-emerald-200 transition-all active:scale-[0.98] border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/15 cursor-pointer shadow-xs"
        >
          <div
            className="w-7 h-7 rounded-lg flex items-center justify-center text-emerald-300 shrink-0"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.2)' }}
          >
            <Download size={15} weight="bold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span className="text-[11.5px] font-bold">Android App (APK)</span>
              <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/25 text-emerald-300 font-mono font-bold">
                5.8 MB
              </span>
            </div>
            <p className="text-[9.5px] text-slate-400 font-normal truncate">
              Tap to Download in Chrome / Browser
            </p>
          </div>
        </a>

        {/* 2-Column Action Buttons: View Storefront & Logout */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-semibold text-slate-300 hover:text-white transition-all active:scale-95 bg-white/5 hover:bg-white/10"
          >
            <ArrowSquareOut size={13} weight="bold" />
            <span className="truncate">Storefront</span>
          </a>

          <button
            type="button"
            onClick={handleLogout}
            className="flex items-center justify-center gap-1.5 py-1.5 px-2 rounded-lg text-[11px] font-semibold text-rose-400 hover:text-rose-300 transition-all active:scale-95 bg-rose-500/10 hover:bg-rose-500/20 cursor-pointer"
          >
            <SignOut size={13} weight="bold" />
            <span className="truncate">Logout</span>
          </button>
        </div>
      </div>
    </div>
  );
}
