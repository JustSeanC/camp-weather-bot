// Cleaned fetchWeather.js with Open-Meteo primary + StormGlass fallback
require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const xml2js = require('xml2js');
const fetchWithFallback = require('./fetchWithFallback');
const { getCachedAstronomyData } = require('./cacheAstronomy');
const { fetchOpenMeteoData } = require('./fetchOpenMeteo');

// Coordinates and timezone from .env
const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';

// StormGlass params (only marine/astro relevant + fallback fields)
const weatherParams = [
  'airTemperature', 'windSpeed', 'windDirection', 'windGust',
  'cloudCover', 'waveHeight', 'waterTemperature', 'humidity'
];

// API endpoints
const forecastEndpoint = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}`;
const tideEndpoint = `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lng}`;
const astronomyEndpoint = `https://api.stormglass.io/v2/astronomy/point?lat=${lat}&lng=${lng}`;

// Utility functions
function degreesToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}
function mpsToMph(ms) { return (ms * 2.23694).toFixed(1); }
function metersToFeet(m) { return (m * 3.28084).toFixed(1); }
function cToF(c) { return ((c * 9) / 5 + 32).toFixed(1); }

// Time label for next post
function getNextForecastTime() {
  const now = DateTime.now().setZone(timezone);
  const nextHour = now.hour < 7 ? 7 : now.hour < 12 ? 12 : now.hour < 17 ? 17 : 7;
  const target = nextHour === 7 && now.hour >= 17 ? now.plus({ days: 1 }) : now;
  const forecastTime = target.set({ hour: nextHour, minute: 0 });
  return `**${forecastTime.toFormat('hh:mm a')} EDT / ${forecastTime.setZone('UTC').toFormat('HH:mm')} UTC** on ${forecastTime.toFormat('MMM d')}`;
}

function getCurrentForecastWindowLabel(hour) {
  const now = DateTime.now().setZone(timezone);
  const next = hour < 7 ? 7 : hour < 12 ? 12 : hour < 17 ? 17 : 7;
  const end = hour >= 17 ? '7:00 AM (next day)' : now.set({ hour: next }).toFormat('hh:mm a');
  return `${now.set({ hour }).toFormat('hh:mm a')} → ${end} EDT`;
}

// Emoji logic
function getMoonEmoji(phase) {
  const map = {
    'New Moon': '🌑', 'Waxing Crescent': '🌒', 'First Quarter': '🌓',
    'Waxing Gibbous': '🌔', 'Full Moon': '🌕', 'Waning Gibbous': '🌖',
    'Last Quarter': '🌗', 'Waning Crescent': '🌘'
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

// Get METAR temp & humidity for fallback
async function fetchLatestMetarTempAndHumidity(station = 'KMTN') {
  const url = `https://aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&requestType=retrieve&format=xml&stationString=${station}&hoursBeforeNow=1`;
  try {
    const res = await fetch(url);
    const xml = await res.text();
    const parsed = await xml2js.parseStringPromise(xml);
    const metars = parsed?.response?.data?.[0]?.METAR;
    if (!metars?.length) return null;
    const metar = metars[0];
    const tempC = parseFloat(metar.temp_c?.[0]);
    const dewpointC = parseFloat(metar.dewpoint_c?.[0]);
    if (isNaN(tempC) || isNaN(dewpointC)) return null;
    const rh = 100 * (Math.exp((17.625 * dewpointC) / (243.04 + dewpointC)) / Math.exp((17.625 * tempC) / (243.04 + tempC)));
    return { tempC, humidity: parseFloat(rh.toFixed(1)) };
  } catch (err) {
    console.error('[❌] METAR fetch failed:', err);
    return null;
  }
}

// Prefer Open-Meteo fallback value over StormGlass
function getBestValue(h, fallbackKey, sgKey, converter = v => v) {
  const fallback = h?.fallback?.[fallbackKey];
  const primary = sgKey.includes('.') ? h?.[sgKey.split('.')[0]]?.[sgKey.split('.')[1]] : h?.[sgKey];
  if (typeof fallback === 'number') return converter(fallback);
  if (typeof primary === 'number') return converter(primary);
  return null;
}

module.exports = {
  fetchForecastEmbed: async function () {
    const [forecastRes, tideRes] = await Promise.all([
      fetchWithFallback(forecastEndpoint),
      fetchWithFallback(tideEndpoint)
    ]);
    const astronomyRes = await getCachedAstronomyData(astronomyEndpoint);
    const openMeteoForecast = await fetchOpenMeteoData();
    const metar = await fetchLatestMetarTempAndHumidity();
    const localNow = DateTime.now().setZone(timezone);
    const localHour = localNow.hour;
    const dateString = `${localNow.toFormat('MMMM')} ${getOrdinal(localNow.day)}, ${localNow.year}`;

    // Filter forecast window based on time block
    const forecastStart = localNow;
    const forecastEnd = localHour >= 17
      ? localNow.plus({ days: 1 }).set({ hour: 7 })
      : localNow.set({ hour: localHour < 7 ? 7 : localHour < 12 ? 12 : 17 });
      
      if (!forecastRes || !Array.isArray(forecastRes.hours)) {
        throw new Error('No valid forecast data returned from StormGlass');
      }
    console.warn('[DEBUG] forecastRes:', JSON.stringify(forecastRes, null, 2));

    const forecastWindow = forecastRes.hours.filter(h => {
      const t = DateTime.fromISO(h.time, { zone: timezone });
      return t >= forecastStart && t < forecastEnd;
    }).map(h => {
      const iso = DateTime.fromISO(h.time, { zone: timezone }).toISO({ suppressMilliseconds: true });
      const fallback = openMeteoForecast?.find(o => o.time === iso);
      return { ...h, fallback };
    });

    // Extract values with Open-Meteo preference
    const tempVals = forecastWindow.map(h => getBestValue(h, 'temperature', 'airTemperature.noaa')).filter(v => v !== null);
    const humidityVals = forecastWindow.map(h => getBestValue(h, 'humidity', 'humidity.noaa')).filter(v => v !== null);
    const windVals = forecastWindow.map(h => getBestValue(h, 'windSpeed', 'windSpeed.noaa', v => v / 2.23694)).filter(v => v !== null);
    const gustVals = forecastWindow.map(h => getBestValue(h, 'windGust', 'windGust.noaa', v => v / 2.23694)).filter(v => v !== null);
    const windDirs = forecastWindow.map(h => getBestValue(h, 'windDir', 'windDirection.noaa')).filter(v => typeof v === 'number');

    // Apply METAR fallback override for temp max
    const tempMinC = Math.min(...tempVals);
    let tempMaxC = Math.max(...tempVals);
    if (metar && metar.tempC > tempMaxC && Math.abs(metar.tempC - tempMaxC) <= 5) tempMaxC = metar.tempC;

    // Aggregate
    const humidityMin = Math.min(...humidityVals);
    const humidityMax = Math.max(...humidityVals);
    const windMin = Math.min(...windVals);
    const windMax = Math.max(...windVals);
    const gustMax = Math.max(...gustVals);
    const windAvgDir = windDirs.reduce((a, b) => a + b, 0) / windDirs.length;

    // Marine data from StormGlass only
    const waveVals = forecastWindow.map(h => h.waveHeight?.sg).filter(v => typeof v === 'number');
    const waveMin = waveVals.length ? Math.min(...waveVals) : 0;
    const waveMax = waveVals.length ? Math.max(...waveVals) : 0;

    // Sunrise/sunset, tides, moon
    const showAdvisory = waveMax >= 1.22 || windMax >= 8.05;
    const astro = astronomyRes.data?.[0] || {};
    const sunrise = astro.sunrise ? DateTime.fromISO(astro.sunrise).setZone(timezone).toFormat('hh:mm a') : 'N/A';
    const sunset = astro.sunset ? DateTime.fromISO(astro.sunset).setZone(timezone).toFormat('hh:mm a') : 'N/A';
    const moonPhase = astro.moonPhase?.current?.text || 'Unknown';
    const moonEmoji = getMoonEmoji(moonPhase);
    const greeting = getGreetingEmoji(localHour);
    const localTime = localNow.toFormat('hh:mm a');
    const utcTime = localNow.setZone('UTC').toFormat('HH:mm');

    // Final Discord embed
    const embed = new EmbedBuilder()
      .setTitle(`🌤️ Camp Tockwogh Forecast`)
      .addFields(
        { name: 'Date', value: dateString, inline: true },
        { name: 'Current Time', value: `${localTime} EDT / ${utcTime} UTC\n${greeting}`, inline: true },
        { name: 'Forecast Window', value: getCurrentForecastWindowLabel(localHour), inline: false },
        { name: 'Air Temp.', value: `🔻 ${cToF(tempMinC)}°F\n🔹 ${cToF(tempMaxC)}°F`, inline: true },
        { name: 'Humidity', value: `🔻 ${humidityMin.toFixed(0)}%\n🔹 ${humidityMax.toFixed(0)}%`, inline: true },
        {
          name: 'Wind',
          value: windMax < 1 ? '🪁 Calm' : [
            windMin > 0 ? `🔻 ${mpsToMph(windMin)} mph` : null,
            `🔹 ${mpsToMph(windMax)} mph`,
            gustMax > windMax ? `💨 Gusts to ${mpsToMph(gustMax)} mph` : null,
            `➡️ ${degreesToCompass(windAvgDir)} avg`
          ].filter(Boolean).join('\n'),
          inline: true
        },
        ...(waveMax > 0 ? [{
          name: 'Wave Height',
          value: waveMax < 0.3 ? '🌊 Calm' : [
            waveMin > 0 ? `🔻 ${metersToFeet(waveMin)} ft` : null,
            `🔹 ${metersToFeet(waveMax)} ft`
          ].filter(Boolean).join('\n'),
          inline: true
        }] : []),
        { name: 'Sunrise / Sunset', value: `🌅 ${sunrise} / 🌇 ${sunset}`, inline: true },
        { name: 'Moon Phase', value: `${moonEmoji} ${moonPhase}`, inline: true },
        { name: 'Next Forecast', value: getNextForecastTime(), inline: false },
        ...(showAdvisory ? [{
          name: '⚠️ Marine Advisory Forecast',
          value: 'Potential for Small Craft Advisory.\nConditions may be hazardous — use caution.',
          inline: false
        }] : [])
      )
      .setFooter({ text: 'Forecast from Open-Meteo + StormGlass hybrid' })
      .setColor(showAdvisory ? 0xffa500 : 0x00ff00)
      .setTimestamp();

    return embed;
  }
};
