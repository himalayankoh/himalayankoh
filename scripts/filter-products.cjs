const fs = require('fs');

const data = fs.readFileSync('products.json', 'utf16le');
const products = JSON.parse(data);

const targetProducts = products.filter(p => 
  p.name.includes('45') || p.name.includes('6 lb') || p.name.includes('6 lbs') || p.name.includes('Pouch')
);

console.log(JSON.stringify(targetProducts, null, 2));
