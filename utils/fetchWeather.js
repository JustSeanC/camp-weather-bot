require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';

const weatherParams = [
  'airTemperature',
  'windSpeed',
  'windDirection',
  'cloudCover',
  'waveHeight',
  'waterTemperature'
];

const forecastEndpoint = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}`;
const tideEndpoint = `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lng}`;
const astronomyEndpoint = `https://api.stormglass.io/v2/astronomy/point?lat=${lat}&lng=${lng}`;

// Fallback logic
async function fetchWithFallback(url) {
  const headersPrimary = { Authorization: process.env.STORMGLASS_API_KEY_PRIMARY };
  const headersSecondary = { Authorization: process.env.STORMGLASS_API_KEY_SECONDARY };
  const resPrimary = await fetch(url, { headers: headersPrimary });
  if (resPrimary.status !== 429) return resPrimary;
  console.warn(`[⚠️] Rate limit hit on primary token for ${url}. Trying secondary...`);
  return await fetch(url, { headers: headersSecondary });
}

function degreesToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

function mpsToMph(ms) {
  return (ms * 2.23694).toFixed(1);
}

function metersToFeet(m) {
  return (m * 3.28084).toFixed(1);
}

function cToF(c) {
  return ((c * 9) / 5 + 32).toFixed(1);
}

function formatHour12(hour) {
  const date = new Date();
  date.setHours(hour, 0, 0);
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: timezone
  });
}

function getNextForecastTime() {
  const now = new Date();
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  const hour = localNow.getHours();
  let nextHour, isTomorrow = false;
  if (hour < 7) nextHour = 7;
  else if (hour < 12) nextHour = 12;
  else if (hour < 17) nextHour = 17;
  else { nextHour = 7; localNow.setDate(localNow.getDate() + 1); isTomorrow = true; }
  localNow.setHours(nextHour, 0, 0, 0);
  const localFormatted = localNow.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  const utcFormatted = localNow.toUTCString().match(/\d{2}:\d{2}/)[0];
  const dateFormatted = localNow.toLocaleDateString('en-US', { timeZone: timezone, month: 'short', day: 'numeric' });
  return isTomorrow
    ? `**${localFormatted} EDT / ${utcFormatted} UTC** on ${dateFormatted}`
    : `**${localFormatted} EDT / ${utcFormatted} UTC**`;
}

function getMoonEmoji(phase) {
  const map = {
    'New Moon': '🌑', 'Waxing Crescent': '🌒', 'First Quarter': '🌓',
    'Waxing Gibbous': '🌔', 'Full Moon': '🌕', 'Waning Gibbous': '🌖',
    'Last Quarter': '🌗', 'Waning Crescent': '🌘',
  };
  return map[phase] || '🌙';
}

function getGreetingEmoji(hour) {
  if (hour < 12) return '🌅 Good Morning';
  if (hour < 17) return '🌞 Good Afternoon';
  return '🌇 Good Evening';
}

async function fetchForecastEmbed() {
  const [forecastRes, tideRes, astronomyRes] = await Promise.all([
    fetchWithFallback(forecastEndpoint).then(r => r.json()),
    fetchWithFallback(tideEndpoint).then(r => r.json()),
    fetchWithFallback(astronomyEndpoint).then(r => r.json()),
  ]);

  const now = new Date();
  const localHour = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }));

  let startHour, endHour;
  if (localHour < 7) { startHour = 5; endHour = 7; }
  else if (localHour < 12) { startHour = 7; endHour = 12; }
  else if (localHour < 17) { startHour = 12; endHour = 17; }
  else { startHour = 17; endHour = 7; }

  const forecastWindow = forecastRes.hours.filter(h => {
    const hour = new Date(h.time).getHours();
    return (startHour < endHour) ? hour >= startHour && hour < endHour : hour >= startHour || hour < endHour;
  });

  if (forecastWindow.length === 0) throw new Error("No forecast data for current window");

  const tempsF = forecastWindow.map(h => cToF(h.airTemperature?.noaa ?? 0));
  const winds = forecastWindow.map(h => h.windSpeed?.noaa ?? 0);
  const waveHeights = forecastWindow.map(h => h.waveHeight?.noaa ?? 0);
  const weatherTypes = forecastWindow.map(h => {
    const c = h.cloudCover?.noaa ?? 0;
    if (c < 10) return 'Clear';
    if (c < 40) return 'Mostly Sunny';
    if (c < 70) return 'Partly Cloudy';
    if (c < 90) return 'Cloudy';
    return 'Overcast';
  });

  const waterTempC = forecastWindow[0].waterTemperature?.noaa ?? 'N/A';
  const waterTempF = waterTempC !== 'N/A' ? cToF(waterTempC) : 'N/A';
  const windDirs = forecastWindow.map(h => h.windDirection?.noaa ?? 0);
  const windAvgDir = windDirs.reduce((a, b) => a + b, 0) / windDirs.length;
  const tempMin = Math.min(...tempsF);
  const tempMax = Math.max(...tempsF);
  const windMin = Math.min(...winds);
  const windMax = Math.max(...winds);
  const waveMin = Math.min(...waveHeights);
  const waveMax = Math.max(...waveHeights);

  const waveAlert = waveMax >= 1.22;
  const windAlert = windMax >= 8.05;
  const showAdvisory = waveAlert || windAlert;

  const astro = astronomyRes.data[0];
  const sunrise = new Date(astro.sunrise).toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const sunset = new Date(astro.sunset).toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const moonPhase = astro.moonPhase?.current?.text || 'Unknown';
  const moonEmoji = getMoonEmoji(moonPhase);

  const greeting = getGreetingEmoji(localHour);
  const dateString = now.toLocaleDateString();
  const localTime = now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const utcTime = now.toUTCString().match(/\d{2}:\d{2}/)[0];

  const tideSummary = tideRes.data.slice(0, 4).map(t => {
    const time = new Date(t.time).toLocaleTimeString('en-US', {
      hour: 'numeric', minute: '2-digit', timeZone: timezone,
    });
    return `${t.type} at ${time}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🌤️ Camp Tockwogh Forecast`)
    .addFields(
      { name: 'Date', value: dateString, inline: true },
      { name: 'Current Time', value: `${localTime} EDT / ${utcTime} UTC\n${greeting}`, inline: true },
      {
        name: 'Forecast Window',
        value: `${formatHour12(startHour)} → ${endHour === 7 ? '7:00 AM (next day)' : formatHour12(endHour)} EDT`,
        inline: false
      },
      {
        name: 'Temperature',
        value: `🔻 ${tempMin}°F (${((tempMin - 32) * 5 / 9).toFixed(1)}°C)\n🔺 ${tempMax}°F (${((tempMax - 32) * 5 / 9).toFixed(1)}°C)`,
        inline: true
      },
      {
        name: 'Wind',
        value: `🔻 ${mpsToMph(windMin)} mph (${windMin.toFixed(1)} m/s)\n🔺 ${mpsToMph(windMax)} mph (${windMax.toFixed(1)} m/s)\n➡️ Direction: ${degreesToCompass(windAvgDir)} avg`,
        inline: true
      },
      {
        name: 'Wave Height',
        value: `🔻 ${metersToFeet(waveMin)} ft (${waveMin.toFixed(2)} m)\n🔺 ${metersToFeet(waveMax)} ft (${waveMax.toFixed(2)} m)`,
        inline: true
      },
      {
        name: 'Water Temp',
        value: `${waterTempF}°F (${waterTempC}°C)`,
        inline: true
      },
      {
        name: 'Sky Conditions',
        value: [...new Set(weatherTypes)].join(', '),
        inline: true
      },
      {
        name: 'Tides',
        value: tideSummary || 'No data',
        inline: false
      },
      {
        name: 'Sunrise / Sunset',
        value: `🌅 ${sunrise} / 🌇 ${sunset}`,
        inline: true
      },
      {
        name: 'Moon Phase',
        value: `${moonEmoji} ${moonPhase}`,
        inline: true
      },
      {
        name: 'Next Forecast',
        value: getNextForecastTime(),
        inline: false
      },
      ...(showAdvisory ? [{
        name: '⚠️ Marine Advisory Forecast',
        value: 'Potential for Small Craft Advisory.\nConditions may be hazardous — use caution.',
        inline: false
      }] : [])
    )
    .setFooter({ text: 'Forecast data from Storm Glass. Advisory logic is estimated.' })
    .setColor(showAdvisory ? 0xffa500 : 0x00ff00)
    .setTimestamp();

  return embed;
}

module.exports = { fetchForecastEmbed };
