'use client';

import React from 'react';
import { useLocation } from 'react-router-dom';
import { List, Sun, Moon, Bell } from '@phosphor-icons/react';
import { useMobileTheme } from '@/context/MobileThemeContext';
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
  const { isDark, toggleTheme } = useMobileTheme();
  const palette = getMobilePalette(isDark);

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

      {/* Right: Theme Toggle + Notification Bell */}
      <div className="flex items-center gap-2 shrink-0">
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
    </header>
  );
}
