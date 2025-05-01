require('dotenv').config();
const fetch = require('node-fetch');
const { EmbedBuilder } = require('discord.js');

const ALERT_ZONE = 'ANZ538';
const ALERT_API = `https://api.weather.gov/alerts/active/zone/${ALERT_ZONE}`;
const CHECK_INTERVAL_MINUTES = 5;
const DISCORD_CHANNEL_ID = process.env.MARINE_ALERT_CHANNEL_ID;

let lastAlertId = null;

async function checkMarineAdvisory(client) {
  try {
    const res = await fetch(ALERT_API, { headers: { 'User-Agent': 'CampWeatherBot/1.0' } });
    const data = await res.json();

    const alert = data.features.find(
        alert => alert.properties.event.toLowerCase().includes('small craft')
      ) || {
        id: 'TEST-ALERT',
        properties: {
          event: 'Small Craft Advisory',
          headline: 'TEST Advisory - This is a drill',
          description: 'Simulated conditions for testing only.',
          areaDesc: 'Chesapeake Bay from North Beach to Drum Point',
          onset: new Date().toISOString(),
          ends: new Date(Date.now() + 3600000).toISOString(),
          sent: new Date().toISOString(),
          instruction: 'No real danger. This is a test of the advisory alert system.'
        }
      };
      

    if (!alert) return;

    if (alert.id === lastAlertId) return; // already alerted

    lastAlertId = alert.id;

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

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ ${event}`)
      .setDescription(`**${headline}**\n\n${description.split('\n')[0]}`)
      .addFields(
        { name: 'Area', value: areaDesc, inline: false },
        { name: 'Issued', value: new Date(sent).toLocaleString('en-US', { timeZone: 'America/New_York' }), inline: true },
        { name: 'Expires', value: ends ? new Date(ends).toLocaleString('en-US', { timeZone: 'America/New_York' }) : 'Unknown', inline: true }
      )
      .setColor(0xffa500)
      .setFooter({ text: instruction || 'Use caution on the water.' })
      .setTimestamp();

    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    await channel.send({ content: '@here', embeds: [embed] });

    console.log(`[✔] Posted new marine advisory: ${event}`);
  } catch (err) {
    console.error('[❌] Failed to fetch/post marine advisory:', err.message);
  }
}

module.exports = {
  scheduleMarineAdvisoryCheck(client) {
    const intervalMs = CHECK_INTERVAL_MINUTES * 60 * 1000;
    setInterval(() => checkMarineAdvisory(client), intervalMs);
    console.log(`[🔁] Marine advisory check scheduled every ${CHECK_INTERVAL_MINUTES} minutes`);
  }
};
// TEST RUN (comment out after)
if (require.main === module) {
    const { Client, GatewayIntentBits } = require('discord.js');
    const client = new Client({ intents: [GatewayIntentBits.Guilds] });
    require('dotenv').config();
  
    client.once('ready', () => {
      console.log(`✅ Logged in as ${client.user.tag}`);
      // Run the check once manually
      checkMarineAdvisory(client);
    });
  
    client.login(process.env.DISCORD_TOKEN);
  }
// TEST RUN (comment out after)  