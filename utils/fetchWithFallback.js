const fetch = require('node-fetch');

async function fetchWithFallback(url) {
  const headersPrimary = { Authorization: process.env.STORMGLASS_API_KEY_PRIMARY };
  const headersSecondary = { Authorization: process.env.STORMGLASS_API_KEY_SECONDARY };

  const resPrimary = await fetch(url, { headers: headersPrimary });
  const jsonPrimary = await resPrimary.clone().json();

  // Trigger fallback if rate limit error is in response body
  if (jsonPrimary?.errors?.key === 'API quota exceeded') {
    console.warn(`[⚠️] Primary API key quota exceeded. Falling back...`);
    const resSecondary = await fetch(url, { headers: headersSecondary });
    return resSecondary;
  }

  return resPrimary;
}

module.exports = fetchWithFallback;
