'use client';

import React, { useState, useEffect, useRef, ReactNode } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  SquaresFour,
  Package,
  Tag,
  Gift,
  Megaphone,
  ShoppingCart,
  Users as UsersIcon,
  UserGear,
  TreeStructure,
  Star,
  FileText,
  Sparkle,
  TrendUp,
  PaperPlaneRight,
  Stack,
  Robot,
  List,
  Target,
  Cpu,
  CreditCard,
  CurrencyDollar,
  GearSix,
  BookBookmark,
  Truck,
  ArrowLeft,
  SignOut,
  MagnifyingGlass,
  ShieldCheck,
  Plus,
  X,
  CaretDown,
  SidebarSimple,
  Images,
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
type NavItem = { to: string; icon: NavIcon; label: string; g: string; dot: string };

/**
 * Restricted Himalayan Koh Brand Palette for Admin Rail
 * - Rose: #B86452 -> #8D4133
 * - Salt Orange: #E25726 -> #B86452
 * - Forest: #3F6550 -> #2a4435
 * - Gold / Bronze: #C98745 -> #9e632b
 * - Neutral Slate: #453d36 -> #2d2722
 */
/**
 * The rail, grouped the way the shop is actually run.
 *
 * "Catalog" used to be one drawer holding thirteen unrelated things — products,
 * promotions, gift drops, campaigns, the order book, staff, coupons — so nothing
 * in it was findable by thinking about what you wanted to do. Each block below
 * answers one question instead:
 *
 *   Overview   how is the shop doing
 *   Catalog    what we sell, and what has been bought: products, orders, the
 *              people who bought, the people who work here, reviews, stock
 *   Wholesale  the B2B side, on its own
 *   Marketing  demand: LeadOS and outreach, SEO, channels, CRM, analytics
 *   Promotions the offer machinery, on its own rail
 *   Research   what to sell next: scouting, product research, intel
 *   AI Studio  the tooling that turns research into listings
 *   Media      the files
 *   System     running the store: shipping, suppliers, payment, settings
 */
const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', icon: SquaresFour, label: 'Dashboard', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/sales', icon: CurrencyDollar, label: 'Sales & Profit', g: 'linear-gradient(135deg,#3F6550,#238636)', dot: '#3fb950' },
    ],
  },
  {
    title: 'Catalog',
    items: [
      { to: '/admin/products', icon: Package, label: 'Products', g: 'linear-gradient(135deg,#E25726,#B86452)', dot: '#E25726' },
      { to: '/admin/orders', icon: ShoppingCart, label: 'Orders', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/customers', icon: UsersIcon, label: 'Customers', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/users', icon: UserGear, label: 'Users', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/reviews', icon: Star, label: 'Reviews', g: 'linear-gradient(135deg,#C98745,#E25726)', dot: '#C98745' },
      { to: '/admin/inventory', icon: Stack, label: 'Inventory', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#E25726' },
      { to: '/admin/categories', icon: TreeStructure, label: 'Categories', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
      { to: '/admin/category-hubs', icon: SquaresFour, label: 'Category Hubs', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/blog', icon: FileText, label: 'Blog Posts', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
    ],
  },
  {
    title: 'Wholesale',
    // One rail entry for the whole B2B side. Its fourteen views live inside the
    // workspace's own tab set rather than as a second block of rail items — the
    // retail catalogue keeps the rail it already had.
    items: [
      { to: '/admin/wholesale', icon: Truck, label: 'Wholesale', g: 'linear-gradient(135deg,#3F6550,#C98745)', dot: '#C98745' },
    ],
  },
  {
    title: 'Marketing',
    // LeadOS moved in here: outreach is marketing, and it was sitting above the
    // wholesale section as if it were a separate business.
    items: [
      { to: '/admin/leados', icon: Target, label: 'LeadOS Workspace', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/client-outreach', icon: PaperPlaneRight, label: 'Client Outreach', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
      { to: '/admin/seo', icon: Sparkle, label: 'SEO Engine', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/marketing', icon: Megaphone, label: 'Marketing Gen', g: 'linear-gradient(135deg,#E25726,#B86452)', dot: '#E25726' },
      { to: '/admin/marketing-traffic', icon: TrendUp, label: 'Marketing & Traffic', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/email-marketing', icon: PaperPlaneRight, label: 'Email Marketing', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/crm', icon: UsersIcon, label: 'CRM (Leads)', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/analytics', icon: TrendUp, label: 'Analytics', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
    ],
  },
  {
    title: 'Promotions',
    // Its own rail: everything that changes what a customer pays belongs together,
    // and none of it belongs in the product catalogue.
    items: [
      { to: '/admin/promotions', icon: Tag, label: 'Promotions', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/coupons', icon: Tag, label: 'Coupons', g: 'linear-gradient(135deg,#E25726,#B86452)', dot: '#E25726' },
      { to: '/admin/gift-drop', icon: Gift, label: 'Gift Drop', g: 'linear-gradient(135deg,#C98745,#E25726)', dot: '#C98745' },
      { to: '/admin/campaigns', icon: Megaphone, label: 'Campaigns', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
    ],
  },
  {
    title: 'Research',
    // What to sell next — pulled out of AI Studio, where it was buried under the
    // tools that build a listing rather than the work that decides one.
    items: [
      { to: '/admin/scout', icon: Target, label: 'Product Scout', g: 'linear-gradient(135deg,#E25726,#B86452)', dot: '#E25726' },
      { to: '/admin/product-research', icon: TrendUp, label: 'Product Research', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
      { to: '/admin/ai-intelligence', icon: Sparkle, label: 'AI Intelligence', g: 'linear-gradient(135deg,#B86452,#C98745)', dot: '#B86452' },
    ],
  },
  {
    title: 'AI Studio',
    items: [
      { to: '/admin/variant-gen', icon: Stack, label: 'Variant Gen', g: 'linear-gradient(135deg,#3F6550,#C98745)', dot: '#C98745' },
      { to: '/admin/ai', icon: Robot, label: 'AI Hub', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/ai-import', icon: Robot, label: 'AI Import', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/listing-task', icon: List, label: 'Listing Task', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/ai-control', icon: Cpu, label: 'AI Control', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
    ],
  },
  {
    title: 'Media',
    items: [
      { to: '/admin/media', icon: Images, label: 'Media Library', g: 'linear-gradient(135deg,#C98745,#E25726)', dot: '#C98745' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/labels', icon: Truck, label: 'Shipping Labels', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/suppliers', icon: Package, label: 'Suppliers', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/payments', icon: CreditCard, label: 'Payments', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
      { to: '/admin/listing-playbook', icon: BookBookmark, label: 'Listing Playbook', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/settings', icon: GearSix, label: 'Settings', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
    ],
  },
];

const MOBILE_NAV: { key: string; label: string; to?: string; icon: NavIcon }[] = [
  { key: 'home', label: 'Home', to: '/admin', icon: SquaresFour },
  { key: 'products', label: 'Listings', to: '/admin/products', icon: Package },
  { key: 'add', label: 'Add', to: '/admin/products/new', icon: Plus },
  { key: 'orders', label: 'Orders', to: '/admin/orders', icon: ShoppingCart },
  { key: 'more', label: 'More', icon: List },
];

export default function AdminLayout({ children }: AdminLayoutProps) {
  const { user, profile } = useAuthContext();
  const { user: appUser } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobSide, setMobSide] = useState(false);
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
      className={`flex flex-col shrink-0 ${
        mobile
          ? 'w-full h-full'
          : `fixed inset-y-0 left-0 z-40 hidden lg:flex w-[var(--hk-rail)] ${
              railDragging ? '' : 'transition-[width] duration-200'
            }`
      }`}
      style={{
        background: '#FAF0EB',
        boxShadow: 'inset -1px 0 0 #E8D3CA',
      }}
    >
      {/* Brand */}
      <div className={`py-4 border-b border-[#E8D3CA] flex items-center gap-2.5 ${mini ? 'justify-center px-2' : 'px-3.5'}`}>
        <div className="w-9 h-9 rounded-lg overflow-hidden border border-[#E8D3CA] shadow-md bg-[#FFFDF8] flex items-center justify-center shrink-0">
          <img
            src="/images/hk_salt_crystal.webp"
            alt="Himalayan Koh"
            className="w-full h-full object-cover"
          />
        </div>
        <div className={`leading-tight min-w-0 ${mini ? 'sr-only' : ''}`}>
          <span className="font-bold text-sm text-[#26211C] tracking-tight block truncate">Himalayan Koh</span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-[#8D4133] font-semibold">Admin Console</span>
        </div>
        {mobile && (
          <button
            onClick={() => setMobSide(false)}
            className="ml-auto p-1.5 hover:bg-[#F3E4DE] rounded-lg text-[#6D6258] hover:text-[#26211C]"
            aria-label="Close menu"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Nav List */}
      {/* The workspace filter needs its label to make sense, so the mini rail
          drops it instead of showing a mystery input. */}
      {!mini && <div className="px-3 py-3"><input aria-label="Find an admin workspace" placeholder="Find a workspace…" value={railQuery} onChange={e => setRailQuery(e.target.value)} className="w-full min-w-0 min-h-10 rounded-lg border border-[#E8D3CA] bg-[#FFFDF8] px-3 text-sm text-[#26211C] placeholder:text-[#6D6258]" /></div>}
      <nav aria-label="Admin workspaces" className="flex-1 p-2 space-y-4 overflow-y-auto">
        {SECTIONS.map(sec => ({ ...sec, items: sec.items.filter(item => `${sec.title} ${item.label}`.toLowerCase().includes(railQuery.toLowerCase())) })).filter(sec => sec.items.length > 0).map((sec) => (
          <div key={sec.title}>
            <p className={`px-2.5 mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#6D6258] ${mini ? 'sr-only' : ''}`}>
              {sec.title}
            </p>
            <div className="space-y-0.5">
              {sec.items.map((l) => {
                const isActive =
                  location.pathname === l.to ||
                  (l.to !== '/admin' && location.pathname.startsWith(`${l.to}/`));
                const Icon = l.icon;
                return (
                  <Link prefetch={false}
                    key={l.to}
                    to={l.to}
                    aria-current={isActive ? 'page' : undefined}
                    title={l.label}
                    className={`group relative flex items-center gap-2.5 px-2.5 py-2 min-h-10 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                      mini ? 'justify-center px-1.5' : ''
                    } ${
                      isActive ? 'text-[#8D4133]' : 'text-[#6D6258] hover:text-[#26211C] hover:bg-[#F3E4DE]'
                    }`}
                    style={
                      isActive
                        ? {
                            background: '#F3E4DE',
                            boxShadow: 'inset 0 0 0 1px #D7AFA0',
                          }
                        : undefined
                    }
                  >
                    {isActive && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#B86452]"
                      />
                    )}
                    <span
                      className={`min-w-[26px] min-h-[26px] w-[26px] h-[26px] rounded-md flex items-center justify-center text-white transition-all duration-200 ${
                        isActive ? 'scale-105' : 'opacity-90 group-hover:scale-105 group-hover:opacity-100'
                      }`}
                      style={{
                        background: isActive ? '#8D4133' : `${l.dot}18`,
                        color: isActive ? '#FFFFFF' : l.dot,
                        boxShadow: 'none',
                      }}
                    >
                      <Icon size={13} weight="bold" />
                    </span>
                    {/* Kept in the tree (sr-only) in the mini rail so the link
                        keeps a readable name for screen readers and tooltips. */}
                    <span className={mini ? 'sr-only' : 'truncate'}>{l.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / Store / Logout */}
      <div className="p-2 border-t border-[#E8D3CA] space-y-0.5">
        <Link prefetch={false}
          to="/"
          title="Storefront"
          className={`flex items-center gap-2 text-[11px] text-[#6D6258] hover:text-[#26211C] px-2.5 py-1.5 rounded-lg hover:bg-[#F3E4DE] transition-colors ${mini ? 'justify-center px-1.5' : ''}`}
        >
          <span className="w-[26px] h-[26px] rounded-md bg-[#F3E4DE] flex items-center justify-center text-[#8D4133]">
            <ArrowLeft size={12} />
          </span>
          <span className={mini ? 'sr-only' : ''}>Storefront</span>
        </Link>
        <button
          onClick={handleSignOut}
          title="Logout"
          className={`flex items-center gap-2 text-[11px] text-red-700 hover:text-red-800 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 w-full transition-colors ${mini ? 'justify-center px-1.5' : ''}`}
        >
          <span className="w-[26px] h-[26px] rounded-md bg-red-500/10 flex items-center justify-center">
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
          <span className="pointer-events-none absolute inset-y-0 right-0 w-px bg-[#E8D3CA] transition-colors group-hover/resize:bg-[#C98745] group-focus-visible/resize:bg-[#C98745]" />
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
    <div className="hk-admin h-dvh w-full bg-[#FAF7F1] flex overflow-hidden font-sans" style={railVars}>
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
        <header className="h-14 shrink-0 bg-[#FFFDF8]/95 backdrop-blur-md border-b border-[#E0D6C8] flex items-center justify-between gap-3 px-4 lg:px-6 z-30">
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
              className="hidden md:flex items-center gap-2 bg-[#FAF7F1] border border-[#E0D6C8] rounded-lg px-3 py-1.5 w-64 focus-within:ring-2 focus-within:ring-[#B86452]/25 focus-within:border-[#B86452]"
            >
              <MagnifyingGlass size={13} className="text-[#6D6258] shrink-0" />
              <input
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
          style={{ background: '#FAF7F1' }}
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
                  : it.key === 'products'
                  ? location.pathname.startsWith('/admin/products') && !location.pathname.startsWith('/admin/products/new')
                  : it.key === 'add'
                  ? location.pathname.startsWith('/admin/products/new')
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
