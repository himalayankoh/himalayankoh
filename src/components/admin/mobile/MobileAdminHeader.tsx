'use client';

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { List, Sun, Moon, Bell, TextAa, X, Check } from '@phosphor-icons/react';
import { useMobileTheme, type MobileFontSize } from '@/context/MobileThemeContext';
import { getMobilePalette } from './MobileThemeTokens';

interface MobileAdminHeaderProps {
  onOpenSidebar: () => void;
  onOpenNotifications: () => void;
  unreadNotifCount?: number;
}

export function MobileAdminHeader({
  onOpenSidebar,
  onOpenNotifications,
  unreadNotifCount = 0,
}: MobileAdminHeaderProps) {
  const location = useLocation();
  const { isDark, toggleTheme, fontSize, setFontSize, increaseFontSize, decreaseFontSize } = useMobileTheme();
  const palette = getMobilePalette(isDark);
  const [showFontSizeModal, setShowFontSizeModal] = useState(false);

  // Dynamic Page Title & Subtitle matching the reference designs
  const getHeaderInfo = (pathname: string) => {
    if (pathname.startsWith('/admin/leados')) {
      return {
        title: 'Leads',
        subtitle: 'Turn Conversations into Opportunities',
      };
    }
    if (pathname.startsWith('/admin/inbox')) {
      return {
        title: 'Email Inbox',
        subtitle: 'Stay Connected, Never Miss an Opportunity',
      };
    }
    if (pathname.startsWith('/admin/products')) {
      return {
        title: 'Products',
        subtitle: 'Catalog, Variations & Pricing',
      };
    }
    if (pathname.startsWith('/admin/orders')) {
      return {
        title: 'Orders',
        subtitle: 'Fulfillment & Real-time Tracking',
      };
    }
    if (pathname.startsWith('/admin/customers')) {
      return {
        title: 'Customers',
        subtitle: 'Buyer Accounts & Directory',
      };
    }
    if (pathname.startsWith('/admin/wholesale')) {
      return {
        title: 'Wholesale',
        subtitle: 'B2B Quotes & Pallet Buyers',
      };
    }
    if (pathname.startsWith('/admin/analytics') || pathname.startsWith('/admin/sales')) {
      return {
        title: 'Analytics',
        subtitle: 'Sales Velocity & Revenue Growth',
      };
    }
    if (pathname.startsWith('/admin/settings')) {
      return {
        title: 'Settings',
        subtitle: 'Configuration & Integrations',
      };
    }
    return {
      title: 'Dashboard',
      subtitle: 'Real-time Operations & Metrics',
    };
  };

  const { title, subtitle } = getHeaderInfo(location.pathname);

  return (
    <header
      className="md:hidden sticky top-0 z-40 px-4 py-3 flex items-center justify-between border-b transition-colors duration-200"
      style={{
        backgroundColor: palette.headerBg,
        borderColor: palette.divider,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
      }}
    >
      {/* Left: Menu Hamburger Button */}
      <div className="flex items-center gap-3 min-w-0">
        <button
          type="button"
          onClick={onOpenSidebar}
          aria-label="Open admin navigation menu"
          className="w-11 h-11 shrink-0 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95"
          style={{
            backgroundColor: palette.iconBtnBg,
            border: `1px solid ${palette.iconBtnBorder}`,
            color: palette.iconBtnText,
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <List size={20} weight="bold" />
        </button>

        {/* Title & Subtitle */}
        <div className="flex flex-col min-w-0">
          <h1
            className="text-base font-bold tracking-tight truncate leading-tight"
            style={{ color: palette.textPrimary }}
          >
            {title}
          </h1>
          <p
            className="text-[11px] font-medium truncate mt-0.5"
            style={{ color: palette.textSecondary }}
          >
            {subtitle}
          </p>
        </div>
      </div>

      {/* Right: Font Size + Theme Toggle + Notification Bell */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Font Size Adjuster Button (User Request: Accessible from every page) */}
        <button
          type="button"
          onClick={() => setShowFontSizeModal(true)}
          aria-label="Adjust Font Size"
          title="Adjust Text Size (Readability)"
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer relative"
          style={{
            backgroundColor: palette.iconBtnBg,
            border: `1px solid ${palette.iconBtnBorder}`,
            color: palette.iconBtnText,
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <TextAa size={20} weight="bold" />
          <span
            className="absolute -bottom-0.5 -right-0.5 px-1 rounded-full text-[9px] font-extrabold uppercase shadow-xs"
            style={{
              backgroundColor: '#6366F1',
              color: '#FFFFFF',
            }}
          >
            {fontSize === 'xlarge' ? 'XL' : fontSize === 'large' ? 'L' : fontSize === 'medium' ? 'M' : 'S'}
          </span>
        </button>

        {/* Dark/Light Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-200 active:scale-95 cursor-pointer relative"
          style={{
            backgroundColor: palette.iconBtnBg,
            border: `1px solid ${palette.iconBtnBorder}`,
            color: isDark ? '#FDE047' : '#7C3AED',
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          {isDark ? (
            <Moon size={19} weight="fill" className="transition-transform duration-200 rotate-0" />
          ) : (
            <Sun size={20} weight="bold" className="transition-transform duration-200 rotate-90" />
          )}
        </button>

        {/* Notifications Bell Button */}
        <button
          type="button"
          onClick={onOpenNotifications}
          aria-label="Open notifications"
          className="w-11 h-11 rounded-full flex items-center justify-center transition-all duration-150 active:scale-95 cursor-pointer relative"
          style={{
            backgroundColor: palette.iconBtnBg,
            border: `1px solid ${palette.iconBtnBorder}`,
            color: palette.iconBtnText,
            boxShadow: isDark ? '0 2px 8px rgba(0,0,0,0.3)' : '0 1px 3px rgba(0,0,0,0.06)',
          }}
        >
          <Bell size={20} weight="regular" />
          {unreadNotifCount > 0 && (
            <span
              className="absolute top-2.5 right-2.5 w-2 h-2 rounded-full animate-pulse"
              style={{
                backgroundColor: '#EF4444',
                boxShadow: `0 0 0 2px ${palette.iconBtnBg}`,
              }}
            />
          )}
        </button>
      </div>

      {/* ── Font Size Control Bottom Sheet (Rendered via Portal to escape header backdropFilter containing block) ── */}
      {showFontSizeModal && typeof document !== 'undefined' && createPortal(
        <div
          data-testid="font-size-modal"
          className="fixed inset-0 z-[9999] flex flex-col justify-end bg-black/70 backdrop-blur-sm animate-fadeIn"
          onClick={() => setShowFontSizeModal(false)}
        >
          <div
            className="rounded-t-3xl border-t p-5 space-y-4 max-h-[85vh] overflow-y-auto w-full max-w-lg mx-auto"
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: palette.cardBg,
              borderColor: palette.cardBorder,
              color: palette.textPrimary,
              boxShadow: '0 -8px 32px rgba(0, 0, 0, 0.45)',
            }}
          >
            <div className="w-12 h-1 rounded-full bg-slate-500/40 mx-auto" />

            <div className="flex items-center justify-between pb-2 border-b" style={{ borderColor: palette.divider }}>
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-xl flex items-center justify-center text-indigo-400 shrink-0"
                  style={{ backgroundColor: 'rgba(99, 102, 241, 0.15)' }}
                >
                  <TextAa size={18} weight="bold" />
                </div>
                <div>
                  <h3 className="text-sm font-extrabold text-white">Font Size &amp; Readability</h3>
                  <p className="text-[11px] text-slate-400">Scale text across all admin pages</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowFontSizeModal(false)}
                className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-white"
                style={{ backgroundColor: palette.iconBtnBg }}
              >
                <X size={16} weight="bold" />
              </button>
            </div>

            {/* Live Text Preview Box */}
            <div
              className="p-3.5 rounded-2xl border transition-all"
              style={{
                backgroundColor: palette.cardElevatedBg,
                borderColor: palette.cardBorder,
              }}
            >
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-400 mb-1.5">
                <span>LIVE PREVIEW</span>
                <span className="text-indigo-400 uppercase font-mono font-bold">
                  {fontSize === 'xlarge'
                    ? '130% Extra Large'
                    : fontSize === 'large'
                    ? '120% Large'
                    : fontSize === 'medium'
                    ? '110% Medium (Default)'
                    : '100% Standard'}
                </span>
              </div>
              <p className="font-bold text-white leading-snug">
                Himalayan Koh • 30 lb Pasture Salt Licks
              </p>
              <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                Weather-resistant mined mineral rocks. 84 essential trace elements for livestock herd health. Dispatched direct from Houston, TX.
              </p>
            </div>

            {/* Quick Increment / Decrement Stepper */}
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={decreaseFontSize}
                disabled={fontSize === 'normal'}
                className="flex-1 py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all disabled:opacity-40 active:scale-95"
                style={{
                  backgroundColor: palette.cardElevatedBg,
                  color: palette.textPrimary,
                  border: `1px solid ${palette.cardBorder}`,
                }}
              >
                <span className="text-sm font-extrabold">A−</span>
                <span>Smaller</span>
              </button>

              <button
                type="button"
                onClick={increaseFontSize}
                disabled={fontSize === 'xlarge'}
                className="flex-1 py-2.5 px-3 rounded-2xl flex items-center justify-center gap-1.5 text-xs font-bold transition-all disabled:opacity-40 active:scale-95"
                style={{
                  backgroundColor: palette.cardElevatedBg,
                  color: palette.textPrimary,
                  border: `1px solid ${palette.cardBorder}`,
                }}
              >
                <span className="text-sm font-extrabold">A+</span>
                <span>Larger</span>
              </button>
            </div>

            {/* 4 Preset Options Grid */}
            <div className="grid grid-cols-2 gap-2 pt-1">
              {[
                { id: 'normal' as MobileFontSize, label: 'Standard', sub: '100% Base Scale' },
                { id: 'medium' as MobileFontSize, label: 'Medium', sub: '110% Recommended' },
                { id: 'large' as MobileFontSize, label: 'Large', sub: '120% Prominent' },
                { id: 'xlarge' as MobileFontSize, label: 'Extra Large', sub: '130% Maximum' },
              ].map((opt) => {
                const isSelected = fontSize === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setFontSize(opt.id)}
                    className="p-3 rounded-2xl text-left transition-all active:scale-95 flex flex-col justify-between"
                    style={{
                      background: isSelected ? palette.accentGradient : palette.cardElevatedBg,
                      color: isSelected ? '#FFFFFF' : palette.textPrimary,
                      border: `1.5px solid ${isSelected ? 'transparent' : palette.cardBorder}`,
                      boxShadow: isSelected ? palette.accentGlow : 'none',
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-extrabold">{opt.label}</span>
                      {isSelected && <Check size={14} weight="bold" />}
                    </div>
                    <span
                      className="text-[10px] mt-1"
                      style={{ color: isSelected ? 'rgba(255,255,255,0.85)' : palette.textMuted }}
                    >
                      {opt.sub}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Close Button */}
            <button
              type="button"
              onClick={() => setShowFontSizeModal(false)}
              className="w-full py-3 rounded-2xl text-xs font-bold text-white shadow-md active:scale-95 transition-all text-center"
              style={{ background: palette.accentGradient }}
            >
              Apply &amp; Done
            </button>
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}
