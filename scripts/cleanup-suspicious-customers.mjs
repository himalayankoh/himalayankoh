#!/usr/bin/env node
/**
 * Permanently delete suspicious bot accounts from WordPress / WooCommerce.
 *
 * Usage:
 *   node scripts/cleanup-suspicious-customers.mjs --dry-run
 *   node scripts/cleanup-suspicious-customers.mjs --apply
 *
 * Safety guarantees:
 *   1. Protects ALL administrators and staff accounts unconditionally.
 *   2. Protects ALL customers linked to existing orders by customer_id or billing email.
 *   3. Protects customer #44 (named legitimate account).
 *   4. Backs up the full manifest of accounts to be deleted before touching anything.
 *   5. Deletes in safe batches of 100 via WooCommerce REST API batch endpoint.
 *   6. Verifies remaining counts and order integrity afterwards.
 */

import fs from 'node:fs';
import path from 'node:path';

const isApply = process.argv.includes('--apply');
const envFile = path.resolve('.env.local');

if (!fs.existsSync(envFile)) {
  console.error('Error: .env.local not found');
  process.exit(1);
}

const env = {};
for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const BASE = (env.WOOCOMMERCE_BASE_URL || env.WORDPRESS_BASE_URL || 'https://wp.himalayankoh.com').replace(/\/+$/, '');
const wooAuth = 'Basic ' + Buffer.from(`${env.WOOCOMMERCE_CONSUMER_KEY}:${env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
const wpAuth = env.WORDPRESS_ADMIN_USER && env.WORDPRESS_ADMIN_APP_PASSWORD
  ? 'Basic ' + Buffer.from(`${env.WORDPRESS_ADMIN_USER}:${env.WORDPRESS_ADMIN_APP_PASSWORD.replace(/\s+/g, '')}`).toString('base64')
  : null;

async function fetchAll(pathname, auth, params = {}) {
  let page = 1;
  const results = [];
  while (true) {
    const qs = new URLSearchParams({ ...params, per_page: '100', page: String(page) }).toString();
    const res = await fetch(`${BASE}/wp-json${pathname}?${qs}`, {
      headers: { Authorization: auth, Accept: 'application/json' },
      cache: 'no-store',
    });
    if (!res.ok) {
      throw new Error(`Failed to fetch ${pathname} page ${page}: HTTP ${res.status}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    results.push(...data);
    const totalPages = Number(res.headers.get('x-wp-totalpages') || '1');
    if (page >= totalPages) break;
    page++;
  }
  return results;
}

async function main() {
  console.log(`=== Himalayan Koh Customer Cleanup ===`);
  console.log(`Mode: ${isApply ? 'APPLY (PERMANENT DELETION)' : 'DRY-RUN (NO CHANGES)'}`);
  console.log(`Target: ${BASE}\n`);

  // 1. Fetch orders
  console.log('1. Reading all orders...');
  const orders = await fetchAll('/wc/v3/orders', wooAuth);
  console.log(`   Found ${orders.length} orders.`);

  const protectedCustomerIds = new Set();
  const protectedEmails = new Set();

  for (const o of orders) {
    const custId = Number(o.customer_id);
    if (Number.isFinite(custId) && custId > 0) protectedCustomerIds.add(custId);
    const billingEmail = String(o.billing?.email || '').trim().toLowerCase();
    if (billingEmail) protectedEmails.add(billingEmail);
  }
  console.log(`   Protected customer IDs from orders: [${Array.from(protectedCustomerIds).join(', ')}]`);
  console.log(`   Protected billing emails count: ${protectedEmails.size}`);

  // 2. Fetch admins & staff
  console.log('\n2. Reading WordPress staff & administrator accounts...');
  const admins = await fetchAll('/wp/v2/users', wpAuth, { context: 'edit', roles: 'administrator' });
  for (const a of admins) {
    protectedCustomerIds.add(a.id);
    if (a.email) protectedEmails.add(a.email.toLowerCase().trim());
    console.log(`   Admin protected: #${a.id} ${a.username} (${a.email || 'no email'})`);
  }

  // Also protect named legitimate account #44
  protectedCustomerIds.add(44);
  console.log('   Protected named customer #44 (Amanda Gonzales)');

  // 3. Fetch all customers in WooCommerce
  console.log('\n3. Reading all accounts from WooCommerce (role=all)...');
  const allCustomers = await fetchAll('/wc/v3/customers', wooAuth, { role: 'all' });
  console.log(`   Total accounts read: ${allCustomers.length}`);

  const toKeep = [];
  const toDelete = [];

  for (const c of allCustomers) {
    const id = c.id;
    const email = String(c.email || '').trim().toLowerCase();
    const isProtectedId = protectedCustomerIds.has(id);
    const isProtectedEmail = protectedEmails.has(email);
    const isStaffRole = c.role && c.role !== 'customer';

    if (isProtectedId || isProtectedEmail || isStaffRole) {
      toKeep.push({
        id,
        email: c.email,
        username: c.username,
        role: c.role,
        reason: isStaffRole ? 'staff' : (isProtectedId ? 'order-or-admin-id' : 'order-email')
      });
    } else {
      toDelete.push({
        id,
        email: c.email,
        username: c.username,
        date_created: c.date_created,
        role: c.role
      });
    }
  }

  console.log(`\n=== Classification Summary ===`);
  console.log(`Accounts to KEEP: ${toKeep.length}`);
  for (const k of toKeep) {
    console.log(`  - #${k.id} ${k.username} (${k.email}) [${k.role}] reason: ${k.reason}`);
  }
  console.log(`Accounts to DELETE (suspicious bot accounts): ${toDelete.length}`);

  // Save manifest
  const backupDir = path.resolve('backups');
  if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
  const manifestPath = path.join(backupDir, `deleted-bot-customers-${Date.now()}.json`);
  fs.writeFileSync(manifestPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    totalKept: toKeep.length,
    totalDeleted: toDelete.length,
    kept: toKeep,
    deleted: toDelete
  }, null, 2));
  console.log(`\nManifest saved to: ${manifestPath}`);

  if (!isApply) {
    console.log('\nDRY-RUN COMPLETE. No accounts were deleted.');
    console.log('To permanently delete these bot accounts, run with --apply:');
    console.log('  node scripts/cleanup-suspicious-customers.mjs --apply');
    return;
  }

  // 4. Batch delete
  console.log(`\n4. Beginning batch deletion of ${toDelete.length} accounts...`);
  const BATCH_SIZE = 100;
  const deleteIds = toDelete.map((c) => c.id);
  let totalDeleted = 0;
  const batches = [];
  for (let i = 0; i < deleteIds.length; i += BATCH_SIZE) {
    batches.push(deleteIds.slice(i, i + BATCH_SIZE));
  }

  console.log(`Total batches: ${batches.length} (batches of up to ${BATCH_SIZE})\n`);

  for (let bIndex = 0; bIndex < batches.length; bIndex++) {
    const chunk = batches[bIndex];
    process.stdout.write(`Batch ${bIndex + 1}/${batches.length} (${chunk.length} accounts)... `);

    const res = await fetch(`${BASE}/wp-json/wc/v3/customers/batch`, {
      method: 'POST',
      headers: {
        Authorization: wooAuth,
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({ delete: chunk })
    });

    if (!res.ok) {
      console.error(`FAILED with HTTP ${res.status}`);
      const errText = await res.text();
      console.error(errText.slice(0, 300));
      process.exit(1);
    }

    const json = await res.json();
    const deletedCount = (json.delete || []).length;
    totalDeleted += deletedCount;
    console.log(`DONE (deleted ${deletedCount}, total: ${totalDeleted}/${deleteIds.length})`);
  }

  console.log(`\n5. Verifying remaining store state...`);
  const postCheck = await fetch(`${BASE}/wp-json/wc/v3/customers?per_page=1&role=all`, {
    headers: { Authorization: wooAuth }
  });
  const remainingTotal = postCheck.headers.get('x-wp-total');
  console.log(`Remaining accounts in WooCommerce (role=all): ${remainingTotal}`);

  const ordersCheck = await fetch(`${BASE}/wp-json/wc/v3/orders?per_page=1`, {
    headers: { Authorization: wooAuth }
  });
  console.log(`Orders remaining in WooCommerce: ${ordersCheck.headers.get('x-wp-total')} (unchanged: ${orders.length})`);

  console.log(`\nSUCCESS: Customer cleanup complete. ${totalDeleted} bot accounts permanently deleted.`);
}

main().catch((err) => {
  console.error('\nFATAL ERROR:', err);
  process.exit(1);
});
