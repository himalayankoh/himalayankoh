import { Navigate, useLocation } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthContext } from '../../context/AuthContext';
import { ADMIN_HOME } from '../../lib/auth/roleRouting';

/**
 * The customer account area (`/account`, `/orders/*`, `/wishlist`) — an
 * administrator manages the store in the console, not as a shopper.
 *
 * The role lookup itself lives in `roleRouting`, which owns every role →
 * destination decision; this component only supplies the route context. An
 * admin who lands on an order detail page is carried to the console's order
 * console with that order selected, because that is the same order they were
 * asking about — anything else would just discard the destination.
 */
export default function CustomerOnlyRoute({ children }: { children: React.ReactNode }) {
  const { isAdmin, loading, profileLoading } = useAuthContext();
  const location = useLocation();

  // Role is unknown until the profile row (or the session's role claim)
  // resolves. Rendering the customer area in the meantime is the leak this
  // exists to prevent; redirecting on an unknown role would bounce a legitimate
  // customer. So wait — visibly, not as a blank page.
  if (loading || profileLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-warm-white">
        <Loader2 size={36} className="animate-spin text-himalayan" />
      </div>
    );
  }

  if (isAdmin) {
    const orderIdMatch = location.pathname.match(/^\/orders\/([^/]+)$/);
    const target = orderIdMatch
      ? `${ADMIN_HOME}/orders?orderId=${encodeURIComponent(orderIdMatch[1])}`
      : ADMIN_HOME;

    return <Navigate to={target} replace />;
  }

  return <>{children}</>;
}
