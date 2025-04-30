require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const apiKey = process.env.STORMGLASS_API_KEY;
const timezone = process.env.TIMEZONE || 'America/New_York';

const marineZone = 'ANZ538'; // Chesapeake Bay from North Beach to Drum Point

const weatherParams = [
  'airTemperature',
  'precipitation',
  'windSpeed',
  'windDirection',
  'cloudCover',
  'waveHeight',
  'waterTemperature'
];

const tideEndpoint = `https://api.stormglass.io/v2/tide/extremes/point?lat=${lat}&lng=${lng}`;
const forecastEndpoint = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}`;
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
  const upcoming = [7, 12, 17]; // forecast hours
  const localHour = now.toLocaleString('en-US', { hour: 'numeric', hour12: false, timeZone: timezone });

  const nextHour = upcoming.find(h => h > localHour) ?? upcoming[0]; // wrap to tomorrow if needed
  const nextDate = new Date(now);
  nextDate.setHours(nextHour, 0, 0, 0);
  if (nextHour <= localHour) nextDate.setDate(now.getDate() + 1);

  const local = nextDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: timezone });
  const utc = nextDate.toUTCString().match(/\d{2}:\d{2}/)[0];
  return `${local} ${timezone} / ${utc} UTC`;
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

      return `⚠️ **${event}**\nExpires: ${endTime}\n${description.split('\n')[0]}`;
    } else {
      return '✅ No advisories in effect.';
    }
  } catch (err) {
    console.error('Failed to fetch advisory:', err);
    return '⚠️ Unable to retrieve advisory data.';
  }
}

async function fetchForecastEmbed() {
  const headers = { Authorization: apiKey };

  const [forecastRes, tideRes, advisoryText] = await Promise.all([
    fetch(forecastEndpoint, { headers }).then(r => r.json()),
    fetch(tideEndpoint, { headers }).then(r => r.json()),
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

  const localTime = now.toLocaleString('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit' });
  const utcTime = now.toUTCString().match(/\d{2}:\d{2}/)[0];

  const embed = new EmbedBuilder()
    .setTitle(`🌤️ Camp Tockwogh Forecast – ${now.toLocaleDateString()} ${localTime} ${timezone} / ${utcTime} UTC`)
    .addFields(
      { name: 'Air Temp', value: `${tempC}°C / ${tempF}°F`, inline: true },
      { name: 'Water Temp', value: `${waterTempC}°C / ${waterTempF}°F`, inline: true },
      { name: 'Precipitation', value: `${precip} mm`, inline: true },
      { name: 'Wind', value: `${wind} m/s / ${mpsToMph(wind)} mph ${degreesToCompass(windDir)}`, inline: true },
      { name: 'Cloud Cover', value: `${cloud}%`, inline: true },
      { name: 'Wave Height', value: `${wave} m / ${metersToFeet(wave)} ft`, inline: true },
      { name: 'Tides', value: tideSummary || 'No data', inline: false },
      { name: 'Marine Advisory', value: advisoryText, inline: false },
      { name: 'Next Forecast', value: getNextForecastTime(), inline: false }
    )
    .setColor(0x00bfff)
    .setTimestamp();

  return embed;
}

module.exports = { fetchForecastEmbed };
