import { loadEnv, missingRequiredVars } from './lib/env.mjs';
import { createClients } from './lib/supabaseClients.mjs';

loadEnv();

// Bump this whenever the shape of seeded demo data changes (new accounts,
// new demo orders/documents, etc.) — `npm run info` reports it so it's
// obvious which seed shape a given environment was last set up with.
export const SEED_VERSION = '1.1.0';

// This app's schema only distinguishes profiles.role = 'customer' | 'admin'
// (see supabase/migrations/004_auth_profile_roles.sql). There is no
// super_admin/manager/sales_rep enum value — Manager and Sales
// Representative below are seeded as role='admin' with a descriptive
// full_name, since that is the only role that actually grants elevated
// access in this codebase (AdminRoute checks profile.role === 'admin'
// only).
const demoAccounts = [
  {
    email: 'admin@himalayankoh.com',
    password: 'Admin@123',
    role: 'admin',
    fullName: 'Salman Bashir',
    phone: '(832) 224-6466',
  },
  {
    email: 'manager@himalayankoh.com',
    password: 'Manager@123',
    role: 'admin',
    fullName: 'Himalayan Koh Manager',
    phone: '(832) 224-6466',
  },
  {
    email: 'sales@himalayankoh.com',
    password: 'Sales@123',
    role: 'admin',
    fullName: 'Himalayan Koh Sales Representative',
    phone: '(832) 224-6466',
  },
  {
    email: 'customer@himalayankoh.com',
    password: 'Customer@123',
    role: 'customer',
    fullName: 'Demo Customer',
    phone: '(832) 224-6466',
  },
];

// =====================================================================

/**
 * Resolve Supabase env vars and build the admin (service role) + anon
 * clients used for seeding. Returns null (and prints exactly which
 * variable is missing) instead of throwing, so callers like setup.mjs
 * can decide how to react.
 */
export function createSeedClients() {
  const missing = missingRequiredVars();
  if (missing.length > 0) {
    console.error('Missing required environment variable(s):');
    for (const name of missing) console.error(`  - ${name}`);
    return null;
  }
  return createClients();
}

/**
 * Seeds every demo account and its demo data. Idempotent — safe to run
 * any number of times (upsert throughout, never inserts duplicates).
 * Returns a structured summary so callers can report exactly what
 * happened rather than assuming success.
 */
export async function seedAll({ adminClient, anonClient }) {
  const summary = {
    accounts: [],
    customer: { orders: 0, wishlist: 0, notifications: 0 },
  };

  const seededUsers = {};
  for (const account of demoAccounts) {
    const user = await upsertAuthUser(adminClient, account);
    await upsertProfile(adminClient, user.id, account);
    await verifyLogin(anonClient, account);
    seededUsers[account.email] = user;
    summary.accounts.push({ email: account.email, role: account.role });
  }
  console.log('Demo authentication accounts are ready.');

  const customerResult = await seedCustomerDemoData(adminClient, seededUsers['customer@himalayankoh.com']);
  summary.customer = customerResult;

  return summary;
}

async function seedCustomerDemoData(adminClient, user) {
  const result = { orders: 0, wishlist: 0, notifications: 0 };
  if (!user) return result;

  const { data: products, error: productsError } = await adminClient
    .from('products')
    .select('id, name, price, thumbnail, images')
    .eq('is_active', true)
    .limit(6);

  if (productsError) throw productsError;
  if (!products || products.length === 0) {
    console.warn('No active products found — skipping customer demo data.');
    return result;
  }

  for (const product of products.slice(0, 3)) {
    await adminClient
      .from('wishlists')
      .upsert({ user_id: user.id, product_id: product.id }, { onConflict: 'user_id,product_id' });
  }
  result.wishlist = Math.min(3, products.length);
  console.log('Seeded demo customer wishlist.');

  const shippingAddress = {
    fullName: 'Demo Customer',
    address_line1: '12620 FM 1960 W Ste A-4',
    city: 'Houston',
    state: 'Texas',
    postal_code: '77065',
    country: 'United States',
  };

  const demoOrders = [
    { status: 'delivered', paymentStatus: 'paid', daysAgo: 30 },
    { status: 'shipped', paymentStatus: 'paid', daysAgo: 5 },
  ];

  for (let orderIndex = 0; orderIndex < demoOrders.length; orderIndex += 1) {
    const demoOrder = demoOrders[orderIndex];
    const items = products.slice(orderIndex, orderIndex + 2);
    const quantity = 1;
    const unitPrices = items.map((p) => p.price);
    const subtotal = unitPrices.reduce((sum, price) => sum + price * quantity, 0);
    const shippingCost = subtotal >= 50 ? 0 : 9.95;
    const total = subtotal + shippingCost;
    const createdAt = new Date(Date.now() - demoOrder.daysAgo * 24 * 60 * 60 * 1000).toISOString();

    const { data: order, error: orderError } = await adminClient
      .from('orders')
      .insert({
        user_id: user.id,
        email: 'customer@himalayankoh.com',
        status: demoOrder.status,
        payment_status: demoOrder.paymentStatus,
        subtotal,
        shipping_cost: shippingCost,
        tax_amount: 0,
        discount_amount: 0,
        total,
        shipping_address: shippingAddress,
        billing_address: shippingAddress,
        notes: 'Demo customer order (seeded for testing).',
        created_at: createdAt,
        updated_at: createdAt,
      })
      .select()
      .single();

    if (orderError) throw orderError;

    const orderItems = items.map((p, i) => ({
      order_id: order.id,
      product_id: p.id,
      product_name: p.name,
      product_image: p.thumbnail || p.images?.[0] || null,
      quantity,
      unit_price: unitPrices[i],
      total_price: unitPrices[i] * quantity,
    }));

    const { error: itemsError } = await adminClient.from('order_items').insert(orderItems);
    if (itemsError) throw itemsError;
    result.orders += 1;
  }
  console.log(`Seeded ${result.orders} demo customer orders with line items.`);

  const demoNotifications = [
    { type: 'order', title: 'Order delivered', message: 'Your recent order has been delivered. We hope you love it!' },
    { type: 'promotion', title: 'Welcome offer', message: 'Use code HKWELCOME10 for 10% off your next order.' },
  ];
  for (const note of demoNotifications) {
    await adminClient.from('notifications').insert({
      user_id: user.id,
      type: note.type,
      title: note.title,
      message: note.message,
    });
    result.notifications += 1;
  }
  console.log('Seeded demo customer notifications.');

  return result;
}


async function upsertAuthUser(adminClient, account) {
  const existing = await findUserByEmail(adminClient, account.email);

  if (existing) {
    const { data, error } = await adminClient.auth.admin.updateUserById(existing.id, {
      email: account.email,
      password: account.password,
      email_confirm: true,
      user_metadata: { full_name: account.fullName, role: account.role },
    });

    if (error) throw error;
    console.log(`Updated auth user: ${account.email}`);
    return data.user;
  }

  const { data, error } = await adminClient.auth.admin.createUser({
    email: account.email,
    password: account.password,
    email_confirm: true,
    user_metadata: { full_name: account.fullName, role: account.role },
  });

  if (error) throw error;
  console.log(`Created auth user: ${account.email}`);
  return data.user;
}

async function findUserByEmail(adminClient, email) {
  let page = 1;
  const perPage = 100;

  while (true) {
    const { data, error } = await adminClient.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = data.users.find((user) => user.email?.toLowerCase() === email.toLowerCase());
    if (found) return found;
    if (data.users.length < perPage) return null;
    page += 1;
  }
}

async function upsertProfile(adminClient, userId, account) {
  const { error } = await adminClient
    .from('profiles')
    .upsert(
      {
        id: userId,
        email: account.email,
        full_name: account.fullName,
        phone: account.phone,
        role: account.role,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );

  if (error) throw error;
  console.log(`Upserted ${account.role} profile: ${account.email}`);
}

async function verifyLogin(anonClient, account) {
  const { data, error } = await anonClient.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });

  if (error) throw error;

  const { data: profile, error: profileError } = await anonClient
    .from('profiles')
    .select('id,email,role')
    .eq('id', data.user.id)
    .single();

  if (profileError) throw profileError;
  if (profile.role !== account.role) {
    throw new Error(`Role verification failed for ${account.email}: expected ${account.role}, got ${profile.role}`);
  }

  await anonClient.auth.signOut();
  console.log(`Verified login and ${account.role} role: ${account.email}`);
}

const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;

if (isMain) {
  const clients = createSeedClients();
  if (!clients) {
    console.error('\nSet the missing variable(s) above in .env.local and re-run.');
    process.exit(1);
  }

  seedAll(clients)
    .then(() => console.log('\nDemo authentication accounts are ready.'))
    .catch((error) => {
      console.error('\nSeeding failed:', error.message);
      process.exit(1);
    });
}
