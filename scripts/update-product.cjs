const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function updateProduct() {
  const url = `${process.env.WOOCOMMERCE_BASE_URL}/wp-json/wc/v3/products/2704`;
  const auth = Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
  
  // Remove S6 (2709)
  const data = {
    images: [
      { id: 2705 },
      { id: 2706 },
      { id: 2707 },
      { id: 2708 }
    ]
  };

  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  
  const product = await response.json();
  console.log(product.id, 'updated. Images:', product.images.map(img => img.name).join(', '));
}

updateProduct();
