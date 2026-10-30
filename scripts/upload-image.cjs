const fs = require('fs');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function uploadImage() {
  if (!process.env.WP_APP_PASSWORD || !process.env.WP_APP_USER) {
    console.error('Missing WP_APP_USER or WP_APP_PASSWORD in environment.');
    process.exit(1);
  }

  const filePath = 'C:\\Users\\basco\\.gemini\\antigravity-ide\\brain\\da8fd395-0512-4fda-a453-8bc9be259c18\\.user_uploaded\\media_1790966677356.jpg';
  if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
  }
  const fileData = fs.readFileSync(filePath);
  
  const auth = Buffer.from(`${process.env.WP_APP_USER}:${process.env.WP_APP_PASSWORD}`).toString('base64');
  
  const res = await fetch('https://himalayankoh.com/staging/wp-json/wp/v2/media', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Disposition': 'attachment; filename="rock-salt-label-6lbs.jpg"',
      'Content-Type': 'image/jpeg'
    },
    body: fileData
  });
  
  if (!res.ok) {
    console.error('Failed to upload', res.status);
    return;
  }
  
  const data = await res.json();
  console.log('Uploaded image URL:', data.source_url);
  console.log('Image ID:', data.id);
}

uploadImage();
