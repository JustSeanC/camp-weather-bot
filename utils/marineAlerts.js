require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const alertFilePath = path.join(__dirname, '../data/lastMarineAlert.json');
const cron = require('node-cron');

// Load last ID from disk
let lastAlertId = null;
try {
  const saved = JSON.parse(fs.readFileSync(alertFilePath, 'utf8'));
  lastAlertId = saved.id || null;
} catch {
  lastAlertId = null;
}

const ALERT_ZONE = 'ANZ538';
const ALERT_API = `https://api.weather.gov/alerts/active/zone/${ALERT_ZONE}`;
const CHECK_INTERVAL_MINUTES = 5;
const DISCORD_CHANNEL_ID = process.env.MARINE_ALERT_CHANNEL_ID;

const RELEVANT_AREAS = [
  'Chester River',
  'Chester River to Queenstown MD',
  'Eastern Bay',
  'Chesapeake Bay from Pooles Island to Sandy Point MD'
];
async function checkMarineAdvisory(client) {
  try {
    const res = await fetch(ALERT_API, { headers: { 'User-Agent': 'CampWeatherBot/1.0' } });
    const data = await res.json();

    if (!data || !Array.isArray(data.features)) {
  console.error('[❌] Unexpected response format from marine alert API:', JSON.stringify(data).slice(0, 300));
  return;
}

const alert = data.features.find(
  alert => alert.properties.event.toLowerCase().includes('small craft')
);


if (!alert || alert.id === lastAlertId) return;

// Only continue if alert mentions one of the RELEVANT_AREAS

const affectedAreas = alert.properties.areaDesc?.split(';').map(a => a.trim()) || [];
const isRelevant = affectedAreas.some(area =>
  RELEVANT_AREAS.some(keyword => area.includes(keyword))
);

if (!isRelevant) {
  console.log(`[ℹ️] Skipping irrelevant alert: ${alert.properties.event}`);
  return;
}

    lastAlertId = alert.id;
    fs.writeFileSync(alertFilePath, JSON.stringify({ id: alert.id }, null, 2));

    const {
      event,
      headline,
      description,
      areaDesc,
      onset,
      ends,
      sent,
      instruction
    } = alert.properties;

  
    const highlightedAreaDesc = areaDesc.split(';').map(area => {
      const trimmed = area.trim();
      return RELEVANT_AREAS.some(key => trimmed.includes(key))
        ? `**__${trimmed}__**`
        : trimmed;
    }).join(';\n');

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ ${event} ⚠️`)
      .setDescription(`**${headline}**\n\n${description.split('\n')[0]}`)
      .addFields(
        { name: 'Area', value: highlightedAreaDesc, inline: false },
        { name: 'Issued', value: new Date(sent).toLocaleString('en-US', { timeZone: 'America/New_York' }), inline: true },
        { name: 'Expires', value: ends ? new Date(ends).toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'Unknown', inline: true },
        ...(instruction ? [{ name: 'Instructions', value: instruction, inline: false }] : [])
      )
      .setColor(0xffa500)
      .setFooter({
        text: 'Data provided by NOAA (weather.gov)',
        iconURL: 'https://www.noaa.gov/sites/default/files/2022-03/noaa_emblem_logo-2022.png'
      })
      .setTimestamp();

    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    const pingTarget = process.env.MARINE_ALERT_PING?.trim();
    await channel.send({
      content: pingTarget || null,
      embeds: [embed]
    });

    console.log(`[✔] Posted new marine advisory: ${event}`);
  } catch (err) {
    console.error('[❌] Failed to fetch/post marine advisory:', err.message);
  }
}

const cron = require('node-cron');

module.exports = {
  scheduleMarineAdvisoryCheck(client) {
    cron.schedule('*/5 * * * *', () => {
      console.log('🌊 Running scheduled marine advisory check...');
      checkMarineAdvisory(client);
    }, {
      timezone: process.env.TIMEZONE || 'America/New_York'
    });
  }
};


