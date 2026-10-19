'use client';

import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  House,
  Users,
  Plus,
  EnvelopeSimple,
  DotsNine,
} from '@phosphor-icons/react';
import { useMobileTheme } from '@/context/MobileThemeContext';
import { getMobilePalette } from './MobileThemeTokens';

interface MobileAdminBottomNavProps {
  onOpenQuickAdd: () => void;
  onOpenMore: () => void;
}

export function MobileAdminBottomNav({
  onOpenQuickAdd,
  onOpenMore,
}: MobileAdminBottomNavProps) {
  const location = useLocation();
  const { isDark } = useMobileTheme();
  const palette = getMobilePalette(isDark);

  const isDashboardActive = location.pathname === '/admin';
  const isLeadsActive = location.pathname.startsWith('/admin/leados');
  const isEmailActive = location.pathname.startsWith('/admin/inbox');

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-50 transition-colors duration-200 border-t"
      style={{
        backgroundColor: palette.bottomNavBg,
        borderColor: palette.bottomNavBorder,
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        paddingBottom: 'max(env(safe-area-inset-bottom), 6px)',
        boxShadow: isDark
          ? '0 -8px 24px -4px rgba(0, 0, 0, 0.45)'
          : '0 -4px 16px -2px rgba(15, 23, 42, 0.08)',
      }}
      aria-label="Mobile admin navigation"
    >
      <div className="flex items-center justify-around max-w-md mx-auto px-2 pt-2 pb-1 relative">
        {/* 1. Dashboard */}
        <Link
          to="/admin"
          className="flex flex-col items-center justify-center min-w-[56px] min-h-[48px] gap-1 transition-all active:scale-95"
          style={{
            color: isDashboardActive ? palette.accentText : palette.textMuted,
          }}
        >
          <div
            className="p-1.5 rounded-xl transition-all"
            style={{
              backgroundColor: isDashboardActive
                ? isDark
                  ? 'rgba(139, 92, 246, 0.18)'
                  : 'rgba(124, 58, 237, 0.12)'
                : 'transparent',
            }}
          >
            <House size={20} weight={isDashboardActive ? 'fill' : 'regular'} />
          </div>
          <span className="text-[10px] font-semibold tracking-tight">Dashboard</span>
        </Link>

        {/* 2. Leads */}
        <Link
          to="/admin/leados"
          className="flex flex-col items-center justify-center min-w-[56px] min-h-[48px] gap-1 transition-all active:scale-95"
          style={{
            color: isLeadsActive ? palette.accentText : palette.textMuted,
          }}
        >
          <div
            className="p-1.5 rounded-xl transition-all"
            style={{
              backgroundColor: isLeadsActive
                ? isDark
                  ? 'rgba(139, 92, 246, 0.18)'
                  : 'rgba(124, 58, 237, 0.12)'
                : 'transparent',
            }}
          >
            <Users size={20} weight={isLeadsActive ? 'fill' : 'regular'} />
          </div>
          <span className="text-[10px] font-semibold tracking-tight">Leads</span>
        </Link>

        {/* 3. Central Floating Action Button (+) */}
        <div className="flex items-center justify-center -mt-6">
          <button
            type="button"
            onClick={onOpenQuickAdd}
            aria-label="Quick Actions"
            className="w-14 h-14 rounded-full flex items-center justify-center text-white transition-all duration-200 active:scale-90"
            style={{
              background: palette.accentGradient,
              boxShadow: palette.accentGlow,
              border: '3px solid',
              borderColor: isDark ? '#0B0E17' : '#FFFFFF',
            }}
          >
            <Plus size={26} weight="bold" />
          </button>
        </div>

        {/* 4. Email */}
        <Link
          to="/admin/inbox"
          className="flex flex-col items-center justify-center min-w-[56px] min-h-[48px] gap-1 transition-all active:scale-95"
          style={{
            color: isEmailActive ? palette.accentText : palette.textMuted,
          }}
        >
          <div
            className="p-1.5 rounded-xl transition-all"
            style={{
              backgroundColor: isEmailActive
                ? isDark
                  ? 'rgba(139, 92, 246, 0.18)'
                  : 'rgba(124, 58, 237, 0.12)'
                : 'transparent',
            }}
          >
            <EnvelopeSimple size={20} weight={isEmailActive ? 'fill' : 'regular'} />
          </div>
          <span className="text-[10px] font-semibold tracking-tight">Email</span>
        </Link>

        {/* 5. More */}
        <button
          type="button"
          onClick={onOpenMore}
          className="flex flex-col items-center justify-center min-w-[56px] min-h-[48px] gap-1 transition-all active:scale-95"
          style={{
            color: palette.textMuted,
          }}
          aria-label="More navigation items"
        >
          <div className="p-1.5 rounded-xl transition-all">
            <DotsNine size={20} weight="bold" />
          </div>
          <span className="text-[10px] font-semibold tracking-tight">More</span>
        </button>
      </div>
    </nav>
  );
}
