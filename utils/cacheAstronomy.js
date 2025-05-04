const fs = require('fs');
const path = require('path');
const fetchWithFallback = require('./fetchWithFallback');

const astronomyCachePath = path.join(__dirname, '../data/astronomyCache.json');

function isToday(dateString) {
  const today = new Date().toISOString().split('T')[0];
  return dateString.startsWith(today);
}

async function getCachedAstronomyData(astronomyEndpoint) {
  try {
    if (fs.existsSync(astronomyCachePath)) {
      const cached = JSON.parse(fs.readFileSync(astronomyCachePath, 'utf8'));
      if (isToday(cached.date)) return cached.data;
    }
  } catch (err) {
    console.warn('⚠️ Failed to read astronomy cache, fetching fresh.');
  }

  const fresh = await fetchWithFallback(astronomyEndpoint);
  fs.writeFileSync(astronomyCachePath, JSON.stringify({
    date: new Date().toISOString(),
    data: fresh
  }, null, 2));
  return fresh;
}

module.exports = { getCachedAstronomyData };
