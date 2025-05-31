const fetch = require('node-fetch');

const API = 'https://api.weather.gov/alerts/active?point=39.2449,-75.9791';

(async () => {
  try {
    const res = await fetch(API, {
      headers: { 'User-Agent': 'CampWeatherBot/1.0' }
    });

    const text = await res.text();
    if (text.startsWith('<')) {
      console.error('❌ Got HTML instead of JSON:\n', text.slice(0, 300));
      return;
    }

    const json = JSON.parse(text);
    console.log(`✅ Received ${json.features.length} alerts.`);
    for (const alert of json.features) {
      console.log(`→ ${alert.properties.event} | Severity: ${alert.properties.severity}`);
    }
  } catch (err) {
    console.error('❌ Error fetching alerts:', err.message);
  }
})();
