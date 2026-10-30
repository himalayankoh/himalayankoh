export interface ThemePalette {
  bg: string;
  headerBg: string;
  cardBg: string;
  cardElevatedBg: string;
  cardBorder: string;
  cardShadow: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  searchBg: string;
  searchBorder: string;
  searchPlaceholder: string;
  accentGradient: string;
  accentGlow: string;
  accentText: string;
  bottomNavBg: string;
  bottomNavBorder: string;
  chipActiveBg: string;
  chipActiveText: string;
  chipInactiveBg: string;
  chipInactiveText: string;
  chipInactiveBorder: string;
  iconBtnBg: string;
  iconBtnBorder: string;
  iconBtnText: string;
  divider: string;
  status: {
    new: { text: string; bg: string; border: string };
    contacted: { text: string; bg: string; border: string };
    qualified: { text: string; bg: string; border: string };
    converted: { text: string; bg: string; border: string };
  };
}

export const DARK_THEME: ThemePalette = {
  bg: '#0B0E17',
  headerBg: 'rgba(11, 14, 23, 0.95)',
  cardBg: '#131929',
  cardElevatedBg: '#182035',
  cardBorder: 'rgba(255, 255, 255, 0.08)',
  cardShadow: '0 8px 32px 0 rgba(0, 0, 0, 0.37)',
  textPrimary: '#FFFFFF',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  searchBg: '#131929',
  searchBorder: 'rgba(255, 255, 255, 0.1)',
  searchPlaceholder: '#64748B',
  accentGradient: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
  accentGlow: '0 4px 20px 0 rgba(139, 92, 246, 0.45)',
  accentText: '#A78BFA',
  bottomNavBg: 'rgba(11, 14, 23, 0.96)',
  bottomNavBorder: 'rgba(255, 255, 255, 0.08)',
  chipActiveBg: 'linear-gradient(135deg, #8B5CF6 0%, #6366F1 100%)',
  chipActiveText: '#FFFFFF',
  chipInactiveBg: '#131929',
  chipInactiveText: '#94A3B8',
  chipInactiveBorder: 'rgba(255, 255, 255, 0.08)',
  iconBtnBg: '#182035',
  iconBtnBorder: 'rgba(255, 255, 255, 0.1)',
  iconBtnText: '#E2E8F0',
  divider: 'rgba(255, 255, 255, 0.08)',
  status: {
    new: { text: '#22D3EE', bg: 'rgba(6, 182, 212, 0.16)', border: 'rgba(6, 182, 212, 0.3)' },
    contacted: { text: '#FBBF24', bg: 'rgba(245, 158, 11, 0.16)', border: 'rgba(245, 158, 11, 0.3)' },
    qualified: { text: '#C084FC', bg: 'rgba(168, 85, 247, 0.16)', border: 'rgba(168, 85, 247, 0.3)' },
    converted: { text: '#34D399', bg: 'rgba(16, 185, 129, 0.16)', border: 'rgba(16, 185, 129, 0.3)' },
  },
};

export const LIGHT_THEME: ThemePalette = {
  bg: '#F8FAFC',
  headerBg: 'rgba(248, 250, 252, 0.95)',
  cardBg: '#FFFFFF',
  cardElevatedBg: '#F1F5F9',
  cardBorder: '#E2E8F0',
  cardShadow: '0 4px 16px -2px rgba(15, 23, 42, 0.06), 0 2px 6px -1px rgba(15, 23, 42, 0.03)',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  searchBg: '#FFFFFF',
  searchBorder: '#E2E8F0',
  searchPlaceholder: '#94A3B8',
  accentGradient: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)',
  accentGlow: '0 4px 18px 0 rgba(124, 58, 237, 0.25)',
  accentText: '#7C3AED',
  bottomNavBg: 'rgba(255, 255, 255, 0.96)',
  bottomNavBorder: '#E2E8F0',
  chipActiveBg: 'linear-gradient(135deg, #7C3AED 0%, #6366F1 100%)',
  chipActiveText: '#FFFFFF',
  chipInactiveBg: '#FFFFFF',
  chipInactiveText: '#475569',
  chipInactiveBorder: '#E2E8F0',
  iconBtnBg: '#FFFFFF',
  iconBtnBorder: '#E2E8F0',
  iconBtnText: '#334155',
  divider: '#E2E8F0',
  status: {
    new: { text: '#0891B2', bg: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.25)' },
    contacted: { text: '#D97706', bg: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.25)' },
    qualified: { text: '#9333EA', bg: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.25)' },
    converted: { text: '#059669', bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.25)' },
  },
};

export function getMobilePalette(isDark: boolean): ThemePalette {
  return isDark ? DARK_THEME : LIGHT_THEME;
}
