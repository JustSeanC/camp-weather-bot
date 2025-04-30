const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');

const lat = process.env.LAT;
const lng = process.env.LNG;
const apiKey = process.env.STORMGLASS_API_KEY;

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

function degreesToCompass(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

async function fetchForecastEmbed() {
  const headers = { Authorization: apiKey };

  const [forecastRes, tideRes] = await Promise.all([
    fetch(forecastEndpoint, { headers }),
    fetch(tideEndpoint, { headers })
  ]);

  const forecastData = await forecastRes.json();
  const tideData = await tideRes.json();

  const hour = new Date().getHours();
  const hourIndex = forecastData.hours.findIndex(h => new Date(h.time).getHours() === hour);

  const current = forecastData.hours[hourIndex];

  const temp = current.airTemperature?.noaa ?? 'N/A';
  const precip = current.precipitation?.noaa ?? 'N/A';
  const wind = current.windSpeed?.noaa ?? 'N/A';
  const windDir = current.windDirection?.noaa ?? 0;
  const cloud = current.cloudCover?.noaa ?? 'N/A';
  const wave = current.waveHeight?.noaa ?? 'N/A';
  const waterTemp = current.waterTemperature?.noaa ?? 'N/A';

  const tideSummary = tideData.data
    .slice(0, 4)
    .map(t => {
      const time = new Date(t.time).toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: process.env.TIMEZONE,
      });
      return `${t.type} at ${time}`;
    })
    .join('\n');

  const embed = new EmbedBuilder()
    .setTitle(`🌤️ Camp Tockwogh Forecast – ${new Date().toLocaleDateString('en-US', { timeZone: process.env.TIMEZONE })}`)
    .addFields(
      { name: 'Air Temp', value: `${temp}°C`, inline: true },
      { name: 'Water Temp', value: `${waterTemp}°C`, inline: true },
      { name: 'Precipitation', value: `${precip} mm`, inline: true },
      { name: 'Wind', value: `${wind} m/s ${degreesToCompass(windDir)}`, inline: true },
      { name: 'Cloud Cover', value: `${cloud}%`, inline: true },
      { name: 'Wave Height', value: `${wave} m`, inline: true },
      { name: 'Tides', value: tideSummary || 'No data', inline: false }
    )
    .setColor(0x00bfff)
    .setTimestamp();

  return embed;
}

module.exports = { fetchForecastEmbed };
