#!/usr/bin/env node
/**
 * Submit site URLs to the IndexNow protocol (supported by Bing, Yandex, Seznam, Naver)
 * for instant search engine indexing.
 *
 * Usage:
 *   node scripts/submit-indexnow.mjs
 */

const KEY = 'e8f49826312a48a9b5df16a7d79b9241';
const HOST = 'himalayankoh.com';
const KEY_LOCATION = `https://${HOST}/${KEY}.txt`;

const URLS = [
  `https://${HOST}/`,
  `https://${HOST}/products`,
  `https://${HOST}/products?category=edible-pink-salt`,
  `https://${HOST}/products?category=live-stock`,
  `https://${HOST}/about`,
  `https://${HOST}/contact`,
  `https://${HOST}/resources`,
  `https://${HOST}/resources/salt-block-vs-loose-salt-for-livestock`,
  `https://${HOST}/blog`,
  `https://${HOST}/blog/how-to-cook-with-himalayan-pink-salt`,
  `https://${HOST}/wholesale`,
  `https://${HOST}/faqs`,
  `https://${HOST}/gallery`,
];

async function submit() {
  process.stdout.write(`Submitting ${URLS.length} URLs to IndexNow for ${HOST}...\n`);

  const payload = {
    host: HOST,
    key: KEY,
    keyLocation: KEY_LOCATION,
    urlList: URLS,
  };

  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify(payload),
    });

    if (res.status === 200 || res.status === 202) {
      process.stdout.write(`✓ IndexNow accepted submission (HTTP ${res.status}). Search engines notified successfully.\n`);
    } else {
      const text = await res.text();
      process.stdout.write(`IndexNow returned status ${res.status}: ${text}\n`);
    }
  } catch (err) {
    process.stderr.write(`Failed to reach IndexNow API: ${err.message}\n`);
  }
}

submit();
