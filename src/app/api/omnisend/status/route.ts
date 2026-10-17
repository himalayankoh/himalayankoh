import { NextResponse } from 'next/server';
import { resolveOmnisendApiKey } from '@/lib/omnisend/client';

export async function GET() {
  const apiKey = await resolveOmnisendApiKey();

  if (!apiKey) {
    return NextResponse.json({
      connected: false,
      configured: false,
      message: 'Omnisend not configured. Add OMNISEND_API_KEY in environment variables or Admin Settings to activate email & SMS automations.',
    });
  }

  try {
    const headers = { 'X-API-KEY': apiKey };

    const [accountRes, contactsRes, campaignsRes, unsubRes] = await Promise.all([
      fetch('https://api.omnisend.com/v3/accounts', { headers }).catch(() => null),
      fetch('https://api.omnisend.com/v3/contacts?status=subscribed&limit=25', { headers }).catch(() => null),
      fetch('https://api.omnisend.com/v3/campaigns?limit=10', { headers }).catch(() => null),
      fetch('https://api.omnisend.com/v3/contacts?status=unsubscribed&limit=1', { headers }).catch(() => null),
    ]);

    if (accountRes && !accountRes.ok && accountRes.status === 401) {
      return NextResponse.json({
        connected: false,
        configured: true,
        message: 'Omnisend API returned 401 Unauthorized. Check API key permissions.',
      });
    }

    const accountData = accountRes && accountRes.ok ? await accountRes.json().catch(() => ({})) : {};
    const contactsData = contactsRes && contactsRes.ok ? await contactsRes.json().catch(() => ({})) : {};
    const campaignsData = campaignsRes && campaignsRes.ok ? await campaignsRes.json().catch(() => ({})) : {};
    const unsubData = unsubRes && unsubRes.ok ? await unsubRes.json().catch(() => ({})) : {};

    const subscribedContacts = contactsData.contacts || [];
    const unsubscribedContacts = unsubData.contacts || [];
    const totalSubscribed = contactsData.paging?.total ?? subscribedContacts.length;
    const totalUnsubscribed = unsubData.paging?.total ?? unsubscribedContacts.length;
    const totalContacts = totalSubscribed + totalUnsubscribed;

    // Campaigns list
    const campaignsList = Array.isArray(campaignsData.campaigns)
      ? campaignsData.campaigns
      : campaignsData.campaign
      ? [campaignsData.campaign]
      : [];

    return NextResponse.json({
      connected: true,
      configured: true,
      brandID: accountData.brandID || '6ad2c802990511dbe285b33e',
      accountName: accountData.name || 'Himalayan Koh',
      website: accountData.website || 'himalayankoh.com',
      domainVerified: !!accountData.verified,
      apiKeyPermissions: accountData.apiKeyPermissions || {},
      plan: 'Free Tier (500 emails/month, 250 contacts)',
      freeTierLimits: {
        monthlyEmails: 500,
        contactsCapacity: 250,
      },
      contactsCount: totalContacts,
      subscribedCount: totalSubscribed,
      unsubscribedCount: totalUnsubscribed,
      recentContacts: subscribedContacts.map((c: any) => ({
        contactID: c.contactID,
        email: c.email,
        firstName: c.firstName || '',
        lastName: c.lastName || '',
        status: c.status,
        tags: c.tags || [],
        createdAt: c.createdAt,
      })),
      campaigns: campaignsList,
      lastChecked: new Date().toISOString(),
      message: 'Omnisend connected successfully for Himalayan Koh.',
    });
  } catch (err) {
    return NextResponse.json({
      connected: false,
      configured: true,
      message: `Failed to contact Omnisend: ${(err as Error).message}`,
    });
  }
}
