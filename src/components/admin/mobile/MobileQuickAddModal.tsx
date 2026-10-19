'use client';

import React from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X,
  Target,
  PencilSimple,
  Package,
  ShoppingCart,
  Storefront,
} from '@phosphor-icons/react';
import { useMobileTheme } from '@/context/MobileThemeContext';
import { getMobilePalette } from './MobileThemeTokens';

interface MobileQuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MobileQuickAddModal({ isOpen, onClose }: MobileQuickAddModalProps) {
  const navigate = useNavigate();
  const { isDark } = useMobileTheme();
  const palette = getMobilePalette(isDark);

  if (!isOpen) return null;

  const actions = [
    {
      label: 'Prospect Lead',
      description: 'Find & qualify livestock prospects',
      icon: Target,
      color: '#8B5CF6',
      onClick: () => {
        onClose();
        navigate('/admin/leados');
      },
    },
    {
      label: 'Compose Email',
      description: 'Dispatch outreach or client message',
      icon: PencilSimple,
      color: '#EC4899',
      onClick: () => {
        onClose();
        navigate('/admin/inbox');
      },
    },
    {
      label: 'Add Product',
      description: 'Create salt lick or livestock SKU',
      icon: Package,
      color: '#F59E0B',
      onClick: () => {
        onClose();
        navigate('/admin/products/new');
      },
    },
    {
      label: 'View Orders',
      description: 'Fulfill customer orders & labels',
      icon: ShoppingCart,
      color: '#10B981',
      onClick: () => {
        onClose();
        navigate('/admin/orders');
      },
    },
    {
      label: 'Open Storefront',
      description: 'View customer live retail shop',
      icon: Storefront,
      color: '#06B6D4',
      onClick: () => {
        onClose();
        navigate('/');
      },
    },
  ];

  return (
    <div className="md:hidden fixed inset-0 z-modal flex flex-col justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Sheet Content */}
      <div
        className="relative rounded-t-3xl p-5 border-t shadow-2xl transition-all max-h-[85vh] overflow-y-auto"
        style={{
          backgroundColor: palette.cardBg,
          borderColor: palette.cardBorder,
          color: palette.textPrimary,
        }}
      >
        {/* Handle Bar */}
        <div className="w-12 h-1.5 rounded-full bg-slate-500/40 mx-auto mb-4" />

        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b" style={{ borderColor: palette.divider }}>
          <div>
            <h2 className="text-base font-bold tracking-tight" style={{ color: palette.textPrimary }}>
              Quick Actions
            </h2>
            <p className="text-xs" style={{ color: palette.textSecondary }}>
              Create records & jump directly to workflows
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors"
            style={{
              backgroundColor: palette.iconBtnBg,
              color: palette.iconBtnText,
            }}
          >
            <X size={18} weight="bold" />
          </button>
        </div>

        {/* Action Grid */}
        <div className="grid grid-cols-1 gap-2.5 mt-4">
          {actions.map((act) => {
            const Icon = act.icon;
            return (
              <button
                key={act.label}
                type="button"
                onClick={act.onClick}
                className="flex items-center gap-3.5 p-3 rounded-2xl text-left transition-all active:scale-[0.98]"
                style={{
                  backgroundColor: palette.cardElevatedBg,
                  border: `1px solid ${palette.cardBorder}`,
                }}
              >
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                  style={{
                    backgroundColor: act.color,
                  }}
                >
                  <Icon size={20} weight="duotone" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-bold" style={{ color: palette.textPrimary }}>
                    {act.label}
                  </div>
                  <div className="text-xs truncate" style={{ color: palette.textSecondary }}>
                    {act.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
