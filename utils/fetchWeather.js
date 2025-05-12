/**
 * Hybrid Data Logic:
 * - Forecast data (temp, humidity, wind, cloud cover): Prefer Open-Meteo, fallback to StormGlass.
 * - Marine and astronomy data (waves, water temp, tides, moon/sun): StormGlass only.
 * - getBestValue() logs which source was used when DEBUG flag is active.
 */
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
function getWeatherLabelAndEmoji(code) {
  const map = {
    0: ['Clear', '☀️'], 1: ['Mainly Clear', '🌤️'], 2: ['Partly Cloudy', '⛅'], 3: ['Overcast', '☁️'],
    45: ['Fog', '🌫️'], 48: ['Rime Fog', '🌫️'], 51: ['Light Drizzle', '🌦️'], 53: ['Moderate Drizzle', '🌧️'], 55: ['Dense Drizzle', '🌧️'],
    56: ['Freezing Drizzle', '🌧️❄️'], 57: ['Heavy Freezing Drizzle', '🌧️❄️'],
    61: ['Light Rain', '🌧️'], 63: ['Moderate Rain', '🌧️'], 65: ['Heavy Rain', '🌧️'],
    66: ['Freezing Rain', '🌧️❄️'], 67: ['Heavy Freezing Rain', '🌧️❄️'],
    71: ['Light Snow', '🌨️'], 73: ['Moderate Snow', '❄️'], 75: ['Heavy Snow', '❄️'],
    80: ['Light Showers', '🌦️'], 81: ['Moderate Showers', '🌧️'], 82: ['Violent Showers', '🌧️⚠️'],
    95: ['Thunderstorm', '⛈️'], 96: ['Thunderstorm + Hail', '⛈️❄️'], 99: ['Severe Thunderstorm', '⛈️⚠️']
  };
  return map[code] || ['Unknown', '❓'];
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
  const fallbackVal = h?.fallback?.[fallbackKey]; // Open-Meteo
  const primaryVal = sgKey.includes('.') ? h?.[sgKey.split('.')[0]]?.[sgKey.split('.')[1]] : h?.[sgKey]; // StormGlass

  let usedValue = null;
  let source = null;

  if (typeof fallbackVal === 'number') {
    usedValue = isFallbackFahrenheit ? fToC(fallbackVal) : fallbackVal;
    source = '🟦 Open-Meteo';
  } else if (typeof primaryVal === 'number') {
    usedValue = primaryVal;
    source = '🟧 StormGlass';
  }

  if (usedValue !== null && DEBUG_LOG_WEATHER_SOURCE) {
    console.log(`[${source}] Used for ${label}: ${usedValue}`);
  }

  if (usedValue === null && DEBUG_LOG_WEATHER_SOURCE) {
    console.log(`[⚠️ Missing] ${label}`);
  }

  return usedValue !== null ? converter(usedValue) : null;
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

    const forecastStart = localNow.minus({ hours: 4 });
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
      

      function getValuesWithSourceLog(forecastWindow, fallbackKey, sgKey, converter = v => v, label = '', isFallbackFahrenheit = false) {
        const values = [];
        const sources = [];
      
        for (const h of forecastWindow) {
          const fallbackVal = h?.fallback?.[fallbackKey];
          const primaryVal = sgKey.includes('.') ? h?.[sgKey.split('.')[0]]?.[sgKey.split('.')[1]] : h?.[sgKey];
      
          let usedValue = null;
          let source = null;
      
          if (typeof fallbackVal === 'number') {
            usedValue = isFallbackFahrenheit ? fToC(fallbackVal) : fallbackVal;
            source = 'Open-Meteo';
          } else if (typeof primaryVal === 'number') {
            usedValue = primaryVal;
            source = 'StormGlass';
          }
      
          if (usedValue !== null) {
            values.push(converter(usedValue));
            sources.push(source);
          }
        }
      
        if (DEBUG_LOG_WEATHER_SOURCE && values.length > 0) {
          const sourceCount = sources.reduce((acc, s) => {
            acc[s] = (acc[s] || 0) + 1;
            return acc;
          }, {});
          const mostUsed = Object.entries(sourceCount).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown';
          console.log(`✅ ${label} values sourced from: ${mostUsed}`);
        }
      
        return values;
      }
      
      const tempVals = getValuesWithSourceLog(forecastWindow, 'temperature', 'airTemperature.noaa', v => v, 'Air Temp', true);
      const feelsLikeValsF = forecastWindow
  .map(h => typeof h.fallback?.feelsLike === 'number' ? h.fallback.feelsLike : null)
  .filter(v => v !== null);

const feelsLikeMinF = Math.min(...feelsLikeValsF);
const feelsLikeMaxF = Math.max(...feelsLikeValsF);

      
      
      
      const humidityVals = getValuesWithSourceLog(forecastWindow, 'humidity', 'humidity.noaa', v => v, 'Humidity');
      const windVals = getValuesWithSourceLog(forecastWindow, 'windSpeed', 'windSpeed.noaa', v => v / 2.23694, 'Wind Speed');
      const gustVals = getValuesWithSourceLog(forecastWindow, 'windGust', 'gust.noaa', v => v / 2.23694, 'Gust');
      const windDirs = getValuesWithSourceLog(forecastWindow, 'windDir', 'windDirection.noaa', v => v, 'Wind Dir')
        .filter(v => typeof v === 'number');
      const cloudCoverVals = getValuesWithSourceLog(forecastWindow, 'cloudCover', 'cloudCover.noaa', v => v, 'Cloud Cover');
      
      // StormGlass-only (no hybrid or logging needed)
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

    const skyCond = summarizeSky(cloudCoverVals);
      // Precipitation summary (must go before totalPrecip and blendedCondition)
const precipProbs = forecastWindow.map(h =>
  typeof h.fallback?.precipProb === 'number' ? h.fallback.precipProb : null
).filter(v => v !== null);
const maxProb = Math.max(...precipProbs, 0);

const precipAmounts = forecastWindow.map(h =>
  typeof h.fallback?.precip === 'number' ? h.fallback.precip : null
).filter(v => v !== null);
const totalPrecip = precipAmounts.reduce((a, b) => a + b, 0);

// Weather code summary
const weatherCodes = forecastWindow.map(h => h.fallback?.weatherCode ?? null).filter(Boolean);
const mostCommonCode = weatherCodes.sort((a, b) =>
  weatherCodes.filter(v => v === a).length - weatherCodes.filter(v => v === b).length
).pop();
const [desc, emoji] = getWeatherLabelAndEmoji(mostCommonCode);

// Sky condition + precipitation blend
let blendedCondition;
if ([95, 96, 99].includes(mostCommonCode)) {
  blendedCondition = 'Thunderstorms likely';
} else if ([71, 73, 75].includes(mostCommonCode)) {
  blendedCondition = 'Snow expected';
} else if ([45, 48].includes(mostCommonCode)) {
  blendedCondition = 'Foggy';
} else {
  blendedCondition = summarizeSky(cloudCoverVals);

  if (maxProb >= 80 || totalPrecip >= 0.2) {
    blendedCondition += ' with heavy rain';
  } else if (maxProb >= 50 || totalPrecip >= 0.05) {
    blendedCondition += ' with possible rain';
  } else if (maxProb >= 20) {
    blendedCondition += ' with slight chance of rain';
  }
}

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
        { name: 'Air Temp.', value: `🔺 ${Math.round(cToF(tempMaxC))}°F (${Math.round(tempMaxC)}°C)\n🔻 ${Math.round(cToF(tempMinC))}°F (${Math.round(tempMinC)}°C)`, inline: true },
        ...(feelsLikeValsF.length ? [{
  name: 'Feels Like (Max/Min)',
  value: `🔺 ${feelsLikeMaxF.toFixed(1)}°F (${fToC(feelsLikeMaxF)}°C)\n🔻 ${feelsLikeMinF.toFixed(1)}°F (${fToC(feelsLikeMinF)}°C)`,
  inline: true
}] : []),

        
{ name: 'Humidity', value: `🔺 ${humidityMax.toFixed(0)}%\n🔻 ${humidityMin.toFixed(0)}%`, inline: true },
        {
  name: 'Wind',
  value: windMax < 1 ? '🪁 Calm' : (
    [
      `🔺 ${Math.round(mpsToMph(windMax))} mph (${windMax.toFixed(1)} m/s)`,
      windMin > 0 ? `🔻 ${Math.round(mpsToMph(windMin))} mph (${windMin.toFixed(1)} m/s)` : null,
      gustMax > windMax ? `💨 Gusts to ${Math.round(mpsToMph(gustMax))} mph (${gustMax.toFixed(1)} m/s)` : null,
      `➡️ ${degreesToCompass(windAvgDir)} avg`
    ].filter(Boolean).join('\n')
  ),
  inline: true
},

                  
        ...(waveMax > 0 ? [{
          name: 'Wave Height',
          value: [
            `🔺 ${metersToFeet(waveMax)} ft (${waveMax.toFixed(2)} m)`,
waveMin > 0 ? `🔻 ${metersToFeet(waveMin)} ft (${waveMin.toFixed(2)} m)` : null,
          ].filter(Boolean).join('\n'),
          inline: true
        }] : []),
        ...(waterAvg !== null ? [{
          name: 'Water Temp.',
value: `${Math.round(cToF(waterAvg))}°F (${Math.round(waterAvg)}°C)`,
          inline: true
        }] : []),
        { name: 'Condition', value: `${emoji} ${blendedCondition}`, inline: true },
        ...(tideTimes?.length ? [{ name: 'Tides', value: tideTimes.join('\n'), inline: false }] : []),
        { name: 'Sunrise / Sunset', value: `🌅 ${sunrise} / 🌇 ${sunset}`, inline: true },
        { name: 'Moon Phase', value: `${moonEmoji} ${moonPhase}`, inline: true },
        { name: 'Next Forecast', value: getNextForecastTime(), inline: false },
      )
      .setFooter({ text: 'Forecast from Open-Meteo & Storm Glass' })
      .setColor(0x00ff00)
      .setTimestamp();

    return embed;
  }
};
