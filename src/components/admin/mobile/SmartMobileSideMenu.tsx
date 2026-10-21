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

export function SmartMobileSideMenu({
  onClose,
  unreadEmailCount = 3,
  leadsCount = 12,
  quotesCount = 5,
}: SmartMobileSideMenuProps) {
  const location = useLocation();
  const { signOut } = useAuthStore();
  const { isDark, fontSize, setFontSize } = useMobileTheme();
  const [searchQuery, setSearchQuery] = useState('');
  const [productsExpanded, setProductsExpanded] = useState(false);

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
      },
      {
        to: '/admin/wholesale#quotes',
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

  return (
    <div
      className="w-full h-full flex flex-col overflow-hidden text-white select-none transition-colors duration-200"
      style={{
        backgroundColor: isDark ? '#080C16' : '#0F172A',
        borderRight: '1px solid rgba(255, 255, 255, 0.08)',
      }}
    >
      {/* ── 1. Header Branding ────────────────────────────────────────────── */}
      <div className="pt-6 px-5 pb-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          {/* Salt Crystal Logo with subtle glow */}
          <div className="w-11 h-11 rounded-2xl p-1 bg-white/95 shadow-md flex items-center justify-center shrink-0 border border-white/20">
            <img
              src="/images/hk_salt_crystal.webp"
              alt="Himalayan Koh"
              className="w-full h-full object-contain"
            />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white tracking-tight leading-tight">
              Himalayan Koh
            </h2>
            <p className="text-[11px] font-medium text-slate-400 mt-0.5">
              Admin Panel
            </p>
          </div>
        </div>

        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close navigation menu"
          className="w-9 h-9 rounded-full flex items-center justify-center text-slate-400 hover:text-white transition-all active:scale-95 cursor-pointer"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.06)',
          }}
        >
          <X size={16} weight="bold" />
        </button>
      </div>

      {/* ── 2. Search Menu Input ─────────────────────────────────────────── */}
      <div className="px-5 pb-3 shrink-0">
        <div
          className="flex items-center gap-2.5 px-3.5 py-2.5 rounded-2xl border transition-all duration-150 focus-within:border-blue-500/60"
          style={{
            backgroundColor: 'rgba(255, 255, 255, 0.04)',
            borderColor: 'rgba(255, 255, 255, 0.08)',
          }}
        >
          <MagnifyingGlass size={16} weight="bold" className="text-slate-400 shrink-0" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search menu..."
            aria-label="Search menu"
            className="w-full bg-transparent text-xs text-white placeholder:text-slate-400 outline-none font-medium"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="p-0.5 text-slate-400 hover:text-white"
            >
              <X size={12} weight="bold" />
            </button>
          )}
        </div>
      </div>

      {/* ── 3. Navigation List ───────────────────────────────────────────── */}
      <nav
        aria-label="Mobile admin menu"
        className="flex-1 overflow-y-auto px-4 py-2 space-y-1.5 no-scrollbar"
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
            <div key={item.label} className="space-y-1">
              <Link
                to={item.to}
                onClick={() => {
                  if (item.hasSubmenu) {
                    setProductsExpanded(!productsExpanded);
                  } else {
                    onClose();
                  }
                }}
                className={`relative flex items-center justify-between px-3 py-2.5 rounded-2xl transition-all duration-200 active:scale-[0.98] ${
                  isActive ? 'shadow-lg' : 'hover:bg-white/5'
                }`}
                style={{
                  background: isActive
                    ? 'linear-gradient(90deg, #2563EB 0%, #7C3AED 100%)'
                    : 'transparent',
                  boxShadow: isActive
                    ? '0 6px 20px -2px rgba(124, 58, 237, 0.45)'
                    : 'none',
                }}
              >
                {/* Left: Icon Squircle + Label */}
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm transition-transform"
                    style={{
                      background: item.iconGradient,
                      boxShadow: '0 2px 6px rgba(0, 0, 0, 0.25)',
                    }}
                  >
                    <Icon size={18} weight="bold" />
                  </div>
                  <span
                    className={`text-xs font-semibold truncate ${
                      isActive ? 'text-white font-bold' : 'text-slate-200'
                    }`}
                  >
                    {item.label}
                  </span>
                </div>

                {/* Right: Badge / Caret */}
                <div className="flex items-center gap-2 shrink-0">
                  {typeof item.badge === 'number' && item.badge > 0 && (
                    <span
                      className="px-2 py-0.5 rounded-full text-[10px] font-bold text-white shadow-xs"
                      style={{
                        backgroundColor: isActive ? 'rgba(255, 255, 255, 0.25)' : '#1D4ED8',
                      }}
                    >
                      {item.badge}
                    </span>
                  )}

                  {item.hasSubmenu && (
                    <CaretDown
                      size={14}
                      weight="bold"
                      className={`text-slate-400 transition-transform duration-200 ${
                        productsExpanded ? 'rotate-180 text-white' : ''
                      }`}
                    />
                  )}
                </div>
              </Link>

              {/* Submenu for Products */}
              {item.hasSubmenu && productsExpanded && item.subItems && (
                <div className="pl-12 pr-2 py-1 space-y-1">
                  {item.subItems.map((sub) => {
                    const isSubActive = location.pathname === sub.to;
                    return (
                      <Link
                        key={sub.to}
                        to={sub.to}
                        onClick={onClose}
                        className={`block px-3 py-1.5 rounded-xl text-xs font-medium transition-colors ${
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

      {/* ── Text Readability & Font Size Switcher (User Request) ── */}
      <div
        className="px-4 py-3 border-t space-y-2 shrink-0"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(255, 255, 255, 0.02)',
        }}
      >
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span className="flex items-center gap-1.5">
            <TextAa size={16} weight="bold" className="text-indigo-400" />
            <span>Text Size</span>
          </span>
          <span className="text-[11px] font-mono text-indigo-400 font-bold uppercase">
            {fontSize === 'xlarge'
              ? '130% Extra Large'
              : fontSize === 'large'
              ? '120% Large'
              : fontSize === 'medium'
              ? '110% Medium'
              : '100% Standard'}
          </span>
        </div>

        <div className="grid grid-cols-4 gap-1.5">
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
                className="py-1.5 rounded-xl text-[11px] font-bold text-center transition-all active:scale-95"
                style={{
                  backgroundColor: isSelected ? '#6366F1' : 'rgba(255, 255, 255, 0.06)',
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

      {/* ── 4. Bottom Actions (Download APK + View Storefront + Logout) ── */}
      <div
        className="p-4 border-t space-y-1.5 shrink-0"
        style={{
          borderColor: 'rgba(255, 255, 255, 0.08)',
          backgroundColor: 'rgba(0, 0, 0, 0.15)',
        }}
      >
        {/* Download Android APK */}
        <a
          href="/downloads/HimalayanKoh-Admin.apk"
          download="HimalayanKoh-Admin.apk"
          className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-semibold text-emerald-300 hover:text-emerald-200 transition-all active:scale-[0.98] hover:bg-emerald-500/10"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-emerald-300 shrink-0"
            style={{ backgroundColor: 'rgba(16, 185, 129, 0.15)' }}
          >
            <Download size={18} weight="bold" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <span>Android App (APK)</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">5.8 MB</span>
            </div>
            <p className="text-[10px] text-slate-400 font-normal truncate">Download &amp; Install on Mobile</p>
          </div>
        </a>

        {/* View Storefront */}
        <a
          href="/"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-semibold text-slate-200 hover:text-white transition-all active:scale-[0.98] hover:bg-white/5"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-slate-200 shrink-0"
            style={{ backgroundColor: 'rgba(255, 255, 255, 0.08)' }}
          >
            <ArrowSquareOut size={18} weight="bold" />
          </div>
          <span>View Storefront</span>
        </a>

        {/* Logout */}
        <button
          type="button"
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl text-xs font-semibold text-rose-400 hover:text-rose-300 transition-all active:scale-[0.98] hover:bg-rose-500/10 cursor-pointer"
        >
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-rose-400 shrink-0"
            style={{ backgroundColor: 'rgba(244, 63, 94, 0.15)' }}
          >
            <SignOut size={18} weight="bold" />
          </div>
          <span>Logout</span>
        </button>
      </div>
    </div>
  );
}
