'use client';

import React, { createContext, useContext, useEffect, useState, useMemo, ReactNode } from 'react';

export type MobileTheme = 'dark' | 'light';

interface MobileThemeContextValue {
  theme: MobileTheme;
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: MobileTheme) => void;
}

const STORAGE_KEY = 'hk_mobile_theme';

const MobileThemeContext = createContext<MobileThemeContextValue>({
  theme: 'dark',
  isDark: true,
  toggleTheme: () => {},
  setTheme: () => {},
});

export function MobileThemeProvider({ children }: { children: ReactNode }) {
  // Default to 'dark' for mobile visitors as specified in the master prompt
  const [theme, setThemeState] = useState<MobileTheme>('dark');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === 'light' || stored === 'dark') {
        setThemeState(stored);
      }
    } catch {
      // Storage access disabled or blocked in private browsing
    }
  }, []);

  const setTheme = (next: MobileTheme) => {
    setThemeState(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Silently fail if localStorage is restricted
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
    }),
    [theme, isDark]
  );

  return (
    <MobileThemeContext.Provider value={value}>
      <div data-mobile-theme={mounted ? theme : 'dark'} className="contents">
        {children}
      </div>
    </MobileThemeContext.Provider>
  );
}

export function useMobileTheme(): MobileThemeContextValue {
  return useContext(MobileThemeContext);
}
