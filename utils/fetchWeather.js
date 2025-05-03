require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const fetchWithFallback = require('./fetchWithFallback');
const { getCachedAstronomyData } = require('./cacheAstronomy');

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
  console.log(`[DEBUG] Luxon local time: ${localNow.toISO()}`);

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

async function fetchForecastEmbed() {
  const [forecastRes, tideRes] = await Promise.all([
    fetchWithFallback(forecastEndpoint).then(r => r.json()),
    fetchWithFallback(tideEndpoint).then(r => r.json())
  ]);
  const astronomyRes = await getCachedAstronomyData(astronomyEndpoint);

  const localNow = DateTime.now().setZone(timezone);
  const localHour = localNow.hour;
  const isAfter5PM = localHour >= 17;

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

  const tempsF = forecastWindow.map(h => cToF(h.airTemperature?.noaa ?? 0));
  const winds = forecastWindow.map(h => h.windSpeed?.noaa ?? 0);
  const waveHeights = forecastWindow.map(h => h.waveHeight?.noaa ?? 0);
  console.log('[DEBUG] Full waveHeight objects:', forecastWindow.map(h => h.waveHeight));
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
  const sunrise = DateTime.fromISO(astro.sunrise).setZone(timezone).toFormat('hh:mm a');
  const sunset = DateTime.fromISO(astro.sunset).setZone(timezone).toFormat('hh:mm a');
  const moonPhase = astro.moonPhase?.current?.text || 'Unknown';
  const moonEmoji = getMoonEmoji(moonPhase);

  const greeting = getGreetingEmoji(localHour);
  const dateString = localNow.toFormat('MMM dd');
  const localTime = localNow.toFormat('hh:mm a');
  const utcTime = localNow.setZone('UTC').toFormat('HH:mm');

  const tideSummary = tideRes.data.slice(0, 4).map(t => {
    const time = DateTime.fromISO(t.time).setZone(timezone).toFormat('h:mm a');
    return `${t.type} at ${time}`;
  }).join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🌤️ Camp Tockwogh Forecast`)
    .addFields(
      { name: 'Date', value: dateString, inline: true },
      { name: 'Current Time', value: `${localTime} EDT / ${utcTime} UTC\n${greeting}`, inline: true },
      { name: 'Forecast Window', value: getCurrentForecastWindowLabel(localHour), inline: false },
      {
        name: 'Temperature',
        value: `🔻 ${tempMin}°F\n🔺 ${tempMax}°F`,
        inline: true
      },
      {
        name: 'Humidity',
        value: `🔻 ${humidityMin.toFixed(0)}%\n🔺 ${humidityMax.toFixed(0)}%`,
        inline: true
      },
      {
        name: 'Wind',
        value: `🔻 ${mpsToMph(windMin)} mph\n🔺 ${mpsToMph(windMax)} mph\n➡️ ${degreesToCompass(windAvgDir)} avg`,
        inline: true
      },
      ...(waveMax > 0 ? [{
        name: 'Wave Height',
        value: `🔻 ${metersToFeet(waveMin)} ft\n🔺 ${metersToFeet(waveMax)} ft`,
        inline: true
      }] : []),
      
      {
        name: 'Water Temp',
        value: `🔻 ${cToF(waterTempMin)}°F\n🔺 ${cToF(waterTempMax)}°F`,
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
