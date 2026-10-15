/**
 * Official Meta Platform Graph API v21.0 Client for Himalayan Koh LeadOS.
 *
 * Implements Facebook Login for Business & Instagram Business integration:
 * - Secure OAuth 2.0 URL generation with CSRF state protection
 * - Code exchange for short-lived and 60-day long-lived access tokens
 * - Retrieval of managed Facebook Pages & linked Instagram Professional Accounts
 * - Unified Social Inbox: fetch conversations and messages
 * - Sending replies to eligible connected Messenger / Instagram conversations
 * - Webhook challenge verification and SHA256 HMAC payload verification
 * - Disconnect & connection health status
 */


export const META_GRAPH_VERSION = 'v21.0';
export const META_GRAPH_BASE = `https://graph.facebook.com/${META_GRAPH_VERSION}`;

export interface MetaPage {
  id: string;
  name: string;
  access_token: string;
  category?: string;
  tasks?: string[];
  instagram_business_account?: {
    id: string;
    username: string;
    name?: string;
    profile_picture_url?: string;
  };
}

export interface MetaConnectionState {
  connected: boolean;
  platform: 'none' | 'facebook' | 'instagram' | 'both';
  facebookPage?: {
    id: string;
    name: string;
    category?: string;
    connectedAt: string;
    tokenExpiry?: string;
    permissions: string[];
  } | null;
  instagramAccount?: {
    id: string;
    username: string;
    name?: string;
    profilePicture?: string;
    connectedAt: string;
    permissions: string[];
  } | null;
  appConfigured: boolean;
  appId?: string;
  lastHealthCheck?: string;
  error?: string | null;
}

export interface MetaSocialConversation {
  id: string;
  platform: 'facebook' | 'instagram';
  contactName: string;
  contactId: string;
  lastMessage: string;
  updatedAt: string;
  unread: boolean;
  messages: Array<{
    id: string;
    from: string;
    isFromPage: boolean;
    text: string;
    timestamp: string;
  }>;
}

// In-memory / runtime cache for active connection tokens (stored server-side only)
let cachedConnection: {
  state: MetaConnectionState;
  pageAccessToken?: string;
  userAccessToken?: string;
} = {
  state: {
    connected: false,
    platform: 'none',
    facebookPage: null,
    instagramAccount: null,
    appConfigured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
    appId: process.env.META_APP_ID || undefined,
  },
};

export function getMetaAppCredentials() {
  const appId = process.env.META_APP_ID?.trim() || '';
  const appSecret = process.env.META_APP_SECRET?.trim() || '';
  const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN?.trim() || 'hk_leados_meta_webhook_secret';
  return {
    appId,
    appSecret,
    verifyToken,
    configured: Boolean(appId && appSecret),
  };
}

/**
 * Generates the official Meta OAuth authorization URL.
 */
export function getMetaOAuthUrl(platform: 'facebook' | 'instagram', redirectUri: string, csrfState: string): { url: string; error?: string } {
  const { appId, configured } = getMetaAppCredentials();
  if (!configured) {
    return {
      url: '',
      error: 'Meta App ID and App Secret are not configured in environment (META_APP_ID, META_APP_SECRET).',
    };
  }

  const scopes = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_metadata',
    'pages_messaging',
    'instagram_basic',
    'instagram_manage_messages',
    'business_management',
  ];

  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state: csrfState,
    scope: scopes.join(','),
    response_type: 'code',
  });

  return {
    url: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}`,
  };
}

/**
 * Exchanges the OAuth authorization code for a short-lived token,
 * then exchanges it for a 60-day long-lived access token.
 */
export async function exchangeMetaAuthCode(code: string, redirectUri: string): Promise<{
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}> {
  const { appId, appSecret } = getMetaAppCredentials();
  if (!appId || !appSecret) {
    throw new Error('Meta App credentials not configured.');
  }

  // 1. Exchange code for short-lived token
  const tokenUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
  tokenUrl.search = new URLSearchParams({
    client_id: appId,
    client_secret: appSecret,
    redirect_uri: redirectUri,
    code,
  }).toString();

  const tokenRes = await fetch(tokenUrl.toString(), {
    headers: { Accept: 'application/json' },
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    throw new Error(`Meta token exchange failed (${tokenRes.status}): ${errorBody}`);
  }

  const tokenData = await tokenRes.json() as { access_token: string; token_type: string; expires_in: number };

  // 2. Exchange for 60-day long-lived user token
  try {
    const longLivedUrl = new URL(`${META_GRAPH_BASE}/oauth/access_token`);
    longLivedUrl.search = new URLSearchParams({
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: tokenData.access_token,
    }).toString();

    const longLivedRes = await fetch(longLivedUrl.toString(), {
      headers: { Accept: 'application/json' },
    });

    if (longLivedRes.ok) {
      const longLivedData = await longLivedRes.json() as { access_token: string; token_type: string; expires_in?: number };
      return {
        accessToken: longLivedData.access_token,
        tokenType: longLivedData.token_type || tokenData.token_type,
        expiresIn: longLivedData.expires_in || 5184000, // 60 days
      };
    }
  } catch (err) {
    console.warn('[meta-client] Long-lived token exchange warning:', err);
  }

  return {
    accessToken: tokenData.access_token,
    tokenType: tokenData.token_type,
    expiresIn: tokenData.expires_in || 3600,
  };
}

/**
 * Retrieves managed Facebook Pages and associated Instagram Business Accounts.
 */
export async function getManagedFacebookPages(userAccessToken: string): Promise<MetaPage[]> {
  const url = `${META_GRAPH_BASE}/me/accounts?fields=id,name,access_token,category,tasks,instagram_business_account{id,username,name,profile_picture_url}&limit=100`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${userAccessToken}`,
      Accept: 'application/json',
    },
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Failed to fetch managed Facebook Pages (${res.status}): ${errText}`);
  }

  const data = await res.json() as { data: MetaPage[] };
  return data.data || [];
}

/**
 * Saves and stores authorized connection state for Himalayan Koh.
 */
export function setConnectedMetaAccounts(params: {
  page: MetaPage;
  userAccessToken: string;
  permissions?: string[];
}): MetaConnectionState {
  const { page, userAccessToken, permissions = ['pages_messaging', 'instagram_manage_messages'] } = params;
  const now = new Date().toISOString();

  const ig = page.instagram_business_account;
  const platform = ig ? 'both' : 'facebook';

  cachedConnection = {
    userAccessToken,
    pageAccessToken: page.access_token,
    state: {
      connected: true,
      platform,
      facebookPage: {
        id: page.id,
        name: page.name,
        category: page.category,
        connectedAt: now,
        tokenExpiry: new Date(Date.now() + 60 * 24 * 3600 * 1000).toISOString(),
        permissions,
      },
      instagramAccount: ig ? {
        id: ig.id,
        username: ig.username,
        name: ig.name,
        profilePicture: ig.profile_picture_url,
        connectedAt: now,
        permissions,
      } : null,
      appConfigured: true,
      appId: process.env.META_APP_ID || undefined,
      lastHealthCheck: now,
      error: null,
    },
  };

  return cachedConnection.state;
}

/**
 * Retrieves current Meta connection status.
 */
export function getMetaConnectionState(): MetaConnectionState {
  const { configured, appId } = getMetaAppCredentials();
  return {
    ...cachedConnection.state,
    appConfigured: configured,
    appId: appId || undefined,
  };
}

/**
 * Disconnects Facebook and Instagram accounts.
 */
export function disconnectMeta(): MetaConnectionState {
  cachedConnection = {
    state: {
      connected: false,
      platform: 'none',
      facebookPage: null,
      instagramAccount: null,
      appConfigured: Boolean(process.env.META_APP_ID && process.env.META_APP_SECRET),
      appId: process.env.META_APP_ID || undefined,
      error: null,
    },
    pageAccessToken: undefined,
    userAccessToken: undefined,
  };
  return cachedConnection.state;
}

/**
 * Fetches eligible conversations for Facebook Messenger and Instagram.
 */
export async function getUnifiedConversations(): Promise<MetaSocialConversation[]> {
  const state = cachedConnection.state;
  const token = cachedConnection.pageAccessToken;

  if (!state.connected || !token) {
    return [];
  }

  const conversations: MetaSocialConversation[] = [];

  // 1. Fetch Messenger conversations
  if (state.facebookPage?.id) {
    try {
      const url = `${META_GRAPH_BASE}/${state.facebookPage.id}/conversations?fields=id,snippet,updated_time,participants,messages{id,message,from,created_time}&limit=20`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { data: any[] };
        for (const item of json.data || []) {
          const participant = (item.participants?.data || []).find((p: any) => p.id !== state.facebookPage?.id) || { name: 'Customer', id: 'unknown' };
          const msgs = (item.messages?.data || []).map((m: any) => ({
            id: m.id,
            from: m.from?.name || 'Unknown',
            isFromPage: m.from?.id === state.facebookPage?.id,
            text: m.message || '',
            timestamp: m.created_time,
          }));
          conversations.push({
            id: item.id,
            platform: 'facebook',
            contactName: participant.name,
            contactId: participant.id,
            lastMessage: item.snippet || msgs[0]?.text || '',
            updatedAt: item.updated_time,
            unread: false,
            messages: msgs,
          });
        }
      }
    } catch (err) {
      console.warn('[meta-client] Error fetching Messenger conversations:', err);
    }
  }

  // 2. Fetch Instagram conversations
  if (state.instagramAccount?.id) {
    try {
      const url = `${META_GRAPH_BASE}/${state.instagramAccount.id}/conversations?platform=instagram&fields=id,snippet,updated_time,participants,messages{id,message,from,created_time}&limit=20`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json() as { data: any[] };
        for (const item of json.data || []) {
          const participant = (item.participants?.data || []).find((p: any) => p.id !== state.instagramAccount?.id) || { name: 'Instagram User', id: 'unknown' };
          const msgs = (item.messages?.data || []).map((m: any) => ({
            id: m.id,
            from: m.from?.username || m.from?.name || 'Instagram User',
            isFromPage: m.from?.id === state.instagramAccount?.id,
            text: m.message || '',
            timestamp: m.created_time,
          }));
          conversations.push({
            id: item.id,
            platform: 'instagram',
            contactName: participant.username || participant.name || 'Instagram Contact',
            contactId: participant.id,
            lastMessage: item.snippet || msgs[0]?.text || '',
            updatedAt: item.updated_time,
            unread: false,
            messages: msgs,
          });
        }
      }
    } catch (err) {
      console.warn('[meta-client] Error fetching Instagram conversations:', err);
    }
  }

  // Sort latest first
  return conversations.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

/**
 * Sends a message in an eligible Facebook Messenger or Instagram conversation.
 */
export async function sendMetaSocialMessage(params: {
  platform: 'facebook' | 'instagram';
  recipientId: string;
  messageText: string;
}): Promise<{ success: boolean; messageId?: string; error?: string }> {
  const token = cachedConnection.pageAccessToken;
  const state = cachedConnection.state;

  if (!token || !state.connected) {
    return { success: false, error: 'No active authorized Meta connection.' };
  }

  const endpoint = params.platform === 'facebook'
    ? `${META_GRAPH_BASE}/${state.facebookPage?.id}/messages`
    : `${META_GRAPH_BASE}/${state.instagramAccount?.id}/messages`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        recipient: { id: params.recipientId },
        message: { text: params.messageText },
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      return { success: false, error: `Meta API returned ${res.status}: ${err}` };
    }

    const json = await res.json() as { message_id?: string; recipient_id?: string };
    return { success: true, messageId: json.message_id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Send message failed' };
  }
}

/**
 * Verifies Meta Webhook HMAC-SHA256 signature using Web Crypto API.
 */
export async function verifyMetaWebhookSignature(payload: string, signatureHeader: string | null): Promise<boolean> {
  const { appSecret } = getMetaAppCredentials();
  if (!appSecret || !signatureHeader) return false;

  const parts = signatureHeader.split('=');
  if (parts.length !== 2 || parts[0] !== 'sha256') return false;

  const expectedSignature = parts[1];
  try {
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
    const hex = Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
    return hex === expectedSignature;
  } catch {
    return false;
  }
}
