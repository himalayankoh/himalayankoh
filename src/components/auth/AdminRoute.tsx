import { useEffect, useState } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthContext } from '../../context/AuthContext';
import { CUSTOMER_HOME } from '../../lib/auth/roleRouting';
import AdminShellSkeleton from '../admin/AdminShellSkeleton';

interface AdminRouteProps {
  children: React.ReactNode;
}

export default function AdminRoute({ children }: AdminRouteProps) {
  const { isAuthenticated, loading, isAdmin, profileLoading, profileError } = useAuthContext();
  const location = useLocation();

  /**
   * Whether this is a client render rather than the prerendered document.
   *
   * `/admin` is prerendered, and the server has no session, so the document it
   * produced holds whatever the no-identity branch renders. The browser, by
   * contrast, reads the stored session while rendering — so a signed-in admin's
   * first client render already knows who they are and would replace that
   * document with the console on the very first paint. That mismatch is the
   * "old page first, then the dashboard" flash: two different screens, one after
   * the other.
   *
   * Holding the pending state until after mount makes the first client render
   * agree with the document it hydrates, and the swap happens once — skeleton to
   * console — instead of twice.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // A confirmed admin keeps the console, and never waits on a background profile
  // fetch — but only once we are rendering in the browser.
  if (isAdmin && mounted) {
    return <>{children}</>;
  }

  // Pending: either the document's own render, or an unresolved session/role.
  if (!mounted || loading || (isAuthenticated && profileLoading && !isAdmin)) {
    return <AdminShellSkeleton />;
  }

  // `from` travels as a query param, not router state — see ProtectedRoute
  // for why the state-based version is unreliable.
  if (!isAuthenticated) {
    return <Navigate to={`/login?from=${encodeURIComponent(location.pathname)}`} replace />;
  }

  // A confirmed-customer, or anyone whose profile could not be read, is sent to
  // their own account page rather than shown an admin-themed dead end: the
  // console is not a place a customer can be, and telling them so in the
  // console's own visual language was the confusion this replaces. When the
  // profile request itself failed (rather than reporting a non-admin role), the
  // verdict is not trustworthy, so it is surfaced on the account page instead
  // of a redirect loop against a role that was never really read.
  if (!isAdmin) {
    const retry = profileError
      ? `?notice=${encodeURIComponent('admin-role-unconfirmed')}`
      : '';
    return <Navigate to={`${CUSTOMER_HOME}${retry}`} replace />;
  }

  return <>{children}</>;
}
