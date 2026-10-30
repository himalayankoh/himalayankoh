import { lookupCatalogProduct } from './src/lib/backend/serverCatalog.js';

async function test() {
  const result = await lookupCatalogProduct('himalayan-salt-fine-grain-45-lbs');
  console.log('Result for himalayan-salt-fine-grain-45-lbs:');
  console.log('Product ID:', result.product?.id);
  console.log('Product Name:', result.product?.name);
  console.log('Product Slug:', result.product?.slug);
}

test().catch(console.error);
