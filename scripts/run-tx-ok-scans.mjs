import fs from 'node:fs';
import { parse } from 'dotenv';

const env = parse(fs.readFileSync('.env.local'));
const siteBase = 'https://himalayankoh.com';
const token = env.LEADOS_N8N_TOKEN;
const wpBase = env.WORDPRESS_BASE_URL || 'https://wp.himalayankoh.com';
const auth = 'Basic ' + Buffer.from(env.WORDPRESS_ADMIN_USER + ':' + env.WORDPRESS_ADMIN_APP_PASSWORD).toString('base64');

async function main() {
  console.log('=== RUNNING REAL TEXAS & OKLAHOMA SCANS ON PRODUCTION ===\n');

  // 1. Run Texas scan
  console.log('[1/3] Executing Texas agriculture scan on production...');
  const txRes = await fetch(`${siteBase}/api/admin/leados/market-map`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'scan_state',
      stateCode: 'TX',
      categoryKey: 'agriculture',
      limit: 15,
    }),
  });
  const txData = await txRes.json();
  console.log('  TX Result:', JSON.stringify(txData.scanResult, null, 2));

  // 2. Run Oklahoma scan
  console.log('\n[2/3] Executing Oklahoma agriculture scan on production...');
  const okRes = await fetch(`${siteBase}/api/admin/leados/market-map`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'scan_state',
      stateCode: 'OK',
      categoryKey: 'agriculture',
      limit: 15,
    }),
  });
  const okData = await okRes.json();
  console.log('  OK Result:', JSON.stringify(okData.scanResult, null, 2));

  // 3. Test Duplicate Prevention (Re-scanning Texas)
  console.log('\n[3/3] Re-scanning Texas to verify duplicate prevention...');
  const rescanRes = await fetch(`${siteBase}/api/admin/leados/market-map`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      action: 'scan_state',
      stateCode: 'TX',
      categoryKey: 'agriculture',
      limit: 15,
    }),
  });
  const rescanData = await rescanRes.json();
  console.log('  TX Re-scan Result:', JSON.stringify(rescanData.scanResult, null, 2));

  // 4. Verify Leads in WordPress Lead Library
  console.log('\n[4/4] Verifying saved leads in WordPress database...');
  const leadsRes = await fetch(`${wpBase}/wp-json/leados/v1/leads?limit=20`, {
    headers: { Authorization: auth },
  });
  const leadsData = await leadsRes.json();
  const leads = leadsData.leads || [];
  console.log('  Total Leads in Library:', leadsData.total);
  console.log('  Sample Leads from Library:');
  for (const l of leads.slice(0, 5)) {
    console.log(`    - ID: ${l.id} | Name: ${l.business_name || l.businessName} | State: ${l.region} | City: ${l.city} | Lat: ${l.latitude} | Lon: ${l.longitude} | Web: ${l.website || 'none'}`);
  }
}

main().catch(console.error);
