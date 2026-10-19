'use client';

import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  SquaresFour,
  Package,
  Tag,
  ShoppingCart,
  Users as UsersIcon,
  FileText,
  TrendUp,
  Target,
  GearSix,
  Truck,
  ArrowLeft,
  SignOut,
  MagnifyingGlass,
  ShieldCheck,
  Plus,
  X,
  CaretDown,
  SidebarSimple,
  List,
  EnvelopeSimple,
  Bell,
  Sun,
  Moon,
  Desktop,
  DeviceMobile,
} from '@phosphor-icons/react';
import { useAuthContext } from '../../context/AuthContext';
import { signOutOfBrowser } from '../../lib/auth/browserSignOut';
import { useApp } from '@/App';
import { useDialogFocus } from '../../hooks/useDialogFocus';
import {
  RAIL_DEFAULT_WIDTH,
  RAIL_MAX_WIDTH,
  RAIL_MIN_WIDTH,
  RAIL_WIDTH_STEP,
  clampRailWidth,
  isMiniRail,
  loadRailWidth,
  saveRailWidth,
} from './railWidth';

export interface AdminLayoutProps {
  children: ReactNode;
}

type NavIcon = React.ComponentType<Record<string, unknown>>;
type SubNavItem = { to: string; label: string };
type NavItem = {
  to: string;
  icon: NavIcon;
  label: string;
  g: string;
  dot: string;
  subItems?: SubNavItem[];
};

/**
 * Restricted Himalayan Koh Brand Palette for Admin Rail
 * - Rose: #B86452 -> #8D4133
 * - Salt Orange: #E25726 -> #B86452
 * - Forest: #3F6550 -> #2a4435
 * - Gold / Bronze: #C98745 -> #9e632b
 * - Neutral Slate: #453d36 -> #2d2722
 *
 * Simplified 11-item primary navigation with compact secondary sub-items.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    to: '/admin',
    icon: SquaresFour,
    label: 'Dashboard',
    g: 'linear-gradient(145deg,#DB9479,#A05246)',
    dot: '#B86452',
  },
  {
    to: '/admin/leados',
    icon: Target,
    label: 'LeadOS',
    g: 'linear-gradient(145deg,#67A596,#326C62)',
    dot: '#3F6550',
  },
  {
    to: '/admin/inbox',
    icon: EnvelopeSimple,
    label: 'Email Inbox',
    g: 'linear-gradient(145deg,#D8B070,#AD783C)',
    dot: '#C98745',
  },
  {
    to: '/admin/products',
    icon: Package,
    label: 'Products',
    g: 'linear-gradient(145deg,#DD9866,#AA5D3E)',
    dot: '#E25726',
    subItems: [
      { to: '/admin/categories', label: 'Categories' },
      { to: '/admin/inventory', label: 'Inventory' },
      { to: '/admin/promotions', label: 'Promotions' },
      { to: '/admin/reviews', label: 'Reviews' },
    ],
  },
  {
    to: '/admin/orders',
    icon: ShoppingCart,
    label: 'Orders',
    g: 'linear-gradient(145deg,#67A596,#326C62)',
    dot: '#3F6550',
    subItems: [
      { to: '/admin/labels', label: 'Shipping Labels' },
    ],
  },
  {
    to: '/admin/customers',
    icon: UsersIcon,
    label: 'Customers',
    g: 'linear-gradient(145deg,#8395AB,#4C627E)',
    dot: '#C98745',
  },
  {
    to: '/admin/wholesale',
    icon: Truck,
    label: 'Wholesale',
    g: 'linear-gradient(145deg,#8AA38F,#526F68)',
    dot: '#C98745',
  },
  {
    to: '/admin/blog',
    icon: FileText,
    label: 'Content',
    g: 'linear-gradient(145deg,#DB9479,#A05246)',
    dot: '#B86452',
    subItems: [
      { to: '/admin/media', label: 'Media Library' },
    ],
  },
  {
    to: '/admin/coupons',
    icon: Tag,
    label: 'Coupons',
    g: 'linear-gradient(145deg,#DD9866,#AA5D3E)',
    dot: '#E25726',
  },
  {
    to: '/admin/analytics',
    icon: TrendUp,
    label: 'Analytics',
    g: 'linear-gradient(145deg,#C9A366,#977039)',
    dot: '#C98745',
    subItems: [
      { to: '/admin/sales', label: 'Sales & Profit' },
      { to: '/admin/marketing-traffic', label: 'Marketing & Traffic' },
    ],
  },
  {
    to: '/admin/settings',
    icon: GearSix,
    label: 'Settings',
    g: 'linear-gradient(145deg,#8395AB,#4C627E)',
    dot: '#C98745',
    subItems: [
      { to: '/admin/users', label: 'Users & Permissions' },
      { to: '/admin/suppliers', label: 'Suppliers' },
      { to: '/admin/payments', label: 'Payments' },
    ],
  },
];

const MOBILE_NAV: { key: string; label: string; to?: string; icon: NavIcon }[] = [
  { key: 'home', label: 'Dashboard', to: '/admin', icon: SquaresFour },
  { key: 'leados', label: 'LeadOS', to: '/admin/leados', icon: Target },
  { key: 'inbox', label: 'Inbox', to: '/admin/inbox', icon: EnvelopeSimple },
  { key: 'orders', label: 'Orders', to: '/admin/orders', icon: ShoppingCart },
  { key: 'more', label: 'More', icon: List },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, profile } = useAuthContext();
  const { user: appUser } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobSide, setMobSide] = useState(false);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});
  // Default to the full rail on the server (there is no storage to consult)
  // and apply the remembered width right after mount, so the first paint is
  // deterministic and nothing hydration-relevant depends on the browser.
  const [railWidth, setRailWidth] = useState<number>(() => loadRailWidth(null));
  const railWidthRef = useRef(railWidth);
  const [railDragging, setRailDragging] = useState(false);
  const railDragRef = useRef<{ x: number; width: number } | null>(null);
  /** Where the header toggle re-expands to — the last width that showed labels. */
  const lastExpandedRef = useRef(RAIL_DEFAULT_WIDTH);
  useEffect(() => {
    let stored = RAIL_DEFAULT_WIDTH;
    try {
      stored = loadRailWidth(window.localStorage);
    } catch {
      // Private mode / blocked storage: keep the default rail.
    }
    railWidthRef.current = stored;
    lastExpandedRef.current = isMiniRail(stored) ? RAIL_DEFAULT_WIDTH : stored;
    setRailWidth(stored);
  }, []);
  // Icons-only is a property of the width, so there is no second setting to
  // keep in step with it.
  const railMini = isMiniRail(railWidth);

  const applyRailWidth = (next: number, persist: boolean) => {
    const clamped = clampRailWidth(next);
    railWidthRef.current = clamped;
    setRailWidth(clamped);
    if (!persist) return;
    try {
      saveRailWidth(clamped, window.localStorage);
    } catch {
      // A preference that cannot be stored still applies for this session.
    }
  };

  /** One button, two states: hide the labels, or bring them back. */
  const toggleRail = () => {
    const width = railWidthRef.current;
    if (isMiniRail(width)) {
      applyRailWidth(lastExpandedRef.current, true);
    } else {
      lastExpandedRef.current = width;
      applyRailWidth(RAIL_MIN_WIDTH, true);
    }
  };

  const resetRailWidth = () => {
    railDragRef.current = null;
    setRailDragging(false);
    applyRailWidth(RAIL_DEFAULT_WIDTH, true);
  };

  /** Drag the right edge of the rail; the pointer's travel *is* the new width. */
  const onRailResizeStart = (event: React.MouseEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    railDragRef.current = { x: event.clientX, width: railWidthRef.current };
    setRailDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const onMove = (move: MouseEvent) => {
      const start = railDragRef.current;
      if (!start) return;
      // Written on every move but persisted only on release, so a drag is one
      // choice rather than eighty localStorage writes.
      applyRailWidth(start.width + (move.clientX - start.x), false);
    };
    const onEnd = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      railDragRef.current = null;
      setRailDragging(false);
      applyRailWidth(railWidthRef.current, true);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
  };

  const onRailResizeKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    const step = event.shiftKey ? RAIL_WIDTH_STEP * 4 : RAIL_WIDTH_STEP;
    const width = railWidthRef.current;
    if (event.key === 'ArrowLeft') applyRailWidth(width - step, true);
    else if (event.key === 'ArrowRight') applyRailWidth(width + step, true);
    else if (event.key === 'Home') applyRailWidth(RAIL_MIN_WIDTH, true);
    else if (event.key === 'End') applyRailWidth(RAIL_MAX_WIDTH, true);
    else if (event.key === 'Enter' || event.key === ' ') toggleRail();
    else return;
    event.preventDefault();
  };

  const [searchVal, setSearchVal] = useState('');
  const [railQuery, setRailQuery] = useState('');
  useEffect(() => {
    const desktop = window.matchMedia('(min-width: 1024px)');
    const closeOnDesktop = () => { if (desktop.matches) setMobSide(false); };
    desktop.addEventListener('change', closeOnDesktop);
    return () => desktop.removeEventListener('change', closeOnDesktop);
  }, []);
  const mobileDialog = useDialogFocus(mobSide, () => setMobSide(false));
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const onKey = (event: KeyboardEvent) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchRef.current?.focus(); } if (event.key === 'Escape') setUserMenuOpen(false); }; document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey); }, []);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMobSide(false);
    setUserMenuOpen(false);
  }, [location.pathname]);

  // Click outside listener for user dropdown menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  // --- THEME SUPPORT (Light, Dark, System) ---
  const [theme, setTheme] = useState<'light' | 'dark' | 'system'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('hk_admin_theme');
        if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
      } catch {}
    }
    return 'system';
  });

  const [effectiveDark, setEffectiveDark] = useState<boolean>(false);

  useEffect(() => {
    const updateDark = () => {
      if (theme === 'dark') {
        setEffectiveDark(true);
      } else if (theme === 'light') {
        setEffectiveDark(false);
      } else {
        setEffectiveDark(window.matchMedia('(prefers-color-scheme: dark)').matches);
      }
    };

    updateDark();

    if (theme === 'system') {
      const mql = window.matchMedia('(prefers-color-scheme: dark)');
      mql.addEventListener('change', updateDark);
      return () => mql.removeEventListener('change', updateDark);
    }
  }, [theme]);

  const handleThemeChange = (newTheme: 'light' | 'dark' | 'system') => {
    setTheme(newTheme);
    try {
      localStorage.setItem('hk_admin_theme', newTheme);
    } catch {}
  };

  // --- PWA SERVICE WORKER & INSTALLATION ---
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [canInstall, setCanInstall] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!document.querySelector('link[rel="manifest"]')) {
      const link = document.createElement('link');
      link.rel = 'manifest';
      link.href = '/admin-manifest.json';
      document.head.appendChild(link);
    }

    if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
      navigator.serviceWorker.register('/sw-admin.js', { scope: '/admin' }).catch(() => {});
    }

    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone;
    setIsInstalled(Boolean(isStandalone));

    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setCanInstall(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);
    return () => window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setCanInstall(false);
    }
    setDeferredPrompt(null);
  };

  // --- NOTIFICATION CENTER ---
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const [pushStatus, setPushStatus] = useState<'default' | 'granted' | 'denied'>('default');

  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setPushStatus(Notification.permission);
    }
  }, []);

  // The centre used to seed three invented "notifications" ("Storefront
  // Operations Active", "Business Mailboxes Ready", …). They were never events:
  // nothing produced them, nothing could mark them delivered, and they read as
  // live operational activity. The list is empty until a real server event
  // exists; Web Push subscription and dispatch are not implemented yet, so
  // saying so is the honest state.
  const [notifications, setNotifications] = useState<Array<{
    id: string;
    category: 'orders' | 'inbox' | 'leados' | 'system';
    title: string;
    body: string;
    timestamp: string;
    read: boolean;
    link: string;
  }>>([]);

  const unreadNotifCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    if (notifOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [notifOpen]);

  const handleRequestPush = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    try {
      const res = await Notification.requestPermission();
      setPushStatus(res);
      if (res === 'granted' && 'serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.ready;
        reg.showNotification('Himalayan Koh Notifications Enabled', {
          body: 'You will receive real-time alerts for new orders and inquiries.',
          icon: '/logo.svg',
          badge: '/logo.svg',
        });
      }
    } catch (err) {
      console.error('Push notification permission error:', err);
    }
  };

  const handleSignOut = () => {
    // One owner for ending a session (`lib/auth/browserSignOut`), and it runs
    // before the navigation. Clearing only the Supabase keys used to leave the
    // admin token behind, so `/login` restored the session and sent the admin
    // straight back into the console.
    signOutOfBrowser();
    window.location.assign('/login');
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchVal.trim();
    if (!q) return;
    navigate(`/admin/products?search=${encodeURIComponent(q)}`);
  };

  // Priority: saved profile from localStorage ('hk_admin_profile'), then profile, appUser, user metadata, default 'Salman Bashir'
  let savedName = '';
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem('hk_admin_profile');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed?.name) savedName = parsed.name;
      }
    } catch {}
  }

  const candidateProfileName = profile?.full_name?.trim();
  const validProfileName = (candidateProfileName && candidateProfileName !== 'Himalayan Koh Super Admin')
    ? candidateProfileName
    : '';

  const adminName =
    savedName ||
    validProfileName ||
    appUser?.name ||
    user?.user_metadata?.full_name ||
    'Salman Bashir';
  const adminEmail = user?.email || appUser?.email || 'admin@himalayankoh.com';
  const adminInitial = String(adminName).charAt(0).toUpperCase() || 'S';

  const renderSidebar = ({ mobile, mini }: { mobile?: boolean; mini?: boolean }) => (
    <aside
      className={`admin-rail flex flex-col shrink-0 ${
        mobile
          ? 'w-full h-full'
          : `fixed inset-y-0 left-0 z-40 hidden lg:flex w-[var(--hk-rail)] ${
              railDragging ? '' : 'transition-[width] duration-200'
            }`
      }`}
    >
      {/* Brand */}
      <div className={`py-4 border-b border-white/15 flex items-center gap-2.5 ${mini ? 'justify-center px-2' : 'px-3.5'}`}>
        <div className="w-10 h-10 rounded-xl overflow-hidden border border-white/50 shadow-md bg-[#FFFDF8] flex items-center justify-center shrink-0">
          <img
            src="/images/hk_salt_crystal.webp"
            alt="Himalayan Koh"
            className="w-full h-full object-cover"
          />
        </div>
        <div className={`leading-tight min-w-0 ${mini ? 'sr-only' : ''}`}>
          <span className="font-semibold text-sm text-white tracking-tight block truncate">Himalayan Koh</span>
          <span className="text-[9px] uppercase tracking-[0.18em] text-[#FFF0E6] font-semibold">Admin Console</span>
        </div>
        {mobile && (
          <button
            onClick={() => setMobSide(false)}
            className="ml-auto p-2 hover:bg-white/15 rounded-lg text-white"
            aria-label="Close menu"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Nav List */}
      {/* The workspace filter needs its label to make sense, so the mini rail
          drops it instead of showing a mystery input. */}
      {!mini && <div className="px-3 py-3"><form role="search" aria-label="Filter admin workspaces" autoComplete="off" onSubmit={event => event.preventDefault()} className="admin-rail-search flex items-center gap-2 rounded-xl px-3"><MagnifyingGlass size={15} className="shrink-0" aria-hidden="true" /><input type="search" autoComplete="off" aria-label="Find an admin workspace" placeholder="Find a workspace…" value={railQuery} onChange={e => setRailQuery(e.target.value)} className="w-full min-w-0 min-h-10 bg-transparent text-xs text-white placeholder:text-[#F5DED5] outline-none" /></form></div>}
      <nav aria-label="Admin workspaces" className="admin-rail-nav flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV_ITEMS.filter((item) => {
          const q = railQuery.trim().toLowerCase();
          if (!q) return true;
          if (item.label.toLowerCase().includes(q)) return true;
          return Boolean(item.subItems?.some((sub) => sub.label.toLowerCase().includes(q)));
        }).map((l) => {
          const isDirectActive =
            location.pathname === l.to ||
            (l.to !== '/admin' && location.pathname.startsWith(`${l.to}/`));
          const hasActiveChild = Boolean(
            l.subItems?.some(
              (sub) => location.pathname === sub.to || location.pathname.startsWith(`${sub.to}/`),
            ),
          );
          const isActive = isDirectActive || hasActiveChild;
          const hasSubItems = Boolean(l.subItems && l.subItems.length > 0);
          const isExpanded =
            hasSubItems &&
            !mini &&
            (expandedGroups[l.to] !== undefined
              ? expandedGroups[l.to]
              : isActive || Boolean(railQuery.trim()));
          const Icon = l.icon;
          const q = railQuery.trim().toLowerCase();
          const visibleSubItems = l.subItems?.filter((sub) =>
            !q || l.label.toLowerCase().includes(q) ? true : sub.label.toLowerCase().includes(q),
          );

          return (
            <div key={l.to} className="space-y-0.5">
              <div className="relative flex items-center">
                <Link
                  prefetch={false}
                  to={l.to}
                  aria-current={isDirectActive ? 'page' : undefined}
                  title={l.label}
                  className={`admin-rail-link group relative flex flex-1 min-w-0 items-center gap-2.5 px-2.5 py-2 min-h-10 rounded-xl text-[13px] font-medium transition-colors duration-150 ${
                    mini ? 'justify-center px-1.5' : hasSubItems ? 'pr-8' : ''
                  } ${
                    isActive ? 'admin-rail-link-active' : 'text-[#FFF3EB] hover:text-white'
                  }`}
                >
                  {isActive && (
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#FFD8A9]" />
                  )}
                  <span
                    className="admin-rail-icon w-8 h-8 shrink-0 rounded-[10px] flex items-center justify-center text-white"
                    style={{
                      background: l.g,
                    }}
                  >
                    <Icon size={17} weight="duotone" />
                  </span>
                  <span className={mini ? 'sr-only' : 'truncate'}>{l.label}</span>
                </Link>
                {hasSubItems && !mini && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setExpandedGroups((prev) => ({
                        ...prev,
                        [l.to]: !isExpanded,
                      }));
                    }}
                    aria-expanded={isExpanded}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${l.label} submenu`}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-[#F5DED5] hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <CaretDown
                      size={12}
                      weight="bold"
                      className={`transition-transform duration-150 ${isExpanded ? 'rotate-180' : ''}`}
                    />
                  </button>
                )}
              </div>

              {isExpanded && visibleSubItems && visibleSubItems.length > 0 && (
                <div className="ml-6 pl-3 border-l border-white/15 space-y-0.5 py-0.5">
                  {visibleSubItems.map((sub) => {
                    const isSubActive =
                      location.pathname === sub.to || location.pathname.startsWith(`${sub.to}/`);
                    return (
                      <Link
                        prefetch={false}
                        key={sub.to}
                        to={sub.to}
                        aria-current={isSubActive ? 'page' : undefined}
                        className={`block px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors truncate ${
                          isSubActive
                            ? 'bg-white/15 text-white font-semibold'
                            : 'text-[#F5DED5] hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {sub.label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer / Store / Logout */}
      <div className="p-2 border-t border-white/15 bg-black/5 space-y-0.5">
        <Link prefetch={false}
          to="/"
          title="Storefront"
          className={`flex items-center gap-2 text-xs text-[#FFF3EB] hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors ${mini ? 'justify-center px-1.5' : ''}`}
        >
          <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center text-[#FFE1BA]">
            <ArrowLeft size={12} />
          </span>
          <span className={mini ? 'sr-only' : ''}>Storefront</span>
        </Link>
        <button
          onClick={handleSignOut}
          title="Logout"
          className={`flex items-center gap-2 text-xs text-[#FFE1D9] hover:text-white px-2.5 py-1.5 rounded-lg hover:bg-white/10 w-full transition-colors ${mini ? 'justify-center px-1.5' : ''}`}
        >
          <span className="w-8 h-8 rounded-lg bg-white/10 flex items-center justify-center">
            <SignOut size={12} />
          </span>
          <span className={mini ? 'sr-only' : ''}>Logout</span>
        </button>
      </div>

      {/* Drag handle on the rail's right edge. Keyboard-reachable on purpose:
          a divider that only responds to a mouse is not a control. */}
      {!mobile && (
        <span
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize the admin menu. Drag, or use the left and right arrow keys."
          aria-valuenow={railWidth}
          aria-valuemin={RAIL_MIN_WIDTH}
          aria-valuemax={RAIL_MAX_WIDTH}
          tabIndex={0}
          title="Drag to resize the menu · double-click to reset"
          onMouseDown={onRailResizeStart}
          onDoubleClick={resetRailWidth}
          onKeyDown={onRailResizeKeyDown}
          className="group/resize absolute inset-y-0 right-0 z-10 w-2 cursor-col-resize focus-visible:outline-none"
        >
          {/* Hairline at rest so the edge looks grabbable, solid while hovered
              or focused so the target is obvious under the pointer. */}
          <span className="pointer-events-none absolute inset-y-0 right-0 w-px bg-white/20 transition-colors group-hover/resize:bg-[#FFD8A9] group-focus-visible/resize:bg-[#FFD8A9]" />
          <span className="pointer-events-none absolute right-0 top-1/2 h-10 w-[3px] -translate-y-1/2 rounded-l-full bg-[#C98745] opacity-0 transition-opacity group-hover/resize:opacity-90 group-focus-visible/resize:opacity-90" />
        </span>
      )}
    </aside>
  );

  // The rail's width lives on the layout root as a CSS variable, so the fixed
  // rail and the content's left padding can never disagree about how much room
  // the menu is taking.
  const railVars = { '--hk-rail': `${railWidth}px` } as unknown as React.CSSProperties;

  return (
    <div
      className="hk-admin h-dvh w-full flex overflow-hidden font-sans"
      style={railVars}
      data-admin-theme={effectiveDark ? 'dark' : 'light'}
    >
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-skip bg-white p-3 rounded-lg">Skip to workspace</a>
      {renderSidebar({ mini: railMini })}

      {/* Mobile Drawer */}
      {mobSide && (
        <div className="fixed inset-0 z-modal lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobSide(false)} />
          <div ref={mobileDialog} role="dialog" aria-modal="true" aria-label="Admin navigation" tabIndex={-1} className="absolute left-0 top-0 h-full w-72 max-w-[90vw] shadow-2xl">
            {renderSidebar({ mobile: true, mini: false })}
          </div>
        </div>
      )}

      <div
        className={`flex-1 flex flex-col min-w-0 lg:pl-[var(--hk-rail)] h-dvh overflow-hidden ${
          railDragging ? '' : 'lg:transition-[padding-left] lg:duration-200'
        }`}
      >
        {/* Header */}
        <header className="admin-topbar h-16 shrink-0 flex items-center justify-between gap-3 px-4 lg:px-6 z-30">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setMobSide(true)}
              className="lg:hidden p-1.5 hover:bg-[#FAF7F1] rounded-lg text-[#26211C]"
              aria-label="Open sidebar"
            >
              <List size={18} />
            </button>
            {/* One toggle, next to the rail it controls: hide the menu down to
                its icons so the workspace gets the width, and bring it back
                with a second press. The rail's own edge drags to any width in
                between. */}
            <button
              type="button"
              onClick={toggleRail}
              aria-pressed={railMini}
              title={railMini ? 'Expand the menu' : 'Collapse the menu to icons'}
              className="hidden lg:flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-[#6D6258] hover:text-[#26211C] hover:bg-[#FAF7F1] transition-colors"
            >
              <SidebarSimple size={16} weight="bold" />
              <span className="sr-only">Toggle the admin menu</span>
            </button>
            <form
              onSubmit={handleSearch}
              className="hidden md:flex items-center gap-2 bg-white/80 border border-admin-line rounded-xl px-3 py-2 w-64 shadow-xs focus-within:ring-2 focus-within:ring-[#B86452]/25 focus-within:border-[#B86452]"
            >
              <MagnifyingGlass size={13} className="text-[#6D6258] shrink-0" />
              <input
                type="search"
                autoComplete="off"
                value={searchVal}
                onChange={(e) => setSearchVal(e.target.value)}
                ref={searchRef} aria-label="Search admin products" placeholder="Search products…"
                className="bg-transparent text-xs outline-none w-full placeholder:text-[#6D6258] text-[#26211C]"
              />
              <span className="text-[9px] text-[#6D6258] border border-[#E0D6C8] bg-white rounded px-1 py-px font-medium">
                ⌘K
              </span>
            </form>
          </div>

          <div className="flex items-center gap-2.5">
            <span className="hidden sm:flex items-center gap-1.5 text-[10px] font-medium text-[#3F6550] bg-[#3F6550]/10 border border-[#3F6550]/20 rounded-full px-2.5 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#3F6550]" />
              Admin
            </span>
            <button
              className="relative p-2 hover:bg-[#FAF7F1] rounded-lg text-[#3F6550] hover:text-[#26211C] transition-colors"
              aria-label="Store settings" onClick={() => navigate('/admin/settings')} title="Store settings"
            >
              <ShieldCheck size={16} />
              <span
                className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-[#C98745]"
              />
            </button>

            {/* Notification Center Bell */}
            <div className="relative" ref={notifRef}>
              <button
                type="button"
                onClick={() => setNotifOpen((v) => !v)}
                className="relative p-2 hover:bg-[#FAF7F1] rounded-lg text-[#3F6550] hover:text-[#26211C] transition-colors focus:outline-none"
                aria-label="Notification center"
                title="Notifications"
              >
                <Bell size={16} weight={unreadNotifCount > 0 ? 'fill' : 'regular'} />
                {unreadNotifCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[#B86452] ring-2 ring-white animate-pulse" />
                )}
              </button>

              {notifOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-80 max-w-[90vw] bg-[#FFFDF8] border border-[#E0D6C8] rounded-xl shadow-2xl z-50 overflow-hidden"
                  style={{
                    boxShadow: '0 12px 32px -4px rgba(38, 33, 28, 0.18), 0 4px 12px -2px rgba(38, 33, 28, 0.08)',
                  }}
                >
                  <div className="p-3 bg-[#FAF7F1] border-b border-[#E0D6C8] flex items-center justify-between">
                    <span className="text-xs font-bold text-[#26211C] uppercase tracking-wider">
                      Notification Center
                    </span>
                    {unreadNotifCount > 0 && (
                      <button
                        onClick={() => setNotifications((list) => list.map((n) => ({ ...n, read: true })))}
                        className="text-[10px] font-semibold text-[#B86452] hover:underline"
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  {pushStatus !== 'granted' && (
                    <div className="p-2.5 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between gap-2 text-xs text-amber-900">
                      <span className="text-[11px] font-medium leading-tight">
                        Device alerts only — server push is not configured yet
                      </span>
                      <button
                        onClick={handleRequestPush}
                        className="px-2 py-1 rounded bg-[#B86452] text-white text-[10px] font-semibold hover:bg-[#8D4133] shrink-0"
                      >
                        Test
                      </button>
                    </div>
                  )}

                  <div className="max-h-64 overflow-y-auto divide-y divide-[#E0D6C8]/60">
                    {notifications.length === 0 && (
                      <div className="p-4 text-center">
                        <p className="text-xs font-semibold text-[#26211C]">No notifications yet</p>
                        <p className="mt-1 text-[11px] leading-relaxed text-[#6D6258]">
                          Order, inbox and LeadOS alerts appear here once the server is configured to
                          deliver them. Nothing is being simulated, and no push subscription exists yet.
                        </p>
                        <div className="mt-2 flex items-center justify-center gap-2 text-[11px] font-semibold">
                          <Link to="/admin/orders" onClick={() => setNotifOpen(false)} className="text-[#B86452] hover:underline">
                            Open Orders
                          </Link>
                          <span className="text-[#E0D6C8]">·</span>
                          <Link to="/admin/inbox" onClick={() => setNotifOpen(false)} className="text-[#B86452] hover:underline">
                            Open Inbox
                          </Link>
                        </div>
                      </div>
                    )}
                    {notifications.map((n) => (
                      <Link
                        key={n.id}
                        to={n.link}
                        onClick={() => {
                          setNotifications((list) => list.map((item) => (item.id === n.id ? { ...item, read: true } : item)));
                          setNotifOpen(false);
                        }}
                        className={`block p-3 hover:bg-[#FAF7F1] transition-colors ${!n.read ? 'bg-[#FAF7F1]/60' : ''}`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#B86452]">
                            {n.category}
                          </span>
                          <span className="text-[10px] text-[#8e8276]">{n.timestamp}</span>
                        </div>
                        <p className="text-xs font-semibold text-[#26211C] mt-0.5">{n.title}</p>
                        <p className="text-[11px] text-[#6D6258] mt-0.5 line-clamp-2">{n.body}</p>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="relative pl-1.5 border-l border-[#E0D6C8]" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setUserMenuOpen((v) => !v)}
                className="flex items-center gap-2 p-1 rounded-lg hover:bg-[#FAF7F1] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#B86452]/20"
                aria-expanded={userMenuOpen}
                aria-haspopup="true"
                aria-label="Admin account menu"
              >
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-md ring-2 ring-[#E0D6C8] shrink-0"
                  style={{ background: 'linear-gradient(135deg, #B86452, #E25726)' }}
                >
                  {adminInitial}
                </div>
                {/* Avatar first, then the name stack: both lines start on the
                    same left edge and sit on one baseline, and a long name
                    truncates instead of shoving the caret off the edge. */}
                <div className="hidden sm:flex flex-col items-start leading-tight min-w-0">
                  <span className="text-xs font-semibold text-[#26211C] truncate max-w-[11rem]">{adminName}</span>
                  <span className="text-[10px] text-[#8e8276] font-medium">Super Admin</span>
                </div>
                <CaretDown
                  size={12}
                  weight="bold"
                  className={`text-[#6D6258] transition-transform duration-200 hidden sm:block ${
                    userMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {userMenuOpen && (
                <div
                  className="absolute right-0 top-full mt-2 w-64 bg-[#FFFDF8] border border-[#E0D6C8] rounded-xl shadow-2xl z-50 overflow-hidden"
                  style={{
                    boxShadow: '0 12px 32px -4px rgba(38, 33, 28, 0.18), 0 4px 12px -2px rgba(38, 33, 28, 0.08)',
                  }}
                  role="menu"
                >
                  {/* Account Header */}
                  <div className="p-3 bg-[#FAF7F1] border-b border-[#E0D6C8]">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-sm shrink-0"
                        style={{ background: 'linear-gradient(135deg, #B86452, #E25726)' }}
                      >
                        {adminInitial}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-[#26211C] truncate">{adminName}</p>
                        <p className="text-[11px] text-[#6D6258] truncate">{adminEmail}</p>
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between pt-2 border-t border-[#E0D6C8]/60">
                      <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-[#3F6550] bg-[#3F6550]/10 border border-[#3F6550]/20 rounded-full px-2.5 py-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#3F6550]" />
                        Super Admin
                      </span>
                      <span className="text-[10px] font-medium text-[#8e8276]">Himalayan Koh</span>
                    </div>
                  </div>

                  {/* Quick Navigation Links */}
                  <div className="p-1.5 space-y-0.5">
                    <Link prefetch={false}
                      to="/admin/users"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-[#26211C] hover:bg-[#FAF7F1] transition-colors group"
                    >
                      <span className="w-7 h-7 rounded-md bg-[#3F6550]/10 text-[#3F6550] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <UsersIcon size={14} weight="bold" />
                      </span>
                      <div className="leading-tight">
                        <span className="block font-semibold">Manage Team & Users</span>
                        <span className="text-[10px] text-[#8e8276]">View all users & roles</span>
                      </div>
                    </Link>

                    <Link prefetch={false}
                      to="/admin/settings"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-[#26211C] hover:bg-[#FAF7F1] transition-colors group"
                    >
                      <span className="w-7 h-7 rounded-md bg-[#C98745]/10 text-[#C98745] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <GearSix size={14} weight="bold" />
                      </span>
                      <div className="leading-tight">
                        <span className="block font-semibold">Store Settings</span>
                        <span className="text-[10px] text-[#8e8276]">Profile, AI & integrations</span>
                      </div>
                    </Link>

                    <Link prefetch={false}
                      to="/"
                      onClick={() => setUserMenuOpen(false)}
                      className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-[#26211C] hover:bg-[#FAF7F1] transition-colors group"
                    >
                      <span className="w-7 h-7 rounded-md bg-[#B86452]/10 text-[#B86452] flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <ArrowLeft size={14} weight="bold" />
                      </span>
                      <div className="leading-tight">
                        <span className="block font-semibold">Storefront</span>
                        <span className="text-[10px] text-[#8e8276]">Open customer website</span>
                      </div>
                    </Link>
                  </div>

                  {/* Theme Mode Selector */}
                  <div className="p-2 border-t border-[#E0D6C8] bg-[#FAF7F1]/50">
                    <p className="text-[10px] font-bold text-[#6D6258] uppercase tracking-wider mb-1.5 px-1">
                      Theme Appearance
                    </p>
                    <div className="grid grid-cols-3 gap-1 bg-[#E0D6C8]/40 p-0.5 rounded-lg text-[11px] font-medium text-center">
                      <button
                        type="button"
                        onClick={() => handleThemeChange('light')}
                        className={`flex items-center justify-center gap-1 py-1 rounded-md transition-colors ${
                          theme === 'light' ? 'bg-white text-[#26211C] font-semibold shadow-xs' : 'text-[#6D6258] hover:text-[#26211C]'
                        }`}
                      >
                        <Sun size={12} weight={theme === 'light' ? 'bold' : 'regular'} /> Light
                      </button>
                      <button
                        type="button"
                        onClick={() => handleThemeChange('dark')}
                        className={`flex items-center justify-center gap-1 py-1 rounded-md transition-colors ${
                          theme === 'dark' ? 'bg-slate-900 text-white font-semibold shadow-xs' : 'text-[#6D6258] hover:text-[#26211C]'
                        }`}
                      >
                        <Moon size={12} weight={theme === 'dark' ? 'bold' : 'regular'} /> Dark
                      </button>
                      <button
                        type="button"
                        onClick={() => handleThemeChange('system')}
                        className={`flex items-center justify-center gap-1 py-1 rounded-md transition-colors ${
                          theme === 'system' ? 'bg-white text-[#26211C] font-semibold shadow-xs' : 'text-[#6D6258] hover:text-[#26211C]'
                        }`}
                      >
                        <Desktop size={12} weight={theme === 'system' ? 'bold' : 'regular'} /> Auto
                      </button>
                    </div>
                  </div>

                  {/* PWA Install Button */}
                  {canInstall && (
                    <div className="p-1.5 border-t border-[#E0D6C8] bg-[#FFFDF8]">
                      <button
                        type="button"
                        onClick={() => {
                          setUserMenuOpen(false);
                          handleInstallClick();
                        }}
                        className="w-full flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-semibold text-[#B86452] hover:bg-[#FAF7F1] transition-colors"
                      >
                        <DeviceMobile size={15} weight="bold" />
                        <span>Install HK Admin App</span>
                      </button>
                    </div>
                  )}

                  {/* Logout / Sign Out Button */}
                  <div className="p-1.5 border-t border-[#E0D6C8] bg-[#FFFDF8]">
                    <button
                      type="button"
                      onClick={() => {
                        setUserMenuOpen(false);
                        handleSignOut();
                      }}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold text-rose-600 hover:text-rose-700 hover:bg-rose-50 transition-colors text-left group cursor-pointer"
                    >
                      <span className="w-7 h-7 rounded-md bg-rose-100 text-rose-600 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                        <SignOut size={14} weight="bold" />
                      </span>
                      <div className="leading-tight">
                        <span className="block font-semibold">Sign Out / Logout</span>
                        <span className="text-[10px] text-rose-500/80">End current admin session</span>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content Canvas */}
        <main
          id="main-content"
          tabIndex={-1} className="admin-content flex-1 overflow-y-auto min-w-0 p-3 pb-24 lg:p-5"
        >
          {children}
        </main>

        {/* Mobile quick navigation */}
        <nav
          className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-[#FFFDF8]/95 backdrop-blur border-t border-[#E0D6C8] shadow-[0_-4px_20px_rgba(38,33,28,0.08)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
          aria-label="Admin quick navigation"
        >
          <div className="grid grid-cols-5 max-w-lg mx-auto">
            {MOBILE_NAV.map((it) => {
              if (it.key === 'more') {
                return (
                  <button
                    key="more"
                    type="button"
                    onClick={() => setMobSide(true)}
                    className="flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] font-medium text-[#6D6258] hover:text-[#26211C] min-h-[52px]"
                  >
                    <span className="p-1.5">
                      <List size={20} />
                    </span>
                    More
                  </button>
                );
              }
              const on =
                it.key === 'home'
                  ? location.pathname === '/admin'
                  : it.key === 'leados'
                  ? location.pathname.startsWith('/admin/leados')
                  : it.key === 'inbox'
                  ? location.pathname.startsWith('/admin/inbox')
                  : it.key === 'orders'
                  ? location.pathname.startsWith('/admin/orders')
                  : false;
              const Icon = it.icon;
              return (
                <Link prefetch={false}
                  key={it.key}
                  to={it.to || '/admin'}
                  className={`flex flex-col items-center justify-center gap-0.5 py-2 text-[10px] min-h-[52px] ${
                    on ? 'text-[#B86452] font-semibold' : 'text-[#6D6258] font-medium hover:text-[#26211C]'
                  }`}
                >
                  <span className={`px-3 py-1 rounded-xl ${on ? 'bg-[#B86452]/10 text-[#B86452]' : ''}`}>
                    <Icon size={20} weight={on ? 'bold' : 'regular'} />
                  </span>
                  {it.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
