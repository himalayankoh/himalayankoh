import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

async function run() {
  const baseUrl = `${process.env.WOOCOMMERCE_BASE_URL}/wp-json/wc/v3/products`;
  const auth = Buffer.from(`${process.env.WOOCOMMERCE_CONSUMER_KEY}:${process.env.WOOCOMMERCE_CONSUMER_SECRET}`).toString('base64');
  
  const headers = {
    'Authorization': `Basic ${auth}`,
    'Content-Type': 'application/json'
  };

  // 1. Product 2716: reorder images so 8.jpeg is first
  // Current: "https://himalayankoh.com/staging/wp-content/uploads/2026/09/1.jpeg", "https://himalayankoh.com/staging/wp-content/uploads/2026/09/3.jpeg", "https://himalayankoh.com/staging/wp-content/uploads/2026/09/8.jpeg", "https://himalayankoh.com/staging/wp-content/uploads/2026/09/2.jpeg"
  console.log("Updating Product 2716 (45 lb bag)...");
  await fetch(`${baseUrl}/2716`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      images: [
        { src: "https://himalayankoh.com/staging/wp-content/uploads/2026/09/8.jpeg" },
        { src: "https://himalayankoh.com/staging/wp-content/uploads/2026/09/3.jpeg" },
        { src: "https://himalayankoh.com/staging/wp-content/uploads/2026/09/1.jpeg" },
        { src: "https://himalayankoh.com/staging/wp-content/uploads/2026/09/2.jpeg" }
      ]
    })
  });

  // 2. Product 2710: Livestock 6lb Pouch - change category to "Live Stock" (ID 75)
  console.log("Updating Product 2710 (Livestock 6lb Pouch) category...");
  await fetch(`${baseUrl}/2710`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      categories: [
        { id: 75 }
      ]
    })
  });

  // 3. Product 2704: Edible 6lb Pouch - change price to 19.95
  console.log("Updating Product 2704 (Edible 6lb) price...");
  await fetch(`${baseUrl}/2704`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({
      regular_price: "19.95"
    })
  });

  console.log("Done.");
}

run();
