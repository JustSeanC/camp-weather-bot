require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const fetchWithFallback = require('./fetchWithFallback');
const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';

const weatherParams = [
  'airTemperature',
  'windSpeed',
  'windDirection',
  'cloudCover',
  'waveHeight',
  'waterTemperature',
  'humidity'
];

const forecastEndpoint = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}`;
const tideEndpoint = `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lng}`;
const astronomyEndpoint = `https://api.stormglass.io/v2/astronomy/point?lat=${lat}&lng=${lng}`;
const { getCachedAstronomyData } = require('./cacheAstronomy');


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
  console.log(`[DEBUG] Server time now: ${now.toISOString()}`);

  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));
  console.log(`[DEBUG] Local time (${timezone}): ${localNow.toISOString()}`);

  const localHour = localNow.getHours();
  console.log(`[DEBUG] Local hour: ${localHour}`);

  let nextHour;
  if (localHour < 7) nextHour = 7;
  else if (localHour < 12) nextHour = 12;
  else if (localHour < 17) nextHour = 17;
  else {
    localNow.setDate(localNow.getDate() + 1);
    nextHour = 7;
  }

  localNow.setHours(nextHour, 0, 0, 0);
  console.log(`[DEBUG] Adjusted local forecast time: ${localNow.toISOString()}`);

  const localTime = localNow.toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit'
  });

  const utcTime = localNow.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC'
  });
  

  const dateFormatted = localNow.toLocaleDateString('en-US', {
    timeZone: timezone,
    month: 'short',
    day: 'numeric'
  });

  console.log(`[DEBUG] Final localTime: ${localTime}`);
  console.log(`[DEBUG] Final utcTime: ${utcTime}`);
  console.log(`[DEBUG] Final date: ${dateFormatted}`);

  return `**${localTime} EDT / ${utcTime} UTC** on ${dateFormatted}`;
}




function getCurrentForecastWindowLabel(hour) {
  function formatHour12(h) {
    const d = new Date();
    d.setHours(h, 0, 0);
    return d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: timezone
    });
  }

  let next;
  if (hour < 7) next = 7;
  else if (hour < 12) next = 12;
  else if (hour < 17) next = 17;
  else next = 7;

  const endLabel = (hour >= 17) ? '7:00 AM (next day)' : formatHour12(next);
  return `${formatHour12(hour)} → ${endLabel} EDT`;
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
  const [forecastRes, tideRes] = await Promise.all([
  fetchWithFallback(forecastEndpoint).then(r => r.json()),
  fetchWithFallback(tideEndpoint).then(r => r.json()),
]);

const astronomyRes = await getCachedAstronomyData(astronomyEndpoint);

  const now = new Date();
  const localHour = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }));
  const localNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }));

 function getNextScheduledHour(hour) {
  if (hour < 7) return 7;
  if (hour < 12) return 12;
  if (hour < 17) return 17;
  return 31; // special value to signal 7AM next day
}

const startHour = localHour;
const nextScheduled = getNextScheduledHour(localHour);

let endHour = nextScheduled;
let spanOverMidnight = false;
if (nextScheduled === 31) {
  endHour = 7;
  spanOverMidnight = true;
}

if (!forecastRes.hours || !Array.isArray(forecastRes.hours)) {
  console.error('[❌] forecastRes.hours is missing or malformed:', forecastRes);
  throw new Error('No forecast data received from StormGlass');
}

  const forecastWindow = forecastRes.hours.filter(h => {
  const date = new Date(h.time);
  const hour = date.getHours();
  const isToday = new Date(date.toLocaleString('en-US', { timeZone: timezone })).getDate() === localNow.getDate();
  if (!spanOverMidnight) return hour >= startHour && hour < endHour;
  return hour >= startHour || (hour < endHour && !isToday);
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
const humidities = forecastWindow.map(h => h.humidity?.noaa ?? 0);
const humidityMin = Math.min(...humidities);
const humidityMax = Math.max(...humidities);

  const waterTemps = forecastWindow.map(h => h.waterTemperature?.noaa ?? 0);
const waterTempMin = Math.min(...waterTemps);
const waterTempMax = Math.max(...waterTemps);
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
  value: getCurrentForecastWindowLabel(localHour),
  inline: false
},

      {
        name: 'Temperature',
        value: `🔻 ${tempMin}°F (${((tempMin - 32) * 5 / 9).toFixed(1)}°C)\n🔺 ${tempMax}°F (${((tempMax - 32) * 5 / 9).toFixed(1)}°C)`,
        inline: true
      },
      {
  name: 'Humidity',
  value: `🔻 ${humidityMin.toFixed(0)}%\n🔺 ${humidityMax.toFixed(0)}%`,
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
  value: `🔻 ${cToF(waterTempMin)}°F (${waterTempMin.toFixed(1)}°C)\n🔺 ${cToF(waterTempMax)}°F (${waterTempMax.toFixed(1)}°C)`,
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
