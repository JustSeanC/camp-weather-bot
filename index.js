require('dotenv').config();
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { DateTime } = require('luxon');
const { EmbedBuilder } = require('discord.js');
const { fetchForecastEmbed } = require('./utils/fetchWeather');
const { postDailySummary } = require('./utils/dailySummary');
const { scheduleMarineAdvisoryCheck } = require('./utils/marineAlerts');
const { scheduleSevereAlertCheck } = require('./utils/severeAlerts');
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();
const commands = [];

// Load slash commands from ./commands/
const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));
for (const file of commandFiles) {
  const command = require(`./commands/${file}`);
  client.commands.set(command.data.name, command);
  commands.push(command.data.toJSON());
}

// On bot ready
client.once('ready', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);


  // ⏰ Schedule forecast posts at 7 AM, 12 PM, 5 PM Eastern Time
  const times = ['0 7 * * *', '0 12 * * *', '0 17 * * *'];
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
      timezone: process.env.TIMEZONE || 'America/New_York'
    });
  });

  // 🌀 Marine advisory checks
  scheduleMarineAdvisoryCheck(client);
  console.log('⏰ Scheduled marine advisory checks every 5 minutes.');
// Severe Weather Alerts Check
scheduleSevereAlertCheck(client);
console.log('⏰ Scheduled severe weather checks every 5 minutes.');

  // 📋 Daily summary at 12:01 AM Eastern
  cron.schedule('1 0 * * *', async () => {
    try {
      await postDailySummary(client);
    } catch (err) {
      console.error('❌ Error sending daily summary:', err);
    }
  }, {
    timezone: process.env.TIMEZONE || 'America/New_York'
  });
});

//Countdown to Camp
const { getCountdownMessage, getFinalMessage } = require('./utils/countdown');

// Daily countdown at 8 AM
cron.schedule('0 9 * * *', async () => {
  const msg = getCountdownMessage();
  if (msg) {
    const channel = await client.channels.fetch('1331718479446933604');
    const sent = await channel.send({ embeds: [msg] });
    await sent.react('🎉');
  }
}, { timezone: 'America/New_York' });

// 12-hour countdown post at midnight on June 18
cron.schedule('0 0 18 6 *', async () => {
  const now = DateTime.now().setZone('America/New_York');
  const embed = new EmbedBuilder()
    .setTitle('⏰ Final Countdown!')
    .setDescription(`Today is **${now.toFormat('MMMM d, yyyy')}**\n\nOnly **12 hours** until campers arrive!`)
    .setColor(0xffcc00)
    .setTimestamp();

  const channel = await client.channels.fetch('1331718479446933604');
  const sent = await channel.send({ embeds: [embed] });
  await sent.react('⏳');
}, { timezone: 'America/New_York' });

// Final welcome message at 12 PM on June 18
cron.schedule('0 12 18 6 *', async () => {
  const msg = getFinalMessage();
  if (msg) {
    const channel = await client.channels.fetch('1331718479446933604');
    const sent = await channel.send(msg);
    await sent.react('🎉');
  }
}, { timezone: 'America/New_York' });






// Slash command interaction handler
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error('❌ Error executing command:', err);
    await interaction.reply({ content: 'There was an error running that command.', ephemeral: true });
  }
});

client.login(process.env.DISCORD_TOKEN);
