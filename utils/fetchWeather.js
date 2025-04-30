require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const apiKey = process.env.STORMGLASS_API_KEY;
const timezone = process.env.TIMEZONE || 'America/New_York';

const marineZone = 'ANZ538';

const weatherParams = [
  'airTemperature',
  'precipitation',
  'windSpeed',
  'windDirection',
  'cloudCover',
  'waveHeight',
  'waterTemperature'
];

const forecastEndpoint = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}`;
const tideEndpoint = `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lng}`;
const astronomyEndpoint = `https://api.stormglass.io/v2/astronomy/point?lat=${lat}&lng=${lng}`;
const nwsAlertEndpoint = `https://api.weather.gov/alerts/active/zone/${marineZone}`;

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
  const now = new Date();
  const localHour = parseInt(now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone }));

  let nextHour;
  if (localHour < 7) nextHour = 7;
  else if (localHour < 12) nextHour = 12;
  else if (localHour < 17) nextHour = 17;
  else nextHour = 7;

  const nextDate = new Date(now);
  nextDate.setHours(nextHour, 0, 0, 0);
  if (nextHour === 7 && localHour >= 17) nextDate.setDate(now.getDate() + 1);

  const local = nextDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', timeZone: timezone });
  const utc = nextDate.toUTCString().match(/\d{2}:\d{2}/)[0];
  return `**${local} ${timezone} / ${utc} UTC**`;
}

function getMoonEmoji(phase) {
  const map = {
    'New Moon': '🌑',
    'Waxing Crescent': '🌒',
    'First Quarter': '🌓',
    'Waxing Gibbous': '🌔',
    'Full Moon': '🌕',
    'Waning Gibbous': '🌖',
    'Last Quarter': '🌗',
    'Waning Crescent': '🌘',
  };
  return map[phase] || '🌙';
}

function getGreetingEmoji(hour) {
  if (hour < 12) return '🌅 Good Morning';
  if (hour < 17) return '🌞 Good Afternoon';
  return '🌇 Good Evening';
}

async function fetchAdvisory() {
  try {
    const res = await fetch(nwsAlertEndpoint);
    const data = await res.json();
    const advisory = data.features.find(alert =>
      alert.properties.event.toLowerCase().includes('small craft')
    );

    if (advisory) {
      const { event, description, ends } = advisory.properties;
      const endTime = new Date(ends).toLocaleString('en-US', {
        timeZone: timezone,
        hour: 'numeric',
        minute: '2-digit',
      });

      return {
        text: `⚠️ **${event}**\nExpires: ${endTime}\n${description.split('\n')[0]}`,
        hasAdvisory: true
      };
    } else {
      return {
        text: '✅ No advisories in effect.',
        hasAdvisory: false
      };
    }
  } catch (err) {
    console.error('Failed to fetch advisory:', err);
    return {
      text: '⚠️ Unable to retrieve advisory data.',
      hasAdvisory: false
    };
  }
}

async function fetchForecastEmbed() {
  const headers = { Authorization: apiKey };

  const [forecastRes, tideRes, astronomyRes, advisoryInfo] = await Promise.all([
    fetch(forecastEndpoint, { headers }).then(r => r.json()),
    fetch(tideEndpoint, { headers }).then(r => r.json()),
    fetch(astronomyEndpoint, { headers }).then(r => r.json()),
    fetchAdvisory()
  ]);

  const now = new Date();
  const hour = now.getHours();

  if (!forecastRes.hours) {
    console.error("❌ Stormglass forecast data missing or invalid:", forecastRes);
    throw new Error("Invalid forecast data returned from Stormglass");
  }

  const hourIndex = forecastRes.hours.findIndex(h => new Date(h.time).getHours() === hour);
  const current = forecastRes.hours[hourIndex];

  const tempC = current.airTemperature?.noaa ?? 'N/A';
  const tempF = cToF(tempC);
  const precip = current.precipitation?.noaa ?? 'N/A';
  const wind = current.windSpeed?.noaa ?? 'N/A';
  const windDir = current.windDirection?.noaa ?? 0;
  const cloud = current.cloudCover?.noaa ?? 'N/A';
  const wave = current.waveHeight?.noaa ?? 'N/A';
  const waterTempC = current.waterTemperature?.noaa ?? 'N/A';
  const waterTempF = cToF(waterTempC);

  const tideSummary = tideRes.data
    .slice(0, 4)
    .map(t => {
      const time = new Date(t.time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: timezone,
      });
      return `${t.type} at ${time}`;
    })
    .join('\n');

    const astro = astronomyRes.data;
    const sunrise = new Date(astro.sunrise).toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const sunset = new Date(astro.sunset).toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const moonPhase = astro.moonPhase;
  const moonEmoji = getMoonEmoji(moonPhase);

  const dateString = now.toLocaleDateString();
  const greeting = getGreetingEmoji(hour);
  const localTime = now.toLocaleTimeString('en-US', { timeZone: timezone, hour: '2-digit', minute: '2-digit' });
  const utcTime = now.toUTCString().match(/\d{2}:\d{2}/)[0];

  const embed = new EmbedBuilder()
    .setTitle(`🌤️ Camp Tockwogh Forecast`)
    .addFields(
      { name: 'Date', value: dateString, inline: true },
      { name: 'Time', value: `${localTime} EDT / ${utcTime} UTC`, inline: true },
      { name: 'Greeting', value: greeting, inline: true },
      { name: 'Air Temp', value: `${tempC}°C / ${tempF}°F`, inline: true },
      { name: 'Water Temp', value: `${waterTempC}°C / ${waterTempF}°F`, inline: true },
      { name: 'Precipitation', value: `${precip} mm / ${(precip / 25.4).toFixed(2)} in`, inline: true },
      { name: 'Wind', value: `${wind} m/s / ${mpsToMph(wind)} mph ${degreesToCompass(windDir)}`, inline: true },
      { name: 'Cloud Cover', value: `${cloud}%`, inline: true },
      { name: 'Wave Height', value: `${wave} m / ${metersToFeet(wave)} ft`, inline: true },
      { name: 'Tides', value: tideSummary || 'No data', inline: false },
      { name: 'Marine Advisory', value: advisoryInfo.text, inline: false },
      { name: 'Sunrise / Sunset', value: `🌅 ${sunrise} / 🌇 ${sunset}`, inline: false },
      { name: 'Moon Phase', value: `${moonEmoji} ${moonPhase}`, inline: false },
      { name: 'Next Forecast', value: getNextForecastTime(), inline: false }
    )
    .setColor(advisoryInfo.hasAdvisory ? 0xffa500 : 0x00ff00)
    .setTimestamp();

  return embed;
}

module.exports = { fetchForecastEmbed };
