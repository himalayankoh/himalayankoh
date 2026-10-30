import pg from 'pg';
import { getEnvConfig } from './env.mjs';

/** Every migration file this project has, in order. Add new ones here as
 * they're created — the _hk_migrations tracking table (see below) makes
 * every script that uses this list safe to re-run any number of times. */
export const MIGRATIONS = [
  '001_initial_schema.sql',
  '002_row_level_security.sql',
  '003_storage_buckets.sql',
  '004_auth_profile_roles.sql',
  '005_fix_auth_user_trigger.sql',
  '006_product_images_table.sql',
  '007_category_hub_overrides.sql',
  '008_shippo_shipping.sql',
  '009_hk_migrations_rls.sql',
  '010_guest_checkout_select.sql',
  '011_order_tracking_url.sql',
  '012_product_shipping_weights.sql',
  '013_site_settings.sql',
  '014_contact_submissions.sql',
  '015_add_6lb_trace_mineral_salt_lick.sql',
  '016_add_round_rope_salt_licks.sql',
  // Tags the salt licks inserted by 015/016 with their packing profiles, so it
  // has to follow both of them.
  '017_mark_new_salt_licks_shipping_ready.sql',
  '018_use_white_background_salt_lick_images.sql',
  '020_order_status_packed.sql',
  '022_crm_leads.sql',
  '023_crm_auto_leads.sql',
  '024_restrict_guest_order_select.sql',
  '025_product_packing_profiles.sql',
  '026_rehost_wordpress_images.sql',
  '027_product_images_to_webp.sql',
  '028_packing_profiles_for_remaining_products.sql',
  '029_remove_dealer_wholesale.sql',
  '030_fix_packing_profiles_multi_unit.sql',
  '031_restore_products_public_read_policy.sql',
  '032_fix_signup_role_escalation.sql',
  '033_scope_guest_cart_rls.sql',
  '034_newsletter_subscribers.sql',
  '035_customer_cancel_own_order.sql',
  '036_hermes_evidence_store.sql',
  '037_leados_schema.sql',
  '038_stripe_checkout_sessions.sql',
  '039_stripe_payment_intent_order_idempotency.sql',
  '040_media_videos.sql',
  '041_product_scout_tables.sql',
  '042_crm_leads_extended.sql',
  '043_site_events_analytics.sql',
];

/** Tables every script's health/verification checks care about. */
export const REQUIRED_TABLES = [
  'profiles',
  'categories',
  'products',
  'inventory',
  'orders',
  'order_items',
  'wishlists',
  'notifications',
  'site_settings',
  'contact_submissions',
];

export const REQUIRED_STORAGE_BUCKETS = ['products', 'avatars', 'blog', 'categories'];

export const REQUIRED_EXTENSIONS = ['pgcrypto', 'uuid-ossp'];

/** Connects directly to Postgres via SUPABASE_DB_URL. Returns null if unset. */
export async function connectPg() {
  const { dbUrl } = getEnvConfig();
  if (!dbUrl) return null;
  const client = new pg.Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });
  await client.connect();
  return client;
}

export async function ensureMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public._hk_migrations (
      filename TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
    ALTER TABLE public._hk_migrations ENABLE ROW LEVEL SECURITY;
    REVOKE ALL ON TABLE public._hk_migrations FROM anon, authenticated, PUBLIC;
  `);
}

export async function getAppliedMigrations(client) {
  const { rows } = await client.query('SELECT filename FROM public._hk_migrations ORDER BY applied_at');
  return rows.map((r) => r.filename);
}

export async function getPendingMigrations(client) {
  const applied = new Set(await getAppliedMigrations(client));
  return MIGRATIONS.filter((f) => !applied.has(f));
}
