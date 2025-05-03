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

const xml2js = require('xml2js');

async function fetchLatestMetarTempAndHumidity(station = 'KMTN') {
  const url = `https://aviationweather.gov/adds/dataserver_current/httpparam?dataSource=metars&requestType=retrieve&format=xml&stationString=${station}&hoursBeforeNow=1`;

  try {
    const res = await fetch(url);
    const xml = await res.text();

    const parsed = await xml2js.parseStringPromise(xml);
    const metars = parsed.response.data[0].METAR;

    if (!metars || metars.length === 0) {
      console.warn(`[⚠️] No METAR data found for ${station}`);
      return null;
    }

    const metar = metars[0];
    const tempC = parseFloat(metar.temp_c?.[0]);
    const dewpointC = parseFloat(metar.dewpoint_c?.[0]);

    if (isNaN(tempC) || isNaN(dewpointC)) return null;

    // Calculate relative humidity from temp/dewpoint
    const rh = 100 * (Math.exp((17.625 * dewpointC) / (243.04 + dewpointC)) / Math.exp((17.625 * tempC) / (243.04 + tempC)));

    return {
      tempC,
      humidity: parseFloat(rh.toFixed(1))
    };
  } catch (err) {
    console.error('[❌] METAR fetch failed:', err);
    return null;
  }
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

  const forecastStart = localNow;
  const forecastEnd = isAfter5PM
    ? localNow.plus({ days: 1 }).set({ hour: 7, minute: 0, second: 0 })
    : localNow.set({ hour: nextScheduled, minute: 0, second: 0 });
  
  const forecastWindow = forecastRes.hours.filter(h => {
    const forecastDate = DateTime.fromISO(h.time, { zone: timezone });
    return forecastDate >= forecastStart && forecastDate < forecastEnd;
  });
  const metar = await fetchLatestMetarTempAndHumidity();
  if (!metar) {
    console.warn('[⚠️] METAR data unavailable — continuing with forecast data only.');
  }
  
  console.log('⏱️ Forecast window times:');
forecastWindow.forEach(h => {
  const time = DateTime.fromISO(h.time, { zone: timezone }).toFormat('ff');
  const tempC = h.airTemperature?.noaa;
  const humidity = h.humidity?.noaa;
  let feelsLike = 'N/A';

  if (typeof tempC === 'number' && typeof humidity === 'number') {
    const tempF = (tempC * 9) / 5 + 32;
    if (tempF >= 80 && humidity >= 40) {
      const HI =
        -42.379 +
        2.04901523 * tempF +
        10.14333127 * humidity -
        0.22475541 * tempF * humidity -
        0.00683783 * tempF * tempF -
        0.05481717 * humidity * humidity +
        0.00122874 * tempF * tempF * humidity +
        0.00085282 * tempF * humidity * humidity -
        0.00000199 * tempF * tempF * humidity * humidity;
      feelsLike = `${HI.toFixed(1)}°F`;
    }
  }

  console.log(`${time} | Temp: ${tempC ?? 'N/A'}°C | Humidity: ${humidity ?? 'N/A'}% | Feels Like: ${feelsLike}`);
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
  
// Cleaned temperature data: only include hours where all 3 sources exist and are within ±5°C
// Get best-available air temp using ECMWF + SG average
function getBestTempC(hour) {
  const ecmwf = hour.airTemperature?.ecmwf;
  const sg = hour.airTemperature?.sg;
  const valid = [ecmwf, sg].filter(v => typeof v === 'number');
  return valid.length ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
}

const tempsCleaned = forecastWindow
  .map(getBestTempC)
  .filter(v => typeof v === 'number');

const tempMinC = tempsCleaned.length ? Math.min(...tempsCleaned) : 0;
let tempMaxC = tempsCleaned.length ? Math.max(...tempsCleaned) : 0;

// Replace tempMaxC with METAR value if it's higher AND within ±5°C
if (metar && typeof metar.tempC === 'number') {
  const maxDiff = Math.abs(metar.tempC - tempMaxC);
  if (metar.tempC > tempMaxC && maxDiff <= 5) {
    console.log(`📈 Overriding forecast max with METAR: ${metar.tempC}°C`);
    tempMaxC = metar.tempC;
  }
}
const tempMin = cToF(tempMinC);
const tempMax = cToF(tempMaxC);


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
  //Get Feels Like
  function computeHeatIndex(celsius, humidity) {
    const tempF = (celsius * 9) / 5 + 32;
    if (tempF < 80 || humidity < 40) return null;
  
    const HI =
      -42.379 +
      2.04901523 * tempF +
      10.14333127 * humidity -
      0.22475541 * tempF * humidity -
      0.00683783 * tempF * tempF -
      0.05481717 * humidity * humidity +
      0.00122874 * tempF * tempF * humidity +
      0.00085282 * tempF * humidity * humidity -
      0.00000199 * tempF * tempF * humidity * humidity;
  
    return HI.toFixed(1);
  }
  const feelsLikeTemps = forecastWindow.map(h => {
    const t = getBestTempC(h);
    const hmd = h.humidity?.noaa;
    if (typeof t === 'number' && typeof hmd === 'number') {
      return computeHeatIndex(t, hmd);
    }
    return null;
  }).filter(v => v !== null);

const feelsMin = feelsLikeTemps.length ? Math.min(...feelsLikeTemps).toFixed(1) : null;
const feelsMax = feelsLikeTemps.length ? Math.max(...feelsLikeTemps).toFixed(1) : null;

  if (metar && typeof metar.tempC === 'number' && typeof metar.humidity === 'number') {
    const hi = computeHeatIndex(metar.tempC, metar.humidity);
    if (hi && !isNaN(hi)) feelsLikeTemps.push(parseFloat(hi));
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
        name: 'Air Temp.',
        value: `🔻 ${tempMin}°F (${tempMinC.toFixed(1)}°C)\n🔺 ${tempMax}°F (${tempMaxC.toFixed(1)}°C)`,
        inline: true
      },
      {
        name: 'Feels Like',
        value: feelsMin && feelsMax
          ? `🔻 ${feelsMin}°F\n🔺 ${feelsMax}°F`
          : 'N/A',
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
