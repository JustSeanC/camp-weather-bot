require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { fetchForecastEmbed } = require('./utils/fetchWeather');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  try {
    const embed = await fetchForecastEmbed();
    const channel = await client.channels.fetch(process.env.DISCORD_CHANNEL_ID);
    await channel.send({ embeds: [embed] });
    console.log('📨 Forecast sent!');
  } catch (err) {
    console.error('❌ Failed to post forecast:', err);
  } finally {
    client.destroy();
  }
});

client.login(process.env.DISCORD_TOKEN);
