export interface SettingField {
  key: string;
  label: string;
  /**
   * `toggle` is stored as the literal strings `'true'` / `'false'`.
   *
   * It exists so a feature switch is a stored setting rather than a deploy: the same
   * read, masking and write path serves it, and the console can flip it without a
   * release. A toggle is never masked — it is a boolean, not a credential — so the
   * value is returned to the admin screen as-is.
   */
  type: 'text' | 'password' | 'email' | 'url' | 'toggle';
  placeholder?: string;
  hint?: string;
  /** Matching process.env key used as fallback when DB value is absent. */
  envFallback: string;
}

export interface SettingsCategory {
  id: string;
  label: string;
  description: string;
  docsHref?: string;
  fields: SettingField[];
}

/**
 * Central registry of all configurable service integrations.
 * To add a new service: append an entry here — the DB, API, and admin UI
 * all work generically from this list.
 */
export const SETTINGS_REGISTRY: SettingsCategory[] = [
  {
    id: 'shippo',
    label: 'Shippo — Shipping',
    description: 'Live carrier rates (USPS, UPS, FedEx) and one-click shipping label creation.',
    docsHref: 'https://apps.goshippo.com/settings/api',
    fields: [
      {
        key: 'api_key',
        label: 'Shippo API Key',
        type: 'password',
        placeholder: 'shippo_test_... or shippo_live_...',
        hint: 'Get it from Shippo → Settings → API',
        envFallback: 'SHIPPO_API_KEY',
      },
      {
        key: 'from_name',
        label: 'Ship-From Business Name',
        type: 'text',
        placeholder: 'Himalayan Koh',
        envFallback: 'SHIPPO_FROM_NAME',
      },
      {
        key: 'from_street1',
        label: 'Ship-From Street',
        type: 'text',
        placeholder: '12620 FM 1960 W Ste A-4',
        envFallback: 'SHIPPO_FROM_STREET1',
      },
      {
        key: 'from_city',
        label: 'City',
        type: 'text',
        placeholder: 'Houston',
        envFallback: 'SHIPPO_FROM_CITY',
      },
      {
        key: 'from_state',
        label: 'State',
        type: 'text',
        placeholder: 'TX',
        envFallback: 'SHIPPO_FROM_STATE',
      },
      {
        key: 'from_zip',
        label: 'ZIP Code',
        type: 'text',
        placeholder: '77065',
        envFallback: 'SHIPPO_FROM_ZIP',
      },
      {
        key: 'from_country',
        label: 'Country',
        type: 'text',
        placeholder: 'US',
        envFallback: 'SHIPPO_FROM_COUNTRY',
      },
      {
        key: 'from_phone',
        label: 'Phone',
        type: 'text',
        placeholder: '8322246466',
        envFallback: 'SHIPPO_FROM_PHONE',
      },
      {
        key: 'from_email',
        label: 'From Email',
        type: 'email',
        placeholder: 'orders@himalayankoh.com',
        envFallback: 'SHIPPO_FROM_EMAIL',
      },
    ],
  },
  {
    id: 'stripe',
    label: 'Stripe — Payments',
    description: 'Card payment processing with 3DS support and webhook event handling.',
    docsHref: 'https://dashboard.stripe.com/test/apikeys',
    fields: [
      {
        key: 'secret_key',
        label: 'Secret Key',
        type: 'password',
        placeholder: 'sk_test_... or sk_live_...',
        hint: 'Never share this key. Server-side only.',
        envFallback: 'STRIPE_SECRET_KEY',
      },
      {
        key: 'publishable_key',
        label: 'Publishable Key',
        type: 'text',
        placeholder: 'pk_test_... or pk_live_...',
        envFallback: 'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY',
      },
      {
        key: 'webhook_secret',
        label: 'Webhook Secret',
        type: 'password',
        placeholder: 'whsec_...',
        hint: 'From Stripe Dashboard → Webhooks, or Stripe CLI for local testing.',
        envFallback: 'STRIPE_WEBHOOK_SECRET',
      },
      {
        key: 'staging_simulator',
        label: 'Staging Payment Simulator',
        type: 'toggle',
        hint:
          'Allows simulated payments on preview.himalayankoh.com for end-to-end QA. No real money is charged. ' +
          'It can only ever run on the staging origin — the production store refuses it even when this is on.',
        envFallback: 'STAGING_PAYMENT_SIMULATOR',
      },
    ],
  },
  {
    id: 'openrouter',
    label: 'OpenRouter — AI Chat Assistant',
    description: 'Powers the customer-facing AI chat widget. Free models work without a key; add a key for higher limits.',
    docsHref: 'https://openrouter.ai/keys',
    fields: [
      {
        key: 'api_key',
        label: 'OpenRouter API Key',
        type: 'password',
        placeholder: 'sk-or-v1-...',
        hint: 'Get it from openrouter.ai/keys. Leave blank to use free models (rate-limited).',
        envFallback: 'OPENROUTER_API_KEY',
      },
      {
        key: 'model',
        label: 'Preferred AI Model (optional)',
        type: 'text',
        placeholder: 'deepseek/deepseek-v4-flash:free',
        hint: 'Leave blank to use the default free model. Find model IDs at openrouter.ai/models.',
        envFallback: 'OPENROUTER_MODEL',
      },
    ],
  },
  {
    id: 'hubspot',
    label: 'HubSpot — CRM Sync',
    description: 'Push new CRM leads to HubSpot as contacts, keep their status/notes in sync, and import HubSpot contacts back into the CRM.',
    docsHref: 'https://app.hubspot.com/private-apps',
    fields: [
      {
        key: 'access_token',
        label: 'HubSpot Private App Token',
        type: 'password',
        placeholder: 'pat-na1-...',
        hint: 'HubSpot → Settings → Integrations → Private Apps → create an app with crm.objects.contacts read + write scopes, then copy the access token.',
        envFallback: 'HUBSPOT_ACCESS_TOKEN',
      },
    ],
  },
  {
    id: 'gemini',
    label: 'Gemini — Admin SEO Assistant',
    description:
      'Writes SEO titles, meta descriptions and product copy drafts for the console. Staff-side only: the customer-facing assistant is OpenRouter, and this key is never sent to a browser.',
    docsHref: 'https://aistudio.google.com/app/apikey',
    fields: [
      {
        key: 'api_key',
        label: 'Gemini API Key',
        type: 'password',
        placeholder: 'AIza...',
        hint: 'Stored server-side. Generating copy needs it; drafting and every other screen does not.',
        envFallback: 'GEMINI_API_KEY',
      },
      {
        key: 'model',
        label: 'Model (optional)',
        type: 'text',
        placeholder: 'gemini-2.5-flash',
        hint: 'Leave blank to use the default. A model this key cannot use is reported by Test connection.',
        envFallback: 'GEMINI_MODEL',
      },
    ],
  },
  {
    id: 'deepseek',
    label: 'DeepSeek — AI Text',
    description: 'Fast, budget-friendly text generation. Attached from AI Hub → DeepSeek, and used whenever DeepSeek is the default provider.',
    docsHref: 'https://platform.deepseek.com/api_keys',
    fields: [
      {
        key: 'api_key',
        label: 'DeepSeek API Key',
        type: 'password',
        placeholder: 'sk-...',
        hint: 'Server-side only. Get it from platform.deepseek.com → API keys.',
        envFallback: 'DEEPSEEK_API_KEY',
      },
      {
        key: 'model',
        label: 'Model (optional)',
        type: 'text',
        placeholder: 'deepseek-chat',
        hint: 'Leave blank to use deepseek-chat.',
        envFallback: 'DEEPSEEK_MODEL',
      },
    ],
  },
  {
    id: 'openai',
    label: 'OpenAI — AI Text',
    description: 'GPT text generation through the official OpenAI API. Attached from AI Hub → OpenAI, or used as the OpenAI Codex fallback.',
    docsHref: 'https://platform.openai.com/api-keys',
    fields: [
      {
        key: 'api_key',
        label: 'OpenAI API Key',
        type: 'password',
        placeholder: 'sk-...',
        hint: 'Server-side only. This is the supported OpenAI path; the Codex card is for ChatGPT-subscription tokens.',
        envFallback: 'OPENAI_API_KEY',
      },
      {
        key: 'model',
        label: 'Model (optional)',
        type: 'text',
        placeholder: 'gpt-4o-mini',
        hint: 'Leave blank to use gpt-4o-mini.',
        envFallback: 'OPENAI_MODEL',
      },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic — AI Text',
    description: 'Claude text generation through the Anthropic Messages API. Attached from AI Hub → Anthropic Claude.',
    docsHref: 'https://console.anthropic.com/settings/keys',
    fields: [
      {
        key: 'api_key',
        label: 'Anthropic API Key',
        type: 'password',
        placeholder: 'sk-ant-...',
        hint: 'Server-side only. Get it from console.anthropic.com → API keys.',
        envFallback: 'ANTHROPIC_API_KEY',
      },
      {
        key: 'model',
        label: 'Model (optional)',
        type: 'text',
        placeholder: 'claude-haiku-4-5-20251001',
        hint: 'Leave blank to use claude-haiku-4-5-20251001.',
        envFallback: 'ANTHROPIC_MODEL',
      },
    ],
  },
  {
    id: 'codex',
    label: 'OpenAI Codex — ChatGPT subscription',
    description:
      'Uses a ChatGPT/Codex subscription token instead of an API key. The token is the access token written by `codex login` (~/.codex/auth.json). This endpoint is not a documented public API, so failures are reported plainly; for production text work prefer the OpenAI API key.',
    docsHref: 'https://developers.openai.com/codex/',
    fields: [
      {
        key: 'api_key',
        label: 'ChatGPT OAuth Token',
        type: 'password',
        placeholder: 'eyJ...',
        hint: 'Stored server-side only. Run `codex login` locally and copy tokens.access_token from ~/.codex/auth.json.',
        envFallback: 'CHATGPT_OAUTH_TOKEN',
      },
      {
        key: 'model',
        label: 'Model (optional)',
        type: 'text',
        placeholder: 'gpt-5-codex',
        hint: 'Leave blank to use gpt-5-codex.',
        envFallback: 'CODEX_MODEL',
      },
    ],
  },
  {
    id: 'resend',
    label: 'Resend — Transactional Email',
    description:
      'Order mail and campaign mail. Nothing claims a mail was sent while this is unconfigured, and campaign sending stays disabled.',
    docsHref: 'https://resend.com/api-keys',
    fields: [
      {
        key: 'api_key',
        label: 'Resend API Key',
        type: 'password',
        placeholder: 're_...',
        hint: 'Sending also needs a verified sending domain.',
        envFallback: 'RESEND_API_KEY',
      },
      { key: 'from_email', label: 'From Email Address', type: 'text', placeholder: 'sales@himalayankoh.com', envFallback: 'RESEND_FROM' },
      { key: 'admin_email', label: 'Admin Notification Email', type: 'text', placeholder: 'admin@himalayankoh.com', envFallback: 'ADMIN_NOTIFICATION_EMAIL' },
    ],
  },
  {
    id: 'freight',
    label: 'Ocean Freight — Live Rates',
    description:
      'The wholesale container calculator prices ocean legs from the rates you type under Wholesale → Ocean freight. Add a provider here to fetch live market rates for the same lanes; until a provider is connected the calculator keeps using your manual rates, clearly labelled, and never invents a number.',
    docsHref: 'https://www.webfreightos.com/',
    fields: [
      {
        key: 'provider',
        label: 'Provider',
        type: 'text',
        placeholder: 'manual  ·  freightos',
        hint: 'Leave as manual, or enter freightos to look up live rates on the lanes you quote.',
        envFallback: 'FREIGHT_PROVIDER',
      },
      {
        key: 'api_key',
        label: 'API Key',
        type: 'password',
        placeholder: 'live_...',
        hint: 'From your Freightos / WebCargo account. Server-side only — never shown on the storefront.',
        envFallback: 'FREIGHT_API_KEY',
      },
      {
        key: 'api_secret',
        label: 'API Secret',
        type: 'password',
        placeholder: 'your API secret',
        hint: 'Only when the provider issues a key/secret pair. Leave blank for a single token.',
        envFallback: 'FREIGHT_API_SECRET',
      },
      {
        key: 'account_code',
        label: 'Account / Office Code',
        type: 'text',
        placeholder: 'e.g. your WebCargo office code',
        hint: 'Some contracts price per account. Leave blank when the provider does not ask for one.',
        envFallback: 'FREIGHT_ACCOUNT_CODE',
      },
      {
        key: 'api_base',
        label: 'API Base URL (optional)',
        type: 'text',
        placeholder: 'https://…',
        hint: 'Leave blank to use the provider default. Set it when the provider gives you a regional endpoint.',
        envFallback: 'FREIGHT_API_BASE',
      },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing & Traffic',
    description: 'Google Analytics, AdSense, and overall marketing configuration.',
    fields: [
      { key: 'gaEnabled', label: 'Enable Google Analytics (GA4)', type: 'toggle', envFallback: 'GA_ENABLED' },
      { key: 'ga4Id', label: 'GA4 Measurement ID', type: 'text', placeholder: 'G-XXXXXXXXXX', envFallback: 'GA4_MEASUREMENT_ID' },
      { key: 'adsenseEnabled', label: 'Enable Google AdSense', type: 'toggle', envFallback: 'ADSENSE_ENABLED' },
      { key: 'adsenseClientId', label: 'AdSense Client ID', type: 'text', placeholder: 'ca-pub-...', envFallback: 'ADSENSE_CLIENT_ID' },
      { key: 'publisherId', label: 'Publisher ID', type: 'text', placeholder: 'pub-...', envFallback: 'ADSENSE_PUBLISHER_ID' },
      { key: 'autoAdsEnabled', label: 'Enable Auto Ads', type: 'toggle', envFallback: 'ADSENSE_AUTO_ADS' },
      { key: 'manualAdsEnabled', label: 'Enable Manual Ad Units', type: 'toggle', envFallback: 'ADSENSE_MANUAL_ADS' },
      { key: 'adsTxtRecord', label: 'Ads.txt Record', type: 'text', envFallback: 'ADS_TXT_RECORD' },
      { key: 'density', label: 'Manual ad density', type: 'text', envFallback: '' },
      { key: 'mobileDensity', label: 'Mobile ad density', type: 'text', envFallback: '' },
      { key: 'showAdsOnMobile', label: 'Show ads on mobile', type: 'toggle', envFallback: '' },
      { key: 'placements', label: 'Manual placement settings', type: 'text', envFallback: '' },
      { key: 'exclusions', label: 'Excluded ad pages', type: 'text', envFallback: '' },
    ]
  },
  {
    id: 'omnisend',
    label: 'Omnisend — Email Marketing',
    description: 'Sync contacts, subscriptions, and campaigns to Omnisend.',
    docsHref: 'https://app.omnisend.com/settings/api',
    fields: [
      { key: 'api_key', label: 'Omnisend API Key', type: 'password', placeholder: '...', envFallback: 'OMNISEND_API_KEY' },
    ]
  },
  {
    id: 'leados',
    label: 'LeadOS — B2B Lead Gen',
    description: 'B2B Lead gen, ICP scoring, and outreach automation.',
    fields: [
      { key: 'api_key', label: 'LeadOS API Key', type: 'password', placeholder: '...', envFallback: 'LEADOS_API_KEY' },
    ]
  },
  {
    id: 'google_oauth',
    label: 'Google OAuth — Search Console & AdSense',
    description: 'OAuth credentials used to authenticate the owner for Search Console and AdSense APIs. (Server-side only).',
    fields: [
      { key: 'client_id', label: 'OAuth Client ID', type: 'text', placeholder: '509630118186-....apps.googleusercontent.com', envFallback: 'GOOGLE_OAUTH_CLIENT_ID' },
      { key: 'client_secret', label: 'OAuth Client Secret', type: 'password', placeholder: 'GOCSPX-...', envFallback: 'GOOGLE_OAUTH_CLIENT_SECRET' },
    ]
  },

  // ─── Add future services below ───────────────────────────────────────────────
];
