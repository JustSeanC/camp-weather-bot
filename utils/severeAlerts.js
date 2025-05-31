require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');

const ALERT_API = 'https://api.weather.gov/alerts/active?point=39.2449,-75.9791';
const alertFilePath = path.join(__dirname, '../data/lastSevereAlerts.json');

// Load last IDs from disk (up to last 50 to prevent file bloat)
let postedAlertIds = new Set();
try {
  const raw = fs.readFileSync(alertFilePath, 'utf-8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) {
    postedAlertIds = new Set(parsed.slice(-50)); // Keep only recent 50
  }
} catch {
  postedAlertIds = new Set();
}


function severityColor(severity) {
  switch (severity) {
    case 'Extreme': return 0x8B0000;
    case 'Severe': return 0xFF0000;
    case 'Moderate': return 0xFFA500;
    default: return 0xFFFF00;
  }
}

function emojiForEvent(event) {
  if (/tornado/i.test(event)) return '🌪️';
  if (/thunderstorm/i.test(event)) return '⛈️';
  if (/flood/i.test(event)) return '🌊';
  if (/wind/i.test(event)) return '💨';
  if (/heat/i.test(event)) return '🥵';
  if (/snow|blizzard/i.test(event)) return '❄️';
  return '⚠️';
}

async function checkSevereAlerts(client) {
  try {
    const res = await fetch(ALERT_API, { headers: { 'User-Agent': 'CampWeatherBot/1.0' } });
    const text = await res.text();
if (text.trim().startsWith('<')) {
  console.error('❌ NOAA returned HTML instead of JSON:', text.slice(0, 300));
  return;
}

let data;
try {
  data = JSON.parse(text);
} catch (parseErr) {
  console.error('❌ Failed to parse severe weather JSON:', parseErr.message);
  return;
}
console.log(`🔎 NOAA returned ${data.features?.length || 0} alerts`);
for (const alert of data.features || []) {
  const { event, severity, id } = alert.properties;
  console.log(`→ ${event} | Severity: ${severity} | ID: ${id}`);
}


    const alerts = (data.features || []).filter(alert =>
      ['Moderate', 'Severe', 'Extreme'].includes(alert.properties.severity)
    );

    for (const alert of alerts) {
      const id = alert.id;
      if (postedAlertIds.has(id)) continue;

      postedAlertIds.add(id);
const trimmed = [...postedAlertIds].slice(-50);
fs.writeFileSync(alertFilePath, JSON.stringify(trimmed, null, 2));

      const {
        event, severity, headline,
        description, instruction, areaDesc, ends
      } = alert.properties;

      const embed = new EmbedBuilder()
        .setTitle(`${emojiForEvent(event)} ${event}`)
        .setColor(severityColor(severity))
        .setDescription(`**${headline || event}**\n\n${description?.slice(0, 1000) || 'No description provided.'}`)
        .addFields(
          { name: 'Severity', value: severity, inline: true },
          { name: 'Affected Area', value: areaDesc || 'Unknown', inline: true },
          ...(instruction ? [{ name: 'Instructions', value: instruction.slice(0, 1000) }] : []),
          ...(ends ? [{
            name: 'Expires',
            value: new Date(ends).toLocaleString('en-US', { timeZone: process.env.TIMEZONE || 'America/New_York' })
          }] : [])
        )
        .setFooter({ text: 'Alert provided by National Weather Service' })
        .setTimestamp();

      const channel = await client.channels.fetch(process.env.SEVERE_ALERT_ID || process.env.DISCORD_CHANNEL_ID);
      const pingText = process.env.SEVERE_ALERT_PING?.trim();
      if (pingText) {
        await channel.send({ content: pingText });
      }
      console.log(`📢 Will post alert: ${event} (${id})`);

      await channel.send({ embeds: [embed] });

      console.log(`📢 Posted new severe weather alert: ${event}`);
    }
  } catch (err) {
    console.error('❌ Error checking severe weather alerts:', err.message);
  }
}

function scheduleSevereAlertCheck(client) {
  cron.schedule('*/5 * * * *', () => checkSevereAlerts(client), {
    timezone: process.env.TIMEZONE || 'America/New_York'
  });
}

module.exports = { scheduleSevereAlertCheck };
