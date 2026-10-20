'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowsClockwise, RocketLaunch, X } from '@phosphor-icons/react';

interface VersionInfo {
  version: string;
  buildId: string;
  timestamp: string;
}

export function AdminUpdateBanner() {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const currentBuildRef = useRef<string | null>(null);

  // Check server version
  const checkVersion = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/version?t=${Date.now()}`, {
        cache: 'no-store',
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          Pragma: 'no-cache',
        },
      });
      if (!res.ok) return;
      const data: VersionInfo = await res.json();
      if (!data?.buildId) return;

      if (!currentBuildRef.current) {
        currentBuildRef.current = data.buildId;
        // Also check if service worker registration has waiting worker
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistration('/admin').then((reg) => {
            if (reg?.waiting) {
              setUpdateAvailable(true);
            }
          });
        }
      } else if (currentBuildRef.current !== data.buildId) {
        setUpdateAvailable(true);
      }
    } catch {
      // Ignore background network transient errors
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // Initial check
    checkVersion();

    // Check every 45 seconds for website changes
    const interval = setInterval(checkVersion, 45000);

    // Check immediately when returning to the app
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        checkVersion();
      }
    };
    window.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onVisibility);

    // Service Worker update detection
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.addEventListener('updatefound', () => {
          const newWorker = reg.installing;
          if (!newWorker) return;
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              setUpdateAvailable(true);
            }
          });
        });
      });

      // Reload when new controller claims clients
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (isUpdating) {
          window.location.reload();
        }
      });
    }

    return () => {
      clearInterval(interval);
      window.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', onVisibility);
    };
  }, [checkVersion, isUpdating]);

  const handleUpdateNow = async () => {
    setIsUpdating(true);
    try {
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration('/admin');
        if (reg?.waiting) {
          reg.waiting.postMessage('SKIP_WAITING');
        }
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage('SKIP_WAITING');
        }
        // Purge caches
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.map((k) => caches.delete(k)));
        }
      }
    } catch {
      // Proceed to reload regardless
    }

    // Force reload from server bypassing cache
    setTimeout(() => {
      window.location.reload();
    }, 400);
  };

  if (!updateAvailable || dismissed) return null;

  return (
    <aside
      aria-label="App update notification"
      className="fixed top-3 left-3 right-3 md:left-auto md:right-6 md:top-4 z-50 max-w-md animate-in fade-in slide-in-from-top-4 duration-300 pointer-events-auto"
    >
      <div
        className="p-3.5 rounded-2xl text-white shadow-2xl flex items-center justify-between gap-3 border backdrop-blur-md"
        style={{
          background: 'linear-gradient(135deg, #B45309 0%, #D97706 50%, #DC2626 100%)',
          borderColor: 'rgba(255, 255, 255, 0.25)',
          boxShadow: '0 20px 30px -10px rgba(180, 83, 9, 0.45)',
        }}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
            <RocketLaunch size={18} weight="fill" className="text-amber-200" />
          </div>
          <div className="min-w-0">
            <div className="text-xs font-black tracking-tight truncate">
              Website Admin Updated!
            </div>
            <div className="text-[10px] text-amber-100/90 font-medium truncate">
              Real-time update available • Tap to reload
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={handleUpdateNow}
            disabled={isUpdating}
            className="px-3 py-1.5 bg-white text-amber-950 rounded-xl text-xs font-extrabold shadow-md hover:bg-amber-50 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
          >
            <ArrowsClockwise size={13} weight="bold" className={isUpdating ? 'animate-spin' : ''} />
            <span>{isUpdating ? 'Updating…' : 'Update Now'}</span>
          </button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss update notification"
            className="p-1 text-white/70 hover:text-white rounded-lg active:scale-90"
          >
            <X size={14} weight="bold" />
          </button>
        </div>
      </div>
    </aside>
  );
}
