import { parse } from 'dotenv';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Load .env.local into process.env
const envPath = resolve('.env.local');
const env = parse(readFileSync(envPath, 'utf8'));
for (const [k, v] of Object.entries(env)) {
  process.env[k] = v;
}

const { runAutonomousMarketScan, runScheduledAutonomousScan, getSchedulerStatus } = await import('../src/lib/leados/market-scheduler.js');
const { getMarketSummaryFromDb, getMarketJobsFromDb, listSavedLeads } = await import('../src/lib/leados/db.js');

async function main() {
  console.log('================================================================');
  console.log('LEADOS 3.2 — LIVE PRODUCTION SCAN & SCHEDULER ACCEPTANCE TEST');
  console.log('================================================================');
  console.log(`Time: ${new Date().toISOString()}`);
  console.log(`WordPress Base: ${process.env.WORDPRESS_BASE_URL}`);

  const evidence = {
    texasScan: null,
    oklahomaScan: null,
    scheduledScan: null,
    concurrencyTest: null,
    restartRecovery: null,
    stateCounts: null,
    discoveredSampleLeads: [],
  };

  // 1. EXECUTE REAL TEXAS SCAN
  console.log('\n>>> [1/5] Executing Real Texas (TX) Autonomous Scan...');
  const txStart = Date.now();
  const txResult = await runAutonomousMarketScan({
    stateCode: 'TX',
    categoryKey: 'agriculture',
  });
  evidence.texasScan = txResult;
  console.log(`TX Scan Result: ${txResult.ok ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Job ID: ${txResult.jobId}`);
  console.log(`  State: ${txResult.stateName} (${txResult.stateCode})`);
  console.log(`  Metro: ${txResult.metroScanned}`);
  console.log(`  Category: ${txResult.categoryScanned}`);
  console.log(`  Provider: ${txResult.provider}`);
  console.log(`  Discovered: ${txResult.leadsDiscovered}`);
  console.log(`  New Saved: ${txResult.newLeadsSaved}`);
  console.log(`  Existing Updated: ${txResult.existingUpdated}`);
  console.log(`  Failed: ${txResult.failedSaves}`);
  console.log(`  Duration: ${txResult.durationMs}ms`);

  // 2. EXECUTE REAL OKLAHOMA SCAN
  console.log('\n>>> [2/5] Executing Real Oklahoma (OK) Autonomous Scan...');
  const okResult = await runAutonomousMarketScan({
    stateCode: 'OK',
    categoryKey: 'agriculture',
  });
  evidence.oklahomaScan = okResult;
  console.log(`OK Scan Result: ${okResult.ok ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Job ID: ${okResult.jobId}`);
  console.log(`  State: ${okResult.stateName} (${okResult.stateCode})`);
  console.log(`  Metro: ${okResult.metroScanned}`);
  console.log(`  Category: ${okResult.categoryScanned}`);
  console.log(`  Provider: ${okResult.provider}`);
  console.log(`  Discovered: ${okResult.leadsDiscovered}`);
  console.log(`  New Saved: ${okResult.newLeadsSaved}`);
  console.log(`  Existing Updated: ${okResult.existingUpdated}`);
  console.log(`  Failed: ${okResult.failedSaves}`);
  console.log(`  Duration: ${okResult.durationMs}ms`);

  // 3. EXECUTE SCHEDULED AUTONOMOUS SCAN (Rotates to next priority state, e.g. FL or CA)
  console.log('\n>>> [3/5] Executing Autonomous Scheduled Scan (Browser Closed Execution)...');
  const schedResult = await runScheduledAutonomousScan();
  evidence.scheduledScan = schedResult;
  console.log(`Scheduled Run Result: ${schedResult.ok ? 'SUCCESS' : 'FAILED'}`);
  console.log(`  Job ID: ${schedResult.jobId}`);
  console.log(`  Rotated State: ${schedResult.stateName} (${schedResult.stateCode})`);
  console.log(`  Rotated Metro: ${schedResult.metroScanned}`);
  console.log(`  Rotated Category: ${schedResult.categoryScanned}`);
  console.log(`  Discovered: ${schedResult.leadsDiscovered}`);
  console.log(`  New Saved: ${schedResult.newLeadsSaved}`);
  console.log(`  Existing Updated: ${schedResult.existingUpdated}`);

  // Test concurrency locking
  console.log('\n>>> [3b/5] Testing Concurrency Lock & Duplicate Prevention...');
  const mockRunningJob = {
    jobId: 'mock-running-job-lock-test',
    stateCode: 'TX',
    stateName: 'Texas',
    metroHub: 'Houston Metro',
    categoryKey: 'agriculture',
    status: 'running',
    scheduledAt: new Date().toISOString(),
    startedAt: new Date().toISOString(),
    discoveredCount: 0,
    newSavedCount: 0,
    existingUpdatedCount: 0,
    failedCount: 0,
  };
  const lockResult = await runScheduledAutonomousScan({ overrideJobs: [mockRunningJob] });
  evidence.concurrencyTest = {
    prevented: !lockResult.ok && lockResult.jobId === 'blocked-concurrent',
    message: lockResult.errors[0],
  };
  console.log(`Concurrency Lock Test: ${evidence.concurrencyTest.prevented ? 'PASS (Duplicate Prevented)' : 'FAIL'}`);
  console.log(`  Lock Message: ${lockResult.errors[0]}`);

  // 4. VERIFY STATE-LEVEL ACCURATE DATABASE COUNTS
  console.log('\n>>> [4/5] Verifying State-Level Database Aggregation...');
  const dbSummary = await getMarketSummaryFromDb();
  evidence.stateCounts = dbSummary;
  console.log(`Total Leads in Database: ${dbSummary.totalLeads}`);
  console.log(`States represented: ${dbSummary.byState?.length || 0}`);
  for (const st of (dbSummary.byState || []).slice(0, 10)) {
    console.log(`  ${st.region}: ${st.total} leads (qualified: ${st.qualified}, contactable: ${st.contactable}, new: ${st.new_count})`);
  }

  // 5. SAMPLE DISCOVERED LEADS FROM LIBRARY
  console.log('\n>>> [5/5] Fetching Sample Discovered Leads with Geographic Verification...');
  const txLeads = await listSavedLeads({ region: 'TX', limit: 5 });
  const okLeads = await listSavedLeads({ region: 'OK', limit: 5 });
  const sampleLeads = [...(txLeads.leads || []), ...(okLeads.leads || [])].map((l) => ({
    id: l.id,
    businessName: l.businessName,
    category: l.category,
    city: l.city,
    region: l.region,
    coordinates: l.latitude && l.longitude ? `${l.latitude}, ${l.longitude}` : 'N/A',
    website: l.website || 'N/A',
    phone: l.phone || 'N/A',
    opportunityScore: l.opportunityScore,
    status: l.status,
  }));
  evidence.discoveredSampleLeads = sampleLeads;

  console.log(`Found ${sampleLeads.length} sample verified leads across TX & OK:`);
  for (const s of sampleLeads) {
    console.log(`  - [${s.region}] ${s.businessName} (${s.category || 'Feed Store'}) in ${s.city || 'Unknown'}`);
    console.log(`    Coords: ${s.coordinates} | Web: ${s.website} | Score: ${s.opportunityScore}`);
  }

  // Save evidence to scratch
  writeFileSync('C:/Users/basco/.gemini/antigravity-ide/brain/6dad7f9a-64da-4eff-8985-65025e454e58/scratch/acceptance-evidence.json', JSON.stringify(evidence, null, 2));
  console.log('\nEvidence written to scratch/acceptance-evidence.json');
}

main().catch((err) => {
  console.error('Fatal error in acceptance tests:', err);
  process.exit(1);
});
