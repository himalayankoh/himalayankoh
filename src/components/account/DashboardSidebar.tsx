import { Link, useLocation } from 'react-router-dom';
import { Heart, LayoutDashboard, MapPin, Package, Shield, User, BarChart3, ShoppingBag, Truck } from 'lucide-react';
import type { Profile } from '../../lib/supabase/database.types';
import type { SessionUser } from '../../lib/auth/sessionShape';

/**
 * Customer nav — every entry is a tab of the one account portal (`/account`).
 * `/orders` no longer has its own screen; it redirects into the portal's My
 * Orders tab, so this list aims at the canonical route only.
 */
const customerNavItems = [
  { label: 'My Orders', path: '/account?tab=orders', icon: Package },
  { label: 'Account Details', path: '/account?tab=profile', icon: User },
  { label: 'Addresses', path: '/account?tab=addresses', icon: MapPin },
  { label: 'Password', path: '/account?tab=security', icon: Shield },
  { label: 'Dashboard', path: '/account?tab=dashboard', icon: LayoutDashboard },
  { label: 'Track a Package', path: '/track', icon: Truck },
  { label: 'Wishlist', path: '/wishlist', icon: Heart },
];

/** Admin nav — the console owns these, so nothing here points at a customer page. */
const adminNavItems = [
  { label: 'Admin Dashboard', path: '/admin', icon: BarChart3 },
  { label: 'Manage Store Orders', path: '/admin/orders', icon: ShoppingBag },
  { label: 'Track Order Lookup', path: '/track', icon: Truck },
  { label: 'Store Settings', path: '/admin/settings', icon: Shield },
];

interface DashboardSidebarProps {
  profile: Profile | null;
  user: SessionUser | null;
}

export default function DashboardSidebar({ profile, user }: DashboardSidebarProps) {
  const location = useLocation();
  const currentPath = `${location.pathname}${location.search}`;
  const isAdmin = profile?.role === 'admin';
  const navItems = isAdmin ? adminNavItems : customerNavItems;

  return (
    <div className="lg:col-span-1">
      <div className="bg-white rounded-2xl p-6 shadow-md mb-6">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-himalayan-lighter flex items-center justify-center overflow-hidden">
            {profile?.avatar_url ? (
              <img
                src={profile.avatar_url}
                alt={profile.full_name || 'User'}
                className="w-full h-full rounded-full object-cover"
              />
            ) : (
              <User size={24} className="text-himalayan" />
            )}
          </div>
          <div className="min-w-0">
            <h3 className="font-semibold text-charcoal truncate">
              {profile?.full_name || (isAdmin ? 'Administrator' : 'Customer')}
            </h3>
            <p className="text-sm text-charcoal-light truncate">{user?.email}</p>
            <span className="inline-block mt-1 px-2 py-0.5 bg-himalayan-lighter text-himalayan text-xs font-medium rounded-full capitalize">
              {profile?.role || 'customer'}
            </span>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          <p className="font-semibold">Administrator account</p>
          <p className="mt-1 text-amber-900/90">
            Customer orders, labels, and payments are managed under{' '}
            <Link to="/admin/orders" className="font-semibold text-himalayan hover:underline">
              Manage Store Orders
            </Link>
            .
          </p>
        </div>
      )}

      <nav className="bg-white rounded-2xl p-3 shadow-md space-y-1">
        {navItems.map((item) => {
          const isActive =
            // The portal's own tab, so `/account` with no tab highlights My
            // Orders — the tab it opens on — rather than nothing.
            (item.path === '/account?tab=orders' &&
              (location.pathname === '/account' ? location.search === '' || location.search === '?tab=orders' : location.pathname.startsWith('/orders/'))) ||
            currentPath === item.path ||
            (item.path === '/admin/orders' && location.pathname.startsWith('/admin/orders'));

          return (
            <Link
              key={item.path}
              to={item.path}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-colors ${
                isActive ? 'bg-himalayan text-white' : 'text-charcoal hover:bg-gray-50'
              }`}
            >
              <item.icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
