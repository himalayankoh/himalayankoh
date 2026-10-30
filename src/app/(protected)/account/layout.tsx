'use client';

import CustomerOnlyRoute from '@/components/auth/CustomerOnlyRoute';

/**
 * The customer account portal is for customers. An administrator who reaches
 * `/account` — by bookmark, by typing it, or because an old header link sent
 * them there — is carried to the console, which is where their own account and
 * order management actually live. `CustomerOnlyRoute` owns the rule.
 *
 * A client component like its sibling `orders/layout.tsx`, and for the same
 * reason: this segment guards on an auth context that only exists in the
 * browser. As a server component it made `/account` prerenderable, and the
 * build failed on it — `useAuthContext() from the server`.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  return <CustomerOnlyRoute>{children}</CustomerOnlyRoute>;
}
