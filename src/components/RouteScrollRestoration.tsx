import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Where a new page starts, and where a returning one resumes.
 *
 * Two things made navigation feel heavy here:
 *
 *  1. `behavior: 'smooth'` animated the jump to the top on every route change.
 *     Opening a link from halfway down a long page meant watching the viewport
 *     travel back up while the new page was already rendering — a second of
 *     motion where the expectation is that the new page simply starts at its
 *     beginning. Smooth belongs to in-page anchors, not to changing page.
 *
 *  2. `scrollRestoration = 'manual'` plus an unconditional scroll to top meant
 *     Back landed at the top of the previous page rather than at the spot it
 *     was left. Leaving restoration on the browser default hands that back:
 *     it remembers the position for history entries, and only forward
 *     navigations — which have no remembered position — are sent to the top
 *     here.
 */
export default function RouteScrollRestoration() {
  const { pathname, search } = useLocation();
  /** Set while a Back/Forward navigation is in flight, so its restored
   *  position is not overwritten with a jump to the top. */
  const restoringHistoryEntry = useRef(false);

  useEffect(() => {
    const markHistoryNavigation = () => { restoringHistoryEntry.current = true; };
    window.addEventListener('popstate', markHistoryNavigation);
    return () => window.removeEventListener('popstate', markHistoryNavigation);
  }, []);

  useEffect(() => {
    if (restoringHistoryEntry.current) {
      restoringHistoryEntry.current = false;
      return;
    }

    if (pathname.startsWith('/admin')) {
      const mainEl = document.getElementById('main-content');
      if (mainEl) {
        mainEl.scrollTop = 0;
      }
      return;
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.getElementById('main-content')?.focus({ preventScroll: true });
  }, [pathname, search]);

  return null;
}
