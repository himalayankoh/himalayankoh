import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config({ path: '.env.local' });

async function run() {
  const url = `${process.env.WOOCOMMERCE_BASE_URL}/wp-json/wc/v3/products?per_page=50`;
  const auth = Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
  
  try {
    const response = await fetch(url, {
      headers: {
        'Authorization': `Basic ${auth}`
      }
    });
    
    if (!response.ok) {
      console.error('Error fetching products:', response.status, response.statusText);
      console.error(await response.text());
      return;
    }
    
    const data = await response.json();
    const products = data.map(p => ({
      id: p.id,
      name: p.name,
      price: p.price,
      categories: p.categories.map(c => c.name),
      status: p.status,
      stock_status: p.stock_status,
      images: p.images.map(img => img.src)
    }));
    
    const targetProducts = products.filter(p => 
      p.name.includes('45') || p.name.includes('6 lb') || p.name.includes('6 lbs') || p.name.includes('Pouch') || p.name.includes('Edible')
    );

    console.log(JSON.stringify(targetProducts, null, 2));
  } catch (error) {
    console.error("Error fetching products:", error);
  }
}

run();
