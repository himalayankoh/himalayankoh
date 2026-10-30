import fs from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'dotenv';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const salmanEnv = parse(fs.readFileSync('C:/Users/basco/Downloads/salman-os-command-center/.env.local'));
const localEnv = parse(fs.readFileSync(join(ROOT, '.env.local')));

const n8nUrl = 'http://127.0.0.1:5678';
const apiKey = salmanEnv.N8N_API_KEY;
const n8nToken = localEnv.LEADOS_N8N_TOKEN;

console.log('n8n URL:', n8nUrl);
console.log('API Key Present:', Boolean(apiKey));
console.log('LeadOS N8N Token Present:', Boolean(n8nToken));

async function api(path, method = 'GET', body = null) {
  const url = `${n8nUrl}/api/v1${path}`;
  const options = {
    method,
    headers: {
      'X-N8N-API-KEY': apiKey,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(30000),
  };
  if (body) {
    options.body = JSON.stringify(body);
  }
  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`n8n ${path} HTTP ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  // 1. Get or create credential
  console.log('[1/4] Checking credentials...');
  const credsRes = await api('/credentials');
  const existingCreds = Array.isArray(credsRes) ? credsRes : credsRes.data || [];
  let credId = existingCreds.find(c => c.name === 'HK LeadOS Discovery Worker' && c.type === 'httpHeaderAuth')?.id;

  if (!credId) {
    console.log('  Creating HK LeadOS Discovery Worker credential in n8n...');
    const createdCred = await api('/credentials', 'POST', {
      name: 'HK LeadOS Discovery Worker',
      type: 'httpHeaderAuth',
      data: {
        name: 'Authorization',
        value: `Bearer ${n8nToken}`,
      },
    });
    credId = createdCred.id;
    console.log('  Created credential ID:', credId);
  } else {
    console.log('  Updating existing credential ID with rotated token:', credId);
    try {
      await api(`/credentials/${credId}`, 'PATCH', {
        name: 'HK LeadOS Discovery Worker',
        type: 'httpHeaderAuth',
        data: {
          name: 'Authorization',
          value: `Bearer ${n8nToken}`,
        },
      });
      console.log('  Credential updated successfully via PATCH.');
    } catch (err) {
      console.log('  PATCH failed (' + err.message + '), recreating credential...');
      await api(`/credentials/${credId}`, 'DELETE').catch(() => {});
      const createdCred = await api('/credentials', 'POST', {
        name: 'HK LeadOS Discovery Worker',
        type: 'httpHeaderAuth',
        data: {
          name: 'Authorization',
          value: `Bearer ${n8nToken}`,
        },
      });
      credId = createdCred.id;
      console.log('  Recreated credential ID:', credId);
    }
  }

  // 2. Read workflow template
  console.log('[2/4] Loading ops/leados/n8n-market-discovery.json...');
  const workflowJson = JSON.parse(fs.readFileSync(join(ROOT, 'ops', 'leados', 'n8n-market-discovery.json'), 'utf8'));

  // Attach credential to HttpRequest and Webhook nodes
  const httpNode = workflowJson.nodes.find(n => n.id === 'Trigger-market-scan');
  if (httpNode) {
    httpNode.credentials = {
      httpHeaderAuth: {
        id: credId,
        name: 'HK LeadOS Discovery Worker',
      },
    };
  }

  const webhookNode = workflowJson.nodes.find(n => n.id === 'Discovery-webhook');
  if (webhookNode) {
    webhookNode.parameters.authentication = 'headerAuth';
    webhookNode.credentials = {
      httpHeaderAuth: {
        id: credId,
        name: 'HK LeadOS Discovery Worker',
      },
    };
  }

  // 3. Find or create workflow
  console.log('[3/4] Checking existing workflows in n8n...');
  const wfList = await api('/workflows?limit=100');
  const existingWf = (wfList.data || wfList || []).find(w => w.name === workflowJson.name);

  let wfId;
  if (existingWf) {
    console.log('  Found existing workflow ID:', existingWf.id, 'Updating...');
    // Deactivate first if active
    if (existingWf.active) {
      await api(`/workflows/${existingWf.id}/deactivate`, 'POST').catch(() => {});
    }
    const updated = await api(`/workflows/${existingWf.id}`, 'PUT', workflowJson);
    wfId = updated.id;
  } else {
    console.log('  Creating new workflow in n8n...');
    const created = await api('/workflows', 'POST', workflowJson);
    wfId = created.id;
  }
  console.log('  Workflow ID:', wfId);

  // 4. Activate workflow
  console.log('[4/4] Activating workflow in n8n...');
  const activated = await api(`/workflows/${wfId}/activate`, 'POST');
  console.log('  Workflow activated status:', activated.active);

  // Save installation status
  const statusFile = join(ROOT, 'ops', 'leados', 'n8n-installation-status.json');
  fs.writeFileSync(statusFile, JSON.stringify({
    workflowId: wfId,
    workflowName: workflowJson.name,
    active: activated.active,
    credentialId: credId,
    installedAt: new Date().toISOString(),
    scheduleIntervalHours: 6,
  }, null, 2));

  console.log('Installation complete! Saved status to:', statusFile);
}

main().catch(err => {
  console.error('Failed to setup n8n workflow:', err);
  process.exit(1);
});
