const fetch = require('node-fetch');

async function fetchWithFallback(url) {
  const headersPrimary = { Authorization: process.env.STORMGLASS_API_KEY_PRIMARY };
  const headersSecondary = { Authorization: process.env.STORMGLASS_API_KEY_SECONDARY };

  const resPrimary = await fetch(url, { headers: headersPrimary });
  if (resPrimary.status !== 429) return resPrimary;

  console.warn(`[⚠️] Rate limit hit on primary token for ${url}. Trying secondary...`);
  return await fetch(url, { headers: headersSecondary });
}

module.exports = fetchWithFallback;
