'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';

export type MobileTheme = 'dark' | 'light';
export type MobileFontSize = 'normal' | 'medium' | 'large' | 'xlarge';

interface MobileThemeContextValue {
  theme: MobileTheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: MobileTheme) => void;
  fontSize: MobileFontSize;
  setFontSize: (size: MobileFontSize) => void;
  increaseFontSize: () => void;
  decreaseFontSize: () => void;
  isApk: boolean;
}

const STORAGE_KEY = 'hk_mobile_theme';
const FONT_SIZE_KEY = 'hk_mobile_font_size';

const FONT_SIZE_ORDER: MobileFontSize[] = ['normal', 'medium', 'large', 'xlarge'];

const MobileThemeContext = createContext<MobileThemeContextValue>({
  theme: 'dark',
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
  fontSize: 'medium',
  setFontSize: () => {},
  increaseFontSize: () => {},
  decreaseFontSize: () => {},
  isApk: false,
});

export function MobileThemeProvider({ children }: { children: ReactNode }) {
  // Default to 'dark' for mobile visitors as specified in the master prompt
  const [theme, setThemeState] = useState<MobileTheme>('dark');
  // Default to 'medium' (+10% scale) to comfortably increase base font readability without layout breakage
  const [fontSize, setFontSizeState] = useState<MobileFontSize>('medium');
  const [isApk, setIsApk] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const storedTheme = localStorage.getItem(STORAGE_KEY);
      if (storedTheme === 'light' || storedTheme === 'dark') {
        setThemeState(storedTheme);
      }
      const storedFontSize = localStorage.getItem(FONT_SIZE_KEY);
      if (
        storedFontSize === 'normal' ||
        storedFontSize === 'medium' ||
        storedFontSize === 'large' ||
        storedFontSize === 'xlarge'
      ) {
        setFontSizeState(storedFontSize);
      }
    } catch {
      // Storage access disabled or blocked in private browsing
    }

    // Detect if running inside the dedicated Himalayan Koh Android APK or Standalone App
    if (typeof navigator !== 'undefined') {
      const isNativeApk =
        navigator.userAgent.includes('HimalayanKohAdminApp') ||
        (typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches);
      setIsApk(isNativeApk);
      if (isNativeApk && typeof document !== 'undefined') {
        document.documentElement.classList.add('is-apk-app');
        document.body.classList.add('is-apk-app');
      }
    }
  }, []);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-mobile-theme', theme);
      document.body.setAttribute('data-mobile-theme', theme);
    }
  }, [theme]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-mobile-font-size', fontSize);
      document.body.setAttribute('data-mobile-font-size', fontSize);
    }
  }, [fontSize]);

  const setTheme = (next: MobileTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-mobile-theme', next);
        document.body.setAttribute('data-mobile-theme', next);
      }
    } catch {
      // Silently fail if localStorage is restricted
    }
  };

  const setFontSize = (next: MobileFontSize) => {
    setFontSizeState(next);
    try {
      localStorage.setItem(FONT_SIZE_KEY, next);
      if (typeof document !== 'undefined') {
        document.documentElement.setAttribute('data-mobile-font-size', next);
        document.body.setAttribute('data-mobile-font-size', next);
      }
    } catch {
      // Silently fail if localStorage is restricted
    }
  };

  const increaseFontSize = () => {
    const currentIndex = FONT_SIZE_ORDER.indexOf(fontSize);
    if (currentIndex < FONT_SIZE_ORDER.length - 1) {
      setFontSize(FONT_SIZE_ORDER[currentIndex + 1]);
    }
  };

  const decreaseFontSize = () => {
    const currentIndex = FONT_SIZE_ORDER.indexOf(fontSize);
    if (currentIndex > 0) {
      setFontSize(FONT_SIZE_ORDER[currentIndex - 1]);
    }
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const isDark = theme === 'dark';

  const value = useMemo(
    () => ({
      theme,
      isDark,
      toggleTheme,
      setTheme,
      fontSize,
      setFontSize,
      increaseFontSize,
      decreaseFontSize,
      isApk,
    }),
    [theme, isDark, fontSize, isApk]
  );

  return (
    <MobileThemeContext.Provider value={value}>
      <div
        data-mobile-theme={mounted ? theme : 'dark'}
        data-mobile-font-size={mounted ? fontSize : 'medium'}
        className="contents"
      >
        {children}
      </div>
    </MobileThemeContext.Provider>
  );
}

export function useMobileTheme(): MobileThemeContextValue {
  return useContext(MobileThemeContext);
}
