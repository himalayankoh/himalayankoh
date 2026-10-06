'use client';

import NextLink from 'next/link';
import { useRouter, usePathname, useParams as useNextParams } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from 'react';

import { startNavigationProgress } from './navigationProgress';
import { pathOnly, queryOnlyDestination } from './router/locationMatch';
import { shouldPrefetchOnViewport } from './router/prefetchPolicy';

const ROUTER_STATE_KEY = '__next_router_state';

/** Current path, or '' on the server where there is nothing to compare against. */
function currentPath(): string {
  return typeof window === 'undefined' ? '' : window.location.pathname;
}

type StoredNavigation = { path: string; state: unknown };

/** Shared across all useLocation() callers so Layout/SEO do not steal navigation state. */
let sharedNavigationState: StoredNavigation | null = null;

/**
 * The query string, read from the browser instead of from `next/navigation`.
 *
 * `useSearchParams()` from `next/navigation` may only be called during a render
 * that sits **inside a Suspense boundary**. Every caller of this shim — the admin
 * shell's `AdminRoute`, `ProtectedRoute`, the account sidebar, `LoginPage`,
 * `/account`, `/checkout/success`, `/track` — is a component that renders at the
 * top of its route, so each one either needed its own boundary or took the whole
 * route down. That is not a hypothetical: with the app's root boundary removed to
 * let a retired product URL answer a real `404` (a boundary above the product
 * route swallows the status — see `app/(main)/products/[slug]/page.status.test.ts`),
 * every admin route answered `200` with React's "error occurred in the Server
 * Components render" boundary and React error #419 in the console.
 *
 * Reading `window.location.search` removes the requirement entirely: the value is
 * empty on the server and React uses exactly that for the hydration render (the
 * `getServerSnapshot` contract), then swaps in the real query string on the
 * client. Freshness comes from `usePathname()` — any router navigation re-renders
 * this component, which re-reads the snapshot — plus `popstate` for back/forward.
 */
/**
 * Callbacks that must re-read the URL after the shim changes it in place.
 *
 * `popstate` alone is not enough, and that is not a detail — it was a bug. A
 * category pill on `/products` points at `/products?category=edible-pink-salt`:
 * same pathname, different query. Next's `Link` handled that click, called
 * `preventDefault()`, and then never completed the navigation — no RSC request, no
 * history update, no document load, no error. The shopper's click simply vanished,
 * which is exactly what "categories don't work" looks like.
 *
 * So the shim now owns query-only navigation itself: it writes the URL with
 * `history` and tells every subscriber. Pathname-changing navigation still goes
 * through Next's router, where it works and where Next's own state has to track it.
 * Nothing is stale by doing this, because for a query-only change the pathname —
 * the only thing Next's router tracks here — is unchanged.
 */
const locationSubscribers = new Set<() => void>();

function notifyLocationChange() {
  for (const subscriber of [...locationSubscribers]) subscriber();
}

function subscribeToLocation(onChange: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  locationSubscribers.add(onChange);
  const onPopState = () => onChange();
  window.addEventListener('popstate', onPopState);
  return () => {
    locationSubscribers.delete(onChange);
    window.removeEventListener('popstate', onPopState);
  };
}

/**
 * The query-only navigation this shim handles itself.
 *
 * Returns true when the URL was written here. A destination that changes the
 * pathname returns false, so it continues to Next's router.
 */
function navigateWithinSamePath(destination: string, replace: boolean): boolean {
  if (typeof window === 'undefined') return false;

  const currentHref = `${window.location.pathname}${window.location.search}`;
  const target = queryOnlyDestination(destination, currentHref);
  if (target === null) return false;

  window.history[replace ? 'replaceState' : 'pushState'](null, '', target);
  notifyLocationChange();
  return true;
}

function clientSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}

function serverSearch(): string {
  return '';
}

/** Query string as a stable `URLSearchParams`, empty until the client mounts. */
function useClientSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(subscribeToLocation, clientSearch, serverSearch);
  return useMemo(() => new URLSearchParams(search), [search]);
}

/**
 * sessionStorage does not exist during server rendering. Every access below is
 * guarded — an unguarded read throws and takes the whole page tree down with
 * it, leaving crawlers nothing but the root error fallback.
 */
function hasSessionStorage(): boolean {
  return typeof window !== 'undefined' && typeof window.sessionStorage !== 'undefined';
}

function setNavigationState(path: string, state: unknown) {
  sharedNavigationState = { path: pathOnly(path), state };
  if (!hasSessionStorage()) return;
  sessionStorage.setItem(ROUTER_STATE_KEY, JSON.stringify(sharedNavigationState));
}

/**
 * In-memory lookup only — safe to call while rendering (including on the
 * server, where it always yields undefined, matching the first client render).
 */
function readNavigationStateSync(pathname: string): unknown | undefined {
  if (sharedNavigationState?.path === pathOnly(pathname)) {
    return sharedNavigationState.state;
  }
  return undefined;
}

function readNavigationState(pathname: string): unknown | undefined {
  const path = pathOnly(pathname);

  if (sharedNavigationState?.path === path) {
    return sharedNavigationState.state;
  }

  if (!hasSessionStorage()) return undefined;

  const raw = sessionStorage.getItem(ROUTER_STATE_KEY);
  if (!raw) return undefined;

  try {
    const parsed = JSON.parse(raw) as StoredNavigation | unknown;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'path' in parsed &&
      'state' in parsed &&
      (parsed as StoredNavigation).path === path
    ) {
      sharedNavigationState = parsed as StoredNavigation;
      return (parsed as StoredNavigation).state;
    }
  } catch {
    sessionStorage.removeItem(ROUTER_STATE_KEY);
  }

  return undefined;
}

function clearNavigationState(pathname: string) {
  if (sharedNavigationState?.path === pathOnly(pathname)) {
    sharedNavigationState = null;
  }
  if (!hasSessionStorage()) return;
  sessionStorage.removeItem(ROUTER_STATE_KEY);
}

type SetSearchParamsOptions = { replace?: boolean };

type LinkProps = {
  to?: string;
  href?: string;
  replace?: boolean;
  state?: unknown;
  children?: ReactNode;
} & Omit<ComponentProps<typeof NextLink>, 'href' | 'children'>;

export function Link({ to, href, replace, state, children, onClick, prefetch, ...rest }: LinkProps) {
  const destination = to ?? href ?? '/';

  // A link's route used to be fetched the moment the link scrolled into view,
  // which on this shop meant four to eight full server renders per page view,
  // each reading WooCommerce, for pages nobody had asked for — measured at
  // 2.8-6.6 s apiece. Commerce and private destinations now wait for a real
  // navigation; a static page keeps Next's own behaviour. A caller that passes
  // `prefetch` explicitly still wins, so nothing is decided behind its back.
  const resolvedPrefetch = prefetch ?? (shouldPrefetchOnViewport(destination) ? undefined : false);

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (state) {
      setNavigationState(destination, state);
    }

    // The browser handles these itself — a new tab, a download, a modified click —
    // so no in-app navigation follows and the progress bar would never be cleared.
    const handledByBrowser = event.defaultPrevented
      || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
      || (rest.target && rest.target !== '_self');

    if (!handledByBrowser) {
      // A same-path query change is resolved here, before Next's `Link` can defer
      // it into a transition that never commits (see `subscribeToLocation`). The
      // bar is announced only when a query-only write actually happens; a
      // pathname change is Next's navigation and is announced by the router push.
      const currentHref = `${window.location.pathname}${window.location.search}`;
      if (queryOnlyDestination(destination, currentHref) !== null) {
        event.preventDefault();
        startNavigationProgress();
        navigateWithinSamePath(destination, Boolean(replace));
        onClick?.(event);
        return;
      }

      const resolved = destination.startsWith('?') ? `${currentPath()}${destination}` : destination;
      if (pathOnly(resolved) !== pathOnly(currentPath())) {
        startNavigationProgress();
      }
    }

    onClick?.(event);
  };

  return (
    <NextLink href={destination} replace={replace} prefetch={resolvedPrefetch} onClick={handleClick} {...rest}>
      {children}
    </NextLink>
  );
}

export function useNavigate() {
  const router = useRouter();
  return useCallback(
    (to: string | number, options?: { replace?: boolean; state?: unknown }) => {
      if (typeof to === 'number') {
        window.history.go(to);
        return;
      }
      if (options?.state) {
        setNavigationState(to, options.state);
      }
      // Query-only navigation is written here rather than pushed to the router,
      // for the same reason the filter pills are (`subscribeToLocation`).
      if (navigateWithinSamePath(to, Boolean(options?.replace))) {
        startNavigationProgress();
        return;
      }
      if (pathOnly(to) !== pathOnly(currentPath())) {
        startNavigationProgress();
      }
      if (options?.replace) router.replace(to);
      else router.push(to);
    },
    [router]
  );
}

export function useLocation() {
  const pathname = usePathname() ?? '/';
  const params = useClientSearchParams();
  const query = params.toString();
  const search = query ? `?${query}` : '';
  // Initialised from memory only, so server and first client render agree; the
  // effect below pulls any persisted state in immediately after mount.
  const [state, setState] = useState<unknown>(() => readNavigationStateSync(pathname));

  useEffect(() => {
    setState(readNavigationState(pathname));
    return () => {
      clearNavigationState(pathname);
    };
  }, [pathname, search]);

  return useMemo(
    () => ({
      pathname,
      search,
      hash: '',
      state,
      key: 'default',
    }),
    [pathname, search, state]
  );
}

export function Navigate({
  to,
  replace,
  state,
}: {
  to: string;
  replace?: boolean;
  state?: unknown;
}) {
  const router = useRouter();
  useEffect(() => {
    if (state) setNavigationState(to, state);
    if (replace) router.replace(to);
    else router.push(to);
  }, [to, replace, state, router]);
  return null;
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>() {
  return useNextParams() as T;
}

type SetSearchParamsArg =
  | URLSearchParams
  | Record<string, string>
  | ((prev: URLSearchParams) => URLSearchParams);

export function useSearchParams(): [
  URLSearchParams,
  (arg: SetSearchParamsArg, options?: SetSearchParamsOptions) => void,
] {
  const router = useRouter();
  const pathname = usePathname() ?? '/';
  const searchParams = useClientSearchParams();

  const setSearchParams = useCallback(
    (arg: SetSearchParamsArg, options?: SetSearchParamsOptions) => {
      const base = new URLSearchParams(searchParams.toString());
      const next =
        typeof arg === 'function'
          ? arg(base)
          : arg instanceof URLSearchParams
            ? arg
            : (() => {
                const merged = new URLSearchParams(base);
                Object.entries(arg).forEach(([key, value]) => {
                  if (value === '' || value == null) merged.delete(key);
                  else merged.set(key, value);
                });
                return merged;
              })();

      const qs = next.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;

      // A tab or filter that only changes the query string — the shape used by
      // /products, /admin/orders, /admin/products, /account and /track — is applied
      // in place, because a router push of a same-pathname URL does not complete in
      // this runtime.
      if (navigateWithinSamePath(url, Boolean(options?.replace))) return;

      if (options?.replace) router.replace(url);
      else router.push(url);
    },
    [pathname, router, searchParams]
  );

  return [searchParams, setSearchParams];
}

export interface RouteProps {
  path?: string;
  element?: ReactNode;
  children?: ReactNode;
}

export function Route(_props: RouteProps): ReactNode {
  return null;
}

export function Routes({ children }: { children?: ReactNode }): ReactNode {
  const pathname = usePathname() || '/';
  const childrenArray = Array.isArray(children) ? children : [children];
  for (const child of childrenArray) {
    if (!child || typeof child !== 'object' || !('props' in child)) continue;
    const props = (child as { props: RouteProps }).props;
    if (!props) continue;
    const routePath = props.path || '';
    if (routePath === '*' || pathname.endsWith(routePath) || pathname === `/admin/${routePath}` || (routePath === '' && pathname === '/admin')) {
      return props.element || null;
    }
  }
  return null;
}

