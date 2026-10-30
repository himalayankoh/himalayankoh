import { readFileSync } from 'node:fs';

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l && !l.startsWith('#') && l.includes('='))
    .map((l) => {
      const i = l.indexOf('=');
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^['"]|['"]$/g, '')];
    })
);

const auth = Buffer.from(env.WORDPRESS_ADMIN_USER + ':' + env.WORDPRESS_ADMIN_APP_PASSWORD).toString('base64');
const base = env.NEXT_PUBLIC_WORDPRESS_BASE_URL || 'https://himalayankoh.com/staging';

async function check() {
  for (const id of [2488, 2487, 2485, 2479]) {
    const r = await fetch(`${base}/wp-json/wc/v3/products/${id}`, {
      headers: { Authorization: `Basic ${auth}` },
    });
    const p = await r.json();
    console.log(`\n================== Product ${id} ==================`);
    console.log('Short description:', p.short_description);
    console.log('Description:', p.description);
  }
}
check();
