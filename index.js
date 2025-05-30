require('dotenv').config();
const fs = require('fs');
const path = require('path');

const cron = require('node-cron');
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js');
const { DateTime } = require('luxon');
const { EmbedBuilder } = require('discord.js');
const rideStore = require('./data/rideStore');
rideStore.load(); // <-- ADD THIS LINE
const { fetchForecastEmbed } = require('./utils/fetchWeather');
const { postDailySummary } = require('./utils/dailySummary');
const { scheduleMarineAdvisoryCheck } = require('./utils/marineAlerts');
const { scheduleSevereAlertCheck, checkSevereAlerts } = require('./utils/severeAlerts');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// 👇 Place this AFTER client is declared
const ridesHandler = require('./utils/ridesHandler.js');
client.on('messageReactionAdd', (...args) => ridesHandler.execute(...args));


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

// TEMPORARY: force severe check right after boot
  setTimeout(() => checkSevereAlerts(client), 5000);
});


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


//Countdown to Camp
const { getCountdownMessage, getFinalMessage } = require('./utils/countdown');

// Daily countdown at 9 AM (skips June 18)
cron.schedule('0 9 * * *', async () => {
  const today = DateTime.now().setZone('America/New_York').toISODate();

  // Skip on June 18 (final message will be posted separately)
  if (today === '2025-06-18') return;

  const msg = getCountdownMessage();
  if (msg) {
    const channel = await client.channels.fetch('1331718479446933604');
    const sent = await channel.send({ embeds: [msg] });
    await sent.react('🎉');
  }
}, { timezone: 'America/New_York' });

// ⏳ 12-hour warning at 9:00 PM on June 17
cron.schedule('0 21 17 6 *', async () => {
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


// Final welcome message replaces countdown on June 18 at 9 AM
cron.schedule('0 9 18 6 *', async () => {
  const msg = getFinalMessage();
  if (msg) {
    const channel = await client.channels.fetch('1331718479446933604');
    const sent = await channel.send(msg);
    await sent.react('🎉');
  }
}, { timezone: 'America/New_York' });



// Clean up expired rides every hour
const { getAllRides, removeRide } = require('./data/rideStore');
cron.schedule('*/15 * * * *', () => cleanExpiredRides(client), {
  timezone: process.env.TIMEZONE || 'America/New_York'
});

async function cleanExpiredRides(client) {
  const rides = getAllRides();
  const now = Date.now();

  for (const ride of Object.values(rides)) {
    if (ride.expiresAt < now) {
      try {
        const channel = await client.channels.fetch(ride.channelId);
        const message = await channel.messages.fetch(ride.messageId);
        const embed = EmbedBuilder.from(message.embeds[0]);

        // Replace "Join This Ride" with "Expired"
        const fields = embed.data.fields || [];
        const joinIndex = fields.findIndex(f => f.name === 'Join This Ride');
        if (joinIndex !== -1) {
          embed.spliceFields(joinIndex, 1, { name: 'Status', value: '⏳ Expired' });
        } else {
          embed.addFields({ name: 'Status', value: '⏳ Expired' });
        }

        embed.setColor('Red');
        await message.edit({ embeds: [embed] });
        await message.reactions.removeAll();

        // Optionally delete the thread
        //if (ride.threadId) {
        //  const thread = await client.channels.fetch(ride.threadId).catch(() => null);
         // if (thread && thread.deletable) await thread.delete('Ride expired');
       // }

        // Save expired ride to a separate file
        const expiredPath = path.join(__dirname, 'data', 'rides_expired.json');
        
        let expired = {};
        if (fs.existsSync(expiredPath)) {
          try {
            expired = JSON.parse(fs.readFileSync(expiredPath, 'utf-8'));
          } catch (err) {
            console.warn('⚠️ Failed to read expired rides file:', err.message);
          }
        }
        
        expired[ride.messageId] = ride;
        
        fs.writeFileSync(expiredPath, JSON.stringify(expired, null, 2));
        removeRide(ride.messageId);
                console.log(`⏳ Expired ride removed: ${ride.rideId}`);
              } catch (err) {
                if (err.code === 10008) {
                  console.warn(`🧹 Ride ${ride.rideId} was already deleted in Discord. Cleaning up.`);
                } else {
                  console.warn(`⚠️ Failed to expire ride ${ride.rideId}:`, err.message);
                }
              
                removeRide(ride.messageId);
              }  
    }
  }
}



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
