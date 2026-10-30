'use client';

import { MotionConfig } from 'framer-motion';
import { AuthProvider } from '@/context/AuthContext';
import { ToastProvider } from '@/context/ToastContext';
import HashUrlRedirect from '@/components/HashUrlRedirect';
import NavigationProgress from '@/components/NavigationProgress';
import RouteScrollRestoration from '@/components/RouteScrollRestoration';
import StaleChunkRecovery from '@/components/StaleChunkRecovery';
import StorefrontTraffic from '@/components/StorefrontTraffic';

/**
 * Client-only effects, and deliberately *not* wrapped in Suspense.
 *
 * They used to be, because they read search params through
 * `useSearchParams()` from `next/navigation`, which may only be called inside a
 * boundary. A boundary with a `null` fallback above these components also sits
 * above every route, and that has two costs: the prerendered document is missing
 * whatever it guards (so the console visibly redraws once it hydrates), and a
 * boundary that is still hydrating when its query-string update lands throws
 * React error #419 and takes the page down with the generic "error occurred in the
 * Server Components render" message. Each of these components now reads
 * `window.location` through the app's router shim instead, so nothing here
 * suspends and no boundary is required. `router-compat.test.ts` guards that: no
 * file may import `useSearchParams` from `next/navigation` again.
 *
 * SEO used to be mounted here too. It imperatively mutated <title>/<meta>/
 * <link rel="canonical"> in document.head on every route change (a Vite/
 * react-router leftover from before the Next.js migration) — the same nodes
 * Next's own generateMetadata already server-renders and reconciles for
 * every route. The two fought over the same DOM nodes on every navigation,
 * which surfaced as a repeating "Cannot read properties of null (reading
 * 'removeChild')" crash in react-dom's commit phase and, because the crash
 * landed mid-navigation, left the router looking stuck on the previous page
 * until a manual reload. Removed rather than fixed in place: every route
 * already has real Next.js metadata, so the component was pure redundancy.
 */
function ClientEffects() {
  return (
    <>
      <HashUrlRedirect />
      <NavigationProgress />
      <RouteScrollRestoration />
      <StorefrontTraffic />
    </>
  );
}

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <MotionConfig reducedMotion="user"><AuthProvider>
      <ToastProvider>
        <StaleChunkRecovery />
        <ClientEffects />
        {children}
      </ToastProvider>
    </AuthProvider></MotionConfig>
  );
}
