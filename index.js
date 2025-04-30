require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const { fetchForecastEmbed } = require('./utils/fetchWeather');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Schedule posts at 7 AM, 12 PM, and 5 PM Eastern Time
  const times = ['0 7 * * *', '0 12 * * *', '0 17 * * *']; // Cron format

  times.forEach((cronTime) => {
    cron.schedule(cronTime, async () => {
      try {
        const embed = await fetchForecastEmbed();
        const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
        await channel.send({ embeds: [embed] });
        console.log(`📨 Posted weather forecast at ${cronTime}`);
      } catch (err) {
        console.error('❌ Error sending forecast:', err);
      }
    }, {
      timezone: process.env.TIMEZONE || 'UTC'
    });
  });
});

client.login(process.env.DISCORD_TOKEN);
