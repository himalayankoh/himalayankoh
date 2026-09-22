/**
 * The shape of a session this app owns — WordPress admin or WooCommerce customer.
 *
 * ## Why these types exist
 *
 * Every identity in the app is now minted by one of our own routes and carried in
 * one of our own stores (`services/wordpressAdminAuth.ts`, `lib/auth/customerClient.ts`).
 * The auth context used to type that with Supabase's `User` and `Session`, which
 * meant two things: the *shape* came from a dependency that no longer issued
 * anything, and importing those types as values pulled the Supabase SDK into the
 * client bundle on every route.
 *
 * The field names are deliberately the Supabase ones — `user_metadata`, `access_token`,
 * `expires_at` — because roughly twenty screens read them, and the adapters in
 * `context/AuthContext.tsx` already build exactly this shape. Renaming the fields
 * would be a rename of every consumer for no behaviour change; dropping the
 * *dependency* while keeping the shape is the whole point of this module.
 *
 * Nothing here grants anything. A role is copied from a token the server signed
 * after it checked the credential; these are read-only views of that.
 */

/** The fields consumers actually read off `user.user_metadata`. */
export interface SessionUserMetadata {
  role: 'admin' | 'customer';
  full_name?: string | null;
  username?: string;
  avatar_url?: string | null;
  [key: string]: unknown;
}

/**
 * The signed-in user, as the app presents it.
 *
 * `id` is the identity the rest of the app keys on: the WordPress user id for an
 * admin, the WooCommerce customer id (as a string) for a customer.
 */
export interface SessionUser {
  id: string;
  email: string;
  created_at: string;
  user_metadata: SessionUserMetadata;
  app_metadata: {
    provider: 'wordpress' | 'woocommerce';
    providers: string[];
    role: 'admin' | 'customer';
    [key: string]: unknown;
  };
  /** Anything else the adapter carried over; unused fields are not invented. */
  [key: string]: unknown;
}

/** A signed session: the credential plus the identity it was minted for. */
export interface AuthSession {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  /** Seconds since the epoch, matching the token's own `exp`. */
  expires_at: number;
  expires_in: number;
  user: SessionUser;
}

/** What the sign-up form collects. */
export interface SignUpData {
  email: string;
  password: string;
  fullName?: string;
}

/** What the sign-in form collects. */
export interface SignInData {
  email: string;
  password: string;
}

/** The profile fields the account portal can read and edit. */
export interface EditableProfileFields {
  full_name?: string;
  phone?: string;
  avatar_url?: string;
}
