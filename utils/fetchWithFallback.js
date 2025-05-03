const fetch = require('node-fetch');

async function fetchWithFallback(url) {
  const keys = [
    process.env.STORMGLASS_API_KEY_PRIMARY,
    process.env.STORMGLASS_API_KEY_SECONDARY,
    process.env.STORMGLASS_API_KEY_TERTIARY
  ];

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const res = await fetch(url, { headers: { Authorization: key } });

    try {
      const data = await res.json();
      if (res.status !== 429 && !data.errors?.key) {
        return data;
      }
      console.warn(`[⚠️] API key ${i + 1} failed (status ${res.status}). Trying next...`);
    } catch (err) {
      console.warn(`[⚠️] API key ${i + 1} response invalid. Trying next...`);
    }
  }

  throw new Error('All StormGlass API keys failed or quota exceeded');
}

module.exports = fetchWithFallback;
