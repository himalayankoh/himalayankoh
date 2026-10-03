const fs = require('fs');

async function uploadImage() {
  const filePath = 'C:\\Users\\basco\\.gemini\\antigravity-ide\\brain\\da8fd395-0512-4fda-a453-8bc9be259c18\\.user_uploaded\\media_1790966677356.jpg';
  const fileData = fs.readFileSync(filePath);
  
  const auth = Buffer.from('8002salman@gmail.com:w27L m3AJ 5IJ8 E3Ia 7YZd 19si').toString('base64');
  
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
    console.error('Failed to upload', res.status, await res.text());
    return;
  }
  
  const data = await res.json();
  console.log('Uploaded image URL:', data.source_url);
  console.log('Image ID:', data.id);
}

uploadImage();
