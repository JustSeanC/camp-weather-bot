// Enhanced fetchWeather.js with full hybrid logic + restored fields
require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const { DateTime } = require('luxon');
const xml2js = require('xml2js');
const fetchWithFallback = require('./fetchWithFallback');
const { getCachedAstronomyData } = require('./cacheAstronomy');
const { fetchOpenMeteoData } = require('./fetchOpenMeteo');
const DEBUG_LOG_WEATHER_SOURCE = process.argv.includes('--debug');
const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';

const weatherParams = [
  'airTemperature', 'windSpeed', 'windDirection', 'gust',
  'cloudCover', 'waveHeight', 'waterTemperature', 'humidity'
];


const forecastEndpoint = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}`;
const tideEndpoint = `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lng}`;
const astronomyEndpoint = `https://api.stormglass.io/v2/astronomy/point?lat=${lat}&lng=${lng}`;

function degreesToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}
function mpsToMph(ms) { return (ms * 2.23694).toFixed(1); }
function metersToFeet(m) { return (m * 3.28084).toFixed(1); }
function cToF(c) { return ((c * 9) / 5 + 32).toFixed(1); }
function fToC(f) { return ((f - 32) * 5 / 9).toFixed(1); }

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
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

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

function summarizeSky(clouds) {
  const avg = clouds.reduce((a, b) => a + b, 0) / clouds.length;
  if (avg < 10) return 'Clear';
  if (avg < 40) return 'Mostly Sunny';
  if (avg < 70) return 'Partly Cloudy';
  if (avg < 90) return 'Cloudy';
  return 'Overcast';
}

function getBestValue(h, fallbackKey, sgKey, converter = v => v, label = '', isFallbackFahrenheit = false) {
  const fallbackVal = h?.fallback?.[fallbackKey];
  const primaryVal = sgKey.includes('.') ? h?.[sgKey.split('.')[0]]?.[sgKey.split('.')[1]] : h?.[sgKey];

  let usedValue = null;
  let source = null;

  if (typeof fallbackVal === 'number') {
    usedValue = isFallbackFahrenheit ? fToC(fallbackVal) : fallbackVal;
    source = '🟦 Open-Meteo';
  } else if (typeof primaryVal === 'number') {
    usedValue = primaryVal;
    source = '🟧 StormGlass';
  }

  if (usedValue !== null) {
    if (DEBUG_LOG_WEATHER_SOURCE) console.log(`[${source}] Used for ${label}: ${usedValue}`);
    return converter(usedValue);
  }

  if (DEBUG_LOG_WEATHER_SOURCE) console.log(`[⚠️ Missing] ${label}`);
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

    const forecastStart = localNow;
    const forecastEnd = localHour >= 17
      ? localNow.plus({ days: 1 }).set({ hour: 7 })
      : localNow.set({ hour: localHour < 7 ? 7 : localHour < 12 ? 12 : 17 });
      if (!forecastRes || !Array.isArray(forecastRes.hours)) {
        console.error('[❌] No valid forecast data returned from StormGlass:', JSON.stringify(forecastRes, null, 2));
        throw new Error('No valid forecast data returned from StormGlass');
      }      
      const forecastWindow = forecastRes.hours.filter(h => {
        const t = DateTime.fromISO(h.time, { zone: timezone });
        return t >= forecastStart && t < forecastEnd;
      }).map(h => {
        const iso = DateTime.fromISO(h.time).toUTC().toFormat("yyyy-MM-dd'T'HH:mm");
        const fallback = openMeteoForecast?.find(o => o.time === iso);
        if (fallback) {
          console.log(`[🟦 Open-Meteo] Matched fallback for ${iso}`);
        } else {
          console.log(`[⚠️ No fallback] No Open-Meteo match for ${iso}`);
        }
        return { ...h, fallback };
      });
      

      const tempVals = forecastWindow.map(h =>
        getBestValue(h, 'temperature', 'airTemperature.noaa', v => v, 'Air Temp', true)
      ).filter(v => v !== null);
      
      const feelsLikeVals = forecastWindow.map(h =>
        typeof h.fallback?.feelsLike === 'number' ? fToC(h.fallback.feelsLike) : null
      ).filter(v => v !== null);
      
    
    const humidityVals = forecastWindow.map(h =>
      getBestValue(h, 'humidity', 'humidity.noaa', v => v, 'Humidity')
    ).filter(v => v !== null);
    
    const windVals = forecastWindow.map(h =>
      getBestValue(h, 'windSpeed', 'windSpeed.noaa', v => v / 2.23694, 'Wind Speed')
    ).filter(v => v !== null);
    
    const gustVals = forecastWindow.map(h =>
      getBestValue(h, 'windGust', 'gust.noaa', v => v / 2.23694, 'Gust')
    ).filter(v => v !== null);
    
    const windDirs = forecastWindow.map(h =>
      getBestValue(h, 'windDir', 'windDirection.noaa', v => v, 'Wind Dir')
    ).filter(v => typeof v === 'number');
    
    const cloudCoverVals = forecastWindow.map(h => getBestValue(h, 'cloudCover', 'cloudCover.noaa')).filter(v => typeof v === 'number');

    const waveVals = forecastWindow.map(h =>
      h.waveHeight?.sg ?? null
    ).filter(v => typeof v === 'number');
    
    const waterTemps = forecastWindow.map(h =>
      h.waterTemperature?.sg ?? null
    ).filter(v => typeof v === 'number');
    

    const tempMinC = Math.min(...tempVals);
    let tempMaxC = Math.max(...tempVals);
    if (metar && metar.tempC > tempMaxC && Math.abs(metar.tempC - tempMaxC) <= 5) tempMaxC = metar.tempC;

    const humidityMin = Math.min(...humidityVals);
    const humidityMax = Math.max(...humidityVals);
    const windMin = Math.min(...windVals);
    const windMax = Math.max(...windVals);
    const gustMax = Math.max(...gustVals);
    const windAvgDir = windDirs.length
    ? windDirs.reduce((a, b) => a + b, 0) / windDirs.length
    : 0;
  
    const waveMin = waveVals.length ? Math.min(...waveVals) : 0;
    const waveMax = waveVals.length ? Math.max(...waveVals) : 0;
    const waterAvg = waterTemps.length ? waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length : null;
    const showAdvisory = waveMax >= 1.22 || windMax >= 8.05;

    const skyCond = summarizeSky(cloudCoverVals);
    const astro = astronomyRes.data?.[0] || {};
    const sunrise = astro.sunrise ? DateTime.fromISO(astro.sunrise).setZone(timezone).toFormat('hh:mm a') : 'N/A';
    const sunset = astro.sunset ? DateTime.fromISO(astro.sunset).setZone(timezone).toFormat('hh:mm a') : 'N/A';
    const moonPhase = astro.moonPhase?.current?.text || 'Unknown';
    const moonEmoji = getMoonEmoji(moonPhase);
    const greeting = getGreetingEmoji(localHour);
    const localTime = localNow.toFormat('hh:mm a');
    const utcTime = localNow.setZone('UTC').toFormat('HH:mm');

    const tideTimes = tideRes.data?.filter(t => t && t.time)?.slice(0, 4).map(t => `*${t.type}* at ${DateTime.fromISO(t.time).setZone(timezone).toFormat('h:mm a')}`);

    const embed = new EmbedBuilder()
      .setTitle(`🌤️ Camp Tockwogh Forecast`)
      .addFields(
        { name: 'Date', value: dateString, inline: true },
        { name: 'Current Time', value: `${localTime} EDT / ${utcTime} UTC\n${greeting}`, inline: true },
        { name: 'Forecast Window', value: getCurrentForecastWindowLabel(localHour), inline: false },
        { name: 'Air Temp.', value: `🔻 ${cToF(tempMinC)}°F (${tempMinC.toFixed(1)}°C)\n🔺 ${cToF(tempMaxC)}°F (${tempMaxC.toFixed(1)}°C)`, inline: true },
        ...(feelsLikeVals.length ? [{ name: 'Feels Like', value: `🌡️ ${cToF(Math.max(...feelsLikeVals))}°F (${Math.max(...feelsLikeVals).toFixed(1)}°C)`, inline: true }] : []),
        { name: 'Humidity', value: `🔻 ${humidityMin.toFixed(0)}%\n🔺 ${humidityMax.toFixed(0)}%`, inline: true },
        {
          name: 'Wind',
          value: windMax < 1 ? '🪁 Calm' : [
            windMin > 0 ? `🔻 ${mpsToMph(windMin)} mph (${windMin.toFixed(1)} m/s)` : null,
            `🔺 ${mpsToMph(windMax)} mph (${windMax.toFixed(1)} m/s)`,
            gustMax > windMax ? `💨 Gusts to ${mpsToMph(gustMax)} mph (${gustMax.toFixed(1)} m/s)` : null,
            `➡️ ${degreesToCompass(windAvgDir)} avg`
          ].filter(Boolean).join('\n'),
          inline: true
        },
        ...(waveMax > 0 ? [{
          name: 'Wave Height',
          value: [
            waveMin > 0 ? `🔻 ${metersToFeet(waveMin)} ft (${waveMin.toFixed(2)} m)` : null,
            `🔺 ${metersToFeet(waveMax)} ft (${waveMax.toFixed(2)} m)`
          ].filter(Boolean).join('\n'),
          inline: true
        }] : []),
        ...(waterAvg !== null ? [{
          name: 'Water Temp.',
          value: `${cToF(waterAvg)}°F (${waterAvg.toFixed(1)}°C)`,
          inline: true
        }] : []),
        { name: 'Sky Cond.', value: skyCond, inline: true },
        ...(tideTimes?.length ? [{ name: 'Tides', value: tideTimes.join('\n'), inline: false }] : []),
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