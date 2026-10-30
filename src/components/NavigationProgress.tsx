'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';
import {
  endNavigationProgress,
  isNavigating,
  subscribeNavigationProgress,
} from '../lib/navigationProgress';

/**
 * A thin bar across the top while the next page is being fetched.
 *
 * The page underneath stays exactly where it is, so this is the only thing that
 * moves during a navigation — the alternative, swapping the content for a
 * skeleton, flashes on any transition quick enough not to need one.
 *
 * It creeps toward 90% rather than tracking real progress, which is not
 * knowable, then completes when the route actually changes. The point is to
 * confirm the click landed, not to predict a duration.
 *
 * `useLocation` is the app's own shim, which reads the query string from
 * `window.location`, not `useSearchParams` from `next/navigation`. That hook may
 * only be called inside a Suspense boundary, and this component sat in one with a
 * `null` fallback: the boundary therefore had to hydrate before it could resolve
 * the query string, and the update that resolved it arrived mid-hydration. React
 * answers exactly that with error #419 — "this Suspense boundary received an
 * update before it finished hydrating" — which aborts the boundary and surfaces
 * as the generic "error occurred in the Server Components render" page on every
 * admin route. Reading the browser removes the boundary requirement, so nothing
 * above a route suspends any more.
 */
export default function NavigationProgress() {
  const { pathname, search } = useLocation();
  const active = useSyncExternalStore(
    subscribeNavigationProgress,
    isNavigating,
    () => false,
  );
  const [width, setWidth] = useState(0);
  const [visible, setVisible] = useState(false);

  // A new route rendered — whatever was in flight has arrived.
  useEffect(() => {
    endNavigationProgress();
  }, [pathname, search]);

  useEffect(() => {
    if (active) {
      setVisible(true);
      setWidth(12);
      // Approach a modest visual ceiling quickly. The route effect below owns
      // completion; this bar must never crawl visibly at 90–99% while a
      // background data request is still running.
      const creep = setInterval(() => {
        setWidth((current) => (current >= 82 ? current : current + (82 - current) * 0.3));
      }, 100);

      // A navigation that never completes — a route that throws, a click the
      // router discards, a prefetch that stalls — must not leave the bar on
      // screen for the rest of the session. This is only a terminal recovery
      // guard; normal completion comes from the route/search render effect.
      const failsafe = setTimeout(endNavigationProgress, 5_000);

      return () => {
        clearInterval(creep);
        clearTimeout(failsafe);
      };
    }

    if (!visible) return undefined;

    setWidth(100);
    // Held only briefly at full width so completion is visible without making
    // a fast route feel delayed.
    const hide = setTimeout(() => {
      setVisible(false);
      setWidth(0);
    }, 120);
    return () => clearTimeout(hide);
  }, [active, visible]);

  if (!visible) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[200] h-0.5 pointer-events-none"
      role="progressbar"
      aria-hidden="true"
    >
      <div
        className="h-full bg-himalayan transition-[width,opacity] duration-200 ease-out"
        style={{ width: `${width}%`, opacity: width >= 100 ? 0 : 1 }}
      />
    </div>
  );
}
