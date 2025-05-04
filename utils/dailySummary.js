// Rewritten dailySummary.js with Open-Meteo primary and StormGlass marine/astro
require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { DateTime } = require('luxon');
const fetchWithFallback = require('./fetchWithFallback');
const { fetchOpenMeteoData } = require('./fetchOpenMeteo');

const lat = parseFloat(process.env.LAT);
const lng = parseFloat(process.env.LNG);
const timezone = process.env.TIMEZONE || 'America/New_York';
const DISCORD_CHANNEL_ID = process.env.DAILY_SUMMARY_CHANNEL_ID || process.env.DISCORD_CHANNEL_ID;
const alertFilePath = path.join(__dirname, '../data/lastMarineAlert.json');

function cToF(c) { return ((c * 9) / 5 + 32).toFixed(1); }
function mpsToMph(ms) { return (ms * 2.23694).toFixed(1); }
function metersToFeet(m) { return (m * 3.28084).toFixed(1); }

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

    const marineParams = ['waveHeight', 'waterTemperature'];
    const marineURL = `https://api.stormglass.io/v2/weather/point?lat=${lat}&lng=${lng}&params=${marineParams.join(',')}&start=${isoStart}&end=${isoEnd}`;
    const astronomyURL = `https://api.stormglass.io/v2/astronomy/point?lat=${lat}&lng=${lng}&start=${isoStart}`;

    const [marineRes, astronomyRes, openMeteoRes] = await Promise.all([
      fetchWithFallback(marineURL),
      fetchWithFallback(astronomyURL),
      fetchOpenMeteoData(isoStart, isoEnd)  // pass the date range!
    ]);
    
    const forecast = openMeteoRes.filter(h => {
      const t = DateTime.fromISO(h.time, { zone: timezone });
      return t >= start && t <= end;
    });

    if (!forecast.length) throw new Error('No Open-Meteo forecast data available');

    const temps = forecast.map(h => h.temperature).filter(v => typeof v === 'number');
    const winds = forecast.map(h => h.windSpeed).filter(v => typeof v === 'number');
    const clouds = forecast.map(h => h.cloudCover).filter(v => typeof v === 'number');

    const marine = marineRes.hours.filter(h => {
      const t = DateTime.fromISO(h.time);
      return t >= start && t <= end;
    });
    const waves = marine.map(h => h.waveHeight?.sg).filter(v => typeof v === 'number');
    const waterTemps = marine.map(h => h.waterTemperature?.sg).filter(v => typeof v === 'number');
    if (process.argv.includes('--debug')) {
      console.log(`[🟦] Open-Meteo: ${temps.length} temps, ${winds.length} winds, ${clouds.length} clouds`);
      console.log(`[🟧] StormGlass: ${waves.length} waves, ${waterTemps.length} water temps`);
    }
    
    const startTime = forecast[0].time;
    const endTime = forecast[forecast.length - 1].time;
    const formattedDate = DateTime.fromISO(startTime).setZone(timezone).toLocaleString(DateTime.DATE_FULL);
    const astro = astronomyRes.data?.[0] || {};
    const sunrise = astro.sunrise ? DateTime.fromISO(astro.sunrise).setZone(timezone).toFormat('h:mm a') : 'N/A';
    const sunset = astro.sunset ? DateTime.fromISO(astro.sunset).setZone(timezone).toFormat('h:mm a') : 'N/A';
    const highTemp = temps.length ? `${cToF(Math.max(...temps))}°F` : 'N/A';
    const lowTemp = temps.length ? `${cToF(Math.min(...temps))}°F` : 'N/A';
    const maxWind = winds.length ? `${Math.max(...winds).toFixed(1)} mph` : 'N/A';
    const skyCond = clouds.length ? summarizeSky(clouds) : 'Unknown';
    
    const embed = new EmbedBuilder()
      .setTitle(`📋 Daily Summary for ${formattedDate}`)
      .setDescription(`Time range: ${DateTime.fromISO(startTime).setZone(timezone).toFormat('h:mm a')} → ${DateTime.fromISO(endTime).setZone(timezone).toFormat('h:mm a')}`)
      .addFields(
          { name: 'High Temp', value: highTemp, inline: true },
          { name: 'Low Temp', value: lowTemp, inline: true },
          { name: 'Max Wind Speed', value: maxWind, inline: true },        
        ...(waves.length ? [{
          name: 'Max Wave Height',
          value: `${metersToFeet(Math.max(...waves))} ft`,
          inline: true
        }] : []),
        { name: 'Sky Condition', value: summarizeSky(clouds), inline: true },
        ...(waterTemps.length ? [{
          name: 'Water Temp (avg)',
          value: `${cToF(waterTemps.reduce((a, b) => a + b, 0) / waterTemps.length)}°F`,
          inline: true
        }] : []),
        { name: 'Sunrise / Sunset', value: `🌅 ${sunrise} / 🌇 ${sunset}`, inline: false },
        { name: 'Marine Alerts', value: getAlertStatus(), inline: false }
      )
      .setFooter({
        text: 'Summary based on Open-Meteo, StormGlass & NOAA data',
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
