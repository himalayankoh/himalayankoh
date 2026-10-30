import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const url = `${process.env.WOOCOMMERCE_BASE_URL}/wp-json/wc/v3/products/categories?per_page=100`;
  const auth = Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
  
  const response = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
  const data = await response.json();
  
  console.log(JSON.stringify(data.map(c => ({id: c.id, name: c.name})), null, 2));
}

run();
