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
  YoutubeLogo,
  Sparkle,
  TrendUp,
  PaperPlaneRight,
  Stack,
  Robot,
  List,
  Target,
  Cpu,
  CreditCard,
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
} from '@phosphor-icons/react';
import { useAuthContext } from '../../context/AuthContext';
import { signOutOfBrowser } from '../../lib/auth/browserSignOut';
import { useApp } from '@/App';
import { useDialogFocus } from '../../hooks/useDialogFocus';

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
const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { to: '/admin', icon: SquaresFour, label: 'Dashboard', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
    ],
  },
  {
    title: 'LeadOS',
    items: [
      { to: '/admin/leados', icon: Target, label: 'LeadOS Workspace', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/client-outreach', icon: PaperPlaneRight, label: 'Client Outreach', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
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
    title: 'Catalog',
    items: [
      { to: '/admin/products', icon: Package, label: 'Products', g: 'linear-gradient(135deg,#E25726,#B86452)', dot: '#E25726' },
      { to: '/admin/promotions', icon: Tag, label: 'Promotions', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/gift-drop', icon: Gift, label: 'Gift Drop', g: 'linear-gradient(135deg,#C98745,#E25726)', dot: '#C98745' },
      { to: '/admin/campaigns', icon: Megaphone, label: 'Campaigns', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/orders', icon: ShoppingCart, label: 'Orders', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/customers', icon: UsersIcon, label: 'Customers', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/users', icon: UserGear, label: 'Users', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/categories', icon: TreeStructure, label: 'Categories', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
      { to: '/admin/reviews', icon: Star, label: 'Reviews', g: 'linear-gradient(135deg,#C98745,#E25726)', dot: '#C98745' },
      { to: '/admin/blog', icon: FileText, label: 'Blog Posts', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/category-hubs', icon: SquaresFour, label: 'Category Hubs', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/inventory', icon: Stack, label: 'Inventory', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#E25726' },
      { to: '/admin/coupons', icon: Tag, label: 'Coupons', g: 'linear-gradient(135deg,#E25726,#B86452)', dot: '#E25726' },
    ],
  },
  {
    title: 'Media',
    items: [
      { to: '/admin/media', icon: YoutubeLogo, label: 'Media Hub', g: 'linear-gradient(135deg,#C98745,#E25726)', dot: '#C98745' },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { to: '/admin/seo', icon: Sparkle, label: 'SEO Engine', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/marketing', icon: Megaphone, label: 'Marketing Gen', g: 'linear-gradient(135deg,#E25726,#B86452)', dot: '#E25726' },
      { to: '/admin/marketing-traffic', icon: TrendUp, label: 'Marketing & Traffic', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/email-marketing', icon: PaperPlaneRight, label: 'Email Marketing', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/crm', icon: UsersIcon, label: 'CRM (Leads)', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/analytics', icon: TrendUp, label: 'Analytics', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
    ],
  },
  {
    title: 'AI Studio',
    items: [
      { to: '/admin/variant-gen', icon: Stack, label: 'Variant Gen', g: 'linear-gradient(135deg,#3F6550,#C98745)', dot: '#C98745' },
      { to: '/admin/ai', icon: Robot, label: 'AI Hub', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/ai-import', icon: Robot, label: 'AI Import', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
      { to: '/admin/listing-task', icon: List, label: 'Listing Task', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/scout', icon: Target, label: 'Product Scout', g: 'linear-gradient(135deg,#E25726,#B86452)', dot: '#E25726' },
      { to: '/admin/product-research', icon: TrendUp, label: 'Product Research', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
      { to: '/admin/ai-control', icon: Cpu, label: 'AI Control', g: 'linear-gradient(135deg,#3F6550,#2a4435)', dot: '#3F6550' },
      { to: '/admin/ai-intelligence', icon: Sparkle, label: 'AI Intelligence', g: 'linear-gradient(135deg,#B86452,#C98745)', dot: '#B86452' },
    ],
  },
  {
    title: 'System',
    items: [
      { to: '/admin/labels', icon: Truck, label: 'Shipping Labels', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/suppliers', icon: Package, label: 'Suppliers', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/payments', icon: CreditCard, label: 'Payments', g: 'linear-gradient(135deg,#C98745,#9e632b)', dot: '#C98745' },
      { to: '/admin/settings', icon: GearSix, label: 'Settings', g: 'linear-gradient(135deg,#453d36,#2d2722)', dot: '#C98745' },
      { to: '/admin/listing-playbook', icon: BookBookmark, label: 'Listing Playbook', g: 'linear-gradient(135deg,#B86452,#8D4133)', dot: '#B86452' },
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

  const renderSidebar = ({ mobile }: { mobile?: boolean }) => (
    <aside
      className={`flex flex-col shrink-0 ${
        mobile ? 'w-full h-full' : 'w-60 fixed inset-y-0 left-0 z-40 hidden lg:flex'
      }`}
      style={{
        background: '#26211C',
        boxShadow: 'inset -1px 0 0 rgba(224,214,200,0.1)',
      }}
    >
      {/* Brand */}
      <div className="px-3.5 py-4 border-b border-[#E0D6C8]/10 flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-lg overflow-hidden border border-[#E0D6C8]/20 shadow-md bg-[#1f1a16] flex items-center justify-center shrink-0">
          <img
            src="/images/hk_salt_crystal.webp"
            alt="Himalayan Koh"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="leading-tight min-w-0">
          <span className="font-bold text-sm text-[#FAF7F1] tracking-tight block truncate">Himalayan Koh</span>
          <span className="text-[9px] uppercase tracking-[0.2em] text-[#C98745] font-semibold">Admin Console</span>
        </div>
        {mobile && (
          <button
            onClick={() => setMobSide(false)}
            className="ml-auto p-1.5 hover:bg-white/10 rounded-lg text-[#b6aba0] hover:text-[#FAF7F1]"
            aria-label="Close menu"
          >
            <X size={15} />
          </button>
        )}
      </div>

      {/* Nav List */}
      <div className="px-3 py-3"><input aria-label="Find an admin workspace" placeholder="Find a workspace…" value={railQuery} onChange={e => setRailQuery(e.target.value)} className="w-full min-w-0 min-h-10 rounded-lg border border-white/20 bg-white/5 px-3 text-sm text-white placeholder:text-white/60" /></div>
      <nav aria-label="Admin workspaces" className="flex-1 p-2 space-y-4 overflow-y-auto">
        {SECTIONS.map(sec => ({ ...sec, items: sec.items.filter(item => `${sec.title} ${item.label}`.toLowerCase().includes(railQuery.toLowerCase())) })).filter(sec => sec.items.length > 0).map((sec) => (
          <div key={sec.title}>
            <p className="px-2.5 mb-1 text-[9px] font-bold uppercase tracking-[0.18em] text-[#8e8276]">
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
                    className={`group relative flex items-center gap-2.5 px-2.5 py-2 min-h-10 rounded-lg text-[13px] font-medium transition-all duration-200 ${
                      isActive ? 'text-[#FAF7F1]' : 'text-[#b6aba0] hover:text-[#FAF7F1] hover:bg-white/[0.05]'
                    }`}
                    style={
                      isActive
                        ? {
                            background: 'rgba(184,100,82,0.15)',
                            boxShadow: 'inset 0 0 0 1px rgba(184,100,82,0.30)',
                          }
                        : undefined
                    }
                  >
                    {isActive && (
                      <div
                        className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-[#E25726]"
                      />
                    )}
                    <span
                      className={`min-w-[26px] min-h-[26px] w-[26px] h-[26px] rounded-md flex items-center justify-center text-white transition-all duration-200 ${
                        isActive ? 'scale-105' : 'opacity-90 group-hover:scale-105 group-hover:opacity-100'
                      }`}
                      style={{
                        background: isActive ? '#8d4133' : 'rgba(255,255,255,0.07)',
                        boxShadow: 'none',
                      }}
                    >
                      <Icon size={13} weight="bold" />
                    </span>
                    <span className="truncate">{l.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Footer / Store / Logout */}
      <div className="p-2 border-t border-[#E0D6C8]/10 space-y-0.5">
        <Link prefetch={false}
          to="/"
          className="flex items-center gap-2 text-[11px] text-[#b6aba0] hover:text-[#FAF7F1] px-2.5 py-1.5 rounded-lg hover:bg-white/[0.05] transition-colors"
        >
          <span className="w-[26px] h-[26px] rounded-md bg-white/[0.05] flex items-center justify-center text-[#C98745]">
            <ArrowLeft size={12} />
          </span>
          Storefront
        </Link>
        <button
          onClick={handleSignOut}
          className="flex items-center gap-2 text-[11px] text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded-lg hover:bg-red-500/10 w-full transition-colors"
        >
          <span className="w-[26px] h-[26px] rounded-md bg-red-500/10 flex items-center justify-center">
            <SignOut size={12} />
          </span>
          Logout
        </button>
      </div>
    </aside>
  );

  return (
    <div className="hk-admin h-dvh w-full bg-[#FAF7F1] flex overflow-hidden font-sans">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-skip bg-white p-3 rounded-lg">Skip to workspace</a>
      {renderSidebar({})}

      {/* Mobile Drawer */}
      {mobSide && (
        <div className="fixed inset-0 z-modal lg:hidden">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-xs" onClick={() => setMobSide(false)} />
          <div ref={mobileDialog} role="dialog" aria-modal="true" aria-label="Admin navigation" tabIndex={-1} className="absolute left-0 top-0 h-full w-72 max-w-[90vw] shadow-2xl">
            {renderSidebar({ mobile: true })}
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0 lg:pl-60 h-dvh overflow-hidden">
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
                <div className="hidden sm:block text-right leading-tight">
                  <span className="text-xs font-semibold text-[#26211C] block">{adminName}</span>
                  <span className="text-[10px] text-[#8e8276] font-medium">Super Admin</span>
                </div>
                <div
                  className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold shadow-md ring-2 ring-[#E0D6C8] shrink-0"
                  style={{ background: 'linear-gradient(135deg, #B86452, #E25726)' }}
                >
                  {adminInitial}
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
