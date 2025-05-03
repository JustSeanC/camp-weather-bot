require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { postDailySummary } = require('./utils/dailySummary'); // adjust path if needed

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
  await postDailySummary(client);
  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
