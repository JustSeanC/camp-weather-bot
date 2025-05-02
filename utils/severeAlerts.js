const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');

const SEVERE_ZONE = 'MDZ017';
const ALERT_API = `https://api.weather.gov/alerts/active?zone=${SEVERE_ZONE}`;

let postedAlertIds = new Set();

function severityColor(severity) {
  switch (severity) {
    case 'Extreme': return 0x8B0000; // Dark Red
    case 'Severe': return 0xFF0000; // Red
    case 'Moderate': return 0xFFA500; // Orange
    default: return 0xFFFF00; // Yellow
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
    const res = await fetch(ALERT_API);
    const data = await res.json();

    const alerts = (data.features || []).filter(alert => {
      const severity = alert.properties.severity;
      return ['Moderate', 'Severe', 'Extreme'].includes(severity);
    });

    for (const alert of alerts) {
      const id = alert.id;
      if (postedAlertIds.has(id)) continue;

      postedAlertIds.add(id);

      const { event, severity, headline, description, instruction, areaDesc, ends } = alert.properties;

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
            value: new Date(ends).toLocaleString('en-US', { timeZone: 'America/New_York' })
          }] : [])
        )
        .setFooter({ text: 'Alert provided by National Weather Service' })
        .setTimestamp();

      const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
      await channel.send({ embeds: [embed] });

      console.log(`📢 Posted new severe weather alert: ${event}`);
    }
  } catch (err) {
    console.error('❌ Error checking severe weather alerts:', err);
  }
}

function scheduleSevereAlertCheck(client) {
  const cron = require('node-cron');
  cron.schedule('*/10 * * * *', () => checkSevereAlerts(client), {
    timezone: process.env.TIMEZONE || 'America/New_York'
  });
}

module.exports = { scheduleSevereAlertCheck };
