import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { User, Mail, Phone, Loader2, Shield, Bell, Package, Heart, MapPin, Clock, FileText } from 'lucide-react';
import { SkeletonDashboard } from '../components/ui/Skeleton';
import { useToast } from '../context/ToastContext';
import DashboardSidebar from '../components/account/DashboardSidebar';
import OrdersSection from '../components/account/OrdersSection';
import { useAuthContext } from '../context/AuthContext';
import { addressesApi, notificationsApi, ordersApi } from '../lib/supabase/api';
import { wishlistApi } from '../lib/wishlist/client';
import { supabase, isSupabaseConfigured } from '../lib/supabase/client';
import { signOutOfBrowser } from '../lib/auth/browserSignOut';
import { getCustomerAccessToken } from '../lib/auth/customerClient';
import type { Address, Notification, OrderWithItems } from '../lib/supabase/database.types';

// The account portal is the only customer account screen. `/orders` was a
// second one with its own layout and its own copy of the orders list; it is now
// this portal's first tab and redirects here (see `LEGACY_ACCOUNT_REDIRECTS`).
type TabType = 'orders' | 'dashboard' | 'profile' | 'security' | 'notifications' | 'addresses';

const validTabs: TabType[] = ['orders', 'dashboard', 'profile', 'security', 'notifications', 'addresses'];

/** The tab the portal opens on: the customer's orders, which is why they came. */
const DEFAULT_TAB: TabType = 'orders';

export default function AccountPage() {
  const { profile, updateProfile, user, loading: authLoading, isAdmin } = useAuthContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const tab = searchParams.get('tab') as TabType | null;
    return tab && validTabs.includes(tab) ? tab : DEFAULT_TAB;
  });
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const [orders, setOrders] = useState<OrderWithItems[]>([]);
  const [wishlistCount, setWishlistCount] = useState(0);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [addressForm, setAddressForm] = useState({
    label: '',
    full_name: profile?.full_name || '',
    phone: profile?.phone || '',
    address_line1: '',
    address_line2: '',
    city: '',
    state: '',
    postal_code: '',
    country: 'United States',
  });

  const [formData, setFormData] = useState({
    fullName: profile?.full_name || '',
    phone: profile?.phone || '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleting, setDeleting] = useState(false);

  /**
   * The URL is the tab's source of truth, so a link into the portal opens the
   * section it names.
   *
   * Both this and the initial state above read `DEFAULT_TAB` — they used to
   * each spell out `'dashboard'`, which is why the portal still opened on the
   * summary after the default moved to My Orders: the effect runs on mount and
   * immediately overwrote the state that had just been set correctly.
   */
  useEffect(() => {
    const tab = searchParams.get('tab') as TabType | null;
    setActiveTab(tab && validTabs.includes(tab) ? tab : DEFAULT_TAB);
  }, [searchParams]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user?.id || !isSupabaseConfigured()) {
        setDashboardLoading(false);
        return;
      }

      try {
        const [{ orders }, wishlistCount, notifications, addresses] = await Promise.all([
          ordersApi.getUserOrders(user.id, { limit: 3 }),
          wishlistApi.getWishlistCount(),
          notificationsApi.getNotifications(user.id),
          addressesApi.getUserAddresses(user.id),
        ]);

        setOrders(orders);
        setWishlistCount(wishlistCount);
        setNotifications(notifications);
        setAddresses(addresses);
      } catch (err) {
        console.error('Failed to fetch dashboard data:', err);
      } finally {
        setDashboardLoading(false);
      }
    };

    fetchDashboardData();
  }, [user?.id]);

  useEffect(() => {
    setAddressForm((current) => ({
      ...current,
      full_name: current.full_name || profile?.full_name || '',
      phone: current.phone || profile?.phone || '',
    }));
  }, [profile?.full_name, profile?.phone]);

  const recentActivity = useMemo(() => {
    return [
      ...orders.map((order) => ({
        id: order.id,
        label: `Order ${order.order_number} is ${order.status}`,
        date: order.created_at,
      })),
      ...notifications.slice(0, 3).map((notification) => ({
        id: notification.id,
        label: notification.title,
        date: notification.created_at,
      })),
    ]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 5);
  }, [notifications, orders]);

  const unreadCount = notifications.filter((notification) => !notification.is_read).length;

  const setTab = (tab: TabType) => {
    setActiveTab(tab);
    // The default tab has no query string, so `/account` stays the canonical
    // URL for it rather than growing a `?tab=orders` that means the same thing.
    setSearchParams(tab === DEFAULT_TAB ? ({} as Record<string, string>) : { tab });
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      await updateProfile({
        full_name: formData.fullName,
        phone: formData.phone,
      });
      toast.success('Profile updated successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update profile');
    } finally {
      setSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!passwordData.currentPassword) {
      toast.error('Current password is required');
      return;
    }

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }

    if (passwordData.newPassword.length < 8) {
      toast.error('Password must be at least 8 characters');
      return;
    }

    setSaving(true);

    try {
      const { error: verifyError } = await supabase.auth.signInWithPassword({
        email: user?.email ?? '',
        password: passwordData.currentPassword,
      });

      if (verifyError) {
        toast.error('Current password is incorrect');
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({
        password: passwordData.newPassword,
      });

      if (updateError) throw updateError;

      toast.success('Password updated successfully!');
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  const handleAddressSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;

    setSaving(true);

    try {
      const address = await addressesApi.createAddress(user.id, {
        label: addressForm.label || undefined,
        full_name: addressForm.full_name,
        phone: addressForm.phone || undefined,
        address_line1: addressForm.address_line1,
        address_line2: addressForm.address_line2 || undefined,
        city: addressForm.city,
        state: addressForm.state,
        postal_code: addressForm.postal_code,
        country: addressForm.country,
      });

      setAddresses((current) => [address, ...current]);
      setAddressForm({
        label: '',
        full_name: profile?.full_name || '',
        phone: profile?.phone || '',
        address_line1: '',
        address_line2: '',
        city: '',
        state: '',
        postal_code: '',
        country: 'United States',
      });
      setShowAddressForm(false);
      toast.success('Address saved successfully!');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAddress = async (addressId: string) => {
    try {
      await addressesApi.deleteAddress(addressId);
      setAddresses((current) => current.filter((address) => address.id !== addressId));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete address');
    }
  };

  const handleDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (!deletePassword) {
      toast.error('Enter your current password to continue.');
      return;
    }

    setDeleting(true);
    try {
      // The signed-in shopper's credential is their WooCommerce-keyed session — a
      // Supabase session is no longer what a customer account is.
      const token = getCustomerAccessToken();
      const response = await fetch('/api/account/delete', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ email: user.email, password: deletePassword }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error || 'Unable to delete account.');

      toast.success('Account deleted.');
      // A deleted account must not leave a session behind — same one owner every
      // other sign-out uses, so the admin token goes with the customer one.
      signOutOfBrowser();
      window.location.assign('/');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to delete account.');
      setDeleting(false);
    }
  };

  const handleMarkAsRead = async (notificationId: string) => {
    try {
      await notificationsApi.markAsRead(notificationId);
      setNotifications((current) => current.map((notification) => (
        notification.id === notificationId
          ? { ...notification, is_read: true, read_at: new Date().toISOString() }
          : notification
      )));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update notification');
    }
  };

  const tabs = [
    { id: 'orders' as TabType, label: 'My Orders', icon: Package },
    { id: 'profile' as TabType, label: 'Account Details', icon: User },
    { id: 'addresses' as TabType, label: 'Addresses', icon: MapPin },
    { id: 'security' as TabType, label: 'Password', icon: Shield },
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: FileText },
    { id: 'notifications' as TabType, label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="min-h-screen bg-warm-white">
      {/* Header */}
      <div className="bg-gradient-to-r from-charcoal to-charcoal-light py-12 md:py-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="font-serif text-3xl md:text-4xl font-bold text-white"
          >
            My Account
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-white/70 mt-2"
          >
            Your orders, account details, addresses and password
          </motion.p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 md:py-12">
        <div className="grid lg:grid-cols-4 gap-8">
          <DashboardSidebar profile={profile} user={user} />

          {/* Main Content */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="lg:col-span-3"
          >
            <div className="bg-white rounded-2xl shadow-md p-6 md:p-8">
              <div className="flex flex-wrap gap-2 mb-6">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setTab(tab.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                      activeTab === tab.id
                        ? 'bg-himalayan text-white'
                        : 'bg-gray-50 text-charcoal hover:bg-gray-100'
                    }`}
                  >
                    <tab.icon size={16} />
                    {tab.label}
                  </button>
                ))}
              </div>

              {/* My Orders Tab — the default, and the reason most customers come. */}
              {activeTab === 'orders' && <OrdersSection />}

              {/* Dashboard Tab */}
              {activeTab === 'dashboard' && (
                <div>
                  <h2 className="font-serif text-xl font-bold text-charcoal mb-6">
                    Dashboard Summary
                  </h2>
                  {dashboardLoading ? (
                    <SkeletonDashboard />
                  ) : (
                    <>
                      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                        <SummaryCard icon={<Package size={20} />} label="Recent Orders" value={orders.length} />
                        <SummaryCard icon={<Heart size={20} />} label="Wishlist" value={wishlistCount} />
                        <SummaryCard icon={<Bell size={20} />} label="Unread Alerts" value={unreadCount} />
                        <SummaryCard icon={<MapPin size={20} />} label="Addresses" value={addresses.length} />
                      </div>

                      {isAdmin && (
                        <div className="mb-8 rounded-2xl border border-himalayan/20 bg-himalayan-lighter p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                          <div>
                            <h3 className="font-serif text-lg font-bold text-charcoal">Admin Management</h3>
                            <p className="text-sm text-charcoal-light mt-1">
                              Manage products, orders, customers, blog posts, analytics, and inventory alerts.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Link
                              to="/admin"
                              className="inline-flex items-center justify-center px-4 py-2 bg-charcoal text-white rounded-xl text-sm font-semibold hover:bg-charcoal-light transition-colors"
                            >
                              Open Admin
                            </Link>
                            <Link
                              to="/admin/products?action=new"
                              className="inline-flex items-center justify-center px-4 py-2 bg-himalayan text-white rounded-xl text-sm font-semibold hover:bg-himalayan-dark transition-colors"
                            >
                              Quick Add Product
                            </Link>
                          </div>
                        </div>
                      )}

                      <div className="grid lg:grid-cols-2 gap-6">
                        <div className="bg-gray-50 rounded-2xl p-5">
                          <h3 className="font-semibold text-charcoal mb-4">Orders History</h3>
                          {orders.length === 0 ? (
                            <p className="text-sm text-charcoal-light">No orders yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {orders.map((order) => (
                                <div key={order.id} className="flex items-center justify-between gap-3 bg-white rounded-xl p-3">
                                  <div>
                                    <p className="font-medium text-charcoal text-sm">{order.order_number}</p>
                                    <p className="text-xs text-charcoal-light capitalize">{order.status}</p>
                                  </div>
                                  <span className="font-semibold text-himalayan">${order.total.toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        <div className="bg-gray-50 rounded-2xl p-5">
                          <h3 className="font-semibold text-charcoal mb-4">Recent Activity</h3>
                          {recentActivity.length === 0 ? (
                            <p className="text-sm text-charcoal-light">No recent activity yet.</p>
                          ) : (
                            <div className="space-y-3">
                              {recentActivity.map((activity) => (
                                <div key={activity.id} className="flex gap-3 bg-white rounded-xl p-3">
                                  <Clock size={16} className="text-himalayan mt-0.5 flex-shrink-0" />
                                  <div>
                                    <p className="text-sm font-medium text-charcoal">{activity.label}</p>
                                    <p className="text-xs text-charcoal-light">
                                      {new Date(activity.date).toLocaleDateString()}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <div>
                  <h2 className="font-serif text-xl font-bold text-charcoal mb-6">
                    Profile Information
                  </h2>
                  <form onSubmit={handleProfileSubmit} className="space-y-5">
                    <div className="grid md:grid-cols-2 gap-5">
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">
                          Full Name
                        </label>
                        <div className="relative">
                          <User size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="text"
                            value={formData.fullName}
                            onChange={(e) => setFormData({ ...formData, fullName: e.target.value })}
                            className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                            placeholder="John Doe"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">
                          Email Address
                        </label>
                        <div className="relative">
                          <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                          <input
                            type="email"
                            value={user?.email || ''}
                            disabled
                            className="w-full pl-11 pr-4 py-3 bg-gray-100 border border-gray-200 rounded-xl text-charcoal-light cursor-not-allowed"
                          />
                        </div>
                        <p className="text-xs text-charcoal-light mt-1">
                          Email cannot be changed
                        </p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Phone Number
                      </label>
                      <div className="relative">
                        <Phone size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="tel"
                          value={formData.phone}
                          onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                          className="w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                          placeholder="(123) 456-7890"
                        />
                      </div>
                    </div>

                    <div className="pt-4">
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        type="submit"
                        disabled={saving || authLoading}
                        className="flex items-center justify-center gap-2 px-8 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors disabled:opacity-70"
                      >
                        {saving && <Loader2 size={18} className="animate-spin" />}
                        Save Changes
                      </motion.button>
                    </div>
                  </form>
                </div>
              )}

              {/* Security Tab */}
              {activeTab === 'security' && (
                <div>
                  <h2 className="font-serif text-xl font-bold text-charcoal mb-6">
                    Security Settings
                  </h2>
                  <form onSubmit={handlePasswordSubmit} className="space-y-5 max-w-md">
                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Current Password
                      </label>
                      <input
                        type="password"
                        required
                        value={passwordData.currentPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                        placeholder="••••••••"
                        autoComplete="current-password"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        New Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.newPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                        placeholder="••••••••"
                        minLength={8}
                        autoComplete="new-password"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-charcoal mb-1.5">
                        Confirm New Password
                      </label>
                      <input
                        type="password"
                        value={passwordData.confirmPassword}
                        onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                        className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-himalayan/30 focus:border-himalayan transition-all"
                        placeholder="••••••••"
                        autoComplete="new-password"
                      />
                    </div>

                    <div className="pt-4">
                      <motion.button
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                        type="submit"
                        disabled={saving}
                        className="flex items-center justify-center gap-2 px-8 py-3 bg-himalayan hover:bg-himalayan-dark text-white font-semibold rounded-xl transition-colors disabled:opacity-70"
                      >
                        {saving && <Loader2 size={18} className="animate-spin" />}
                        Update Password
                      </motion.button>
                    </div>
                  </form>

                  <div className="mt-10 pt-10 border-t border-gray-200">
                    <h3 className="font-semibold text-charcoal mb-4">Danger Zone</h3>
                    {deleteConfirm ? (
                      <form onSubmit={handleDeleteAccount} className="max-w-md rounded-2xl border border-red-200 bg-red-50 p-5">
                        <p className="text-sm text-red-700 mb-3">
                          Deleting your account is permanent. Your profile, addresses, cart, and
                          wishlist will be removed. Past orders are kept for our records.
                        </p>
                        <label className="block text-sm font-medium text-charcoal mb-1.5">
                          Current password
                        </label>
                        <input
                          type="password"
                          value={deletePassword}
                          onChange={(e) => setDeletePassword(e.target.value)}
                          autoComplete="current-password"
                          placeholder="Enter your password"
                          className="w-full px-4 py-3 bg-white border border-gray-200 rounded-xl text-charcoal focus:outline-none focus:ring-2 focus:ring-red-300 transition-all"
                        />
                        <div className="flex gap-3 mt-4">
                          <button
                            type="submit"
                            disabled={deleting}
                            className="px-5 py-2.5 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 transition-colors disabled:opacity-60"
                          >
                            {deleting ? 'Deleting…' : 'Permanently delete'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteConfirm(false);
                              setDeletePassword('');
                            }}
                            disabled={deleting}
                            className="px-5 py-2.5 border border-gray-300 text-charcoal rounded-xl text-sm font-semibold hover:bg-gray-50 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="px-6 py-3 border-2 border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors font-medium"
                      >
                        Delete Account
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Notifications Tab */}
              {activeTab === 'notifications' && (
                <div>
                  <h2 className="font-serif text-xl font-bold text-charcoal mb-6">
                    Notifications
                  </h2>
                  <div className="space-y-4">
                    {notifications.length === 0 ? (
                      <div className="text-center py-12 text-charcoal-light">
                        <Bell size={48} className="mx-auto mb-4 opacity-30" />
                        <p>No notifications yet</p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`flex items-start justify-between gap-4 p-4 rounded-xl transition-colors ${
                            notification.is_read ? 'bg-gray-50' : 'bg-himalayan-lighter'
                          }`}
                        >
                          <div>
                            <p className="font-medium text-charcoal">{notification.title}</p>
                            <p className="text-sm text-charcoal-light">{notification.message}</p>
                            <p className="text-xs text-charcoal-light mt-1">
                              {new Date(notification.created_at).toLocaleString()}
                            </p>
                          </div>
                          {!notification.is_read && (
                            <button
                              onClick={() => handleMarkAsRead(notification.id)}
                              className="text-sm font-semibold text-himalayan hover:text-himalayan-dark"
                            >
                              Mark read
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Addresses Tab */}
              {activeTab === 'addresses' && (
                <div>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="font-serif text-xl font-bold text-charcoal">
                      Saved Addresses
                    </h2>
                    <button
                      onClick={() => setShowAddressForm((current) => !current)}
                      className="px-4 py-2 bg-himalayan text-white rounded-lg text-sm font-semibold hover:bg-himalayan-dark transition-colors"
                    >
                      {showAddressForm ? 'Cancel' : 'Add New Address'}
                    </button>
                  </div>
                  {showAddressForm && (
                    <form onSubmit={handleAddressSubmit} className="grid md:grid-cols-2 gap-4 bg-gray-50 rounded-2xl p-5 mb-6">
                      <input value={addressForm.label} onChange={(e) => setAddressForm({ ...addressForm, label: e.target.value })} placeholder="Label (Home, Ranch, Office)" className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30" />
                      <input required value={addressForm.full_name} onChange={(e) => setAddressForm({ ...addressForm, full_name: e.target.value })} placeholder="Full name" className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30" />
                      <input value={addressForm.phone} onChange={(e) => setAddressForm({ ...addressForm, phone: e.target.value })} placeholder="Phone" className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30" />
                      <input required value={addressForm.address_line1} onChange={(e) => setAddressForm({ ...addressForm, address_line1: e.target.value })} placeholder="Address line 1" className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30" />
                      <input value={addressForm.address_line2} onChange={(e) => setAddressForm({ ...addressForm, address_line2: e.target.value })} placeholder="Address line 2" className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30" />
                      <input required value={addressForm.city} onChange={(e) => setAddressForm({ ...addressForm, city: e.target.value })} placeholder="City" className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30" />
                      <input required value={addressForm.state} onChange={(e) => setAddressForm({ ...addressForm, state: e.target.value })} placeholder="State" className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30" />
                      <input required value={addressForm.postal_code} onChange={(e) => setAddressForm({ ...addressForm, postal_code: e.target.value })} placeholder="Postal code" className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30" />
                      <input required value={addressForm.country} onChange={(e) => setAddressForm({ ...addressForm, country: e.target.value })} placeholder="Country" className="px-4 py-3 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-himalayan/30" />
                      <button disabled={saving} className="flex items-center justify-center gap-2 px-4 py-3 bg-himalayan text-white rounded-xl font-semibold hover:bg-himalayan-dark transition-colors disabled:opacity-70">
                        {saving && <Loader2 size={18} className="animate-spin" />}
                        Save Address
                      </button>
                    </form>
                  )}

                  {addresses.length === 0 ? (
                    <div className="text-center py-12 text-charcoal-light">
                      <MapPin size={48} className="mx-auto mb-4 opacity-30" />
                      <p>No saved addresses yet</p>
                      <p className="text-sm mt-1">Add an address for faster checkout</p>
                    </div>
                  ) : (
                    <div className="grid md:grid-cols-2 gap-4">
                      {addresses.map((address) => (
                        <div key={address.id} className="p-5 bg-gray-50 rounded-2xl">
                          <div className="flex items-start justify-between gap-3 mb-3">
                            <div>
                              <p className="font-semibold text-charcoal">{address.label || 'Saved Address'}</p>
                              <p className="text-sm text-charcoal-light">{address.full_name}</p>
                            </div>
                            <button
                              onClick={() => handleDeleteAddress(address.id)}
                              className="text-sm font-semibold text-red-600 hover:text-red-700"
                            >
                              Delete
                            </button>
                          </div>
                          <div className="text-sm text-charcoal-light leading-6">
                            <p>{address.address_line1}</p>
                            {address.address_line2 && <p>{address.address_line2}</p>}
                            <p>{address.city}, {address.state} {address.postal_code}</p>
                            <p>{address.country}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="bg-gray-50 rounded-2xl p-5">
      <div className="w-10 h-10 rounded-xl bg-himalayan-lighter text-himalayan flex items-center justify-center mb-3">
        {icon}
      </div>
      <p className="text-2xl font-bold text-charcoal">{value}</p>
      <p className="text-sm text-charcoal-light">{label}</p>
    </div>
  );
}
