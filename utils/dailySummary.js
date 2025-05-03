require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const { DateTime } = require('luxon');
const path = require('path');

const alertFilePath = path.join(__dirname, '../data/lastMarineAlert.json');
const fetchWithFallback = require('./fetchWithFallback');
const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';
const DISCORD_CHANNEL_ID = process.env.DAILY_SUMMARY_CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;

const weatherParams = [
  'airTemperature',
  'windSpeed',
  'cloudCover',
  'waveHeight',
  'waterTemperature'
];

function cToF(c) {
  return ((c * 9) / 5 + 32).toFixed(1);
}
function mpsToMph(ms) {
  return (ms * 2.23694).toFixed(1);
}
function metersToFeet(m) {
  return (m * 3.28084).toFixed(1);
}
function formatTime12(date) {
  return new Date(date).toLocaleTimeString('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    minute: '2-digit',
  });
}

function summarizeSky(clouds) {
  const avg = clouds.reduce((a, b) => a + b, 0) / clouds.length;
  if (avg < 10) return 'Clear';
  if (avg < 40) return 'Mostly Sunny';
  if (avg < 70) return 'Partly Cloudy';
  if (avg < 90) return 'Cloudy';
  return 'Overcast';
}
function summarizeSky(clouds) {
  const avg = clouds.reduce((a, b) => a + b, 0) / clouds.length;
  if (avg < 10) return 'Clear';
  if (avg < 40) return 'Mostly Sunny';
  if (avg < 70) return 'Partly Cloudy';
  if (avg < 90) return 'Cloudy';
  return 'Overcast';
}

function getAlertStatus() {
  try {
    const alertData = JSON.parse(fs.readFileSync(alertFilePath, 'utf8'));
    if (!alertData.id || alertData.id === 'TEST-ALERT') return '✅ No alerts posted';
    const timestamp = fs.statSync(alertFilePath).mtime;
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (timestamp.toDateString() === yesterday.toDateString()) {
      return '⚠️ A marine advisory was issued yesterday';
    }
    return '✅ No alerts posted yesterday';
  } catch {
    return '❓ Unable to determine alert status';
  }
}

async function postDailySummary(client) {
  try {
    const start = DateTime.now().setZone(timezone).minus({ days: 1 }).startOf('day');
const end = start.endOf('day');


const isoStart = start.toUTC().toISO();
const isoEnd = end.toUTC().toISO();


    const forecastURL = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}&start=${isoStart}&end=${isoEnd}`;
    const astronomyURL = `https://api.stormglass.io/v2/astronomy/point?lat=${lat}&lng=${lng}&start=${isoStart}`;

    const [forecastRes, astronomyRes] = await Promise.all([
      fetchWithFallback(forecastURL),
      fetchWithFallback(astronomyURL)
    ]);
    
   // console.log('[DEBUG] forecastRes:', JSON.stringify(forecastRes, null, 2));
    const forecast = forecastRes.hours.filter(h => {
      const time = DateTime.fromISO(h.time);
      return time >= start && time <= end;
    });
    

    if (forecast.length === 0) throw new Error('No forecast data available');

    const temps = forecast.map(h => h.airTemperature?.noaa ?? 0);
    const winds = forecast.map(h => h.windSpeed?.noaa ?? 0);
    const waves = forecastWindow.map(h => h.waveHeight?.sg ?? 0);
    //console.log('[DEBUG] Raw wave heights:', waves);
    const clouds = forecast.map(h => h.cloudCover?.noaa ?? 0);
    const waterTemps = forecast.map(h => h.waterTemperature?.noaa ?? 0);

    const startTime = forecast[0].time;
    const endTime = forecast[forecast.length - 1].time;

    const formattedDate = DateTime.fromISO(startTime).setZone(timezone).toLocaleString(DateTime.DATE_FULL);


    const skyCondition = summarizeSky(clouds);

    const astro = astronomyRes.data[0];
    const sunrise = DateTime.fromISO(astro.sunrise).setZone(timezone).toFormat('h:mm a');
    const sunset = DateTime.fromISO(astro.sunset).setZone(timezone).toFormat('h:mm a');


    const embed = new EmbedBuilder()
      .setTitle(`📋 Daily Summary for ${formattedDate}`)
      .setDescription(`Time range: ${DateTime.fromISO(startTime).setZone(timezone).toFormat('h:mm a')} → ${DateTime.fromISO(endTime).setZone(timezone).toFormat('h:mm a')}\n`)
      .addFields(
        { name: 'High Temp', value: `${cToF(Math.max(...temps))}°F (${Math.max(...temps).toFixed(1)}°C)`, inline: true },
        { name: 'Low Temp', value: `${cToF(Math.min(...temps))}°F (${Math.min(...temps).toFixed(1)}°C)`, inline: true },
        { name: 'Max Wind Speed', value: `${mpsToMph(Math.max(...winds))} mph (${Math.max(...winds).toFixed(1)} m/s)`, inline: true },
        ...(Math.max(...waves) > 0 ? [{
          name: 'Max Wave Height',
          value: `${metersToFeet(Math.max(...waves))} ft (${Math.max(...waves).toFixed(2)} m)`,
          inline: true
        }] : []),
        {
          name: 'Sky Condition',
          value: summarizeSky(forecastWindow.map(h => h.cloudCover?.noaa ?? 0)),
          inline: true
        },
       {
          name: 'Water Temp (avg)',
          value: `${cToF(waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length)}°F (${(waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length).toFixed(1)}°C)`,
          inline: true
        },
        { name: 'Sunrise / Sunset', value: `🌅 ${sunrise} / 🌇 ${sunset}`, inline: false },
        { name: 'Marine Alerts', value: getAlertStatus(), inline: false }
      )
      .setFooter({
        text: 'Summary based on data from Storm Glass & NOAA (weather.gov)',
        iconURL: 'https://www.noaa.gov/sites/default/files/2022-03/noaa_emblem_logo-2022.png',
      })
      .setColor(0x0077be)
      .setTimestamp();

    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    await channel.send({ embeds: [embed] });
    console.log('[✅] Daily summary posted.');
  } catch (err) {
    console.error('[❌] Failed to post daily summary:', err.message);
  }
}

module.exports = { postDailySummary };
