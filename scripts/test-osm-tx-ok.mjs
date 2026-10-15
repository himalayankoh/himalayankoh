import { searchOpenStreetMap } from '../src/lib/leados/osm-provider.ts';

async function test() {
  console.log('Testing searchOpenStreetMap for Houston, TX...');
  const txRes = await searchOpenStreetMap({
    category: 'Feed Store',
    location: 'Houston, TX',
    nodeOnly: true,
    maxResults: 10,
    radiusKm: 35,
  });
  console.log('TX diagnostics:', JSON.stringify(txRes.diagnostics, null, 2));
  console.log('TX leads found:', txRes.leads.length);
  if (txRes.leads.length > 0) {
    for (const l of txRes.leads.slice(0, 5)) {
      console.log(`  - ${l.businessName} | ${l.address || ''}, ${l.city || ''} | ${l.website || 'No Web'}`);
    }
  }

  console.log('\nTesting searchOpenStreetMap for Oklahoma City, OK...');
  const okRes = await searchOpenStreetMap({
    category: 'Feed Store',
    location: 'Oklahoma City, OK',
    nodeOnly: true,
    maxResults: 10,
    radiusKm: 35,
  });
  console.log('OK leads found:', okRes.leads.length);
  if (okRes.leads.length > 0) {
    for (const l of okRes.leads.slice(0, 5)) {
      console.log(`  - ${l.businessName} | ${l.address || ''}, ${l.city || ''} | ${l.website || 'No Web'}`);
    }
  }
}

test().catch(console.error);
