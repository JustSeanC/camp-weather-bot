require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const fetchWithFallback = require('./fetchWithFallback');
const { getCachedAstronomyData } = require('./cacheAstronomy');
const DEBUG_WEBHOOK_URL = 'https://discord.com/api/webhooks/1368332136297267301/-Ta8_ueZEwCv1OQ3qpT-xNKNpLUdGDkikQ4w0PYc6tLLgwnld8kJ6yRru1NDXH22dWlA';
// debug logging for stuff
const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';

const weatherParams = [
  'airTemperature', 'windSpeed', 'windDirection',
  'cloudCover', 'waveHeight', 'waterTemperature', 'humidity'
];

const forecastEndpoint = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}`;
const tideEndpoint = `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lng}`;
const astronomyEndpoint = `https://api.stormglass.io/v2/astronomy/point?lat=${lat}&lng=${lng}`;

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

function getNextForecastTime() {
  const localNow = DateTime.now().setZone(timezone);
  //console.log(`[DEBUG] Luxon local time: ${localNow.toISO()}`);

  let nextHour;
  if (localNow.hour < 7) nextHour = 7;
  else if (localNow.hour < 12) nextHour = 12;
  else if (localNow.hour < 17) nextHour = 17;
  else nextHour = 7;

  let forecastTime = localNow.set({ hour: nextHour, minute: 0, second: 0, millisecond: 0 });
  if (localNow.hour >= 17) forecastTime = forecastTime.plus({ days: 1 });

  const localTime = forecastTime.toFormat('hh:mm a');
  const utcTime = forecastTime.setZone('UTC').toFormat('HH:mm');
  const dateFormatted = forecastTime.toFormat('MMM d');

  return `**${localTime} EDT / ${utcTime} UTC** on ${dateFormatted}`;
}
// debug code posting to discord
async function postDebugToDiscord(title, jsonData) {
  if (!DEBUG_WEBHOOK_URL) return;

  const jsonString = JSON.stringify(jsonData, null, 2);
  const chunks = [];

  for (let i = 0; i < jsonString.length; i += 1900) {
    chunks.push(jsonString.slice(i, i + 1900));
  }

  for (let i = 0; i < chunks.length; i++) {
    const content = `\`\`\`json\n${chunks[i]}\n\`\`\``;
    await fetch(DEBUG_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'Weather Debug',
        content: `**${title}${chunks.length > 1 ? ` (Part ${i + 1}/${chunks.length})` : ''}**\n${content}`
      })
    });
  }
}


function getCurrentForecastWindowLabel(hour) {
  const now = DateTime.now().setZone(timezone);
  let next = hour < 7 ? 7 : hour < 12 ? 12 : hour < 17 ? 17 : 7;
  const endLabel = (hour >= 17)
    ? '7:00 AM (next day)'
    : now.set({ hour: next }).toFormat('hh:mm a');
  return `${now.set({ hour }).toFormat('hh:mm a')} → ${endLabel} EDT`;
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
function getOrdinal(n) {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}


async function fetchForecastEmbed() {
  const [forecastRes, tideRes] = await Promise.all([
    fetchWithFallback(forecastEndpoint),
    fetchWithFallback(tideEndpoint)
  ]);
  const astronomyRes = await getCachedAstronomyData(astronomyEndpoint);

  const localNow = DateTime.now().setZone(timezone);
  const localHour = localNow.hour;
  const isAfter5PM = localHour >= 17;
  const dateString = `${localNow.toFormat('MMMM')} ${getOrdinal(localNow.day)}, ${localNow.year}`; // e.g. "July 15th, 2025"
  const nextScheduled = localHour < 7 ? 7 : localHour < 12 ? 12 : localHour < 17 ? 17 : 7;
  const spanOverMidnight = isAfter5PM;
  const endHour = nextScheduled;
  const startHour = localHour;

  if (!forecastRes.hours || !Array.isArray(forecastRes.hours)) {
    console.error('[❌] forecastRes.hours is missing or malformed:', forecastRes);
    throw new Error('No forecast data received from StormGlass');
  }

  const forecastWindow = forecastRes.hours.filter(h => {
    const forecastDate = DateTime.fromISO(h.time, { zone: timezone });
    const hour = forecastDate.hour;
    if (!spanOverMidnight) return hour >= startHour && hour < endHour;
    return hour >= startHour || hour < endHour;
  });

  if (forecastWindow.length === 0) throw new Error("No forecast data for current window");

  const winds = forecastWindow.map(h => h.windSpeed?.noaa ?? 0);
  const waveHeights = forecastWindow.map(h => h.waveHeight?.sg ?? 0);
  //console.log('[DEBUG] Full waveHeight objects:', forecastWindow.map(h => h.waveHeight));
  const weatherTypes = forecastWindow.map(h => {
    const c = h.cloudCover?.noaa ?? 0;
    if (c < 10) return 'Clear';
    if (c < 40) return 'Mostly Sunny';
    if (c < 70) return 'Partly Cloudy';
    if (c < 90) return 'Cloudy';
    return 'Overcast';
  });
  const humidities = forecastWindow.map(h => h.humidity?.noaa).filter(v => typeof v === 'number');
  const humidityMin = humidities.length ? Math.min(...humidities) : 0;
  const humidityMax = humidities.length ? Math.max(...humidities) : 0;
  
  const waterTemps = forecastWindow.map(h => {
  const vals = [h.waterTemperature?.meto, h.waterTemperature?.sg].filter(v => typeof v === 'number');
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
  }).filter(v => typeof v === 'number');
  const waterTempMin = waterTemps.length ? Math.min(...waterTemps) : 0;
  const waterTempMax = waterTemps.length ? Math.max(...waterTemps) : 0;
  
  const windDirs = forecastWindow.map(h => h.windDirection?.noaa).filter(v => typeof v === 'number');
  const windAvgDir = windDirs.length ? windDirs.reduce((a, b) => a + b, 0) / windDirs.length : 0;
  
  const tempsF = forecastWindow.map(h => h.airTemperature?.noaa).filter(v => typeof v === 'number');
  const tempMin = tempsF.length ? cToF(Math.min(...tempsF)) : '0';
  const tempMax = tempsF.length ? cToF(Math.max(...tempsF)) : '0';
  // air temp debug - helps with averages
  await postDebugToDiscord(
    '🌡️ DEBUG: Full raw airTemperature data from all sources',
    forecastWindow.map(h => ({
      time: h.time,
      sources: h.airTemperature
    }))
  );
  
  
  const windMin = winds.length ? Math.min(...winds) : 0;
  const windMax = winds.length ? Math.max(...winds) : 0;
  
  const waveMin = waveHeights.length ? Math.min(...waveHeights) : 0;
  const waveMax = waveHeights.length ? Math.max(...waveHeights) : 0;
  
  const waveAlert = waveMax >= 1.22; // 4 ft
  const windAlert = windMax >= 8.05; // 18 mph
  const showAdvisory = waveAlert || windAlert;
  
  const astro = astronomyRes.data?.[0] || {};
  const sunrise = astro.sunrise ? DateTime.fromISO(astro.sunrise).setZone(timezone).toFormat('hh:mm a') : 'N/A';
  const sunset = astro.sunset ? DateTime.fromISO(astro.sunset).setZone(timezone).toFormat('hh:mm a') : 'N/A';
  const moonPhase = astro.moonPhase?.current?.text || 'Unknown';
  const moonEmoji = getMoonEmoji(moonPhase);
  
  const greeting = getGreetingEmoji(localHour);
  const localTime = localNow.toFormat('hh:mm a');
  const utcTime = localNow.setZone('UTC').toFormat('HH:mm');
  
  //Get average sky condition
  function getAverageSkyCondition(forecastWindow) {
    const cloudPercents = forecastWindow
      .map(h => h.cloudCover?.noaa)
      .filter(v => typeof v === 'number');
  
    if (cloudPercents.length === 0) return 'Unknown';
  
    const avgCloud = cloudPercents.reduce((a, b) => a + b, 0) / cloudPercents.length;
  
    if (avgCloud < 10) return 'Clear';
    if (avgCloud < 40) return 'Mostly Sunny';
    if (avgCloud < 70) return 'Partly Cloudy';
    if (avgCloud < 90) return 'Cloudy';
    return 'Overcast';
  }
  
  
  // Get tide data
  const tideSummary = Array.isArray(tideRes.data) && tideRes.data.length
  ? tideRes.data.slice(0, 4).map(t => {
      const time = DateTime.fromISO(t.time).setZone(timezone).toFormat('h:mm a');
      return `${t.type} at ${time}`;
    }).join('\n')
  : 'No data';

  const embed = new EmbedBuilder()
    .setTitle(`🌤️ Camp Tockwogh Forecast`)
    .addFields(
      { name: 'Date', value: dateString, inline: true },
      { name: 'Current Time', value: `${localTime} EDT / ${utcTime} UTC\n${greeting}`, inline: true },
      { name: 'Forecast Window', value: getCurrentForecastWindowLabel(localHour), inline: false },
      {
        name: 'Temp.',
        value: `🔻 ${tempMin}°F (${Math.min(...tempsF).toFixed(1)}°C)\n🔺 ${tempMax}°F (${Math.max(...tempsF).toFixed(1)}°C)`,
        inline: true
      },
      
      {
        name: 'Humidity',
        value: `🔻 ${humidityMin.toFixed(0)}%\n🔺 ${humidityMax.toFixed(0)}%`,
        inline: true
      },
      {
        name: 'Wind',
        value:
          windMax < 1
            ? '🪁 Calm'
            : [
                windMin > 0 ? `🔻 ${mpsToMph(windMin)} mph (${windMin.toFixed(1)} m/s)` : null,
                `🔺 ${mpsToMph(windMax)} mph (${windMax.toFixed(1)} m/s)`,
                `➡️ ${degreesToCompass(windAvgDir)} avg`
              ].filter(Boolean).join('\n'),
        inline: true
      },
      
      ...(waveMax > 0 ? [{
        name: 'Wave Height',
        value:
          waveMax < 0.3
            ? '🌊 Calm'
            : [
                waveMin > 0 ? `🔻 ${metersToFeet(waveMin)} ft (${waveMin.toFixed(2)} m)` : null,
                `🔺 ${metersToFeet(waveMax)} ft (${waveMax.toFixed(2)} m)`
              ].filter(Boolean).join('\n'),
        inline: true
      }] : []),
      
      {
        name: 'Water Temp.',
        value: `🔻 ${cToF(waterTempMin)}°F (${waterTempMin.toFixed(1)}°C)\n🔺 ${cToF(waterTempMax)}°F (${waterTempMax.toFixed(1)}°C)`,
        inline: true
      },
      {
        name: 'Sky Cond.',
        value: getAverageSkyCondition(forecastWindow),
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
