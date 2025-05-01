require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const alertFilePath = path.join(__dirname, '../data/lastMarineAlert.json');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const apiKey = process.env.STORMGLASS_API_KEY;
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
    const start = new Date();
    start.setDate(start.getDate() - 1);
    start.setUTCHours(0, 0, 0, 0);

    const end = new Date(start);
    end.setUTCHours(23, 59, 59, 999);

    const isoStart = start.toISOString();
    const isoEnd = end.toISOString();

    const forecastEndpoint = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${weatherParams.join(',')}&start=${isoStart}&end=${isoEnd}`;
    const headers = { Authorization: apiKey };
    const res = await fetch(forecastEndpoint, { headers });
    const data = await res.json();

    const forecast = data.hours.filter(h => {
      const time = new Date(h.time);
      return time >= start && time <= end;
    });

    console.log("Filtered timestamps:", forecast.map(h => h.time));

    if (forecast.length === 0) throw new Error('No forecast data available');

    const temps = forecast.map(h => h.airTemperature?.noaa ?? 0);
    const winds = forecast.map(h => h.windSpeed?.noaa ?? 0);
    const waves = forecast.map(h => h.waveHeight?.noaa ?? 0);
    const clouds = forecast.map(h => h.cloudCover?.noaa ?? 0);
    const waterTemps = forecast.map(h => h.waterTemperature?.noaa ?? 0);

    const startTime = forecast[0].time;
    const endTime = forecast[forecast.length - 1].time;

    const formattedDate = new Date(startTime).toLocaleDateString('en-US', {
      timeZone: timezone,
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    const embed = new EmbedBuilder()
      .setTitle(`📋 Daily Summary for ${formattedDate}`)
      .setDescription(
        `Time range: ${new Date(startTime).toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
        })} → ${new Date(endTime).toLocaleTimeString('en-US', {
          timeZone: timezone,
          hour: 'numeric',
          minute: '2-digit',
        })}\n\n`
      )
      .addFields(
        {
          name: 'High Temp',
          value: `${Math.max(...temps).toFixed(1)}°C • ${cToF(Math.max(...temps))}°F`,
          inline: true,
        },
        {
          name: 'Low Temp',
          value: `${Math.min(...temps).toFixed(1)}°C • ${cToF(Math.min(...temps))}°F`,
          inline: true,
        },
        {
          name: 'Max Wind Speed',
          value: `${Math.max(...winds).toFixed(1)} m/s • ${mpsToMph(Math.max(...winds))} mph`,
          inline: true,
        },
        {
          name: 'Max Wave Height',
          value: `${Math.max(...waves).toFixed(2)} m • ${metersToFeet(Math.max(...waves))} ft`,
          inline: true,
        },
        {
          name: 'Sky Conditions',
          value: summarizeSky(clouds),
          inline: true,
        },
        {
          name: 'Water Temp (avg)',
          value: `${(waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length).toFixed(1)}°C • ${cToF(waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length)}°F`,
          inline: true,
        },
        {
          name: 'Marine Alerts',
          value: getAlertStatus(),
          inline: false,
        }
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

// TEST RUN (manual CLI)
if (require.main === module) {
  const { Client, GatewayIntentBits } = require('discord.js');
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });

  client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    postDailySummary(client);
  });

  client.login(process.env.DISCORD_TOKEN);
}
