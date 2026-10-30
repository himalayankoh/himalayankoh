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
  const r = await fetch(`${base}/wp-json/wc/v3/products?status=publish&per_page=20`, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const products = await r.json();
  for (const p of products) {
    const meta = p.meta_data || [];
    const yoastTitle = meta.find(m => m.key === '_yoast_wpseo_title')?.value;
    const yoastDesc = meta.find(m => m.key === '_yoast_wpseo_metadesc')?.value;
    console.log(JSON.stringify({
      id: p.id,
      name: p.name,
      slug: p.slug,
      yoast_head_title: p.yoast_head_json?.title,
      yoast_head_desc: p.yoast_head_json?.description,
      meta_title: yoastTitle,
      meta_desc: yoastDesc
    }, null, 2));
  }
}
check();
