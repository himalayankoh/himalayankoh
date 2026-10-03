const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function getProduct() {
  const url = `${process.env.WOOCOMMERCE_BASE_URL}/wp-json/wc/v3/products/2710`;
  const auth = Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
  
  const response = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
  const product = await response.json();
  
  console.log(JSON.stringify(product.images, null, 2));
}

getProduct();
