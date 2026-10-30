const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function getEdible6lb() {
  const url = `${process.env.WOOCOMMERCE_BASE_URL}/wp-json/wc/v3/products/2704`;
  const auth = Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
  
  const response = await fetch(url, { headers: { 'Authorization': `Basic ${auth}` } });
  const product = await response.json();
  
  console.log('Price:', product.price);
  console.log('Regular Price:', product.regular_price);
  console.log('Sale Price:', product.sale_price);
  console.log(JSON.stringify(product.images, null, 2));
}

getEdible6lb();
